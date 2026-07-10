import project from '../../../data/project.json';
import facilities from '../../../data/facilities.json';
import buildings from '../../../data/buildings.json';
import floors from '../../../data/floors.json';
import sections from '../../../data/sections.json';
import rooms from '../../../data/rooms.json';
import assets from '../../../data/assets.json';
import statuses from '../../../data/statuses.json';

export { project, facilities, buildings, floors, sections, rooms, assets, statuses };

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
  return sections.filter((s) => s.buildingId === buildingId);
}

export function getSectionsForFloor(floorId) {
  return sections.filter((s) => s.floorId === floorId);
}

export function getRoomsForSection(sectionId) {
  return rooms.filter((r) => r.sectionId === sectionId);
}

export function getAssetsForBuilding(buildingId) {
  return assets.filter((a) => a.buildingId === buildingId);
}

export function getAssetsForFloor(floorId) {
  return assets.filter((a) => a.floorId === floorId);
}

export function getAssetsForSection(sectionId) {
  return assets.filter((a) => a.sectionId === sectionId);
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
  const tagged = configured.reduce((s, b) => s + b.taggedAssets, 0);
  const sectionProgress = averageCompletion(sections);
  return { expected, found, tagged, sectionProgress };
}

export function getBuildingTotals(buildingId) {
  const building = getBuilding(buildingId);
  const buildingSections = getSectionsForBuilding(buildingId);
  return {
    expected: building?.expectedAssets ?? 0,
    found: building?.foundAssets ?? 0,
    tagged: building?.taggedAssets ?? 0,
    sectionProgress: averageCompletion(buildingSections),
    sectionCount: buildingSections.length,
    floorCount: getFloorsForBuilding(buildingId).length,
  };
}

export function getFloorTotals(floorId) {
  const floor = floors.find((f) => f.id === floorId);
  const floorSections = getSectionsForFloor(floorId);
  return {
    expected: floor?.expectedAssets ?? 0,
    found: floor?.foundAssets ?? 0,
    tagged: floor?.taggedAssets ?? 0,
    sectionProgress: averageCompletion(floorSections),
    sectionCount: floorSections.length,
  };
}

export function getStatusCounts(sectionList = sections) {
  return {
    completed: sectionList.filter((s) => s.status === 'completed').length,
    return_needed: sectionList.filter((s) => s.status === 'return_needed').length,
    no_access: sectionList.filter((s) => s.status === 'no_access').length,
    not_started: sectionList.filter((s) => s.status === 'not_started').length,
    in_progress: sectionList.filter((s) => s.status === 'in_progress').length,
  };
}

export function getOutstandingSections(sectionList = sections) {
  return sectionList.filter((s) => s.status === 'return_needed' || s.status === 'no_access');
}

export function getCampusSummary() {
  const buildingsConfigured = getConfiguredBuildings().length;
  const buildingsInProgress = buildings.filter((b) => b.status === 'in_progress').length;
  const buildingsComplete = buildings.filter((b) => b.status === 'completed').length;
  const floorsConfigured = floors.length;
  const sectionsConfigured = sections.length;
  const statusCounts = getStatusCounts();
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
