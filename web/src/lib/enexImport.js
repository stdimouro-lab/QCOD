/**
 * Core ENEX/AssetWorx import pipeline logic. Pure functions — no
 * localStorage access here — so every rule (dedup, issue detection, replace
 * vs merge, progress rollups) can be unit tested directly. The browser-facing
 * wiring (reading localStorage, writing results) lives in ImportCenter.jsx
 * and data.js, which call these functions.
 */
import { classifyAssetNumber } from './fileImport.js';
import { resolveEnexLocation } from './enexLocationParser.js';

// ---- Row-level processing ----

const ISSUE_TYPES = {
  MISSING_SERIAL: 'missing_serial_number',
  MISSING_LOCATION: 'missing_location',
  INVALID_LOCATION_FORMAT: 'invalid_location_format',
  UNMATCHED_ROOM: 'unmatched_room',
  MULTIPLE_ROOM_MATCHES: 'multiple_room_matches',
  NOT_FOUND_IN_DB: 'not_found_in_db',
  NEW_ASSET_FOUND: 'new_asset_found',
  OFFLINE_SYNC: 'offline_sync',
  DUPLICATE_ASSET_NUMBER: 'duplicate_asset_number',
  DUPLICATE_SERIAL_NUMBER: 'duplicate_serial_number',
  MISSING_DESCRIPTION: 'missing_description',
  INVALID_HIERARCHY: 'invalid_hierarchy',
};

/**
 * Processes one AssetWorx/ENEX row: validates the asset number (excluding
 * "613 E..." scanner misreads entirely — those never become Research), and
 * resolves its location to an official room, never guessing a floor.
 *
 * @returns { included, scanError, asset, issues } — `included: false` means
 *   this row should not be counted as a valid asset at all (blank or
 *   scanner-misread asset number).
 */
export function processEnexAssetRow(row, context) {
  const { facilityId, buildingId, rooms = [], aliases = [], rules = [] } = context;
  const { value: assetNumber, kind } = classifyAssetNumber(row.assetNumber);

  if (kind === 'scan_error') {
    return { included: false, scanError: true, asset: null, issues: [] };
  }
  if (kind === 'blank') {
    return { included: false, scanError: false, asset: null, issues: [] };
  }

  const issues = [];
  const serialNumber = (row.serialNumber ?? '').toString().trim();
  const description = (row.description ?? '').toString().trim();
  const rawLocation = (row.rawLocation ?? '').toString().trim();
  const disposalStatus = (row.disposalStatus ?? '').toString().toLowerCase();

  if (!serialNumber) issues.push(ISSUE_TYPES.MISSING_SERIAL);
  if (!description) issues.push(ISSUE_TYPES.MISSING_DESCRIPTION);
  if (disposalStatus.includes('not found')) issues.push(ISSUE_TYPES.NOT_FOUND_IN_DB);
  if (disposalStatus.includes('new asset')) issues.push(ISSUE_TYPES.NEW_ASSET_FOUND);
  if (disposalStatus.includes('offline sync')) issues.push(ISSUE_TYPES.OFFLINE_SYNC);

  let resolution = null;
  let mapping = { facilityId, buildingId: buildingId || '', floorId: '', sectionId: '', roomId: '' };

  if (!rawLocation) {
    issues.push(ISSUE_TYPES.MISSING_LOCATION);
  } else {
    resolution = resolveEnexLocation(rawLocation, { facilityId, rooms, aliases, rules });
    if (resolution.status === 'invalid_format') {
      issues.push(ISSUE_TYPES.INVALID_LOCATION_FORMAT);
    } else if (resolution.status === 'no_match') {
      issues.push(ISSUE_TYPES.UNMATCHED_ROOM);
    } else if (resolution.status === 'multiple_matches') {
      issues.push(ISSUE_TYPES.MULTIPLE_ROOM_MATCHES);
    } else if (resolution.status === 'matched') {
      // Only an alias/rule "matched" result safely assigns a room mapping.
      // "suggested" (single candidate) is intentionally left unmapped —
      // it still requires human approval before it becomes a real mapping.
      const room = rooms.find((r) => r.id === resolution.matchedRoomId);
      if (room) {
        // The room must belong to the building embedded in the ENEX code
        // itself (catches a stale alias/rule pointing at the wrong
        // building). If the caller also passed a fixed context building
        // (e.g. "this whole import is scoped to Building 500"), that's
        // checked too, but it's optional.
        const matchesParsedBuilding = (room.buildingId ?? '') === (resolution.parsed.buildingId ?? '');
        const matchesContextBuilding = !buildingId || (room.buildingId ?? '') === buildingId;
        if (!matchesParsedBuilding || !matchesContextBuilding) {
          issues.push(ISSUE_TYPES.INVALID_HIERARCHY);
        } else {
          mapping = {
            facilityId, buildingId: room.buildingId, floorId: room.floorId,
            sectionId: room.sectionId || '', roomId: room.id,
          };
        }
      }
    }
    // "suggested" status: no issue is pushed by itself — a single strong
    // suggestion isn't a data problem — but it's also not applied as a
    // mapping until a human approves it in Location Mapping Review.
  }

  return {
    included: true,
    scanError: false,
    asset: {
      assetNumber, serialNumber, description,
      locationName: row.locationName || '', cmr: row.cmr || '',
      lastInventoried: row.lastInventoried || '', lastObservedTime: row.lastObservedTime || '',
      disposalStatus: row.disposalStatus || '', rawLocation,
      ...mapping,
      issueTypes: issues,
    },
    resolution,
    issues,
  };
}

