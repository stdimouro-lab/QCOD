import { describe, it, expect } from 'vitest';
import { classifyAssetNumber, normalizeAssetRows } from '../fileImport.js';

describe('classifyAssetNumber()', () => {
  it('classifies a valid 613 EE asset number as valid', () => {
    expect(classifyAssetNumber('613 EE12345').kind).toBe('valid');
    expect(classifyAssetNumber('613EE99999').kind).toBe('valid');
  });

  it('classifies a 613 E scanner misread (missing second E) as scan_error', () => {
    expect(classifyAssetNumber('613 E9999').kind).toBe('scan_error');
    expect(classifyAssetNumber('613E1234').kind).toBe('scan_error');
  });

  it('classifies a blank asset number as blank', () => {
    expect(classifyAssetNumber('').kind).toBe('blank');
    expect(classifyAssetNumber('   ').kind).toBe('blank');
    expect(classifyAssetNumber(null).kind).toBe('blank');
  });

  it('classifies an unrelated asset number as unrecognized', () => {
    expect(classifyAssetNumber('ABC-123').kind).toBe('unrecognized');
  });
});

describe('normalizeAssetRows()', () => {
  it('excludes scanner misreads entirely from the imported set', () => {
    const rows = [
      { Name: '613 EE11111', 'Serial Number': 'SN1', Description: '', 'Disposal Status': '' },
      { Name: '613 E22222', 'Serial Number': 'SN2', Description: '', 'Disposal Status': '' },
    ];
    const { assets, stats } = normalizeAssetRows(rows);
    expect(assets).toHaveLength(1);
    expect(assets[0].assetNumber).toBe('613 EE11111');
    expect(stats.scanErrorCount).toBe(1);
  });

  it('skips fully blank rows', () => {
    const rows = [{ Name: '', 'Serial Number': '', Description: '', 'Disposal Status': '' }];
    const { assets, stats } = normalizeAssetRows(rows);
    expect(assets).toHaveLength(0);
    expect(stats.blankRows).toBe(1);
  });

  it('flags missing_serial_number when Serial Number is blank', () => {
    const rows = [{ Name: '613 EE33333', 'Serial Number': '', Description: '', 'Disposal Status': '' }];
    const { assets } = normalizeAssetRows(rows);
    expect(assets[0].issueTypes).toContain('missing_serial_number');
  });

  it('flags not_found_in_db from Disposal Status text', () => {
    const rows = [{ Name: '613 EE44444', 'Serial Number': 'SN4', Description: '', 'Disposal Status': 'Not Found in DB' }];
    const { assets } = normalizeAssetRows(rows);
    expect(assets[0].issueTypes).toContain('not_found_in_db');
  });

  it('flags not_found_in_db even when it appears in Description instead of Disposal Status', () => {
    const rows = [{ Name: '613 EE44445', 'Serial Number': 'SN4', Description: 'Item Not Found in DB during scan', 'Disposal Status': '' }];
    const { assets } = normalizeAssetRows(rows);
    expect(assets[0].issueTypes).toContain('not_found_in_db');
  });

  it('flags new_asset_offline_sync for "New Asset Found" or "Offline Sync"', () => {
    const rows = [
      { Name: '613 EE55555', 'Serial Number': 'SN5', Description: '', 'Disposal Status': 'New Asset Found' },
      { Name: '613 EE66666', 'Serial Number': 'SN6', Description: '', 'Disposal Status': 'Offline Sync' },
    ];
    const { assets } = normalizeAssetRows(rows);
    expect(assets[0].issueTypes).toContain('new_asset_offline_sync');
    expect(assets[1].issueTypes).toContain('new_asset_offline_sync');
  });

  it('never assigns scanner misreads to the assets array (not counted as Research items either)', () => {
    const rows = [{ Name: '613 E77777', 'Serial Number': 'SN7', Description: '', 'Disposal Status': '' }];
    const { assets } = normalizeAssetRows(rows);
    expect(assets).toHaveLength(0);
  });
});
