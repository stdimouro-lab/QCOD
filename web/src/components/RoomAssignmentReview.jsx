import { useState, useMemo } from 'react';
import {
  getRooms, getFacilities, getBuildings, getFloors, getSectionsForFloor, getSections,
  getSectionBoundaries, loadSectionBoundariesFromFile, applyRoomAssignmentChange,
  getRoomAssignmentHistory, statuses,
} from '../lib/data';
import { suggestRoomSection, getRoomZone } from '../lib/roomAssignment';
import { downloadJson } from '../lib/fileImport';

function sectionName(sections, id) {
  return sections.find((s) => s.id === id)?.name || id || '—';
}

export default function RoomAssignmentReview() {
  const [facilityFilter, setFacilityFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('500');
  const [floorFilter, setFloorFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [manualSectionId, setManualSectionId] = useState('');
  const [status, setStatus] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [boundariesStatus, setBoundariesStatus] = useState('');

  const facilities = getFacilities();
  const buildings = getBuildings();
  const floors = floorFilter || buildingFilter ? getFloors().filter((f) => !buildingFilter || f.buildingId === buildingFilter) : getFloors();
  const sections = getSections();
  const boundaries = getSectionBoundaries();
  const history = getRoomAssignmentHistory();

  // Live-computed suggestions — never applied automatically. This just
  // shows what the engine *would* propose; only an explicit Confirm click
  // (single or batch) writes anything.
  const roomsWithSuggestions = useMemo(() => {
    return getRooms().map((r) => {
      if (r.assignmentStatus === 'confirmed') return r; // don't re-suggest over a human decision
      const suggestion = suggestRoomSection(r, boundaries);
      return { ...r, _suggestion: suggestion };
    });
  }, [boundaries]);

  let rooms = roomsWithSuggestions;
  if (facilityFilter) rooms = rooms.filter((r) => r.facilityId === facilityFilter);
  if (buildingFilter) rooms = rooms.filter((r) => r.buildingId === buildingFilter);
  if (floorFilter) rooms = rooms.filter((r) => r.floorId === floorFilter);
  if (sectionFilter) rooms = rooms.filter((r) => r.sectionId === sectionFilter || r._suggestion?.sectionId === sectionFilter);
  if (zoneFilter) rooms = rooms.filter((r) => getRoomZone(r.roomNumber) === zoneFilter);
  if (assignmentStatusFilter) rooms = rooms.filter((r) => r.assignmentStatus === assignmentStatusFilter);
  if (confidenceFilter) rooms = rooms.filter((r) => (r.assignmentConfidence || r._suggestion?.assignmentConfidence) === confidenceFilter);
  if (showOnlyUnassigned) rooms = rooms.filter((r) => r.assignmentStatus !== 'confirmed');
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rooms = rooms.filter((r) => r.roomNumber?.toLowerCase().includes(q) || r.roomName?.toLowerCase().includes(q));
  }

  const zones = [...new Set(getRooms().map((r) => getRoomZone(r.roomNumber)).filter(Boolean))].sort();

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => setSelected(new Set(rooms.map((r) => r.id)));
  const clearSelection = () => setSelected(new Set());

  const confirmSuggested = () => {
    if (selected.size === 0) { setStatus('Select at least one room first.'); return; }
    const targets = rooms.filter((r) => selected.has(r.id));
    let applied = 0;
    targets.forEach((r) => {
      const suggestion = r._suggestion;
      if (!suggestion || !suggestion.sectionId) return;
      applyRoomAssignmentChange([r.id], {
        sectionId: suggestion.sectionId,
        assignmentStatus: 'confirmed',
        assignmentConfidence: 'high',
        assignmentSource: suggestion.assignmentSource,
        assignmentReason: `Confirmed by reviewer — originally suggested: ${suggestion.assignmentReason}`,
      }, 'batch');
      applied += 1;
    });
    setStatus(`Confirmed ${applied} room(s). ${targets.length - applied} had no suggestion to confirm.`);
    setSelected(new Set());
  };

  const confirmManualSection = () => {
    if (selected.size === 0) { setStatus('Select at least one room first.'); return; }
    if (!manualSectionId) { setStatus('Choose a section first.'); return; }
    const { updatedCount } = applyRoomAssignmentChange(Array.from(selected), {
      sectionId: manualSectionId,
      assignmentStatus: 'confirmed',
      assignmentConfidence: 'high',
      assignmentSource: 'manual_review',
      assignmentReason: 'Manually confirmed by reviewer',
    }, 'batch');
    setStatus(`Confirmed ${updatedCount} room(s) to ${sectionName(sections, manualSectionId)}.`);
    setSelected(new Set());
    setManualSectionId('');
  };

  const rejectSuggestion = () => {
    if (selected.size === 0) { setStatus('Select at least one room first.'); return; }
    const { updatedCount } = applyRoomAssignmentChange(Array.from(selected), {
      sectionId: '',
      assignmentStatus: 'unassigned',
      assignmentConfidence: 'none',
      assignmentSource: 'unassigned',
      assignmentReason: 'Suggestion rejected by reviewer',
    }, 'manual_review');
    setStatus(`Rejected suggestion for ${updatedCount} room(s) — back to unassigned.`);
    setSelected(new Set());
  };

  const markNeedsReview = () => {
    if (selected.size === 0) { setStatus('Select at least one room first.'); return; }
    const { updatedCount } = applyRoomAssignmentChange(Array.from(selected), {
      assignmentStatus: 'needs_review',
    }, 'manual_review');
    setStatus(`Marked ${updatedCount} room(s) as needing review.`);
    setSelected(new Set());
  };

  const clearAssignment = () => {
    if (selected.size === 0) { setStatus('Select at least one room first.'); return; }
    if (!window.confirm(`Clear the section assignment for ${selected.size} selected room(s)?`)) return;
    const { updatedCount } = applyRoomAssignmentChange(Array.from(selected), {
      sectionId: '', assignmentStatus: 'unassigned', assignmentConfidence: 'none',
      assignmentSource: 'unassigned', assignmentReason: '',
    }, 'manual_review');
    setStatus(`Cleared assignment for ${updatedCount} room(s).`);
    setSelected(new Set());
  };

  const handleExportReview = () => {
    downloadJson(rooms, `QCOD_Room_Assignment_Review_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleLoadBoundaries = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const loaded = await loadSectionBoundariesFromFile(f);
      setBoundariesStatus(`Loaded ${loaded.length} section boundary rule(s). Note: this file is never uploaded — it's read locally in this browser only.`);
    } catch (err) {
      setBoundariesStatus(`Could not load boundaries: ${err.message}`);
    }
  };

  const availableSectionsForFilter = floorFilter ? getSectionsForFloor(floorFilter) : sections;

  return (
    <section className="panel">
      <h2>Room Assignment</h2>
      <p className="local-only-note">
        QCOD currently runs locally. Selected files are processed in this browser and are not uploaded to a server.
      </p>
      <p className="empty-note">
        Suggestions come only from approved boundary rules (confirmed room numbers, approved ranges/prefixes)
        or a room-name keyword hint. A keyword hint alone is never enough to confirm — every assignment,
        single or batch, requires your explicit confirmation below.
      </p>

      <h3 className="import-subheading">Section Boundary Configuration</h3>
      <div className="import-actions">
        <label className="btn-secondary file-btn">
          Load Section Boundaries File
          <input type="file" accept=".json" onChange={handleLoadBoundaries} hidden />
        </label>
        <span className="empty-note">{boundaries.length} boundary rule(s) currently loaded</span>
      </div>
      {boundariesStatus && <p className="import-success">{boundariesStatus}</p>}

      <h3 className="import-subheading">Filters</h3>
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
          <select value={buildingFilter} onChange={(e) => { setBuildingFilter(e.target.value); setFloorFilter(''); }}>
            <option value="">All Buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
          </select>
        </label>
        <label>
          Floor
          <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)}>
            <option value="">All Floors</option>
            {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label>
          Section
          <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
            <option value="">All Sections</option>
            {availableSectionsForFilter.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>
          Zone
          <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
            <option value="">All Zones</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <label>
          Assignment Status
          <select value={assignmentStatusFilter} onChange={(e) => setAssignmentStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="suggested">Suggested</option>
            <option value="needs_review">Needs Review</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
        <label>
          Confidence
          <select value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value)}>
            <option value="">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="none">None</option>
          </select>
        </label>
        <label>
          Search
          <input type="text" placeholder="Room number or name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <label className="empty-note" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <input type="checkbox" checked={showOnlyUnassigned} onChange={(e) => setShowOnlyUnassigned(e.target.checked)} />
        Show only unassigned / not-yet-confirmed rooms
      </label>

      <div className="import-actions">
        <button className="btn-secondary" onClick={selectAllVisible}>Select All Visible ({rooms.length})</button>
        <button className="btn-secondary" onClick={clearSelection}>Clear Selection</button>
        <button className="btn-secondary" onClick={handleExportReview}>Export Review List</button>
        <span className="empty-note">{selected.size} selected</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th><th>Floor</th><th>Zone</th><th>Room Number</th><th>Room Name</th><th>Room Type</th>
              <th>Sq Ft</th><th>Current Section</th><th>Suggested Section</th><th>Confidence</th>
              <th>Assignment Status</th><th>Reason</th><th>Source Document</th>
            </tr>
          </thead>
          <tbody>
            {rooms.slice(0, 150).map((r) => {
              const suggestion = r._suggestion;
              return (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                  <td>{r.floorId}</td>
                  <td>{getRoomZone(r.roomNumber) || '—'}</td>
                  <td>{r.roomNumber}</td>
                  <td>{r.roomName || '—'}</td>
                  <td>{r.roomType || '—'}</td>
                  <td>{r.squareFeet ?? '—'}</td>
                  <td>{r.sectionId ? sectionName(sections, r.sectionId) : '—'}</td>
                  <td>{suggestion?.sectionId ? sectionName(sections, suggestion.sectionId) : '—'}</td>
                  <td>{suggestion?.assignmentConfidence || r.assignmentConfidence || 'none'}</td>
                  <td>{r.assignmentStatus}</td>
                  <td className="notes-cell">{suggestion?.assignmentReason || r.assignmentReason || '—'}</td>
                  <td>{r.sourceDocument || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rooms.length > 150 && <p className="empty-note">Showing first 150 of {rooms.length} rooms.</p>}
        {rooms.length === 0 && <p className="empty-note">No rooms matched the selected filters.</p>}
      </div>

      <h3 className="import-subheading">Review Actions</h3>
      <div className="import-controls">
        <label>
          Assign selected to section
          <select value={manualSectionId} onChange={(e) => setManualSectionId(e.target.value)}>
            <option value="">Choose a section...</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <div className="import-actions">
        <button className="btn-primary" onClick={confirmManualSection}>Confirm Assignment (Chosen Section)</button>
        <button className="btn-primary" onClick={confirmSuggested}>Confirm Suggested Section</button>
        <button className="btn-secondary" onClick={rejectSuggestion}>Reject Suggestion</button>
        <button className="btn-secondary" onClick={markNeedsReview}>Mark Needs Review</button>
        <button className="btn-danger" onClick={clearAssignment}>Clear Assignment</button>
      </div>
      {status && <p className="import-success">{status}</p>}

      <hr className="import-divider" />
      <button className="btn-secondary" onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? 'Hide' : 'Show'} Assignment History ({history.length})
      </button>
      {showHistory && (
        <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
          <table>
            <thead>
              <tr><th>Date</th><th>Room</th><th>Previous Section</th><th>New Section</th><th>Previous Status</th><th>New Status</th><th>Confidence</th><th>Source</th></tr>
            </thead>
            <tbody>
              {history.slice().reverse().slice(0, 150).map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.updatedAt).toLocaleString()}</td>
                  <td>{h.roomId}</td>
                  <td>{h.previousSectionId ? sectionName(sections, h.previousSectionId) : '—'}</td>
                  <td>{h.newSectionId ? sectionName(sections, h.newSectionId) : '—'}</td>
                  <td>{h.previousStatus}</td>
                  <td>{h.newStatus}</td>
                  <td>{h.confidence || '—'}</td>
                  <td>{h.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <p className="empty-note">No assignment changes recorded yet.</p>}
        </div>
      )}
    </section>
  );
}
