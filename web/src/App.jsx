import { useState } from 'react';
import {
  project, buildings, floors, sections,
  getStatusCounts, getOutstandingSections,
} from './lib/data';
import { statuses } from './lib/data';
import StatCards from './components/StatCards';
import FloorProgress from './components/FloorProgress';
import SectionTable from './components/SectionTable';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'floors', label: 'Floors' },
  { id: 'sections', label: 'Sections' },
  { id: 'outstanding', label: 'Outstanding Work' },
];

export default function App() {
  const [tab, setTab] = useState('overview');
  const statusCounts = getStatusCounts();
  const outstanding = getOutstandingSections();
  const returnNeeded = outstanding.filter((s) => s.status === 'return_needed');
  const noAccess = outstanding.filter((s) => s.status === 'no_access');
  const building = buildings[0];

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <p className="header-eyebrow">{project.acronym || 'QCOD'}</p>
          <h1>Quality Control Operations Dashboard</h1>
          <p className="header-sub">{project.facility}</p>
          <p className="header-sub">
            Building {project.focusBuilding} — {project.phase}
          </p>
        </div>
        <div className="status-legend">
          {Object.entries(statuses).map(([key, val]) => (
            <span key={key} className="legend-item">
              {val.symbol} {val.label}
            </span>
          ))}
        </div>
      </header>

      <div className="poc-banner">
        Proof of Concept — Only verified project information is shown. Unknown values remain pending.
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'outstanding' && outstanding.length > 0 && (
              <span className="tab-badge">{outstanding.length}</span>
            )}
          </button>
        ))}
      </nav>

      <main>
        {(tab === 'overview' || tab === 'floors') && (
          <StatCards statusCounts={statusCounts} totalSections={sections.length} />
        )}

        {(tab === 'overview' || tab === 'floors') && (
          <FloorProgress floors={floors} />
        )}

        {tab === 'sections' && (
          <SectionTable sections={sections} title="Sections" />
        )}

        {tab === 'outstanding' && (
          <>
            <SectionTable
              sections={returnNeeded}
              title="Return Needed"
              emptyMessage="No sections currently marked Return Needed."
            />
            <SectionTable
              sections={noAccess}
              title="No Access"
              emptyMessage="No sections currently marked No Access."
            />
          </>
        )}
      </main>

      <footer className="footer">
        QCOD complements AssetWorx — room-level tracking pending official floor plan PDFs.
      </footer>
    </div>
  );
}
