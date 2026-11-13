import { describe, expect, it } from 'bun:test';
import { passAtK, passHatK, wilson } from './src/metrics';

describe('pass@k and pass^k', () => {
  it('agree with pass@1 when k is 1', () => {
    expect(passAtK(5, 3, 1)).toBeCloseTo(0.6);
    expect(passHatK(5, 3, 1)).toBeCloseTo(0.6);
  });

  it('are 1 or 0 when every run passed or none did', () => {
    expect(passAtK(3, 3, 3)).toBe(1);
    expect(passHatK(3, 3, 3)).toBe(1);
    expect(passAtK(3, 0, 3)).toBe(0);
    expect(passHatK(3, 0, 3)).toBe(0);
  });

  it('pass@k rises and pass^k falls as k grows', () => {
    // 2 of 3 runs passed.
    expect(passAtK(3, 2, 2)).toBe(1);
    expect(passHatK(3, 2, 2)).toBeCloseTo(1 / 3);
    expect(passHatK(3, 2, 3)).toBe(0);
  });

  it('match the closed forms for n=10, c=7, k=3', () => {
    // 1 - C(3,3)/C(10,3) and C(7,3)/C(10,3).
    expect(passAtK(10, 7, 3)).toBeCloseTo(1 - 1 / 120);
    expect(passHatK(10, 7, 3)).toBeCloseTo(35 / 120);
  });

  it('refuse counts that cannot happen', () => {
    expect(() => passAtK(3, 4, 1)).toThrow();
    expect(() => passHatK(3, 1, 4)).toThrow();
    expect(() => passHatK(3, 1, 0)).toThrow();
  });
});

describe('wilson', () => {
  it('brackets the observed rate', () => {
    const interval = wilson(2, 3);
    expect(interval.low).toBeLessThan(2 / 3);
    expect(interval.high).toBeGreaterThan(2 / 3);
  });

  it('stays inside [0, 1] at the edges', () => {
    expect(wilson(0, 3).low).toBe(0);
    expect(wilson(3, 3).high).toBe(1);
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 });
  });
});
