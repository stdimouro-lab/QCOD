import { describe, it, expect } from 'vitest';
import { previewRoomRows, summarizeRoomImportPreview, applyRoomImport } from '../fileImport.js';

const buildings = [{ id: '500', facilityId: 'martinsburg-va' }];
const floors = [{ id: '500-1', buildingId: '500' }, { id: '500-2', buildingId: '500' }];
const sections = [{ id: '500-1-CPC1', floorId: '500-1', buildingId: '500' }];

function row(overrides = {}) {
  return {
    'Facility ID': 'martinsburg-va', 'Building ID': '500', 'Floor ID': '500-1', 'Section ID': '',
    'Room ID': '500-1-1A101', 'Room Number': '1A-101', 'Room Name': 'Office', 'Room Type': 'Office',
    'Architectural Zone': '1A', 'Status': 'Not Started', 'Last Updated': '', 'Notes': '',
    ...overrides,
  };
}

describe('Room import — every room references an existing facility/building/floor', () => {
  it('rejects a row whose building does not exist', () => {
    const preview = previewRoomRows([row({ 'Building ID': 'ghost' })], [], sections, buildings, floors);
    expect(preview[0].valid).toBe(false);
    expect(preview[0].errors.join(' ')).toMatch(/does not exist/);
  });

  it('rejects a row whose floor does not exist for that building', () => {
    const preview = previewRoomRows([row({ 'Floor ID': 'ghost-floor' })], [], sections, buildings, floors);
    expect(preview[0].valid).toBe(false);
    expect(preview[0].errors.join(' ')).toMatch(/does not exist/);
  });

  it('rejects a row missing Facility ID entirely', () => {
    const preview = previewRoomRows([row({ 'Facility ID': '' })], [], sections, buildings, floors);
    expect(preview[0].valid).toBe(false);
  });
});

describe('Room import — nonblank section references an existing section on the correct floor', () => {
  it('rejects a section that does not exist', () => {
    const preview = previewRoomRows([row({ 'Section ID': 'ghost-section' })], [], sections, buildings, floors);
    expect(preview[0].valid).toBe(false);
    expect(preview[0].errors.join(' ')).toMatch(/does not exist/);
  });

  it('rejects a section that exists but belongs to a different floor', () => {
    const preview = previewRoomRows([row({ 'Floor ID': '500-2', 'Section ID': '500-1-CPC1' })], [], sections, buildings, floors);
    expect(preview[0].valid).toBe(false);
    expect(preview[0].errors.join(' ')).toMatch(/different floor/);
  });

  it('accepts a section that exists and matches the row floor', () => {
    const preview = previewRoomRows([row({ 'Section ID': '500-1-CPC1' })], [], sections, buildings, floors);
    expect(preview[0].valid).toBe(true);
    expect(preview[0].sectionPending).toBe(false);
  });
});

describe('Room import — missing section remains pending, is never guessed', () => {
  it('a blank Section ID is valid and marked sectionPending, not an error', () => {
    const preview = previewRoomRows([row({ 'Section ID': '' })], [], sections, buildings, floors);
    expect(preview[0].valid).toBe(true);
    expect(preview[0].sectionPending).toBe(true);
    expect(preview[0].normalized.sectionId).toBe('');
  });
});

describe('Room import — duplicate rooms in the same building and floor', () => {
  it('flags the second occurrence of the same room number in the same facility/building/floor within a batch', () => {
    const rows = [
      row({ 'Room ID': '500-1-1A101', 'Room Number': '1A-101' }),
      row({ 'Room ID': '500-1-1A101-dup', 'Room Number': '1A-101' }),
    ];
    const preview = previewRoomRows(rows, [], sections, buildings, floors);
    expect(preview[0].valid).toBe(true);
    expect(preview[1].valid).toBe(false);
    expect(preview[1].errors.join(' ')).toMatch(/Duplicate room/);
  });

  it('flags a new row that duplicates an existing room under a different Room ID', () => {
    const existingRooms = [{ id: '500-1-1A101', facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1', roomNumber: '1A-101' }];
    const preview = previewRoomRows([row({ 'Room ID': 'new-different-id', 'Room Number': '1A-101' })], existingRooms, sections, buildings, floors);
    expect(preview[0].valid).toBe(false);
    expect(preview[0].errors.join(' ')).toMatch(/Duplicate room/);
  });
});

describe('Room import — same room number in a different building is allowed', () => {
  it('does not flag a duplicate when the room number repeats in a different building', () => {
    const buildings2 = [...buildings, { id: '501', facilityId: 'martinsburg-va' }];
    const floors2 = [...floors, { id: '501-1', buildingId: '501' }];
    const rows = [
      row({ 'Room ID': 'r1', 'Building ID': '500', 'Floor ID': '500-1', 'Room Number': '1A-101' }),
      row({ 'Room ID': 'r2', 'Building ID': '501', 'Floor ID': '501-1', 'Room Number': '1A-101' }),
    ];
    const preview = previewRoomRows(rows, [], sections, buildings2, floors2);
    expect(preview[0].valid).toBe(true);
    expect(preview[1].valid).toBe(true);
  });
});

describe('Room import — blank rows are counted separately from rejected rows', () => {
  it('a fully blank row is marked blank, not an error', () => {
    const blankRow = Object.fromEntries(Object.keys(row()).map((k) => [k, '']));
    const preview = previewRoomRows([blankRow], [], sections, buildings, floors);
    expect(preview[0].blank).toBe(true);
    expect(preview[0].valid).toBe(false);
  });
});

describe('summarizeRoomImportPreview()', () => {
  it('produces the required counts: total/valid/blank/duplicate/missing-parent/missing-section/rejected/warning/new/updated', () => {
    const rows = [
      row({ 'Room ID': 'r1', 'Room Number': '1A-101' }), // valid, new, section pending
      row({ 'Room ID': 'r1', 'Room Number': '1A-102' }), // duplicate Room ID (within batch — caught separately)
      row({ 'Building ID': 'ghost', 'Room ID': 'r3' }), // missing parent
    ];
    const preview = previewRoomRows(rows, [], sections, buildings, floors);
    const summary = summarizeRoomImportPreview(preview);
    expect(summary.totalRows).toBe(3);
    expect(summary.missingParentRows).toBeGreaterThan(0);
    expect(summary.missingSectionRows).toBeGreaterThanOrEqual(1);
    expect(summary.newRooms).toBeGreaterThanOrEqual(1);
  });
});

describe('Room import — merge mode preserves unrelated existing rooms', () => {
  it('never removes an existing room that is absent from the uploaded file', () => {
    const existingRooms = [
      { id: 'existing-1', facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1', roomNumber: '1A-999', status: 'completed' },
    ];
    const preview = previewRoomRows([row({ 'Room ID': 'new-room', 'Room Number': '1A-101' })], existingRooms, sections, buildings, floors);
    const { data } = applyRoomImport(preview, existingRooms);
    expect(data.some((r) => r.id === 'existing-1')).toBe(true); // preserved
    expect(data.some((r) => r.id === 'new-room')).toBe(true); // added
    expect(data).toHaveLength(2);
  });

  it('updates a matching existing room rather than duplicating it', () => {
    const existingRooms = [
      { id: 'r1', facilityId: 'martinsburg-va', buildingId: '500', floorId: '500-1', roomNumber: '1A-101', status: 'not_started' },
    ];
    const preview = previewRoomRows([row({ 'Room ID': 'r1', 'Status': 'Completed' })], existingRooms, sections, buildings, floors);
    const { data, updated } = applyRoomImport(preview, existingRooms);
    expect(updated).toBe(1);
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe('completed');
  });
});
