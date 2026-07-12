import { useState } from 'react';
import {
  getValidAssets, getMappedAssets, getUnmappedAssets, getFacilities, getBuildings,
  getFloorsForBuilding, getSectionsForFloor, getRoomsForSection, getMappingHistory,
  getLocationMappingSuggestions, approveLocationMapping, applyAssetMappings, clearAssetMapping,
  exportQcodBackup, importQcodBackup,
} from '../lib/data';
import { downloadJson } from '../lib/fileImport';

const ISSUE_LABELS = {
  missing_serial_number: 'Missing Serial Number',
  not_found_in_db: 'Not Found in DB',
  new_asset_offline_sync: 'New Asset / Offline Sync',
};

function nameFor(list, id) {
  return list.find((x) => x.id === id)?.name ?? id ?? '—';
}

function MappingForm({ value, onChange }) {
  const facilities = getFacilities();
  const buildings = value.facilityId ? getBuildings().filter((b) => b.facilityId === value.facilityId) : [];
  const floors = value.buildingId ? getFloorsForBuilding(value.buildingId) : [];
  const sections = value.floorId ? getSectionsForFloor(value.floorId) : [];
  const rooms = value.sectionId ? getRoomsForSection(value.sectionId) : [];

  const set = (field, val) => {
    const next = { ...value, [field]: val };
    // Changing a parent invalidates anything below it.
    if (field === 'facilityId') { next.buildingId = ''; next.floorId = ''; next.sectionId = ''; next.roomId = ''; }
    if (field === 'buildingId') { next.floorId = ''; next.sectionId = ''; next.roomId = ''; }
    if (field === 'floorId') { next.sectionId = ''; next.roomId = ''; }
    if (field === 'sectionId') { next.roomId = ''; }
    onChange(next);
  };

  return (
    <div className="import-controls">
      <label>
        Facility
        <select value={value.facilityId} onChange={(e) => set('facilityId', e.target.value)}>
          <option value="">Leave unchanged</option>
          {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label>
        Building
        <select value={value.buildingId} onChange={(e) => set('buildingId', e.target.value)} disabled={!value.facilityId}>
          <option value="">Leave unchanged</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
        </select>
      </label>
      <label>
        Floor
        <select value={value.floorId} onChange={(e) => set('floorId', e.target.value)} disabled={!value.buildingId}>
          <option value="">Leave unchanged</option>
          {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label>
        Section
        <select value={value.sectionId} onChange={(e) => set('sectionId', e.target.value)} disabled={!value.floorId}>
          <option value="">Leave unchanged</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label>
        Room
        <select value={value.roomId} onChange={(e) => set('roomId', e.target.value)} disabled={!value.sectionId}>
          <option value="">Leave unchanged</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.roomNumber} — {r.name}</option>)}
        </select>
      </label>
    </div>
  );
}

