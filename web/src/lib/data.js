import project from '../../../data/project.json';
import bundledFacilities from '../../../data/facilities.json';
import bundledBuildings from '../../../data/buildings.json';
import bundledFloors from '../../../data/floors.json';
import bundledSections from '../../../data/sections.json';
import bundledRooms from '../../../data/rooms.json';
import bundledAssets from '../../../data/assets.json';
import statuses from '../../../data/statuses.json';
import bundledImportStatus from '../../../data/import-status.json';

export { project, statuses };

// ---- Local persistence ----
// QCOD is local-only: imported data lives in this browser's localStorage and
// overrides the bundled JSON snapshot whenever it's present. Nothing here
// ever makes a network request. The bundled JSON always remains the
// fallback, so the app still works the first time it's opened.

export const LOCAL_KEYS = {
  facilities: 'qcod-facilities',
  buildings: 'qcod-buildings',
  floors: 'qcod-floors',
  rooms: 'qcod-rooms',
  assets: 'qcod-assets',
  sectionProgress: 'qcod-section-progress',
  qcPreview: 'qcod-qc-preview',
  researchPreview: 'qcod-research-preview',
  qcRecords: 'qcod-qc-records',
  researchRecords: 'qcod-research-records',
  locationMappings: 'qcod-location-mappings',
  mappingHistory: 'qcod-mapping-history',
  sectionHistory: 'qcod-section-history',
  importStatus: 'qcod-import-status',
};

const DATA_CHANGED_EVENT = 'qcod-data-changed';

export function loadLocalData(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    // Corrupt or inaccessible localStorage — fall back rather than crash.
    return fallback;
  }
}

