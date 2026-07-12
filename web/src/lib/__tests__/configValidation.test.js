import { describe, it, expect } from 'vitest';
import {
  previewFacilityRows, previewBuildingRows, previewFloorRows,
  previewSectionConfigRows, previewRoomRows,
} from '../fileImport.js';

const facilities = [{ id: 'martinsburg-va', name: 'Martinsburg VA Medical Center' }];
const buildings = [{ id: '500', facilityId: 'martinsburg-va', name: 'Main Hospital' }];
const floors = [{ id: '500-1', buildingId: '500', name: '1st Floor', level: 1 }];
const sections = [{ id: '500-1-CPC1', floorId: '500-1', name: 'CPC 1' }];

describe('Configuration hierarchy validation', () => {
  it('building requires an existing facility', () => {
    const rows = [{ 'Facility ID': 'ghost-facility', 'Building ID': '999', 'Building Name': 'Test' }];
    const preview = previewBuildingRows(rows, [], facilities);
    expect(preview[0].valid).toBe(false);
    expect(preview[0].action).toBe('skip');
    expect(preview[0].errors.join(' ')).toMatch(/does not exist/);
  });

  it('building is accepted when its facility exists', () => {
    const rows = [{ 'Facility ID': 'martinsburg-va', 'Building ID': '999', 'Building Name': 'Test Building' }];
    const preview = previewBuildingRows(rows, buildings, facilities);
    expect(preview[0].valid).toBe(true);
    expect(preview[0].action).toBe('create');
  });

  it('floor requires an existing building', () => {
    const rows = [{ 'Facility ID': 'martinsburg-va', 'Building ID': 'ghost-building', 'Floor ID': '999-1', 'Floor Name': 'Test Floor' }];
    const preview = previewFloorRows(rows, [], buildings);
    expect(preview[0].valid).toBe(false);
    expect(preview[0].errors.join(' ')).toMatch(/does not exist/);
  });

  it('section requires an existing floor', () => {
    const rows = [{ 'Facility ID': 'martinsburg-va', 'Building ID': '500', 'Floor ID': 'ghost-floor', 'Section ID': '999-X', 'Section Name': 'Test Section' }];
    const preview = previewSectionConfigRows(rows, [], floors);
    expect(preview[0].valid).toBe(false);
    expect(preview[0].errors.join(' ')).toMatch(/does not exist/);
  });

  it('room requires an existing section', () => {
    const rows = [{ 'Facility ID': 'martinsburg-va', 'Building ID': '500', 'Floor ID': '500-1', 'Section ID': 'ghost-section', 'Room ID': '999', 'Room Number': '101' }];
    const preview = previewRoomRows(rows, [], sections);
    expect(preview[0].valid).toBe(false);
    expect(preview[0].errors.join(' ')).toMatch(/does not exist/);
  });

  it('rejects a duplicate ID within the same import batch', () => {
    const rows = [
      { 'Facility ID': 'new-fac', 'Facility Name': 'New Facility' },
      { 'Facility ID': 'new-fac', 'Facility Name': 'Duplicate' },
    ];
    const preview = previewFacilityRows(rows, facilities);
    expect(preview[0].valid).toBe(true);
    expect(preview[1].valid).toBe(false);
    expect(preview[1].errors.join(' ')).toMatch(/Duplicate/);
  });

  it('rejects rows missing required fields rather than guessing them', () => {
    const rows = [{ 'Facility ID': '', 'Facility Name': 'No ID Facility' }];
    const preview = previewFacilityRows(rows, facilities);
    expect(preview[0].valid).toBe(false);
    expect(preview[0].action).toBe('skip');
  });

  it('classifies an existing record as update, not create', () => {
    const rows = [{ 'Facility ID': 'martinsburg-va', 'Facility Name': 'Martinsburg VA Medical Center Updated' }];
    const preview = previewFacilityRows(rows, facilities);
    expect(preview[0].matched).toBe(true);
    expect(preview[0].action).toBe('update');
  });
});
