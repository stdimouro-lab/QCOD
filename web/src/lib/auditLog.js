/**
 * Centralized audit log. Append-only — never overwrite prior entries.
 * Pure functions here build entries; data.js wires them to localStorage.
 */

export function buildAuditEntry({ action, entityType, entityId, previousValue, newValue, source = 'user', notes = '' }) {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action,
    entityType,
    entityId,
    previousValue: previousValue ?? null,
    newValue: newValue ?? null,
    source,
    notes,
  };
}

export function appendAuditEntries(currentLog, entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  return [...currentLog, ...list];
}

export function filterAuditLog(log, { action, entityType, startDate, endDate, search } = {}) {
  let result = log;
  if (action) result = result.filter((e) => e.action === action);
  if (entityType) result = result.filter((e) => e.entityType === entityType);
  if (startDate) result = result.filter((e) => e.timestamp >= startDate);
  if (endDate) result = result.filter((e) => e.timestamp <= endDate + 'T23:59:59');
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((e) =>
      (e.entityId ?? '').toLowerCase().includes(q) ||
      (e.notes ?? '').toLowerCase().includes(q) ||
      (e.action ?? '').toLowerCase().includes(q)
    );
  }
  return result;
}
