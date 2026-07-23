/**
 * QC and Research records can come from two different sources that share
 * the same localStorage key but use different field shapes:
 *
 *  - Manually imported "Daily QC Log" / "Research Items" CSV rows use the
 *    raw column headers verbatim, e.g. record['QC Status'], record['Date'].
 *  - Automatically generated records (from enexImport.js's
 *    generateQcRecords/generateResearchRecords) use camelCase fields,
 *    e.g. record.status, record.createdAt, record.facilityId.
 *
 * Every accessor here checks both shapes so the UI displays either kind of
 * record correctly, rather than silently showing blanks for one of them.
 */

export function normalizeStatusKey(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

// ---- QC ----

export function getQcStatus(record) {
  return String(record?.['QC Status'] ?? record?.status ?? '').trim();
}

const OPEN_QC_STATUS_KEYS = new Set(['pending', 'selected', 'failed', 'needs_correction', 'recheck_required']);
const CLOSED_QC_STATUS_KEYS = new Set(['passed', 'closed', 'complete', 'completed']);

// An unrecognized non-blank status is treated as still open (something a
// human should look at), never silently excluded from "open" counts.
export function isOpenQcStatus(record) {
  const key = normalizeStatusKey(getQcStatus(record));
  if (!key) return false; // no status at all — nothing to count as open
  if (CLOSED_QC_STATUS_KEYS.has(key)) return false;
  return true;
}

export function getQcDate(record) {
  return record?.['Date'] || record?.createdAt || '';
}

export function getQcFacility(record) {
  return record?.['Facility'] || record?.facilityId || '';
}

export function getQcBuilding(record) {
  return record?.['Building'] || record?.buildingId || '';
}

// ---- Research ----

export function getResearchStatus(record) {
  return String(record?.['Status'] ?? record?.status ?? '').trim();
}

const CLOSED_RESEARCH_STATUS_KEYS = new Set(['resolved', 'closed', 'complete', 'completed']);

export function isOpenResearchStatus(record) {
  const key = normalizeStatusKey(getResearchStatus(record));
  if (!key) return false;
  if (CLOSED_RESEARCH_STATUS_KEYS.has(key)) return false;
  return true;
}

export function getResearchDate(record) {
  return record?.['Date Found'] || record?.createdAt || '';
}

export function getResearchFacility(record) {
  return record?.['Facility'] || record?.facilityId || '';
}

export function getResearchBuilding(record) {
  return record?.['Building'] || record?.buildingId || '';
}
