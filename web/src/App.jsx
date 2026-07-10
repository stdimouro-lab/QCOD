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
  const building = buildings[0];

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <p className="header-eyebrow">Martinsburg VA Medical Center</p>
          <h1>Quality Control Operations Dashboard</h1>
          <p className="header-sub">
            Building {project.focusBuilding} — {building?.name} — {project.phase}
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

        {(tab === 'overview' || tab === 'sections') && tab !== 'outstanding' && (
          <SectionTable sections={sections} />
        )}

        {tab === 'outstanding' && (
          <SectionTable sections={outstanding} title="Outstanding Work" />
        )}
      </main>

      <footer className="footer">
        QCOD complements AssetWorx — room-level tracking pending official floor plan PDFs.
      </footer>
    </div>
  );
}
