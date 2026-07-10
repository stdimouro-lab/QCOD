/**
 * Generates the QCOD Excel dashboard workbook from JSON data files.
 * Run: npm run generate:excel
 */
import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const outputPath = join(__dirname, '..', 'output', 'QCOD_Building500_Dashboard.xlsx');

const readJson = (file) => JSON.parse(readFileSync(join(dataDir, file), 'utf8'));

const project = readJson('project.json');
const buildings = readJson('buildings.json');
const floors = readJson('floors.json');
const sections = readJson('sections.json');
const statuses = readJson('statuses.json');

const statusLabel = (key) => statuses[key]?.label ?? key;
const statusSymbol = (key) => statuses[key]?.symbol ?? '';
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);

const totalExpected = buildings.reduce((s, b) => s + b.expectedAssets, 0);
const totalFound = buildings.reduce((s, b) => s + b.foundAssets, 0);
const totalTagged = buildings.reduce((s, b) => s + b.taggedAssets, 0);
const overallCompletion = pct(totalTagged, totalExpected);
const returnCount = sections.filter((s) => s.status === 'return_needed').length;
const noAccessCount = sections.filter((s) => s.status === 'no_access').length;
const completedCount = sections.filter((s) => s.status === 'completed').length;
const notStartedCount = sections.filter((s) => s.status === 'not_started').length;

const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const titleFont = { bold: true, size: 16, color: { argb: 'FF1E3A5F' } };
const subTitleFont = { bold: true, size: 12, color: { argb: 'FF334155' } };

function styleHeaderRow(sheet, rowNum, colCount) {
  const row = sheet.getRow(rowNum);
  row.height = 22;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
}

function autoWidth(sheet, min = 10, max = 40) {
  sheet.columns.forEach((col) => {
    let maxLen = min;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, max);
  });
}

const workbook = new ExcelJS.Workbook();
workbook.creator = 'QCOD';
workbook.created = new Date();

// ── Dashboard sheet ──────────────────────────────────────────────
const dash = workbook.addWorksheet('Dashboard', {
  views: [{ showGridLines: false }],
  properties: { tabColor: { argb: 'FF1E3A5F' } },
});

dash.mergeCells('A1:F1');
dash.getCell('A1').value = 'Quality Control Operations Dashboard (QCOD)';
dash.getCell('A1').font = titleFont;

dash.mergeCells('A2:F2');
dash.getCell('A2').value = `${project.facility} — Building ${project.focusBuilding} — ${project.phase}`;
dash.getCell('A2').font = { size: 11, color: { argb: 'FF64748B' } };

dash.getCell('A4').value = 'Last Updated';
dash.getCell('B4').value = project.lastUpdated;
dash.getCell('A5').value = 'Overall Completion';
dash.getCell('B5').value = overallCompletion / 100;
dash.getCell('B5').numFmt = '0%';

const stats = [
  ['Metric', 'Value'],
  ['Expected Assets', totalExpected],
  ['Found Assets', totalFound],
  ['Tagged Assets', totalTagged],
  ['Found %', pct(totalFound, totalExpected) / 100],
  ['Tagged %', pct(totalTagged, totalExpected) / 100],
  ['Sections Completed', completedCount],
  ['Return Needed', returnCount],
  ['No Access', noAccessCount],
  ['Not Started', notStartedCount],
  ['Total Sections', sections.length],
];

dash.getCell('A7').value = 'Project Statistics';
dash.getCell('A7').font = subTitleFont;

stats.forEach((row, i) => {
  const r = dash.getRow(8 + i);
  r.getCell(1).value = row[0];
  r.getCell(2).value = row[1];
  if (typeof row[1] === 'number' && row[0].includes('%')) {
    r.getCell(2).numFmt = '0%';
  }
});
styleHeaderRow(dash, 8, 2);

dash.getCell('D7').value = 'QC Status Legend';
dash.getCell('D7').font = subTitleFont;
Object.entries(statuses).forEach(([key, val], i) => {
  const r = dash.getRow(8 + i);
  r.getCell(4).value = `${val.symbol} ${val.label}`;
});

dash.getCell('A20').value = 'Floor Progress Summary';
dash.getCell('A20').font = subTitleFont;

const floorHeaders = ['Floor', 'Expected', 'Found', 'Tagged', 'Completion %', 'Status'];
floorHeaders.forEach((h, i) => { dash.getCell(21, i + 1).value = h; });
styleHeaderRow(dash, 21, floorHeaders.length);

floors.forEach((f, i) => {
  const r = dash.getRow(22 + i);
  r.getCell(1).value = f.name;
  r.getCell(2).value = f.expectedAssets;
  r.getCell(3).value = f.foundAssets;
  r.getCell(4).value = f.taggedAssets;
  r.getCell(5).value = pct(f.taggedAssets, f.expectedAssets) / 100;
  r.getCell(5).numFmt = '0%';
  r.getCell(6).value = `${statusSymbol(f.status)} ${statusLabel(f.status)}`;
});

dash.getColumn(1).width = 28;
dash.getColumn(2).width = 14;
dash.getColumn(4).width = 22;

// ── Buildings sheet ────────────────────────────────────────────────
const bSheet = workbook.addWorksheet('Buildings');
const bHeaders = ['ID', 'Name', 'Description', 'Expected', 'Found', 'Tagged', 'Found %', 'Tagged %', 'Status'];
bHeaders.forEach((h, i) => { bSheet.getCell(1, i + 1).value = h; });
styleHeaderRow(bSheet, 1, bHeaders.length);

