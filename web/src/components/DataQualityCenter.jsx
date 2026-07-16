import { useState, useMemo } from 'react';
import { runDataQuality } from '../lib/data';
import { exportReportToExcel } from '../lib/exportExcel';
import { exportReportToPdf } from '../lib/exportPdf';

const COLUMNS = [
  { header: 'Category', key: 'category' }, { header: 'Severity', key: 'severity' },
  { header: 'Record Type', key: 'recordType' }, { header: 'Record ID', key: 'recordId' },
  { header: 'Description', key: 'description' }, { header: 'Suggested Correction', key: 'suggestedCorrection' },
  { header: 'Related Import', key: 'relatedImportId' },
];

export default function DataQualityCenter() {
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');

  const issues = useMemo(() => runDataQuality(), []);
  const categories = [...new Set(issues.map((i) => i.category))].sort();

  let visible = issues;
  if (severityFilter) visible = visible.filter((i) => i.severity === severityFilter);
  if (categoryFilter) visible = visible.filter((i) => i.category === categoryFilter);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    visible = visible.filter((i) => i.description.toLowerCase().includes(q) || (i.recordId ?? '').toLowerCase().includes(q));
  }

  const counts = { high: issues.filter((i) => i.severity === 'high').length, medium: issues.filter((i) => i.severity === 'medium').length, low: issues.filter((i) => i.severity === 'low').length };

  return (
    <section className="panel">
      <h2>Data Quality</h2>
      <p className="empty-note">
        Read-only. This scans current data for integrity problems — nothing here is changed, deleted, or rewritten automatically.
        Go to the relevant tab (Asset Mapping, Location Mapping, Room Assignment, Configuration) to act on an issue.
      </p>

      <dl className="asset-dl">
        <div><dt>Total Issues</dt><dd>{issues.length}</dd></div>
        <div><dt>High Severity</dt><dd>{counts.high}</dd></div>
        <div><dt>Medium Severity</dt><dd>{counts.medium}</dd></div>
        <div><dt>Low Severity</dt><dd>{counts.low}</dd></div>
      </dl>

      <div className="import-controls">
        <label>
          Severity
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Category
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label>
          Search
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="import-actions">
        <button className="btn-primary" onClick={() => exportReportToExcel({ reportName: 'Data Quality Summary', columns: COLUMNS, rows: visible })}>Export Excel</button>
        <button className="btn-secondary" onClick={() => exportReportToPdf({ reportName: 'Data Quality Summary', columns: COLUMNS, rows: visible, emptyMessage: 'No data quality issues found.' })}>Export PDF</button>
      </div>

      {visible.length === 0 ? (
        <p className="empty-note">No data quality issues match the selected filters.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>{COLUMNS.map((c) => <th key={c.key}>{c.header}</th>)}</tr></thead>
            <tbody>
              {visible.slice(0, 200).map((issue, i) => (
                <tr key={i}>
                  {COLUMNS.map((c) => <td key={c.key}>{issue[c.key] || '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length > 200 && <p className="empty-note">Showing first 200 of {visible.length} issues.</p>}
        </div>
      )}
    </section>
  );
}
