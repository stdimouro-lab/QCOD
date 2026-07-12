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
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
}

// Given the full page text and the character index of a matched room number,
// take a short slice of text after it on the same line as a best-effort
// room name. This is a heuristic — see the file-level note above.
function guessRoomName(text, matchEndIndex) {
  const restOfLine = text.slice(matchEndIndex).split('\n')[0];
  const cleaned = restOfLine.replace(/^[\s:.\-–—]+/, '').trim();
  // Cut at the next obvious field boundary (multiple spaces, a new number, etc.)
  const cut = cleaned.split(/ {2,}|\t/)[0].trim();
  return cut.slice(0, 80);
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

    const roomName = guessRoomName(normalized, match.index + match[0].length);
    const nameLooksRejectable = REJECT_NAME_KEYWORDS.some((re) => re.test(roomName));
    if (nameLooksRejectable) {
      rejected.push({ roomNumber, reason: 'rejected_label_keyword', extractedLabel: `${extractedLabel} ${roomName}` });
      continue;
    }

    // Square footage sometimes appears right after the name as "### SF" or "### SQ FT"
    const sfMatch = normalized.slice(match.index, match.index + 200).match(/(\d{2,5})\s*(?:SF|SQ\.?\s*FT)/i);

    candidates.push({
      roomNumber,
      roomName,
      squareFeet: sfMatch ? Number(sfMatch[1]) : null,
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
