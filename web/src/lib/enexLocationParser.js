/**
 * Parses AssetWorx-style ENEX/ENNX location codes (e.g. "SPGD111-500") into
 * an official architectural room reference (e.g. "1D-111").
 *
 * Critical constraint: the ENEX value never contains the floor number, only
 * a department prefix, a zone letter, a room number, and a building number.
 * This parser NEVER guesses the floor. If more than one official room could
 * match (e.g. 1D-111, 2D-111, 3D-111 all exist), resolution stops at
 * "multiple_matches" and waits for a human decision — via an approved alias
 * (exact one-off) or an approved parser rule (narrows to one floor, for a
 * specific department+zone combination going forward).
 */

// SPGD111-500 -> letters "SPGD" (department prefix + zone letter) + digits
// "111" (room number) + "-" + digits "500" (building). The zone letter is
// always the LAST letter of the letter run, immediately before the digits.
const ENEX_PATTERN = /^([A-Z]+)(\d+)-(\d+)$/;

export function normalizeEnexLocation(raw) {
  return (raw ?? '').toString().trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * @returns parsed fields, or { invalid: true } if the format doesn't match.
 */
export function parseEnexLocation(rawLocation) {
  const normalizedLocation = normalizeEnexLocation(rawLocation);
  const match = normalizedLocation.match(ENEX_PATTERN);

  if (!normalizedLocation || !match) {
    return { invalid: true, rawLocation: (rawLocation ?? '').toString(), normalizedLocation };
  }

  const [, letters, roomDigits, buildingId] = match;
  if (letters.length < 2) {
    // Need at least a department prefix (1+ chars) plus a zone letter.
    return { invalid: true, rawLocation: (rawLocation ?? '').toString(), normalizedLocation };
  }

  const zoneLetter = letters.slice(-1);
  const departmentPrefix = letters.slice(0, -1);

  return {
    invalid: false,
    rawLocation: (rawLocation ?? '').toString(),
    normalizedLocation,
    departmentPrefix,
    zoneLetter,
    roomDigits,
    buildingId,
  };
}

function roomZoneAndNumber(room) {
  // e.g. "1D-111" -> zone "1D", digits "111"; "GD-121" -> zone "GD", digits "121"
  const match = (room.roomNumber ?? '').toString().trim().toUpperCase().match(/^((?:G|[1-6])[A-E])-(\d+)$/);
  if (!match) return null;
  return { zone: match[1], digits: match[2] };
}

/**
 * Finds every official room in `rooms` whose building matches, whose zone
 * ends with the parsed zone letter (e.g. zone letter "D" matches zones
 * "1D", "2D", "GD", ...), and whose room-number digits match exactly.
 * Does not filter by floor — that's the whole point: this surfaces every
 * floor that could be the right one, rather than picking one.
 */
export function findRoomCandidates(parsed, rooms = []) {
  if (parsed.invalid) return [];
  return rooms.filter((room) => {
    if ((room.buildingId ?? '').toString() !== parsed.buildingId) return false;
    const zn = roomZoneAndNumber(room);
    if (!zn) return false;
    return zn.zone.endsWith(parsed.zoneLetter) && zn.digits === parsed.roomDigits;
  });
}

function normKey(s) {
  return (s ?? '').toString().trim().toLowerCase();
}

/**
 * Resolves a raw ENEX location to an official room using the required
 * order: exact approved alias -> approved parser rule -> unique official
 * room match -> multiple matches -> no match.
 *
 * @param {string} rawLocation
 * @param {object} context - { facilityId, rooms, aliases, rules }
 */
export function resolveEnexLocation(rawLocation, { facilityId, rooms = [], aliases = [], rules = [] } = {}) {
  const parsed = parseEnexLocation(rawLocation);

  if (parsed.invalid) {
    return {
      status: 'invalid_format',
      rawLocation: parsed.rawLocation,
      parsed,
      matchedRoomId: '',
      candidateRoomIds: [],
      confidence: 'none',
      reason: 'Location does not match the expected ENEX pattern (letters + digits + "-" + building number)',
      matchSource: 'none',
    };
  }

  // 1. Exact approved alias — a one-off, human-approved mapping for this
  // exact normalized location string.
  const alias = aliases.find((a) =>
    a.approved &&
    normKey(a.facilityId) === normKey(facilityId) &&
    normKey(a.rawLocationNormalized) === normKey(parsed.normalizedLocation)
  );
  if (alias) {
    return {
      status: 'matched',
      rawLocation: parsed.rawLocation,
      parsed,
      matchedRoomId: alias.roomId,
      candidateRoomIds: [alias.roomId],
      confidence: 'high',
      reason: `Exact approved alias for "${parsed.normalizedLocation}"`,
      matchSource: 'approved_alias',
    };
  }

  // 2. Approved parser rule — narrows department prefix + zone + room
  // pattern down to one specific floor, previously approved by a human.
  // This is only ever a single-floor narrowing, never a guess.
  const rule = rules.find((r) => {
    if (!r.approved) return false;
    if (normKey(r.facilityId) !== normKey(facilityId)) return false;
    if ((r.buildingId ?? '').toString() !== parsed.buildingId) return false;
    if (normKey(r.departmentPrefix) !== normKey(parsed.departmentPrefix)) return false;
    if (normKey(r.zoneLetter) !== normKey(parsed.zoneLetter)) return false;
    try {
      return new RegExp(r.roomPattern).test(parsed.roomDigits);
    } catch {
      return false; // a malformed stored regex should never crash resolution
    }
  });
  if (rule) {
    const roomsOnTargetFloor = findRoomCandidates(parsed, rooms).filter(
      (room) => room.floorId === rule.targetFloorId
    );
    if (roomsOnTargetFloor.length === 1) {
      return {
        status: 'matched',
        rawLocation: parsed.rawLocation,
        parsed,
        matchedRoomId: roomsOnTargetFloor[0].id,
        candidateRoomIds: [roomsOnTargetFloor[0].id],
        confidence: 'high',
        reason: `Approved parser rule "${rule.id}" resolves to floor ${rule.targetFloorId}`,
        matchSource: 'approved_rule',
      };
    }
    // The approved rule's target floor doesn't cleanly resolve to exactly
    // one room (room data may have changed since the rule was approved) —
    // fall through to the generic candidate search rather than guess.
  }

  // 3-5. Unique / multiple / no official room match, scanning every floor.
  const candidates = findRoomCandidates(parsed, rooms);
  if (candidates.length === 1) {
    return {
      status: 'suggested',
      rawLocation: parsed.rawLocation,
      parsed,
      matchedRoomId: '',
      candidateRoomIds: [candidates[0].id],
      confidence: 'high',
      reason: `Exactly one official room matches building ${parsed.buildingId}, zone ending "${parsed.zoneLetter}", room ${parsed.roomDigits} — requires approval before use`,
      matchSource: 'unique_room_candidate',
    };
  }
  if (candidates.length > 1) {
    return {
      status: 'multiple_matches',
      rawLocation: parsed.rawLocation,
      parsed,
      matchedRoomId: '',
      candidateRoomIds: candidates.map((r) => r.id),
      confidence: 'none',
      reason: `${candidates.length} official rooms match this location across different floors — the floor cannot be determined automatically`,
      matchSource: 'none',
    };
  }

  return {
    status: 'no_match',
    rawLocation: parsed.rawLocation,
    parsed,
    matchedRoomId: '',
    candidateRoomIds: [],
    confidence: 'none',
    reason: 'No official room matches this building, zone, and room number',
    matchSource: 'none',
  };
}

// Confirms a resolved room actually belongs to the expected building —
// the last line of defense against a stale alias/rule pointing somewhere
// that no longer makes sense (e.g. after a room renumbering).
export function validateResolvedRoom(room, parsed) {
  const errors = [];
  if (!room) return { valid: false, errors: ['No room to validate'] };
  if ((room.buildingId ?? '').toString() !== parsed.buildingId) {
    errors.push(`Room belongs to building ${room.buildingId}, not the expected building ${parsed.buildingId}`);
  }
  return { valid: errors.length === 0, errors };
}

const STATUS_LABELS = {
  matched: 'Matched',
  suggested: 'Suggested — needs approval',
  multiple_matches: 'Multiple candidates — needs review',
  no_match: 'No match',
  invalid_format: 'Invalid format',
};

export function getEnexLocationStatus(resolution) {
  return STATUS_LABELS[resolution?.status] ?? 'Unknown';
}
