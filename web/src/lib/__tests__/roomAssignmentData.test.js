import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOCAL_KEYS, saveLocalData, clearLocalData,
  getRoomCompletionForSection, getRoomCounts, getHierarchyCompleteness, exportQcodBackup,
} from '../data.js';

beforeEach(() => {
  clearLocalData();
});

describe('Room-derived progress calculation — based on sectionId + status, not retired assignment fields', () => {
  it('returns null (Pending) when a section has no rooms with a verified section reference', () => {
    saveLocalData(LOCAL_KEYS.rooms, [
      { id: '500-1-A', facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1', sectionId: '', roomNumber: '1A-101', status: 'not_started' },
    ]);
    expect(getRoomCompletionForSection('500-1-CPC1')).toBeNull();
  });

  it('computes completed/total from rooms whose sectionId matches, regardless of any retired field', () => {
    saveLocalData(LOCAL_KEYS.rooms, [
      { id: 'r1', sectionId: '500-1-CPC1', status: 'completed' },
      { id: 'r2', sectionId: '500-1-CPC1', status: 'not_started' },
      { id: 'r3', sectionId: '', status: 'completed' }, // no section — excluded
    ]);
    expect(getRoomCompletionForSection('500-1-CPC1')).toBe(50);
  });

  it('getRoomCounts reflects verified-section vs. pending-section counts', () => {
    saveLocalData(LOCAL_KEYS.rooms, [
      { id: 'r1', sectionId: '500-1-CPC1', status: 'completed' },
      { id: 'r2', sectionId: '', status: 'not_started' },
      { id: 'r3', sectionId: '', status: 'in_progress' },
    ]);
    const counts = getRoomCounts();
    expect(counts.roomsConfigured).toBe(3);
    expect(counts.roomsWithVerifiedSection).toBe(1);
    expect(counts.roomsPendingSection).toBe(2);
    expect(counts.roomsCompleted).toBe(1);
    expect(counts.roomsInProgress).toBe(1);
  });

  it('never uses "unassigned" language in its own field names', () => {
    const counts = getRoomCounts();
    expect(Object.keys(counts)).not.toContain('roomsAssigned');
    expect(Object.keys(counts)).not.toContain('roomsUnassigned');
    expect(Object.keys(counts)).not.toContain('roomsNeedingReview');
  });
});

describe('Hierarchy completeness summary', () => {
  it('counts rooms with valid parents vs. rooms with hierarchy errors', () => {
    saveLocalData(LOCAL_KEYS.facilities, [{ id: 'f1', name: 'Test Facility' }]);
    saveLocalData(LOCAL_KEYS.buildings, [{ id: 'b1', facilityId: 'f1', configured: true }]);
    saveLocalData(LOCAL_KEYS.floors, [{ id: 'fl1', buildingId: 'b1' }]);
    saveLocalData(LOCAL_KEYS.sectionProgress, [{ id: 's1', floorId: 'fl1' }]);
    saveLocalData(LOCAL_KEYS.rooms, [
      { id: 'r1', facilityId: 'f1', buildingId: 'b1', floorId: 'fl1', sectionId: 's1' }, // fully valid
      { id: 'r2', facilityId: 'f1', buildingId: 'b1', floorId: 'fl1', sectionId: '' }, // pending section, not an error
      { id: 'r3', facilityId: 'f1', buildingId: 'ghost', floorId: 'fl1', sectionId: '' }, // invalid building — hierarchy error
    ]);

    const summary = getHierarchyCompleteness();
    expect(summary.roomsConfigured).toBe(3);
    expect(summary.roomsPendingSection).toBe(2); // r2 and r3 both lack a valid section
    expect(summary.hierarchyErrors).toBe(1); // only r3 has an invalid parent
    expect(summary.roomsWithValidParents).toBe(2);
  });
});

describe('Backup includes the room directory without retired fields', () => {
  it('backup preserves room ID, hierarchy references, room number/name/type, status, and notes', () => {
    saveLocalData(LOCAL_KEYS.rooms, [
      { id: 'r1', facilityId: 'f1', buildingId: 'b1', floorId: 'fl1', sectionId: 's1', roomNumber: '1A-101', roomName: 'Office', roomType: 'Office', architecturalZone: '1A', status: 'completed', lastUpdate: '2026-01-01', notes: 'test' },
    ]);
    const backup = exportQcodBackup();
    expect(backup.rooms).toHaveLength(1);
    const room = backup.rooms[0];
    expect(room.roomNumber).toBe('1A-101');
    expect(room.sectionId).toBe('s1');
    expect(room).not.toHaveProperty('assignmentStatus');
    expect(room).not.toHaveProperty('assignmentConfidence');
  });
});
