import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { project } from './data';

const MAX_PDF_ROWS = 2000; // beyond this, PDF generation risks being slow/memory-heavy in-browser
const MAX_PDF_COLUMNS = 12; // very wide tables become unreadable/broken in a paginated PDF

function filtersToLine(filters) {
  const active = Object.entries(filters || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  if (active.length === 0) return 'Filters: None';
  return `Filters: ${active.map(([k, v]) => `${k} = ${v}`).join(', ')}`;
}

// Pure — testable without touching jsPDF. Decides whether a report is safe
// to render in full, and what warning (if any) to show.
export function assessReportSize(rows, columns) {
  const rowCount = rows?.length ?? 0;
  const columnCount = columns?.length ?? 0;
  const truncated = rowCount > MAX_PDF_ROWS;
  const warnings = [];
  if (truncated) {
    warnings.push(`This report has ${rowCount} rows — showing the first ${MAX_PDF_ROWS} in this PDF. Use Export Excel for the complete data set.`);
  }
  if (columnCount > MAX_PDF_COLUMNS) {
    warnings.push(`This report has ${columnCount} columns, which may not display cleanly in PDF. Consider Export Excel for wide tables.`);
  }
  return { rowCount, columnCount, truncated, safeRowLimit: MAX_PDF_ROWS, warnings };
}

// Strips characters that are invalid in Windows/macOS filenames.
export function sanitizeFilename(name) {
  return (name ?? '').toString().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

export function exportReportToPdf({ reportName, filters = {}, columns, rows, summaryLines = [], emptyMessage }) {
  const { truncated, warnings, safeRowLimit } = assessReportSize(rows, columns);
  const renderRows = truncated ? rows.slice(0, safeRowLimit) : rows;

  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
  const generatedAt = new Date().toLocaleString();

  doc.setFontSize(16);
  doc.text('QCOD', 14, 16);
  doc.setFontSize(11);
  doc.text('Quality Control Operations Dashboard', 14, 23);
  doc.setFontSize(9);
  doc.text('Internal Operations Tool', 14, 29);
  doc.text(project.facility, 14, 34);

  doc.setFontSize(13);
  doc.text(reportName, 14, 45);
  doc.setFontSize(9);
  doc.text(`Generated: ${generatedAt}`, 14, 51);
  doc.text(filtersToLine(filters), 14, 56);

  let cursorY = 62;
  const allSummaryLines = [...summaryLines, ...warnings];
  if (allSummaryLines.length > 0) {
    doc.setFontSize(9);
    allSummaryLines.forEach((line, i) => {
      doc.text(line, 14, cursorY + i * 5);
    });
    cursorY += allSummaryLines.length * 5 + 4;
  }

  if (renderRows.length === 0) {
    doc.setFontSize(10);
    doc.text(emptyMessage || 'No data was recorded at the time this report was generated.', 14, cursorY);
  } else {
    autoTable(doc, {
      startY: cursorY,
      head: [columns.map((c) => c.header)],
      body: renderRows.map((row) => columns.map((c) => (row[c.key] ?? '').toString())),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 35, 70] },
      didDrawPage: () => {
        const pageCount = doc.internal.getNumberOfPages();
        const pageCurrent = doc.internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(8);
        doc.text(
          `Page ${pageCurrent} of ${pageCount}`,
          doc.internal.pageSize.getWidth() - 30,
          doc.internal.pageSize.getHeight() - 8
        );
        doc.text('Proof of Concept', 14, doc.internal.pageSize.getHeight() - 8);
      },
    });
  }

  const filename = `QCOD_${sanitizeFilename(reportName)}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}
