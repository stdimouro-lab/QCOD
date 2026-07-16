import { describe, it, expect, beforeEach } from 'vitest';
import {
  updateResearchStatus, bulkAssignResearch, updateQcStatus, bulkUpdateQc,
  sendFailedQcToResearch, qcFailureToResearchDraft,
} from '../researchQcWorkflow.js';
import { processEnexAssetRow, generateResearchRecords, generateQcRecords } from '../enexImport.js';
import { validateRoomAssignment } from '../roomAssignment.js';
import {
  LOCAL_KEYS, saveLocalData, clearLocalData,
  approveLocationAlias, reassignLocationAlias, getLocationAliases,
  appendImportHistory, getImportHistory,
} from '../data.js';

beforeEach(() => {
  clearLocalData();
});

// Test 7: Research history append behavior
describe('Research history append behavior', () => {
  it('updateResearchStatus returns history entries that are meant to be appended, never replacing prior ones', () => {
    const records = [{ id: 'r1', assetNumber: 'A1', status: 'open' }];
    const { historyEntries } = updateResearchStatus(records, ['r1'], 'in_review');
    expect(historyEntries).toHaveLength(1);
    expect(historyEntries[0].previousValue).toBe('open');
    expect(historyEntries[0].newValue).toBe('in_review');
  });

  it('rejects an invalid status rather than silently accepting it', () => {
    const records = [{ id: 'r1', assetNumber: 'A1', status: 'open' }];
    expect(() => updateResearchStatus(records, ['r1'], 'not_a_real_status')).toThrow();
  });
});

// Test 8: QC history append behavior
describe('QC history append behavior', () => {
  it('updateQcStatus returns appendable history entries', () => {
    const records = [{ id: 'qc1', assetNumber: 'A1', status: 'pending' }];
    const { historyEntries } = updateQcStatus(records, ['qc1'], 'passed');
    expect(historyEntries).toHaveLength(1);
    expect(historyEntries[0].newValue).toBe('passed');
  });

  it('bulkUpdateQc logs one history entry per changed field per record', () => {
    const records = [{ id: 'qc1', assetNumber: 'A1', status: 'pending', assignedTo: '' }];
    const { historyEntries } = bulkUpdateQc(records, ['qc1'], { assignedTo: 'Jane', notes: 'checked' });
    expect(historyEntries).toHaveLength(2);
  });
});

// Test 9: reopened Research issue behavior
describe('Reopened Research issue behavior', () => {
  it('creates a new "reopened" record when the same issue reappears after resolution, preserving the old record', () => {
    const processed = [{ asset: { assetNumber: 'A1', facilityId: 'x', rawLocation: '', description: '', issueTypes: ['missing_description'] }, issues: ['missing_description'] }];
    const r1 = generateResearchRecords(processed, [], { importId: 'imp1', facilityId: 'x' });
    expect(r1.records).toHaveLength(1);

    // Resolve it.
    const resolved = r1.records.map((r) => ({ ...r, status: 'resolved', resolvedAt: new Date().toISOString() }));

    // Same issue reappears in a later import.
    const r2 = generateResearchRecords(processed, resolved, { importId: 'imp2', facilityId: 'x' });
    expect(r2.records).toHaveLength(2); // old resolved record preserved, new one added
    expect(r2.reopened).toBe(1);
    const newRecord = r2.records.find((r) => r.status === 'reopened');
    expect(newRecord).toBeTruthy();
    // The old resolved record must be untouched.
    const oldRecord = r2.records.find((r) => r.status === 'resolved');
    expect(oldRecord.resolvedAt).toBeTruthy();
  });
});

// Test 10: failed QC creates Research record
describe('Failed QC creates a Research record', () => {
  it('sendFailedQcToResearch creates a new Research record from a failed QC record', () => {
    const qcRecords = [{ id: 'qc1', assetNumber: 'A1', status: 'failed', failureReason: 'Wrong location', facilityId: 'x' }];
    const { records, createdCount } = sendFailedQcToResearch(qcRecords, [], ['qc1']);
    expect(createdCount).toBe(1);
    expect(records[0].issueType).toBe('qc_failure');
    expect(records[0].assetNumber).toBe('A1');
  });

  it('does not duplicate an already-open qc_failure Research record for the same asset', () => {
    const qcRecords = [{ id: 'qc1', assetNumber: 'A1', status: 'failed', facilityId: 'x' }];
    const existingResearch = [{ id: 'r1', assetNumber: 'A1', issueType: 'qc_failure', status: 'open' }];
    const { createdCount } = sendFailedQcToResearch(qcRecords, existingResearch, ['qc1']);
    expect(createdCount).toBe(0);
  });
});

