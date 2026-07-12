import { getFacilities } from '../lib/data';

export default function FacilitySelector({ selectedId, onChange }) {
  const facilities = getFacilities();

  return (
    <div className="building-selector">
      <label htmlFor="facility-select">Facility</label>
      <select
        id="facility-select"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
      >
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
    </div>
  );
}
