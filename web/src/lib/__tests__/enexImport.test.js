import { describe, it, expect } from 'vitest';
import {
  processEnexAssetRow, classifyDuplicates, buildImportPlan,
  generateResearchRecords, generateQcRecords,
  rollupRoomTotals, rollupSectionAssetTotals, rollupFloorAssetTotals,
  rollupBuildingAssetTotals, rollupFacilityAssetTotals,
} from '../enexImport.js';

const rooms = [
  { id: '500-1-1D-111', buildingId: '500', floorId: '500-1', sectionId: '500-1-CPC1', roomNumber: '1D-111' },
];
const context = { facilityId: 'martinsburg-va', buildingId: '500', rooms };

// 17. Missing serial creates Research record
describe('Missing serial creates a Research record', () => {
  it('flags missing_serial_number and it appears in generated Research records', () => {
    const row = processEnexAssetRow({ assetNumber: '613 EE11111', serialNumber: '', description: 'Pump', rawLocation: 'SPGD111-500' }, context);
    expect(row.issues).toContain('missing_serial_number');
    const { records, created } = generateResearchRecords([{ asset: row.asset, issues: row.issues }], [], { importId: 'imp1', facilityId: 'martinsburg-va' });
    expect(created).toBeGreaterThan(0);
    expect(records.some((r) => r.issueType === 'missing_serial_number' && r.assetNumber === '613 EE11111')).toBe(true);
  });
});

// 18. Unmatched location creates Research record
describe('Unmatched location creates a Research record', () => {
  it('flags unmatched_room when no official room matches', () => {
    const row = processEnexAssetRow({ assetNumber: '613 EE22222', serialNumber: 'S2', description: 'Item', rawLocation: 'ZZZZ999-500' }, context);
    expect(row.issues).toContain('unmatched_room');
  });
});

// 19. Multiple room matches create Research record
describe('Multiple room matches creates a Research record', () => {
  it('flags multiple_room_matches when more than one floor has a candidate room', () => {
    const multiRooms = [
      { id: '500-1-1D-111', buildingId: '500', floorId: '500-1', roomNumber: '1D-111' },
      { id: '500-2-2D-111', buildingId: '500', floorId: '500-2', roomNumber: '2D-111' },
    ];
    const row = processEnexAssetRow({ assetNumber: '613 EE33333', serialNumber: 'S3', description: 'Item', rawLocation: 'SPGD111-500' }, { ...context, rooms: multiRooms });
    expect(row.issues).toContain('multiple_room_matches');
  });
});

// 20. 613 E scanner misread does not create a Research record
describe('613 E scanner misread never creates a Research record', () => {
  it('is excluded from processing entirely', () => {
    const row = processEnexAssetRow({ assetNumber: '613 E9999', serialNumber: 'X', rawLocation: 'SPGD111-500' }, context);
    expect(row.included).toBe(false);
    expect(row.scanError).toBe(true);
    expect(row.issues).toHaveLength(0);
  });
});

// 21. Duplicate asset number handling
describe('Duplicate asset number handling', () => {
  it('flags every occurrence of a repeated asset number within the batch', () => {
    const results = classifyDuplicates([
      { assetNumber: 'A1', serialNumber: 'S1', issueTypes: [] },
      { assetNumber: 'A1', serialNumber: 'S2', issueTypes: [] },
      { assetNumber: 'A2', serialNumber: 'S3', issueTypes: [] },
    ]);
    expect(results[0].issueTypes).toContain('duplicate_asset_number');
    expect(results[1].issueTypes).toContain('duplicate_asset_number');
    expect(results[2].issueTypes).not.toContain('duplicate_asset_number');
  });
});

// 22. Duplicate serial handling
describe('Duplicate serial number handling', () => {
  it('flags every occurrence of a repeated serial number within the batch', () => {
    const results = classifyDuplicates([
      { assetNumber: 'A1', serialNumber: 'S1', issueTypes: [] },
      { assetNumber: 'A2', serialNumber: 'S1', issueTypes: [] },
    ]);
    expect(results[0].issueTypes).toContain('duplicate_serial_number');
    expect(results[1].issueTypes).toContain('duplicate_serial_number');
  });
});

// 23. QC record deduplication
describe('QC record deduplication', () => {
  it('does not create a second active QC record for the same asset and QC type', () => {
    const processed = [{ asset: { assetNumber: 'A1', serialNumber: 'S1', facilityId: 'x', roomId: 'r1', sectionId: '' } }];
    const r1 = generateQcRecords(processed, [], { importId: 'imp1', facilityId: 'x' });
    expect(r1.created).toBeGreaterThan(0);
    const activeCountAfterFirst = r1.records.filter((r) => r.assetNumber === 'A1' && r.status === 'pending').length;

    const r2 = generateQcRecords(processed, r1.records, { importId: 'imp2', facilityId: 'x' });
    const activeCountAfterSecond = r2.records.filter((r) => r.assetNumber === 'A1' && r.status === 'pending').length;
    expect(activeCountAfterSecond).toBe(activeCountAfterFirst); // no growth — updated in place
  });
});

