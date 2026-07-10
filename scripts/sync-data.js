/**
 * Builds sections.json, floors.json, and buildings.json from directory.json
 * and floor map completion data. Run after updating department or map data.
 *
 *   npm run sync:data
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

const directory = JSON.parse(readFileSync(join(dataDir, 'directory.json'), 'utf8'));
const floorMaps = JSON.parse(readFileSync(join(dataDir, 'floor-maps.json'), 'utf8'));

const STATUS_PCT = {
  completed: 100,
  return_needed: 70,
  no_access: 40,
  in_progress: 50,
  not_started: 0,
};

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

function floorKey(floor) {
  return floor === 'B' || floor === 'b' ? '500-B' : `500-${floor}`;
}

function deriveAssets(completionPct, placeholder = 100) {
  const expected = placeholder;
  const tagged = Math.round(expected * completionPct / 100);
  const found = Math.round(tagged * (completionPct >= 100 ? 1 : 1.05));
  return { expectedAssets: expected, foundAssets: Math.min(found, expected), taggedAssets: tagged };
}

function floorStatus(sections) {
  const counts = { completed: 0, return_needed: 0, no_access: 0, in_progress: 0, not_started: 0 };
  sections.forEach((s) => counts[s.status]++);
  if (counts.not_started === sections.length) return 'not_started';
  if (counts.completed === sections.length) return 'completed';
  if (counts.no_access > 0) return 'in_progress';
  return 'in_progress';
}

const sections = directory.map((dept) => {
  const floorId = floorKey(dept.floor);
  const id = `${floorId}-${slug(dept.name)}`;
  const completionPct = dept.completionPct ?? STATUS_PCT[dept.status] ?? 0;
  const assets = deriveAssets(completionPct);

  return {
    id,
    floorId,
    buildingId: '500',
    name: dept.name,
    ...assets,
    completionPct,
    assetCompletionPct: completionPct,
    status: dept.status,
    notes: dept.notes ?? '',
    lastUpdate: dept.lastUpdate ?? '',
  };
});

const floorIds = [...new Set(sections.map((s) => s.floorId))];
const floors = floorIds
  .map((id) => {
    const meta = floorMaps[id] ?? { name: id, level: 0 };
    const floorSections = sections.filter((s) => s.floorId === id);
    const expectedAssets = floorSections.reduce((s, x) => s + x.expectedAssets, 0);
    const foundAssets = floorSections.reduce((s, x) => s + x.foundAssets, 0);
    const taggedAssets = floorSections.reduce((s, x) => s + x.taggedAssets, 0);

    return {
      id,
      buildingId: '500',
      name: meta.name,
      level: meta.level,
      expectedAssets,
      foundAssets,
      taggedAssets,
      mapCompletionPct: meta.mapCompletionPct ?? 0,
      mapNotes: meta.mapNotes ?? '',
      status: floorStatus(floorSections),
    };
  })
  .sort((a, b) => a.level - b.level);

const buildings = [{
  id: '500',
  name: 'Building 500 — Main Hospital',
  description: 'Martinsburg VA Medical Center, Martinsburg, WV',
  expectedAssets: floors.reduce((s, f) => s + f.expectedAssets, 0),
  foundAssets: floors.reduce((s, f) => s + f.foundAssets, 0),
  taggedAssets: floors.reduce((s, f) => s + f.taggedAssets, 0),
  status: 'in_progress',
}];

writeFileSync(join(dataDir, 'sections.json'), JSON.stringify(sections, null, 2) + '\n');
writeFileSync(join(dataDir, 'floors.json'), JSON.stringify(floors, null, 2) + '\n');
writeFileSync(join(dataDir, 'buildings.json'), JSON.stringify(buildings, null, 2) + '\n');

console.log(`Synced ${sections.length} sections across ${floors.length} floors.`);
