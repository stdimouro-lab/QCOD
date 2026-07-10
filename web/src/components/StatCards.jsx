import { getProjectTotals, getSectionProgressPct, pct, fmtNum, project } from '../lib/data';
import { ProgressBar } from '../lib/status';

export default function StatCards({ statusCounts, totalSections }) {
  const { expected, found, tagged } = getProjectTotals();
  const sectionProgress = getSectionProgressPct();
  const assetProgress = pct(tagged, expected);

  const cards = [
    { label: 'Section Progress', value: `${sectionProgress}%`, sub: `Average across ${totalSections} sections`, accent: true },
    { label: 'Asset Progress', value: assetProgress === null ? 'Pending' : `${assetProgress}%`, sub: 'Tagged vs expected' },
    { label: 'Total Expected Assets', value: fmtNum(expected), sub: 'From AssetWorx' },
    { label: 'Assets Located', value: fmtNum(found), sub: 'Confirmed on-site' },
    { label: 'Assets Tagged', value: fmtNum(tagged), sub: 'RFID tagged' },
    { label: 'Sections Complete', value: statusCounts.completed, sub: `of ${totalSections} sections` },
    { label: 'Return Needed', value: statusCounts.return_needed, sub: 'Locations to revisit', warn: true },
    { label: 'No Access', value: statusCounts.no_access, sub: 'Inaccessible areas', danger: true },
  ];

  return (
    <section className="stat-grid">
      {cards.map((card) => (
        <article key={card.label} className={`stat-card${card.accent ? ' accent' : ''}${card.warn ? ' warn' : ''}${card.danger ? ' danger' : ''}`}>
          <p className="stat-label">{card.label}</p>
          <p className="stat-value">{card.value}</p>
          <p className="stat-sub">{card.sub}</p>
        </article>
      ))}
      <article className="stat-card wide">
        <div className="dual-progress">
          <ProgressBar value={sectionProgress} label="Section Completion" />
          <ProgressBar value={assetProgress} label="Assets Found and Tagged" />
        </div>
        <p className="stat-sub verified-note">Verified values only. Unknown totals remain pending.</p>
        <p className="stat-sub">Last updated {project.lastUpdated}</p>
      </article>
    </section>
  );
}
