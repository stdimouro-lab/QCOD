import { importStatus, getValidAssets, getMappedAssets, getUnmappedAssets } from '../lib/data';

function fmtTimestamp(value) {
  if (!value) return 'Not Imported';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export default function DataStatus() {
  const validAssets = getValidAssets();
  const mapped = getMappedAssets();
  const unmapped = getUnmappedAssets();

  const rows = [
    ['Assets Imported', validAssets.length],
    ['Assets Mapped to Building', mapped.length],
    ['Assets Unmapped', unmapped.length],
    ['Sections Updated', importStatus.sectionsUpdated || 0],
    ['Last Asset Import', fmtTimestamp(importStatus.lastAssetImport)],
    ['Last Section Update', fmtTimestamp(importStatus.lastSectionImport)],
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
