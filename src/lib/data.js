import project from '../../../data/project.json';
import facilities from '../../../data/facilities.json';
import buildings from '../../../data/buildings.json';
import floors from '../../../data/floors.json';
import bundledSections from '../../../data/sections.json';
import rooms from '../../../data/rooms.json';
import bundledAssets from '../../../data/assets.json';
import statuses from '../../../data/statuses.json';
import bundledImportStatus from '../../../data/import-status.json';

export { project, facilities, buildings, floors, rooms, statuses };

// ---- Local persistence ----
// QCOD is local-only: imported data lives in this browser's localStorage and
// overrides the bundled JSON snapshot whenever it's present. Nothing here
// ever makes a network request. The bundled JSON always remains the
// fallback, so the app still works the first time it's opened.

export const LOCAL_KEYS = {
  assets: 'qcod-assets',
  sectionProgress: 'qcod-section-progress',
  qcPreview: 'qcod-qc-preview',
  researchPreview: 'qcod-research-preview',
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

// ---- Backup / restore ----

export function exportQcodBackup() {
  const backup = {
    version: '0.1',
    exportedAt: new Date().toISOString(),
    assets: getAssets(),
    sectionProgress: getSections(),
    qcPreview: getQcPreview(),
    researchPreview: getResearchPreview(),
    importStatus: getImportStatus(),
  };
  saveImportStatus({ lastBackupExport: backup.exportedAt });
  return backup;
}

export function importQcodBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        if (!backup || typeof backup !== 'object') throw new Error('Not a valid QCOD backup file.');
        if (Array.isArray(backup.assets)) saveLocalData(LOCAL_KEYS.assets, backup.assets);
        if (Array.isArray(backup.sectionProgress)) saveLocalData(LOCAL_KEYS.sectionProgress, backup.sectionProgress);
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

export function getFacilities() {
  return facilities;
}

export function getBuildingsForFacility(facilityId) {
  return buildings.filter((b) => b.facilityId === facilityId);
}

export function getConfiguredBuildings() {
  return buildings.filter((b) => b.configured);
}

export function getBuilding(buildingId) {
  return buildings.find((b) => b.id === buildingId);
}

export function getFloorsForBuilding(buildingId) {
  return floors.filter((f) => f.buildingId === buildingId);
}

export function getSectionsForBuilding(buildingId) {
  return getSections().filter((s) => s.buildingId === buildingId);
}

export function getSectionsForFloor(floorId) {
  return getSections().filter((s) => s.floorId === floorId);
}

export function getRoomsForSection(sectionId) {
  return rooms.filter((r) => r.sectionId === sectionId);
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
  return floors.find((f) => f.id === floorId)?.name ?? floorId;
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
  const floor = floors.find((f) => f.id === floorId);
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
  const buildingsConfigured = getConfiguredBuildings().length;
  const buildingsInProgress = buildings.filter((b) => b.status === 'in_progress').length;
  const buildingsComplete = buildings.filter((b) => b.status === 'completed').length;
  const floorsConfigured = floors.length;
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
