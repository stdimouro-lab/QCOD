/**
 * Safe date normalization for filtering QC/Research/report records whose
 * date values may arrive as YYYY-MM-DD, M/D/YYYY, MM/DD/YYYY, an ISO
 * timestamp, or a timestamp with a timezone offset. Never throws on a
 * malformed value — an unparseable date is simply excluded from a date
 * filter (not crashed on), and stays visible when no filter is applied.
 */

// Converts a date-like value to a "YYYY-MM-DD" sort/comparison key without
// letting timezone conversion shift a date-only value to the previous or
// next day. If the input already looks like YYYY-MM-DD, it's used as-is
// (never re-parsed through the Date constructor, which is what causes the
// timezone shift in the first place).
export function toDateKey(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // Already ISO date or ISO timestamp — take the date portion directly.
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // US-style M/D/YYYY or MM/DD/YYYY, optionally followed by a time.
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Fall back to the Date constructor for anything else (e.g. a full
  // timestamp with a named timezone) — only for values that didn't match
  // a plain date pattern above, since Date() would otherwise reinterpret
  // a bare "2026-07-09" in the local timezone and can shift the day.
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Inclusive start/end date-range check. A record with no parseable date is
// only excluded when an active filter would otherwise require comparing
// against it — with no filter applied, everything stays visible.
export function isWithinDateRange(rawValue, startDate, endDate) {
  if (!startDate && !endDate) return true;
  const key = toDateKey(rawValue);
  if (!key) return false; // can't be within a range we can't compare it to
  if (startDate && key < startDate) return false;
  if (endDate && key > endDate) return false;
  return true;
}
