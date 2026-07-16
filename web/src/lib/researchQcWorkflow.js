/**
 * Research and QC work-queue behavior: status transitions, bulk updates,
 * and the failed-QC -> Research handoff. Pure functions — callers append
 * the returned history entries to the immutable history logs themselves.
 */

export const RESEARCH_STATUSES = ['open', 'in_review', 'waiting_for_information', 'resolved', 'closed', 'reopened'];
export const QC_STATUSES = ['pending', 'selected', 'passed', 'failed', 'needs_correction', 'recheck_required', 'closed'];
export const PRIORITIES = ['low', 'normal', 'high', 'critical'];

function historyEntry({ entityType, entityId, field, previousValue, newValue, source = 'manual' }) {
  return {
    id: `hist-${entityType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    entityType, entityId, field, previousValue, newValue,
    changedAt: new Date().toISOString(), source,
  };
}

// ---- Research ----

export function updateResearchStatus(records, recordIds, newStatus, extra = {}) {
  if (!RESEARCH_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid Research status "${newStatus}"`);
  }
  const historyEntries = [];
  const updated = records.map((r) => {
    if (!recordIds.includes(r.id)) return r;
    historyEntries.push(historyEntry({ entityType: 'research', entityId: r.id, field: 'status', previousValue: r.status, newValue: newStatus }));
    const patch = { ...extra, status: newStatus, lastUpdated: new Date().toISOString() };
    if (newStatus === 'resolved' || newStatus === 'closed') patch.resolvedAt = patch.resolvedAt || new Date().toISOString();
    return { ...r, ...patch };
  });
  return { records: updated, historyEntries, updatedCount: historyEntries.length };
}

export function bulkAssignResearch(records, recordIds, assignedTo) {
  const historyEntries = [];
  const updated = records.map((r) => {
    if (!recordIds.includes(r.id)) return r;
    historyEntries.push(historyEntry({ entityType: 'research', entityId: r.id, field: 'assignedTo', previousValue: r.assignedTo || '', newValue: assignedTo }));
    return { ...r, assignedTo, lastUpdated: new Date().toISOString() };
  });
  return { records: updated, historyEntries, updatedCount: historyEntries.length };
}

// ---- QC ----

export function updateQcStatus(records, recordIds, newStatus, extra = {}) {
  if (!QC_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid QC status "${newStatus}"`);
  }
  const historyEntries = [];
  const updated = records.map((r) => {
    if (!recordIds.includes(r.id)) return r;
    historyEntries.push(historyEntry({ entityType: 'qc', entityId: r.id, field: 'status', previousValue: r.status, newValue: newStatus }));
    const patch = { ...extra, status: newStatus };
    if (newStatus === 'passed' || newStatus === 'failed') patch.reviewedDate = patch.reviewedDate || new Date().toISOString();
    if (newStatus === 'closed') patch.completedAt = patch.completedAt || new Date().toISOString();
    return { ...r, ...patch };
  });
  return { records: updated, historyEntries, updatedCount: historyEntries.length };
}

export function bulkUpdateQc(records, recordIds, patch) {
  const historyEntries = [];
  const updated = records.map((r) => {
    if (!recordIds.includes(r.id)) return r;
    Object.entries(patch).forEach(([field, newValue]) => {
      historyEntries.push(historyEntry({ entityType: 'qc', entityId: r.id, field, previousValue: r[field] ?? '', newValue }));
    });
    return { ...r, ...patch };
  });
  return { records: updated, historyEntries, updatedCount: historyEntries.length };
}

// A failed QC record becomes a Research record — never silently, always as
// an explicit, visible new record the reviewer can see and act on.
export function qcFailureToResearchDraft(qcRecord) {
  return {
    id: `research-${qcRecord.assetNumber}-qc_failure-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    source: 'qc_failure',
    importId: qcRecord.importId || '',
    sourceImportId: qcRecord.sourceImportId || qcRecord.importId || '',
    facilityId: qcRecord.facilityId || '',
    buildingId: qcRecord.buildingId || '',
    floorId: qcRecord.floorId || '',
    sectionId: qcRecord.sectionId || '',
    roomId: qcRecord.roomId || '',
    assetNumber: qcRecord.assetNumber,
    serialNumber: qcRecord.serialNumber || '',
    rawLocation: '',
    description: '',
    issueType: 'qc_failure',
    status: 'open',
    priority: 'normal',
    assignedTo: '',
    resolution: '',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    resolvedAt: '',
    resolutionNotes: '',
    notes: qcRecord.failureReason || 'Failed QC — sent to Research',
  };
}

export function sendFailedQcToResearch(qcRecords, researchRecords, qcRecordIds) {
  const newResearchRecords = [];
  qcRecordIds.forEach((id) => {
    const qc = qcRecords.find((r) => r.id === id);
    if (!qc) return;
    // Don't duplicate an active Research record already covering this exact QC failure.
    const alreadyExists = researchRecords.some((r) => r.assetNumber === qc.assetNumber && r.issueType === 'qc_failure' && (r.status === 'open' || r.status === 'in_review' || r.status === 'reopened'));
    if (alreadyExists) return;
    newResearchRecords.push(qcFailureToResearchDraft(qc));
  });
  return { records: [...researchRecords, ...newResearchRecords], createdCount: newResearchRecords.length };
}
