/**
 * Room-to-section assignment engine.
 *
 * All functions here are pure — no localStorage, no side effects — so they
 * can be unit tested directly. The critical rule throughout: room-name
 * keywords may contribute to a *suggestion*, but never confirm an
 * assignment by themselves. Only an explicit boundary rule (confirmed room
 * number, approved range, approved prefix) or a human confirmation can
 * produce assignmentStatus "confirmed".
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

// Parses the numeric part of a room number for range comparisons, e.g.
// "1A-136" -> 136. Returns null if it can't be parsed as a plain number.
function roomNumberValue(roomNumber) {
  const normalized = normalizeRoomNumber(roomNumber);
  const match = normalized.match(/-(\d+)$/);
  return match ? Number(match[1]) : null;
}

function sameScope(room, boundary) {
  return (
    normalizeRoomNumber(room.facilityId) === normalizeRoomNumber(boundary.facilityId) &&
    normalizeRoomNumber(room.buildingId) === normalizeRoomNumber(boundary.buildingId) &&
    normalizeRoomNumber(room.floorId) === normalizeRoomNumber(boundary.floorId)
  );
}

/**
 * Suggests a section for a room using ONLY explicit, approved rules — never
 * a bare guess from room name alone. `boundaries` is the array from
 * data/private/building500-section-boundaries.json (or the equivalent for
 * another building). Rules are checked in order of strength:
 *
 *   1. Exact confirmed room number  -> confirmed, high, department_map
 *   2. Approved room-number range   -> confirmed if boundary.verified, else suggested/medium
 *   3. Approved room-number prefix  -> confirmed if boundary.verified, else suggested/medium
 *   4. Room-name keyword match      -> suggested, medium/low, needs_review — NEVER confirmed
 *   5. Nothing matches               -> unassigned, none
 *
 * If there are no boundary records at all for this room's facility/building/
 * floor, that's treated as "department map pending" (e.g. Building 500
 * Floors 3, 5, 6 before their maps arrive) — never inferred from names.
 */
export function suggestRoomSection(room, boundaries = []) {
  const scoped = boundaries.filter((b) => sameScope(room, b));

  if (scoped.length === 0) {
    return {
      sectionId: '',
      assignmentStatus: 'unassigned',
      assignmentConfidence: 'none',
      assignmentSource: 'unassigned',
      assignmentReason: 'Department map pending',
    };
  }

  const roomNumberNorm = normalizeRoomNumber(room.roomNumber);
  const roomZone = getRoomZone(room.roomNumber);
  const numValue = roomNumberValue(room.roomNumber);
  const roomNameNorm = normalizeRoomName(room.roomName);

  // 1. Exact confirmed room number
  const confirmedMatch = scoped.find((b) =>
    (b.confirmedRoomNumbers || []).some((n) => normalizeRoomNumber(n) === roomNumberNorm)
  );
  if (confirmedMatch) {
    return {
      sectionId: confirmedMatch.sectionId,
      assignmentStatus: 'confirmed',
      assignmentConfidence: 'high',
      assignmentSource: 'department_map',
      assignmentReason: `Room number ${room.roomNumber} is explicitly listed for ${confirmedMatch.sectionName}`,
    };
  }

  // 2. Approved room-number range
  if (numValue !== null) {
    const rangeMatch = scoped.find((b) =>
      (b.roomNumberRanges || []).some((r) => numValue >= r.start && numValue <= r.end)
    );
    if (rangeMatch) {
      const verified = !!rangeMatch.verified;
      return {
        sectionId: rangeMatch.sectionId,
        assignmentStatus: verified ? 'confirmed' : 'suggested',
        assignmentConfidence: verified ? 'high' : 'medium',
        assignmentSource: verified ? 'approved_rule' : 'department_map',
        assignmentReason: `Room number ${room.roomNumber} falls within the approved range for ${rangeMatch.sectionName}${verified ? '' : ' (range not yet verified)'}`,
      };
    }
  }

  // 3. Approved room-number prefix / zone
  const prefixMatch = scoped.find((b) =>
    (b.roomNumberPrefixes || []).some((p) => roomNumberNorm.startsWith(normalizeRoomNumber(p))) ||
    (b.zones || []).some((z) => normalizeRoomNumber(z) === roomZone)
  );
  if (prefixMatch) {
    const verified = !!prefixMatch.verified;
    return {
      sectionId: prefixMatch.sectionId,
      assignmentStatus: verified ? 'confirmed' : 'suggested',
      assignmentConfidence: verified ? 'high' : 'medium',
      assignmentSource: verified ? 'approved_rule' : 'department_map',
      assignmentReason: `Room ${room.roomNumber} is in zone/prefix approved for ${prefixMatch.sectionName}${verified ? '' : ' (not yet verified)'}`,
    };
  }

  // 4. Room-name keyword — a hint only, can never confirm by itself.
  const keywordMatch = scoped.find((b) =>
    (b.roomNameKeywords || []).some((k) => roomNameNorm.includes(normalizeRoomName(k)))
  );
  if (keywordMatch) {
    const excluded = (keywordMatch.excludedRoomNumbers || []).some((n) => normalizeRoomNumber(n) === roomNumberNorm);
    if (!excluded) {
      return {
        sectionId: keywordMatch.sectionId,
        assignmentStatus: 'needs_review',
        assignmentConfidence: 'medium',
        assignmentSource: 'manual_review',
        assignmentReason: `Room name matches "${keywordMatch.sectionName}" keyword, but no approved boundary rule exists — requires human confirmation`,
      };
    }
  }

  return {
    sectionId: '',
    assignmentStatus: 'unassigned',
    assignmentConfidence: 'none',
    assignmentSource: 'unassigned',
    assignmentReason: 'No approved boundary rule or keyword match found',
  };
}

// Confirms that a proposed section assignment does not cross facility,
// building, or floor boundaries. Returns { valid, errors }.
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

// Applies a human-confirmed assignment to a room. This is the ONLY path
// that should ever set assignmentStatus to "confirmed" from a UI action —
// suggestRoomSection() only proposes; a person (via this function) decides.
export function applyConfirmedRoomAssignment(room, sectionId, { source = 'manual_review', reason = 'Confirmed by reviewer' } = {}) {
  return {
    ...room,
    sectionId,
    assignmentStatus: 'confirmed',
    assignmentConfidence: 'high',
    assignmentSource: source,
    assignmentReason: reason,
  };
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

export function getUnassignedRooms(rooms) {
  return rooms.filter((r) => r.assignmentStatus === 'unassigned');
}

export function getRoomsNeedingReview(rooms) {
  return rooms.filter((r) => r.assignmentStatus === 'needs_review' || r.assignmentStatus === 'suggested');
}
