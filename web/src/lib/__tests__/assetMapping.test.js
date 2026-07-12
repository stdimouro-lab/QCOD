import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOCAL_KEYS, saveLocalData, clearLocalData, getUnmappedAssets, getMappedAssets,
  applyAssetMappings, getLocationMappingSuggestions, approveLocationMapping, getMappingHistory,
} from '../data.js';

beforeEach(() => {
  clearLocalData();
});

function seedAssets() {
  saveLocalData(LOCAL_KEYS.assets, [
    { assetNumber: '613 EE00001', serialNumber: 'X', locationName: 'CPC 1 Nurse Station', buildingId: '', issueTypes: [] },
    { assetNumber: '613 EE00002', serialNumber: 'Y', locationName: 'CPC 1 Nurse Station', buildingId: '', issueTypes: [] },
    { assetNumber: '613 EE00003', serialNumber: 'Z', locationName: 'Emergency Bay 2', buildingId: '', issueTypes: [] },
  ]);
}

describe('Asset mapping', () => {
  it('manual mapping applies to the selected asset(s)', () => {
    seedAssets();
    const { updatedCount } = applyAssetMappings(['613 EE00001'], { buildingId: '500', floorId: '500-1', sectionId: '500-1-CPC1' }, 'manual');
    expect(updatedCount).toBe(1);
    expect(getMappedAssets().map((a) => a.assetNumber)).toContain('613 EE00001');
  });

  it('batch mapping applies to multiple selected assets at once', () => {
    seedAssets();
    const { updatedCount } = applyAssetMappings(
      ['613 EE00001', '613 EE00002'],
      { buildingId: '500', floorId: '500-1', sectionId: '500-1-CPC1' },
      'batch'
    );
    expect(updatedCount).toBe(2);
    expect(getMappedAssets()).toHaveLength(2);
    expect(getUnmappedAssets()).toHaveLength(1);
  });

  it('a location suggestion never applies automatically — it only surfaces prior approved mappings', () => {
    seedAssets();
    approveLocationMapping('Emergency Bay 2', { buildingId: '500', floorId: '500-1', sectionId: '500-1-EMERGENCY' });

    const suggestions = getLocationMappingSuggestions();
    const emergencySuggestion = suggestions.find((s) => s.locationNameNormalized === 'emergency bay 2');
    expect(emergencySuggestion.priorApprovedMapping).toBeTruthy();

    // Approving a location mapping must not touch any asset by itself.
    expect(getUnmappedAssets().some((a) => a.assetNumber === '613 EE00003')).toBe(true);
    expect(getMappedAssets()).toHaveLength(0);
  });

  it('a history record is created for every mapping change and previous history is preserved', () => {
    seedAssets();
    applyAssetMappings(['613 EE00001'], { buildingId: '500' }, 'manual');
    expect(getMappingHistory()).toHaveLength(1);

    applyAssetMappings(['613 EE00002'], { buildingId: '500' }, 'batch');
    const history = getMappingHistory();
    expect(history).toHaveLength(2); // appended, not overwritten
    expect(history[0].assetNumber).toBe('613 EE00001');
    expect(history[1].assetNumber).toBe('613 EE00002');
    expect(history[1].source).toBe('batch');
    expect(history[1].previousMapping.buildingId).toBe('');
    expect(history[1].newMapping.buildingId).toBe('500');
  });
});
