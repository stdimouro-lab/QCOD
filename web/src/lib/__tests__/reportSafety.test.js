import { describe, it, expect } from 'vitest';
import { assessReportSize, sanitizeFilename } from '../exportPdf.js';

describe('Large report safety behavior', () => {
  it('does not flag a normal-sized report as needing truncation', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const columns = [{ header: 'ID', key: 'id' }];
    const result = assessReportSize(rows, columns);
    expect(result.truncated).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('flags a very large report and recommends Excel instead of silently trying to render everything', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i }));
    const columns = [{ header: 'ID', key: 'id' }];
    const result = assessReportSize(rows, columns);
    expect(result.truncated).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/Export Excel/);
    expect(result.safeRowLimit).toBeLessThan(rows.length);
  });

  it('flags an excessively wide table', () => {
    const rows = [{ a: 1 }];
    const columns = Array.from({ length: 20 }, (_, i) => ({ header: `Col${i}`, key: `c${i}` }));
    const result = assessReportSize(rows, columns);
    expect(result.warnings.join(' ')).toMatch(/columns/);
  });

  it('sanitizes filenames so invalid filesystem characters never reach disk', () => {
    expect(sanitizeFilename('Report: Q1/Q2 "Summary"')).not.toMatch(/[\\/:*?"<>|]/);
    expect(sanitizeFilename('Normal Report Name')).toBe('Normal_Report_Name');
  });
});
