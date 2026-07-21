import { describe, it, expect } from 'vitest';
import {
  normalizeRoomNumber, normalizeRoomName, getRoomZone,
  validateRoomAssignment, groupRoomsByZone, groupRoomsByFloor, getRoomsPendingSection,
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

  it('rejects when room and section belong to different facilities', () => {
    const room = { facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1' };
    const section = { facilityId: 'other-facility', buildingId: '500', floorId: '500-1' };
    const { valid } = validateRoomAssignment(room, section);
    expect(valid).toBe(false);
  });

  it('accepts when facility, building, and floor all match', () => {
    const room = { facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1' };
    const section = { facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1' };
    const { valid } = validateRoomAssignment(room, section);
    expect(valid).toBe(true);
  });

  it('rejects when no section is provided', () => {
    const room = { ...scope, floorId: '500-1' };
    const { valid, errors } = validateRoomAssignment(room, null);
    expect(valid).toBe(false);
    expect(errors).toContain('Target section not found');
  });
});

describe('groupRoomsByZone() and groupRoomsByFloor()', () => {
  const rooms = [
    { roomNumber: '1A-101', floorId: '500-1' },
    { roomNumber: '1A-102', floorId: '500-1' },
    { roomNumber: '1B-100', floorId: '500-1' },
    { roomNumber: 'GA-106', floorId: '500-B' },
  ];

  it('groups rooms by architectural zone', () => {
    const groups = groupRoomsByZone(rooms);
    expect(groups['1A']).toHaveLength(2);
    expect(groups['1B']).toHaveLength(1);
    expect(groups['GA']).toHaveLength(1);
  });

  it('groups rooms by floor', () => {
    const groups = groupRoomsByFloor(rooms);
    expect(groups['500-1']).toHaveLength(3);
    expect(groups['500-B']).toHaveLength(1);
  });
});

describe('getRoomsPendingSection() — configuration-completeness, not a review queue', () => {
  it('returns only rooms with a blank sectionId', () => {
    const rooms = [
      { id: 'r1', sectionId: '500-1-CPC1' },
      { id: 'r2', sectionId: '' },
      { id: 'r3', sectionId: null },
    ];
    const pending = getRoomsPendingSection(rooms);
    expect(pending.map((r) => r.id)).toEqual(['r2', 'r3']);
  });

  it('returns an empty array when every room has a verified section', () => {
    const rooms = [{ id: 'r1', sectionId: '500-1-CPC1' }, { id: 'r2', sectionId: '500-1-CPC2' }];
    expect(getRoomsPendingSection(rooms)).toHaveLength(0);
  });
});
