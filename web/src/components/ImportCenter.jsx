import { useState } from 'react';
import {
  getSections, getFloors, getBuildings, getRooms, getFacilities,
  LOCAL_KEYS, saveLocalData, saveImportStatus,
  exportQcodBackup, importQcodBackup, clearLocalData, getAssets, appendSectionHistory,
  getLocationAliases, getLocationParserRules, getQcRecords, getResearchRecords, appendImportHistory,
} from '../lib/data';
import {
  readWorkbookFile, getWorksheetNames, worksheetToRows, downloadJson,
  normalizeAssetRows, previewSectionRows, applySectionPreview, getField,
  previewFacilityRows, previewBuildingRows, previewFloorRows, previewSectionConfigRows, previewRoomRows,
  applyFacilityImport, applyBuildingImport, applyFloorImport, applySectionConfigImport, applyRoomImport,
  buildErrorReportRows,
} from '../lib/fileImport';
import {
  processEnexAssetRow, classifyDuplicates, buildImportPlan,
  generateResearchRecords, generateQcRecords,
} from '../lib/enexImport';

const IMPORT_TYPES = [
  {
    id: 'assetworx', label: 'AssetWorx Inventory', group: 'Data Imports',
    accept: '.xlsx,.xls,.csv', kind: 'assetworx',
    requiredHeaders: ['Name', 'Serial Number', 'Description', 'Location Name', 'CMR', 'Last Inventoried', 'Last Observed Time', 'Disposal Status'],
  },
  {
    id: 'enex', label: 'AssetWorx ENEX Import (with Location Resolution)', group: 'Data Imports',
    accept: '.xlsx,.xls,.csv', kind: 'enex',
    requiredHeaders: ['Name', 'Serial Number', 'Description', 'ENEX Location', 'CMR', 'Last Inventoried', 'Last Observed Time', 'Disposal Status'],
  },
  {
    id: 'section', label: 'Section Progress', group: 'Data Imports',
    accept: '.xlsx,.xls,.csv', kind: 'section',
    requiredHeaders: ['Building', 'Floor', 'Section', 'Status', 'Completion Percent', 'Expected Assets', 'Found Assets', 'Tagged Assets', 'Last Updated', 'Notes'],
  },
  {
    id: 'qc', label: 'Daily QC Log', group: 'Data Imports',
    accept: '.xlsx,.xls,.csv', kind: 'generic', recordKey: LOCAL_KEYS.qcRecords, statusKey: 'lastQcImport',
    requiredHeaders: ['Date', 'Facility', 'Building', 'Floor', 'Section', 'Department Area', 'Tag Location', 'Equipment Description', 'EE Tag Number', 'Serial Number', 'QC Status', 'Notes'],
  },
  {
    id: 'research', label: 'Research Items', group: 'Data Imports',
    accept: '.xlsx,.xls,.csv', kind: 'generic', recordKey: LOCAL_KEYS.researchRecords, statusKey: 'lastResearchImport',
    requiredHeaders: ['Date Found', 'Facility', 'Building', 'Floor', 'Section', 'Asset Number', 'Serial Number', 'Description', 'Issue Type', 'Status', 'Notes'],
  },
  {
    id: 'facility-config', label: 'Facility Configuration', group: 'Configuration Imports',
    accept: '.xlsx,.xls,.csv', kind: 'config', configEntity: 'facilities',
    requiredHeaders: ['Facility ID', 'Facility Name', 'City', 'State', 'Status', 'Notes'],
  },
  {
    id: 'building-config', label: 'Building Configuration', group: 'Configuration Imports',
    accept: '.xlsx,.xls,.csv', kind: 'config', configEntity: 'buildings',
    requiredHeaders: ['Facility ID', 'Building ID', 'Building Name', 'Status', 'Configured', 'Notes'],
  },
  {
    id: 'floor-config', label: 'Floor Configuration', group: 'Configuration Imports',
    accept: '.xlsx,.xls,.csv', kind: 'config', configEntity: 'floors',
    requiredHeaders: ['Facility ID', 'Building ID', 'Floor ID', 'Floor Name', 'Level', 'Status', 'Notes'],
  },
  {
    id: 'section-config', label: 'Section Configuration', group: 'Configuration Imports',
    accept: '.xlsx,.xls,.csv', kind: 'config', configEntity: 'sections',
    requiredHeaders: ['Facility ID', 'Building ID', 'Floor ID', 'Section ID', 'Section Name', 'Status', 'Completion Percent', 'Expected Assets', 'Found Assets', 'Tagged Assets', 'Last Updated', 'Notes'],
  },
  {
    id: 'room-config', label: 'Room Configuration', group: 'Configuration Imports',
    accept: '.xlsx,.xls,.csv', kind: 'config', configEntity: 'rooms',
    requiredHeaders: ['Facility ID', 'Building ID', 'Floor ID', 'Section ID', 'Room ID', 'Room Number', 'Room Name', 'Room Type', 'Architectural Zone', 'Status', 'Last Updated', 'Notes'],
  },
];

