/**
 * Tests for engine-value-utils module.
 *
 * Covers TransformValue conversions and truthiness checking.
 */

import { describe, it, expect } from 'vitest';
import {
  isTransformValue,
  jsToTransformValue,
  transformValueToJs,
  transformValueToString,
  formatDateOnly,
  isTruthy,
} from '../../../src/transform/engine-value-utils.js';
import type { TransformValue } from '../../../src/types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

const str = (value: string): TransformValue => ({ type: 'string', value });
const int = (value: number): TransformValue => ({ type: 'integer', value });
const num = (value: number): TransformValue => ({ type: 'number', value });
const bool = (value: boolean): TransformValue => ({ type: 'boolean', value });
const nil = (): TransformValue => ({ type: 'null' });
const currency = (value: number, decimalPlaces: number): TransformValue => ({
  type: 'currency',
  value,
  decimalPlaces,
});
const timestamp = (value: Date, raw: string): TransformValue => ({
  type: 'timestamp',
  value,
  raw,
});
const dateVal = (value: Date, raw: string): TransformValue => ({
  type: 'date',
  value,
  raw,
});
const time = (value: string): TransformValue => ({ type: 'time', value });
const duration = (value: string): TransformValue => ({ type: 'duration', value });
const ref = (path: string): TransformValue => ({ type: 'reference', path });
const binary = (data: Uint8Array, algorithm?: string): TransformValue => ({
  type: 'binary',
  data,
  algorithm,
});
const arr = (items: unknown[]): TransformValue =>
  ({ type: 'array', items }) as unknown as TransformValue;
const obj = (value: Record<string, unknown>): TransformValue => ({ type: 'object', value });
const verb = (verbName: string, isCustom: boolean, args: TransformValue[]): TransformValue => ({
  type: 'verb',
  verb: verbName,
  isCustom,
  args,
});