export function saveLocalData(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalData() {
  Object.values(LOCAL_KEYS).forEach((key) => window.localStorage.removeItem(key));
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}

export function onDataChanged(handler) {
  window.addEventListener(DATA_CHANGED_EVENT, handler);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
}

// ---- Live data getters ----
// These always check localStorage first. Call these instead of importing
// the bundled JSON directly anywhere the data can be changed by an import.

export function getFacilities() {
  return loadLocalData(LOCAL_KEYS.facilities, bundledFacilities);
}

export function getBuildings() {
  return loadLocalData(LOCAL_KEYS.buildings, bundledBuildings);
}

export function getFloors() {
  return loadLocalData(LOCAL_KEYS.floors, bundledFloors);
}

export function getRooms() {
  return loadLocalData(LOCAL_KEYS.rooms, bundledRooms);
}

export function getSections() {
  return loadLocalData(LOCAL_KEYS.sectionProgress, bundledSections);
}

export function getAssets() {
  return loadLocalData(LOCAL_KEYS.assets, bundledAssets);
}

export function getImportStatus() {
  return loadLocalData(LOCAL_KEYS.importStatus, bundledImportStatus);
}

export function saveImportStatus(patch) {
  const current = getImportStatus();
  saveLocalData(LOCAL_KEYS.importStatus, { ...current, ...patch });
}

export function getQcPreview() {
  return loadLocalData(LOCAL_KEYS.qcPreview, []);
}

export function getResearchPreview() {
  return loadLocalData(LOCAL_KEYS.researchPreview, []);
}

export function getQcRecords() {
  return loadLocalData(LOCAL_KEYS.qcRecords, []);
}

export function getResearchRecords() {
  return loadLocalData(LOCAL_KEYS.researchRecords, []);
}

export function getLocationMappings() {
  return loadLocalData(LOCAL_KEYS.locationMappings, []);
}

export function getMappingHistory() {
  return loadLocalData(LOCAL_KEYS.mappingHistory, []);
}

export function getSectionHistory() {
  return loadLocalData(LOCAL_KEYS.sectionHistory, []);
}

// Appends new entries to section history — never overwrites what's there.
export function appendSectionHistory(entries) {
  if (!entries || entries.length === 0) return;
  const current = getSectionHistory();
  saveLocalData(LOCAL_KEYS.sectionHistory, [...current, ...entries]);
}

export function getSectionHistoryForSection(sectionId) {
  return getSectionHistory().filter((h) => h.sectionId === sectionId);
}

// ---- Backup / restore ----
// v0.2 backup covers the full site hierarchy plus mapping/history data.
// Import validates the shape before writing anything — a malformed backup
// is rejected outright rather than partially overwriting good local data.

const BACKUP_ARRAY_FIELDS = [
  'facilities', 'buildings', 'floors', 'sections', 'rooms', 'assets',
  'assetMappings', 'locationMappings', 'mappingHistory', 'sectionHistory',
  'qcRecords', 'researchRecords',
];

export function exportQcodBackup() {
  const backup = {
    version: '0.2',
    exportedAt: new Date().toISOString(),
    facilities: getFacilities(),
    buildings: getBuildings(),
    floors: getFloors(),
    sections: getSections(),
    rooms: getRooms(),
    assets: getAssets(),
    assetMappings: [], // reserved: per-asset mapping snapshot, tracked via mappingHistory today
    locationMappings: getLocationMappings(),
    mappingHistory: getMappingHistory(),
    sectionHistory: getSectionHistory(),
    qcRecords: getQcRecords(),
    researchRecords: getResearchRecords(),
    importStatus: getImportStatus(),
  };
  saveImportStatus({ lastBackupExport: backup.exportedAt });
  return backup;
}

// Confirms a parsed object looks like a real QCOD backup before anything
// gets written to localStorage. Every array field must actually be an
// array (or simply absent) — a backup with the wrong shape is rejected
// wholesale rather than applied field-by-field.
export function validateBackupShape(backup) {
  const errors = [];
  if (!backup || typeof backup !== 'object') {
    return { valid: false, errors: ['File is not a valid JSON object.'] };
  }
  if (!backup.version) errors.push('Missing "version" field.');
  BACKUP_ARRAY_FIELDS.forEach((field) => {
    if (field in backup && !Array.isArray(backup[field])) {
      errors.push(`Field "${field}" must be an array.`);
    }
  });
  if ('importStatus' in backup && (typeof backup.importStatus !== 'object' || backup.importStatus === null || Array.isArray(backup.importStatus))) {
    errors.push('Field "importStatus" must be an object.');
  }
  return { valid: errors.length === 0, errors };
}

export function importQcodBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        const { valid, errors } = validateBackupShape(backup);
        if (!valid) {
          reject(new Error(`Backup file rejected — ${errors.join(' ')}`));
          return;
        }
        if (Array.isArray(backup.facilities)) saveLocalData(LOCAL_KEYS.facilities, backup.facilities);
        if (Array.isArray(backup.buildings)) saveLocalData(LOCAL_KEYS.buildings, backup.buildings);
        if (Array.isArray(backup.floors)) saveLocalData(LOCAL_KEYS.floors, backup.floors);
        if (Array.isArray(backup.sections)) saveLocalData(LOCAL_KEYS.sectionProgress, backup.sections);
        else if (Array.isArray(backup.sectionProgress)) saveLocalData(LOCAL_KEYS.sectionProgress, backup.sectionProgress); // v0.1 compatibility
        if (Array.isArray(backup.rooms)) saveLocalData(LOCAL_KEYS.rooms, backup.rooms);
        if (Array.isArray(backup.assets)) saveLocalData(LOCAL_KEYS.assets, backup.assets);
        if (Array.isArray(backup.locationMappings)) saveLocalData(LOCAL_KEYS.locationMappings, backup.locationMappings);
        if (Array.isArray(backup.mappingHistory)) saveLocalData(LOCAL_KEYS.mappingHistory, backup.mappingHistory);
        if (Array.isArray(backup.sectionHistory)) saveLocalData(LOCAL_KEYS.sectionHistory, backup.sectionHistory);
        if (Array.isArray(backup.qcRecords)) saveLocalData(LOCAL_KEYS.qcRecords, backup.qcRecords);
        if (Array.isArray(backup.researchRecords)) saveLocalData(LOCAL_KEYS.researchRecords, backup.researchRecords);
        if (Array.isArray(backup.qcPreview)) saveLocalData(LOCAL_KEYS.qcPreview, backup.qcPreview);
        if (Array.isArray(backup.researchPreview)) saveLocalData(LOCAL_KEYS.researchPreview, backup.researchPreview);
        if (backup.importStatus) saveLocalData(LOCAL_KEYS.importStatus, backup.importStatus);
        resolve(backup);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read backup file'));
    reader.readAsText(file);
  });
}

