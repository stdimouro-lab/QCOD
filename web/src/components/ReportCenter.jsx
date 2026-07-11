import { useState, useMemo } from 'react';
import {
  buildings, floors, statuses, project,
  getSections, getFloorsForBuilding, getSectionsForBuilding,
  getSectionsForFloor, getOutstandingSections, getBuildingTotals, getCampusSummary,
  getProjectTotals, pct, getValidAssets, getAssetIssueCounts, getImportStatus,
} from '../lib/data';
import { exportReportToExcel } from '../lib/exportExcel';
import { exportReportToPdf } from '../lib/exportPdf';

const REPORTS = [
  { id: 'executive', label: 'Executive Summary', filters: [] },
  { id: 'campus', label: 'Campus Progress', filters: ['status'] },
  { id: 'building', label: 'Building Progress', filters: ['building'] },
  { id: 'floor', label: 'Floor Progress', filters: ['building', 'floor'] },
  { id: 'section', label: 'Section Progress', filters: ['building', 'floor', 'section', 'status'] },
  { id: 'outstanding', label: 'Outstanding Work', filters: ['building', 'floor', 'status'] },
  { id: 'assetInventory', label: 'Asset Inventory', filters: ['building', 'startDate', 'endDate'] },
  { id: 'assetIssues', label: 'Asset Issues', filters: ['building'] },
  { id: 'importStatus', label: 'Import Status', filters: [] },
];

function statusLabel(key) {
  return statuses[key]?.label ?? key;
}

