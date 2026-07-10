import { getCampusSummary, getProjectTotals, pct, project } from '../lib/data';
import { ProgressBar } from '../lib/status';

export default function StatCards() {
  const summary = getCampusSummary();
  const { expected, tagged, sectionProgress } = getProjectTotals();
  const assetProgress = pct(tagged, expected);

  const cards = [
    { label: 'Buildings Configured', value: summary.buildingsConfigured },
    { label: 'Buildings In Progress', value: summary.buildingsInProgress },
    { label: 'Buildings Complete', value: summary.buildingsComplete },
    { label: 'Floors Configured', value: summary.floorsConfigured },
    { label: 'Sections Configured', value: summary.sectionsConfigured },
    { label: 'Sections Complete', value: summary.sectionsComplete },
    { label: 'Section Progress', value: `${sectionProgress}%`, accent: true },
    { label: 'Asset Progress', value: assetProgress === null ? 'Pending' : `${assetProgress}%` },
    { label: 'Return Needed', value: summary.returnNeeded, warn: true },
    { label: 'No Access', value: summary.noAccess, danger: true },
  ];

  return (
    <section className="stat-grid">
      {cards.map((card) => (
        <article key={card.label} className={`stat-card${card.accent ? ' accent' : ''}${card.warn ? ' warn' : ''}${card.danger ? ' danger' : ''}`}>
          <p className="stat-label">{card.label}</p>
          <p className="stat-value">{card.value}</p>
        </article>
      ))}
      <article className="stat-card wide">
        <div className="dual-progress">
          <ProgressBar value={sectionProgress} label="Overall Section Completion" />
          <ProgressBar value={assetProgress} label="Assets Found and Tagged" />
        </div>
        <p className="stat-sub verified-note">Verified values only. Unknown totals remain pending.</p>
        <p className="stat-sub">Last updated {project.lastUpdated}</p>
      </article>
    </section>
  );
}