// Returns null (meaning "Pending") when the denominator is unknown or zero.
// Never silently reports 0% for a total we don't actually have yet.
export function pct(value, total) {
  if (!total || total <= 0) return null;
  return Math.round((value / total) * 100);
}

// Display helpers — a null/undefined/zero value renders as "Pending",
// never as 0, NaN, or 0 of 0.
export function fmtNum(value) {
  return value === null || value === undefined || value === 0 ? 'Pending' : value.toLocaleString();
}

export function fmtPct(value) {
  return value === null || value === undefined || Number.isNaN(value) ? 'Pending' : `${value}%`;
}

// ---- Facility / building / floor / section lookups ----

export function getBuildingsForFacility(facilityId) {
  return getBuildings().filter((b) => b.facilityId === facilityId);
}

export function getConfiguredBuildings() {
  return getBuildings().filter((b) => b.configured);
}

export function getBuilding(buildingId) {
  return getBuildings().find((b) => b.id === buildingId);
}

export function getFloorsForBuilding(buildingId) {
  return getFloors().filter((f) => f.buildingId === buildingId);
}

export function getSectionsForBuilding(buildingId) {
  return getSections().filter((s) => s.buildingId === buildingId);
}

export function getSectionsForFloor(floorId) {
  return getSections().filter((s) => s.floorId === floorId);
}

export function getRoomsForSection(sectionId) {
  return getRooms().filter((r) => r.sectionId === sectionId);
}

export function getAssetsForBuilding(buildingId) {
  return getAssets().filter((a) => a.buildingId === buildingId);
}

export function getAssetsForFloor(floorId) {
  return getAssets().filter((a) => a.floorId === floorId);
}

export function getAssetsForSection(sectionId) {
  return getAssets().filter((a) => a.sectionId === sectionId);
}

export function getFloorName(floorId) {
  return getFloors().find((f) => f.id === floorId)?.name ?? floorId;
}

// ---- Aggregate totals ----

// Average completionPct across a set of sections. Empty set -> 0 (a real
// zero, not "Pending" — there is nothing configured yet to be pending on).
function averageCompletion(sectionList) {
  if (sectionList.length === 0) return 0;
  return Math.round(sectionList.reduce((s, sec) => s + (sec.completionPct || 0), 0) / sectionList.length);
}

export function getProjectTotals() {
  // Only buildings with configured section data count toward asset totals —
  // unconfigured campus buildings must not drag known totals toward zero.
  const configured = getConfiguredBuildings();
  const expected = configured.reduce((s, b) => s + b.expectedAssets, 0);
  const found = configured.reduce((s, b) => s + b.foundAssets, 0);
  const manualTagged = configured.reduce((s, b) => s + b.taggedAssets, 0);
  const mappedTagged = getMappedAssets().length;
  const tagged = mappedTagged > 0 ? mappedTagged : manualTagged;
  const sectionProgress = averageCompletion(getSections());
  return { expected, found, tagged, sectionProgress };
}

export function getBuildingTotals(buildingId) {
  const building = getBuilding(buildingId);
  const buildingSections = getSectionsForBuilding(buildingId);
  const mappedTagged = getAssetCountForBuilding(buildingId);
  return {
    expected: building?.expectedAssets ?? 0,
    found: building?.foundAssets ?? 0,
    // A building's own manual taggedAssets field is only a placeholder until
    // real assets are mapped to it — once assets carry this buildingId,
    // those explicitly-mapped counts take over automatically.
    tagged: mappedTagged > 0 ? mappedTagged : (building?.taggedAssets ?? 0),
    sectionProgress: averageCompletion(buildingSections),
    sectionCount: buildingSections.length,
    floorCount: getFloorsForBuilding(buildingId).length,
  };
}

