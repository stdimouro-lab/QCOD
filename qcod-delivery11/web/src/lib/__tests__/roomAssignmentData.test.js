import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOCAL_KEYS, saveLocalData, clearLocalData,
  applyRoomAssignmentChange, getRoomAssignmentHistory,
  getRoomCompletionForSection, getRoomCounts, exportQcodBackup,
} from '../data.js';

beforeEach(() => {
  clearLocalData();
});

function seedRooms() {
  saveLocalData(LOCAL_KEYS.rooms, [
    { id: '500-1-A', facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1', sectionId: '', roomNumber: '1A-101', roomName: 'Office', assignmentStatus: 'unassigned', assignmentConfidence: 'none', status: 'not_started' },
    { id: '500-1-B', facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1', sectionId: '', roomNumber: '1A-102', roomName: 'Office 2', assignmentStatus: 'unassigned', assignmentConfidence: 'none', status: 'not_started' },
  ]);
}

describe('Room assignment history — Part 11 test 11', () => {
  it('appends a history record for every change and never overwrites previous entries', () => {
    seedRooms();
    applyRoomAssignmentChange(['500-1-A'], { sectionId: '500-1-CPC1', assignmentStatus: 'confirmed', assignmentConfidence: 'high' }, 'manual_review');
    expect(getRoomAssignmentHistory()).toHaveLength(1);

    applyRoomAssignmentChange(['500-1-B'], { sectionId: '500-1-CPC2', assignmentStatus: 'confirmed', assignmentConfidence: 'high' }, 'batch');
    const history = getRoomAssignmentHistory();
    expect(history).toHaveLength(2); // appended, not replaced
    expect(history[0].roomId).toBe('500-1-A');
    expect(history[1].roomId).toBe('500-1-B');
    expect(history[1].previousSectionId).toBe('');
    expect(history[1].newSectionId).toBe('500-1-CPC2');
  });

  it('batch assignment updates every room passed in, and only those rooms', () => {
    seedRooms();
    const { updatedCount } = applyRoomAssignmentChange(['500-1-A', '500-1-B'], { assignmentStatus: 'needs_review' }, 'batch');
    expect(updatedCount).toBe(2);
    expect(getRoomAssignmentHistory()).toHaveLength(2);
  });
});

describe('Room-derived progress calculation — Part 11 test 13', () => {
  it('returns null (Pending) when a section has no confirmed-assigned rooms', () => {
    seedRooms();
    expect(getRoomCompletionForSection('500-1-CPC1')).toBeNull();
  });

  it('computes completed/total once rooms are confirmed-assigned to a section', () => {
    saveLocalData(LOCAL_KEYS.rooms, [
      { id: 'r1', sectionId: '500-1-CPC1', assignmentStatus: 'confirmed', status: 'completed' },
      { id: 'r2', sectionId: '500-1-CPC1', assignmentStatus: 'confirmed', status: 'not_started' },
      { id: 'r3', sectionId: '500-1-CPC1', assignmentStatus: 'unassigned', status: 'completed' }, // not confirmed — excluded
    ]);
    expect(getRoomCompletionForSection('500-1-CPC1')).toBe(50);
  });

  it('getRoomCounts reflects assigned/unassigned/needs_review correctly', () => {
    saveLocalData(LOCAL_KEYS.rooms, [
      { id: 'r1', assignmentStatus: 'confirmed', status: 'completed' },
      { id: 'r2', assignmentStatus: 'unassigned', status: 'not_started' },
      { id: 'r3', assignmentStatus: 'needs_review', status: 'not_started' },
    ]);
    const counts = getRoomCounts();
    expect(counts.roomsConfigured).toBe(3);
    expect(counts.roomsAssigned).toBe(1);
    expect(counts.roomsUnassigned).toBe(1);
    expect(counts.roomsNeedingReview).toBe(1);
  });
});

describe('Backup excludes source documents — Part 11 test 14', () => {
  it('the exported backup never includes PDF file contents or absolute local paths', () => {
    saveLocalData(LOCAL_KEYS.rooms, [
      { id: 'r1', roomNumber: 'GA-106', sourceDocument: '500-Basement Floor Arch.pdf', sourcePage: 1 },
    ]);
    const backup = exportQcodBackup();
    const serialized = JSON.stringify(backup);
    // The filename alone (for audit) is fine, but nothing resembling a full
    // Windows/Unix absolute path or embedded binary PDF data should appear.
    expect(serialized).not.toMatch(/C:\\/);
    expect(serialized).not.toMatch(/%PDF-/); // PDF file signature — would indicate embedded binary content
    expect(backup.version).toBe('0.6');
  });
});
