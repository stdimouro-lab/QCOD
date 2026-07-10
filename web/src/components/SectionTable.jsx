import { getFloorName, fmtNum } from '../lib/data';
import { StatusBadge } from '../lib/status';

export default function SectionTable({ sections, title = 'Section Progress', emptyMessage }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {sections.length === 0 && emptyMessage ? (
        <p className="empty-note">{emptyMessage}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Floor</th>
                <th>Section</th>
                <th>Section Progress</th>
                <th>Asset Progress</th>
                <th>Status</th>
                <th>Expected Assets</th>
                <th>Found</th>
                <th>Tagged</th>
                <th>Last Updated</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const assetProgress = s.expectedAssets > 0
                  ? Math.round((s.taggedAssets / s.expectedAssets) * 100)
                  : null;
                return (
                  <tr key={s.id}>
                    <td>{getFloorName(s.floorId)}</td>
                    <td className="section-name">{s.name}</td>
                    <td>
                      <div className="mini-bar-wrap">
                        <div className="mini-bar" style={{ width: `${s.completionPct || 0}%` }} />
                        <span>{s.completionPct || 0}%</span>
                      </div>
                    </td>
                    <td>{assetProgress === null ? 'Pending' : `${assetProgress}%`}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{fmtNum(s.expectedAssets)}</td>
                    <td>{fmtNum(s.foundAssets)}</td>
                    <td>{fmtNum(s.taggedAssets)}</td>
                    <td>{s.lastUpdate || 'Not Updated'}</td>
                    <td className="notes-cell">{s.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
