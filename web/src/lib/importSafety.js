/**
 * Import transaction safety: pre-import backups and undo. Pure functions —
 * data.js wires these to localStorage. Only a bounded number of pre-import
 * backups are kept (oldest dropped first) so localStorage doesn't grow
 * unbounded across many imports.
 */

const MAX_STORED_BACKUPS = 10;

export function generateImportId() {
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Snapshots exactly the datasets an import can modify, so undo can restore
// them precisely without touching anything an import didn't change.
export function createPreImportSnapshot(importId, datasets) {
  return {
    importId,
    createdAt: new Date().toISOString(),
    datasets, // { assets, qcRecords, researchRecords, sections, ... } — caller decides which
  };
}

export function addBackup(currentBackups, snapshot) {
  const updated = [...currentBackups, snapshot];
  return updated.length > MAX_STORED_BACKUPS ? updated.slice(updated.length - MAX_STORED_BACKUPS) : updated;
}

export function findBackup(backups, importId) {
  return backups.find((b) => b.importId === importId) || null;
}

// Returns the datasets to restore, or null if no backup exists for that
// import (e.g. it aged out, or the import ID is unknown/already undone).
export function resolveUndo(backups, importId) {
  const snapshot = findBackup(backups, importId);
  if (!snapshot) return null;
  return snapshot.datasets;
}

// Removes a backup after a successful undo, so the same import can't be
// undone twice against a state that no longer matches it.
export function removeBackup(backups, importId) {
  return backups.filter((b) => b.importId !== importId);
}
