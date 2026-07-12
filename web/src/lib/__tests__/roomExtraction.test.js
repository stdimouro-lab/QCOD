import { describe, it, expect } from 'vitest';
import { extractRoomCandidatesFromText, dedupeAcrossPages } from '../../../../scripts/lib/roomExtractionParser.js';
import { reviewRoomCandidates } from '../../../../scripts/lib/roomCandidateReview.js';

describe('extractRoomCandidatesFromText() — corridor/stair/elevator exclusion', () => {
  it('excludes corridor labels (e.g. 1A-C1)', () => {
    const { candidates } = extractRoomCandidatesFromText('1A-C1 CORRIDOR\n1A-136 PHARMACY', '500-1', 'test.pdf');
    expect(candidates.map((c) => c.roomNumber)).not.toContain('1A-C1');
    expect(candidates.map((c) => c.roomNumber)).toContain('1A-136');
  });

  it('excludes stairwell labels (e.g. 1-S1)', () => {
    const { candidates, stats } = extractRoomCandidatesFromText('1-S1 STAIRWELL\n1D-142 EMERGENCY', '500-1', 'test.pdf');
    expect(candidates.map((c) => c.roomNumber)).not.toContain('1-S1');
    expect(candidates.map((c) => c.roomNumber)).toContain('1D-142');
  });

  it('excludes elevator labels (e.g. S-1, P-2)', () => {
    const { candidates } = extractRoomCandidatesFromText('S-1 ELEVATOR\nP-2 ELEVATOR\n2B-132 LAB', '500-2', 'test.pdf');
    expect(candidates.map((c) => c.roomNumber)).not.toContain('S-1');
    expect(candidates.map((c) => c.roomNumber)).not.toContain('P-2');
    expect(candidates.map((c) => c.roomNumber)).toContain('2B-132');
  });

  it('excludes PTS markers and dimension/legend text via keyword rejection', () => {
    const { rejected } = extractRoomCandidatesFromText('GA-106 PTS POINT MARKER', '500-B', 'test.pdf');
    // GA-106 matches the room-number pattern but its guessed name looks like a PTS label, so it's rejected.
    expect(rejected.some((r) => r.roomNumber === 'GA-106')).toBe(true);
  });
});

describe('extractRoomCandidatesFromText() — duplicate detection', () => {
  it('flags a room number repeated on the same page as a duplicate, not a second room', () => {
    const { candidates, rejected } = extractRoomCandidatesFromText('1B-105 WOMENS CLINIC\n1B-105 WOMENS CLINIC', '500-1', 'test.pdf');
    expect(candidates).toHaveLength(1);
    expect(rejected.some((r) => r.reason === 'duplicate_on_page')).toBe(true);
  });
});

describe('dedupeAcrossPages()', () => {
  it('deduplicates the same room number appearing on multiple pages of the same floor', () => {
    const candidates = [
      { roomNumber: '1A-136', floorId: '500-1', roomName: 'Pharmacy' },
      { roomNumber: '1A-136', floorId: '500-1', roomName: 'Pharmacy (repeated on legend page)' },
      { roomNumber: '1D-142', floorId: '500-1', roomName: 'Emergency' },
    ];
    const { unique, duplicates } = dedupeAcrossPages(candidates);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(1);
  });

  it('does not treat the same room number on different floors as a duplicate', () => {
    const candidates = [
      { roomNumber: '1A-101', floorId: '500-1', roomName: 'Office' },
      { roomNumber: '1A-101', floorId: '500-2', roomName: 'Office' }, // different floor, same number — not a real dupe
    ];
    const { unique, duplicates } = dedupeAcrossPages(candidates);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});

describe('reviewRoomCandidates()', () => {
  it('rejects non-room patterns that slipped through and duplicate room numbers on the same floor', () => {
    const candidates = [
      { roomNumber: '1A-136', roomName: 'Pharmacy', floorId: '500-1', extractedLabel: '1A-136' },
      { roomNumber: '1A-136', roomName: 'Pharmacy Storage', floorId: '500-1', extractedLabel: '1A-136' }, // dup on same floor
      { roomNumber: '1A-C2', roomName: 'Corridor Segment', floorId: '500-1', extractedLabel: '1A-C2' },
    ];
    const { clean, errors } = reviewRoomCandidates(candidates);
    expect(clean).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });

  it('does not reject legitimate operational spaces like Mechanical Room or Pharmacy — classifies a roomType instead', () => {
    const candidates = [
      { roomNumber: 'GA-101', roomName: 'Mechanical Room', floorId: '500-B', extractedLabel: 'GA-101' },
      { roomNumber: 'GA-102', roomName: 'Pharmacy', floorId: '500-B', extractedLabel: 'GA-102' },
    ];
    const { clean, errors } = reviewRoomCandidates(candidates);
    expect(errors).toHaveLength(0);
    expect(clean.find((c) => c.roomNumber === 'GA-101').roomType).toBe('Mechanical Room');
    expect(clean.find((c) => c.roomNumber === 'GA-102').roomType).toBe('Pharmacy');
  });
});
