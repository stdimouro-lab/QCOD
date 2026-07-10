import { pct, fmtNum, getSectionsForFloor } from '../lib/data';
import { ProgressBar, StatusBadge } from '../lib/status';
import EmptyState from './EmptyState';

export default function FloorProgress({ floors, buildingConfigured = true }) {
  if (!buildingConfigured) {
    return (
      <section className="panel">
        <h2>Floor Progress</h2>
        <EmptyState message="No detailed floor or section data has been configured for this building." />
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Floor Progress</h2>
      <div className="floor-grid">
        {floors.map((floor) => {
          const floorSections = getSectionsForFloor(floor.id);
          const sectionProgress = floorSections.length
            ? Math.round(floorSections.reduce((s, sec) => s + (sec.completionPct || 0), 0) / floorSections.length)
            : 0;
          const assetProgress = pct(floor.taggedAssets, floor.expectedAssets);

          return (
            <article key={floor.id} className="floor-card">
              <div className="floor-card-header">
                <h3>{floor.name}</h3>
                <StatusBadge status={floor.status} />
              </div>
              <ProgressBar value={sectionProgress} label="Section Progress" />
              <ProgressBar value={assetProgress} label="Asset Progress" />
              <dl className="asset-dl">
                <div><dt>Tracked Sections</dt><dd>{floorSections.length}</dd></div>
                <div><dt>Expected</dt><dd>{fmtNum(floor.expectedAssets)}</dd></div>
                <div><dt>Tagged</dt><dd>{fmtNum(floor.taggedAssets)}</dd></div>
              </dl>
              <p className="floor-map-note">{floor.mapNotes || 'Floor information pending'}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
