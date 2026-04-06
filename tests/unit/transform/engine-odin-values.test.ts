/**
 * Tests for engine-odin-values module.
 *
 * Covers ODIN value to JavaScript and TransformValue conversion.
 */

import { describe, it, expect } from 'vitest';
import {
  odinValueToJs,
  odinValueToTransformValue,
} from '../../../src/transform/engine-odin-values.js';
import type { OdinValue } from '../../../src/types/values.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Value Factories
// ─────────────────────────────────────────────────────────────────────────────

const nullVal = (): OdinValue => ({ type: 'null' });
const boolVal = (value: boolean): OdinValue => ({ type: 'boolean', value });
const strVal = (value: string): OdinValue => ({ type: 'string', value });
const intVal = (value: number): OdinValue => ({ type: 'integer', value });
const numVal = (value: number): OdinValue => ({ type: 'number', value });
const currencyVal = (value: number, decimalPlaces: number): OdinValue => ({
  type: 'currency',
  value,
  decimalPlaces,
});
const dateVal = (value: Date, raw: string): OdinValue => ({ type: 'date', value, raw });
const timestampVal = (value: Date, raw: string): OdinValue => ({ type: 'timestamp', value, raw });
const timeVal = (value: string): OdinValue => ({ type: 'time', value });
const durationVal = (value: string): OdinValue => ({ type: 'duration', value });
const refVal = (path: string): OdinValue => ({ type: 'reference', path });
const binaryVal = (data: Uint8Array, algorithm?: string): OdinValue => ({
  type: 'binary',
  data,
  algorithm,
});
const arrayVal = (items: unknown[]): OdinValue => ({ type: 'array', items });
const objectVal = (value: Record<string, unknown>): OdinValue => ({ type: 'object', value });

// ─────────────────────────────────────────────────────────────────────────────
// odinValueToJs Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('odinValueToJs', () => {
  it('converts null to null', () => {
    expect(odinValueToJs(nullVal())).toBe(null);
  });

  it('converts boolean to boolean', () => {
    expect(odinValueToJs(boolVal(true))).toBe(true);
    expect(odinValueToJs(boolVal(false))).toBe(false);
  });

  it('converts string to string', () => {
    expect(odinValueToJs(strVal('hello'))).toBe('hello');
  });

  it('converts integer to number', () => {
    expect(odinValueToJs(intVal(42))).toBe(42);
  });

  it('converts number to number', () => {
    expect(odinValueToJs(numVal(3.14))).toBe(3.14);
  });

  it('converts currency to number', () => {
    expect(odinValueToJs(currencyVal(99.99, 2))).toBe(99.99);
  });

  it('converts date to raw string', () => {
    const date = new Date('2024-01-15');
    expect(odinValueToJs(dateVal(date, '2024-01-15'))).toBe('2024-01-15');
  });

  it('converts timestamp to raw string', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    expect(odinValueToJs(timestampVal(date, '2024-01-15T10:30:00Z'))).toBe('2024-01-15T10:30:00Z');
  });

  it('converts time to string', () => {
    expect(odinValueToJs(timeVal('14:30:00'))).toBe('14:30:00');
  });

  it('converts duration to string', () => {
    expect(odinValueToJs(durationVal('P1DT2H'))).toBe('P1DT2H');
  });

  it('converts reference to path with @ prefix', () => {
    expect(odinValueToJs(refVal('customer.name'))).toBe('@customer.name');
  });

  it('converts binary without algorithm', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(odinValueToJs(binaryVal(data))).toBe('^SGVsbG8=');
  });

  it('converts binary with algorithm', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]);
    expect(odinValueToJs(binaryVal(data, 'sha256'))).toBe('^sha256:SGVsbG8=');
  });

  it('converts array to items', () => {
    const items = [1, 2, 3];
    expect(odinValueToJs(arrayVal(items))).toBe(items);
  });

  it('converts object to value', () => {
    const value = { name: 'John' };
    expect(odinValueToJs(objectVal(value))).toBe(value);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// odinValueToTransformValue Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('odinValueToTransformValue', () => {
  describe('primitive types passthrough', () => {
    it('passes through null', () => {
      const value = nullVal();
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through boolean', () => {
      const value = boolVal(true);
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through string', () => {
      const value = strVal('hello');
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through integer', () => {
      const value = intVal(42);
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through number', () => {
      const value = numVal(3.14);
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through currency', () => {
      const value = currencyVal(99.99, 2);
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through date', () => {
      const value = dateVal(new Date(), '2024-01-15');
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through timestamp', () => {
      const value = timestampVal(new Date(), '2024-01-15T10:30:00Z');
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through time', () => {
      const value = timeVal('14:30:00');
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through duration', () => {
      const value = durationVal('P1D');
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through reference', () => {
      const value = refVal('customer.name');
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through binary', () => {
      const value = binaryVal(new Uint8Array([1, 2, 3]));
      expect(odinValueToTransformValue(value)).toBe(value);
    });

    it('passes through object', () => {
      const value = objectVal({ a: 1 });
      expect(odinValueToTransformValue(value)).toBe(value);
    });
  });

  describe('array handling', () => {
    it('converts flat array', () => {
      const items = [intVal(1), intVal(2), intVal(3)];
      const result = odinValueToTransformValue(arrayVal(items));
      expect(result.type).toBe('object');
      if (result.type === 'object') {
        expect(result.value.items).toEqual([1, 2, 3]);
      }
    });

    it('handles array with Map entries (object items)', () => {
      const map = new Map<string, OdinValue>([
        ['name', strVal('John')],
        ['age', intVal(30)],
      ]);
      const items = [map];
      const result = odinValueToTransformValue(arrayVal(items));
      expect(result.type).toBe('object');
      if (result.type === 'object') {
        const resultItems = result.value.items as Record<string, unknown>[];
        expect(resultItems[0]).toEqual({ name: 'John', age: 30 });
      }
    });
  });
});
