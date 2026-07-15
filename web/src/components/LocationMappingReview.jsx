import { useState, useMemo } from 'react';
import {
  getAssets, getRooms, getFacilities, getBuildings,
  getLocationAliases, getLocationParserRules, getLocationReviewHistory,
  approveLocationAlias, approveLocationParserRule, appendLocationReviewHistory,
  saveLocalData, LOCAL_KEYS,
} from '../lib/data';
import { resolveEnexLocation, getEnexLocationStatus } from '../lib/enexLocationParser';
import { downloadJson } from '../lib/fileImport';

function roomLabel(rooms, roomId) {
  const room = rooms.find((r) => r.id === roomId);
  return room ? `${room.roomNumber} — ${room.roomName || 'Unnamed'} (${room.floorId})` : roomId;
}

export default function LocationMappingReview() {
  const [facilityFilter, setFacilityFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('500');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLocations, setSelectedLocations] = useState(new Set());
  const [chosenRoomByLocation, setChosenRoomByLocation] = useState({});
  const [status, setStatus] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [ruleConfirm, setRuleConfirm] = useState(null); // location pending the rule-approval warning

  const facilities = getFacilities();
  const buildings = getBuildings();
  const rooms = getRooms();
  const aliases = getLocationAliases();
  const rules = getLocationParserRules();
  const history = getLocationReviewHistory();

  // Group all assets with a rawLocation by that location, and resolve each
  // group once (identical locations always resolve identically). Only
  // locations that AREN'T already cleanly matched need review.
  const groups = useMemo(() => {
    const assets = getAssets().filter((a) => (a.rawLocation ?? '').toString().trim() !== '');
    const byLocation = new Map();
    assets.forEach((a) => {
      const key = a.rawLocation.trim().toUpperCase();
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key).push(a);
    });

    return Array.from(byLocation.entries()).map(([rawLocation, groupAssets]) => {
      const facilityId = groupAssets[0].facilityId || 'martinsburg-va';
      const resolution = resolveEnexLocation(rawLocation, { facilityId, rooms, aliases, rules });
      return { rawLocation, facilityId, assets: groupAssets, resolution };
    });
  }, [rooms, aliases, rules]);

  let visible = groups.filter((g) => g.resolution.status !== 'matched'); // matched ones need no review
  if (facilityFilter) visible = visible.filter((g) => g.facilityId === facilityFilter);
  if (buildingFilter) visible = visible.filter((g) => g.resolution.parsed?.buildingId === buildingFilter);
  if (statusFilter) visible = visible.filter((g) => g.resolution.status === statusFilter);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    visible = visible.filter((g) => g.rawLocation.toLowerCase().includes(q));
  }

  const toggleSelect = (rawLocation) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(rawLocation)) next.delete(rawLocation); else next.add(rawLocation);
      return next;
    });
  };

  const logHistory = (entries) => appendLocationReviewHistory(entries);

  // Approve exact alias — a one-off mapping for this exact normalized string only.
  const approveAsAlias = (group, roomId) => {
    if (!roomId) { setStatus('Choose an official room first.'); return; }
    try {
      approveLocationAlias({
        facilityId: group.facilityId,
        buildingId: group.resolution.parsed?.buildingId || '',
        sourceSystem: 'AssetWorx',
        rawLocationNormalized: group.rawLocation,
        roomId,
        notes: '',
      });
      logHistory([{
        id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        rawLocation: group.rawLocation, parsedLocation: group.resolution.parsed,
        candidateRoomIds: group.resolution.candidateRoomIds, selectedRoomId: roomId,
        decision: 'approved', createdAlias: true, createdRule: false,
        reviewedAt: new Date().toISOString(), notes: 'Approved as exact alias',
      }]);
      setStatus(`Approved alias: "${group.rawLocation}" -> ${roomLabel(rooms, roomId)}. This exact location will resolve automatically next time.`);
    } catch (err) {
      setStatus(err.message);
    }
  };

  const requestRuleApproval = (group, roomId) => {
    if (!roomId) { setStatus('Choose an official room first.'); return; }
    setRuleConfirm({ group, roomId });
  };

  const confirmRuleApproval = () => {
    if (!ruleConfirm) return;
    const { group, roomId } = ruleConfirm;
    const targetRoom = rooms.find((r) => r.id === roomId);
    approveLocationParserRule({
      facilityId: group.facilityId,
      buildingId: group.resolution.parsed?.buildingId || '',
      departmentPrefix: group.resolution.parsed?.departmentPrefix || '',
      zoneLetter: group.resolution.parsed?.zoneLetter || '',
      roomPattern: `^${group.resolution.parsed?.roomDigits || ''}$`,
      targetFloorId: targetRoom?.floorId || '',
      notes: `Approved from review of "${group.rawLocation}"`,
    });
    logHistory([{
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rawLocation: group.rawLocation, parsedLocation: group.resolution.parsed,
      candidateRoomIds: group.resolution.candidateRoomIds, selectedRoomId: roomId,
      decision: 'approved', createdAlias: false, createdRule: true,
      reviewedAt: new Date().toISOString(), notes: 'Approved as parser rule for this department/zone combination',
    }]);
    setStatus(`Approved parser rule for "${group.resolution.parsed?.departmentPrefix}${group.resolution.parsed?.zoneLetter}" rooms matching "${group.resolution.parsed?.roomDigits}" -> floor ${targetRoom?.floorId}.`);
    setRuleConfirm(null);
  };

  const rejectSuggestion = (group) => {
    logHistory([{
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rawLocation: group.rawLocation, parsedLocation: group.resolution.parsed,
      candidateRoomIds: group.resolution.candidateRoomIds, selectedRoomId: '',
      decision: 'rejected', createdAlias: false, createdRule: false,
      reviewedAt: new Date().toISOString(), notes: '',
    }]);
    setStatus(`Rejected suggestion for "${group.rawLocation}".`);
  };

  const leaveUnmatched = (group) => {
    logHistory([{
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rawLocation: group.rawLocation, parsedLocation: group.resolution.parsed,
      candidateRoomIds: group.resolution.candidateRoomIds, selectedRoomId: '',
      decision: 'left_unmatched', createdAlias: false, createdRule: false,
      reviewedAt: new Date().toISOString(), notes: '',
    }]);
    setStatus(`Left "${group.rawLocation}" unmatched.`);
  };

  const handleBatchApproveIdentical = () => {
    // Batch approval is only ever offered for groups that are already
    // identical normalized locations (each group IS one normalized
    // location) — so "batch" here means approving multiple SELECTED
    // location groups at once, each with its own chosen room, not merging
    // different locations together.
    if (selectedLocations.size === 0) { setStatus('Select at least one location group first.'); return; }
    let approved = 0;
    visible.filter((g) => selectedLocations.has(g.rawLocation)).forEach((g) => {
      const roomId = chosenRoomByLocation[g.rawLocation] || g.resolution.candidateRoomIds[0];
      if (!roomId) return;
      try {
        approveLocationAlias({ facilityId: g.facilityId, rawLocationNormalized: g.rawLocation, roomId, sourceSystem: 'AssetWorx' });
        approved += 1;
      } catch {
        // duplicate — skip silently in batch mode, per-row approval will show the real error
      }
    });
    setStatus(`Batch-approved ${approved} of ${selectedLocations.size} selected location(s) as exact aliases.`);
    setSelectedLocations(new Set());
  };

  const handleExportUnresolved = () => {
    downloadJson(visible.map((g) => ({
      rawLocation: g.rawLocation, status: g.resolution.status, candidateRoomIds: g.resolution.candidateRoomIds,
      assetCount: g.assets.length, reason: g.resolution.reason,
    })), `QCOD_Unresolved_ENEX_Locations_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImportAliases = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('File must contain a JSON array of aliases.');
      const existing = getLocationAliases();
      saveLocalData(LOCAL_KEYS.locationAliases, [...existing, ...parsed]);
      setStatus(`Imported ${parsed.length} alias(es).`);
    } catch (err) {
      setStatus(`Could not import aliases: ${err.message}`);
    }
  };

  return (
    <section className="panel">
      <h2>Location Mapping</h2>
      <p className="local-only-note">
        QCOD currently runs locally. Selected files are processed in this browser and are not uploaded to a server.
      </p>
      <p className="empty-note">
        The ENEX parser never guesses a floor. A location resolves automatically only through an exact
        approved alias or an approved parser rule — everything else needs your review below.
      </p>

      <div className="import-controls">
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
          Match Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="suggested">Suggested</option>
            <option value="multiple_matches">Multiple Matches</option>
            <option value="no_match">No Match</option>
            <option value="invalid_format">Invalid Format</option>
          </select>
        </label>
        <label>
          Search
          <input type="text" placeholder="Raw location" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <div className="import-actions">
        <button className="btn-secondary" onClick={handleBatchApproveIdentical}>Batch Approve Selected (as aliases)</button>
        <button className="btn-secondary" onClick={handleExportUnresolved}>Export Unresolved Locations</button>
        <label className="btn-secondary file-btn">
          Import Approved Aliases
          <input type="file" accept=".json" onChange={handleImportAliases} hidden />
        </label>
        <span className="empty-note">{visible.length} location(s) need review</span>
      </div>
      {status && <p className="import-success">{status}</p>}

      {ruleConfirm && (
        <div className="poc-banner">
          This rule may affect future imports. Confirm that the location format is consistent before approving.
          <div className="import-actions" style={{ marginTop: '0.5rem' }}>
            <button className="btn-primary" onClick={confirmRuleApproval}>Yes, Approve This Rule</button>
            <button className="btn-secondary" onClick={() => setRuleConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th><th>Raw ENEX Location</th><th>Dept Prefix</th><th>Zone</th><th>Room Digits</th>
              <th>Building</th><th>Match Status</th><th>Suggested Room</th><th>Candidate Rooms</th>
              <th>Confidence</th><th>Reason</th><th>Assets</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 100).map((g) => {
              const parsed = g.resolution.parsed || {};
              const suggestedRoomId = g.resolution.candidateRoomIds[0] || '';
              const chosen = chosenRoomByLocation[g.rawLocation] ?? suggestedRoomId;
              return (
                <tr key={g.rawLocation}>
                  <td><input type="checkbox" checked={selectedLocations.has(g.rawLocation)} onChange={() => toggleSelect(g.rawLocation)} /></td>
                  <td>{g.rawLocation}</td>
                  <td>{parsed.departmentPrefix || '—'}</td>
                  <td>{parsed.zoneLetter || '—'}</td>
                  <td>{parsed.roomDigits || '—'}</td>
                  <td>{parsed.buildingId || '—'}</td>
                  <td>{getEnexLocationStatus(g.resolution)}</td>
                  <td>
                    {g.resolution.candidateRoomIds.length > 0 ? (
                      <select value={chosen} onChange={(e) => setChosenRoomByLocation((prev) => ({ ...prev, [g.rawLocation]: e.target.value }))}>
                        <option value="">Choose a room...</option>
                        {g.resolution.candidateRoomIds.map((rid) => (
                          <option key={rid} value={rid}>{roomLabel(rooms, rid)}</option>
                        ))}
                      </select>
                    ) : '—'}
                  </td>
                  <td>{g.resolution.candidateRoomIds.length}</td>
                  <td>{g.resolution.confidence}</td>
                  <td className="notes-cell">{g.resolution.reason}</td>
                  <td>{g.assets.length}</td>
                  <td>
                    <div className="import-actions">
                      <button className="btn-small btn-secondary" onClick={() => approveAsAlias(g, chosen)}>Approve Alias</button>
                      <button className="btn-small btn-secondary" onClick={() => requestRuleApproval(g, chosen)}>Approve Rule</button>
                      <button className="btn-small btn-secondary" onClick={() => rejectSuggestion(g)}>Reject</button>
                      <button className="btn-small btn-secondary" onClick={() => leaveUnmatched(g)}>Leave Unmatched</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length > 100 && <p className="empty-note">Showing first 100 of {visible.length} locations.</p>}
        {visible.length === 0 && <p className="empty-note">No locations currently need review — everything is either matched or no ENEX assets have been imported yet.</p>}
      </div>

      <hr className="import-divider" />
      <button className="btn-secondary" onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? 'Hide' : 'Show'} Review History ({history.length})
      </button>
      {showHistory && (
        <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
          <table>
            <thead><tr><th>Date</th><th>Location</th><th>Decision</th><th>Selected Room</th><th>Created Alias</th><th>Created Rule</th></tr></thead>
            <tbody>
              {history.slice().reverse().slice(0, 100).map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.reviewedAt).toLocaleString()}</td>
                  <td>{h.rawLocation}</td>
                  <td>{h.decision}</td>
                  <td>{h.selectedRoomId ? roomLabel(rooms, h.selectedRoomId) : '—'}</td>
                  <td>{h.createdAlias ? 'Yes' : 'No'}</td>
                  <td>{h.createdRule ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <p className="empty-note">No review decisions recorded yet.</p>}
        </div>
      )}
    </section>
  );
}
