import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { project } from './data';

function filtersToLine(filters) {
  const active = Object.entries(filters || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  if (active.length === 0) return 'Filters: None';
  return `Filters: ${active.map(([k, v]) => `${k} = ${v}`).join(', ')}`;
}

export function exportReportToPdf({ reportName, filters = {}, columns, rows, summaryLines = [], emptyMessage }) {
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
  if (summaryLines.length > 0) {
    doc.setFontSize(9);
    summaryLines.forEach((line, i) => {
      doc.text(line, 14, cursorY + i * 5);
    });
    cursorY += summaryLines.length * 5 + 4;
  }

  if (rows.length === 0) {
    doc.setFontSize(10);
    doc.text(emptyMessage || 'No data was recorded at the time this report was generated.', 14, cursorY);
  } else {
    autoTable(doc, {
      startY: cursorY,
      head: [columns.map((c) => c.header)],
      body: rows.map((row) => columns.map((c) => (row[c.key] ?? '').toString())),
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

  const filename = `QCOD_${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}
