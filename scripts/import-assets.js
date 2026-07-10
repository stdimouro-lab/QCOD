/**
 * Imports an AssetWorx Excel export and normalizes it into data/assets.json.
 *
 * Usage:
 *   npm run import:assets -- "C:\path\to\ASSETS HOME COPY.xlsx"
 *
 * This script does not modify floors, sections, or building data. It only
 * produces data/assets.json. It is safe to run against a real export —
 * unknown/blank values are preserved as blank rather than guessed.
 */
import ExcelJS from 'exceljs';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'data', 'assets.json');

// A valid QCOD asset number looks like: 613 EE##### (or another verified
// length after "613 EE"). Records that begin with only "613 E" (missing the
// second E) are known RFID scanner misreads, not valid research items —
// they must be flagged as scan-format errors, never counted as real assets.
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
  'disposal status': 'status',
};

function normalizeHeader(h) {
  return (h ?? '').toString().trim().toLowerCase();
}

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: npm run import:assets -- "C:\\path\\to\\ASSETS HOME COPY.xlsx"');
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
  let unrecognizedCount = 0;
  let missingSerialCount = 0;
  let notFoundCount = 0;
  let newAssetCount = 0;

  const getCell = (row, field) => {
    const col = columnIndex[field];
    if (!col) return '';
    const val = row.getCell(col).value;
    if (val === null || val === undefined) return '';
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
      continue; // excluded from normal asset counts, per import rules
    }
    if (kind === 'unrecognized') {
      unrecognizedCount += 1;
    }
    if (kind === 'valid') {
      validCount += 1;
    }

    const serialNumber = getCell(row, 'serialNumber');
    if (!serialNumber) missingSerialCount += 1;

    const status = getCell(row, 'status');
    const statusLower = status.toLowerCase();
    if (statusLower.includes('not found')) notFoundCount += 1;
    if (statusLower.includes('new asset') || statusLower.includes('offline sync')) newAssetCount += 1;

    assets.push({
      assetNumber,
      serialNumber,
      description: getCell(row, 'description'),
      buildingId: '',
      floorId: '',
      sectionId: '',
      roomId: '',
      locationName: getCell(row, 'locationName'),
      lastInventoried: getCell(row, 'lastInventoried'),
      status,
    });
  }

  writeFileSync(outputPath, JSON.stringify(assets, null, 2) + '\n');

  console.log('AssetWorx import complete.');
  console.log(`  Total rows read:                 ${totalRows}`);
  console.log(`  Blank rows skipped:              ${blankRows}`);
  console.log(`  Valid assets imported:           ${assets.length}`);
  console.log(`  Invalid scan-format records:     ${scanErrorCount} (ignored, likely "613 E..." misreads)`);
  console.log(`  Unrecognized asset numbers:      ${unrecognizedCount}`);
  console.log(`  Records missing serial number:   ${missingSerialCount}`);
  console.log(`  Records marked Not Found in DB:  ${notFoundCount}`);
  console.log(`  New Asset Found / Offline Sync:  ${newAssetCount}`);
  console.log(`Output written to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
