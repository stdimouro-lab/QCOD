import { describe, it, expect } from 'vitest';
import {
  normalizeEnexLocation, parseEnexLocation, findRoomCandidates,
  resolveEnexLocation, validateResolvedRoom,
} from '../enexLocationParser.js';

const rooms = [
  { id: '500-1-1D-111', buildingId: '500', floorId: '500-1', roomNumber: '1D-111' },
  { id: '500-2-2D-111', buildingId: '500', floorId: '500-2', roomNumber: '2D-111' },
  { id: '500-3-3D-111', buildingId: '500', floorId: '500-3', roomNumber: '3D-111' },
  { id: '500-1-1A-136', buildingId: '500', floorId: '500-1', roomNumber: '1A-136' },
  { id: '999-1-1D-111', buildingId: '999', floorId: '999-1', roomNumber: '1D-111' },
];

// 1. Parsing SPGD111-500
describe('parseEnexLocation() — parsing SPGD111-500', () => {
  it('extracts department prefix, zone letter, room digits, and building', () => {
    const parsed = parseEnexLocation('SPGD111-500');
    expect(parsed.invalid).toBe(false);
    expect(parsed.departmentPrefix).toBe('SPG');
    expect(parsed.zoneLetter).toBe('D');
    expect(parsed.roomDigits).toBe('111');
    expect(parsed.buildingId).toBe('500');
  });
});

// 2. Trimming spaces and case normalization
describe('normalizeEnexLocation() — trimming and case normalization', () => {
  it('trims whitespace and uppercases', () => {
    expect(normalizeEnexLocation('  spgd111-500  ')).toBe('SPGD111-500');
  });
  it('parses correctly even with lowercase/whitespace input', () => {
    const parsed = parseEnexLocation('  spgd111-500 ');
    expect(parsed.departmentPrefix).toBe('SPG');
    expect(parsed.zoneLetter).toBe('D');
  });
});

// 3. Invalid ENEX location format
describe('parseEnexLocation() — invalid format', () => {
  it('flags a non-matching string as invalid', () => {
    expect(parseEnexLocation('INVALID').invalid).toBe(true);
  });
  it('flags a blank value as invalid', () => {
    expect(parseEnexLocation('').invalid).toBe(true);
    expect(parseEnexLocation(null).invalid).toBe(true);
  });
  it('flags a single-letter prefix (no room for both dept prefix and zone letter) as invalid', () => {
    expect(parseEnexLocation('A111-500').invalid).toBe(true);
  });
});

// 4. Building extraction
describe('parseEnexLocation() — building extraction', () => {
  it('extracts the building number after the dash', () => {
    expect(parseEnexLocation('SPGD112-500').buildingId).toBe('500');
    expect(parseEnexLocation('SPGD112-501').buildingId).toBe('501');
  });
});

// 5. Department-prefix extraction
describe('parseEnexLocation() — department-prefix extraction', () => {
  it('extracts everything before the final letter as the department prefix', () => {
    expect(parseEnexLocation('SPGA136-500').departmentPrefix).toBe('SPG');
    expect(parseEnexLocation('XD100-500').departmentPrefix).toBe('X');
  });
});

// 6. Zone-letter extraction
describe('parseEnexLocation() — zone-letter extraction', () => {
  it('extracts the final letter as the zone letter', () => {
    expect(parseEnexLocation('SPGD111-500').zoneLetter).toBe('D');
    expect(parseEnexLocation('SPGA136-500').zoneLetter).toBe('A');
  });
});

// 7. Room-digit extraction
describe('parseEnexLocation() — room-digit extraction', () => {
  it('extracts the digit run before the dash as room digits', () => {
    expect(parseEnexLocation('SPGD111-500').roomDigits).toBe('111');
    expect(parseEnexLocation('SPGA136-500').roomDigits).toBe('136');
  });
});

// 8. Exact approved alias match
describe('resolveEnexLocation() — exact approved alias match', () => {
  it('resolves immediately via an approved alias, bypassing candidate search entirely', () => {
    const aliases = [{ facilityId: 'martinsburg-va', rawLocationNormalized: 'SPGD111-500', roomId: '500-2-2D-111', approved: true }];
    const result = resolveEnexLocation('SPGD111-500', { facilityId: 'martinsburg-va', rooms, aliases });
    expect(result.status).toBe('matched');
    expect(result.matchSource).toBe('approved_alias');
    expect(result.matchedRoomId).toBe('500-2-2D-111');
    expect(result.confidence).toBe('high');
  });

  it('ignores an alias that is not approved', () => {
    const aliases = [{ facilityId: 'martinsburg-va', rawLocationNormalized: 'SPGD111-500', roomId: '500-2-2D-111', approved: false }];
    const result = resolveEnexLocation('SPGD111-500', { facilityId: 'martinsburg-va', rooms, aliases });
    expect(result.matchSource).not.toBe('approved_alias');
  });
});

