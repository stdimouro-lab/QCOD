import { describe, it, expect } from 'vitest';
import { getQcStatus, isOpenQcStatus, getResearchStatus, isOpenResearchStatus, normalizeStatusKey } from '../recordStatus.js';
import { toDateKey, isWithinDateRange } from '../dateUtils.js';

describe('QC status normalization — reads both record shapes', () => {
  it('reads status from a manually-imported CSV row (capitalized header)', () => {
    expect(getQcStatus({ 'QC Status': 'Passed' })).toBe('Passed');
  });

  it('reads status from an automatically-generated record (lowercase field)', () => {
    expect(getQcStatus({ status: 'pending' })).toBe('pending');
  });

  it('prefers the CSV-style field when both are present, since that is the more explicit source', () => {
    expect(getQcStatus({ 'QC Status': 'Failed', status: 'pending' })).toBe('Failed');
  });

  it('returns an empty string when neither field is present, never undefined/crash', () => {
    expect(getQcStatus({})).toBe('');
  });
});

describe('isOpenQcStatus()', () => {
  it('treats pending/selected/failed/needs_correction/recheck_required as open', () => {
    ['pending', 'selected', 'failed', 'needs_correction', 'recheck_required'].forEach((s) => {
      expect(isOpenQcStatus({ status: s })).toBe(true);
    });
  });

  it('treats passed/closed as not open', () => {
    expect(isOpenQcStatus({ status: 'passed' })).toBe(false);
    expect(isOpenQcStatus({ status: 'closed' })).toBe(false);
  });

  it('normalizes a friendly CSV-imported label like "Needs Correction"', () => {
    expect(isOpenQcStatus({ 'QC Status': 'Needs Correction' })).toBe(true);
    expect(isOpenQcStatus({ 'QC Status': 'Passed' })).toBe(false);
  });

  it('treats a record with no status at all as not open (nothing to act on)', () => {
    expect(isOpenQcStatus({})).toBe(false);
  });
});

describe('Research status normalization — reads both record shapes', () => {
  it('reads status from a manually-imported CSV row', () => {
    expect(getResearchStatus({ 'Status': 'Open' })).toBe('Open');
  });

  it('reads status from an automatically-generated record', () => {
    expect(getResearchStatus({ status: 'open' })).toBe('open');
  });
});

describe('isOpenResearchStatus()', () => {
  it('treats open/in_review/waiting_for_information/reopened as open', () => {
    ['open', 'in_review', 'waiting_for_information', 'reopened'].forEach((s) => {
      expect(isOpenResearchStatus({ status: s })).toBe(true);
    });
  });

  it('treats resolved/closed as not open', () => {
    expect(isOpenResearchStatus({ status: 'resolved' })).toBe(false);
    expect(isOpenResearchStatus({ status: 'closed' })).toBe(false);
  });
});

describe('normalizeStatusKey()', () => {
  it('lowercases and converts spaces/dashes to underscores', () => {
    expect(normalizeStatusKey('Needs Correction')).toBe('needs_correction');
    expect(normalizeStatusKey('Waiting-For-Information')).toBe('waiting_for_information');
  });
});

describe('toDateKey() — safe date normalization', () => {
  it('parses ISO date and ISO timestamp without shifting the day', () => {
    expect(toDateKey('2026-07-09')).toBe('2026-07-09');
    expect(toDateKey('2026-07-09T00:00:00Z')).toBe('2026-07-09');
  });

  it('parses US-style M/D/YYYY and MM/DD/YYYY', () => {
    expect(toDateKey('7/9/2026')).toBe('2026-07-09');
    expect(toDateKey('07/09/2026')).toBe('2026-07-09');
  });

  it('parses a timestamp with an explicit timezone offset', () => {
    expect(toDateKey('7/10/2026 3:39:35 PM -04:00')).toBe('2026-07-10');
  });

  it('returns null for an unparseable value rather than throwing', () => {
    expect(toDateKey('not a date')).toBeNull();
    expect(toDateKey('')).toBeNull();
    expect(toDateKey(null)).toBeNull();
  });
});

describe('isWithinDateRange() — inclusive start/end, safe on invalid dates', () => {
  it('is inclusive of both the start and end date', () => {
    expect(isWithinDateRange('2026-07-01', '2026-07-01', '2026-07-31')).toBe(true);
    expect(isWithinDateRange('2026-07-31', '2026-07-01', '2026-07-31')).toBe(true);
  });

  it('excludes a date before start or after end', () => {
    expect(isWithinDateRange('2026-06-30', '2026-07-01', '2026-07-31')).toBe(false);
    expect(isWithinDateRange('2026-08-01', '2026-07-01', '2026-07-31')).toBe(false);
  });

  it('an invalid date is excluded once a filter is active, but never crashes', () => {
    expect(() => isWithinDateRange('garbage', '2026-07-01', '')).not.toThrow();
    expect(isWithinDateRange('garbage', '2026-07-01', '')).toBe(false);
  });

  it('a record with no date filter applied is always included, even with an invalid date', () => {
    expect(isWithinDateRange('garbage', '', '')).toBe(true);
    expect(isWithinDateRange('', '', '')).toBe(true);
  });
});