export function getFloorTotals(floorId) {
  const floor = getFloors().find((f) => f.id === floorId);
  const floorSections = getSectionsForFloor(floorId);
  const mappedTagged = getAssetCountForFloor(floorId);
  return {
    expected: floor?.expectedAssets ?? 0,
    found: floor?.foundAssets ?? 0,
    tagged: mappedTagged > 0 ? mappedTagged : (floor?.taggedAssets ?? 0),
    sectionProgress: averageCompletion(floorSections),
    sectionCount: floorSections.length,
  };
}

export function getStatusCounts(sectionList = getSections()) {
  return {
    completed: sectionList.filter((s) => s.status === 'completed').length,
    return_needed: sectionList.filter((s) => s.status === 'return_needed').length,
    no_access: sectionList.filter((s) => s.status === 'no_access').length,
    not_started: sectionList.filter((s) => s.status === 'not_started').length,
    in_progress: sectionList.filter((s) => s.status === 'in_progress').length,
  };
}

export function getOutstandingSections(sectionList = getSections()) {
  return sectionList.filter((s) => s.status === 'return_needed' || s.status === 'no_access');
}

export function getCampusSummary() {
  const sections = getSections();
  const buildings = getBuildings();
  const buildingsConfigured = getConfiguredBuildings().length;
  const buildingsInProgress = buildings.filter((b) => b.status === 'in_progress').length;
  const buildingsComplete = buildings.filter((b) => b.status === 'completed').length;
  const floorsConfigured = getFloors().length;
  const sectionsConfigured = sections.length;
  const statusCounts = getStatusCounts(sections);
  return {
    buildingsConfigured,
    buildingsInProgress,
    buildingsComplete,
    floorsConfigured,
    sectionsConfigured,
    sectionsComplete: statusCounts.completed,
    returnNeeded: statusCounts.return_needed,
    noAccess: statusCounts.no_access,
  };
}

// ---- Imported asset helpers ----
// Asset totals only ever come from imported asset data (local, then bundled
// as a fallback). A blank/invalid asset number never counts as valid, and an
// asset is only "mapped" once it carries a real buildingId — we never infer
// a mapping from free-text location names.

export function getValidAssets() {
  return getAssets().filter((a) => (a.assetNumber ?? '').toString().trim() !== '');
}

export function getMappedAssets() {
  return getValidAssets().filter((a) => (a.buildingId ?? '').toString().trim() !== '');
}

export function getUnmappedAssets() {
  return getValidAssets().filter((a) => (a.buildingId ?? '').toString().trim() === '');
}

export function getAssetIssueCounts() {
  const valid = getValidAssets();
  const hasIssue = (a, type) => Array.isArray(a.issueTypes) && a.issueTypes.includes(type);
  return {
    missingSerialNumber: valid.filter((a) => hasIssue(a, 'missing_serial_number')).length,
    notFoundInDatabase: valid.filter((a) => hasIssue(a, 'not_found_in_db')).length,
    newAssetOfflineSync: valid.filter((a) => hasIssue(a, 'new_asset_offline_sync')).length,
  };
}

// Counts of explicitly-mapped assets for a given scope. Never guessed from
// Location Name — an asset only counts here once it carries a real
// buildingId/floorId/sectionId (set by hand or a future mapping step).
export function getAssetCountForBuilding(buildingId) {
  return getMappedAssets().filter((a) => a.buildingId === buildingId).length;
}

export function getAssetCountForFloor(floorId) {
  return getMappedAssets().filter((a) => a.floorId === floorId).length;
}

export function getAssetCountForSection(sectionId) {
  return getMappedAssets().filter((a) => a.sectionId === sectionId).length;
}

