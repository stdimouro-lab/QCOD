/**
 * Master Asset List: the VA's official reference asset file, imported and
 * compared against QCOD's own ENEX-scanned inventory. This is a comparison
 * dataset, not a mapping tool — AssetWorx (upstream) still owns assigning
 * room/location; QCOD just imports the official list and shows how the
 * scanned reality lines up against it.
 */
import { getField } from './fileImport.js';

const REQUIRED_HEADERS = ['Asset Number', 'Description', 'Serial Number', 'Manufacturer', 'Model', 'Building', 'Room', 'Department'];

export { REQUIRED_HEADERS as MASTER_ASSET_LIST_HEADERS };

/**
 * Normalizes raw master-list worksheet rows into the master asset record
 * shape. Does not invent or guess any field — blank stays blank.
 */
export function normalizeMasterAssetRows(rows) {
  let blankRows = 0;
  const assets = [];

  rows.forEach((row) => {
    const assetNumber = getField(row, 'Asset Number').trim();
    const allBlank = Object.values(row).every((v) => (v ?? '').toString().trim() === '');
    if (allBlank) { blankRows += 1; return; }
    if (!assetNumber) { blankRows += 1; return; }

    assets.push({
      assetNumber,
      description: getField(row, 'Description'),
      serialNumber: getField(row, 'Serial Number'),
      manufacturer: getField(row, 'Manufacturer'),
      model: getField(row, 'Model'),
      buildingId: getField(row, 'Building'),
      roomId: getField(row, 'Room'),
      department: getField(row, 'Department'),
      status: getField(row, 'Status') || 'active',
    });
  });

  return {
    assets,
    stats: { totalRows: rows.length, blankRows, validCount: assets.length },
  };
}

/**
 * Compares the master (official) list against QCOD's own scanned/imported
 * assets. Every master record gets a comparison result — this never mutates
 * either dataset, it only reports.
 *
 * @param {Array} masterAssets - normalized master asset list records
 * @param {Array} scannedAssets - QCOD's own imported ENEX/AssetWorx assets
 * @param {Array} qcRecords
 * @param {Array} researchRecords
 */
export function compareToScannedInventory(masterAssets, scannedAssets, qcRecords = [], researchRecords = []) {
  const scannedByNumber = new Map(scannedAssets.map((a) => [a.assetNumber, a]));
  const qcByNumber = new Map();
  qcRecords.forEach((q) => {
    if (!qcByNumber.has(q.assetNumber)) qcByNumber.set(q.assetNumber, []);
    qcByNumber.get(q.assetNumber).push(q);
  });
  const researchByNumber = new Map();
  researchRecords.forEach((r) => {
    if (!researchByNumber.has(r.assetNumber)) researchByNumber.set(r.assetNumber, []);
    researchByNumber.get(r.assetNumber).push(r);
  });

  return masterAssets.map((master) => {
    const scanned = scannedByNumber.get(master.assetNumber);
    const foundInScan = !!scanned;

    let serialMatch = null; // null = nothing to compare (not scanned, or master has no serial)
    if (foundInScan && master.serialNumber) {
      serialMatch = (scanned.serialNumber || '').trim().toUpperCase() === master.serialNumber.trim().toUpperCase();
    }

    const qcForAsset = qcByNumber.get(master.assetNumber) || [];
    const researchForAsset = researchByNumber.get(master.assetNumber) || [];
    const activeQc = qcForAsset.find((q) => q.status !== 'closed');
    const activeResearch = researchForAsset.find((r) => r.status === 'open' || r.status === 'in_review' || r.status === 'reopened' || r.status === 'waiting_for_information');

    return {
      ...master,
      foundInScan,
      scannedRoomId: scanned?.roomId || '',
      scannedBuildingId: scanned?.buildingId || '',
      serialMatch, // true | false | null
      qcStatus: activeQc?.status || (qcForAsset.length > 0 ? 'closed' : ''),
      researchStatus: activeResearch?.status || (researchForAsset.length > 0 ? 'closed' : ''),
      lastImported: scanned?.lastInventoried || '',
    };
  });
}

export function summarizeComparison(comparisonRows) {
  const total = comparisonRows.length;
  const found = comparisonRows.filter((r) => r.foundInScan).length;
  const missing = total - found;
  const serialMismatches = comparisonRows.filter((r) => r.serialMatch === false).length;
  const withQc = comparisonRows.filter((r) => r.qcStatus).length;
  const withResearch = comparisonRows.filter((r) => r.researchStatus).length;
  return { total, found, missing, serialMismatches, withQc, withResearch };
}
