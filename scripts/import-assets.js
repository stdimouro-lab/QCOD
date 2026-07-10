/**
 * Imports an AssetWorx Excel export and normalizes it into data/assets.json.
 *
 * Usage:
 *   npm run import:assets -- "C:\path\to\ASSETS HOME COPY.xlsx"
 *
 * This script only writes data/assets.json (and updates data/import-status.json).
 * It never touches floors, sections, or building data. Unknown/blank values are
 * preserved as blank rather than guessed.
 */
import ExcelJS from 'exceljs';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const outputPath = join(dataDir, 'assets.json');
const statusPath = join(dataDir, 'import-status.json');

// A valid QCOD asset number looks like: 613 EE##### (or another verified
// length after "613 EE"). Records that begin with only "613 E" (missing the
// second E) are known RFID scanner misreads, not valid research items —
// they must be flagged as scan-format errors, never counted as real assets,
// and never classified into the Research module.
const VALID_ASSET_NUMBER = /^613\s?EE\d+/i;
const MISREAD_ASSET_NUMBER = /^613\s?E(?!E)/i;

function classifyAssetNumber(raw) {
  const value = (raw ?? '').toString().trim();
  if (!value) return { value: '', kind: 'blank' };
  if (VALID_ASSET_NUMBER.test(value)) return { value, kind: 'valid' };
  if (MISREAD_ASSET_NUMBER.test(value)) return { value, kind: 'scan_error' };
  return { value, kind: 'unrecognized' };
}

// Maps the known AssetWorx export column headers to the QCOD asset model.
// Column matching is case-insensitive and trims whitespace.
const COLUMN_MAP = {
  'name': 'assetNumber',
  'serial number': 'serialNumber',
  'description': 'description',
  'location name': 'locationName',
  'cmr': 'cmr',
  'last inventoried': 'lastInventoried',
  'last observed time': 'lastObservedTime',
  'disposal status': 'disposalStatus',
};

function normalizeHeader(h) {
  return (h ?? '').toString().trim().toLowerCase();
}

function writeImportStatus(patch) {
  let current = {
    lastAssetImport: '',
    lastSectionImport: '',
    assetsImported: 0,
    assetsMapped: 0,
    assetsUnmapped: 0,
    sectionsUpdated: 0,
  };
  if (existsSync(statusPath)) {
    try {
      current = { ...current, ...JSON.parse(readFileSync(statusPath, 'utf8')) };
    } catch {
      // If the status file is corrupt, fall back to defaults rather than guessing.
    }
  }
  const updated = { ...current, ...patch };
  writeFileSync(statusPath, JSON.stringify(updated, null, 2) + '\n');
}

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: npm run import:assets -- "C:\\path\\to\\ASSETS HOME COPY.xlsx"');
    console.error('  Reads the first worksheet of an AssetWorx Excel export and writes data/assets.json.');
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];

  if (!sheet) {
    console.error('No worksheet found in the provided file.');
    process.exit(1);
  }

  const headerRow = sheet.getRow(1);
  const columnIndex = {}; // fieldName -> column number
  headerRow.eachCell((cell, colNumber) => {
    const key = normalizeHeader(cell.value);
    const field = COLUMN_MAP[key];
    if (field) columnIndex[field] = colNumber;
  });

  const assets = [];
  let totalRows = 0;
  let blankRows = 0;
  let validCount = 0;
  let scanErrorCount = 0;
  let missingSerialCount = 0;
  let notFoundCount = 0;
  let newAssetCount = 0;

  const getCell = (row, field) => {
    const col = columnIndex[field];
    if (!col) return '';
    const val = row.getCell(col).value;
    if (val === null || val === undefined) return '';
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    if (typeof val === 'object' && val.text) return val.text.toString().trim();
    return val.toString().trim();
  };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const isBlank = row.values.length === 0 || row.values.every((v) => v === null || v === undefined || v === '');
    if (isBlank) {
      blankRows += 1;
      continue;
    }
    totalRows += 1;

    const rawAssetNumber = getCell(row, 'assetNumber');
    const { value: assetNumber, kind } = classifyAssetNumber(rawAssetNumber);

    if (kind === 'scan_error') {
      scanErrorCount += 1;
      continue; // excluded entirely — not imported, not a Research item
    }
    if (kind === 'valid') validCount += 1;

    const serialNumber = getCell(row, 'serialNumber');
    const disposalStatus = getCell(row, 'disposalStatus');
    const disposalLower = disposalStatus.toLowerCase();

    const issueTypes = [];
    if (!serialNumber) {
      issueTypes.push('missing_serial_number');
      missingSerialCount += 1;
    }
    if (disposalLower.includes('not found')) {
      issueTypes.push('not_found_in_db');
      notFoundCount += 1;
    }
    if (disposalLower.includes('new asset') || disposalLower.includes('offline sync')) {
      issueTypes.push('new_asset_offline_sync');
      newAssetCount += 1;
    }

    assets.push({
      assetNumber,
      serialNumber,
      description: getCell(row, 'description'),
      locationName: getCell(row, 'locationName'),
      cmr: getCell(row, 'cmr'),
      lastInventoried: getCell(row, 'lastInventoried'),
      lastObservedTime: getCell(row, 'lastObservedTime'),
      disposalStatus,
      buildingId: '',
      floorId: '',
      sectionId: '',
      roomId: '',
      issueType: issueTypes[0] || '',
      issueTypes,
    });
  }

  writeFileSync(outputPath, JSON.stringify(assets, null, 2) + '\n');
  writeImportStatus({
    lastAssetImport: new Date().toISOString(),
    assetsImported: assets.length,
    assetsMapped: 0,
    assetsUnmapped: assets.length,
  });

  console.log('AssetWorx import complete.');
  console.log(`  Total rows read:                 ${totalRows}`);
  console.log(`  Blank rows skipped:              ${blankRows}`);
  console.log(`  Valid assets imported:           ${assets.length}`);
  console.log(`  Scanner misreads ignored:        ${scanErrorCount} (invalid "613 E..." format)`);
  console.log(`  Records missing serial number:   ${missingSerialCount}`);
  console.log(`  Records marked Not Found in DB:  ${notFoundCount}`);
  console.log(`  New Asset Found / Offline Sync:  ${newAssetCount}`);
  console.log(`Output written to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
