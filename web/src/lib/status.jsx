import { statuses } from './data';

export function getStatusMeta(key) {
  return statuses[key] ?? { label: key, symbol: '⚪', color: '#94a3b8' };
}

export function StatusBadge({ status }) {
  const meta = getStatusMeta(status);
  return (
    <span className="status-badge" style={{ '--status-color': meta.color }}>
      <span className="status-symbol">{meta.symbol}</span>
      {meta.label}
    </span>
  );
}

export function ProgressBar({ value, label }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="progress-bar-wrap">
      {label && <div className="progress-label"><span>{label}</span><span>{clamped}%</span></div>}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
