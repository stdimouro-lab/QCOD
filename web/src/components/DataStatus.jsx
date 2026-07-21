import {
  getImportStatus, getValidAssets, getMappedAssets, getUnmappedAssets,
  getQcRecords, getResearchRecords, getFacilities, getBuildings, getFloors,
  getSections, getRooms, getConfiguredBuildings, getHierarchyCompleteness,
  getOutstandingSections, getMasterAssetListImportStatus,
} from '../lib/data';

function fmtTimestamp(value) {
  if (!value) return 'Not Imported';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export default function DataStatus() {
  const importStatus = getImportStatus();
  const masterStatus = getMasterAssetListImportStatus();
  const validAssets = getValidAssets();
  const mapped = getMappedAssets();
  const unmapped = getUnmappedAssets();
  const hierarchy = getHierarchyCompleteness();
  const openQc = getQcRecords().filter((r) => r.status !== 'closed').length;
  const openResearch = getResearchRecords().filter((r) => r.status === 'open' || r.status === 'in_review' || r.status === 'reopened' || r.status === 'waiting_for_information').length;

  const rows = [
    ['Facilities Configured', getFacilities().length],
    ['Buildings Configured', getConfiguredBuildings().length],
    ['Floors Configured', getFloors().length],
    ['Sections Configured', getSections().length],
    ['Rooms Configured', getRooms().length],
    ['Rooms with Verified Parents', hierarchy.roomsWithValidParents],
    ['Rooms Pending Section Configuration', hierarchy.roomsPendingSection],
    ['Hierarchy Errors', hierarchy.hierarchyErrors],
    ['Master Asset Records', masterStatus.count || 0],
    ['Current AssetWorx/ENEX Records', validAssets.length],
    ['Assets with Building Reference', mapped.length],
    ['Assets Missing Building Reference', unmapped.length],
    ['Open QC Records', openQc],
    ['Open Research Records', openResearch],
    ['Outstanding Sections', getOutstandingSections().length],
    ['Last Master Asset Import', fmtTimestamp(masterStatus.lastImportedAt)],
    ['Last AssetWorx/ENEX Import', fmtTimestamp(importStatus.lastAssetImport)],
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
