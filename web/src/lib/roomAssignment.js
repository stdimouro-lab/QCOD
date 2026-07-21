/**
 * Room hierarchy utilities.
 *
 * V10 note: this module previously included a room-to-section suggestion
 * engine (suggestRoomSection, applyConfirmedRoomAssignment,
 * getUnassignedRooms, getRoomsNeedingReview) that powered the retired
 * Room Assignment Review workflow. That workflow duplicated AssetWorx's
 * own location-assignment responsibility and has been removed — see
 * REMOVED_FILES.txt. What remains here are the generic, still-legitimate
 * pure utilities: room-number/name normalization, zone parsing, hierarchy
 * validation, and grouping.
 */

export function normalizeRoomNumber(roomNumber) {
  return (roomNumber ?? '').toString().trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeRoomName(roomName) {
  return (roomName ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

// Zone is the alphabetic-prefixed portion before the dash, e.g. "1A-136" -> "1A".
export function getRoomZone(roomNumber) {
  const normalized = normalizeRoomNumber(roomNumber);
  const match = normalized.match(/^((?:G|[1-6])[A-E])-/);
  return match ? match[1] : '';
}

// Confirms a room's facility/building/floor actually matches the section
// it's being configured against — the hierarchy integrity check the spec
// requires for every import and configuration change. Never guesses a
// relationship; only validates one that's already being proposed.
export function validateRoomAssignment(room, section) {
  const errors = [];
  if (!section) {
    return { valid: false, errors: ['Target section not found'] };
  }
  if (normalizeRoomNumber(room.facilityId) !== normalizeRoomNumber(section.facilityId)) {
    errors.push('Room and section belong to different facilities');
  }
  if (normalizeRoomNumber(room.buildingId) !== normalizeRoomNumber(section.buildingId)) {
    errors.push('Room and section belong to different buildings');
  }
  if (normalizeRoomNumber(room.floorId) !== normalizeRoomNumber(section.floorId)) {
    errors.push('Room and section belong to different floors');
  }
  return { valid: errors.length === 0, errors };
}

export function groupRoomsByZone(rooms) {
  const groups = {};
  rooms.forEach((r) => {
    const zone = getRoomZone(r.roomNumber) || 'Unzoned';
    if (!groups[zone]) groups[zone] = [];
    groups[zone].push(r);
  });
  return groups;
}

export function groupRoomsByFloor(rooms) {
  const groups = {};
  rooms.forEach((r) => {
    const floor = r.floorId || 'Unknown';
    if (!groups[floor]) groups[floor] = [];
    groups[floor].push(r);
  });
  return groups;
}

// Rooms whose section configuration is not yet verified — i.e. sectionId
// is blank. This is a configuration-completeness view, not a review queue:
// callers should present it as "pending configuration," never "unassigned."
export function getRoomsPendingSection(rooms) {
  return rooms.filter((r) => !r.sectionId);
}
