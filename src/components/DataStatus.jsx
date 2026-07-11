import {
  getImportStatus, getValidAssets, getMappedAssets, getUnmappedAssets,
  getQcPreview, getResearchPreview,
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

  const rows = [
    ['Assets Imported', validAssets.length],
    ['Mapped Assets', mapped.length],
    ['Unmapped Assets', unmapped.length],
    ['QC Rows Previewed', getQcPreview().length],
    ['Research Rows Previewed', getResearchPreview().length],
    ['Last Asset Import', fmtTimestamp(importStatus.lastAssetImport)],
    ['Last Section Import', fmtTimestamp(importStatus.lastSectionImport)],
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