// 9. Approved rule match
describe('resolveEnexLocation() — approved rule match', () => {
  it('resolves via an approved parser rule that narrows to a specific floor', () => {
    const rules = [{ id: 'r1', facilityId: 'martinsburg-va', buildingId: '500', departmentPrefix: 'SPG', zoneLetter: 'D', roomPattern: '^111$', targetFloorId: '500-3', approved: true }];
    const result = resolveEnexLocation('SPGD111-500', { facilityId: 'martinsburg-va', rooms, rules });
    expect(result.status).toBe('matched');
    expect(result.matchSource).toBe('approved_rule');
    expect(result.matchedRoomId).toBe('500-3-3D-111');
  });

  it('ignores a rule that is not approved', () => {
    const rules = [{ id: 'r1', facilityId: 'martinsburg-va', buildingId: '500', departmentPrefix: 'SPG', zoneLetter: 'D', roomPattern: '^111$', targetFloorId: '500-3', approved: false }];
    const result = resolveEnexLocation('SPGD111-500', { facilityId: 'martinsburg-va', rooms, rules });
    expect(result.matchSource).not.toBe('approved_rule');
  });
});

// 10. Unique official-room suggestion
describe('resolveEnexLocation() — unique official-room suggestion', () => {
  it('suggests (does not confirm) when exactly one official room matches', () => {
    const result = resolveEnexLocation('SPGA136-500', { facilityId: 'martinsburg-va', rooms });
    expect(result.status).toBe('suggested');
    expect(result.status).not.toBe('matched');
    expect(result.candidateRoomIds).toEqual(['500-1-1A-136']);
    expect(result.matchSource).toBe('unique_room_candidate');
  });
});

// 11. Multiple room candidates
describe('resolveEnexLocation() — multiple room candidates', () => {
  it('returns multiple_matches when more than one floor has a matching room', () => {
    const result = resolveEnexLocation('SPGD111-500', { facilityId: 'martinsburg-va', rooms });
    expect(result.status).toBe('multiple_matches');
    expect(result.candidateRoomIds).toHaveLength(3);
    expect(result.matchedRoomId).toBe('');
  });
});

// 12. No room candidate
describe('resolveEnexLocation() — no room candidate', () => {
  it('returns no_match when zero official rooms match', () => {
    const result = resolveEnexLocation('SPGZ999-500', { facilityId: 'martinsburg-va', rooms });
    expect(result.status).toBe('no_match');
    expect(result.candidateRoomIds).toHaveLength(0);
  });
});

// 13. Parser never guesses the floor
describe('resolveEnexLocation() — never guesses the floor', () => {
  it('does not pick the lowest floor, or any floor, when multiple candidates exist and there is no alias/rule', () => {
    const result = resolveEnexLocation('SPGD111-500', { facilityId: 'martinsburg-va', rooms });
    expect(result.matchedRoomId).toBe('');
    expect(['500-1-1D-111', '500-2-2D-111', '500-3-3D-111']).toContain(result.candidateRoomIds[0]); // present as a candidate, never auto-selected
    expect(result.status).not.toBe('matched');
    expect(result.status).not.toBe('suggested');
  });
});

// 14. Cross-building room rejected
describe('validateResolvedRoom() — cross-building rejection', () => {
  it('rejects a room that belongs to a different building than the parsed location', () => {
    const parsed = parseEnexLocation('SPGD111-500'); // building 500
    const wrongBuildingRoom = rooms.find((r) => r.id === '999-1-1D-111'); // building 999
    const { valid, errors } = validateResolvedRoom(wrongBuildingRoom, parsed);
    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/different building|not the expected building/i);
  });

  it('findRoomCandidates never includes rooms from a different building', () => {
    const parsed = parseEnexLocation('SPGD111-500');
    const candidates = findRoomCandidates(parsed, rooms);
    expect(candidates.every((r) => r.buildingId === '500')).toBe(true);
  });
});