// 24. Research record deduplication
describe('Research record deduplication', () => {
  it('updates the existing open Research record instead of creating a duplicate on repeated imports', () => {
    const processed = [{ asset: { assetNumber: 'A1', facilityId: 'x', rawLocation: 'X', description: '', issueTypes: ['missing_description'] }, issues: ['missing_description'] }];
    const r1 = generateResearchRecords(processed, [], { importId: 'imp1', facilityId: 'x' });
    expect(r1.records).toHaveLength(1);

    const r2 = generateResearchRecords(processed, r1.records, { importId: 'imp2', facilityId: 'x' });
    expect(r2.records).toHaveLength(1); // still just one record, not two
    expect(r2.updated).toBe(1);
    expect(r2.created).toBe(0);
  });

  it('creates a NEW record if the prior one for that issue was resolved (closed)', () => {
    const closedRecord = {
      id: 'r1', assetNumber: 'A1', issueType: 'missing_description', status: 'resolved',
      facilityId: 'x', importId: 'imp1', createdAt: '', resolvedAt: 'now',
    };
    const processed = [{ asset: { assetNumber: 'A1', facilityId: 'x', rawLocation: 'X', description: '', issueTypes: ['missing_description'] }, issues: ['missing_description'] }];
    const result = generateResearchRecords(processed, [closedRecord], { importId: 'imp2', facilityId: 'x' });
    expect(result.created).toBe(1); // the closed one doesn't block a fresh open record
  });
});

// 25. Room-to-section progress rollup
describe('Room-to-section progress rollup', () => {
  it('rolls up assets to a room', () => {
    const assets = [{ roomId: '500-1-1D-111', assetNumber: 'A1' }, { roomId: '500-1-1D-111', assetNumber: 'A2' }, { roomId: 'other', assetNumber: 'A3' }];
    expect(rollupRoomTotals('500-1-1D-111', assets).imported).toBe(2);
  });

  it('returns null for a section with no assets — never a misleading zero', () => {
    expect(rollupSectionAssetTotals('500-1-CPC1', [])).toBeNull();
  });

  it('rolls up assets to a section once assets are mapped there', () => {
    const assets = [{ sectionId: '500-1-CPC1', assetNumber: 'A1' }];
    expect(rollupSectionAssetTotals('500-1-CPC1', assets).imported).toBe(1);
  });
});

// 26. Floor progress rollup
describe('Floor progress rollup', () => {
  it('returns null when no assets are mapped to the floor', () => {
    expect(rollupFloorAssetTotals('500-1', [])).toBeNull();
  });
  it('rolls up correctly once assets exist', () => {
    const assets = [{ floorId: '500-1', assetNumber: 'A1' }, { floorId: '500-1', assetNumber: 'A2' }];
    expect(rollupFloorAssetTotals('500-1', assets).imported).toBe(2);
  });
});

// 27. Building progress rollup
describe('Building progress rollup', () => {
  it('returns null when no assets are mapped to the building', () => {
    expect(rollupBuildingAssetTotals('500', [])).toBeNull();
  });
  it('rolls up correctly once assets exist', () => {
    const assets = [{ buildingId: '500', assetNumber: 'A1' }];
    expect(rollupBuildingAssetTotals('500', assets).imported).toBe(1);
  });
});

// 28. Facility progress rollup
describe('Facility progress rollup', () => {
  it('returns null when no assets are mapped to the facility', () => {
    expect(rollupFacilityAssetTotals('martinsburg-va', [])).toBeNull();
  });
  it('rolls up correctly once assets exist', () => {
    const assets = [{ facilityId: 'martinsburg-va', assetNumber: 'A1' }];
    expect(rollupFacilityAssetTotals('martinsburg-va', assets).imported).toBe(1);
  });
});

// 29. Replace-snapshot import behavior
describe('Replace-snapshot import behavior', () => {
  it('flags assets missing from the new snapshot without deleting them, and the final list is exactly the new snapshot', () => {
    const existing = [{ assetNumber: 'A1' }, { assetNumber: 'A2' }];
    const incoming = [{ assetNumber: 'A1' }, { assetNumber: 'A3' }];
    const plan = buildImportPlan(existing, incoming, 'replace_snapshot');
    expect(plan.created.map((a) => a.assetNumber)).toEqual(['A3']);
    expect(plan.updated.map((a) => a.assetNumber)).toEqual(['A1']);
    expect(plan.missingFromSnapshot.map((a) => a.assetNumber)).toEqual(['A2']);
    expect(plan.finalAssets).toHaveLength(2); // A1, A3 — A2 is flagged, not silently kept or deleted by this function
  });
});

// 30. Merge import behavior
describe('Merge import behavior', () => {
  it('keeps existing assets not present in the new batch, and never flags anything missing', () => {
    const existing = [{ assetNumber: 'A1', serialNumber: 'old' }, { assetNumber: 'A2' }];
    const incoming = [{ assetNumber: 'A1', serialNumber: 'new' }, { assetNumber: 'A3' }];
    const plan = buildImportPlan(existing, incoming, 'merge');
    expect(plan.missingFromSnapshot).toHaveLength(0);
    expect(plan.finalAssets).toHaveLength(3); // A1 (updated), A2 (kept), A3 (new)
    expect(plan.finalAssets.find((a) => a.assetNumber === 'A1').serialNumber).toBe('new');
    expect(plan.finalAssets.find((a) => a.assetNumber === 'A2')).toBeTruthy();
  });
});
