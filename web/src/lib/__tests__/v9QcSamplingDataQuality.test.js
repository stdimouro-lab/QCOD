import { describe, it, expect } from 'vitest';
import { sampleAssets } from '../qcSampling.js';
import { runDataQualityChecks } from '../dataQuality.js';

// Test 11: deterministic QC sampling
describe('Deterministic QC sampling', () => {
  const assets = Array.from({ length: 200 }, (_, i) => ({
    assetNumber: `613 EE${String(i).padStart(5, '0')}`, facilityId: 'martinsburg-va', buildingId: '500',
  }));

  it('the same importId + settings always produces the same sample', () => {
    const r1 = sampleAssets(assets, { importId: 'import-abc', percentage: 15 });
    const r2 = sampleAssets(assets, { importId: 'import-abc', percentage: 15 });
    expect(r1.selected.map((a) => a.assetNumber)).toEqual(r2.selected.map((a) => a.assetNumber));
  });

  it('different settings (percentage) for the same import produce a different sample', () => {
    const r1 = sampleAssets(assets, { importId: 'import-abc', percentage: 15 });
    const r2 = sampleAssets(assets, { importId: 'import-abc', percentage: 20 });
    expect(r1.selected.length).not.toBe(r2.selected.length);
  });

  it('never selects an asset outside the eligible set', () => {
    const result = sampleAssets(assets, { importId: 'import-abc', percentage: 50 });
    const eligibleNumbers = new Set(assets.map((a) => a.assetNumber));
    expect(result.selected.every((a) => eligibleNumbers.has(a.assetNumber))).toBe(true);
  });
});

// Test 12: QC sampling percentage calculation
describe('QC sampling percentage calculation', () => {
  const assets = Array.from({ length: 100 }, (_, i) => ({ assetNumber: `A${i}`, facilityId: 'x', buildingId: '500' }));

  it('defaults sensibly and clamps below 1% up to 1%', () => {
    const result = sampleAssets(assets, { importId: 'imp', percentage: 0 });
    expect(result.requestedPercentage).toBe(1);
  });

  it('clamps above 100% down to 100%', () => {
    const result = sampleAssets(assets, { importId: 'imp', percentage: 500 });
    expect(result.requestedPercentage).toBe(100);
    expect(result.actualSelectedCount).toBe(100);
  });

  it('computes requested count as a rounded percentage of eligible assets', () => {
    const result = sampleAssets(assets, { importId: 'imp', percentage: 10 });
    expect(result.eligibleCount).toBe(100);
    expect(result.requestedCount).toBe(10);
    expect(result.actualSelectedCount).toBe(10);
  });

  it('reports eligible/excluded counts correctly when excluding assets with Research issues', () => {
    const researchAssetNumbers = new Set(['A0', 'A1', 'A2']);
    const result = sampleAssets(assets, { importId: 'imp', percentage: 10, excludeWithResearchIssues: true, researchAssetNumbers });
    expect(result.eligibleCount).toBe(97);
    expect(result.excludedCount).toBe(3);
  });

  it('scopes sampling by building', () => {
    const mixed = [
      ...Array.from({ length: 50 }, (_, i) => ({ assetNumber: `B500-${i}`, buildingId: '500' })),
      ...Array.from({ length: 50 }, (_, i) => ({ assetNumber: `B501-${i}`, buildingId: '501' })),
    ];
    const result = sampleAssets(mixed, { importId: 'imp', percentage: 100, scope: 'building', scopeValue: '500' });
    expect(result.eligibleCount).toBe(50);
    expect(result.selected.every((a) => a.buildingId === '500')).toBe(true);
  });
});

// Test 14: Data Quality orphan detection
describe('Data Quality orphan detection', () => {
  it('flags a QC record referencing an asset that no longer exists', () => {
    const issues = runDataQualityChecks({
      assets: [{ assetNumber: 'A1', serialNumber: 'S1', description: 'x' }],
      qcRecords: [{ id: 'qc1', assetNumber: 'GHOST', importId: 'imp1' }],
      researchRecords: [],
    });
    expect(issues.some((i) => i.category === 'orphaned_qc_record' && i.recordId === 'qc1')).toBe(true);
  });

  it('flags a Research record referencing an asset that no longer exists', () => {
    const issues = runDataQualityChecks({
      assets: [],
      researchRecords: [{ id: 'r1', assetNumber: 'GHOST' }],
    });
    expect(issues.some((i) => i.category === 'orphaned_research_record')).toBe(true);
  });

  it('flags an asset mapped to a room that no longer exists', () => {
    const issues = runDataQualityChecks({
      assets: [{ assetNumber: 'A1', serialNumber: 'S1', description: 'x', roomId: 'ghost-room' }],
      rooms: [],
    });
    expect(issues.some((i) => i.category === 'asset_mapped_to_missing_room')).toBe(true);
  });

  it('flags a broken facility/building/floor/section chain', () => {
    const issues = runDataQualityChecks({
      buildings: [{ id: '500', facilityId: 'ghost-facility' }],
      facilities: [],
    });
    expect(issues.some((i) => i.category === 'building_mapped_to_missing_facility')).toBe(true);
  });

  it('does not flag anything when the hierarchy and records are all consistent', () => {
    const issues = runDataQualityChecks({
      facilities: [{ id: 'f1' }],
      buildings: [{ id: 'b1', facilityId: 'f1' }],
      floors: [{ id: 'fl1', buildingId: 'b1' }],
      sections: [{ id: 's1', floorId: 'fl1' }],
      rooms: [{ id: 'r1', sectionId: 's1' }],
      assets: [{ assetNumber: 'A1', serialNumber: 'S1', description: 'x', roomId: 'r1', sectionId: 's1', rawLocation: '' }],
      qcRecords: [{ id: 'qc1', assetNumber: 'A1' }],
      researchRecords: [],
    });
    const relevantCategories = ['orphaned_qc_record', 'orphaned_research_record', 'asset_mapped_to_missing_room', 'invalid_hierarchy', 'building_mapped_to_missing_facility'];
    expect(issues.filter((i) => relevantCategories.includes(i.category))).toHaveLength(0);
  });

  it('flags conflicting aliases pointing the same location to different rooms', () => {
    const issues = runDataQualityChecks({
      aliases: [
        { facilityId: 'f1', rawLocationNormalized: 'SPGD111-500', roomId: 'room-A', approved: true },
        { facilityId: 'f1', rawLocationNormalized: 'SPGD111-500', roomId: 'room-B', approved: true },
      ],
    });
    expect(issues.some((i) => i.category === 'conflicting_alias')).toBe(true);
  });

  it('flags overlapping approved parser rules for the same department/zone', () => {
    const issues = runDataQualityChecks({
      rules: [
        { facilityId: 'f1', buildingId: '500', departmentPrefix: 'SPG', zoneLetter: 'D', roomPattern: '^1..$', approved: true },
        { facilityId: 'f1', buildingId: '500', departmentPrefix: 'SPG', zoneLetter: 'D', roomPattern: '^2..$', approved: true },
      ],
    });
    expect(issues.some((i) => i.category === 'conflicting_parser_rule')).toBe(true);
  });
});
