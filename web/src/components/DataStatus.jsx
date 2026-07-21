import {
  getImportStatus, getValidAssets, getMappedAssets, getUnmappedAssets,
  getQcRecords, getResearchRecords, getFacilities, getBuildings, getFloors,
  getSections, getRooms, getConfiguredBuildings, getHierarchyCompleteness,
} from '../lib/data';

function fmtTimestamp(value) {
  if (!value) return 'Not Imported';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export default function DataStatus() {
  const importStatus = getImportStatus();
  const validAssets = getValidAssets();
  const mapped = getMappedAssets();
  const unmapped = getUnmappedAssets();
  const hierarchy = getHierarchyCompleteness();

  const rows = [
    ['Facilities Configured', getFacilities().length],
    ['Buildings Configured', getConfiguredBuildings().length],
    ['Floors Configured', getFloors().length],
    ['Sections Configured', getSections().length],
    ['Rooms Configured', getRooms().length],
    ['Rooms with Verified Parents', hierarchy.roomsWithValidParents],
    ['Rooms Pending Section Configuration', hierarchy.roomsPendingSection],
    ['Hierarchy Errors', hierarchy.hierarchyErrors],
    ['Assets Imported', validAssets.length],
    ['Mapped Assets', mapped.length],
    ['Unmapped Assets', unmapped.length],
    ['QC Records', getQcRecords().length],
    ['Research Records', getResearchRecords().length],
    ['Last Asset Import', fmtTimestamp(importStatus.lastAssetImport)],
    ['Last Section Import', fmtTimestamp(importStatus.lastSectionImport)],
    ['Last Configuration Import', fmtTimestamp(importStatus.lastConfigImport)],
    ['Last Backup Export', fmtTimestamp(importStatus.lastBackupExport)],
  ];

  return (
    <section className="panel">
      <h2>Data Status</h2>
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
