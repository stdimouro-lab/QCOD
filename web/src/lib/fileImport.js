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
  const historyEntries = [];

  preview.forEach((item) => {
    if (!item.matched) return;
    const target = updated.find((s) => s.id === item.section.id);
    if (!target) return;

    const previousStatus = target.status;
    const previousCompletionPct = target.completionPct || 0;
    const previousNote = target.notes || '';

    Object.assign(target, item.patch);
    target.assetCompletionPct = target.expectedAssets > 0
      ? Math.round((target.taggedAssets / target.expectedAssets) * 100)
      : 0;
    updatedCount += 1;

    // Only log a history entry when something a person actually cares about
    // changed — status, completion percent, or notes — not on every import
    // even when a row only touched, say, expected asset counts.
    const statusChanged = target.status !== previousStatus;
    const pctChanged = (target.completionPct || 0) !== previousCompletionPct;
    const noteChanged = (target.notes || '') !== previousNote;
    if (statusChanged || pctChanged || noteChanged) {
      historyEntries.push({
        id: `${target.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sectionId: target.id,
        previousStatus,
        newStatus: target.status,
        previousCompletionPct,
        newCompletionPct: target.completionPct || 0,
        note: target.notes || '',
        updatedAt: new Date().toISOString(),
      });
    }
  });

  return { sections: updated, updatedCount, historyEntries };
}

// ---- Configuration imports (Facilities / Buildings / Floors / Sections / Rooms) ----
//
// Every row is validated and classified into create/update/skip *before*
// anything is applied. Parent relationships (building needs a facility,
// floor needs a building, etc.) are checked against real existing records —
// never guessed or auto-created. A row with a broken or missing parent is
// always skipped, never silently attached to the wrong place.

function friendlyStatusOrDefault(raw) {
  const { status, valid } = normalizeStatus(raw);
  if (!raw) return { status: 'not_started', warning: null };
  if (!valid) return { status: 'not_started', warning: `Unrecognized status "${raw}" — defaulted to Not Started` };
  return { status, warning: null };
}

function toBool(raw) {
  const v = normKey(raw);
  return v === 'yes' || v === 'true' || v === '1';
}

export function previewFacilityRows(rows, existingFacilities = []) {
  const seenIds = new Set();
  return rows.map((row) => {
    const id = getField(row, 'Facility ID');
    const name = getField(row, 'Facility Name');
    const city = getField(row, 'City');
    const state = getField(row, 'State');
    const statusRaw = getField(row, 'Status');
    const notes = getField(row, 'Notes');

    const errors = [];
    const warnings = [];
    if (!id) errors.push('Facility ID is required');
    if (!name) errors.push('Facility Name is required');
    if (id && seenIds.has(normKey(id))) errors.push('Duplicate Facility ID within this import batch');
    if (id) seenIds.add(normKey(id));

    const existing = existingFacilities.find((f) => normKey(f.id) === normKey(id));
    const { status, warning } = friendlyStatusOrDefault(statusRaw);
    if (warning) warnings.push(warning);

    const valid = errors.length === 0;
    const action = !valid ? 'skip' : existing ? 'update' : 'create';
    const normalized = valid ? {
      id, name,
      city: city || existing?.city || '',
      state: state || existing?.state || '',
      status: statusRaw ? status : (existing?.status || 'not_started'),
      notes: notes || existing?.notes || '',
    } : null;

    return { matched: !!existing, valid, action, errors, warnings, normalized, raw: row };
  });
}

export function previewBuildingRows(rows, existingBuildings = [], existingFacilities = []) {
  const seenIds = new Set();
  return rows.map((row) => {
    const facilityId = getField(row, 'Facility ID');
    const id = getField(row, 'Building ID');
    const name = getField(row, 'Building Name');
    const statusRaw = getField(row, 'Status');
    const configuredRaw = getField(row, 'Configured');
    const notes = getField(row, 'Notes');

    const errors = [];
    const warnings = [];
    if (!facilityId) errors.push('Facility ID is required');
    else if (!existingFacilities.some((f) => normKey(f.id) === normKey(facilityId))) {
      errors.push(`Facility ID "${facilityId}" does not exist — import that facility first`);
    }
    if (!id) errors.push('Building ID is required');
    if (!name) errors.push('Building Name is required');
    const dupKey = `${normKey(facilityId)}::${normKey(id)}`;
    if (id && facilityId && seenIds.has(dupKey)) errors.push('Duplicate Building ID within this facility in this import batch');
    if (id && facilityId) seenIds.add(dupKey);

    const existing = existingBuildings.find((b) => normKey(b.id) === normKey(id) && normKey(b.facilityId) === normKey(facilityId));
    const { status, warning } = friendlyStatusOrDefault(statusRaw);
    if (warning) warnings.push(warning);

    const valid = errors.length === 0;
    const action = !valid ? 'skip' : existing ? 'update' : 'create';
    const normalized = valid ? {
      id, facilityId, name,
      status: statusRaw ? status : (existing?.status || 'not_started'),
      configured: configuredRaw ? toBool(configuredRaw) : (existing?.configured ?? false),
      notes: notes || existing?.notes || '',
      expectedAssets: existing?.expectedAssets ?? 0,
      foundAssets: existing?.foundAssets ?? 0,
      taggedAssets: existing?.taggedAssets ?? 0,
    } : null;

    return { matched: !!existing, valid, action, errors, warnings, normalized, raw: row };
  });
}

export function previewFloorRows(rows, existingFloors = [], existingBuildings = []) {
  const seenIds = new Set();
  return rows.map((row) => {
    const facilityId = getField(row, 'Facility ID');
    const buildingId = getField(row, 'Building ID');
    const id = getField(row, 'Floor ID');
    const name = getField(row, 'Floor Name');
    const levelRaw = getField(row, 'Level');
    const statusRaw = getField(row, 'Status');
    const notes = getField(row, 'Notes');

    const errors = [];
    const warnings = [];
    if (!facilityId) errors.push('Facility ID is required');
    if (!buildingId) errors.push('Building ID is required');
    else if (!existingBuildings.some((b) => normKey(b.id) === normKey(buildingId) && normKey(b.facilityId) === normKey(facilityId))) {
      errors.push(`Building ID "${buildingId}" does not exist for facility "${facilityId}"`);
    }
    if (!id) errors.push('Floor ID is required');
    if (!name) errors.push('Floor Name is required');
    if (id && seenIds.has(normKey(id))) errors.push('Duplicate Floor ID within this import batch');
    if (id) seenIds.add(normKey(id));

    let level = null;
    if (levelRaw !== '') {
      const num = Number(levelRaw);
      if (Number.isNaN(num)) errors.push(`Level "${levelRaw}" is not numeric`);
      else level = num;
    }

    const existing = existingFloors.find((f) => normKey(f.id) === normKey(id));
    const { status, warning } = friendlyStatusOrDefault(statusRaw);
    if (warning) warnings.push(warning);

    const valid = errors.length === 0;
    const action = !valid ? 'skip' : existing ? 'update' : 'create';
    const normalized = valid ? {
      id, facilityId, buildingId, name,
      level: level !== null ? level : (existing?.level ?? 0),
      status: statusRaw ? status : (existing?.status || 'not_started'),
      notes: notes || existing?.notes || '',
      expectedAssets: existing?.expectedAssets ?? 0,
      foundAssets: existing?.foundAssets ?? 0,
      taggedAssets: existing?.taggedAssets ?? 0,
      mapCompletionPct: existing?.mapCompletionPct ?? 0,
      mapNotes: existing?.mapNotes ?? '',
    } : null;

    return { matched: !!existing, valid, action, errors, warnings, normalized, raw: row };
  });
}

export function previewSectionConfigRows(rows, existingSections = [], existingFloors = []) {
  const seenIds = new Set();
  return rows.map((row) => {
    const facilityId = getField(row, 'Facility ID');
    const buildingId = getField(row, 'Building ID');
    const floorId = getField(row, 'Floor ID');
    const id = getField(row, 'Section ID');
    const name = getField(row, 'Section Name');
    const statusRaw = getField(row, 'Status');
    const notes = getField(row, 'Notes');

    const errors = [];
    const warnings = [];
    if (!facilityId) errors.push('Facility ID is required');
    if (!buildingId) errors.push('Building ID is required');
    if (!floorId) errors.push('Floor ID is required');
    else if (!existingFloors.some((f) => normKey(f.id) === normKey(floorId) && normKey(f.buildingId) === normKey(buildingId))) {
      errors.push(`Floor ID "${floorId}" does not exist for building "${buildingId}"`);
    }
    if (!id) errors.push('Section ID is required');
    if (!name) errors.push('Section Name is required');
    if (id && seenIds.has(normKey(id))) errors.push('Duplicate Section ID within this import batch');
    if (id) seenIds.add(normKey(id));

    const existing = existingSections.find((s) => normKey(s.id) === normKey(id));
    const { status, warning } = friendlyStatusOrDefault(statusRaw);
    if (warning) warnings.push(warning);

    const completionPct = clampPct(getField(row, 'Completion Percent'));
    const expectedAssets = toIntOrNull(getField(row, 'Expected Assets'));
    const foundAssets = toIntOrNull(getField(row, 'Found Assets'));
    const taggedAssets = toIntOrNull(getField(row, 'Tagged Assets'));
    const lastUpdated = getField(row, 'Last Updated');

    const valid = errors.length === 0;
    const action = !valid ? 'skip' : existing ? 'update' : 'create';
    const finalExpected = expectedAssets !== null ? expectedAssets : (existing?.expectedAssets ?? 0);
    const finalTagged = taggedAssets !== null ? taggedAssets : (existing?.taggedAssets ?? 0);
    const normalized = valid ? {
      id, facilityId, buildingId, floorId, name,
      status: statusRaw ? status : (existing?.status || 'not_started'),
      completionPct: completionPct !== null ? completionPct : (existing?.completionPct ?? 0),
      expectedAssets: finalExpected,
      foundAssets: foundAssets !== null ? foundAssets : (existing?.foundAssets ?? 0),
      taggedAssets: finalTagged,
      assetCompletionPct: finalExpected > 0 ? Math.round((finalTagged / finalExpected) * 100) : 0,
      lastUpdate: lastUpdated || existing?.lastUpdate || '',
      notes: notes || existing?.notes || '',
    } : null;

    return { matched: !!existing, valid, action, errors, warnings, normalized, raw: row };
  });
}

const VALID_ASSIGNMENT_STATUSES = new Set(['confirmed', 'suggested', 'unassigned', 'needs_review']);
const VALID_ASSIGNMENT_CONFIDENCE = new Set(['high', 'medium', 'low', 'none']);
const VALID_ASSIGNMENT_SOURCES = new Set(['department_map', 'architectural_plan', 'manual_review', 'approved_rule', 'unassigned']);

export function previewRoomRows(rows, existingRooms = [], existingSections = []) {
  const seenIds = new Set();
  const seenRoomNumbersByFloor = new Map(); // floorId -> Set(roomNumber)
  existingRooms.forEach((r) => {
    const set = seenRoomNumbersByFloor.get(r.floorId) || new Set();
    set.add(normKey(r.roomNumber));
    seenRoomNumbersByFloor.set(r.floorId, set);
  });

  return rows.map((row) => {
    const facilityId = getField(row, 'Facility ID');
    const buildingId = getField(row, 'Building ID');
    const floorId = getField(row, 'Floor ID');
    const sectionId = getField(row, 'Section ID'); // may be blank — blank means unassigned
    const id = getField(row, 'Room ID');
    const roomNumber = getField(row, 'Room Number');
    const roomName = getField(row, 'Room Name');
    const roomType = getField(row, 'Room Type');
    const architecturalZone = getField(row, 'Architectural Zone');
    const squareFeetRaw = getField(row, 'Square Feet');
    const assignmentStatusRaw = getField(row, 'Assignment Status');
    const assignmentConfidenceRaw = getField(row, 'Assignment Confidence');
    const assignmentSourceRaw = getField(row, 'Assignment Source');
    const assignmentReason = getField(row, 'Assignment Reason');
    const statusRaw = getField(row, 'Status');
    const lastUpdated = getField(row, 'Last Updated');
    const notes = getField(row, 'Notes');

    const errors = [];
    const warnings = [];
    if (!facilityId) errors.push('Facility ID is required');
    if (!buildingId) errors.push('Building ID is required');
    if (!floorId) errors.push('Floor ID is required');
    if (!roomNumber) errors.push('Room Number is required');

    let matchedSection = null;
    if (sectionId) {
      matchedSection = existingSections.find((s) => normKey(s.id) === normKey(sectionId));
      if (!matchedSection) {
        errors.push(`Section ID "${sectionId}" does not exist`);
      } else if (normKey(matchedSection.floorId) !== normKey(floorId) || normKey(matchedSection.buildingId) !== normKey(buildingId)) {
        // A section from another floor/building is never silently accepted.
        errors.push(`Section "${sectionId}" belongs to a different floor/building than this room`);
      }
    }

    if (!id) errors.push('Room ID is required');
    if (id && seenIds.has(normKey(id))) errors.push('Duplicate Room ID within this import batch');
    if (id) seenIds.add(normKey(id));

    if (roomNumber && floorId) {
      const floorSet = seenRoomNumbersByFloor.get(floorId) || new Set();
      if (floorSet.has(normKey(roomNumber))) {
        warnings.push(`Room Number "${roomNumber}" already exists on floor "${floorId}" — verify this isn't a duplicate`);
      }
      floorSet.add(normKey(roomNumber));
      seenRoomNumbersByFloor.set(floorId, floorSet);
    }

    let squareFeet = null;
    if (squareFeetRaw !== '') {
      const num = Number(squareFeetRaw);
      if (Number.isNaN(num)) warnings.push(`Square Feet "${squareFeetRaw}" is not numeric — left blank`);
      else squareFeet = num;
    }

    const assignmentStatus = VALID_ASSIGNMENT_STATUSES.has(normKey(assignmentStatusRaw)) ? normKey(assignmentStatusRaw) : null;
    if (assignmentStatusRaw && !assignmentStatus) warnings.push(`Unrecognized Assignment Status "${assignmentStatusRaw}"`);
    const assignmentConfidence = VALID_ASSIGNMENT_CONFIDENCE.has(normKey(assignmentConfidenceRaw)) ? normKey(assignmentConfidenceRaw) : null;
    if (assignmentConfidenceRaw && !assignmentConfidence) warnings.push(`Unrecognized Assignment Confidence "${assignmentConfidenceRaw}"`);
    const assignmentSource = VALID_ASSIGNMENT_SOURCES.has(normKey(assignmentSourceRaw)) ? normKey(assignmentSourceRaw) : null;
    if (assignmentSourceRaw && !assignmentSource) warnings.push(`Unrecognized Assignment Source "${assignmentSourceRaw}"`);

    const existing = existingRooms.find((r) => normKey(r.id) === normKey(id));
    const { status, warning } = friendlyStatusOrDefault(statusRaw);
    if (warning) warnings.push(warning);

    const valid = errors.length === 0;
    const action = !valid ? 'skip' : existing ? 'update' : 'create';
    const normalized = valid ? {
      id, facilityId, buildingId, floorId,
      sectionId: sectionId || existing?.sectionId || '',
      roomNumber, roomName: roomName || existing?.roomName || '',
      roomType: roomType || existing?.roomType || '',
      architecturalZone: architecturalZone || existing?.architecturalZone || '',
      squareFeet: squareFeet !== null ? squareFeet : (existing?.squareFeet ?? null),
      assignmentStatus: assignmentStatus || existing?.assignmentStatus || (sectionId ? 'suggested' : 'unassigned'),
      assignmentConfidence: assignmentConfidence || existing?.assignmentConfidence || 'none',
      assignmentSource: assignmentSource || existing?.assignmentSource || (sectionId ? 'manual_review' : 'unassigned'),
      assignmentReason: assignmentReason || existing?.assignmentReason || '',
      sourceDocument: existing?.sourceDocument || '',
      sourcePage: existing?.sourcePage ?? 1,
      extractedLabel: existing?.extractedLabel || '',
      status: statusRaw ? status : (existing?.status || 'not_started'),
      lastUpdate: lastUpdated || existing?.lastUpdate || '',
      notes: notes || existing?.notes || '',
    } : null;

    return { matched: !!existing, valid, action, errors, warnings, normalized, raw: row };
  });
}

