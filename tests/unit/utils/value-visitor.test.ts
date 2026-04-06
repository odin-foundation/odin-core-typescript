/**
 * Tests for value-visitor module.
 *
 * Covers the visitor pattern implementation for OdinValue to various representations.
 */

import { describe, it, expect } from 'vitest';
import {
  visitValue,
  visitTransformValue,
  OdinStringVisitor,
  CanonicalStringVisitor,
  PlainStringVisitor,
  JsonValueVisitor,
  JsValueVisitor,
  toOdinString,
  toCanonicalString,
  toPlainString,
  toJsonValue,
  toJsValue,
  transformValueToPlainString,
} from '../../../src/utils/value-visitor.js';
import type { OdinValue } from '../../../src/types/values.js';
import type { TransformValue } from '../../../src/types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Data Factories
// ─────────────────────────────────────────────────────────────────────────────

const createNullValue = (): OdinValue => ({ type: 'null' });
const createBooleanValue = (value: boolean): OdinValue => ({ type: 'boolean', value });
const createStringValue = (value: string): OdinValue => ({ type: 'string', value });
const createIntegerValue = (value: number): OdinValue => ({ type: 'integer', value });
const createNumberValue = (value: number, raw?: string, decimalPlaces?: number): OdinValue => ({
  type: 'number',
  value,
  raw,
  decimalPlaces,
});
const createCurrencyValue = (
  value: number,
  decimalPlaces: number,
  raw?: string,
  currencyCode?: string
): OdinValue => ({
  type: 'currency',
  value,
  decimalPlaces,
  raw,
  currencyCode,
});
const createDateValue = (value: Date, raw: string): OdinValue => ({ type: 'date', value, raw });
const createTimestampValue = (value: Date, raw: string): OdinValue => ({
  type: 'timestamp',
  value,
  raw,
});
const createTimeValue = (value: string): OdinValue => ({ type: 'time', value });
const createDurationValue = (value: string): OdinValue => ({ type: 'duration', value });
const createReferenceValue = (path: string): OdinValue => ({ type: 'reference', path });
const createBinaryValue = (data: Uint8Array, algorithm?: string): OdinValue => ({
  type: 'binary',
  data,
  algorithm,
});
const createVerbValue = (
  verb: string,
  isCustom: boolean,
  args: readonly OdinValue[]
): OdinValue => ({
  type: 'verb',
  verb,
  isCustom,
  args,
});
const createArrayValue = (items: readonly unknown[]): OdinValue => ({ type: 'array', items });
const createObjectValue = (value: Record<string, unknown>): OdinValue => ({
  type: 'object',
  value,
});

// ─────────────────────────────────────────────────────────────────────────────
// visitValue Dispatch Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('visitValue', () => {
  const visitor = new OdinStringVisitor();

  it('dispatches null type', () => {
    expect(visitValue(createNullValue(), visitor)).toBe('~');
  });

  it('dispatches boolean type', () => {
    expect(visitValue(createBooleanValue(true), visitor)).toBe('?true');
  });

  it('dispatches string type', () => {
    expect(visitValue(createStringValue('hello'), visitor)).toBe('"hello"');
  });

  it('dispatches integer type', () => {
    expect(visitValue(createIntegerValue(42), visitor)).toBe('##42');
  });

  it('dispatches number type', () => {
    expect(visitValue(createNumberValue(3.14), visitor)).toBe('#3.14');
  });

  it('dispatches currency type', () => {
    expect(visitValue(createCurrencyValue(99.99, 2), visitor)).toBe('#$99.99');
  });

  it('dispatches date type', () => {
    expect(visitValue(createDateValue(new Date(), '2024-12-25'), visitor)).toBe('2024-12-25');
  });

  it('dispatches timestamp type', () => {
    expect(visitValue(createTimestampValue(new Date(), '2024-12-25T10:00:00Z'), visitor)).toBe(
      '2024-12-25T10:00:00Z'
    );
  });

  it('dispatches time type', () => {
    expect(visitValue(createTimeValue('14:30:00'), visitor)).toBe('14:30:00');
  });

  it('dispatches duration type', () => {
    expect(visitValue(createDurationValue('P1D'), visitor)).toBe('P1D');
  });

  it('dispatches reference type', () => {
    expect(visitValue(createReferenceValue('customer.name'), visitor)).toBe('@customer.name');
  });

  it('dispatches binary type', () => {
    const result = visitValue(createBinaryValue(new Uint8Array([72, 101, 108, 108, 111])), visitor);
    expect(result).toBe('^SGVsbG8=');
  });

  it('dispatches verb type', () => {
    expect(visitValue(createVerbValue('upper', false, []), visitor)).toBe('%upper');
  });

  it('dispatches array type', () => {
    expect(visitValue(createArrayValue([]), visitor)).toBe('[]');
  });

  it('dispatches object type', () => {
    expect(visitValue(createObjectValue({}), visitor)).toBe('{}');
  });
});

