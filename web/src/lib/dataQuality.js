/**
 * Data Quality Center detection logic. Every check is read-only — this
 * module never mutates or deletes anything, only reports issues for a human
 * to act on elsewhere in the app.
 */
import { classifyAssetNumber } from './fileImport.js';
import { parseEnexLocation } from './enexLocationParser.js';

function issue(category, severity, recordType, recordId, description, suggestedCorrection, relatedImportId = '') {
  return { category, severity, recordType, recordId, description, suggestedCorrection, relatedImportId };
}

export function runDataQualityChecks({
  facilities = [], buildings = [], floors = [], sections = [], rooms = [], assets = [],
  qcRecords = [], researchRecords = [], aliases = [], rules = [],
} = {}) {
  const issues = [];

  const facilityIds = new Set(facilities.map((f) => f.id));
  const buildingIds = new Set(buildings.map((b) => b.id));
  const floorIds = new Set(floors.map((f) => f.id));
  const sectionIds = new Set(sections.map((s) => s.id));
  const roomIds = new Set(rooms.map((r) => r.id));
  const assetNumbers = new Set(assets.map((a) => a.assetNumber));

  // ---- Asset-level checks ----
  const assetNumberCounts = new Map();
  const serialCounts = new Map();
  assets.forEach((a) => {
    if (a.assetNumber) assetNumberCounts.set(a.assetNumber, (assetNumberCounts.get(a.assetNumber) || 0) + 1);
    if (a.serialNumber) serialCounts.set(a.serialNumber, (serialCounts.get(a.serialNumber) || 0) + 1);
  });

  assets.forEach((a) => {
    const { kind } = classifyAssetNumber(a.assetNumber);
    if (kind === 'unrecognized') {
      issues.push(issue('invalid_asset_number', 'medium', 'asset', a.assetNumber, `Asset number "${a.assetNumber}" does not match the known 613 EE format`, 'Verify the asset number against AssetWorx and correct or re-scan'));
    }
    if (!a.serialNumber) {
      issues.push(issue('missing_serial_number', 'low', 'asset', a.assetNumber, 'Asset has no serial number', 'Locate the serial number on the physical asset or in AssetWorx'));
    }
    if (a.assetNumber && assetNumberCounts.get(a.assetNumber) > 1) {
      issues.push(issue('duplicate_asset_number', 'high', 'asset', a.assetNumber, `Asset number appears ${assetNumberCounts.get(a.assetNumber)} times`, 'Investigate whether this is one asset scanned twice or a real numbering conflict'));
    }
    if (a.serialNumber && serialCounts.get(a.serialNumber) > 1) {
      issues.push(issue('duplicate_serial_number', 'high', 'asset', a.assetNumber, `Serial number "${a.serialNumber}" appears on ${serialCounts.get(a.serialNumber)} assets`, 'Verify serial numbers were scanned correctly'));
    }
    if (!a.description) {
      issues.push(issue('missing_description', 'low', 'asset', a.assetNumber, 'Asset has no description', 'Add a description from AssetWorx or a physical inspection'));
    }
    if (!a.rawLocation && !a.locationName) {
      issues.push(issue('missing_location', 'medium', 'asset', a.assetNumber, 'Asset has no location information at all', 'Re-scan the asset with a location, or manually map it'));
    }
    if (a.rawLocation) {
      const parsed = parseEnexLocation(a.rawLocation);
      if (parsed.invalid) {
        issues.push(issue('invalid_location_format', 'medium', 'asset', a.assetNumber, `Raw location "${a.rawLocation}" does not match the expected ENEX format`, 'Review in Location Mapping'));
      }
    }
    if (a.roomId && !roomIds.has(a.roomId)) {
      issues.push(issue('asset_mapped_to_missing_room', 'high', 'asset', a.assetNumber, `Asset is mapped to room "${a.roomId}", which no longer exists`, 'Re-map the asset via Asset Mapping or Location Mapping'));
    }
    if (a.sectionId && !sectionIds.has(a.sectionId)) {
      issues.push(issue('invalid_hierarchy', 'high', 'asset', a.assetNumber, `Asset references section "${a.sectionId}", which does not exist`, 'Re-map the asset to a valid section'));
    }
  });

  // ---- Hierarchy integrity checks ----
  rooms.forEach((r) => {
    if (r.sectionId && !sectionIds.has(r.sectionId)) {
      issues.push(issue('room_mapped_to_missing_section', 'high', 'room', r.id, `Room references section "${r.sectionId}", which does not exist`, 'Reassign the room via Room Assignment'));
    }
  });
  sections.forEach((s) => {
    if (s.floorId && !floorIds.has(s.floorId)) {
      issues.push(issue('section_mapped_to_missing_floor', 'high', 'section', s.id, `Section references floor "${s.floorId}", which does not exist`, 'Correct via Configuration'));
    }
  });
  floors.forEach((f) => {
    if (f.buildingId && !buildingIds.has(f.buildingId)) {
      issues.push(issue('floor_mapped_to_missing_building', 'high', 'floor', f.id, `Floor references building "${f.buildingId}", which does not exist`, 'Correct via Configuration'));
    }
  });
  buildings.forEach((b) => {
    if (b.facilityId && !facilityIds.has(b.facilityId)) {
      issues.push(issue('building_mapped_to_missing_facility', 'high', 'building', b.id, `Building references facility "${b.facilityId}", which does not exist`, 'Correct via Configuration'));
    }
  });

  // ---- Orphaned records ----
  qcRecords.forEach((q) => {
    if (q.assetNumber && !assetNumbers.has(q.assetNumber)) {
      issues.push(issue('orphaned_qc_record', 'medium', 'qc', q.id, `QC record references asset "${q.assetNumber}", which no longer exists`, 'Close or reconcile this QC record', q.importId));
    }
  });
  researchRecords.forEach((r) => {
    if (r.assetNumber && !assetNumbers.has(r.assetNumber)) {
      issues.push(issue('orphaned_research_record', 'medium', 'research', r.id, `Research record references asset "${r.assetNumber}", which no longer exists`, 'Close or reconcile this Research record', r.importId));
    }
  });

  // ---- Conflicting aliases ----
  const aliasByLocation = new Map();
  aliases.forEach((a) => {
    if (!a.approved) return;
    const key = `${a.facilityId}::${a.rawLocationNormalized}`;
    if (!aliasByLocation.has(key)) aliasByLocation.set(key, []);
    aliasByLocation.get(key).push(a);
  });
  aliasByLocation.forEach((group, key) => {
    const distinctRooms = new Set(group.map((a) => a.roomId));
    if (distinctRooms.size > 1) {
      issues.push(issue('conflicting_alias', 'high', 'alias', key, `Location "${key}" has ${distinctRooms.size} conflicting approved aliases pointing to different rooms`, 'Disable all but one alias in Location Mapping'));
    }
  });

  // ---- Conflicting parser rules ----
  const rulesByTriple = new Map();
  rules.forEach((r) => {
    if (!r.approved) return;
    const key = `${r.facilityId}::${r.buildingId}::${r.departmentPrefix}::${r.zoneLetter}`;
    if (!rulesByTriple.has(key)) rulesByTriple.set(key, []);
    rulesByTriple.get(key).push(r);
  });
  rulesByTriple.forEach((group, key) => {
    if (group.length > 1) {
      // Overlapping room patterns on the same department+zone combination —
      // flagged even without deep regex-overlap analysis, since any two
      // approved rules on the exact same triple risk resolving inconsistently.
      issues.push(issue('conflicting_parser_rule', 'high', 'rule', key, `${group.length} approved parser rules exist for the same department/zone combination "${key}"`, 'Disable all but one rule in Location Mapping'));
    }
  });

  return issues;
}
