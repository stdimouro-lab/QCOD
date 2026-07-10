import { pct } from '../lib/data';
import { ProgressBar, StatusBadge } from '../lib/status';

export default function FloorProgress({ floors }) {
  return (
    <section className="panel">
      <h2>Floor Progress</h2>
      <div className="floor-grid">
        {floors.map((floor) => (
          <article key={floor.id} className="floor-card">
            <div className="floor-card-header">
              <h3>{floor.name}</h3>
              <StatusBadge status={floor.status} />
            </div>
            <ProgressBar value={pct(floor.taggedAssets, floor.expectedAssets)} label="Section Completion" />
            {floor.mapCompletionPct != null && (
              <ProgressBar value={floor.mapCompletionPct} label="Field Map Progress" />
            )}
            {floor.mapNotes && <p className="floor-map-note">{floor.mapNotes}</p>}
            <dl className="asset-dl">
              <div><dt>Expected</dt><dd>{floor.expectedAssets.toLocaleString()}</dd></div>
              <div><dt>Found</dt><dd>{floor.foundAssets.toLocaleString()}</dd></div>
              <div><dt>Tagged</dt><dd>{floor.taggedAssets.toLocaleString()}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
