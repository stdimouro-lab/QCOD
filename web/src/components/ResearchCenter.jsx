import { useState } from 'react';
import { getResearchRecords, getFacilities, getBuildings, saveLocalData, LOCAL_KEYS } from '../lib/data';
import { exportReportToExcel } from '../lib/exportExcel';
import { exportReportToPdf } from '../lib/exportPdf';

const COLUMNS = [
  { header: 'Date Found', key: 'Date Found' }, { header: 'Facility', key: 'Facility' },
  { header: 'Building', key: 'Building' }, { header: 'Floor', key: 'Floor' },
  { header: 'Section', key: 'Section' }, { header: 'Asset Number', key: 'Asset Number' },
  { header: 'Serial Number', key: 'Serial Number' }, { header: 'Description', key: 'Description' },
  { header: 'Issue Type', key: 'Issue Type' }, { header: 'Status', key: 'Status' }, { header: 'Notes', key: 'Notes' },
];

export default function ResearchCenter() {
  const [search, setSearch] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const facilities = getFacilities();
  const buildings = getBuildings();

  let records = getResearchRecords();
  if (facilityFilter) records = records.filter((r) => r['Facility'] === facilityFilter);
  if (buildingFilter) records = records.filter((r) => r['Building'] === buildingFilter);
  if (statusFilter) records = records.filter((r) => r['Status'] === statusFilter);
  if (startDate) records = records.filter((r) => (r['Date Found'] || '') >= startDate);
  if (endDate) records = records.filter((r) => (r['Date Found'] || '') <= endDate);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    records = records.filter((r) => Object.values(r).some((v) => (v ?? '').toString().toLowerCase().includes(q)));
  }

  const statusOptions = [...new Set(getResearchRecords().map((r) => r['Status']).filter(Boolean))];

  const handleClear = () => {
    if (!window.confirm('This clears all locally stored Research Item records on this computer. Continue?')) return;
    saveLocalData(LOCAL_KEYS.researchRecords, []);
  };

  return (
    <section className="panel">
      <h2>Research Items</h2>
      <p className="local-only-note">
        QCOD currently runs locally. Selected files are processed in this browser and are not uploaded to a server.
      </p>
      <p className="empty-note">
        Research records are created automatically during an AssetWorx/ENEX import when a real, explicit
        condition is met (missing serial number, unmatched or ambiguous location, duplicate asset/serial,
        marked Not Found in DB, etc.) — never guessed. A known scanner misread ("613 E..." missing the second
        E) is excluded from the import entirely and never becomes a Research item.
      </p>

      <div className="import-controls">
        <label>Search<input type="text" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label>
          Facility
          <select value={facilityFilter} onChange={(e) => setFacilityFilter(e.target.value)}>
            <option value="">All Facilities</option>
            {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label>
          Building
          <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)}>
            <option value="">All Buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>End date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      </div>

      <p className="empty-note">{records.length} record{records.length === 1 ? '' : 's'} found.</p>

      <div className="import-actions">
        <button className="btn-primary" onClick={() => exportReportToExcel({ reportName: 'Research Records', columns: COLUMNS, rows: records, filters: { facilityFilter, buildingFilter, statusFilter, startDate, endDate } })}>Export Excel</button>
        <button className="btn-secondary" onClick={() => exportReportToPdf({ reportName: 'Research Records', columns: COLUMNS, rows: records, filters: { facilityFilter, buildingFilter, statusFilter, startDate, endDate } })}>Export PDF</button>
        <button className="btn-danger" onClick={handleClear}>Clear Local Data</button>
      </div>

      {records.length === 0 ? (
        <p className="empty-note">No Research records have been imported yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>{COLUMNS.map((c) => <th key={c.key}>{c.header}</th>)}</tr></thead>
            <tbody>
              {records.slice(0, 100).map((r, i) => (
                <tr key={i}>{COLUMNS.map((c) => <td key={c.key}>{r[c.key] || '—'}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {records.length > 100 && <p className="empty-note">Showing first 100 of {records.length} records.</p>}
        </div>
      )}
    </section>
  );
}
