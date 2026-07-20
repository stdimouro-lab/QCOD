import { useState, useMemo } from 'react';
import {
  getMasterAssetList, saveMasterAssetList, getMasterAssetListImportStatus,
  getAssets, getQcRecords, getResearchRecords, getBuildings,
} from '../lib/data';
import {
  normalizeMasterAssetRows, compareToScannedInventory, summarizeComparison,
} from '../lib/masterAssetList';
import { readWorkbookFile, getWorksheetNames, worksheetToRows, downloadJson } from '../lib/fileImport';
import { exportReportToExcel } from '../lib/exportExcel';
import { exportReportToPdf } from '../lib/exportPdf';

function fmtTimestamp(value) {
  if (!value) return 'Not Imported';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

const COLUMNS = [
  { header: 'Asset Number', key: 'assetNumber' }, { header: 'Description', key: 'description' },
  { header: 'Serial Number', key: 'serialNumber' }, { header: 'Manufacturer', key: 'manufacturer' },
  { header: 'Model', key: 'model' }, { header: 'Building', key: 'buildingId' }, { header: 'Room', key: 'roomId' },
  { header: 'Department', key: 'department' }, { header: 'Status', key: 'status' },
  { header: 'Found in Scan', key: 'foundInScanLabel' }, { header: 'Serial Match', key: 'serialMatchLabel' },
  { header: 'QC Status', key: 'qcStatusLabel' }, { header: 'Research Status', key: 'researchStatusLabel' },
  { header: 'Last Imported', key: 'lastImported' },
];

export default function MasterAssetList() {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [applyResult, setApplyResult] = useState(null);

  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [comparisonFilter, setComparisonFilter] = useState(''); // '', 'missing', 'serial_mismatch', 'has_qc', 'has_research'

  const importStatus = getMasterAssetListImportStatus();
  const buildings = getBuildings();

  const comparison = useMemo(() => {
    const master = getMasterAssetList();
    const scanned = getAssets();
    const qc = getQcRecords();
    const research = getResearchRecords();
    return compareToScannedInventory(master, scanned, qc, research).map((r) => ({
      ...r,
      foundInScanLabel: r.foundInScan ? 'Yes' : 'No',
      serialMatchLabel: r.serialMatch === null ? 'N/A' : r.serialMatch ? 'Match' : 'Mismatch',
      qcStatusLabel: r.qcStatus || '—',
      researchStatusLabel: r.researchStatus || '—',
    }));
  }, [applyResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = summarizeComparison(comparison);

  let visible = comparison;
  if (buildingFilter) visible = visible.filter((r) => r.buildingId === buildingFilter);
  if (comparisonFilter === 'missing') visible = visible.filter((r) => !r.foundInScan);
  if (comparisonFilter === 'serial_mismatch') visible = visible.filter((r) => r.serialMatch === false);
  if (comparisonFilter === 'has_qc') visible = visible.filter((r) => r.qcStatus);
  if (comparisonFilter === 'has_research') visible = visible.filter((r) => r.researchStatus);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    visible = visible.filter((r) =>
      r.assetNumber?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.serialNumber?.toLowerCase().includes(q)
    );
  }

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    setApplyResult(null);
    try {
      const wb = await readWorkbookFile(f);
      const sheet = getWorksheetNames(wb)[0];
      setFile(f);
      setRows(worksheetToRows(wb, sheet));
    } catch (err) {
      setError(`Could not read this file: ${err.message}`);
    }
  };

  const preview = rows.length > 0 ? normalizeMasterAssetRows(rows) : null;

  const handleApply = () => {
    if (!preview) return;
    saveMasterAssetList(preview.assets);
    setApplyResult({ message: `Master Asset List updated: ${preview.assets.length} record(s).` });
    setRows([]);
    setFile(null);
  };

  const handleExportJson = () => {
    downloadJson(comparison, `QCOD_Master_Asset_List_Comparison_${new Date().toISOString().slice(0, 10)}.json`);
  };

  return (
    <section className="panel">
      <h2>Master Asset List</h2>
      <p className="local-only-note">
        Files are processed locally in this browser and are not uploaded to a server.
      </p>
      <p className="empty-note">
        This is the VA's official reference asset file — QCOD's comparison dataset, not a mapping tool.
        AssetWorx still owns assigning room/location upstream; this tab shows how QCOD's own scanned
        inventory compares against the official list: found or missing, serial match, and QC/Research status.
      </p>

      <dl className="asset-dl">
        <div><dt>Master Records</dt><dd>{importStatus.count || 0}</dd></div>
        <div><dt>Last Imported</dt><dd>{fmtTimestamp(importStatus.lastImportedAt)}</dd></div>
        <div><dt>Found in Scan</dt><dd>{summary.found}</dd></div>
        <div><dt>Missing from Scan</dt><dd>{summary.missing}</dd></div>
        <div><dt>Serial Mismatches</dt><dd>{summary.serialMismatches}</dd></div>
        <div><dt>With Active QC</dt><dd>{summary.withQc}</dd></div>
        <div><dt>With Active Research</dt><dd>{summary.withResearch}</dd></div>
      </dl>

      <h3 className="import-subheading">Import Master Asset List</h3>
      <div className="import-controls">
        <label>
          File (Excel/CSV from VA)
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
        </label>
      </div>
      {error && <p className="empty-note import-error">{error}</p>}

      {preview && (
        <>
          <dl className="asset-dl">
            <div><dt>Total rows read</dt><dd>{preview.stats.totalRows}</dd></div>
            <div><dt>Blank/invalid rows skipped</dt><dd>{preview.stats.blankRows}</dd></div>
            <div><dt>Valid records</dt><dd>{preview.stats.validCount}</dd></div>
          </dl>
          <p className="empty-note">Applying replaces the current Master Asset List with this file's contents.</p>
          <div className="import-actions">
            <button className="btn-primary" onClick={handleApply}>Apply — Replace Master Asset List</button>
            <button className="btn-secondary" onClick={() => { setRows([]); setFile(null); }}>Clear</button>
          </div>
        </>
      )}
      {applyResult && <p className="import-success">{applyResult.message}</p>}

      <hr className="import-divider" />

      <h3 className="import-subheading">Compare Against Scanned Inventory</h3>
      <div className="import-controls">
        <label>
          Building
          <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)}>
            <option value="">All Buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
          </select>
        </label>
        <label>
          Comparison
          <select value={comparisonFilter} onChange={(e) => setComparisonFilter(e.target.value)}>
            <option value="">All</option>
            <option value="missing">Missing from Scan</option>
            <option value="serial_mismatch">Serial Mismatch</option>
            <option value="has_qc">Has Active QC</option>
            <option value="has_research">Has Active Research</option>
          </select>
        </label>
        <label>
          Search
          <input type="text" placeholder="Asset #, description, serial" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="import-actions">
        <button className="btn-primary" onClick={() => exportReportToExcel({ reportName: 'Master Asset List Comparison', columns: COLUMNS, rows: visible })}>Export Excel</button>
        <button className="btn-secondary" onClick={() => exportReportToPdf({ reportName: 'Master Asset List Comparison', columns: COLUMNS, rows: visible, emptyMessage: 'No master asset list has been imported yet.' })}>Export PDF</button>
        <button className="btn-secondary" onClick={handleExportJson}>Download JSON</button>
      </div>

      {visible.length === 0 ? (
        <p className="empty-note">
          {comparison.length === 0 ? 'No Master Asset List has been imported yet.' : 'No records match the selected filters.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>{COLUMNS.map((c) => <th key={c.key}>{c.header}</th>)}</tr></thead>
            <tbody>
              {visible.slice(0, 150).map((r) => (
                <tr key={r.assetNumber}>
                  {COLUMNS.map((c) => <td key={c.key}>{r[c.key] || '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length > 150 && <p className="empty-note">Showing first 150 of {visible.length} records.</p>}
        </div>
      )}
    </section>
  );
}
