import { useState, Fragment } from 'react';
import { getFloorName, fmtNum, getSectionHistoryForSection } from '../lib/data';
import { StatusBadge } from '../lib/status';
import SectionHistory from './SectionHistory';

export default function SectionTable({ sections, title = 'Section Progress', emptyMessage }) {
  const [expandedId, setExpandedId] = useState(null);

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
                <th>History</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const assetProgress = s.expectedAssets > 0
                  ? Math.round((s.taggedAssets / s.expectedAssets) * 100)
                  : null;
                const historyCount = getSectionHistoryForSection(s.id).length;
                const expanded = expandedId === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr>
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
                      <td>
                        <button
                          className="btn-secondary btn-small"
                          onClick={() => setExpandedId(expanded ? null : s.id)}
                        >
                          {expanded ? 'Hide' : 'View'} ({historyCount})
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={11}>
                          <SectionHistory sectionId={s.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