buildings.forEach((b, i) => {
  const r = bSheet.getRow(i + 2);
  r.getCell(1).value = b.id;
  r.getCell(2).value = b.name;
  r.getCell(3).value = b.description;
  r.getCell(4).value = b.expectedAssets;
  r.getCell(5).value = b.foundAssets;
  r.getCell(6).value = b.taggedAssets;
  r.getCell(7).value = pct(b.foundAssets, b.expectedAssets) / 100;
  r.getCell(7).numFmt = '0%';
  r.getCell(8).value = pct(b.taggedAssets, b.expectedAssets) / 100;
  r.getCell(8).numFmt = '0%';
  r.getCell(9).value = `${statusSymbol(b.status)} ${statusLabel(b.status)}`;
});
autoWidth(bSheet);

// ── Floors sheet ───────────────────────────────────────────────────
const fSheet = workbook.addWorksheet('Floors');
const fHeaders = ['ID', 'Building', 'Floor', 'Level', 'Expected', 'Found', 'Tagged', 'Section %', 'Map %', 'Status', 'Map Notes'];
fHeaders.forEach((h, i) => { fSheet.getCell(1, i + 1).value = h; });
styleHeaderRow(fSheet, 1, fHeaders.length);

floors.forEach((f, i) => {
  const r = fSheet.getRow(i + 2);
  r.getCell(1).value = f.id;
  r.getCell(2).value = f.buildingId;
  r.getCell(3).value = f.name;
  r.getCell(4).value = f.level;
  r.getCell(5).value = f.expectedAssets;
  r.getCell(6).value = f.foundAssets;
  r.getCell(7).value = f.taggedAssets;
  r.getCell(8).value = pct(f.taggedAssets, f.expectedAssets) / 100;
  r.getCell(8).numFmt = '0%';
  r.getCell(9).value = (f.mapCompletionPct ?? 0) / 100;
  r.getCell(9).numFmt = '0%';
  r.getCell(10).value = `${statusSymbol(f.status)} ${statusLabel(f.status)}`;
  r.getCell(11).value = f.mapNotes ?? '';
});
autoWidth(fSheet);

// ── Sections sheet ───────────────────────────────────────────────────
const sSheet = workbook.addWorksheet('Sections');
const sHeaders = [
  'ID', 'Building', 'Floor', 'Section', 'Expected', 'Found', 'Tagged',
  'Completion %', 'Asset %', 'Status', 'Notes', 'Last Update',
];
sHeaders.forEach((h, i) => { sSheet.getCell(1, i + 1).value = h; });
styleHeaderRow(sSheet, 1, sHeaders.length);

sections.forEach((s, i) => {
  const floor = floors.find((f) => f.id === s.floorId);
  const r = sSheet.getRow(i + 2);
  r.getCell(1).value = s.id;
  r.getCell(2).value = s.buildingId;
  r.getCell(3).value = floor?.name ?? s.floorId;
  r.getCell(4).value = s.name;
  r.getCell(5).value = s.expectedAssets;
  r.getCell(6).value = s.foundAssets;
  r.getCell(7).value = s.taggedAssets;
  r.getCell(8).value = s.completionPct / 100;
  r.getCell(8).numFmt = '0%';
  r.getCell(9).value = s.assetCompletionPct / 100;
  r.getCell(9).numFmt = '0%';
  r.getCell(10).value = `${statusSymbol(s.status)} ${statusLabel(s.status)}`;
  r.getCell(11).value = s.notes;
  r.getCell(12).value = s.lastUpdate;
});
autoWidth(sSheet);

// ── Outstanding Work sheet ───────────────────────────────────────────
const oSheet = workbook.addWorksheet('Outstanding Work');
oSheet.getCell('A1').value = 'Return Needed & No Access Locations';
oSheet.getCell('A1').font = subTitleFont;

const oHeaders = ['Section', 'Floor', 'Status', 'Completion %', 'Notes', 'Last Update'];
oHeaders.forEach((h, i) => { oSheet.getCell(3, i + 1).value = h; });
styleHeaderRow(oSheet, 3, oHeaders.length);

const outstanding = sections.filter((s) => s.status === 'return_needed' || s.status === 'no_access');
outstanding.forEach((s, i) => {
  const floor = floors.find((f) => f.id === s.floorId);
  const r = oSheet.getRow(4 + i);
  r.getCell(1).value = s.name;
  r.getCell(2).value = floor?.name ?? s.floorId;
  r.getCell(3).value = `${statusSymbol(s.status)} ${statusLabel(s.status)}`;
  r.getCell(4).value = s.completionPct / 100;
  r.getCell(4).numFmt = '0%';
  r.getCell(5).value = s.notes;
  r.getCell(6).value = s.lastUpdate;
});
autoWidth(oSheet);

// ── Import template sheet ────────────────────────────────────────────
const iSheet = workbook.addWorksheet('AssetWorx Import');
iSheet.getCell('A1').value = 'AssetWorx Import Template';
iSheet.getCell('A1').font = subTitleFont;
iSheet.getCell('A2').value = 'Paste AssetWorx export data below. Map section names to QCOD section IDs in the Sections sheet.';
iSheet.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF64748B' } };

const importHeaders = ['asset_id', 'rfid_tag', 'building', 'floor', 'section', 'room', 'description', 'inventory_status', 'tagged', 'last_seen_date'];
importHeaders.forEach((h, i) => { iSheet.getCell(4, i + 1).value = h; });
styleHeaderRow(iSheet, 4, importHeaders.length);
autoWidth(iSheet);

await workbook.xlsx.writeFile(outputPath);
console.log(`QCOD dashboard written to: ${outputPath}`);
