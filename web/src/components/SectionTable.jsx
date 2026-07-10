import { getFloorName } from '../lib/data';
import { StatusBadge } from '../lib/status';

export default function SectionTable({ sections, title = 'Section Progress' }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Section</th>
              <th>Floor</th>
              <th>Status</th>
              <th>Completion</th>
              <th>Assets Tagged</th>
              <th>Expected</th>
              <th>Notes</th>
              <th>Last Update</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.id}>
                <td className="section-name">{s.name}</td>
                <td>{getFloorName(s.floorId)}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>
                  <div className="mini-bar-wrap">
                    <div className="mini-bar" style={{ width: `${s.completionPct}%` }} />
                    <span>{s.completionPct}%</span>
                  </div>
                </td>
                <td>{s.taggedAssets.toLocaleString()}</td>
                <td>{s.expectedAssets.toLocaleString()}</td>
                <td className="notes-cell">{s.notes || '—'}</td>
                <td>{s.lastUpdate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
