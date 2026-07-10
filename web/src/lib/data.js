import project from '../../../data/project.json';
import buildings from '../../../data/buildings.json';
import floors from '../../../data/floors.json';
import sections from '../../../data/sections.json';
import statuses from '../../../data/statuses.json';

export { project, buildings, floors, sections, statuses };

export function pct(num, den) {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

export function getProjectTotals() {
  const expected = buildings.reduce((s, b) => s + b.expectedAssets, 0);
  const found = buildings.reduce((s, b) => s + b.foundAssets, 0);
  const tagged = buildings.reduce((s, b) => s + b.taggedAssets, 0);
  return { expected, found, tagged };
}

export function getStatusCounts() {
  return {
    completed: sections.filter((s) => s.status === 'completed').length,
    return_needed: sections.filter((s) => s.status === 'return_needed').length,
    no_access: sections.filter((s) => s.status === 'no_access').length,
    not_started: sections.filter((s) => s.status === 'not_started').length,
    in_progress: sections.filter((s) => s.status === 'in_progress').length,
  };
}

export function getSectionsForFloor(floorId) {
  return sections.filter((s) => s.floorId === floorId);
}

export function getOutstandingSections() {
  return sections.filter((s) => s.status === 'return_needed' || s.status === 'no_access');
}

export function getFloorName(floorId) {
  return floors.find((f) => f.id === floorId)?.name ?? floorId;
}
