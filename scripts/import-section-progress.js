/**
 * Imports section progress from a CSV or Excel file and updates data/sections.json.
 *
 * Usage:
 *   npm run import:sections -- "C:\path\to\section-progress.xlsx"
 *   npm run import:sections -- "C:\path\to\section-progress.csv"
 *
 * This script never creates new sections — it only updates sections that
 * already exist in data/sections.json, matched by Building + Floor + Section
 * name. Anything it can't match is skipped and reported, not guessed.
 *
 * A timestamped backup of the previous sections.json is written before any
 * changes are saved.
 */
import ExcelJS from 'exceljs';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const sectionsPath = join(dataDir, 'sections.json');
const floorsPath = join(dataDir, 'floors.json');
const backupsDir = join(dataDir, 'backups');
const statusPath = join(dataDir, 'import-status.json');

const VALID_STATUSES = new Set(['completed', 'return_needed', 'no_access', 'not_started', 'in_progress']);

// Friendly labels people actually type in a spreadsheet -> internal status key.
const STATUS_ALIASES = {
  'completed': 'completed',
  'scanned - return needed': 'return_needed',
  'scanned – return needed': 'return_needed',
  'scanned — return needed': 'return_needed',
  'return needed': 'return_needed',
  'no access': 'no_access',
  'not started': 'not_started',
  'in progress': 'in_progress',
};

function normalizeStatus(raw) {
  const trimmed = (raw ?? '').toString().trim();
  if (!trimmed) return { status: null, valid: true }; // blank = leave unchanged
  const lower = trimmed.toLowerCase();
  if (VALID_STATUSES.has(lower)) return { status: lower, valid: true };
  if (STATUS_ALIASES[lower]) return { status: STATUS_ALIASES[lower], valid: true };
  return { status: null, valid: false, raw: trimmed };
}

function clampPct(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const num = Number(raw);
  if (Number.isNaN(num)) return null;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function toIntOrNull(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const num = Number(raw);
  return Number.isNaN(num) ? null : Math.round(num);
}

function normKey(s) {
  return (s ?? '').toString().trim().toLowerCase();
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
      // Corrupt status file — fall back to defaults rather than guessing.
    }
  }
  const updated = { ...current, ...patch };
  writeFileSync(statusPath, JSON.stringify(updated, null, 2) + '\n');
}

async function readRows(filePath) {
  const ext = extname(filePath).toLowerCase();
  const workbook = new ExcelJS.Workbook();

  if (ext === '.csv') {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet/rows found in the provided file.');

  const headerRow = sheet.getRow(1);
  const headers = {}; // normalized header -> column number
  headerRow.eachCell((cell, colNumber) => {
    headers[normKey(cell.value)] = colNumber;
  });

  const getCell = (row, key) => {
    const col = headers[key];
    if (!col) return '';
    const val = row.getCell(col).value;
    if (val === null || val === undefined) return '';
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    if (typeof val === 'object' && val.text) return val.text.toString().trim();
    return val.toString().trim();
  };

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const isBlank = row.values.length === 0 || row.values.every((v) => v === null || v === undefined || v === '');
    if (isBlank) continue;

    rows.push({
      building: getCell(row, 'building'),
      floor: getCell(row, 'floor'),
      section: getCell(row, 'section'),
      status: getCell(row, 'status'),
      completionPercent: getCell(row, 'completion percent'),
      expectedAssets: getCell(row, 'expected assets'),
      foundAssets: getCell(row, 'found assets'),
      taggedAssets: getCell(row, 'tagged assets'),
      lastUpdated: getCell(row, 'last updated'),
      notes: getCell(row, 'notes'),
    });
  }
  return rows;
}

