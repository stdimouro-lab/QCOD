import { describe, it, expect } from 'vitest';
import { pct } from '../data.js';

describe('pct()', () => {
  it('returns null when total is 0', () => {
    expect(pct(5, 0)).toBeNull();
  });

  it('returns null when total is missing/undefined', () => {
    expect(pct(5, undefined)).toBeNull();
    expect(pct(5, null)).toBeNull();
  });

  it('returns null when total is negative', () => {
    expect(pct(5, -1)).toBeNull();
  });

  it('returns the correct rounded percentage', () => {
    expect(pct(1, 3)).toBe(33); // 33.33... rounds to 33
    expect(pct(2, 3)).toBe(67); // 66.66... rounds to 67
    expect(pct(50, 200)).toBe(25);
    expect(pct(0, 10)).toBe(0);
  });

  it('never returns NaN or Infinity', () => {
    expect(pct(5, 0)).not.toBe(Infinity);
    expect(Number.isNaN(pct(5, 0))).toBe(false);
  });
});
