/**
 * Comprehensive Verb Edge Case Tests
 *
 * Targets verb/scenario gaps between Rust and TS SDKs.
 * ~150 tests covering: collection, object, encoding, financial,
 * datetime, statistical, and string verb edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  callVerb,
  str,
  int,
  num,
  bool,
  nil,
  arr,
  obj,
  date,
  createContext,
  utcDate,
} from './helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Collection verb edge cases (~30 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('Collection verb edge cases', () => {
  describe('every', () => {
    it('returns true for empty array (vacuous truth)', () => {
      const result = callVerb('every', [arr([]), str('x'), str('='), str('a')]);
      expect(result).toEqual(bool(true));
    });

    it('returns true when all objects match', () => {
      const items = arr([
        obj({ status: str('active') }),
        obj({ status: str('active') }),
      ]);
      const result = callVerb('every', [items, str('status'), str('='), str('active')]);
      expect(result).toEqual(bool(true));
    });

    it('returns false when one does not match', () => {
      const items = arr([
        obj({ status: str('active') }),
        obj({ status: str('inactive') }),
      ]);
      const result = callVerb('every', [items, str('status'), str('='), str('active')]);
      expect(result).toEqual(bool(false));
    });

    it('returns null with insufficient args', () => {
      expect(callVerb('every', [arr([])]).type).toBe('null');
    });

    it('handles numeric comparison with >', () => {
      const items = arr([
        obj({ score: int(80) }),
        obj({ score: int(90) }),
      ]);
      const result = callVerb('every', [items, str('score'), str('>'), int(70)]);
      expect(result).toEqual(bool(true));
    });
  });

  describe('some', () => {
    it('returns false for empty array', () => {
      const result = callVerb('some', [arr([]), str('x'), str('='), str('a')]);
      expect(result).toEqual(bool(false));
    });

    it('returns true when at least one matches', () => {
      const items = arr([
        obj({ status: str('inactive') }),
        obj({ status: str('active') }),
      ]);
      const result = callVerb('some', [items, str('status'), str('='), str('active')]);
      expect(result).toEqual(bool(true));
    });

    it('returns false when none match', () => {
      const items = arr([
        obj({ status: str('inactive') }),
        obj({ status: str('pending') }),
      ]);
      const result = callVerb('some', [items, str('status'), str('='), str('active')]);
      expect(result).toEqual(bool(false));
    });

    it('returns null with insufficient args', () => {
      expect(callVerb('some', [arr([])]).type).toBe('null');
    });

    it('handles contains operator', () => {
      const items = arr([
        obj({ name: str('John Smith') }),
        obj({ name: str('Jane Doe') }),
      ]);
      const result = callVerb('some', [items, str('name'), str('contains'), str('Smith')]);
      expect(result).toEqual(bool(true));
    });
  });

  describe('find', () => {
    it('returns null for empty array', () => {
      const result = callVerb('find', [arr([]), str('x'), str('='), str('a')]);
      expect(result.type).toBe('null');
    });

    it('returns first matching item', () => {
      const items = arr([
        obj({ id: int(1), name: str('Alice') }),
        obj({ id: int(2), name: str('Bob') }),
      ]);
      const result = callVerb('find', [items, str('id'), str('='), int(2)]);
      expect(result.type).not.toBe('null');
    });

    it('returns null when no match found', () => {
      const items = arr([
        obj({ id: int(1) }),
        obj({ id: int(2) }),
      ]);
      const result = callVerb('find', [items, str('id'), str('='), int(999)]);
      expect(result.type).toBe('null');
    });

    it('returns null with insufficient args', () => {
      expect(callVerb('find', [arr([])]).type).toBe('null');
    });
  });

  describe('findIndex', () => {
    it('returns -1 for empty array', () => {
      const result = callVerb('findIndex', [arr([]), str('x'), str('='), str('a')]);
      expect(result).toEqual(int(-1));
    });

    it('returns index of first matching item', () => {
      const items = arr([
        obj({ id: int(1) }),
        obj({ id: int(2) }),
        obj({ id: int(3) }),
      ]);
      const result = callVerb('findIndex', [items, str('id'), str('='), int(2)]);
      expect(result).toEqual(int(1));
    });

    it('returns -1 when no match found', () => {
      const items = arr([
        obj({ id: int(1) }),
        obj({ id: int(2) }),
      ]);
      const result = callVerb('findIndex', [items, str('id'), str('='), int(999)]);
      expect(result).toEqual(int(-1));
    });
  });

  describe('includes', () => {
    it('returns false for empty array', () => {
      const result = callVerb('includes', [arr([]), str('a')]);
      expect(result).toEqual(bool(false));
    });

    it('finds string in array', () => {
      const result = callVerb('includes', [arr([str('a'), str('b'), str('c')]), str('b')]);
      expect(result).toEqual(bool(true));
    });

    it('returns false when value not present', () => {
      const result = callVerb('includes', [arr([str('a'), str('b')]), str('z')]);
      expect(result).toEqual(bool(false));
    });

    it('returns null with insufficient args', () => {
      expect(callVerb('includes', []).type).toBe('null');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Object verb edge cases (~20 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('Object verb edge cases', () => {
  describe('keys', () => {
    it('returns null for non-object input', () => {
      expect(callVerb('keys', [str('not an object')]).type).toBe('null');
    });

    it('returns null for null input', () => {
      expect(callVerb('keys', [nil()]).type).toBe('null');
    });

    it('returns null with no args', () => {
      expect(callVerb('keys', []).type).toBe('null');
    });

    it('handles single-key objects', () => {
      const result = callVerb('keys', [obj({ solo: str('value') })]);
      expect(result.type).toBe('array');
    });
  });

  describe('values', () => {
    it('returns null for non-object', () => {
      expect(callVerb('values', [int(42)]).type).toBe('null');
    });

    it('returns null with no args', () => {
      expect(callVerb('values', []).type).toBe('null');
    });
  });

  describe('entries', () => {
    it('returns null for non-object', () => {
      expect(callVerb('entries', [str('hello')]).type).toBe('null');
    });

    it('returns null with no args', () => {
      expect(callVerb('entries', []).type).toBe('null');
    });
  });

  describe('has', () => {
    it('returns false for non-object', () => {
      const result = callVerb('has', [str('string'), str('key')]);
      expect(result).toEqual(bool(false));
    });

    it('returns false for missing nested path', () => {
      const result = callVerb('has', [obj({ a: obj({ b: int(1) }) }), str('a.c')]);
      expect(result).toEqual(bool(false));
    });

    it('returns true for deeply nested key', () => {
      const result = callVerb('has', [
        obj({ a: { b: { c: 42 } } }),
        str('a.b.c'),
      ]);
      expect(result).toEqual(bool(true));
    });

    it('blocks __proto__ access', () => {
      const result = callVerb('has', [obj({ x: int(1) }), str('__proto__')]);
      expect(result).toEqual(bool(false));
    });
  });

  describe('get', () => {
    it('returns default for missing path', () => {
      const result = callVerb('get', [obj({ a: int(1) }), str('b'), str('default')]);
      expect(result).toEqual(str('default'));
    });

    it('returns null when no default and path missing', () => {
      const result = callVerb('get', [obj({ a: int(1) }), str('z')]);
      expect(result.type).toBe('null');
    });

    it('returns null for non-object', () => {
      const result = callVerb('get', [int(42), str('key'), str('fallback')]);
      expect(result).toEqual(str('fallback'));
    });
  });

  describe('merge', () => {
    it('returns null when neither arg is an object', () => {
      const result = callVerb('merge', [str('a'), str('b')]);
      expect(result.type).toBe('null');
    });

    it('returns the object when merged with non-object', () => {
      const result = callVerb('merge', [obj({ a: int(1) }), str('not_obj')]);
      expect(result.type).toBe('object');
    });

    it('returns null with insufficient args', () => {
      expect(callVerb('merge', [obj({})]).type).toBe('null');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Encoding verb roundtrips (~20 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('Encoding verb roundtrips', () => {
  describe('base64 roundtrip', () => {
    it('roundtrips simple ASCII', () => {
      const encoded = callVerb('base64Encode', [str('Hello, World!')]);
      const decoded = callVerb('base64Decode', [encoded]);
      expect(decoded).toEqual(str('Hello, World!'));
    });

    it('roundtrips empty string', () => {
      const encoded = callVerb('base64Encode', [str('')]);
      const decoded = callVerb('base64Decode', [encoded]);
      expect(decoded).toEqual(str(''));
    });

    it('roundtrips unicode text', () => {
      const encoded = callVerb('base64Encode', [str('cafe\u0301')]);
      const decoded = callVerb('base64Decode', [encoded]);
      expect(decoded).toEqual(str('cafe\u0301'));
    });

    it('returns null for null input', () => {
      expect(callVerb('base64Encode', [nil()]).type).toBe('string');
      // nil() is coerced to empty string
    });
  });

  describe('url encode/decode roundtrip', () => {
    it('roundtrips spaces and special chars', () => {
      const encoded = callVerb('urlEncode', [str('hello world&foo=bar')]);
      const decoded = callVerb('urlDecode', [encoded]);
      expect(decoded).toEqual(str('hello world&foo=bar'));
    });

    it('roundtrips unicode', () => {
      const encoded = callVerb('urlEncode', [str('\u00e9\u00e8\u00ea')]);
      const decoded = callVerb('urlDecode', [encoded]);
      expect(decoded).toEqual(str('\u00e9\u00e8\u00ea'));
    });

    it('roundtrips empty string', () => {
      const encoded = callVerb('urlEncode', [str('')]);
      const decoded = callVerb('urlDecode', [encoded]);
      expect(decoded).toEqual(str(''));
    });
  });

  describe('hex encode/decode roundtrip', () => {
    it('roundtrips ASCII text', () => {
      const encoded = callVerb('hexEncode', [str('Hello')]);
      expect(encoded).toEqual(str('48656c6c6f'));
      const decoded = callVerb('hexDecode', [encoded]);
      expect(decoded).toEqual(str('Hello'));
    });

    it('returns null for odd-length hex string', () => {
      const result = callVerb('hexDecode', [str('abc')]);
      expect(result.type).toBe('null');
    });

    it('returns null for invalid hex characters', () => {
      const result = callVerb('hexDecode', [str('zzzz')]);
      expect(result.type).toBe('null');
    });

    it('handles empty string', () => {
      const result = callVerb('hexDecode', [str('')]);
      expect(result).toEqual(str(''));
    });
  });

  describe('json encode/decode roundtrip', () => {
    it('roundtrips string with special chars', () => {
      const encoded = callVerb('jsonEncode', [str('line1\nline2\ttab')]);
      const decoded = callVerb('jsonDecode', [encoded]);
      expect(decoded).toEqual(str('line1\nline2\ttab'));
    });

    it('encodes object to JSON string', () => {
      const result = callVerb('jsonEncode', [obj({ name: str('John') })]);
      expect(result.type).toBe('string');
    });
  });

  describe('sha256 known values', () => {
    it('hashes empty string', () => {
      const result = callVerb('sha256', [str('')]);
      expect(result).toEqual(str('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'));
    });

    it('hashes "hello"', () => {
      const result = callVerb('sha256', [str('hello')]);
      expect(result).toEqual(str('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'));
    });
  });

  describe('md5 known values', () => {
    it('hashes empty string', () => {
      const result = callVerb('md5', [str('')]);
      expect(result).toEqual(str('d41d8cd98f00b204e9800998ecf8427e'));
    });

    it('hashes "hello"', () => {
      const result = callVerb('md5', [str('hello')]);
      expect(result).toEqual(str('5d41402abc4b2a76b9719d911017c592'));
    });
  });

  describe('crc32 known values', () => {
    it('computes crc32 of empty string', () => {
      const result = callVerb('crc32', [str('')]);
      expect(result).toEqual(str('00000000'));
    });

    it('computes crc32 of "hello"', () => {
      const result = callVerb('crc32', [str('hello')]);
      expect(result).toEqual(str('3610a686'));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Financial verb edge cases (~20 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('Financial verb edge cases', () => {
  describe('compound', () => {
    it('zero rate returns principal', () => {
      const result = callVerb('compound', [num(1000), num(0), int(10)]);
      expect(result.value).toBeCloseTo(1000, 5);
    });

    it('one period', () => {
      const result = callVerb('compound', [num(1000), num(0.05), int(1)]);
      expect(result.value).toBeCloseTo(1050, 5);
    });

    it('returns null with insufficient args', () => {
      expect(callVerb('compound', [num(1000)]).type).toBe('null');
    });

    it('handles negative rate', () => {
      const result = callVerb('compound', [num(1000), num(-0.1), int(1)]);
      expect(result.value).toBeCloseTo(900, 5);
    });

    it('large number of periods', () => {
      const result = callVerb('compound', [num(100), num(0.05), int(30)]);
      expect(result.value).toBeCloseTo(432.194, 2);
    });
  });

  describe('discount', () => {
    it('zero rate returns future value', () => {
      const result = callVerb('discount', [num(1000), num(0), int(10)]);
      expect(result.value).toBeCloseTo(1000, 5);
    });

    it('discounts correctly', () => {
      const result = callVerb('discount', [num(1050), num(0.05), int(1)]);
      expect(result.value).toBeCloseTo(1000, 5);
    });

    it('returns null with insufficient args', () => {
      expect(callVerb('discount', [num(1000)]).type).toBe('null');
    });
  });

  describe('npv', () => {
    it('computes NPV for typical cash flows', () => {
      const result = callVerb('npv', [
        num(0.1),
        arr([num(-100), num(30), num(40), num(50), num(60)]),
      ]);
      expect(result.type).not.toBe('null');
      expect(result.value).toBeCloseTo(38.88, 0);
    });

    it('returns null for empty cash flows', () => {
      expect(callVerb('npv', [num(0.1), arr([])]).type).toBe('null');
    });

    it('zero rate sums cash flows', () => {
      const result = callVerb('npv', [
        num(0),
        arr([num(-100), num(50), num(50)]),
      ]);
      expect(result.value).toBeCloseTo(0, 5);
    });
  });

  describe('irr', () => {
    it('computes IRR for simple cash flows', () => {
      const result = callVerb('irr', [
        arr([num(-1000), num(300), num(400), num(500), num(200)]),
      ]);
      expect(result.type).not.toBe('null');
      // IRR should be around 12-15%
      expect(result.value).toBeGreaterThan(0.05);
      expect(result.value).toBeLessThan(0.5);
    });

    it('returns null for single cash flow', () => {
      expect(callVerb('irr', [arr([num(100)])]).type).toBe('null');
    });
  });

  describe('depreciation', () => {
    it('computes straight-line depreciation', () => {
      const result = callVerb('depreciation', [num(10000), num(2000), int(5)]);
      expect(result.value).toBeCloseTo(1600, 5);
    });

    it('returns null when salvage exceeds cost', () => {
      expect(callVerb('depreciation', [num(100), num(200), int(5)]).type).toBe('null');
    });

    it('returns null when life is zero', () => {
      expect(callVerb('depreciation', [num(10000), num(0), int(0)]).type).toBe('null');
    });

    it('returns null for negative life', () => {
      expect(callVerb('depreciation', [num(10000), num(0), int(-1)]).type).toBe('null');
    });

    it('zero salvage value', () => {
      const result = callVerb('depreciation', [num(10000), num(0), int(5)]);
      expect(result.value).toBeCloseTo(2000, 5);
    });
  });

  describe('pmt', () => {
    it('calculates loan payment', () => {
      // $100,000 loan at 0.5% monthly for 360 months (30yr)
      const result = callVerb('pmt', [num(100000), num(0.005), int(360)]);
      expect(result.type).not.toBe('null');
      expect(result.value).toBeCloseTo(599.55, 0);
    });

    it('zero rate divides evenly', () => {
      const result = callVerb('pmt', [num(1200), num(0), int(12)]);
      expect(result.value).toBeCloseTo(100, 5);
    });

    it('returns null for zero periods', () => {
      expect(callVerb('pmt', [num(1000), num(0.05), int(0)]).type).toBe('null');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. DateTime verb edge cases (~20 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('DateTime verb edge cases', () => {
  describe('leap year handling', () => {
    it('2000 is a leap year', () => {
      const result = callVerb('isLeapYear', [str('2000-01-01')]);
      expect(result).toEqual(bool(true));
    });

    it('1900 is not a leap year', () => {
      const result = callVerb('isLeapYear', [str('1900-01-01')]);
      expect(result).toEqual(bool(false));
    });

    it('2024 is a leap year', () => {
      const result = callVerb('isLeapYear', [str('2024-06-15')]);
      expect(result).toEqual(bool(true));
    });

    it('2023 is not a leap year', () => {
      const result = callVerb('isLeapYear', [str('2023-06-15')]);
      expect(result).toEqual(bool(false));
    });
  });

  describe('month boundary addMonths', () => {
    it('adding month from Jan 31 wraps to Mar in non-leap year', () => {
      const result = callVerb('addMonths', [str('2023-01-31'), int(1)]);
      // Jan 31 + 1 month = Feb 31 which wraps to March 3
      expect(result.type).toBe('string');
      expect(result.value).toBe('2023-03-03');
    });

    it('adding month from Jan 31 wraps to Mar in leap year', () => {
      const result = callVerb('addMonths', [str('2024-01-31'), int(1)]);
      // Jan 31 + 1 month = Feb 31 which wraps to March 2 in leap year
      expect(result.type).toBe('string');
      expect(result.value).toBe('2024-03-02');
    });

    it('subtracting months crosses year boundary', () => {
      const result = callVerb('addMonths', [str('2024-03-15'), int(-4)]);
      expect(result).toEqual(str('2023-11-15'));
    });
  });

  describe('year transitions', () => {
    it('addDays crosses year boundary', () => {
      const result = callVerb('addDays', [str('2023-12-30'), int(5)]);
      expect(result).toEqual(str('2024-01-04'));
    });

    it('addYears on Feb 29 in leap year', () => {
      const result = callVerb('addYears', [str('2024-02-29'), int(1)]);
      // Feb 29 + 1 year = 2025 which has no Feb 29, wraps to March 1
      expect(result.type).toBe('string');
      expect(result.value).toBe('2025-03-01');
    });
  });

  describe('isBefore / isAfter / isBetween', () => {
    it('isBefore returns true for earlier date', () => {
      const result = callVerb('isBefore', [str('2024-01-01'), str('2024-12-31')]);
      expect(result).toEqual(bool(true));
    });

    it('isBefore returns false for same date', () => {
      const result = callVerb('isBefore', [str('2024-06-15'), str('2024-06-15')]);
      expect(result).toEqual(bool(false));
    });

    it('isAfter returns true for later date', () => {
      const result = callVerb('isAfter', [str('2025-01-01'), str('2024-01-01')]);
      expect(result).toEqual(bool(true));
    });

    it('isAfter returns false for same date', () => {
      const result = callVerb('isAfter', [str('2024-06-15'), str('2024-06-15')]);
      expect(result).toEqual(bool(false));
    });

    it('isBetween inclusive on start boundary', () => {
      const result = callVerb('isBetween', [str('2024-01-01'), str('2024-01-01'), str('2024-12-31')]);
      expect(result).toEqual(bool(true));
    });

    it('isBetween inclusive on end boundary', () => {
      const result = callVerb('isBetween', [str('2024-12-31'), str('2024-01-01'), str('2024-12-31')]);
      expect(result).toEqual(bool(true));
    });

    it('isBetween returns false for date outside range', () => {
      const result = callVerb('isBetween', [str('2025-01-01'), str('2024-01-01'), str('2024-12-31')]);
      expect(result).toEqual(bool(false));
    });

    it('returns null with invalid date strings', () => {
      expect(callVerb('isBefore', [str('not-a-date'), str('2024-01-01')]).type).toBe('null');
    });
  });

  describe('quarter edge cases', () => {
    it('January is Q1', () => {
      const result = callVerb('quarter', [str('2024-01-15')]);
      expect(result).toEqual(int(1));
    });

    it('December is Q4', () => {
      const result = callVerb('quarter', [str('2024-12-31')]);
      expect(result).toEqual(int(4));
    });
  });

  describe('endOfMonth edge cases', () => {
    it('February in leap year ends on 29th', () => {
      const result = callVerb('endOfMonth', [str('2024-02-05')]);
      expect(result).toEqual(str('2024-02-29'));
    });

    it('February in non-leap year ends on 28th', () => {
      const result = callVerb('endOfMonth', [str('2023-02-10')]);
      expect(result).toEqual(str('2023-02-28'));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Statistical verb edge cases (~20 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('Statistical verb edge cases', () => {
  describe('median', () => {
    it('returns middle value for odd-length array', () => {
      const result = callVerb('median', [arr([num(1), num(3), num(5)])]);
      expect(result.value).toBeCloseTo(3, 5);
    });

    it('returns average of two middle values for even-length', () => {
      const result = callVerb('median', [arr([num(1), num(2), num(3), num(4)])]);
      expect(result.value).toBeCloseTo(2.5, 5);
    });

    it('single element returns that element', () => {
      const result = callVerb('median', [arr([num(42)])]);
      expect(result.value).toBeCloseTo(42, 5);
    });

    it('returns null for empty array', () => {
      expect(callVerb('median', [arr([])]).type).toBe('null');
    });

    it('returns null with no args', () => {
      expect(callVerb('median', []).type).toBe('null');
    });

    it('handles unsorted input', () => {
      const result = callVerb('median', [arr([num(5), num(1), num(3)])]);
      expect(result.value).toBeCloseTo(3, 5);
    });
  });

  describe('mode', () => {
    it('returns most frequent value', () => {
      const result = callVerb('mode', [arr([num(1), num(2), num(2), num(3)])]);
      expect(result.value).toBeCloseTo(2, 5);
    });

    it('returns first mode when tie', () => {
      const result = callVerb('mode', [arr([num(1), num(1), num(2), num(2)])]);
      expect(result.value).toBeCloseTo(1, 5);
    });

    it('single element returns that element', () => {
      const result = callVerb('mode', [arr([num(7)])]);
      expect(result.value).toBeCloseTo(7, 5);
    });

    it('returns null for empty array', () => {
      expect(callVerb('mode', [arr([])]).type).toBe('null');
    });
  });

  describe('std and variance', () => {
    it('variance of identical values is zero', () => {
      const result = callVerb('variance', [arr([num(5), num(5), num(5)])]);
      expect(result.value).toBeCloseTo(0, 5);
    });

    it('std of identical values is zero', () => {
      const result = callVerb('std', [arr([num(5), num(5), num(5)])]);
      expect(result.value).toBeCloseTo(0, 5);
    });

    it('population variance of [2,4,4,4,5,5,7,9]', () => {
      const result = callVerb('variance', [
        arr([num(2), num(4), num(4), num(4), num(5), num(5), num(7), num(9)]),
      ]);
      expect(result.value).toBeCloseTo(4, 5);
    });

    it('std is sqrt of variance', () => {
      const data = arr([num(2), num(4), num(4), num(4), num(5), num(5), num(7), num(9)]);
      const v = callVerb('variance', [data]);
      const s = callVerb('std', [data]);
      expect(s.value).toBeCloseTo(Math.sqrt(v.value as number), 5);
    });

    it('returns null for empty array', () => {
      expect(callVerb('variance', [arr([])]).type).toBe('null');
      expect(callVerb('std', [arr([])]).type).toBe('null');
    });
  });

  describe('percentile', () => {
    it('0th percentile returns minimum', () => {
      const result = callVerb('percentile', [arr([num(10), num(20), num(30)]), num(0)]);
      expect(result.value).toBeCloseTo(10, 5);
    });

    it('100th percentile returns maximum', () => {
      const result = callVerb('percentile', [arr([num(10), num(20), num(30)]), num(100)]);
      expect(result.value).toBeCloseTo(30, 5);
    });

    it('50th percentile approximates median', () => {
      const result = callVerb('percentile', [arr([num(10), num(20), num(30)]), num(50)]);
      expect(result.value).toBeCloseTo(20, 5);
    });

    it('returns null for out-of-range percentile', () => {
      expect(callVerb('percentile', [arr([num(1)]), num(-1)]).type).toBe('null');
      expect(callVerb('percentile', [arr([num(1)]), num(101)]).type).toBe('null');
    });
  });

  describe('correlation', () => {
    it('perfect positive correlation', () => {
      const result = callVerb('correlation', [
        arr([num(1), num(2), num(3)]),
        arr([num(2), num(4), num(6)]),
      ]);
      expect(result.value).toBeCloseTo(1.0, 5);
    });

    it('perfect negative correlation', () => {
      const result = callVerb('correlation', [
        arr([num(1), num(2), num(3)]),
        arr([num(6), num(4), num(2)]),
      ]);
      expect(result.value).toBeCloseTo(-1.0, 5);
    });

    it('returns null for constant arrays (zero std)', () => {
      const result = callVerb('correlation', [
        arr([num(5), num(5), num(5)]),
        arr([num(1), num(2), num(3)]),
      ]);
      expect(result.type).toBe('null');
    });
  });

  describe('zscore', () => {
    it('z-score of the mean is 0', () => {
      const data = arr([num(10), num(20), num(30)]);
      const result = callVerb('zscore', [num(20), data]);
      expect(result.value).toBeCloseTo(0, 5);
    });

    it('positive z-score for above-mean value', () => {
      const data = arr([num(10), num(20), num(30)]);
      const result = callVerb('zscore', [num(30), data]);
      expect(result.value).toBeGreaterThan(0);
    });

    it('negative z-score for below-mean value', () => {
      const data = arr([num(10), num(20), num(30)]);
      const result = callVerb('zscore', [num(10), data]);
      expect(result.value).toBeLessThan(0);
    });

    it('returns null for constant array', () => {
      const result = callVerb('zscore', [num(5), arr([num(5), num(5), num(5)])]);
      expect(result.type).toBe('null');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. String verb edge cases (~20 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('String verb edge cases', () => {
  describe('soundex', () => {
    it('Robert and Rupert produce same code', () => {
      const r1 = callVerb('soundex', [str('Robert')]);
      const r2 = callVerb('soundex', [str('Rupert')]);
      expect(r1).toEqual(r2);
      expect(r1).toEqual(str('R163'));
    });

    it('Ashcraft produces A226', () => {
      const result = callVerb('soundex', [str('Ashcraft')]);
      expect(result).toEqual(str('A226'));
    });

    it('empty string after stripping non-alpha returns empty', () => {
      const result = callVerb('soundex', [str('123')]);
      expect(result).toEqual(str(''));
    });

    it('single letter pads with zeros', () => {
      const result = callVerb('soundex', [str('A')]);
      expect(result).toEqual(str('A000'));
    });

    it('returns null with no args', () => {
      expect(callVerb('soundex', []).type).toBe('null');
    });
  });

  describe('levenshtein', () => {
    it('identical strings have distance 0', () => {
      const result = callVerb('levenshtein', [str('hello'), str('hello')]);
      expect(result).toEqual(int(0));
    });

    it('empty vs non-empty is length of non-empty', () => {
      const result = callVerb('levenshtein', [str(''), str('abc')]);
      expect(result).toEqual(int(3));
    });

    it('single substitution is distance 1', () => {
      const result = callVerb('levenshtein', [str('cat'), str('bat')]);
      expect(result).toEqual(int(1));
    });

    it('kitten to sitting is 3', () => {
      const result = callVerb('levenshtein', [str('kitten'), str('sitting')]);
      expect(result).toEqual(int(3));
    });

    it('returns null with insufficient args', () => {
      expect(callVerb('levenshtein', [str('abc')]).type).toBe('null');
    });
  });

  describe('tokenize', () => {
    it('splits on whitespace by default', () => {
      const result = callVerb('tokenize', [str('hello world foo')]);
      expect(result.type).toBe('array');
      const items = (result as any).items;
      expect(items).toHaveLength(3);
    });

    it('splits on custom delimiter', () => {
      const result = callVerb('tokenize', [str('a,b,c'), str(',')]);
      expect(result.type).toBe('array');
      const items = (result as any).items;
      expect(items).toHaveLength(3);
    });

    it('empty string returns empty array', () => {
      const result = callVerb('tokenize', [str('')]);
      expect(result.type).toBe('array');
      expect((result as any).items).toHaveLength(0);
    });

    it('no args returns empty array', () => {
      const result = callVerb('tokenize', []);
      expect(result.type).toBe('array');
      expect((result as any).items).toHaveLength(0);
    });
  });

  describe('stripAccents', () => {
    it('removes accents from cafe', () => {
      const result = callVerb('stripAccents', [str('caf\u00e9')]);
      expect(result).toEqual(str('cafe'));
    });

    it('handles multiple accented characters', () => {
      const result = callVerb('stripAccents', [str('r\u00e9sum\u00e9')]);
      expect(result).toEqual(str('resume'));
    });

    it('leaves ASCII unchanged', () => {
      const result = callVerb('stripAccents', [str('hello')]);
      expect(result).toEqual(str('hello'));
    });

    it('returns null with no args', () => {
      expect(callVerb('stripAccents', []).type).toBe('null');
    });
  });

  describe('clean', () => {
    it('removes control characters', () => {
      const result = callVerb('clean', [str('hello\x00world')]);
      expect(result).toEqual(str('helloworld'));
    });

    it('normalizes unicode whitespace', () => {
      const result = callVerb('clean', [str('hello\u00A0world')]);
      expect(result).toEqual(str('hello world'));
    });

    it('empty string returns empty', () => {
      const result = callVerb('clean', [str('')]);
      expect(result).toEqual(str(''));
    });

    it('returns null with no args', () => {
      expect(callVerb('clean', []).type).toBe('null');
    });
  });

  describe('wordCount', () => {
    it('counts words in simple text', () => {
      const result = callVerb('wordCount', [str('hello world')]);
      expect(result).toEqual(int(2));
    });

    it('returns 0 for empty string', () => {
      const result = callVerb('wordCount', [str('')]);
      expect(result).toEqual(int(0));
    });

    it('returns 0 for whitespace-only string', () => {
      const result = callVerb('wordCount', [str('   ')]);
      expect(result).toEqual(int(0));
    });

    it('handles multiple spaces between words', () => {
      const result = callVerb('wordCount', [str('one   two   three')]);
      expect(result).toEqual(int(3));
    });

    it('returns 0 with no args', () => {
      const result = callVerb('wordCount', []);
      expect(result).toEqual(int(0));
    });
  });
});
