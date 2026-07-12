import { describe, it, expect } from 'vitest';
import { previewSectionRows, applySectionPreview } from '../fileImport.js';

const sectionsData = [
  {
    id: '500-1-CPC1', buildingId: '500', floorId: '500-1', name: 'CPC 1',
    status: 'not_started', completionPct: 0, expectedAssets: 0, foundAssets: 0, taggedAssets: 0,
    assetCompletionPct: 0, notes: '', lastUpdate: '',
  },
  {
    id: '500-1-WOMENSCLINIC', buildingId: '500', floorId: '500-1', name: "Women's Clinic",
    status: 'not_started', completionPct: 0, expectedAssets: 0, foundAssets: 0, taggedAssets: 0,
    assetCompletionPct: 0, notes: '', lastUpdate: '',
  },
];
const floorsData = [{ id: '500-1', buildingId: '500', name: '1st Floor', level: 1 }];

describe('previewSectionRows() matching', () => {
  it('matches case-insensitively', () => {
    const rows = [{ Building: '500', Floor: '1', Section: 'cpc 1', Status: 'Completed' }];
    const preview = previewSectionRows(rows, sectionsData, floorsData);
    expect(preview[0].matched).toBe(true);
    expect(preview[0].section.id).toBe('500-1-CPC1');
  });

  it('matches with trimmed/extra whitespace', () => {
    const rows = [{ Building: ' 500 ', Floor: ' 1 ', Section: '  CPC 1  ', Status: 'Completed' }];
    const preview = previewSectionRows(rows, sectionsData, floorsData);
    expect(preview[0].matched).toBe(true);
  });

  it('matches names with common punctuation differences (apostrophe)', () => {
    const rows = [{ Building: '500', Floor: '1', Section: 'Womens Clinic', Status: 'Completed' }];
    const preview = previewSectionRows(rows, sectionsData, floorsData);
    expect(preview[0].matched).toBe(true);
    expect(preview[0].section.id).toBe('500-1-WOMENSCLINIC');
  });

  it('reports an unmatched row when the section does not exist, and never creates one', () => {
    const rows = [{ Building: '500', Floor: '1', Section: 'Nonexistent Section', Status: 'Completed' }];
    const preview = previewSectionRows(rows, sectionsData, floorsData);
    expect(preview[0].matched).toBe(false);
    expect(preview[0].reason).toMatch(/No matching section/);
  });

  it('rejects a broken parent relationship (floor does not belong to building)', () => {
    const rows = [{ Building: '999', Floor: '1', Section: 'CPC 1', Status: 'Completed' }];
    const preview = previewSectionRows(rows, sectionsData, floorsData);
    expect(preview[0].matched).toBe(false);
  });

  it('flags an invalid status without applying it', () => {
    const rows = [{ Building: '500', Floor: '1', Section: 'CPC 1', Status: 'Whatever' }];
    const preview = previewSectionRows(rows, sectionsData, floorsData);
    expect(preview[0].matched).toBe(false);
    expect(preview[0].reason).toMatch(/Invalid status/);
  });

  it('clamps completion percent between 0 and 100 on apply', () => {
    const rows = [{ Building: '500', Floor: '1', Section: 'CPC 1', Status: 'Completed', 'Completion Percent': '150' }];
    const preview = previewSectionRows(rows, sectionsData, floorsData);
    const { sections } = applySectionPreview(preview, sectionsData);
    const updated = sections.find((s) => s.id === '500-1-CPC1');
    expect(updated.completionPct).toBe(100);
  });
});

describe('applySectionPreview() never creates new sections', () => {
  it('leaves the sections array the same length when nothing matched', () => {
    const rows = [{ Building: '500', Floor: '1', Section: 'Made Up Section', Status: 'Completed' }];
    const preview = previewSectionRows(rows, sectionsData, floorsData);
    const { sections, updatedCount } = applySectionPreview(preview, sectionsData);
    expect(sections).toHaveLength(sectionsData.length);
    expect(updatedCount).toBe(0);
  });
});