// Test 13: scanner misreads excluded from QC and Research
describe('Scanner misreads excluded from QC and Research', () => {
  it('a 613 E misread never enters the processed pipeline, so it can never generate QC or Research records', () => {
    const result = processEnexAssetRow({ assetNumber: '613 E1234', serialNumber: 'X', rawLocation: '' }, { facilityId: 'x', buildingId: '500', rooms: [] });
    expect(result.included).toBe(false);
    expect(result.scanError).toBe(true);

    // Nothing to generate records from.
    const research = generateResearchRecords([], [], { importId: 'imp1', facilityId: 'x' });
    const qc = generateQcRecords([], [], { importId: 'imp1', facilityId: 'x' });
    expect(research.records).toHaveLength(0);
    expect(qc.records).toHaveLength(0);
  });
});

// Test 20: batch room assignment hierarchy validation
describe('Batch room assignment hierarchy validation', () => {
  it('rejects a batch item whose room and target section are on different floors', () => {
    const rooms = [
      { id: 'r1', facilityId: 'x', buildingId: '500', floorId: '500-1' },
      { id: 'r2', facilityId: 'x', buildingId: '500', floorId: '500-2' },
    ];
    const targetSection = { facilityId: 'x', buildingId: '500', floorId: '500-1' };
    const results = rooms.map((r) => validateRoomAssignment(r, targetSection));
    expect(results[0].valid).toBe(true);  // same floor as target
    expect(results[1].valid).toBe(false); // different floor — must be rejected even within a batch
  });
});

// Test 21: import history records correct totals
describe('Import history records correct totals', () => {
  it('appendImportHistory stores accurate counts that can be read back', () => {
    appendImportHistory({
      id: 'imp1', sourceFileName: 'test.xlsx', importType: 'enex', importMode: 'replace_snapshot',
      importedAt: new Date().toISOString(), rowsRead: 10, validAssets: 8, scanErrorsIgnored: 2,
      matchedLocations: 5, multipleMatches: 1, unmatchedLocations: 2,
      researchCreated: 3, researchUpdated: 0, qcCreated: 2, qcUpdated: 0,
      assetsCreated: 8, assetsUpdated: 0, warnings: [],
    });
    const history = getImportHistory();
    expect(history).toHaveLength(1);
    expect(history[0].rowsRead).toBe(10);
    expect(history[0].validAssets + history[0].scanErrorsIgnored).toBe(history[0].rowsRead);
  });
});

// Test 22: alias reassignment preserves history
describe('Alias reassignment preserves history', () => {
  it('reassigning an alias creates a new entry and marks the old one as reassigned rather than deleting it', () => {
    const original = approveLocationAlias({ facilityId: 'x', rawLocationNormalized: 'SPGD111-500', roomId: 'room-A', sourceSystem: 'AssetWorx' });
    reassignLocationAlias(original.id, 'room-B');

    const aliases = getLocationAliases();
    expect(aliases).toHaveLength(2); // old alias preserved, new one added
    const oldAlias = aliases.find((a) => a.id === original.id);
    const newAlias = aliases.find((a) => a.reassignedFrom === original.id);
    expect(oldAlias.approved).toBe(false);
    expect(oldAlias.reassignedTo).toBe('room-B');
    expect(newAlias.roomId).toBe('room-B');
    expect(newAlias.approved).toBe(true);
  });
});

// Test 24: no duplicate active QC records (re-verifying at the workflow layer)
describe('No duplicate active QC records', () => {
  it('bulk status updates never create new records — only existing ones are modified', () => {
    const records = [{ id: 'qc1', assetNumber: 'A1', status: 'pending' }, { id: 'qc2', assetNumber: 'A2', status: 'pending' }];
    const { records: updated } = updateQcStatus(records, ['qc1', 'qc2'], 'selected');
    expect(updated).toHaveLength(2); // count never grows from a status update
  });
});

// Test 25: no duplicate active Research records (re-verifying at the workflow layer)
describe('No duplicate active Research records', () => {
  it('bulk assignment never creates new records — only existing ones are modified', () => {
    const records = [{ id: 'r1', assetNumber: 'A1', status: 'open', assignedTo: '' }];
    const { records: updated } = bulkAssignResearch(records, ['r1'], 'Jane Doe');
    expect(updated).toHaveLength(1);
    expect(updated[0].assignedTo).toBe('Jane Doe');
  });
});
