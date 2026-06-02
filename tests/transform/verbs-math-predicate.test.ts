/**
 * Unit tests for the math, predicate-aggregation, canonical, and dated-cashflow verbs:
 * numeric:   gcd, lcm, factorial
 * array:     countIf, sumIf, avgIf
 * encoding:  stableStringify, canonicalHash
 * financial: xnpv, xirr
 */
import { describe, it, expect } from 'vitest';
import { callVerb, callVerbString, callVerbNumber, str, int, num, arr, obj, nil } from './helpers.js';

describe('numeric: gcd / lcm / factorial', () => {
  it('gcd of two integers', () => {
    expect(callVerbNumber('gcd', [int(12), int(18)])).toBe(6);
    expect(callVerbNumber('gcd', [int(0), int(5)])).toBe(5);
    expect(callVerbNumber('gcd', [int(-12), int(8)])).toBe(4);
  });
  it('lcm of two integers', () => {
    expect(callVerbNumber('lcm', [int(4), int(6)])).toBe(12);
    expect(callVerbNumber('lcm', [int(0), int(5)])).toBe(0);
  });
  it('factorial within the safe range', () => {
    expect(callVerbNumber('factorial', [int(0)])).toBe(1);
    expect(callVerbNumber('factorial', [int(5)])).toBe(120);
    expect(callVerbNumber('factorial', [int(18)])).toBe(6402373705728000);
  });
  it('factorial rejects negatives and overflow', () => {
    expect(callVerb('factorial', [int(-1)]).type).toBe('null');
    expect(callVerb('factorial', [int(19)]).type).toBe('null');
  });
});

describe('array: countIf / sumIf / avgIf', () => {
  const rows = arr([
    obj({ region: 'east', amount: 100 }),
    obj({ region: 'west', amount: 200 }),
    obj({ region: 'east', amount: 300 }),
  ]);
  it('countIf counts matching items', () => {
    expect(callVerbNumber('countIf', [rows, str('region'), str('='), str('east')])).toBe(2);
    expect(callVerbNumber('countIf', [rows, str('amount'), str('>'), int(150)])).toBe(2);
  });
  it('sumIf sums the predicate field by default', () => {
    expect(callVerbNumber('sumIf', [rows, str('amount'), str('>'), int(150)])).toBe(500);
  });
  it('sumIf sums an explicit field over matching items', () => {
    expect(callVerbNumber('sumIf', [rows, str('region'), str('='), str('east'), str('amount')])).toBe(400);
  });
  it('avgIf averages matching items', () => {
    expect(callVerbNumber('avgIf', [rows, str('region'), str('='), str('east'), str('amount')])).toBe(200);
  });
  it('avgIf returns null when nothing matches', () => {
    expect(callVerb('avgIf', [rows, str('region'), str('='), str('north'), str('amount')]).type).toBe('null');
  });
});

describe('encoding: stableStringify / canonicalHash', () => {
  it('stableStringify sorts object keys recursively', () => {
    const o = obj({ b: 1, a: obj({ y: 2, x: 1 }) });
    expect(callVerbString('stableStringify', [o])).toBe('{"a":{"x":1,"y":2},"b":1}');
  });
  it('canonicalHash is a 64-char hex digest', () => {
    expect(callVerbString('canonicalHash', [obj({ a: 1 })])).toMatch(/^[0-9a-f]{64}$/);
  });
  it('canonicalHash is independent of source key order', () => {
    const h1 = callVerbString('canonicalHash', [obj({ a: 1, b: 2 })]);
    const h2 = callVerbString('canonicalHash', [obj({ b: 2, a: 1 })]);
    expect(h1).toBe(h2);
  });
});

describe('financial: xnpv / xirr', () => {
  const amounts = arr([num(-1000), num(110), num(110), num(110), num(1100)]);
  const dates = arr([
    str('2020-01-01'), str('2021-01-01'), str('2022-01-01'), str('2023-01-01'), str('2024-01-01'),
  ]);
  it('xnpv at rate 0 equals the undiscounted sum', () => {
    expect(callVerbNumber('xnpv', [num(0), amounts, dates])).toBeCloseTo(430, 6);
  });
  it('xirr drives xnpv to zero', () => {
    const rate = callVerbNumber('xirr', [amounts, dates]);
    const residual = callVerbNumber('xnpv', [num(rate), amounts, dates]);
    expect(Math.abs(residual)).toBeLessThan(1e-4);
  });
  it('xnpv returns null on mismatched array lengths', () => {
    expect(callVerb('xnpv', [num(0.1), amounts, arr([str('2020-01-01')])]).type).toBe('null');
  });
});