describe('visitTransformValue', () => {
  it('works with TransformValue', () => {
    const value: TransformValue = { type: 'string', value: 'test' };
    expect(visitTransformValue(value, new PlainStringVisitor())).toBe('test');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OdinStringVisitor Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('OdinStringVisitor', () => {
  const visitor = new OdinStringVisitor();

  describe('visitNull', () => {
    it('returns tilde for null', () => {
      expect(visitor.visitNull()).toBe('~');
    });
  });

  describe('visitBoolean', () => {
    it('returns ?true for true', () => {
      expect(visitor.visitBoolean(true)).toBe('?true');
    });

    it('returns ?false for false', () => {
      expect(visitor.visitBoolean(false)).toBe('?false');
    });
  });

  describe('visitString', () => {
    it('wraps simple string in quotes', () => {
      expect(visitor.visitString('hello')).toBe('"hello"');
    });

    it('handles empty string', () => {
      expect(visitor.visitString('')).toBe('""');
    });

    it('escapes backslash', () => {
      expect(visitor.visitString('C:\\path')).toBe('"C:\\\\path"');
    });

    it('escapes double quote', () => {
      expect(visitor.visitString('say "hi"')).toBe('"say \\"hi\\""');
    });

    it('escapes newline', () => {
      expect(visitor.visitString('line1\nline2')).toBe('"line1\\nline2"');
    });

    it('escapes carriage return', () => {
      expect(visitor.visitString('line1\rline2')).toBe('"line1\\rline2"');
    });

    it('escapes tab', () => {
      expect(visitor.visitString('col1\tcol2')).toBe('"col1\\tcol2"');
    });

    it('handles unicode', () => {
      expect(visitor.visitString('Hello')).toBe('"Hello"');
    });
  });

  describe('visitInteger', () => {
    it('prefixes with ##', () => {
      expect(visitor.visitInteger(42)).toBe('##42');
    });

    it('handles negative integers', () => {
      expect(visitor.visitInteger(-100)).toBe('##-100');
    });

    it('handles zero', () => {
      expect(visitor.visitInteger(0)).toBe('##0');
    });
  });

  describe('visitNumber', () => {
    it('prefixes with #', () => {
      expect(visitor.visitNumber(3.14)).toBe('#3.14');
    });

    it('uses raw value when provided', () => {
      expect(visitor.visitNumber(3.14159265358979, '3.14159265358979')).toBe('#3.14159265358979');
    });

    it('handles negative numbers', () => {
      expect(visitor.visitNumber(-1.5)).toBe('#-1.5');
    });
  });

  describe('visitCurrency', () => {
    it('prefixes with #$', () => {
      expect(visitor.visitCurrency(99.99, 2)).toBe('#$99.99');
    });

    it('uses raw value when provided', () => {
      expect(visitor.visitCurrency(99.99, 2, '99.99')).toBe('#$99.99');
    });

    it('respects decimal places', () => {
      expect(visitor.visitCurrency(100, 2)).toBe('#$100.00');
    });

    it('handles more decimal places', () => {
      expect(visitor.visitCurrency(99.12345, 4)).toBe('#$99.1235');
    });
  });

  describe('visitDate', () => {
    it('returns raw value', () => {
      expect(visitor.visitDate(new Date(), '2024-12-25')).toBe('2024-12-25');
    });
  });

  describe('visitTimestamp', () => {
    it('returns raw value', () => {
      expect(visitor.visitTimestamp(new Date(), '2024-12-25T10:00:00Z')).toBe(
        '2024-12-25T10:00:00Z'
      );
    });
  });

  describe('visitTime', () => {
    it('returns time string', () => {
      expect(visitor.visitTime('14:30:00')).toBe('14:30:00');
    });
  });

  describe('visitDuration', () => {
    it('returns duration string', () => {
      expect(visitor.visitDuration('P1DT2H30M')).toBe('P1DT2H30M');
    });
  });

  describe('visitReference', () => {
    it('prefixes with @', () => {
      expect(visitor.visitReference('customer.name')).toBe('@customer.name');
    });

    it('handles array indices', () => {
      expect(visitor.visitReference('items[0].name')).toBe('@items[0].name');
    });
  });

  describe('visitBinary', () => {
    it('formats without algorithm', () => {
      expect(visitor.visitBinary(new Uint8Array([72, 101, 108, 108, 111]))).toBe('^SGVsbG8=');
    });

    it('formats with algorithm', () => {
      expect(visitor.visitBinary(new Uint8Array([72, 101, 108, 108, 111]), 'sha256')).toBe(
        '^sha256:SGVsbG8='
      );
    });

    it('handles empty binary', () => {
      expect(visitor.visitBinary(new Uint8Array([]))).toBe('^');
    });
  });

  describe('visitVerb', () => {
    it('formats standard verb without args', () => {
      expect(visitor.visitVerb('upper', false, [])).toBe('%upper');
    });

    it('formats custom verb without args', () => {
      expect(visitor.visitVerb('myverb', true, [])).toBe('%&myverb');
    });

    it('formats verb with args', () => {
      expect(
        visitor.visitVerb('concat', false, [createStringValue('a'), createStringValue('b')])
      ).toBe('%concat "a" "b"');
    });

    it('formats custom verb with args', () => {
      expect(visitor.visitVerb('custom.fn', true, [createIntegerValue(42)])).toBe(
        '%&custom.fn ##42'
      );
    });
  });

  describe('visitArray', () => {
    it('returns empty array notation', () => {
      expect(visitor.visitArray([])).toBe('[]');
    });
  });

  describe('visitObject', () => {
    it('returns empty object notation', () => {
      expect(visitor.visitObject({})).toBe('{}');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CanonicalStringVisitor Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CanonicalStringVisitor', () => {
  const visitor = new CanonicalStringVisitor();

  describe('visitBoolean', () => {
    it('returns true without prefix', () => {
      expect(visitor.visitBoolean(true)).toBe('true');
    });

    it('returns false without prefix', () => {
      expect(visitor.visitBoolean(false)).toBe('false');
    });
  });

  describe('visitNumber - canonical formatting', () => {
    it('formats regular numbers', () => {
      expect(visitor.visitNumber(3.14)).toBe('#3.14');
    });

    it('removes trailing zeros', () => {
      expect(visitor.visitNumber(3.0)).toBe('#3');
    });

    it('uses raw value when provided', () => {
      expect(visitor.visitNumber(3.14, '3.140')).toBe('#3.140');
    });

    it('throws for Infinity', () => {
      expect(() => visitor.visitNumber(Infinity)).toThrow(
        'Non-finite numbers cannot be canonicalized'
      );
    });

    it('throws for negative Infinity', () => {
      expect(() => visitor.visitNumber(-Infinity)).toThrow(
        'Non-finite numbers cannot be canonicalized'
      );
    });

    it('throws for NaN', () => {
      expect(() => visitor.visitNumber(NaN)).toThrow('Non-finite numbers cannot be canonicalized');
    });
  });

  describe('visitString - canonical escaping', () => {
    it('escapes same characters as regular', () => {
      expect(visitor.visitString('C:\\path\t"name"\n\r')).toBe('"C:\\\\path\\t\\"name\\"\\n\\r"');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PlainStringVisitor Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PlainStringVisitor', () => {
  const visitor = new PlainStringVisitor();

  describe('visitNull', () => {
    it('returns empty string', () => {
      expect(visitor.visitNull()).toBe('');
    });
  });

  describe('visitBoolean', () => {
    it('returns string true', () => {
      expect(visitor.visitBoolean(true)).toBe('true');
    });

    it('returns string false', () => {
      expect(visitor.visitBoolean(false)).toBe('false');
    });
  });

  describe('visitString', () => {
    it('returns string without quotes', () => {
      expect(visitor.visitString('hello')).toBe('hello');
    });
  });

  describe('visitInteger', () => {
    it('returns string without prefix', () => {
      expect(visitor.visitInteger(42)).toBe('42');
    });
  });

  describe('visitNumber', () => {
    it('returns string without prefix', () => {
      expect(visitor.visitNumber(3.14)).toBe('3.14');
    });
  });

  describe('visitCurrency', () => {
    it('returns string without prefix', () => {
      expect(visitor.visitCurrency(99.99, 2)).toBe('99.99');
    });
  });

  describe('visitTimestamp', () => {
    it('returns ISO string', () => {
      const date = new Date(Date.UTC(2024, 11, 25, 10, 0, 0));
      expect(visitor.visitTimestamp(date, '2024-12-25T10:00:00Z')).toBe('2024-12-25T10:00:00.000Z');
    });
  });

  describe('visitArray', () => {
    it('returns JSON stringified array', () => {
      expect(visitor.visitArray([1, 2, 3])).toBe('[1,2,3]');
    });
  });

  describe('visitObject', () => {
    it('returns JSON stringified object', () => {
      expect(visitor.visitObject({ a: 1 })).toBe('{"a":1}');
    });
  });

  describe('visitVerb', () => {
    it('formats standard verb', () => {
      expect(visitor.visitVerb('upper', false, [])).toBe('%upper');
    });

    it('formats custom verb', () => {
      expect(visitor.visitVerb('myverb', true, [])).toBe('%&myverb');
    });

    it('formats verb with args', () => {
      expect(visitor.visitVerb('concat', false, [createStringValue('a')])).toBe('%concat a');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JsonValueVisitor Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('JsonValueVisitor', () => {
  describe('without precision preservation', () => {
    const visitor = new JsonValueVisitor(false);

    it('returns null for null', () => {
      expect(visitor.visitNull()).toBe(null);
    });

    it('returns boolean value', () => {
      expect(visitor.visitBoolean(true)).toBe(true);
    });

    it('returns string value', () => {
      expect(visitor.visitString('hello')).toBe('hello');
    });

    it('returns integer value', () => {
      expect(visitor.visitInteger(42)).toBe(42);
    });

    it('returns number value', () => {
      expect(visitor.visitNumber(3.14)).toBe(3.14);
    });

    it('returns number even with high precision raw', () => {
      // Without preservePrecision, raw is ignored
      expect(visitor.visitNumber(3.141592653589793, '3.14159265358979323846')).toBe(
        3.141592653589793
      );
    });

    it('returns currency value', () => {
      expect(visitor.visitCurrency(99.99, 2)).toBe(99.99);
    });
  });

  describe('with precision preservation', () => {
    const visitor = new JsonValueVisitor(true);

    it('returns raw for high precision numbers', () => {
      // More than 15 significant digits
      expect(visitor.visitNumber(3.141592653589793, '3.14159265358979323846')).toBe(
        '3.14159265358979323846'
      );
    });

    it('returns number for normal precision', () => {
      // 15 or fewer significant digits
      expect(visitor.visitNumber(3.14, '3.14')).toBe(3.14);
    });

    it('returns raw for currency when preserving', () => {
      expect(visitor.visitCurrency(99.99, 2, '99.99')).toBe('99.99');
    });
  });

  describe('visitVerb', () => {
    const visitor = new JsonValueVisitor(false);

    it('returns verb name with prefix', () => {
      expect(visitor.visitVerb('upper', false, [])).toBe('%upper');
    });
  });

  describe('visitArray', () => {
    const visitor = new JsonValueVisitor(false);

    it('converts array items', () => {
      const items = [createStringValue('a'), createIntegerValue(1)];
      const result = visitor.visitArray(items) as unknown[];
      expect(result).toEqual(['a', 1]);
    });

    it('handles Map entries in array', () => {
      const map = new Map<string, OdinValue>([
        ['name', createStringValue('test')],
        ['count', createIntegerValue(5)],
      ]);
      const result = visitor.visitArray([map]) as unknown[];
      expect(result).toEqual([{ name: 'test', count: 5 }]);
    });
  });

  describe('visitObject', () => {
    const visitor = new JsonValueVisitor(false);

    it('returns object as-is', () => {
      expect(visitor.visitObject({ a: 1 })).toEqual({ a: 1 });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JsValueVisitor Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('JsValueVisitor', () => {
  const visitor = new JsValueVisitor();

  it('returns null for null', () => {
    expect(visitor.visitNull()).toBe(null);
  });

  it('returns boolean value', () => {
    expect(visitor.visitBoolean(true)).toBe(true);
  });

  it('returns string value', () => {
    expect(visitor.visitString('hello')).toBe('hello');
  });

  it('returns integer value', () => {
    expect(visitor.visitInteger(42)).toBe(42);
  });

  it('returns number value', () => {
    expect(visitor.visitNumber(3.14)).toBe(3.14);
  });

  it('returns currency value', () => {
    expect(visitor.visitCurrency(99.99, 2)).toBe(99.99);
  });

  describe('visitVerb', () => {
    it('returns null (loses information)', () => {
      expect(visitor.visitVerb('upper', false, [])).toBe(null);
    });
  });

  describe('visitArray', () => {
    it('returns items array', () => {
      expect(visitor.visitArray([1, 2, 3])).toEqual([1, 2, 3]);
    });
  });

  describe('visitObject', () => {
    it('returns object value', () => {
      expect(visitor.visitObject({ a: 1 })).toEqual({ a: 1 });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Function Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Convenience Functions', () => {
  describe('toOdinString', () => {
    it('converts to ODIN format', () => {
      expect(toOdinString(createStringValue('hello'))).toBe('"hello"');
      expect(toOdinString(createIntegerValue(42))).toBe('##42');
      expect(toOdinString(createBooleanValue(true))).toBe('?true');
    });
  });

  describe('toCanonicalString', () => {
    it('converts to canonical format', () => {
      expect(toCanonicalString(createBooleanValue(true))).toBe('true');
      expect(toCanonicalString(createBooleanValue(false))).toBe('false');
    });
  });

  describe('toPlainString', () => {
    it('converts to plain string', () => {
      expect(toPlainString(createStringValue('hello'))).toBe('hello');
      expect(toPlainString(createIntegerValue(42))).toBe('42');
      expect(toPlainString(createNullValue())).toBe('');
    });
  });

  describe('toJsonValue', () => {
    it('converts to JSON value without precision', () => {
      expect(toJsonValue(createIntegerValue(42))).toBe(42);
      expect(toJsonValue(createStringValue('hello'))).toBe('hello');
    });

    it('converts to JSON value with precision', () => {
      const value = createNumberValue(3.141592653589793, '3.14159265358979323846');
      expect(toJsonValue(value, true)).toBe('3.14159265358979323846');
    });
  });

  describe('toJsValue', () => {
    it('converts to JS primitive', () => {
      expect(toJsValue(createIntegerValue(42))).toBe(42);
      expect(toJsValue(createNullValue())).toBe(null);
    });
  });

  describe('transformValueToPlainString', () => {
    it('converts TransformValue to plain string', () => {
      const value: TransformValue = { type: 'string', value: 'test' };
      expect(transformValueToPlainString(value)).toBe('test');
    });
  });
});
