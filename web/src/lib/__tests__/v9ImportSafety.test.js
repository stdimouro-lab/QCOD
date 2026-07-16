import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOCAL_KEYS, saveLocalData, clearLocalData, getAssets, getQcRecords, getResearchRecords,
  savePreImportSnapshot, undoImport, getImportBackups,
  getAuditLog, recordAuditEntry,
  exportQcodBackup, importQcodBackup, validateBackupShape, summarizeBackup, CURRENT_BACKUP_VERSION,
} from '../data.js';
import { buildAuditEntry } from '../auditLog.js';
import { generateImportId, createPreImportSnapshot, addBackup, resolveUndo } from '../importSafety.js';

beforeEach(() => {
  clearLocalData();
});

// Test 3: pre-import backup creation
describe('Pre-import backup creation', () => {
  it('savePreImportSnapshot captures the current assets/QC/Research state', () => {
    saveLocalData(LOCAL_KEYS.assets, [{ assetNumber: 'A1' }]);
    const importId = generateImportId();
    const snapshot = savePreImportSnapshot(importId);
    expect(snapshot.importId).toBe(importId);
    expect(snapshot.datasets.assets).toHaveLength(1);
    expect(getImportBackups()).toHaveLength(1);
  });

  it('createPreImportSnapshot + addBackup keeps only the most recent N backups', () => {
    let backups = [];
    for (let i = 0; i < 15; i++) {
      backups = addBackup(backups, createPreImportSnapshot(`import-${i}`, { assets: [] }));
    }
    expect(backups.length).toBeLessThanOrEqual(10);
    // the most recent one must still be present
    expect(backups.some((b) => b.importId === 'import-14')).toBe(true);
  });
});

// Test 1 & 2: import rollback / undo most recent import
describe('Import rollback / undo', () => {
  it('undoImport restores assets, QC, and Research to their pre-import state', () => {
    saveLocalData(LOCAL_KEYS.assets, [{ assetNumber: 'ORIGINAL' }]);
    saveLocalData(LOCAL_KEYS.qcRecords, []);
    saveLocalData(LOCAL_KEYS.researchRecords, []);

    const importId = generateImportId();
    savePreImportSnapshot(importId);

    // Simulate the import writing new data.
    saveLocalData(LOCAL_KEYS.assets, [{ assetNumber: 'ORIGINAL' }, { assetNumber: 'NEW_FROM_IMPORT' }]);
    expect(getAssets()).toHaveLength(2);

    const success = undoImport(importId);
    expect(success).toBe(true);
    expect(getAssets()).toHaveLength(1);
    expect(getAssets()[0].assetNumber).toBe('ORIGINAL');
  });

  it('returns false when there is no backup for the given import ID (already undone or unknown)', () => {
    expect(undoImport('nonexistent-import')).toBe(false);
  });

  it('resolveUndo returns null for an unknown import id, and the correct datasets for a known one', () => {
    const snap = createPreImportSnapshot('imp1', { assets: [{ assetNumber: 'X' }] });
    const backups = addBackup([], snap);
    expect(resolveUndo(backups, 'unknown')).toBeNull();
    expect(resolveUndo(backups, 'imp1').assets).toHaveLength(1);
  });
});

// Test 23: undo restores all related datasets (assets + QC + Research together)
describe('Undo restores all related datasets together', () => {
  it('restores assets, QC records, and Research records as one atomic operation', () => {
    saveLocalData(LOCAL_KEYS.assets, [{ assetNumber: 'A1' }]);
    saveLocalData(LOCAL_KEYS.qcRecords, [{ id: 'qc1', assetNumber: 'A1', status: 'pending' }]);
    saveLocalData(LOCAL_KEYS.researchRecords, [{ id: 'r1', assetNumber: 'A1', status: 'open' }]);

    const importId = generateImportId();
    savePreImportSnapshot(importId);

    saveLocalData(LOCAL_KEYS.assets, [{ assetNumber: 'A1' }, { assetNumber: 'A2' }]);
    saveLocalData(LOCAL_KEYS.qcRecords, [{ id: 'qc1', assetNumber: 'A1', status: 'pending' }, { id: 'qc2', assetNumber: 'A2', status: 'pending' }]);
    saveLocalData(LOCAL_KEYS.researchRecords, [{ id: 'r1', assetNumber: 'A1', status: 'open' }, { id: 'r2', assetNumber: 'A2', status: 'open' }]);

    undoImport(importId);

    expect(getAssets()).toHaveLength(1);
    expect(getQcRecords()).toHaveLength(1);
    expect(getResearchRecords()).toHaveLength(1);
  });
});

// Test 15: audit log append behavior
describe('Audit log append behavior', () => {
  it('never overwrites prior entries — always appends', () => {
    recordAuditEntry(buildAuditEntry({ action: 'test_action_1', entityType: 'test', entityId: '1' }));
    expect(getAuditLog()).toHaveLength(1);
    recordAuditEntry(buildAuditEntry({ action: 'test_action_2', entityType: 'test', entityId: '2' }));
    expect(getAuditLog()).toHaveLength(2);
    expect(getAuditLog()[0].action).toBe('test_action_1');
    expect(getAuditLog()[1].action).toBe('test_action_2');
  });

  it('exporting a backup itself is recorded to the audit log', () => {
    exportQcodBackup();
    expect(getAuditLog().some((e) => e.action === 'backup_created')).toBe(true);
  });
});

// Test 16: backup schema validation
describe('Backup schema validation', () => {
  it('accepts a well-formed v0.5 backup', () => {
    const backup = exportQcodBackup();
    expect(validateBackupShape(backup).valid).toBe(true);
    expect(backup.version).toBe(CURRENT_BACKUP_VERSION);
  });

  it('rejects a backup with a malformed array field', () => {
    const { valid, errors } = validateBackupShape({ version: '0.5', assets: 'not-an-array' });
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('summarizeBackup flags a version mismatch and reports dataset counts', () => {
    const oldBackup = { version: '0.2', assets: [{ a: 1 }, { a: 2 }] };
    const summary = summarizeBackup(oldBackup);
    expect(summary.versionMismatch).toBe(true);
    expect(summary.counts.assets).toBe(2);
  });
});

// Test 17: V8 backup migration
describe('V8 backup migration', () => {
  it('restores an older V8-style backup (missing V9 fields like auditLog) without failing', async () => {
    const v8Backup = {
      version: '0.4',
      exportedAt: new Date().toISOString(),
      facilities: [], buildings: [], floors: [], sections: [], rooms: [],
      assets: [{ assetNumber: '613 EE00001', serialNumber: 'S1', issueTypes: [] }],
      locationAliases: [], locationParserRules: [], locationReviewHistory: [], importHistory: [],
      qcRecords: [], researchRecords: [],
      // no auditLog / importBackups / researchHistory / qcHistory — these didn't exist in V8
    };
    const file = new File([JSON.stringify(v8Backup)], 'v8-backup.json', { type: 'application/json' });
    await importQcodBackup(file);

    expect(getAssets()).toHaveLength(1);
    // V9-only logs should gracefully default to empty rather than error.
    expect(getAuditLog().some((e) => e.action === 'backup_restored')).toBe(true);
  });
});
