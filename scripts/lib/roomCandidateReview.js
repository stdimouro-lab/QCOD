/**
 * Pure validation/normalization logic for extracted room candidates.
 * Separated from file I/O so it can be unit tested directly.
 */

// Patterns that indicate the "room" is actually a non-trackable architectural
// label rather than an operational space — checked against both the room
// number and the extracted label text as a second line of defense beyond
// the extraction regex itself.
const REJECT_ROOM_NUMBER_PATTERNS = [
  /-C\d+$/i,      // corridor segments, e.g. 1A-C1
  /^\d-S\d+$/i,   // stairwells, e.g. 1-S1
  /^[SP]-\d+$/i,  // elevators, e.g. S-1, P-2
];

const REJECT_LABEL_KEYWORDS = [
  /\bcorridor\b/i,
  /\bstair(well)?\b/i,
  /\belevator\b/i,
  /\bshaft\b/i,
  /\bpts\b/i,
  /\bfire\s*wall\b/i,
  /\blegend\b/i,
  /\bdimension\b/i,
];

// Known legitimate operational space types. This does NOT determine section
// assignment — only a display roomType, per spec Part 2 ("classify them
// with a roomType and leave assignment pending where needed").
const ROOM_TYPE_KEYWORDS = [
  [/mechanical/i, 'Mechanical Room'],
  [/electrical/i, 'Electrical Room'],
  [/generator/i, 'Generator Room'],
  [/loading\s*dock/i, 'Loading Dock'],
  [/kitchen/i, 'Kitchen'],
  [/\blab(oratory)?\b/i, 'Laboratory'],
  [/\bpolice\b|\bspd\b/i, 'Police / Security'],
  [/pharmacy/i, 'Pharmacy'],
  [/storage/i, 'Storage'],
  [/utility/i, 'Utility'],
  [/office/i, 'Office'],
  [/medication/i, 'Medication Room'],
];

function classifyRoomType(roomName) {
  const match = ROOM_TYPE_KEYWORDS.find(([re]) => re.test(roomName || ''));
  return match ? match[1] : '';
}

function isRejectable(candidate) {
  if (REJECT_ROOM_NUMBER_PATTERNS.some((re) => re.test(candidate.roomNumber))) return 'non_room_pattern';
  if (REJECT_LABEL_KEYWORDS.some((re) => re.test(candidate.extractedLabel || '') || re.test(candidate.roomName || ''))) return 'rejected_keyword';
  return null;
}

/**
 * @param {Array} candidates - raw candidates from building500-room-candidates.json
 */
export function reviewRoomCandidates(candidates) {
  const clean = [];
  const errors = [];
  const seenByFloor = new Map(); // floorId -> Set(roomNumber)

  candidates.forEach((c) => {
    const rejectReason = isRejectable(c);
    if (rejectReason) {
      errors.push({ ...c, errorReason: rejectReason });
      return;
    }

    const floorSet = seenByFloor.get(c.floorId) || new Set();
    if (floorSet.has(c.roomNumber)) {
      errors.push({ ...c, errorReason: 'duplicate_room_number_on_floor' });
      return;
    }
    floorSet.add(c.roomNumber);
    seenByFloor.set(c.floorId, floorSet);

    clean.push({
      ...c,
      roomType: classifyRoomType(c.roomName),
    });
  });

  return { clean, errors };
}
