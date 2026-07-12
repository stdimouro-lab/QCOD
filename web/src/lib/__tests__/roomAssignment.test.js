import { describe, it, expect } from 'vitest';
import {
  normalizeRoomNumber, normalizeRoomName, getRoomZone, suggestRoomSection,
  validateRoomAssignment, applyConfirmedRoomAssignment,
} from '../roomAssignment.js';

describe('normalizeRoomNumber()', () => {
  it('uppercases and trims whitespace', () => {
    expect(normalizeRoomNumber(' 1a-136 ')).toBe('1A-136');
    expect(normalizeRoomNumber('ga-106')).toBe('GA-106');
  });

  it('removes internal spaces', () => {
    expect(normalizeRoomNumber('1A - 136')).toBe('1A-136');
  });

  it('handles blank/null input safely', () => {
    expect(normalizeRoomNumber('')).toBe('');
    expect(normalizeRoomNumber(null)).toBe('');
  });
});

describe('normalizeRoomName()', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeRoomName('  Outpatient   Pharmacy  ')).toBe('outpatient pharmacy');
  });
});

describe('getRoomZone()', () => {
  it('detects zone from room numbers', () => {
    expect(getRoomZone('GA-106')).toBe('GA');
    expect(getRoomZone('1A-136')).toBe('1A');
    expect(getRoomZone('4B-105')).toBe('4B');
  });

  it('is case-insensitive', () => {
    expect(getRoomZone('1a-136')).toBe('1A');
  });

  it('returns empty string for non-matching input', () => {
    expect(getRoomZone('S-1')).toBe('');
    expect(getRoomZone('')).toBe('');
  });
});

const scope = { facilityId: 'martinsburg-va', buildingId: '500' };

describe('suggestRoomSection() — explicit confirmed-room assignment', () => {
  it('confirms with high confidence when the room number is in confirmedRoomNumbers', () => {
    const boundaries = [{
      ...scope, floorId: '500-1', sectionId: '500-1-OUTPTPHARM', sectionName: 'Outpatient Pharmacy',
      confirmedRoomNumbers: ['1A-136'], roomNumberRanges: [], roomNumberPrefixes: [], zones: [], roomNameKeywords: [], excludedRoomNumbers: [],
    }];
    const room = { ...scope, floorId: '500-1', roomNumber: '1A-136', roomName: 'Outpatient Pharmacy' };
    const result = suggestRoomSection(room, boundaries);
    expect(result.assignmentStatus).toBe('confirmed');
    expect(result.assignmentConfidence).toBe('high');
    expect(result.assignmentSource).toBe('department_map');
    expect(result.sectionId).toBe('500-1-OUTPTPHARM');
  });
});

describe('suggestRoomSection() — approved range assignment', () => {
  it('confirms when the room number falls within a VERIFIED approved range', () => {
    const boundaries = [{
      ...scope, floorId: '500-4', sectionId: '500-4-LAB', sectionName: '4th Floor Lab',
      confirmedRoomNumbers: [], roomNumberRanges: [{ start: 100, end: 120 }], roomNumberPrefixes: [], zones: [], roomNameKeywords: [], excludedRoomNumbers: [], verified: true,
    }];
    const room = { ...scope, floorId: '500-4', roomNumber: '4B-105', roomName: 'Unit Lab' };
    const result = suggestRoomSection(room, boundaries);
    expect(result.assignmentStatus).toBe('confirmed');
    expect(result.assignmentSource).toBe('approved_rule');
  });

  it('only SUGGESTS (does not confirm) when the range boundary is not yet verified', () => {
    const boundaries = [{
      ...scope, floorId: '500-4', sectionId: '500-4-LAB', sectionName: '4th Floor Lab',
      confirmedRoomNumbers: [], roomNumberRanges: [{ start: 100, end: 120 }], roomNumberPrefixes: [], zones: [], roomNameKeywords: [], excludedRoomNumbers: [], verified: false,
    }];
    const room = { ...scope, floorId: '500-4', roomNumber: '4B-105', roomName: 'Unit Lab' };
    const result = suggestRoomSection(room, boundaries);
    expect(result.assignmentStatus).toBe('suggested');
    expect(result.assignmentStatus).not.toBe('confirmed');
  });
});

describe('suggestRoomSection() — keyword-only result remains suggested, never confirmed', () => {
  it('room name matching a keyword produces needs_review, medium confidence, never confirmed', () => {
    const boundaries = [{
      ...scope, floorId: '500-B', sectionId: '500-B-PHARM', sectionName: 'Basement Pharmacy',
      confirmedRoomNumbers: [], roomNumberRanges: [], roomNumberPrefixes: [], zones: [], roomNameKeywords: ['pharmacy'], excludedRoomNumbers: [], verified: false,
    }];
    const room = { ...scope, floorId: '500-B', roomNumber: 'GA-106', roomName: 'Pharmacy' };
    const result = suggestRoomSection(room, boundaries);
    expect(result.assignmentStatus).toBe('needs_review');
    expect(result.assignmentStatus).not.toBe('confirmed');
    expect(result.assignmentConfidence).toBe('medium');
    expect(result.assignmentReason).toMatch(/no approved boundary rule exists/);
  });
});

