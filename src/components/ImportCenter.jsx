import { useState } from 'react';
import {
  getSections, floors, LOCAL_KEYS, saveLocalData, saveImportStatus,
  exportQcodBackup, importQcodBackup, clearLocalData, getAssets,
} from '../lib/data';
import {
  readWorkbookFile, getWorksheetNames, worksheetToRows, downloadJson,
  normalizeAssetRows, previewSectionRows, applySectionPreview, getField,
} from '../lib/fileImport';

const IMPORT_TYPES = [
  {
    id: 'assetworx',
    label: 'AssetWorx Inventory',
    accept: '.xlsx,.xls,.csv',
    requiredHeaders: ['Name', 'Serial Number', 'Description', 'Location Name', 'CMR', 'Last Inventoried', 'Last Observed Time', 'Disposal Status'],
    previewOnly: false,
  },
  {
    id: 'section',
    label: 'Section Progress',
    accept: '.xlsx,.xls,.csv',
    requiredHeaders: ['Building', 'Floor', 'Section', 'Status', 'Completion Percent', 'Expected Assets', 'Found Assets', 'Tagged Assets', 'Last Updated', 'Notes'],
    previewOnly: false,
  },
  {
    id: 'qc',
    label: 'Daily QC Log',
    accept: '.xlsx,.xls,.csv',
    requiredHeaders: ['Date', 'Building', 'Floor', 'Section', 'Department Area', 'Tag Location', 'Equipment Description', 'EE Tag Number', 'Serial Number', 'QC Status', 'Notes'],
    previewOnly: true,
  },
  {
    id: 'research',
    label: 'Research Items',
    accept: '.xlsx,.xls,.csv',
    requiredHeaders: ['Date Found', 'Building', 'Floor', 'Section', 'Asset Number', 'Serial Number', 'Description', 'Issue Type', 'Status', 'Notes'],
    previewOnly: true,
  },
];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportCenter() {
  const [importTypeId, setImportTypeId] = useState('assetworx');
  const [file, setFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');

  const importType = IMPORT_TYPES.find((t) => t.id === importTypeId);

  const reset = () => {
    setFile(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setRows([]);
    setError('');
    setApplied(false);
  };

  const handleTypeChange = (id) => {
    setImportTypeId(id);
    reset();
  };

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setApplied(false);
    setError('');
    try {
      const wb = await readWorkbookFile(f);
      const names = getWorksheetNames(wb);
      const sheet = names[0];
      const parsedRows = worksheetToRows(wb, sheet);
      setFile(f);
      setWorkbook(wb);
      setSheetNames(names);
      setSelectedSheet(sheet);
      setRows(parsedRows);
    } catch (err) {
      setError(`Could not read this file: ${err.message}`);
    }
  };

  const handleSheetChange = (sheetName) => {
    if (!workbook) return;
    setSelectedSheet(sheetName);
    setRows(worksheetToRows(workbook, sheetName));
    setApplied(false);
  };

  // ---- Derived preview data per import type ----

  const headerSet = rows.length > 0 ? Object.keys(rows[0]) : [];
  const missingHeaders = importType.requiredHeaders.filter(
    (h) => !headerSet.some((k) => k.trim().toLowerCase() === h.toLowerCase())
  );

  let assetPreview = null;
  let sectionPreview = null;

  if (importTypeId === 'assetworx' && rows.length > 0) {
    assetPreview = normalizeAssetRows(rows);
  }
  if (importTypeId === 'section' && rows.length > 0) {
    sectionPreview = previewSectionRows(rows, getSections(), floors);
  }

  const genericPreview = (importTypeId === 'qc' || importTypeId === 'research') && rows.length > 0
    ? rows.map((row) => {
        const obj = {};
        importType.requiredHeaders.forEach((h) => { obj[h] = getField(row, h); });
        return obj;
      })
    : null;

  const handleApply = () => {
    if (importTypeId === 'assetworx' && assetPreview) {
      const existing = getAssets();
      const merged = [...existing, ...assetPreview.assets];
      saveLocalData(LOCAL_KEYS.assets, merged);
      const mapped = merged.filter((a) => a.buildingId).length;
      saveImportStatus({
        lastAssetImport: new Date().toISOString(),
        assetsImported: merged.length,
        assetsMapped: mapped,
        assetsUnmapped: merged.length - mapped,
      });
      setApplied(true);
    } else if (importTypeId === 'section' && sectionPreview) {
      const { sections, updatedCount } = applySectionPreview(sectionPreview, getSections());
      saveLocalData(LOCAL_KEYS.sectionProgress, sections);
      saveImportStatus({ lastSectionImport: new Date().toISOString(), sectionsUpdated: updatedCount });
      setApplied(true);
    } else if (importTypeId === 'qc' && genericPreview) {
      saveLocalData(LOCAL_KEYS.qcPreview, genericPreview);
      setApplied(true);
    } else if (importTypeId === 'research' && genericPreview) {
      saveLocalData(LOCAL_KEYS.researchPreview, genericPreview);
      setApplied(true);
    }
  };

  const handleDownloadJson = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (importTypeId === 'assetworx' && assetPreview) {
      downloadJson(assetPreview.assets, `QCOD_AssetWorx_Import_${stamp}.json`);
    } else if (importTypeId === 'section' && sectionPreview) {
      downloadJson(sectionPreview, `QCOD_Section_Progress_Preview_${stamp}.json`);
    } else if (genericPreview) {
      downloadJson(genericPreview, `QCOD_${importType.label.replace(/\s+/g, '_')}_Preview_${stamp}.json`);
    }
  };

  const handleExportBackup = () => {
    const backup = exportQcodBackup();
    downloadJson(backup, `QCOD_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    setBackupStatus('Backup exported.');
  };

  const handleImportBackupFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await importQcodBackup(f);
      setBackupStatus('Backup restored successfully.');
    } catch (err) {
      setBackupStatus(`Could not restore backup: ${err.message}`);
    }
  };

  const handleClearLocal = () => {
    if (!window.confirm('This clears all locally imported QCOD data on this computer. Continue?')) return;
    clearLocalData();
    reset();
    setBackupStatus('Local data cleared.');
  };

  return (
    <section className="panel">
      <h2>Imports</h2>
      <p className="local-only-note">
        Files are processed locally in this browser and are not uploaded to a server.
      </p>

      <div className="import-controls">
        <label>
          Import type
          <select value={importTypeId} onChange={(e) => handleTypeChange(e.target.value)}>
            {IMPORT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}{t.previewOnly ? ' (Preview Only)' : ''}</option>
            ))}
          </select>
        </label>

        <label>
          File
          <input type="file" accept={importType.accept} onChange={handleFile} />
        </label>
      </div>

      {importType.previewOnly && (
        <p className="empty-note">
          {importType.label} is Preview Only until this module is approved — values are not applied to dashboard calculations.
        </p>
      )}

      {error && <p className="empty-note import-error">{error}</p>}

      {file && (
        <div className="import-file-info">
          <dl className="asset-dl">
            <div><dt>Filename</dt><dd>{file.name}</dd></div>
            <div><dt>File size</dt><dd>{formatBytes(file.size)}</dd></div>
            <div>
              <dt>Worksheet</dt>
              <dd>
                {sheetNames.length > 1 ? (
                  <select value={selectedSheet} onChange={(e) => handleSheetChange(e.target.value)}>
                    {sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : selectedSheet}
              </dd>
            </div>
            <div><dt>Total rows detected</dt><dd>{rows.length}</dd></div>
          </dl>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <h3 className="import-subheading">Validation Summary</h3>
          {missingHeaders.length > 0 && (
            <p className="empty-note import-error">
              Missing expected columns: {missingHeaders.join(', ')}
            </p>
          )}

          {assetPreview && (
            <dl className="asset-dl">
              <div><dt>Total rows read</dt><dd>{assetPreview.stats.totalRows}</dd></div>
              <div><dt>Blank rows skipped</dt><dd>{assetPreview.stats.blankRows}</dd></div>
              <div><dt>Valid assets</dt><dd>{assetPreview.stats.validCount}</dd></div>
              <div><dt>Scanner misreads ignored</dt><dd>{assetPreview.stats.scanErrorCount}</dd></div>
              <div><dt>Unrecognized numbers</dt><dd>{assetPreview.stats.unrecognizedCount}</dd></div>
              <div><dt>Missing serial number</dt><dd>{assetPreview.stats.missingSerialCount}</dd></div>
              <div><dt>Not Found in DB</dt><dd>{assetPreview.stats.notFoundCount}</dd></div>
              <div><dt>New Asset / Offline Sync</dt><dd>{assetPreview.stats.newAssetCount}</dd></div>
            </dl>
          )}

          {sectionPreview && (
            <dl className="asset-dl">
              <div><dt>Rows read</dt><dd>{sectionPreview.length}</dd></div>
              <div><dt>Matched</dt><dd>{sectionPreview.filter((p) => p.matched).length}</dd></div>
              <div><dt>Unmatched / skipped</dt><dd>{sectionPreview.filter((p) => !p.matched).length}</dd></div>
            </dl>
          )}

          <h3 className="import-subheading">Import Preview</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {importType.requiredHeaders.map((h) => <th key={h}>{h}</th>)}
                  {sectionPreview && <th>Match Status</th>}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((row, i) => (
                  <tr key={i}>
                    {importType.requiredHeaders.map((h) => (
                      <td key={h}>{getField(row, h) || '—'}</td>
                    ))}
                    {sectionPreview && (
                      <td>
                        {sectionPreview[i]?.matched
                          ? 'Matched'
                          : <span className="import-error">{sectionPreview[i]?.reason}</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 25 && (
              <p className="empty-note">Showing first 25 of {rows.length} rows.</p>
            )}
          </div>

          <div className="import-actions">
            <button className="btn-primary" onClick={handleApply}>Apply Import</button>
            <button className="btn-secondary" onClick={handleDownloadJson}>Download Normalized JSON</button>
            <button className="btn-secondary" onClick={reset}>Clear</button>
          </div>
          {applied && <p className="import-success">Import applied to this browser's local data.</p>}
        </>
      )}

      <hr className="import-divider" />

      <h3 className="import-subheading">Local Data</h3>
      <p className="empty-note">Local data is stored only in this browser on this computer.</p>
      <div className="import-actions">
        <button className="btn-secondary" onClick={handleExportBackup}>Export All Local Data</button>
        <label className="btn-secondary file-btn">
          Import QCOD Backup
          <input type="file" accept=".json" onChange={handleImportBackupFile} hidden />
        </label>
        <button className="btn-danger" onClick={handleClearLocal}>Clear Local Data</button>
      </div>
      {backupStatus && <p className="import-success">{backupStatus}</p>}
    </section>
  );
}