// ---- Duplicate detection within a single import batch ----

export function classifyDuplicates(assets) {
  const byNumber = new Map();
  const bySerial = new Map();
  assets.forEach((a) => {
    if (a.assetNumber) byNumber.set(a.assetNumber, (byNumber.get(a.assetNumber) || 0) + 1);
    if (a.serialNumber) bySerial.set(a.serialNumber, (bySerial.get(a.serialNumber) || 0) + 1);
  });

  return assets.map((a) => {
    const issues = [...(a.issueTypes || [])];
    if (a.assetNumber && byNumber.get(a.assetNumber) > 1 && !issues.includes(ISSUE_TYPES.DUPLICATE_ASSET_NUMBER)) {
      issues.push(ISSUE_TYPES.DUPLICATE_ASSET_NUMBER);
    }
    if (a.serialNumber && bySerial.get(a.serialNumber) > 1 && !issues.includes(ISSUE_TYPES.DUPLICATE_SERIAL_NUMBER)) {
      issues.push(ISSUE_TYPES.DUPLICATE_SERIAL_NUMBER);
    }
    return { ...a, issueTypes: issues };
  });
}

// ---- Replace-snapshot vs merge import modes ----

/**
 * Builds a plan for applying a new batch of assets against the existing set.
 * Replace mode: assets not present in the new snapshot are flagged as
 * "missing" (never silently deleted — the caller decides what to do).
 * Merge mode: existing assets not in the new batch are left untouched and
 * not flagged at all.
 */
export function buildImportPlan(existingAssets, newAssets, mode = 'replace_snapshot') {
  const existingByNumber = new Map(existingAssets.map((a) => [a.assetNumber, a]));
  const newByNumber = new Map(newAssets.map((a) => [a.assetNumber, a]));

  const created = newAssets.filter((a) => !existingByNumber.has(a.assetNumber));
  const updated = newAssets.filter((a) => existingByNumber.has(a.assetNumber));
  const missingFromSnapshot = mode === 'replace_snapshot'
    ? existingAssets.filter((a) => !newByNumber.has(a.assetNumber))
    : [];

  let finalAssets;
  if (mode === 'merge') {
    // Existing assets are kept; matched ones are overwritten with new data; new-only assets are appended.
    finalAssets = existingAssets.map((a) => newByNumber.get(a.assetNumber) || a);
    newAssets.forEach((a) => {
      if (!existingByNumber.has(a.assetNumber)) finalAssets.push(a);
    });
  } else {
    // Replace: the new snapshot IS the new asset list in full.
    finalAssets = newAssets;
  }

  return { created, updated, missingFromSnapshot, finalAssets };
}

// ---- Research record generation (Part 11) ----