// ---- Apply configuration imports ----
// Applies only the valid rows from a preview array onto an existing dataset,
// keyed by the entity's own ID. Invalid rows are always excluded.

function applyConfigPreview(preview, existingData, idKey = 'id') {
  const updated = existingData.map((r) => ({ ...r }));
  let created = 0;
  let updatedCount = 0;
  let skipped = 0;

  preview.forEach((item) => {
    if (!item.valid || item.action === 'skip') {
      skipped += 1;
      return;
    }
    const idx = updated.findIndex((r) => normKey(r[idKey]) === normKey(item.normalized[idKey]));
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], ...item.normalized };
      updatedCount += 1;
    } else {
      updated.push(item.normalized);
      created += 1;
    }
  });

  return { data: updated, created, updated: updatedCount, skipped };
}

export function applyFacilityImport(preview, existingFacilities) {
  return applyConfigPreview(preview, existingFacilities);
}

export function applyBuildingImport(preview, existingBuildings) {
  return applyConfigPreview(preview, existingBuildings);
}

export function applyFloorImport(preview, existingFloors) {
  return applyConfigPreview(preview, existingFloors);
}

export function applySectionConfigImport(preview, existingSections) {
  return applyConfigPreview(preview, existingSections);
}

export function applyRoomImport(preview, existingRooms) {
  return applyConfigPreview(preview, existingRooms);
}

// Builds a downloadable error report (rows that failed validation).
export function buildErrorReportRows(preview) {
  return preview
    .filter((item) => !item.valid)
    .map((item) => ({ ...item.raw, __errors: item.errors.join('; ') }));
}