function inDateRange(dateStr, start, end) {
  if (!dateStr) return !start && !end; // no date on the record — only include if no range is set
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

function buildReport(reportId, filters) {
  const sections = getSections();

  switch (reportId) {
    case 'executive': {
      const summary = getCampusSummary();
      const totals = getProjectTotals();
      const importStatus = getImportStatus();
      const assetProgress = pct(totals.tagged, totals.expected);
      const columns = [{ header: 'Metric', key: 'metric' }, { header: 'Value', key: 'value' }];
      const rows = [
        { metric: 'Buildings Configured', value: summary.buildingsConfigured },
        { metric: 'Buildings In Progress', value: summary.buildingsInProgress },
        { metric: 'Buildings Complete', value: summary.buildingsComplete },
        { metric: 'Floors Configured', value: summary.floorsConfigured },
        { metric: 'Sections Configured', value: summary.sectionsConfigured },
        { metric: 'Sections Complete', value: summary.sectionsComplete },
        { metric: 'Section Progress', value: `${totals.sectionProgress}%` },
        { metric: 'Asset Progress', value: assetProgress === null ? 'Pending' : `${assetProgress}%` },
        { metric: 'Return Needed', value: summary.returnNeeded },
        { metric: 'No Access', value: summary.noAccess },
        { metric: 'Asset Import Status', value: importStatus.lastAssetImport || 'Not Imported' },
        { metric: 'Last Section Update', value: importStatus.lastSectionImport || 'Not Imported' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: null };
    }

    case 'campus': {
      let rows = buildings.map((b) => {
        const totals = getBuildingTotals(b.id);
        const ap = pct(totals.tagged, totals.expected);
        return {
          building: `${b.id} — ${b.name}`,
          status: statusLabel(b.status),
          sections: totals.sectionCount,
          sectionProgress: `${totals.sectionProgress}%`,
          assetProgress: ap === null ? 'Pending' : `${ap}%`,
        };
      });
      if (filters.status) rows = rows.filter((r) => r.status === statusLabel(filters.status));
      const columns = [
        { header: 'Building', key: 'building' }, { header: 'Status', key: 'status' },
        { header: 'Sections', key: 'sections' }, { header: 'Section Progress', key: 'sectionProgress' },
        { header: 'Asset Progress', key: 'assetProgress' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: 'No buildings matched the selected filters.' };
    }

    case 'building': {
      const buildingId = filters.building || project.focusBuilding;
      const building = buildings.find((b) => b.id === buildingId);
      const buildingFloors = getFloorsForBuilding(buildingId);
      const rows = buildingFloors.map((f) => {
        const fSections = getSectionsForFloor(f.id);
        const avgPct = fSections.length
          ? Math.round(fSections.reduce((s, sec) => s + (sec.completionPct || 0), 0) / fSections.length)
          : 0;
        return {
          floor: f.name, status: statusLabel(f.status), sections: fSections.length, sectionProgress: `${avgPct}%`,
        };
      });
      const columns = [
        { header: 'Floor', key: 'floor' }, { header: 'Status', key: 'status' },
        { header: 'Tracked Sections', key: 'sections' }, { header: 'Section Progress', key: 'sectionProgress' },
      ];
      return {
        columns, rows,
        summaryLines: [`Building: ${building ? `${building.id} — ${building.name}` : buildingId}`],
        emptyMessage: 'No floors configured for this building.',
      };
    }

    case 'floor': {
      const buildingId = filters.building || project.focusBuilding;
      let scopeFloors = getFloorsForBuilding(buildingId);
      if (filters.floor) scopeFloors = scopeFloors.filter((f) => f.id === filters.floor);
      const rows = scopeFloors.map((f) => {
        const fSections = getSectionsForFloor(f.id);
        const avgPct = fSections.length
          ? Math.round(fSections.reduce((s, sec) => s + (sec.completionPct || 0), 0) / fSections.length)
          : 0;
        return {
          floor: f.name, status: statusLabel(f.status), sections: fSections.length,
          sectionProgress: `${avgPct}%`, notes: f.mapNotes || '',
        };
      });
      const columns = [
        { header: 'Floor', key: 'floor' }, { header: 'Status', key: 'status' },
        { header: 'Tracked Sections', key: 'sections' }, { header: 'Section Progress', key: 'sectionProgress' },
        { header: 'Notes', key: 'notes' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: 'No floors matched the selected filters.' };
    }

    case 'section': {
      let scoped = sections;
      if (filters.building) scoped = scoped.filter((s) => s.buildingId === filters.building);
      if (filters.floor) scoped = scoped.filter((s) => s.floorId === filters.floor);
      if (filters.section) scoped = scoped.filter((s) => s.id === filters.section);
      if (filters.status) scoped = scoped.filter((s) => s.status === filters.status);
      const rows = scoped.map((s) => ({
        floor: floors.find((f) => f.id === s.floorId)?.name ?? s.floorId,
        section: s.name,
        status: statusLabel(s.status),
        completionPct: `${s.completionPct || 0}%`,
        expectedAssets: s.expectedAssets || 'Pending',
        tagged: s.taggedAssets || 'Pending',
        lastUpdate: s.lastUpdate || 'Not Updated',
        notes: s.notes || '',
      }));
      const columns = [
        { header: 'Floor', key: 'floor' }, { header: 'Section', key: 'section' },
        { header: 'Status', key: 'status' }, { header: 'Section Progress', key: 'completionPct' },
        { header: 'Expected Assets', key: 'expectedAssets' }, { header: 'Tagged', key: 'tagged' },
        { header: 'Last Updated', key: 'lastUpdate' }, { header: 'Notes', key: 'notes' },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: 'No sections matched the selected filters.' };
    }

    case 'outstanding': {
      let outstanding = getOutstandingSections(sections);
      if (filters.building) outstanding = outstanding.filter((s) => s.buildingId === filters.building);
      if (filters.floor) outstanding = outstanding.filter((s) => s.floorId === filters.floor);
      if (filters.status) outstanding = outstanding.filter((s) => s.status === filters.status);
      const rows = outstanding.map((s) => ({
        building: s.buildingId,
        floor: floors.find((f) => f.id === s.floorId)?.name ?? s.floorId,
        section: s.name,
        status: statusLabel(s.status),
        completionPct: `${s.completionPct || 0}%`,
        lastUpdate: s.lastUpdate || 'Not Updated',
        notes: s.notes || '',
      }));
      const columns = [
        { header: 'Building', key: 'building' }, { header: 'Floor', key: 'floor' },
        { header: 'Section', key: 'section' }, { header: 'Status', key: 'status' },
        { header: 'Completion Percent', key: 'completionPct' }, { header: 'Last Updated', key: 'lastUpdate' },
        { header: 'Notes', key: 'notes' },
      ];
      return {
        columns, rows, summaryLines: [],
        emptyMessage: 'No outstanding sections were recorded at the time this report was generated.',
      };
    }

    case 'assetInventory': {
      let valid = getValidAssets();
      if (filters.building) valid = valid.filter((a) => a.buildingId === filters.building);
      if (filters.startDate || filters.endDate) {
        valid = valid.filter((a) => inDateRange(a.lastInventoried, filters.startDate, filters.endDate));
      }
      const rows = valid.map((a) => ({
        assetNumber: a.assetNumber, serialNumber: a.serialNumber || 'Pending',
        description: a.description, locationName: a.locationName,
        lastInventoried: a.lastInventoried || 'Pending',
        building: a.buildingId || 'Unmapped',
      }));
      const columns = [
        { header: 'Asset Number', key: 'assetNumber' }, { header: 'Serial Number', key: 'serialNumber' },
        { header: 'Description', key: 'description' }, { header: 'Location Name', key: 'locationName' },
        { header: 'Last Inventoried', key: 'lastInventoried' }, { header: 'Building', key: 'building' },
      ];
      return {
        columns, rows,
        summaryLines: [`Total valid assets: ${valid.length}`],
        emptyMessage: 'No assets have been imported yet.',
      };
    }

    case 'assetIssues': {
      let valid = getValidAssets().filter((a) => Array.isArray(a.issueTypes) && a.issueTypes.length > 0);
      if (filters.building) valid = valid.filter((a) => a.buildingId === filters.building);
      const issueLabel = { missing_serial_number: 'Missing Serial Number', not_found_in_db: 'Not Found in DB', new_asset_offline_sync: 'New Asset / Offline Sync' };
      const rows = valid.map((a) => ({
        assetNumber: a.assetNumber, serialNumber: a.serialNumber || 'Pending',
        description: a.description, locationName: a.locationName,
        lastInventoried: a.lastInventoried || 'Pending',
        issueTypes: (a.issueTypes || []).map((t) => issueLabel[t] ?? t).join(', '),
      }));
      const counts = getAssetIssueCounts();
      const columns = [
        { header: 'Asset Number', key: 'assetNumber' }, { header: 'Serial Number', key: 'serialNumber' },
        { header: 'Description', key: 'description' }, { header: 'Location Name', key: 'locationName' },
        { header: 'Last Inventoried', key: 'lastInventoried' }, { header: 'Issue Types', key: 'issueTypes' },
      ];
      return {
        columns, rows,
        summaryLines: [
          `Missing Serial Number: ${counts.missingSerialNumber}`,
          `Not Found in DB: ${counts.notFoundInDatabase}`,
          `New Asset / Offline Sync: ${counts.newAssetOfflineSync}`,
        ],
        emptyMessage: 'No asset issues were recorded at the time this report was generated.',
      };
    }

    case 'importStatus': {
      const s = getImportStatus();
      const columns = [{ header: 'Field', key: 'field' }, { header: 'Value', key: 'value' }];
      const rows = [
        { field: 'Last Asset Import', value: s.lastAssetImport || 'Not Imported' },
        { field: 'Last Section Import', value: s.lastSectionImport || 'Not Imported' },
        { field: 'Last Backup Export', value: s.lastBackupExport || 'Not Imported' },
        { field: 'Assets Imported', value: s.assetsImported || 0 },
        { field: 'Assets Mapped', value: s.assetsMapped || 0 },
        { field: 'Assets Unmapped', value: s.assetsUnmapped || 0 },
        { field: 'Sections Updated', value: s.sectionsUpdated || 0 },
      ];
      return { columns, rows, summaryLines: [], emptyMessage: null };
    }

    default:
      return { columns: [], rows: [], summaryLines: [], emptyMessage: 'Unknown report.' };
  }
}

export default function ReportCenter() {
  const [reportId, setReportId] = useState('executive');
  const [filters, setFilters] = useState({});

  const report = REPORTS.find((r) => r.id === reportId);
  const buildingId = filters.building || '';
  const scopedFloors = buildingId ? getFloorsForBuilding(buildingId) : floors;
  const scopedSections = buildingId ? getSectionsForBuilding(buildingId) : getSections();

  const { columns, rows, summaryLines, emptyMessage } = useMemo(
    () => buildReport(reportId, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportId, filters]
  );

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const handleReportChange = (id) => {
    setReportId(id);
    setFilters({});
  };

  return (
    <section className="panel">
      <h2>Reports</h2>
      <p className="local-only-note">
        QCOD currently runs locally. Selected files are processed in this browser and are not uploaded to a server.
      </p>

      <div className="import-controls">
        <label>
          Report
          <select value={reportId} onChange={(e) => handleReportChange(e.target.value)}>
            {REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>

        {report.filters.includes('building') && (
          <label>
            Building
            <select value={filters.building || ''} onChange={(e) => setFilter('building', e.target.value)}>
              <option value="">All Buildings</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>
          </label>
        )}

        {report.filters.includes('floor') && (
          <label>
            Floor
            <select value={filters.floor || ''} onChange={(e) => setFilter('floor', e.target.value)}>
              <option value="">All Floors</option>
              {scopedFloors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        )}

        {report.filters.includes('section') && (
          <label>
            Section
            <select value={filters.section || ''} onChange={(e) => setFilter('section', e.target.value)}>
              <option value="">All Sections</option>
              {scopedSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}

        {report.filters.includes('status') && (
          <label>
            Status
            <select value={filters.status || ''} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">All Statuses</option>
              {Object.keys(statuses).map((key) => <option key={key} value={key}>{statuses[key].label}</option>)}
            </select>
          </label>
        )}

        {report.filters.includes('startDate') && (
          <label>
            Start date
            <input type="date" value={filters.startDate || ''} onChange={(e) => setFilter('startDate', e.target.value)} />
          </label>
        )}

        {report.filters.includes('endDate') && (
          <label>
            End date
            <input type="date" value={filters.endDate || ''} onChange={(e) => setFilter('endDate', e.target.value)} />
          </label>
        )}
      </div>

      <div className="import-actions">
        <button
          className="btn-primary"
          onClick={() => exportReportToExcel({ reportName: report.label, filters, columns, rows, summaryLines })}
        >
          Export Excel
        </button>
        <button
          className="btn-secondary"
          onClick={() => exportReportToPdf({ reportName: report.label, filters, columns, rows, summaryLines, emptyMessage })}
        >
          Export PDF
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="empty-note">{emptyMessage}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((row, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key}>{row[c.key]}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && <p className="empty-note">Showing first 50 of {rows.length} rows. Export for the full report.</p>}
        </div>
      )}
    </section>
  );
}