function findSection(sectionsData, floorsData, buildingRaw, floorRaw, sectionRaw) {
  const building = normKey(buildingRaw);
  const floorNorm = normKey(floorRaw);
  const sectionNorm = normKey(sectionRaw);

  // A row can name its floor by number ("1"), by name ("1st Floor"), or by id ("500-1").
  const floor = floorsData.find((f) => {
    if (normKey(f.buildingId) !== building) return false;
    return (
      String(f.level) === floorNorm ||
      normKey(f.name) === floorNorm ||
      normKey(f.id) === floorNorm ||
      normKey(f.id) === `${building}-${floorNorm}`
    );
  });

  return sectionsData.find((s) => {
    if (normKey(s.buildingId) !== building) return false;
    if (floor && s.floorId !== floor.id) return false;
    return normKey(s.name) === sectionNorm;
  });
}

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: npm run import:sections -- "C:\\path\\to\\section-progress.xlsx"');
    console.error('  Accepts .csv or .xlsx. Updates existing sections in data/sections.json — never creates new ones.');
    process.exit(1);
  }

  const sectionsData = JSON.parse(readFileSync(sectionsPath, 'utf8'));
  const floorsData = JSON.parse(readFileSync(floorsPath, 'utf8'));
  const rows = await readRows(filePath);

  let updatedCount = 0;
  let skippedCount = 0;
  const unmatched = [];
  const invalidStatuses = [];

  for (const row of rows) {
    if (!row.building || !row.floor || !row.section) {
      skippedCount += 1;
      continue;
    }

    const section = findSection(sectionsData, floorsData, row.building, row.floor, row.section);
    if (!section) {
      unmatched.push(`${row.building} / Floor ${row.floor} / ${row.section}`);
      skippedCount += 1;
      continue;
    }

    const { status, valid, raw } = normalizeStatus(row.status);
    if (!valid) {
      invalidStatuses.push(`"${raw}" (${section.name})`);
      skippedCount += 1;
      continue;
    }

    // Preserve existing values when the imported field is blank.
    if (status) section.status = status;

    const completionPct = clampPct(row.completionPercent);
    if (completionPct !== null) section.completionPct = completionPct;

    const expectedAssets = toIntOrNull(row.expectedAssets);
    if (expectedAssets !== null) section.expectedAssets = expectedAssets;

    const foundAssets = toIntOrNull(row.foundAssets);
    if (foundAssets !== null) section.foundAssets = foundAssets;

    const taggedAssets = toIntOrNull(row.taggedAssets);
    if (taggedAssets !== null) section.taggedAssets = taggedAssets;

    if (row.notes) section.notes = row.notes;
    if (row.lastUpdated) section.lastUpdate = row.lastUpdated;

    // Recalculate assetCompletionPct only when we actually know expectedAssets.
    section.assetCompletionPct = section.expectedAssets > 0
      ? Math.round((section.taggedAssets / section.expectedAssets) * 100)
      : 0;

    updatedCount += 1;
  }

  if (updatedCount > 0) {
    mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const backupPath = join(backupsDir, `sections-${stamp}.json`);
    writeFileSync(backupPath, readFileSync(sectionsPath, 'utf8'));
    writeFileSync(sectionsPath, JSON.stringify(sectionsData, null, 2) + '\n');
    writeImportStatus({
      lastSectionImport: new Date().toISOString(),
      sectionsUpdated: updatedCount,
    });

    console.log('Section progress import complete.');
    console.log(`  Rows read:            ${rows.length}`);
    console.log(`  Sections updated:     ${updatedCount}`);
    console.log(`  Rows skipped:         ${skippedCount}`);
    console.log(`  Unmatched sections:   ${unmatched.length}`);
    unmatched.forEach((u) => console.log(`    - ${u}`));
    console.log(`  Invalid statuses:     ${invalidStatuses.length}`);
    invalidStatuses.forEach((s) => console.log(`    - ${s}`));
    console.log(`  Backup written to:    ${backupPath}`);
    console.log(`  Output written to:    ${sectionsPath}`);
  } else {
    console.log('No sections were updated — nothing written.');
    console.log(`  Rows read:            ${rows.length}`);
    console.log(`  Rows skipped:         ${skippedCount}`);
    console.log(`  Unmatched sections:   ${unmatched.length}`);
    unmatched.forEach((u) => console.log(`    - ${u}`));
    console.log(`  Invalid statuses:     ${invalidStatuses.length}`);
    invalidStatuses.forEach((s) => console.log(`    - ${s}`));
  }
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
