import { useState } from 'react';
import {
  getFacilities, getBuildings, getFloors, getSections, getRooms,
  LOCAL_KEYS, saveLocalData, clearLocalData,
} from '../lib/data';
import { downloadJson } from '../lib/fileImport';

const ENTITY_TYPES = [
  { id: 'facilities', label: 'Facilities', columns: ['id', 'name', 'city', 'state', 'status', 'notes'] },
  { id: 'buildings', label: 'Buildings', columns: ['id', 'facilityId', 'name', 'status', 'configured', 'notes'] },
  { id: 'floors', label: 'Floors', columns: ['id', 'facilityId', 'buildingId', 'name', 'level', 'status', 'notes'] },
  { id: 'sections', label: 'Sections', columns: ['id', 'facilityId', 'buildingId', 'floorId', 'name', 'status', 'completionPct', 'lastUpdate', 'notes'] },
  { id: 'rooms', label: 'Rooms', columns: ['id', 'facilityId', 'buildingId', 'floorId', 'sectionId', 'roomNumber', 'roomName', 'roomType', 'architecturalZone', 'status', 'lastUpdate', 'notes'] },
];

const COLUMN_LABELS = {
  id: 'ID', facilityId: 'Facility', buildingId: 'Building', floorId: 'Floor', sectionId: 'Section',
  name: 'Name', city: 'City', state: 'State', status: 'Status', notes: 'Notes',
  configured: 'Configured', level: 'Level', completionPct: 'Completion %', lastUpdate: 'Last Updated',
  roomNumber: 'Room Number', roomName: 'Room Name', roomType: 'Room Type',
  architecturalZone: 'Zone',
};

const DATASET_GETTERS = {
  facilities: getFacilities, buildings: getBuildings, floors: getFloors, sections: getSections, rooms: getRooms,
};

const CLEAR_KEYS = {
  facilities: LOCAL_KEYS.facilities, buildings: LOCAL_KEYS.buildings, floors: LOCAL_KEYS.floors,
  sections: LOCAL_KEYS.sectionProgress, rooms: LOCAL_KEYS.rooms,
};

export default function ConfigurationCenter() {
  const [entityId, setEntityId] = useState('facilities');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [search, setSearch] = useState('');

  const entity = ENTITY_TYPES.find((e) => e.id === entityId);
  let rows = DATASET_GETTERS[entityId]();

  if (facilityFilter) rows = rows.filter((r) => r.facilityId === facilityFilter);
  if (buildingFilter && 'buildingId' in (rows[0] || {})) rows = rows.filter((r) => r.buildingId === buildingFilter);
  if (floorFilter && 'floorId' in (rows[0] || {})) rows = rows.filter((r) => r.floorId === floorFilter);
  if (sectionFilter && 'sectionId' in (rows[0] || {})) rows = rows.filter((r) => r.sectionId === sectionFilter);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter((r) => Object.values(r).some((v) => (v ?? '').toString().toLowerCase().includes(q)));
  }

  const facilities = getFacilities();
  const buildings = getBuildings();
  const floors = getFloors();
  const sections = getSections();

  const handleDownload = () => {
    downloadJson(rows, `QCOD_${entity.label}_Configuration_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleClear = () => {
    if (!window.confirm(`This clears all locally imported ${entity.label} configuration on this computer. Continue?`)) return;
    saveLocalData(CLEAR_KEYS[entityId], []);
  };

  return (
    <section className="panel">
      <h2>Configuration</h2>
      <p className="local-only-note">
        QCOD currently runs locally. Selected files are processed in this browser and are not uploaded to a server.
      </p>

      <div className="import-controls">
        <label>
          Entity Type
          <select value={entityId} onChange={(e) => { setEntityId(e.target.value); setBuildingFilter(''); setFloorFilter(''); setSectionFilter(''); }}>
            {ENTITY_TYPES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>

        <label>
          Facility
          <select value={facilityFilter} onChange={(e) => setFacilityFilter(e.target.value)}>
            <option value="">All Facilities</option>
            {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>

        {entityId !== 'facilities' && (
          <label>
            Building
            <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)}>
              <option value="">All Buildings</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>
          </label>
        )}

        {(entityId === 'sections' || entityId === 'rooms') && (
          <label>
            Floor
            <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)}>
              <option value="">All Floors</option>
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        )}

        {entityId === 'rooms' && (
          <label>
            Section
            <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
              <option value="">All Sections</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}

        <label>
          Search
          <input type="text" placeholder="Search all fields" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <p className="empty-note">{rows.length} record{rows.length === 1 ? '' : 's'} found.</p>

      <div className="import-actions">
        <button className="btn-secondary" onClick={handleDownload}>Download Current Configuration</button>
        <button className="btn-danger" onClick={handleClear}>Clear Local {entity.label} Configuration</button>
      </div>

      {rows.length === 0 ? (
        <p className="empty-note">No {entity.label.toLowerCase()} matched the selected filters.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{entity.columns.map((c) => <th key={c}>{COLUMN_LABELS[c] ?? c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r, i) => (
                <tr key={r.id || i}>
                  {entity.columns.map((c) => (
                    <td key={c}>{typeof r[c] === 'boolean' ? (r[c] ? 'Yes' : 'No') : (r[c] ?? '—')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 100 && <p className="empty-note">Showing first 100 of {rows.length} records.</p>}
        </div>
      )}
    </section>
  );
}
