/**
 * Pure text-parsing logic for extracting Building 500 room candidates from
 * architectural PDF text. Separated from the PDF-reading step (extract-
 * building500-rooms.js) so this regex/heuristic logic can be unit tested
 * against synthetic strings without needing a real PDF file.
 *
 * IMPORTANT: this has never been run against a real Martinsburg architectural
 * PDF — there was no sample file available while building it. The room-number
 * pattern matches the format given in the spec (GA-106, 1A-136, etc.), but the
 * room-*name* extraction heuristic (nearest text on the same line) is a
 * reasonable guess at typical CAD/PDF export layout, not something verified
 * against a real drawing. Expect to tune this once run against actual files.
 */

// Zone prefix is either "G" (basement/ground) or a floor digit 1-6, followed
// by a single letter A-E. Room number is 2-4 digits. This intentionally
// excludes corridor labels (e.g. "1A-C1" — letters after the dash),
// stairwells ("1-S1" — no zone letter), and elevators ("S-1", "P-2" — no
// valid zone prefix) by construction, not just by a rejection list.
const ROOM_NUMBER_PATTERN = /\b((?:G|[1-6])[A-E])-(\d{2,4})\b/g;

const REJECT_NAME_KEYWORDS = [
  /^dim(ension)?s?$/i,
  /^pts?\b/i,
  /^fire\s*wall/i,
  /^legend/i,
  /^corridor/i,
  /^stair/i,
  /^elev(ator)?/i,
  /^shaft/i,
  /^mech(anical)?\s*shaft/i,
];

function normalizeWhitespace(text) {
  // Tabs in this PDF's extracted text mark a boundary between two adjacent
  // text objects on the drawing (e.g. a room's SQ. FT. value immediately
  // followed by the next room's number) — treat them as line breaks, not
  // spaces, so the name-extraction step below can still find them.
  return text.replace(/\r\n/g, '\n').replace(/\t/g, '\n').replace(/ +/g, ' ');
}

// The real architectural PDF layout puts the room number, then the room
// name (sometimes wrapped across 2-3 lines), then a "### SQ. FT." line, each
// on its own line — never all on one line. This walks forward from the room
// number, accumulating non-blank lines as the name until it hits a square-
// footage line (which ends the name and supplies squareFeet) or what looks
// like the start of the next room number (a safety net for the rare label
// with no SQ. FT. line at all).
const SQFT_LINE = /^([\d,]+)\s*SQ\.?\s*FT\.?/i;
const ROOM_NUMBER_LINE_START = /^((?:G|[1-6])[A-E])-(\d{2,4})\b/;

function extractNameAndArea(text, matchEndIndex) {
  const lines = text.slice(matchEndIndex, matchEndIndex + 600).split(/[\n\t]/);
  const nameParts = [];
  let squareFeet = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') continue;

    const sfMatch = line.match(SQFT_LINE);
    if (sfMatch) {
      squareFeet = Number(sfMatch[1].replace(/,/g, ''));
      break;
    }
    if (ROOM_NUMBER_LINE_START.test(line)) break; // next room's label started — no SF line for this one
    if (nameParts.length >= 5) break; // safety cap against runaway accumulation

    nameParts.push(line);
  }

  return { roomName: nameParts.join(' ').replace(/\s+/g, ' ').trim(), squareFeet };
}

/**
 * @param {string} text - raw text extracted from one PDF page
 * @param {string} floorId - e.g. "500-1"
 * @param {string} sourceDocument - filename for audit purposes
 * @param {number} sourcePage - 1-indexed page number
 */
export function extractRoomCandidatesFromText(text, floorId, sourceDocument, sourcePage = 1) {
  const normalized = normalizeWhitespace(text || '');
  const candidates = [];
  const rejected = [];
  const seenOnPage = new Set();
  let totalMatches = 0;

  for (const match of normalized.matchAll(ROOM_NUMBER_PATTERN)) {
    totalMatches += 1;
    const zone = match[1].toUpperCase();
    const numberPart = match[2];
    const roomNumber = `${zone}-${numberPart}`;
    const extractedLabel = match[0];

    if (seenOnPage.has(roomNumber)) {
      rejected.push({ roomNumber, reason: 'duplicate_on_page', extractedLabel });
      continue;
    }
    seenOnPage.add(roomNumber);

    const { roomName, squareFeet } = extractNameAndArea(normalized, match.index + match[0].length);
    const nameLooksRejectable = REJECT_NAME_KEYWORDS.some((re) => re.test(roomName));
    if (nameLooksRejectable) {
      rejected.push({ roomNumber, reason: 'rejected_label_keyword', extractedLabel: `${extractedLabel} ${roomName}` });
      continue;
    }

    candidates.push({
      roomNumber,
      roomName,
      squareFeet,
      architecturalZone: zone,
      floorId,
      sourceDocument,
      sourcePage,
      extractedLabel,
    });
  }

  return {
    candidates,
    rejected,
    stats: {
      totalTextCandidates: totalMatches,
      validCandidates: candidates.length,
      rejectedCount: rejected.length,
      missingNameCount: candidates.filter((c) => !c.roomName).length,
    },
  };
}

export function dedupeAcrossPages(allCandidates) {
  const byRoomNumber = new Map();
  const duplicates = [];
  allCandidates.forEach((c) => {
    const key = `${c.floorId}::${c.roomNumber}`;
    if (byRoomNumber.has(key)) {
      duplicates.push(c);
    } else {
      byRoomNumber.set(key, c);
    }
  });
  return { unique: Array.from(byRoomNumber.values()), duplicates };
}
