import { useState } from 'react';
import { getRooms, getFacilities, getBuildings, getFloors, getSectionsForFloor, statuses } from '../lib/data';
import { StatusBadge } from '../lib/status';
import { getRoomZone } from '../lib/roomAssignment';
import { exportReportToExcel } from '../lib/exportExcel';
import { exportReportToPdf } from '../lib/exportPdf';

const ROOM_REPORT_COLUMNS = [
  { header: 'Floor', key: 'floorId' }, { header: 'Zone', key: 'zone' },
  { header: 'Room Number', key: 'roomNumber' }, { header: 'Room Name', key: 'roomName' },
  { header: 'Room Type', key: 'roomType' }, { header: 'Section', key: 'sectionName' },
  { header: 'Assignment Status', key: 'assignmentStatus' }, { header: 'Confidence', key: 'assignmentConfidence' },
  { header: 'Operational Status', key: 'status' }, { header: 'Last Updated', key: 'lastUpdate' }, { header: 'Notes', key: 'notes' },
];

export default function RoomTable({ facilityId }) {
  const [buildingFilter, setBuildingFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState(''); // '', 'assigned', 'unassigned', 'needs_review'
  const [search, setSearch] = useState('');

  const facilities = getFacilities();
  const buildings = getBuildings().filter((b) => !facilityId || b.facilityId === facilityId);
  const floors = getFloors().filter((f) => !buildingFilter || f.buildingId === buildingFilter);
  const sections = floorFilter ? getSectionsForFloor(floorFilter) : [];

  let rooms = getRooms().filter((r) => !facilityId || r.facilityId === facilityId);
  if (buildingFilter) rooms = rooms.filter((r) => r.buildingId === buildingFilter);
  if (floorFilter) rooms = rooms.filter((r) => r.floorId === floorFilter);
  if (sectionFilter) rooms = rooms.filter((r) => r.sectionId === sectionFilter);
  if (statusFilter) rooms = rooms.filter((r) => r.status === statusFilter);
  if (assignmentFilter === 'assigned') rooms = rooms.filter((r) => r.assignmentStatus === 'confirmed');
  else if (assignmentFilter === 'unassigned') rooms = rooms.filter((r) => r.assignmentStatus === 'unassigned');
  else if (assignmentFilter === 'needs_review') rooms = rooms.filter((r) => r.assignmentStatus === 'needs_review' || r.assignmentStatus === 'suggested');
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rooms = rooms.filter((r) => r.roomNumber?.toLowerCase().includes(q) || r.roomName?.toLowerCase().includes(q));
  }

  const facilityName = (id) => facilities.find((f) => f.id === id)?.name ?? id;
  const buildingName = (id) => buildings.find((b) => b.id === id)?.name ?? id;
  const floorName = (id) => getFloors().find((f) => f.id === id)?.name ?? id;
  const sectionName = (room) => getSectionsForFloor(room.floorId).find((s) => s.id === room.sectionId)?.name ?? room.sectionId;

  return (
    <section className="panel">
      <h2>Rooms</h2>

      <div className="import-controls">
        <label>
          Building
          <select value={buildingFilter} onChange={(e) => { setBuildingFilter(e.target.value); setFloorFilter(''); setSectionFilter(''); }}>
            <option value="">All Buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
          </select>
        </label>

        <label>
          Floor
          <select value={floorFilter} onChange={(e) => { setFloorFilter(e.target.value); setSectionFilter(''); }} disabled={!buildingFilter}>
            <option value="">All Floors</option>
            {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>

        <label>
          Section
          <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} disabled={!floorFilter}>
            <option value="">All Sections</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {Object.keys(statuses).map((key) => <option key={key} value={key}>{statuses[key].label}</option>)}
          </select>
        </label>

        <label>
          Assignment
          <select value={assignmentFilter} onChange={(e) => setAssignmentFilter(e.target.value)}>
            <option value="">All</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
            <option value="needs_review">Needs Review</option>
          </select>
        </label>

        <label>
          Search
          <input type="text" placeholder="Room number or name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <p className="empty-note">{rooms.length} room{rooms.length === 1 ? '' : 's'} found.</p>

      <div className="import-actions">
        <button
          className="btn-secondary"
          onClick={() => exportReportToExcel({
            reportName: 'Room Directory',
            columns: ROOM_REPORT_COLUMNS,
            rows: rooms.map((r) => ({ ...r, zone: getRoomZone(r.roomNumber), sectionName: sectionName(r) })),
          })}
        >
          Export Excel
        </button>
        <button
          className="btn-secondary"
          onClick={() => exportReportToPdf({
            reportName: 'Room Directory',
            columns: ROOM_REPORT_COLUMNS,
            rows: rooms.map((r) => ({ ...r, zone: getRoomZone(r.roomNumber), sectionName: sectionName(r) })),
            emptyMessage: 'No room data has been configured for this selection.',
          })}
        >
          Export PDF
        </button>
      </div>

      {rooms.length === 0 ? (
        <p className="empty-note">No room data has been configured for this selection.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Facility</th><th>Building</th><th>Floor</th><th>Zone</th><th>Section</th>
                <th>Room Number</th><th>Room Name</th><th>Room Type</th><th>Assignment Status</th>
                <th>Confidence</th><th>Operational Status</th><th>Last Updated</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td>{facilityName(r.facilityId)}</td>
                  <td>{buildingName(r.buildingId)}</td>
                  <td>{floorName(r.floorId)}</td>
                  <td>{getRoomZone(r.roomNumber) || '—'}</td>
                  <td>{sectionName(r)}</td>
                  <td>{r.roomNumber}</td>
                  <td>{r.roomName || '—'}</td>
                  <td>{r.roomType || '—'}</td>
                  <td>{r.assignmentStatus || 'unassigned'}</td>
                  <td>{r.assignmentConfidence || 'none'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.lastUpdate || 'Not Updated'}</td>
                  <td>{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
