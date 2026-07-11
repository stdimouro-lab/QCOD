// All parsing here happens entirely in the browser using the File API and
// the `xlsx` library. No file or its contents is ever sent over the
// network — everything below runs client-side only.
import * as XLSX from 'xlsx';

export function readWorkbookFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        resolve(workbook);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function getWorksheetNames(workbook) {
  return workbook.SheetNames;
}

export function worksheetToRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  // defval: '' keeps blank cells as '' instead of omitting the key, so every
  // row has a consistent shape regardless of which cells were empty.
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

export function normalizeHeaders(headers) {
  const map = {};
  headers.forEach((h) => {
    map[h] = (h ?? '').toString().trim().toLowerCase();
  });
  return map;
}

// Looks up a value from a raw row object using a case-insensitive,
// whitespace-trimmed header match.
export function getField(row, headerKey) {
  const target = headerKey.trim().toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.trim().toLowerCase() === target) {
      const val = row[key];
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      return (val ?? '').toString().trim();
    }
  }
  return '';
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Asset-number classification (shared with the command-line importer) ----

const VALID_ASSET_NUMBER = /^613\s?EE\d+/i;
const MISREAD_ASSET_NUMBER = /^613\s?E(?!E)/i;

export function classifyAssetNumber(raw) {
  const value = (raw ?? '').toString().trim();
  if (!value) return { value: '', kind: 'blank' };
  if (VALID_ASSET_NUMBER.test(value)) return { value, kind: 'valid' };
  if (MISREAD_ASSET_NUMBER.test(value)) return { value, kind: 'scan_error' };
  return { value, kind: 'unrecognized' };
}

// ---- AssetWorx normalization ----

export function normalizeAssetRows(rows) {
  const assets = [];
  let blankRows = 0;
  let scanErrorCount = 0;
  let unrecognizedCount = 0;
  let missingSerialCount = 0;
  let notFoundCount = 0;
  let newAssetCount = 0;

  rows.forEach((row) => {
    const allBlank = Object.values(row).every((v) => (v ?? '').toString().trim() === '');
    if (allBlank) {
      blankRows += 1;
      return;
    }

    const rawAssetNumber = getField(row, 'Name');
    const { value: assetNumber, kind } = classifyAssetNumber(rawAssetNumber);

    if (kind === 'scan_error') {
      scanErrorCount += 1;
      return; // excluded entirely — never imported, never a Research item
    }
    if (kind === 'unrecognized') unrecognizedCount += 1;

    const serialNumber = getField(row, 'Serial Number');
    const description = getField(row, 'Description');
    const disposalStatus = getField(row, 'Disposal Status');
    const combined = `${description} ${disposalStatus}`.toLowerCase();

    const issueTypes = [];
    if (!serialNumber) {
      issueTypes.push('missing_serial_number');
      missingSerialCount += 1;
    }
    if (combined.includes('not found')) {
      issueTypes.push('not_found_in_db');
      notFoundCount += 1;
    }
    if (combined.includes('new asset') || combined.includes('offline sync')) {
      issueTypes.push('new_asset_offline_sync');
      newAssetCount += 1;
    }

    assets.push({
      assetNumber,
      serialNumber,
      description,
      locationName: getField(row, 'Location Name'),
      cmr: getField(row, 'CMR'),
      lastInventoried: getField(row, 'Last Inventoried'),
      lastObservedTime: getField(row, 'Last Observed Time'),
      disposalStatus,
      buildingId: '',
      floorId: '',
      sectionId: '',
      roomId: '',
      issueTypes,
    });
  });

  return {
    assets,
    stats: {
      totalRows: rows.length - blankRows,
      blankRows,
      validCount: assets.length,
      scanErrorCount,
      unrecognizedCount,
      missingSerialCount,
      notFoundCount,
      newAssetCount,
    },
  };
}

// ---- Section progress normalization ----

const VALID_STATUSES = new Set(['completed', 'return_needed', 'no_access', 'not_started', 'in_progress']);
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

export function normalizeStatus(raw) {
  const trimmed = (raw ?? '').toString().trim();
  if (!trimmed) return { status: null, valid: true };
  const lower = trimmed.toLowerCase();
  if (VALID_STATUSES.has(lower)) return { status: lower, valid: true };
  if (STATUS_ALIASES[lower]) return { status: STATUS_ALIASES[lower], valid: true };
  return { status: null, valid: false, raw: trimmed };
}

function normKey(s) {
  return (s ?? '').toString().trim().toLowerCase();
}

function looseKey(s) {
  return normKey(s).replace(/['’]/g, '').replace(/[-/]/g, ' ').replace(/\s+/g, ' ').trim();
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

// Matches each row against the existing (bundled or local) sections list.
// Never creates a new section — unmatched rows are reported, not applied.
export function previewSectionRows(rows, sectionsData, floorsData) {
  const preview = [];

  rows.forEach((row) => {
    const building = getField(row, 'Building');
    const floorRaw = getField(row, 'Floor');
    const sectionRaw = getField(row, 'Section');

    if (!building || !floorRaw || !sectionRaw) {
      preview.push({ row, matched: false, reason: 'Missing Building, Floor, or Section' });
      return;
    }

    const floor = floorsData.find((f) => {
      if (normKey(f.buildingId) !== normKey(building)) return false;
      const floorNorm = normKey(floorRaw);
      return (
        String(f.level) === floorNorm ||
        normKey(f.name) === floorNorm ||
        normKey(f.id) === floorNorm
      );
    });

    const section = sectionsData.find((s) => {
      if (normKey(s.buildingId) !== normKey(building)) return false;
      if (floor && s.floorId !== floor.id) return false;
      return looseKey(s.name) === looseKey(sectionRaw);
    });

    if (!section) {
      preview.push({ row, matched: false, reason: `No matching section for ${building} / Floor ${floorRaw} / ${sectionRaw}` });
      return;
    }

    const { status, valid, raw } = normalizeStatus(getField(row, 'Status'));
    if (!valid) {
      preview.push({ row, matched: false, reason: `Invalid status "${raw}"`, section });
      return;
    }

    const patch = {};
    if (status) patch.status = status;
    const completionPct = clampPct(getField(row, 'Completion Percent'));
    if (completionPct !== null) patch.completionPct = completionPct;
    const expectedAssets = toIntOrNull(getField(row, 'Expected Assets'));
    if (expectedAssets !== null) patch.expectedAssets = expectedAssets;
    const foundAssets = toIntOrNull(getField(row, 'Found Assets'));
    if (foundAssets !== null) patch.foundAssets = foundAssets;
    const taggedAssets = toIntOrNull(getField(row, 'Tagged Assets'));
    if (taggedAssets !== null) patch.taggedAssets = taggedAssets;
    const notes = getField(row, 'Notes');
    if (notes) patch.notes = notes;
    const lastUpdated = getField(row, 'Last Updated');
    if (lastUpdated) patch.lastUpdate = lastUpdated;

    preview.push({ row, matched: true, section, patch });
  });

  return preview;
}

export function applySectionPreview(preview, sectionsData) {
  const updated = sectionsData.map((s) => ({ ...s }));
  let updatedCount = 0;

  preview.forEach((item) => {
    if (!item.matched) return;
    const target = updated.find((s) => s.id === item.section.id);
    if (!target) return;
    Object.assign(target, item.patch);
    target.assetCompletionPct = target.expectedAssets > 0
      ? Math.round((target.taggedAssets / target.expectedAssets) * 100)
      : 0;
    updatedCount += 1;
  });

  return { sections: updated, updatedCount };
}
