import { project, getConfiguredBuildings, floors, getSections } from '../lib/data';

export default function ProjectInfo() {
  const configured = getConfiguredBuildings();
  const configuredNames = configured.map((b) => `${b.id} — ${b.name}`).join(', ') || 'None';
  const sections = getSections();

  const rows = [
    ['Facility', project.facility],
    ['Tool', `${project.acronym} — ${project.tagline || 'Internal Operations Tool'}`],
    ['Version', `${project.phase} ${project.version || ''}`.trim()],
    ['Current configured building(s)', configuredNames],
    ['Current configured floors', floors.length],
    ['Current configured sections', sections.length],
    ['Room data', 'Pending approved floor-plan PDFs'],
    ['Asset data', 'Pending AssetWorx import'],
  ];

  return (
    <section className="panel">
      <h2>Project Information</h2>
      <dl className="project-info-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
