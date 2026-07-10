import { getProjectTotals, pct, project } from '../lib/data';
import { ProgressBar } from '../lib/status';

export default function StatCards({ statusCounts, totalSections }) {
  const { expected, found, tagged } = getProjectTotals();

  const cards = [
    { label: 'Overall Completion', value: `${pct(tagged, expected)}%`, sub: 'Assets tagged vs expected', accent: true },
    { label: 'Expected Assets', value: expected.toLocaleString(), sub: 'From AssetWorx' },
    { label: 'Found Assets', value: found.toLocaleString(), sub: `${pct(found, expected)}% located` },
    { label: 'Tagged Assets', value: tagged.toLocaleString(), sub: `${pct(tagged, expected)}% tagged` },
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
        <p className="stat-label">Asset Tagging Progress</p>
        <ProgressBar value={pct(tagged, expected)} />
        <p className="stat-sub">Last updated {project.lastUpdated}</p>
      </article>
    </section>
  );
}