export default function AssetMapping() {
  const [scope, setScope] = useState('unmapped'); // 'unmapped' | 'mapped' | 'all'
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [issueFilter, setIssueFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState({ facilityId: '', buildingId: '', floorId: '', sectionId: '', roomId: '' });
  const [status, setStatus] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState(null);

  let assets = scope === 'unmapped' ? getUnmappedAssets() : scope === 'mapped' ? getMappedAssets() : getValidAssets();
  if (locationFilter) assets = assets.filter((a) => (a.locationName || '').toLowerCase().includes(locationFilter.toLowerCase()));
  if (issueFilter) assets = assets.filter((a) => Array.isArray(a.issueTypes) && a.issueTypes.includes(issueFilter));
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    assets = assets.filter((a) =>
      a.assetNumber?.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q)
    );
  }

  const facilities = getFacilities();
  const buildings = getBuildings();

  const toggleSelect = (assetNumber) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assetNumber)) next.delete(assetNumber); else next.add(assetNumber);
      return next;
    });
  };

  const selectAllVisible = () => setSelected(new Set(assets.map((a) => a.assetNumber)));
  const clearSelection = () => setSelected(new Set());

  const hasFormValue = Object.values(form).some((v) => v);

  const handleApply = () => {
    if (selected.size === 0) { setStatus('Select at least one asset first.'); return; }
    if (!hasFormValue) { setStatus('Choose at least one field to assign.'); return; }
    const { updatedCount } = applyAssetMappings(Array.from(selected), form, 'batch');
    setStatus(`Applied mapping to ${updatedCount} asset(s).`);
    setSelected(new Set());
    setForm({ facilityId: '', buildingId: '', floorId: '', sectionId: '', roomId: '' });
  };

  const handleClearMapping = () => {
    if (selected.size === 0) { setStatus('Select at least one asset first.'); return; }
    if (!window.confirm(`Clear the mapping for ${selected.size} selected asset(s)?`)) return;
    const { updatedCount } = clearAssetMapping(Array.from(selected));
    setStatus(`Cleared mapping for ${updatedCount} asset(s).`);
    setSelected(new Set());
  };

  const handleExportMappings = () => {
    const backup = exportQcodBackup();
    downloadJson(backup, `QCOD_Asset_Mappings_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImportMappings = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await importQcodBackup(f);
      setStatus('Mapping backup restored.');
    } catch (err) {
      setStatus(`Could not restore backup: ${err.message}`);
    }
  };

  const suggestions = getLocationMappingSuggestions();
  const history = getMappingHistory();

  const confirmSuggestion = (group) => {
    // Populate the form and selection but require the explicit Apply click —
    // a suggestion is never applied automatically, even one with a prior
    // approved mapping for this exact Location Name.
    setSelected(new Set(group.assetNumbers));
    if (group.priorApprovedMapping) {
      setForm({
        facilityId: group.priorApprovedMapping.facilityId || '',
        buildingId: group.priorApprovedMapping.buildingId || '',
        floorId: group.priorApprovedMapping.floorId || '',
        sectionId: group.priorApprovedMapping.sectionId || '',
        roomId: group.priorApprovedMapping.roomId || '',
      });
    }
    setPendingSuggestion(group);
    setStatus(`${group.assetNumbers.length} asset(s) from "${group.locationNameSample}" selected — review the mapping below, then click Apply Mapping.`);
  };

  const approveAndRemember = () => {
    if (!pendingSuggestion || !hasFormValue) return;
    approveLocationMapping(pendingSuggestion.locationNameSample, form);
    const { updatedCount } = applyAssetMappings(Array.from(selected), form, 'approved_location_suggestion');
    setStatus(`Approved and applied mapping to ${updatedCount} asset(s) for "${pendingSuggestion.locationNameSample}". This mapping will be suggested next time.`);
    setSelected(new Set());
    setForm({ facilityId: '', buildingId: '', floorId: '', sectionId: '', roomId: '' });
    setPendingSuggestion(null);
  };

  return (
    <section className="panel">
      <h2>Asset Mapping</h2>
      <p className="local-only-note">
        QCOD currently runs locally. Selected files are processed in this browser and are not uploaded to a server.
      </p>
      <p className="empty-note">
        Location Name is shown only as a grouping suggestion. No asset is ever assigned automatically —
        every mapping, single or batch, requires your explicit confirmation.
      </p>

      {suggestions.length > 0 && (
        <>
          <h3 className="import-subheading">Location Name Suggestions</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Location Name</th><th>Unmapped Assets</th><th>Suggestion</th><th></th></tr>
              </thead>
              <tbody>
                {suggestions.map((g) => (
                  <tr key={g.locationNameNormalized}>
                    <td>{g.locationNameSample}</td>
                    <td>{g.count}</td>
                    <td>
                      {g.priorApprovedMapping
                        ? <span className="import-success">Suggested from prior approved mapping</span>
                        : <span className="empty-note">No prior approved mapping</span>}
                    </td>
                    <td><button className="btn-secondary" onClick={() => confirmSuggestion(g)}>Review</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="import-subheading">Assets</h3>
      <div className="import-controls">
        <label>
          Show
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="unmapped">Unmapped Only</option>
            <option value="mapped">Mapped Only</option>
            <option value="all">All Valid Assets</option>
          </select>
        </label>
        <label>
          Search
          <input type="text" placeholder="Asset #, serial, description" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Location Name contains
          <input type="text" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} />
        </label>
        <label>
          Issue Type
          <select value={issueFilter} onChange={(e) => setIssueFilter(e.target.value)}>
            <option value="">All</option>
            {Object.entries(ISSUE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>

      <div className="import-actions">
        <button className="btn-secondary" onClick={selectAllVisible}>Select All Visible ({assets.length})</button>
        <button className="btn-secondary" onClick={clearSelection}>Clear Selection</button>
        <span className="empty-note">{selected.size} selected</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th><th>Asset Number</th><th>Serial Number</th><th>Description</th>
              <th>Location Name</th><th>Last Inventoried</th>
              <th>Facility</th><th>Building</th><th>Floor</th><th>Section</th><th>Room</th><th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {assets.slice(0, 100).map((a) => (
              <tr key={a.assetNumber}>
                <td><input type="checkbox" checked={selected.has(a.assetNumber)} onChange={() => toggleSelect(a.assetNumber)} /></td>
                <td>{a.assetNumber}</td>
                <td>{a.serialNumber || '—'}</td>
                <td>{a.description || '—'}</td>
                <td>{a.locationName || '—'}</td>
                <td>{a.lastInventoried || '—'}</td>
                <td>{a.facilityId ? nameFor(facilities, a.facilityId) : '—'}</td>
                <td>{a.buildingId ? nameFor(buildings, a.buildingId) : '—'}</td>
                <td>{a.floorId || '—'}</td>
                <td>{a.sectionId || '—'}</td>
                <td>{a.roomId || '—'}</td>
                <td>{(a.issueTypes || []).map((t) => ISSUE_LABELS[t] ?? t).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {assets.length > 100 && <p className="empty-note">Showing first 100 of {assets.length} assets.</p>}
        {assets.length === 0 && <p className="empty-note">No assets matched the selected filters.</p>}
      </div>

      <h3 className="import-subheading">Batch Mapping</h3>
      <MappingForm value={form} onChange={setForm} />
      <div className="import-actions">
        <button className="btn-primary" onClick={handleApply}>Apply Mapping</button>
        {pendingSuggestion && (
          <button className="btn-primary" onClick={approveAndRemember}>Approve &amp; Remember for This Location</button>
        )}
        <button className="btn-danger" onClick={handleClearMapping}>Clear Mapping</button>
      </div>
      {status && <p className="import-success">{status}</p>}

      <hr className="import-divider" />
      <h3 className="import-subheading">Backup</h3>
      <div className="import-actions">
        <button className="btn-secondary" onClick={handleExportMappings}>Export Current Mappings</button>
        <label className="btn-secondary file-btn">
          Import Mappings Backup
          <input type="file" accept=".json" onChange={handleImportMappings} hidden />
        </label>
      </div>

      <hr className="import-divider" />
      <button className="btn-secondary" onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? 'Hide' : 'Show'} Mapping History ({history.length})
      </button>
      {showHistory && (
        <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
          <table>
            <thead>
              <tr><th>Date</th><th>Asset Number</th><th>Previous</th><th>New</th><th>Source</th></tr>
            </thead>
            <tbody>
              {history.slice().reverse().slice(0, 100).map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.mappedAt).toLocaleString()}</td>
                  <td>{h.assetNumber}</td>
                  <td>{[h.previousMapping.buildingId, h.previousMapping.floorId, h.previousMapping.sectionId, h.previousMapping.roomId].filter(Boolean).join(' / ') || '—'}</td>
                  <td>{[h.newMapping.buildingId, h.newMapping.floorId, h.newMapping.sectionId, h.newMapping.roomId].filter(Boolean).join(' / ') || '—'}</td>
                  <td>{h.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <p className="empty-note">No mapping changes recorded yet.</p>}
        </div>
      )}
    </section>
  );
}
