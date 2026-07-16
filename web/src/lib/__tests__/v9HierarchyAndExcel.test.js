import { describe, it, expect, vi } from 'vitest';
import { validateResolvedRoom } from '../enexLocationParser.js';
import { parseEnexLocation } from '../enexLocationParser.js';

// Test 4: invalid hierarchy rejection
describe('Invalid hierarchy rejection', () => {
  it('rejects a resolved room whose building does not match the location building', () => {
    const parsed = parseEnexLocation('SPGD111-500');
    const wrongRoom = { buildingId: '999' };
    const { valid, errors } = validateResolvedRoom(wrongRoom, parsed);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a resolved room whose building matches', () => {
    const parsed = parseEnexLocation('SPGD111-500');
    const rightRoom = { buildingId: '500' };
    expect(validateResolvedRoom(rightRoom, parsed).valid).toBe(true);
  });
});

// Test 18: Report Excel full-data behavior (Excel must never truncate, unlike PDF)
describe('Report Excel full-data behavior', () => {
  it('builds a workbook sheet containing every row, even for a very large dataset', async () => {
    const XLSX = await import('xlsx');
    const { buildReportWorkbook } = await import('../exportExcel.js');

    const rows = Array.from({ length: 3000 }, (_, i) => ({ id: i }));
    const workbook = buildReportWorkbook({ reportName: 'Large Report', columns: [{ header: 'ID', key: 'id' }], rows });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    // Title block + header row + all 3000 data rows must all be present — no truncation.
    const dataRowCount = data.length - data.findIndex((row) => row[0] === 'ID') - 1;
    expect(dataRowCount).toBe(3000);
  });
});