// ─────────────────────────────────────────────────────────────────────────────
// isTransformValue Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('isTransformValue', () => {
  it('returns true for null type', () => {
    expect(isTransformValue(nil())).toBe(true);
  });

  it('returns true for string type', () => {
    expect(isTransformValue(str('hello'))).toBe(true);
  });

  it('returns true for integer type', () => {
    expect(isTransformValue(int(42))).toBe(true);
  });

  it('returns true for number type', () => {
    expect(isTransformValue(num(3.14))).toBe(true);
  });

  it('returns true for boolean type', () => {
    expect(isTransformValue(bool(true))).toBe(true);
  });

  it('returns true for currency type', () => {
    expect(isTransformValue(currency(99.99, 2))).toBe(true);
  });

  it('returns true for timestamp type', () => {
    expect(isTransformValue(timestamp(new Date(), '2024-01-01T00:00:00Z'))).toBe(true);
  });

  it('returns true for date type', () => {
    expect(isTransformValue(dateVal(new Date(), '2024-01-01'))).toBe(true);
  });

  it('returns true for time type', () => {
    expect(isTransformValue(time('14:30:00'))).toBe(true);
  });

  it('returns true for duration type', () => {
    expect(isTransformValue(duration('P1D'))).toBe(true);
  });

  it('returns true for reference type', () => {
    expect(isTransformValue(ref('customer.name'))).toBe(true);
  });

  it('returns true for binary type', () => {
    expect(isTransformValue(binary(new Uint8Array([1, 2, 3])))).toBe(true);
  });

  it('returns true for array type', () => {
    expect(isTransformValue(arr([]))).toBe(true);
  });

  it('returns true for object type', () => {
    expect(isTransformValue(obj({}))).toBe(true);
  });

  it('returns true for verb type', () => {
    expect(isTransformValue(verb('upper', false, []))).toBe(true);
  });

  it('returns false for null', () => {
    expect(isTransformValue(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTransformValue(undefined)).toBe(false);
  });

  it('returns false for primitive string', () => {
    expect(isTransformValue('hello')).toBe(false);
  });

  it('returns false for primitive number', () => {
    expect(isTransformValue(42)).toBe(false);
  });

  it('returns false for primitive boolean', () => {
    expect(isTransformValue(true)).toBe(false);
  });

  it('returns false for object without type', () => {
    expect(isTransformValue({ value: 'test' })).toBe(false);
  });

  it('returns false for object with invalid type', () => {
    expect(isTransformValue({ type: 'invalid' })).toBe(false);
  });

  it('returns false for object with non-string type', () => {
    expect(isTransformValue({ type: 123 })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// jsToTransformValue Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('jsToTransformValue', () => {
  it('converts null to null type', () => {
    expect(jsToTransformValue(null)).toEqual({ type: 'null' });
  });

  it('converts undefined to null type', () => {
    expect(jsToTransformValue(undefined)).toEqual({ type: 'null' });
  });

  it('passes through existing TransformValue', () => {
    const value = str('hello');
    expect(jsToTransformValue(value)).toBe(value);
  });

  it('converts string to string type', () => {
    expect(jsToTransformValue('hello')).toEqual({ type: 'string', value: 'hello' });
  });

  it('converts empty string', () => {
    expect(jsToTransformValue('')).toEqual({ type: 'string', value: '' });
  });

  it('converts integer to integer type', () => {
    expect(jsToTransformValue(42)).toEqual({ type: 'integer', value: 42 });
  });

  it('converts negative integer to integer type', () => {
    expect(jsToTransformValue(-100)).toEqual({ type: 'integer', value: -100 });
  });

  it('converts zero to integer type', () => {
    expect(jsToTransformValue(0)).toEqual({ type: 'integer', value: 0 });
  });

  it('converts float to number type', () => {
    expect(jsToTransformValue(3.14)).toEqual({ type: 'number', value: 3.14 });
  });

  it('converts negative float to number type', () => {
    expect(jsToTransformValue(-1.5)).toEqual({ type: 'number', value: -1.5 });
  });

  it('converts true to boolean type', () => {
    expect(jsToTransformValue(true)).toEqual({ type: 'boolean', value: true });
  });

  it('converts false to boolean type', () => {
    expect(jsToTransformValue(false)).toEqual({ type: 'boolean', value: false });
  });

  it('converts Date to timestamp type', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const result = jsToTransformValue(date);
    expect(result.type).toBe('timestamp');
    if (result.type === 'timestamp') {
      expect(result.value).toBe(date);
      expect(result.raw).toBe('2024-01-15T10:30:00.000Z');
    }
  });

  it('converts array recursively', () => {
    const result = jsToTransformValue([1, 'hello', true]) as {
      type: 'array';
      items: TransformValue[];
    };
    expect(result.type).toBe('array');
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({ type: 'integer', value: 1 });
    expect(result.items[1]).toEqual({ type: 'string', value: 'hello' });
    expect(result.items[2]).toEqual({ type: 'boolean', value: true });
  });

  it('converts empty array', () => {
    const result = jsToTransformValue([]) as { type: 'array'; items: TransformValue[] };
    expect(result.type).toBe('array');
    expect(result.items).toEqual([]);
  });

  it('converts object to object type', () => {
    const input = { name: 'John', age: 30 };
    const result = jsToTransformValue(input);
    expect(result.type).toBe('object');
    if (result.type === 'object') {
      expect(result.value).toBe(input);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// transformValueToJs Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('transformValueToJs', () => {
  it('converts null to null', () => {
    expect(transformValueToJs(nil())).toBe(null);
  });

  it('converts string to string', () => {
    expect(transformValueToJs(str('hello'))).toBe('hello');
  });

  it('converts integer to number', () => {
    expect(transformValueToJs(int(42))).toBe(42);
  });

  it('converts number to number', () => {
    expect(transformValueToJs(num(3.14))).toBe(3.14);
  });

  it('converts currency to number', () => {
    expect(transformValueToJs(currency(99.99, 2))).toBe(99.99);
  });

  it('converts boolean to boolean', () => {
    expect(transformValueToJs(bool(true))).toBe(true);
  });

  it('converts date to Date object', () => {
    const date = new Date('2024-01-15');
    expect(transformValueToJs(dateVal(date, '2024-01-15'))).toBe(date);
  });

  it('converts timestamp to Date object', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    expect(transformValueToJs(timestamp(date, '2024-01-15T10:30:00Z'))).toBe(date);
  });

  it('converts time to string', () => {
    expect(transformValueToJs(time('14:30:00'))).toBe('14:30:00');
  });

  it('converts duration to string', () => {
    expect(transformValueToJs(duration('P1DT2H'))).toBe('P1DT2H');
  });

  it('converts reference to path', () => {
    expect(transformValueToJs(ref('customer.name'))).toBe('customer.name');
  });

  it('converts binary to Uint8Array', () => {
    const data = new Uint8Array([1, 2, 3]);
    expect(transformValueToJs(binary(data))).toBe(data);
  });

  it('converts array to items', () => {
    const items = [str('a'), int(1)];
    expect(transformValueToJs(arr(items))).toBe(items);
  });

  it('converts object to value', () => {
    const value = { name: 'John' };
    expect(transformValueToJs(obj(value))).toBe(value);
  });

  it('converts verb to string representation', () => {
    expect(transformValueToJs(verb('upper', false, []))).toBe('%upper');
  });

  it('converts custom verb to string representation', () => {
    expect(transformValueToJs(verb('myverb', true, []))).toBe('%&myverb');
  });

  it('converts verb with args', () => {
    expect(transformValueToJs(verb('concat', false, [str('a'), str('b')]))).toBe('%concat a b');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// transformValueToString Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('transformValueToString', () => {
  it('converts null to empty string', () => {
    expect(transformValueToString(nil())).toBe('');
  });

  it('converts string to string', () => {
    expect(transformValueToString(str('hello'))).toBe('hello');
  });

  it('converts integer to string', () => {
    expect(transformValueToString(int(42))).toBe('42');
  });

  it('converts number to string', () => {
    expect(transformValueToString(num(3.14))).toBe('3.14');
  });

  it('converts currency to string', () => {
    expect(transformValueToString(currency(99.99, 2))).toBe('99.99');
  });

  it('converts boolean to string', () => {
    expect(transformValueToString(bool(true))).toBe('true');
    expect(transformValueToString(bool(false))).toBe('false');
  });

  it('converts date to ISO string', () => {
    const date = new Date('2024-01-15T00:00:00Z');
    expect(transformValueToString(dateVal(date, '2024-01-15'))).toBe('2024-01-15T00:00:00.000Z');
  });

  it('converts timestamp to ISO string', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    expect(transformValueToString(timestamp(date, '2024-01-15T10:30:00Z'))).toBe(
      '2024-01-15T10:30:00.000Z'
    );
  });

  it('converts time to string', () => {
    expect(transformValueToString(time('14:30:00'))).toBe('14:30:00');
  });

  it('converts duration to string', () => {
    expect(transformValueToString(duration('P1DT2H'))).toBe('P1DT2H');
  });

  it('converts reference with @ prefix', () => {
    expect(transformValueToString(ref('customer.name'))).toBe('@customer.name');
  });

  it('converts binary without algorithm', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(transformValueToString(binary(data))).toBe('^SGVsbG8=');
  });

  it('converts binary with algorithm', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]);
    expect(transformValueToString(binary(data, 'sha256'))).toBe('^sha256:SGVsbG8=');
  });

  it('converts verb to string', () => {
    expect(transformValueToString(verb('upper', false, []))).toBe('%upper');
  });

  it('converts custom verb to string', () => {
    expect(transformValueToString(verb('myverb', true, []))).toBe('%&myverb');
  });

  it('converts verb with args', () => {
    expect(transformValueToString(verb('concat', false, [str('a'), str('b')]))).toBe('%concat a b');
  });

  it('converts array to JSON', () => {
    expect(transformValueToString(arr([1, 2, 3]))).toBe('[1,2,3]');
  });

  it('converts object to JSON', () => {
    expect(transformValueToString(obj({ a: 1 }))).toBe('{"a":1}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatDateOnly Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('formatDateOnly', () => {
  it('formats date as YYYY-MM-DD', () => {
    const date = new Date(Date.UTC(2024, 0, 15));
    expect(formatDateOnly(date)).toBe('2024-01-15');
  });

  it('pads single-digit month', () => {
    const date = new Date(Date.UTC(2024, 0, 1));
    expect(formatDateOnly(date)).toBe('2024-01-01');
  });

  it('pads single-digit day', () => {
    const date = new Date(Date.UTC(2024, 11, 5));
    expect(formatDateOnly(date)).toBe('2024-12-05');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isTruthy Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('isTruthy', () => {
  describe('null type', () => {
    it('returns false', () => {
      expect(isTruthy(nil())).toBe(false);
    });
  });

  describe('string type', () => {
    it('returns true for non-empty string', () => {
      expect(isTruthy(str('hello'))).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(isTruthy(str(''))).toBe(false);
    });
  });

  describe('numeric types', () => {
    it('returns true for non-zero integer', () => {
      expect(isTruthy(int(42))).toBe(true);
      expect(isTruthy(int(-1))).toBe(true);
    });

    it('returns false for zero integer', () => {
      expect(isTruthy(int(0))).toBe(false);
    });

    it('returns true for non-zero number', () => {
      expect(isTruthy(num(3.14))).toBe(true);
      expect(isTruthy(num(-0.5))).toBe(true);
    });

    it('returns false for zero number', () => {
      expect(isTruthy(num(0))).toBe(false);
    });

    it('returns true for non-zero currency', () => {
      expect(isTruthy(currency(99.99, 2))).toBe(true);
    });

    it('returns false for zero currency', () => {
      expect(isTruthy(currency(0, 2))).toBe(false);
    });
  });

  describe('boolean type', () => {
    it('returns true for true', () => {
      expect(isTruthy(bool(true))).toBe(true);
    });

    it('returns false for false', () => {
      expect(isTruthy(bool(false))).toBe(false);
    });
  });

  describe('temporal types', () => {
    it('returns true for date', () => {
      expect(isTruthy(dateVal(new Date(), '2024-01-01'))).toBe(true);
    });

    it('returns true for timestamp', () => {
      expect(isTruthy(timestamp(new Date(), '2024-01-01T00:00:00Z'))).toBe(true);
    });

    it('returns true for non-empty time', () => {
      expect(isTruthy(time('14:30:00'))).toBe(true);
    });

    it('returns false for empty time', () => {
      expect(isTruthy(time(''))).toBe(false);
    });

    it('returns true for non-empty duration', () => {
      expect(isTruthy(duration('P1D'))).toBe(true);
    });

    it('returns false for empty duration', () => {
      expect(isTruthy(duration(''))).toBe(false);
    });
  });

  describe('reference type', () => {
    it('returns true', () => {
      expect(isTruthy(ref('customer.name'))).toBe(true);
    });
  });

  describe('binary type', () => {
    it('returns true for non-empty binary', () => {
      expect(isTruthy(binary(new Uint8Array([1, 2, 3])))).toBe(true);
    });

    it('returns false for empty binary', () => {
      expect(isTruthy(binary(new Uint8Array([])))).toBe(false);
    });
  });

  describe('array type', () => {
    it('returns true for non-empty array', () => {
      expect(isTruthy(arr([1, 2, 3]))).toBe(true);
    });

    it('returns false for empty array', () => {
      expect(isTruthy(arr([]))).toBe(false);
    });
  });

  describe('object type', () => {
    it('returns true for non-empty object', () => {
      expect(isTruthy(obj({ a: 1 }))).toBe(true);
    });

    it('returns false for empty object', () => {
      expect(isTruthy(obj({}))).toBe(false);
    });
  });

  describe('verb type', () => {
    it('returns true', () => {
      expect(isTruthy(verb('upper', false, []))).toBe(true);
    });
  });
});