const ISSUE_TO_RESEARCH_LABEL = {
  [ISSUE_TYPES.MISSING_SERIAL]: 'Missing serial number',
  [ISSUE_TYPES.MISSING_LOCATION]: 'Missing location',
  [ISSUE_TYPES.INVALID_LOCATION_FORMAT]: 'Invalid ENEX location format',
  [ISSUE_TYPES.UNMATCHED_ROOM]: 'Location has no matching official room',
  [ISSUE_TYPES.MULTIPLE_ROOM_MATCHES]: 'Location matches multiple rooms',
  [ISSUE_TYPES.NOT_FOUND_IN_DB]: 'Marked Not Found in DB',
  [ISSUE_TYPES.NEW_ASSET_FOUND]: 'New Asset Found',
  [ISSUE_TYPES.OFFLINE_SYNC]: 'Offline Sync',
  [ISSUE_TYPES.DUPLICATE_ASSET_NUMBER]: 'Duplicate asset number',
  [ISSUE_TYPES.DUPLICATE_SERIAL_NUMBER]: 'Duplicate serial number',
  [ISSUE_TYPES.MISSING_DESCRIPTION]: 'Missing description',
  [ISSUE_TYPES.INVALID_HIERARCHY]: 'Mapped room does not belong to expected building',
};

/**
 * Creates or updates Research records from processed import rows. Scanner
 * misreads never reach here (excluded upstream in processEnexAssetRow).
 * An asset that already has an OPEN Research record for a given issue type
 * gets that record updated, never duplicated.
 */
// Statuses that mean "this issue is still being worked" — a new import
// updates these in place rather than creating a duplicate. Resolved/Closed
// are terminal: if the same issue reappears after one of those, a NEW
// record is created (status "reopened"), and the old one is left untouched
// — that's the immutable history the spec requires.
const ACTIVE_RESEARCH_STATUSES = new Set(['open', 'in_review', 'waiting_for_information', 'reopened']);
const TERMINAL_RESEARCH_STATUSES = new Set(['resolved', 'closed']);

