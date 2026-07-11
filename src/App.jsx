import { useState, useEffect } from 'react';
import {
  project, buildings, statuses,
  getBuilding, getFloorsForBuilding, getSectionsForBuilding, getOutstandingSections,
  onDataChanged,
} from './lib/data';
import StatCards from './components/StatCards';
import FloorProgress from './components/FloorProgress';
import SectionTable from './components/SectionTable';
import BuildingSelector from './components/BuildingSelector';
import BuildingCards from './components/BuildingCards';
import ProjectInfo from './components/ProjectInfo';
import DataStatus from './components/DataStatus';
import ImportCenter from './components/ImportCenter';
import ReportCenter from './components/ReportCenter';
import { StatusDot } from './lib/status';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'floors', label: 'Floors' },
  { id: 'sections', label: 'Sections' },
  { id: 'outstanding', label: 'Outstanding Work' },
  { id: 'imports', label: 'Imports' },
  { id: 'reports', label: 'Reports' },
];

export default function App() {
  const [tab, setTab] = useState('overview');
  const [selectedBuildingId, setSelectedBuildingId] = useState(project.focusBuilding || '500');
  // Bumped whenever an import/backup/clear writes to localStorage, so every
  // getSections()/getAssets() call below re-reads fresh data on re-render —
  // the dashboard updates immediately without a page reload.
  const [, setDataVersion] = useState(0);

  useEffect(() => onDataChanged(() => setDataVersion((v) => v + 1)), []);

  const selectedBuilding = getBuilding(selectedBuildingId);
  const buildingFloors = getFloorsForBuilding(selectedBuildingId);
  const buildingSections = getSectionsForBuilding(selectedBuildingId);
  const outstanding = getOutstandingSections(buildingSections);
  const returnNeeded = outstanding.filter((s) => s.status === 'return_needed');
  const noAccess = outstanding.filter((s) => s.status === 'no_access');

  const handleSelectBuilding = (id) => setSelectedBuildingId(id);

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <p className="header-eyebrow">{project.acronym}</p>
          <h1>Quality Control Operations Dashboard</h1>
          <p className="header-sub">{project.tagline} — {project.facility}</p>
          <p className="header-sub">{project.description}</p>
          <p className="header-sub">{project.phase} {project.version}</p>
        </div>
        <div className="status-legend">
          {Object.entries(statuses).map(([key, val]) => (
            <span key={key} className="legend-item">
              <StatusDot color={val.color} /> {val.label}
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

      {tab !== 'overview' && tab !== 'buildings' && tab !== 'imports' && tab !== 'reports' && (
        <BuildingSelector selectedId={selectedBuildingId} onChange={handleSelectBuilding} />
      )}

      <main>
        {tab === 'overview' && (
          <>
            <StatCards />
            <ProjectInfo />
            <DataStatus />
          </>
        )}

        {tab === 'buildings' && (
          <BuildingCards buildings={buildings} onSelect={handleSelectBuilding} />
        )}

        {tab === 'floors' && (
          <FloorProgress floors={buildingFloors} buildingConfigured={!!selectedBuilding?.configured} />
        )}

        {tab === 'sections' && (
          selectedBuilding?.configured ? (
            <SectionTable sections={buildingSections} title={`Sections — Building ${selectedBuildingId}`} />
          ) : (
            <section className="panel">
              <h2>Sections</h2>
              <p className="empty-note">No detailed floor or section data has been configured for this building.</p>
            </section>
          )
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

        {tab === 'imports' && <ImportCenter />}

        {tab === 'reports' && <ReportCenter />}
      </main>

      <footer className="footer">
        QCOD is an internal operations tool designed to complement RFID asset inventory systems by
        providing campus, building, floor, section, and quality-control visibility.
      </footer>
    </div>
  );
}