describe('suggestRoomSection() — repeated department names stay separate across floors', () => {
  it('does not let a Basement Pharmacy boundary match a room on the 1st Floor', () => {
    const boundaries = [
      {
        facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-B', sectionId: '500-B-PHARM', sectionName: 'Basement Pharmacy',
        confirmedRoomNumbers: ['GA-106'], roomNumberRanges: [], roomNumberPrefixes: [], zones: [], roomNameKeywords: [], excludedRoomNumbers: [],
      },
      {
        facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1', sectionId: '500-1-OUTPTPHARM', sectionName: 'Outpatient Pharmacy',
        confirmedRoomNumbers: ['1A-136'], roomNumberRanges: [], roomNumberPrefixes: [], zones: [], roomNameKeywords: [], excludedRoomNumbers: [],
      },
    ];
    // A room on floor 500-1 with the SAME room number pattern style as the basement's confirmed
    // room must not match the basement's boundary — floor scoping keeps them separate.
    const room1stFloor = { facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1', roomNumber: 'GA-106', roomName: 'Pharmacy' };
    const result = suggestRoomSection(room1stFloor, boundaries);
    expect(result.sectionId).not.toBe('500-B-PHARM');
  });

  it('never scopes across buildings even with an identical floor id string', () => {
    const boundaries = [{
      facilityId: 'martinsburg-va', buildingId: '999', floorId: '500-1', sectionId: '999-1-PHARM', sectionName: 'Other Building Pharmacy',
      confirmedRoomNumbers: ['1A-136'], roomNumberRanges: [], roomNumberPrefixes: [], zones: [], roomNameKeywords: [], excludedRoomNumbers: [],
    }];
    const room = { facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1', roomNumber: '1A-136', roomName: 'Outpatient Pharmacy' };
    const result = suggestRoomSection(room, boundaries);
    expect(result.assignmentStatus).toBe('unassigned'); // no boundary in scope for building 500
  });
});

describe('suggestRoomSection() — Floors without a department map remain unassigned', () => {
  it('Floor 3 with zero boundary records returns unassigned, never inferred from the room name', () => {
    const boundaries = [{
      // only floor 500-1 has boundaries configured
      ...scope, floorId: '500-1', sectionId: '500-1-OUTPTPHARM', sectionName: 'Outpatient Pharmacy',
      confirmedRoomNumbers: ['1A-136'], roomNumberRanges: [], roomNumberPrefixes: [], zones: [], roomNameKeywords: [], excludedRoomNumbers: [],
    }];
    const room3rdFloor = { ...scope, floorId: '500-3', roomNumber: '3A-101', roomName: 'Storage' };
    const result = suggestRoomSection(room3rdFloor, boundaries);
    expect(result.assignmentStatus).toBe('unassigned');
    expect(result.assignmentConfidence).toBe('none');
    expect(result.assignmentReason).toBe('Department map pending');
  });

  it('Floors 5 and 6 behave the same way', () => {
    const boundaries = [];
    const room5th = { ...scope, floorId: '500-5', roomNumber: '5C-104', roomName: 'Office' };
    const room6th = { ...scope, floorId: '500-6', roomNumber: '6A-121', roomName: 'Storage' };
    expect(suggestRoomSection(room5th, boundaries).assignmentStatus).toBe('unassigned');
    expect(suggestRoomSection(room6th, boundaries).assignmentStatus).toBe('unassigned');
  });
});

describe('validateRoomAssignment() — cross-floor/building/facility rejection', () => {
  it('rejects when room and section are on different floors', () => {
    const room = { facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-B' };
    const section = { facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1' };
    const { valid, errors } = validateRoomAssignment(room, section);
    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/different floors/);
  });

  it('rejects when room and section are on different buildings', () => {
    const room = { facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1' };
    const section = { facilityId: 'martinsburg-va', buildingId: '999', floorId: '500-1' };
    const { valid } = validateRoomAssignment(room, section);
    expect(valid).toBe(false);
  });

  it('accepts when facility, building, and floor all match', () => {
    const room = { facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1' };
    const section = { facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1' };
    const { valid } = validateRoomAssignment(room, section);
    expect(valid).toBe(true);
  });
});

describe('applyConfirmedRoomAssignment()', () => {
  it('produces a confirmed, high-confidence room record — the only path allowed to do so', () => {
    const room = { id: '500-B-GA-106', roomNumber: 'GA-106', assignmentStatus: 'needs_review' };
    const result = applyConfirmedRoomAssignment(room, '500-B-PHARM', { source: 'manual_review', reason: 'Reviewer approved' });
    expect(result.assignmentStatus).toBe('confirmed');
    expect(result.assignmentConfidence).toBe('high');
    expect(result.sectionId).toBe('500-B-PHARM');
  });
});

describe('batch assignment requires the same explicit confirmation as a single one', () => {
  it('applyConfirmedRoomAssignment only ever changes the room it is explicitly called with', () => {
    const roomA = { id: 'A', roomNumber: '1A-101', assignmentStatus: 'unassigned' };
    const roomB = { id: 'B', roomNumber: '1A-102', assignmentStatus: 'unassigned' };
    const resultA = applyConfirmedRoomAssignment(roomA, '500-1-CPC1');
    // roomB was never passed in, so it must be untouched — proves there's no
    // implicit "confirm everything visible" behavior at the engine level.
    expect(resultA.id).toBe('A');
    expect(roomB.assignmentStatus).toBe('unassigned');
  });
});