export function generateResearchRecords(processedAssets, existingRecords, { importId, facilityId }) {
  const records = existingRecords.map((r) => ({ ...r }));
  let created = 0;
  let updated = 0;
  let reopened = 0;

  processedAssets.forEach(({ asset, issues }) => {
    issues.forEach((issueType) => {
      const existingActive = records.find(
        (r) => r.assetNumber === asset.assetNumber && r.issueType === issueType && ACTIVE_RESEARCH_STATUSES.has(r.status)
      );
      if (existingActive) {
        existingActive.importId = importId;
        existingActive.sourceImportId = importId;
        existingActive.rawLocation = asset.rawLocation;
        existingActive.lastUpdated = new Date().toISOString();
        existingActive.notes = ISSUE_TO_RESEARCH_LABEL[issueType] || issueType;
        updated += 1;
        return;
      }

      const hadTerminalRecord = records.some(
        (r) => r.assetNumber === asset.assetNumber && r.issueType === issueType && TERMINAL_RESEARCH_STATUSES.has(r.status)
      );
      if (hadTerminalRecord) reopened += 1;

      records.push({
        id: `research-${asset.assetNumber}-${issueType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: 'enex_import',
        importId,
        sourceImportId: importId,
        facilityId: asset.facilityId || facilityId,
        buildingId: asset.buildingId || '',
        floorId: asset.floorId || '',
        sectionId: asset.sectionId || '',
        roomId: asset.roomId || '',
        assetNumber: asset.assetNumber,
        serialNumber: asset.serialNumber,
        rawLocation: asset.rawLocation,
        description: asset.description,
        issueType,
        status: hadTerminalRecord ? 'reopened' : 'open',
        priority: 'normal',
        assignedTo: '',
        resolution: '',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        resolvedAt: '',
        resolutionNotes: '',
        notes: ISSUE_TO_RESEARCH_LABEL[issueType] || issueType,
      });
      created += 1;
    });
  });

  return { records, created, updated, reopened };
}

// ---- QC record generation (Part 12) ----

/**
 * Generates QC records for specific conditions only — not every imported
 * asset. `previousAssetsByNumber` (a Map) lets this detect "reappeared
 * after missing", "mapping changed", etc.
 */
// "Closed" is the only terminal status here — everything else (pending,
// selected, passed, failed, needs_correction, recheck_required) is still
// "active" for dedup purposes, so re-importing the same condition updates
// the existing record instead of stacking duplicates.
const QC_TERMINAL_STATUSES = new Set(['closed']);

export function generateQcRecords(processedAssets, existingRecords, { importId, facilityId, previousAssetsByNumber = new Map(), sectionsById = new Map() } = {}) {
  const records = existingRecords.map((r) => ({ ...r }));
  let created = 0;
  let updated = 0;

  const addOrUpdate = (assetNumber, serialNumber, mapping, qcType) => {
    const existingActive = records.find(
      (r) => r.assetNumber === assetNumber && r.qcType === qcType && !QC_TERMINAL_STATUSES.has(r.status)
    );
    if (existingActive) {
      existingActive.importId = importId;
      updated += 1;
      return;
    }
    records.push({
      id: `qc-${assetNumber}-${qcType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'enex_import',
      importId,
      sourceImportId: importId,
      facilityId: mapping.facilityId || facilityId,
      buildingId: mapping.buildingId || '',
      floorId: mapping.floorId || '',
      sectionId: mapping.sectionId || '',
      roomId: mapping.roomId || '',
      assetNumber,
      serialNumber,
      qcType,
      status: 'pending',
      assignedTo: '',
      selectedDate: '',
      reviewedDate: '',
      reviewer: '',
      result: '',
      failureReason: '',
      correctiveAction: '',
      recheckDate: '',
      createdAt: new Date().toISOString(),
      completedAt: '',
      notes: '',
    });
    created += 1;
  };

  processedAssets.forEach(({ asset }) => {
    const prior = previousAssetsByNumber.get(asset.assetNumber);

    if (!prior) {
      addOrUpdate(asset.assetNumber, asset.serialNumber, asset, 'newly_imported');
    } else {
      if (prior.roomId !== asset.roomId) addOrUpdate(asset.assetNumber, asset.serialNumber, asset, 'room_assignment_changed');
      if (prior.serialNumber !== asset.serialNumber) addOrUpdate(asset.assetNumber, asset.serialNumber, asset, 'serial_number_changed');
    }

    if (asset.roomId && !asset.sectionId) {
      addOrUpdate(asset.assetNumber, asset.serialNumber, asset, 'room_without_confirmed_section');
    }

    const section = asset.sectionId ? sectionsById.get(asset.sectionId) : null;
    if (section && section.status === 'return_needed') addOrUpdate(asset.assetNumber, asset.serialNumber, asset, 'in_return_needed_area');
    if (section && section.status === 'no_access') addOrUpdate(asset.assetNumber, asset.serialNumber, asset, 'in_no_access_area');
  });

  return { records, created, updated };
}

// ---- Progress rollups (Part 13) ----
// Every rollup returns null when there's no real denominator — a caller
// must render that as "Pending", never as a 0% that implies real coverage.

export function rollupRoomTotals(roomId, assets) {
  const roomAssets = assets.filter((a) => a.roomId === roomId);
  return {
    imported: roomAssets.length,
    tagged: roomAssets.filter((a) => (a.assetNumber ?? '').length > 0).length,
    withResearchIssues: roomAssets.filter((a) => (a.issueTypes || []).length > 0).length,
  };
}

export function rollupSectionAssetTotals(sectionId, assets) {
  const sectionAssets = assets.filter((a) => a.sectionId === sectionId);
  if (sectionAssets.length === 0) return null;
  return {
    imported: sectionAssets.length,
    tagged: sectionAssets.filter((a) => (a.assetNumber ?? '').length > 0).length,
  };
}

export function rollupFloorAssetTotals(floorId, assets) {
  const floorAssets = assets.filter((a) => a.floorId === floorId);
  if (floorAssets.length === 0) return null;
  return { imported: floorAssets.length, tagged: floorAssets.filter((a) => (a.assetNumber ?? '').length > 0).length };
}

export function rollupBuildingAssetTotals(buildingId, assets) {
  const buildingAssets = assets.filter((a) => a.buildingId === buildingId);
  if (buildingAssets.length === 0) return null;
  return { imported: buildingAssets.length, tagged: buildingAssets.filter((a) => (a.assetNumber ?? '').length > 0).length };
}

export function rollupFacilityAssetTotals(facilityId, assets) {
  const facilityAssets = assets.filter((a) => a.facilityId === facilityId);
  if (facilityAssets.length === 0) return null;
  return { imported: facilityAssets.length, tagged: facilityAssets.filter((a) => (a.assetNumber ?? '').length > 0).length };
}

export { ISSUE_TYPES };
