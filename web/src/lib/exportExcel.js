import * as XLSX from 'xlsx';
import { project } from './data';

function filtersToLines(filters) {
  const active = Object.entries(filters || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  if (active.length === 0) return ['Filters: None'];
  return [`Filters: ${active.map(([k, v]) => `${k} = ${v}`).join(', ')}`];
}

// Builds a single-sheet report: a title block (QCOD, report name, facility,
// generated date/time, filters) followed by a header row and the data rows.
export function exportReportToExcel({ reportName, filters = {}, columns, rows, summaryLines = [] }) {
  const generatedAt = new Date().toLocaleString();
  const titleBlock = [
    ['QCOD'],
    ['Quality Control Operations Dashboard'],
    [reportName],
    [`Facility: ${project.facility}`],
    [`Generated: ${generatedAt}`],
    ...filtersToLines(filters).map((l) => [l]),
    ...(summaryLines.length ? [[''], ...summaryLines.map((l) => [l])] : []),
    [''],
  ];

  const headerRow = columns.map((c) => c.header);
  const dataRows = rows.map((row) => columns.map((c) => row[c.key] ?? ''));

  const sheetData = [...titleBlock, headerRow, ...dataRows];
  const sheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Readable column widths based on header + content length.
  sheet['!cols'] = columns.map((c) => {
    const maxLen = Math.max(
      c.header.length,
      ...rows.map((r) => (r[c.key] ?? '').toString().length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, reportName.slice(0, 31));

  const safeName = reportName.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  const filename = `QCOD_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, filename);
  return filename;
}
