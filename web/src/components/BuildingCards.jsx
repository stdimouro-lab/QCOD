import { getBuildingTotals, pct, fmtNum } from '../lib/data';
import { StatusBadge } from '../lib/status';

export default function BuildingCards({ buildings, onSelect }) {
  return (
    <section className="panel">
      <h2>Buildings</h2>
      <div className="building-grid">
        {buildings.map((b) => {
          const totals = getBuildingTotals(b.id);
          const assetProgress = pct(totals.tagged, totals.expected);
          return (
            <article key={b.id} className="building-card" onClick={() => onSelect?.(b.id)}>
              <div className="floor-card-header">
                <h3>{b.id} — {b.name}</h3>
                <StatusBadge status={b.status} />
              </div>
              <dl className="asset-dl building-dl">
                <div><dt>Floors</dt><dd>{b.configured ? totals.floorCount : 'Pending'}</dd></div>
                <div><dt>Sections</dt><dd>{b.configured ? totals.sectionCount : 0}</dd></div>
                <div><dt>Rooms</dt><dd>{b.configured ? totals.roomCount : 0}</dd></div>
                <div><dt>Rooms Pending Section</dt><dd>{b.configured ? totals.roomsPendingSection : 0}</dd></div>
                <div><dt>Section Progress</dt><dd>{b.configured ? `${totals.sectionProgress}%` : '0%'}</dd></div>
                <div><dt>Room Progress</dt><dd>{b.configured && totals.roomCount > 0 ? `${Math.round((totals.roomsCompleted / totals.roomCount) * 100)}%` : 'Rooms Pending'}</dd></div>
                <div><dt>Asset Progress</dt><dd>{assetProgress === null ? 'Pending' : `${assetProgress}%`}</dd></div>
                <div><dt>Expected</dt><dd>{fmtNum(totals.expected)}</dd></div>
                <div><dt>Found</dt><dd>{fmtNum(totals.found)}</dd></div>
                <div><dt>Tagged</dt><dd>{fmtNum(totals.tagged)}</dd></div>
              </dl>
              {b.notes && <p className="floor-map-note">{b.notes}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
