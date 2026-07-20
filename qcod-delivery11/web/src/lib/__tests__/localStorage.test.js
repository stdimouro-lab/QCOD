import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOCAL_KEYS, loadLocalData, saveLocalData, clearLocalData,
  exportQcodBackup, importQcodBackup, validateBackupShape,
} from '../data.js';

beforeEach(() => {
  clearLocalData();
});

describe('localStorage helpers', () => {
  it('save then load returns the saved value', () => {
    saveLocalData(LOCAL_KEYS.assets, [{ assetNumber: '613 EE00001' }]);
    expect(loadLocalData(LOCAL_KEYS.assets, [])).toHaveLength(1);
  });

  it('load returns the fallback when nothing is stored', () => {
    expect(loadLocalData('qcod-nonexistent-key', 'fallback-value')).toBe('fallback-value');
  });

  it('clear removes all QCOD local keys', () => {
    saveLocalData(LOCAL_KEYS.assets, [{ assetNumber: '613 EE00001' }]);
    saveLocalData(LOCAL_KEYS.sectionProgress, [{ id: 'x' }]);
    clearLocalData();
    expect(loadLocalData(LOCAL_KEYS.assets, [])).toHaveLength(0);
    expect(loadLocalData(LOCAL_KEYS.sectionProgress, [])).toHaveLength(0);
  });

  it('validateBackupShape accepts a well-formed backup', () => {
    const { valid, errors } = validateBackupShape({ version: '0.2', facilities: [], buildings: [] });
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('validateBackupShape rejects a backup with a non-array field', () => {
    const { valid, errors } = validateBackupShape({ version: '0.2', facilities: 'not-an-array' });
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validateBackupShape rejects a completely malformed input without throwing', () => {
    expect(validateBackupShape(null).valid).toBe(false);
    expect(validateBackupShape('a string').valid).toBe(false);
    expect(validateBackupShape(42).valid).toBe(false);
  });

  it('backup export/import round-trips assets and sections', async () => {
    saveLocalData(LOCAL_KEYS.assets, [{ assetNumber: '613 EE00001', issueTypes: [] }]);
    const backup = exportQcodBackup();
    expect(backup.assets).toHaveLength(1);
    expect(backup.version).toBe('0.6');

    clearLocalData();
    expect(loadLocalData(LOCAL_KEYS.assets, [])).toHaveLength(0);

    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    await importQcodBackup(file);
    expect(loadLocalData(LOCAL_KEYS.assets, [])).toHaveLength(1);
  });

  it('a malformed backup file is rejected and does not overwrite existing local data', async () => {
    saveLocalData(LOCAL_KEYS.assets, [{ assetNumber: '613 EE00001', issueTypes: [] }]);
    const badBackup = { version: '0.2', facilities: 'not-an-array' };
    const file = new File([JSON.stringify(badBackup)], 'bad-backup.json', { type: 'application/json' });

    await expect(importQcodBackup(file)).rejects.toThrow();
    // Original data must still be intact.
    expect(loadLocalData(LOCAL_KEYS.assets, [])).toHaveLength(1);
  });
});
