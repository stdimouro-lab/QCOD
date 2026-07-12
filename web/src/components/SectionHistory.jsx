import { getSectionHistoryForSection } from '../lib/data';
import { getStatusMeta } from '../lib/status';

export default function SectionHistory({ sectionId }) {
  const history = getSectionHistoryForSection(sectionId).slice().reverse();

  if (history.length === 0) {
    return <p className="empty-note">No status changes recorded for this section yet.</p>;
  }

  return (
    <div className="table-wrap section-history">
      <table>
        <thead>
          <tr><th>Date</th><th>Previous Status</th><th>New Status</th><th>Previous %</th><th>New %</th><th>Note</th></tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id}>
              <td>{new Date(h.updatedAt).toLocaleString()}</td>
              <td>{getStatusMeta(h.previousStatus).label}</td>
              <td>{getStatusMeta(h.newStatus).label}</td>
              <td>{h.previousCompletionPct}%</td>
              <td>{h.newCompletionPct}%</td>
              <td>{h.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
