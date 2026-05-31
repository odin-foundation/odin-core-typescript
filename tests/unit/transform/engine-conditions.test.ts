/**
 * Tests for engine-conditions module.
 *
 * Covers conditional expression parsing and evaluation.
 */

import { describe, it, expect } from 'vitest';
import {
  parseConditionValue,
  compareConditionValues,
  evaluateCondition,
} from '../../../src/transform/engine-conditions.js';
import type { TransformValue, TransformContext } from '../../../src/types/transform.js';

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

function createContext(source: unknown = {}): TransformContext {
  return {
    source,
    current: undefined,
    aliases: new Map(),
    counters: new Map(),
    accumulators: new Map(),
    tables: new Map(),
    constants: new Map(),
    sequenceCounters: new Map(),
  };
}

function createResolver(data: Record<string, TransformValue>) {
  return (path: string): TransformValue => {
    // Strip leading dot if present
    const cleanPath = path.startsWith('.') ? path.slice(1) : path;
    return data[cleanPath] ?? nil();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// parseConditionValue Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseConditionValue', () => {
  describe('string literals', () => {
    it('parses single-quoted string', () => {
      expect(parseConditionValue("'active'")).toEqual({ type: 'string', value: 'active' });
    });

    it('parses double-quoted string', () => {
      expect(parseConditionValue('"active"')).toEqual({ type: 'string', value: 'active' });
    });

    it('parses empty single-quoted string', () => {
      expect(parseConditionValue("''")).toEqual({ type: 'string', value: '' });
    });

    it('parses empty double-quoted string', () => {
      expect(parseConditionValue('""')).toEqual({ type: 'string', value: '' });
    });

    it('parses string with spaces', () => {
      expect(parseConditionValue("'hello world'")).toEqual({
        type: 'string',
        value: 'hello world',
      });
    });
  });

  describe('boolean literals', () => {
    it('parses true', () => {
      expect(parseConditionValue('true')).toEqual({ type: 'boolean', value: true });
    });

    it('parses false', () => {
      expect(parseConditionValue('false')).toEqual({ type: 'boolean', value: false });
    });

    it('parses TRUE (case insensitive)', () => {
      expect(parseConditionValue('TRUE')).toEqual({ type: 'boolean', value: true });
    });

    it('parses FALSE (case insensitive)', () => {
      expect(parseConditionValue('FALSE')).toEqual({ type: 'boolean', value: false });
    });
  });

  describe('null literals', () => {
    it('parses null', () => {
      expect(parseConditionValue('null')).toEqual({ type: 'null' });
    });

    it('parses nil', () => {
      expect(parseConditionValue('nil')).toEqual({ type: 'null' });
    });

    it('parses NULL (case insensitive)', () => {
      expect(parseConditionValue('NULL')).toEqual({ type: 'null' });
    });
  });

  describe('numeric literals', () => {
    it('parses integer', () => {
      expect(parseConditionValue('42')).toEqual({ type: 'integer', value: 42 });
    });

    it('parses negative integer', () => {
      expect(parseConditionValue('-100')).toEqual({ type: 'integer', value: -100 });
    });

    it('parses zero', () => {
      expect(parseConditionValue('0')).toEqual({ type: 'integer', value: 0 });
    });

    it('parses decimal number', () => {
      expect(parseConditionValue('3.14')).toEqual({ type: 'number', value: 3.14 });
    });

    it('parses negative decimal', () => {
      expect(parseConditionValue('-1.5')).toEqual({ type: 'number', value: -1.5 });
    });
  });

  describe('bare strings', () => {
    it('treats unrecognized text as string', () => {
      expect(parseConditionValue('status')).toEqual({ type: 'string', value: 'status' });
    });

    it('treats unquoted text with numbers as string', () => {
      expect(parseConditionValue('abc123')).toEqual({ type: 'string', value: 'abc123' });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compareConditionValues Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('compareConditionValues', () => {
  describe('equality operators', () => {
    it('= returns true for equal strings', () => {
      expect(compareConditionValues(str('active'), '=', str('active'))).toBe(true);
    });

    it('= returns false for unequal strings', () => {
      expect(compareConditionValues(str('active'), '=', str('inactive'))).toBe(false);
    });

    it('== works same as =', () => {
      expect(compareConditionValues(str('active'), '==', str('active'))).toBe(true);
      expect(compareConditionValues(str('active'), '==', str('inactive'))).toBe(false);
    });

    it('= compares integers', () => {
      expect(compareConditionValues(int(42), '=', int(42))).toBe(true);
      expect(compareConditionValues(int(42), '=', int(100))).toBe(false);
    });

    it('= compares booleans', () => {
      expect(compareConditionValues(bool(true), '=', bool(true))).toBe(true);
      expect(compareConditionValues(bool(true), '=', bool(false))).toBe(false);
    });
  });

  describe('inequality operators', () => {
    it('!= returns true for unequal strings', () => {
      expect(compareConditionValues(str('active'), '!=', str('inactive'))).toBe(true);
    });

    it('!= returns false for equal strings', () => {
      expect(compareConditionValues(str('active'), '!=', str('active'))).toBe(false);
    });

    it('<> works same as !=', () => {
      expect(compareConditionValues(str('active'), '<>', str('inactive'))).toBe(true);
      expect(compareConditionValues(str('active'), '<>', str('active'))).toBe(false);
    });
  });

  describe('less than operators', () => {
    it('< compares integers numerically', () => {
      expect(compareConditionValues(int(50), '<', int(100))).toBe(true);
      expect(compareConditionValues(int(100), '<', int(50))).toBe(false);
      expect(compareConditionValues(int(50), '<', int(50))).toBe(false);
    });

    it('< compares numbers numerically', () => {
      expect(compareConditionValues(num(1.5), '<', num(2.5))).toBe(true);
    });

    it('< compares currency numerically', () => {
      expect(compareConditionValues(currency(50, 2), '<', currency(100, 2))).toBe(true);
    });

    it('< compares strings lexicographically', () => {
      expect(compareConditionValues(str('apple'), '<', str('banana'))).toBe(true);
      expect(compareConditionValues(str('banana'), '<', str('apple'))).toBe(false);
    });

    it('<= includes equal values', () => {
      expect(compareConditionValues(int(50), '<=', int(100))).toBe(true);
      expect(compareConditionValues(int(50), '<=', int(50))).toBe(true);
      expect(compareConditionValues(int(100), '<=', int(50))).toBe(false);
    });
  });

  describe('greater than operators', () => {
    it('> compares integers numerically', () => {
      expect(compareConditionValues(int(100), '>', int(50))).toBe(true);
      expect(compareConditionValues(int(50), '>', int(100))).toBe(false);
      expect(compareConditionValues(int(50), '>', int(50))).toBe(false);
    });

    it('> compares numbers numerically', () => {
      expect(compareConditionValues(num(2.5), '>', num(1.5))).toBe(true);
    });

    it('>= includes equal values', () => {
      expect(compareConditionValues(int(100), '>=', int(50))).toBe(true);
      expect(compareConditionValues(int(50), '>=', int(50))).toBe(true);
      expect(compareConditionValues(int(50), '>=', int(100))).toBe(false);
    });
  });

  describe('numeric string conversion', () => {
    it('compares numeric strings numerically', () => {
      expect(compareConditionValues(str('100'), '>', str('50'))).toBe(true);
      expect(compareConditionValues(str('50'), '<', str('100'))).toBe(true);
    });

    it('falls back to string comparison for non-numeric strings', () => {
      // 'abc' > '50' is true because 'a' > '5' lexicographically
      expect(compareConditionValues(str('abc'), '>', str('50'))).toBe(true);
    });

    it('non-numeric mixed comparison uses string order', () => {
      // '50' < 'abc' because '5' < 'a' lexicographically
      expect(compareConditionValues(str('50'), '<', str('abc'))).toBe(true);
    });
  });

  describe('unknown operator', () => {
    it('returns false for unknown operator', () => {
      expect(compareConditionValues(str('a'), '???', str('b'))).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateCondition Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateCondition', () => {
  describe('comparison expressions', () => {
    it('evaluates string equality with @path', () => {
      const context = createContext();
      const resolver = createResolver({ status: str('active') });
      expect(evaluateCondition("@.status = 'active'", context, resolver)).toBe(true);
    });

    it('evaluates string equality with double quotes', () => {
      const context = createContext();
      const resolver = createResolver({ status: str('active') });
      expect(evaluateCondition('@.status = "active"', context, resolver)).toBe(true);
    });

    it('evaluates string inequality', () => {
      const context = createContext();
      const resolver = createResolver({ status: str('active') });
      expect(evaluateCondition("@.status != 'inactive'", context, resolver)).toBe(true);
    });

    it('evaluates numeric comparison', () => {
      const context = createContext();
      const resolver = createResolver({ amount: int(100) });
      expect(evaluateCondition('@.amount > 50', context, resolver)).toBe(true);
      expect(evaluateCondition('@.amount > 150', context, resolver)).toBe(false);
    });

    it('evaluates boolean equality', () => {
      const context = createContext();
      const resolver = createResolver({ active: bool(true) });
      expect(evaluateCondition('@.active = true', context, resolver)).toBe(true);
      expect(evaluateCondition('@.active = false', context, resolver)).toBe(false);
    });

    it('handles path without @ prefix', () => {
      const context = createContext();
      const resolver = createResolver({ status: str('active') });
      expect(evaluateCondition("status = 'active'", context, resolver)).toBe(true);
    });

    it('handles nested path', () => {
      const context = createContext();
      const resolver = createResolver({ 'customer.status': str('active') });
      expect(evaluateCondition("@.customer.status = 'active'", context, resolver)).toBe(true);
    });
  });

  describe('truthy checks', () => {
    it('returns true for non-empty string', () => {
      const context = createContext();
      const resolver = createResolver({ name: str('John') });
      expect(evaluateCondition('@.name', context, resolver)).toBe(true);
    });

    it('returns false for empty string', () => {
      const context = createContext();
      const resolver = createResolver({ name: str('') });
      expect(evaluateCondition('@.name', context, resolver)).toBe(false);
    });

    it('returns true for non-zero number', () => {
      const context = createContext();
      const resolver = createResolver({ amount: int(100) });
      expect(evaluateCondition('@.amount', context, resolver)).toBe(true);
    });

    it('returns false for zero', () => {
      const context = createContext();
      const resolver = createResolver({ amount: int(0) });
      expect(evaluateCondition('@.amount', context, resolver)).toBe(false);
    });

    it('returns true for true boolean', () => {
      const context = createContext();
      const resolver = createResolver({ isActive: bool(true) });
      expect(evaluateCondition('@.isActive', context, resolver)).toBe(true);
    });

    it('returns false for false boolean', () => {
      const context = createContext();
      const resolver = createResolver({ isActive: bool(false) });
      expect(evaluateCondition('@.isActive', context, resolver)).toBe(false);
    });

    it('returns false for null', () => {
      const context = createContext();
      const resolver = createResolver({ value: nil() });
      expect(evaluateCondition('@.value', context, resolver)).toBe(false);
    });

    it('handles path without @ prefix for truthy check', () => {
      const context = createContext();
      const resolver = createResolver({ isActive: bool(true) });
      expect(evaluateCondition('isActive', context, resolver)).toBe(true);
    });
  });

  describe('whitespace handling', () => {
    it('trims condition', () => {
      const context = createContext();
      const resolver = createResolver({ status: str('active') });
      expect(evaluateCondition("  @.status = 'active'  ", context, resolver)).toBe(true);
    });

    it('handles extra whitespace around operator', () => {
      const context = createContext();
      const resolver = createResolver({ status: str('active') });
      expect(evaluateCondition("@.status   =   'active'", context, resolver)).toBe(true);
    });
  });
});
