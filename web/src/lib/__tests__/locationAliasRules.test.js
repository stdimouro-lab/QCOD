import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOCAL_KEYS, saveLocalData, clearLocalData,
  approveLocationAlias, approveLocationParserRule, getLocationAliases, getLocationParserRules,
  exportQcodBackup,
} from '../data.js';

beforeEach(() => {
  clearLocalData();
});

// 15. Duplicate alias rejected
describe('Duplicate alias rejected', () => {
  it('throws when approving a second alias for the same facility + exact normalized location', () => {
    approveLocationAlias({ facilityId: 'martinsburg-va', rawLocationNormalized: 'SPGD111-500', roomId: '500-1-1D-111' });
    expect(getLocationAliases()).toHaveLength(1);
    expect(() =>
      approveLocationAlias({ facilityId: 'martinsburg-va', rawLocationNormalized: 'SPGD111-500', roomId: '500-2-2D-111' })
    ).toThrow();
    expect(getLocationAliases()).toHaveLength(1); // rejected attempt did not get appended
  });

  it('allows the same normalized location for a different facility (no false collision)', () => {
    approveLocationAlias({ facilityId: 'martinsburg-va', rawLocationNormalized: 'SPGD111-500', roomId: '500-1-1D-111' });
    approveLocationAlias({ facilityId: 'other-facility', rawLocationNormalized: 'SPGD111-500', roomId: '500-1-1D-111' });
    expect(getLocationAliases()).toHaveLength(2);
  });
});

// 16. Broad rule requires explicit approval
describe('Broad rule requires explicit approval', () => {
  it('a rule only exists in the approved rule set once explicitly approved — nothing creates one automatically', () => {
    expect(getLocationParserRules()).toHaveLength(0);
    approveLocationParserRule({
      facilityId: 'martinsburg-va', buildingId: '500', departmentPrefix: 'SPG', zoneLetter: 'D',
      roomPattern: '^111$', targetFloorId: '500-1', notes: 'Confirmed via department map',
    });
    const rules = getLocationParserRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].approved).toBe(true); // approveLocationParserRule always marks it approved — it's the explicit-approval entry point itself
    expect(rules[0].approvedAt).toBeTruthy();
  });
});

// 31. Backup excludes source documents
describe('Backup excludes source documents', () => {
  it('backup version is 0.4 and includes the new ENEX-related arrays', () => {
    const backup = exportQcodBackup();
    expect(backup.version).toBe('0.5');
    expect(backup).toHaveProperty('locationAliases');
    expect(backup).toHaveProperty('locationParserRules');
    expect(backup).toHaveProperty('locationReviewHistory');
    expect(backup).toHaveProperty('importHistory');
  });

  it('never includes PDF binary content or absolute Windows paths, even with room source metadata present', () => {
    saveLocalData(LOCAL_KEYS.roomSourceMetadata, [
      { documentName: '500-1st Floor Arch.pdf', floorId: '500-1', processedAt: new Date().toISOString(), roomCandidatesFound: 12 },
    ]);
    const backup = exportQcodBackup();
    const serialized = JSON.stringify(backup);
    expect(serialized).not.toMatch(/C:\\/);
    expect(serialized).not.toMatch(/%PDF-/);
    // The filename alone is fine to keep for audit purposes.
    expect(serialized).toMatch(/500-1st Floor Arch\.pdf/);
  });
});