// ---- Asset mapping ----
// Assigns imported assets to a Facility/Building/Floor/Section/Room. This is
// always an explicit human action — nothing here ever runs automatically.
// Every application is written to qcod-mapping-history and history is never
// overwritten, only appended to, so there's a full audit trail of who/what
// changed an asset's location over time.

function normalizeLocationName(loc) {
  return (loc ?? '').toString().trim().toLowerCase();
}

function mappingFieldsFor(entity) {
  return {
    facilityId: entity?.facilityId || '',
    buildingId: entity?.buildingId || '',
    floorId: entity?.floorId || '',
    sectionId: entity?.sectionId || '',
    roomId: entity?.roomId || '',
  };
}

// Groups unmapped assets by identical normalized Location Name and surfaces
// any prior approved mapping for that same name — a suggestion only. The
// caller must still call approveLocationMapping/applyAssetMappings
// explicitly; nothing here writes any data.
export function getLocationMappingSuggestions() {
  const unmapped = getUnmappedAssets();
  const groups = {};
  unmapped.forEach((a) => {
    const key = normalizeLocationName(a.locationName);
    if (!key) return;
    if (!groups[key]) {
      groups[key] = { locationNameNormalized: key, locationNameSample: a.locationName, count: 0, assetNumbers: [] };
    }
    groups[key].count += 1;
    groups[key].assetNumbers.push(a.assetNumber);
  });
  const approved = getLocationMappings();
  return Object.values(groups).map((g) => ({
    ...g,
    priorApprovedMapping: approved.find((m) => m.locationNameNormalized === g.locationNameNormalized) || null,
  }));
}

// Records an approved Location Name -> hierarchy mapping for future
// suggestions. This does not touch any asset by itself.
export function approveLocationMapping(locationNameRaw, mapping) {
  const locationNameNormalized = normalizeLocationName(locationNameRaw);
  const existing = getLocationMappings().filter((m) => m.locationNameNormalized !== locationNameNormalized);
  const entry = {
    locationNameNormalized,
    ...mappingFieldsFor(mapping),
    approvedAt: new Date().toISOString(),
  };
  saveLocalData(LOCAL_KEYS.locationMappings, [...existing, entry]);
  return entry;
}

// Applies a Facility/Building/Floor/Section/Room mapping to one or more
// assets (by assetNumber). Blank fields in `mapping` leave the asset's
// existing value untouched unless `force` is set (used by Clear Mapping,
// which intentionally blanks every field). Every change appends a record
// to mapping history — history is never overwritten.
export function applyAssetMappings(assetNumbers, mapping, source = 'manual', { force = false } = {}) {
  const assets = getAssets();
  const history = getMappingHistory();
  const newHistoryEntries = [];

  const updated = assets.map((a) => {
    if (!assetNumbers.includes(a.assetNumber)) return a;
    const previousMapping = mappingFieldsFor(a);
    const newMapping = force
      ? mappingFieldsFor(mapping)
      : {
          facilityId: mapping.facilityId || previousMapping.facilityId,
          buildingId: mapping.buildingId || previousMapping.buildingId,
          floorId: mapping.floorId || previousMapping.floorId,
          sectionId: mapping.sectionId || previousMapping.sectionId,
          roomId: mapping.roomId || previousMapping.roomId,
        };

    newHistoryEntries.push({
      id: `${a.assetNumber || 'asset'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      assetNumber: a.assetNumber,
      previousMapping,
      newMapping,
      mappedAt: new Date().toISOString(),
      source,
    });

    return { ...a, ...newMapping };
  });

  saveLocalData(LOCAL_KEYS.assets, updated);
  saveLocalData(LOCAL_KEYS.mappingHistory, [...history, ...newHistoryEntries]);
  return { updatedCount: newHistoryEntries.length };
}

export function clearAssetMapping(assetNumbers, source = 'manual') {
  return applyAssetMappings(assetNumbers, {}, source, { force: true });
}
