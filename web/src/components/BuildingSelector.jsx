import { getBuildings } from '../lib/data';

export default function BuildingSelector({ selectedId, onChange, facilityId }) {
  const buildings = facilityId
    ? getBuildings().filter((b) => b.facilityId === facilityId)
    : getBuildings();

  return (
    <div className="building-selector">
      <label htmlFor="building-select">Building</label>
      <select
        id="building-select"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
      >
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.id} — {b.name}{b.configured ? '' : ' (Data Pending)'}
          </option>
        ))}
      </select>
    </div>
  );
}