const CONFIG_HANDLERS = {
  facilities: {
    preview: (rows) => previewFacilityRows(rows, getFacilities()),
    apply: (preview) => applyFacilityImport(preview, getFacilities()),
    key: LOCAL_KEYS.facilities,
  },
  buildings: {
    preview: (rows) => previewBuildingRows(rows, getBuildings(), getFacilities()),
    apply: (preview) => applyBuildingImport(preview, getBuildings()),
    key: LOCAL_KEYS.buildings,
  },
  floors: {
    preview: (rows) => previewFloorRows(rows, getFloors(), getBuildings()),
    apply: (preview) => applyFloorImport(preview, getFloors()),
    key: LOCAL_KEYS.floors,
  },
  sections: {
    preview: (rows) => previewSectionConfigRows(rows, getSections(), getFloors()),
    apply: (preview) => applySectionConfigImport(preview, getSections()),
    key: LOCAL_KEYS.sectionProgress,
  },
  rooms: {
    preview: (rows) => previewRoomRows(rows, getRooms(), getSections(), getBuildings(), getFloors()),
    apply: (preview) => applyRoomImport(preview, getRooms()),
    key: LOCAL_KEYS.rooms,
  },
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Runs the full ENEX pipeline (parse asset number -> resolve location ->
// detect duplicates) against every row, purely for preview — nothing is
// written to localStorage here. facilityId defaults to the first configured
// facility since ENEX exports don't carry a facility column themselves.
function buildEnexPreview(rows) {
  const facilityId = getFacilities()[0]?.id || 'martinsburg-va';
  const rooms = getRooms();
  const aliases = getLocationAliases();
  const rules = getLocationParserRules();

  let scanErrors = 0;
  let blanks = 0;
  const processed = [];
  const rowResults = []; // same length/order as `rows`, for the preview table

  rows.forEach((row) => {
    const result = processEnexAssetRow({
      assetNumber: getField(row, 'Name'),
      serialNumber: getField(row, 'Serial Number'),
      description: getField(row, 'Description'),
      rawLocation: getField(row, 'ENEX Location'),
      cmr: getField(row, 'CMR'),
      lastInventoried: getField(row, 'Last Inventoried'),
      lastObservedTime: getField(row, 'Last Observed Time'),
      disposalStatus: getField(row, 'Disposal Status'),
    }, { facilityId, rooms, aliases, rules });

    if (result.scanError) { scanErrors += 1; rowResults.push({ excluded: true, reason: 'Scanner misread (613 E...) — excluded' }); return; }
    if (!result.included) { blanks += 1; rowResults.push({ excluded: true, reason: 'Blank asset number' }); return; }
    processed.push(result);
    rowResults.push(result);
  });

  const withDupes = classifyDuplicates(processed.map((p) => p.asset));
  const finalProcessed = processed.map((p, i) => ({ ...p, asset: withDupes[i] }));
  // Splice the deduped versions back into their original row positions.
  let processedCursor = 0;
  const finalRowResults = rowResults.map((r) => {
    if (r.excluded) return r;
    const updated = finalProcessed[processedCursor];
    processedCursor += 1;
    return updated;
  });

  const matched = finalProcessed.filter((p) => p.resolution?.status === 'matched').length;
  const suggested = finalProcessed.filter((p) => p.resolution?.status === 'suggested').length;
  const multiple = finalProcessed.filter((p) => p.resolution?.status === 'multiple_matches').length;
  const unmatched = finalProcessed.filter((p) => p.resolution?.status === 'no_match' || p.resolution?.status === 'invalid_format').length;

  return {
    facilityId,
    processed: finalProcessed,
    rowResults: finalRowResults,
    stats: {
      totalRows: rows.length,
      scanErrors,
      blanks,
      validAssets: finalProcessed.length,
      matched,
      suggested,
      multiple,
      unmatched,
      missingSerial: finalProcessed.filter((p) => p.issues.includes('missing_serial_number')).length,
      duplicateAssetNumber: finalProcessed.filter((p) => p.asset.issueTypes.includes('duplicate_asset_number')).length,
      duplicateSerial: finalProcessed.filter((p) => p.asset.issueTypes.includes('duplicate_serial_number')).length,
      notFoundInDb: finalProcessed.filter((p) => p.issues.includes('not_found_in_db')).length,
      newAssetOrOffline: finalProcessed.filter((p) => p.issues.includes('new_asset_found') || p.issues.includes('offline_sync')).length,
    },
  };
}

export default function ImportCenter() {
  const [importTypeId, setImportTypeId] = useState('assetworx');
  const [file, setFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [applyResult, setApplyResult] = useState(null);
  const [backupStatus, setBackupStatus] = useState('');
  const [importMode, setImportMode] = useState('replace_snapshot'); // 'replace_snapshot' | 'merge' — ENEX import only

  const importType = IMPORT_TYPES.find((t) => t.id === importTypeId);

  const reset = () => {
    setFile(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setRows([]);
    setError('');
    setApplyResult(null);
  };

  const handleTypeChange = (id) => {
    setImportTypeId(id);
    reset();
  };

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setApplyResult(null);
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
    setApplyResult(null);
  };

  // ---- Derived preview data per import type ----

  const headerSet = rows.length > 0 ? Object.keys(rows[0]) : [];
  const missingHeaders = importType.requiredHeaders.filter(
    (h) => !headerSet.some((k) => k.trim().toLowerCase() === h.toLowerCase())
  );

  let assetPreview = null;
  let sectionPreview = null;
  let configPreview = null;
  let enexPreview = null;

  if (importType.kind === 'assetworx' && rows.length > 0) {
    assetPreview = normalizeAssetRows(rows);
  }
  if (importType.kind === 'section' && rows.length > 0) {
    sectionPreview = previewSectionRows(rows, getSections(), getFloors());
  }
  if (importType.kind === 'config' && rows.length > 0) {
    configPreview = CONFIG_HANDLERS[importType.configEntity].preview(rows);
  }
  if (importType.kind === 'enex' && rows.length > 0) {
    enexPreview = buildEnexPreview(rows);
  }

  const genericPreview = importType.kind === 'generic' && rows.length > 0
    ? rows.map((row) => {
        const obj = {};
        importType.requiredHeaders.forEach((h) => { obj[h] = getField(row, h); });
        return obj;
      })
    : null;

  const handleApply = () => {
    if (importType.kind === 'assetworx' && assetPreview) {
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
      setApplyResult({ message: `Imported ${assetPreview.assets.length} asset(s).` });
    } else if (importType.kind === 'section' && sectionPreview) {
      const { sections, updatedCount, historyEntries } = applySectionPreview(sectionPreview, getSections());
      saveLocalData(LOCAL_KEYS.sectionProgress, sections);
      appendSectionHistory(historyEntries);
      saveImportStatus({ lastSectionImport: new Date().toISOString(), sectionsUpdated: updatedCount });
      setApplyResult({ message: `Updated ${updatedCount} section(s).` });
    } else if (importType.kind === 'config' && configPreview) {
      const handler = CONFIG_HANDLERS[importType.configEntity];
      const result = handler.apply(configPreview);
      saveLocalData(handler.key, result.data);
      saveImportStatus({ lastConfigImport: new Date().toISOString() });
      setApplyResult({
        message: `Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}.`,
        errorReport: buildErrorReportRows(configPreview),
      });
    } else if (importType.kind === 'generic' && genericPreview) {
      const existing = JSON.parse(window.localStorage.getItem(importType.recordKey) || '[]');
      saveLocalData(importType.recordKey, [...existing, ...genericPreview]);
      saveImportStatus({ [importType.statusKey]: new Date().toISOString() });
      setApplyResult({ message: `Imported ${genericPreview.length} record(s).` });
    } else if (importType.kind === 'enex' && enexPreview) {
      const importId = `import-${Date.now()}`;
      const newAssets = enexPreview.processed.map((p) => p.asset);
      const existingAssets = getAssets();
      const plan = buildImportPlan(existingAssets, newAssets, importMode);
      saveLocalData(LOCAL_KEYS.assets, plan.finalAssets);

      const researchResult = generateResearchRecords(enexPreview.processed, getResearchRecords(), { importId, facilityId: enexPreview.facilityId });
      saveLocalData(LOCAL_KEYS.researchRecords, researchResult.records);

      const sectionsById = new Map(getSections().map((s) => [s.id, s]));
      const previousByNumber = new Map(existingAssets.map((a) => [a.assetNumber, a]));
      const qcResult = generateQcRecords(enexPreview.processed, getQcRecords(), { importId, facilityId: enexPreview.facilityId, previousAssetsByNumber: previousByNumber, sectionsById });
      saveLocalData(LOCAL_KEYS.qcRecords, qcResult.records);

      const mapped = plan.finalAssets.filter((a) => a.buildingId).length;
      saveImportStatus({
        lastAssetImport: new Date().toISOString(),
        assetsImported: plan.finalAssets.length,
        assetsMapped: mapped,
        assetsUnmapped: plan.finalAssets.length - mapped,
      });

      appendImportHistory({
        id: importId,
        sourceFileName: file?.name || '',
        importType: 'enex',
        importMode,
        importedAt: new Date().toISOString(),
        rowsRead: enexPreview.stats.totalRows,
        validAssets: enexPreview.stats.validAssets,
        scanErrorsIgnored: enexPreview.stats.scanErrors,
        matchedLocations: enexPreview.stats.matched,
        multipleMatches: enexPreview.stats.multiple,
        unmatchedLocations: enexPreview.stats.unmatched,
        researchCreated: researchResult.created,
        researchUpdated: researchResult.updated,
        qcCreated: qcResult.created,
        qcUpdated: qcResult.updated,
        assetsCreated: plan.created.length,
        assetsUpdated: plan.updated.length,
        warnings: plan.missingFromSnapshot.length > 0
          ? [`${plan.missingFromSnapshot.length} previously-known asset(s) were not present in this snapshot.`]
          : [],
      });

      setApplyResult({
        message: `Import applied (${importMode === 'merge' ? 'Merge' : 'Replace Snapshot'}): ${plan.created.length} created, ${plan.updated.length} updated`
          + (plan.missingFromSnapshot.length > 0 ? `, ${plan.missingFromSnapshot.length} not present in this snapshot (kept, not deleted)` : '')
          + `. Research: ${researchResult.created} created / ${researchResult.updated} updated. QC: ${qcResult.created} created / ${qcResult.updated} updated.`,
      });
    }
  };

  const handleDownloadJson = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (importType.kind === 'assetworx' && assetPreview) {
      downloadJson(assetPreview.assets, `QCOD_AssetWorx_Import_${stamp}.json`);
    } else if (importType.kind === 'section' && sectionPreview) {
      downloadJson(sectionPreview, `QCOD_Section_Progress_Preview_${stamp}.json`);
    } else if (importType.kind === 'config' && configPreview) {
      downloadJson(configPreview, `QCOD_${importType.label.replace(/\s+/g, '_')}_Preview_${stamp}.json`);
    } else if (genericPreview) {
      downloadJson(genericPreview, `QCOD_${importType.label.replace(/\s+/g, '_')}_Preview_${stamp}.json`);
    }
  };

  const handleDownloadErrorReport = () => {
    if (!applyResult?.errorReport) return;
    downloadJson(applyResult.errorReport, `QCOD_${importType.label.replace(/\s+/g, '_')}_Errors_${new Date().toISOString().slice(0, 10)}.json`);
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
            <optgroup label="Data Imports">
              {IMPORT_TYPES.filter((t) => t.group === 'Data Imports').map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Configuration Imports">
              {IMPORT_TYPES.filter((t) => t.group === 'Configuration Imports').map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </optgroup>
          </select>
        </label>

        <label>
          File
          <input type="file" accept={importType.accept} onChange={handleFile} />
        </label>
      </div>

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

      {importType.kind === 'enex' && (
        <div className="import-controls">
          <label>
            Import Mode
            <select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
              <option value="replace_snapshot">Replace Current Snapshot (default — daily full export)</option>
              <option value="merge">Merge With Existing Assets</option>
            </select>
          </label>
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

          {configPreview && (
            <dl className="asset-dl">
              <div><dt>Rows read</dt><dd>{configPreview.length}</dd></div>
              <div><dt>Will create</dt><dd>{configPreview.filter((p) => p.action === 'create').length}</dd></div>
              <div><dt>Will update</dt><dd>{configPreview.filter((p) => p.action === 'update').length}</dd></div>
              <div><dt>Will skip (invalid)</dt><dd>{configPreview.filter((p) => p.action === 'skip').length}</dd></div>
            </dl>
          )}

          {enexPreview && (
            <dl className="asset-dl">
              <div><dt>Rows read</dt><dd>{enexPreview.stats.totalRows}</dd></div>
              <div><dt>Valid assets</dt><dd>{enexPreview.stats.validAssets}</dd></div>
              <div><dt>Scanner misreads ignored</dt><dd>{enexPreview.stats.scanErrors}</dd></div>
              <div><dt>Recognized locations (matched)</dt><dd>{enexPreview.stats.matched}</dd></div>
              <div><dt>Unique-candidate suggestions</dt><dd>{enexPreview.stats.suggested}</dd></div>
              <div><dt>Multiple-match locations</dt><dd>{enexPreview.stats.multiple}</dd></div>
              <div><dt>Unmatched / invalid locations</dt><dd>{enexPreview.stats.unmatched}</dd></div>
              <div><dt>Missing serial numbers</dt><dd>{enexPreview.stats.missingSerial}</dd></div>
              <div><dt>Duplicate asset numbers</dt><dd>{enexPreview.stats.duplicateAssetNumber}</dd></div>
              <div><dt>Duplicate serial numbers</dt><dd>{enexPreview.stats.duplicateSerial}</dd></div>
              <div><dt>Not Found in DB</dt><dd>{enexPreview.stats.notFoundInDb}</dd></div>
              <div><dt>New Asset / Offline Sync</dt><dd>{enexPreview.stats.newAssetOrOffline}</dd></div>
            </dl>
          )}
          {enexPreview && (enexPreview.stats.suggested > 0 || enexPreview.stats.multiple > 0 || enexPreview.stats.unmatched > 0) && (
            <p className="empty-note">
              {enexPreview.stats.suggested + enexPreview.stats.multiple + enexPreview.stats.unmatched} location(s) need review in{' '}
              <strong>Location Mapping</strong> before those assets get a confirmed room.
            </p>
          )}

          <h3 className="import-subheading">Import Preview</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {importType.requiredHeaders.map((h) => <th key={h}>{h}</th>)}
                  {sectionPreview && <th>Match Status</th>}
                  {configPreview && <th>Action</th>}
                  {configPreview && <th>Errors / Warnings</th>}
                  {enexPreview && <th>Location Resolution</th>}
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
                    {configPreview && (
                      <td className={configPreview[i]?.action === 'skip' ? 'import-error' : ''}>
                        {configPreview[i]?.action}
                      </td>
                    )}
                    {configPreview && (
                      <td>
                        {configPreview[i]?.errors?.length > 0 && (
                          <span className="import-error">{configPreview[i].errors.join('; ')}</span>
                        )}
                        {configPreview[i]?.warnings?.length > 0 && (
                          <span className="empty-note"> {configPreview[i].warnings.join('; ')}</span>
                        )}
                      </td>
                    )}
                    {enexPreview && (
                      <td>
                        {enexPreview.rowResults[i]?.excluded
                          ? <span className="empty-note">{enexPreview.rowResults[i].reason}</span>
                          : (enexPreview.rowResults[i]?.resolution
                              ? `${enexPreview.rowResults[i].resolution.status}${enexPreview.rowResults[i].issues.length ? ' — ' + enexPreview.rowResults[i].issues.join(', ') : ''}`
                              : (enexPreview.rowResults[i]?.issues.join(', ') || '—'))}
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
            {applyResult?.errorReport?.length > 0 && (
              <button className="btn-secondary" onClick={handleDownloadErrorReport}>Download Error Report</button>
            )}
            <button className="btn-secondary" onClick={reset}>Clear</button>
          </div>
          {applyResult && <p className="import-success">{applyResult.message}</p>}
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
