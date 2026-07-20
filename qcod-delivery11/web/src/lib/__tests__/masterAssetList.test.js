import { describe, it, expect } from 'vitest';
import { normalizeMasterAssetRows, compareToScannedInventory, summarizeComparison } from '../masterAssetList.js';

describe('normalizeMasterAssetRows()', () => {
  it('normalizes valid rows and preserves fields without inventing anything', () => {
    const rows = [
      { 'Asset Number': '613 EE10001', Description: 'Pump', 'Serial Number': 'SN1', Manufacturer: 'Acme', Model: 'X1', Building: '500', Room: '1D-111', Department: 'Emergency' },
    ];
    const { assets, stats } = normalizeMasterAssetRows(rows);
    expect(assets).toHaveLength(1);
    expect(assets[0].assetNumber).toBe('613 EE10001');
    expect(assets[0].serialNumber).toBe('SN1');
    expect(stats.validCount).toBe(1);
  });

  it('skips blank rows and rows with no asset number', () => {
    const rows = [
      { 'Asset Number': '', Description: '', 'Serial Number': '', Manufacturer: '', Model: '', Building: '', Room: '', Department: '' },
      { 'Asset Number': '', Description: 'Has a description but no asset number', 'Serial Number': '', Manufacturer: '', Model: '', Building: '', Room: '', Department: '' },
    ];
    const { assets, stats } = normalizeMasterAssetRows(rows);
    expect(assets).toHaveLength(0);
    expect(stats.blankRows).toBe(2);
  });
});

describe('compareToScannedInventory()', () => {
  const master = [
    { assetNumber: 'A1', serialNumber: 'SN1', description: 'Pump' },
    { assetNumber: 'A2', serialNumber: 'SN2', description: 'Monitor' },
    { assetNumber: 'A3', serialNumber: '', description: 'No serial on file' },
  ];

  it('flags an asset as found when it exists in the scanned inventory', () => {
    const scanned = [{ assetNumber: 'A1', serialNumber: 'SN1' }];
    const result = compareToScannedInventory(master, scanned);
    expect(result.find((r) => r.assetNumber === 'A1').foundInScan).toBe(true);
  });

  it('flags an asset as missing when it is on the master list but not scanned', () => {
    const result = compareToScannedInventory(master, []);
    expect(result.every((r) => !r.foundInScan)).toBe(true);
  });

  it('detects a serial number mismatch', () => {
    const scanned = [{ assetNumber: 'A1', serialNumber: 'WRONG' }];
    const result = compareToScannedInventory(master, scanned);
    expect(result.find((r) => r.assetNumber === 'A1').serialMatch).toBe(false);
  });

  it('detects a serial number match', () => {
    const scanned = [{ assetNumber: 'A1', serialNumber: 'SN1' }];
    const result = compareToScannedInventory(master, scanned);
    expect(result.find((r) => r.assetNumber === 'A1').serialMatch).toBe(true);
  });

  it('returns null for serialMatch when the asset was never scanned, rather than false', () => {
    const result = compareToScannedInventory(master, []);
    expect(result.find((r) => r.assetNumber === 'A1').serialMatch).toBeNull();
  });

  it('returns null for serialMatch when the master record itself has no serial to compare', () => {
    const scanned = [{ assetNumber: 'A3', serialNumber: 'SOMETHING' }];
    const result = compareToScannedInventory(master, scanned);
    expect(result.find((r) => r.assetNumber === 'A3').serialMatch).toBeNull();
  });

  it('pulls through active QC and Research status', () => {
    const scanned = [{ assetNumber: 'A1', serialNumber: 'SN1' }];
    const qc = [{ assetNumber: 'A1', status: 'pending' }];
    const research = [{ assetNumber: 'A1', status: 'open' }];
    const result = compareToScannedInventory(master, scanned, qc, research);
    const row = result.find((r) => r.assetNumber === 'A1');
    expect(row.qcStatus).toBe('pending');
    expect(row.researchStatus).toBe('open');
  });

  it('shows closed rather than blank when all QC/Research records for an asset are closed', () => {
    const scanned = [{ assetNumber: 'A1', serialNumber: 'SN1' }];
    const qc = [{ assetNumber: 'A1', status: 'closed' }];
    const result = compareToScannedInventory(master, scanned, qc, []);
    expect(result.find((r) => r.assetNumber === 'A1').qcStatus).toBe('closed');
  });

  it('never mutates the input master or scanned arrays', () => {
    const masterCopy = JSON.parse(JSON.stringify(master));
    const scanned = [{ assetNumber: 'A1', serialNumber: 'SN1' }];
    const scannedCopy = JSON.parse(JSON.stringify(scanned));
    compareToScannedInventory(master, scanned);
    expect(master).toEqual(masterCopy);
    expect(scanned).toEqual(scannedCopy);
  });
});

describe('summarizeComparison()', () => {
  it('computes correct totals', () => {
    const rows = [
      { foundInScan: true, serialMatch: true, qcStatus: 'pending', researchStatus: '' },
      { foundInScan: false, serialMatch: null, qcStatus: '', researchStatus: '' },
      { foundInScan: true, serialMatch: false, qcStatus: '', researchStatus: 'open' },
    ];
    const summary = summarizeComparison(rows);
    expect(summary.total).toBe(3);
    expect(summary.found).toBe(2);
    expect(summary.missing).toBe(1);
    expect(summary.serialMismatches).toBe(1);
    expect(summary.withQc).toBe(1);
    expect(summary.withResearch).toBe(1);
  });
});
