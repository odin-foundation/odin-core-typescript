/**
 * Tests for engine-modifiers module.
 *
 * Covers field modifier application including string manipulation,
 * type coercion, defaults, and temporal modifiers.
 */

import { describe, it, expect } from 'vitest';
import {
  registerModifier,
  getModifier,
  applyModifiers,
} from '../../../src/transform/engine-modifiers.js';
import type { TransformValue, TransformContext, Modifier } from '../../../src/types/transform.js';

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

function createContext(): TransformContext {
  return {
    source: {},
    current: undefined,
    aliases: new Map(),
    counters: new Map(),
    accumulators: new Map(),
    tables: new Map(),
    constants: new Map([['DEFAULT_VALUE', str('default')]]),
    sequenceCounters: new Map(),
  };
}

function createResolver(data: Record<string, TransformValue>) {
  return (path: string): TransformValue => {
    // Handle constants ($const.XXX)
    if (path.startsWith('$const.')) {
      const key = path.slice('$const.'.length);
      return data[key] ?? nil();
    }
    return data[path] ?? nil();
  };
}

function mod(name: string, value?: string | number | boolean): Modifier {
  return { name, value };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Modifier Registry', () => {
  describe('registerModifier / getModifier', () => {
    it('registers and retrieves custom modifier', () => {
      registerModifier('testCustom', ({ value }) => value);
      expect(getModifier('testCustom')).toBeDefined();
    });

    it('returns undefined for unregistered modifier', () => {
      expect(getModifier('nonexistent')).toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// String Modifier Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('String Modifiers', () => {
  const context = createContext();
  const resolver = createResolver({});

  describe('upper', () => {
    it('converts string to uppercase', () => {
      const result = applyModifiers(str('hello'), [mod('upper')], context, resolver);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO');
      }
    });

    it('handles mixed case', () => {
      const result = applyModifiers(str('HeLLo WoRLD'), [mod('upper')], context, resolver);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO WORLD');
      }
    });

    it('passes through non-string values', () => {
      const result = applyModifiers(int(42), [mod('upper')], context, resolver);
      expect(result).toEqual(int(42));
    });
  });

  describe('lower', () => {
    it('converts string to lowercase', () => {
      const result = applyModifiers(str('HELLO'), [mod('lower')], context, resolver);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello');
      }
    });

    it('passes through non-string values', () => {
      const result = applyModifiers(int(42), [mod('lower')], context, resolver);
      expect(result).toEqual(int(42));
    });
  });

  describe('trim', () => {
    it('trims whitespace', () => {
      const result = applyModifiers(str('  hello  '), [mod('trim')], context, resolver);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello');
      }
    });

    it('handles already trimmed string', () => {
      const result = applyModifiers(str('hello'), [mod('trim')], context, resolver);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello');
      }
    });
  });

  describe('maxLen', () => {
    it('truncates string to max length', () => {
      const result = applyModifiers(str('hello world'), [mod('maxLen', 5)], context, resolver);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello');
      }
    });

    it('keeps string shorter than max', () => {
      const result = applyModifiers(str('hi'), [mod('maxLen', 10)], context, resolver);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hi');
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Default Modifier Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Default Modifier', () => {
  describe('default', () => {
    it('provides string default for null', () => {
      const context = createContext();
      const resolver = createResolver({});
      const result = applyModifiers(nil(), [mod('default', 'N/A')], context, resolver);
      expect(result).toEqual(str('N/A'));
    });

    it('provides number default for null', () => {
      const context = createContext();
      const resolver = createResolver({});
      const result = applyModifiers(nil(), [mod('default', 0)], context, resolver);
      expect(result).toEqual(num(0));
    });

    it('provides boolean default for null', () => {
      const context = createContext();
      const resolver = createResolver({});
      const result = applyModifiers(nil(), [mod('default', false)], context, resolver);
      expect(result).toEqual(bool(false));
    });

    it('does not override non-null value', () => {
      const context = createContext();
      const resolver = createResolver({});
      const result = applyModifiers(str('existing'), [mod('default', 'N/A')], context, resolver);
      expect(result).toEqual(str('existing'));
    });

    it('resolves path reference for default', () => {
      const context = createContext();
      const resolver = createResolver({ DEFAULT_VALUE: str('from constant') });
      const result = applyModifiers(
        nil(),
        [mod('default', '@$const.DEFAULT_VALUE')],
        context,
        resolver
      );
      expect(result).toEqual(str('from constant'));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type Coercion Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Type Coercion Modifiers', () => {
  const context = createContext();
  const resolver = createResolver({});

  describe('type string', () => {
    it('converts integer to string', () => {
      const result = applyModifiers(int(42), [mod('type', 'string')], context, resolver);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('42');
      }
    });

    it('converts number to string', () => {
      const result = applyModifiers(num(3.14), [mod('type', 'string')], context, resolver);
      expect(result.type).toBe('string');
    });
  });

  describe('type number', () => {
    it('converts string to number', () => {
      const result = applyModifiers(str('3.14'), [mod('type', 'number')], context, resolver);
      expect(result.type).toBe('number');
      if (result.type === 'number') {
        expect(result.value).toBe(3.14);
      }
    });

    it('converts integer to number', () => {
      const result = applyModifiers(int(42), [mod('type', 'number')], context, resolver);
      expect(result.type).toBe('number');
      if (result.type === 'number') {
        expect(result.value).toBe(42);
      }
    });

    it('returns original for invalid string', () => {
      const result = applyModifiers(str('abc'), [mod('type', 'number')], context, resolver);
      expect(result).toEqual(str('abc'));
    });
  });

  describe('type integer', () => {
    it('converts string to integer', () => {
      const result = applyModifiers(str('42'), [mod('type', 'integer')], context, resolver);
      expect(result.type).toBe('integer');
      if (result.type === 'integer') {
        expect(result.value).toBe(42);
      }
    });

    it('truncates number to integer', () => {
      const result = applyModifiers(num(3.99), [mod('type', 'integer')], context, resolver);
      expect(result.type).toBe('integer');
      if (result.type === 'integer') {
        expect(result.value).toBe(3);
      }
    });

    it('truncates currency to integer', () => {
      const result = applyModifiers(
        currency(99.99, 2),
        [mod('type', 'integer')],
        context,
        resolver
      );
      expect(result.type).toBe('integer');
      if (result.type === 'integer') {
        expect(result.value).toBe(99);
      }
    });
  });

  describe('type currency', () => {
    it('converts string to currency', () => {
      const result = applyModifiers(str('99.99'), [mod('type', 'currency')], context, resolver);
      expect(result.type).toBe('currency');
      if (result.type === 'currency') {
        expect(result.value).toBe(99.99);
        expect(result.decimalPlaces).toBe(2);
      }
    });

    it('converts number to currency', () => {
      const result = applyModifiers(num(100), [mod('type', 'currency')], context, resolver);
      expect(result.type).toBe('currency');
    });
  });

  describe('type boolean', () => {
    it('converts "true" string to true', () => {
      const result = applyModifiers(str('true'), [mod('type', 'boolean')], context, resolver);
      expect(result.type).toBe('boolean');
      if (result.type === 'boolean') {
        expect(result.value).toBe(true);
      }
    });

    it('converts "1" string to true', () => {
      const result = applyModifiers(str('1'), [mod('type', 'boolean')], context, resolver);
      expect(result.type).toBe('boolean');
      if (result.type === 'boolean') {
        expect(result.value).toBe(true);
      }
    });

    it('converts other strings to false', () => {
      const result = applyModifiers(str('false'), [mod('type', 'boolean')], context, resolver);
      expect(result.type).toBe('boolean');
      if (result.type === 'boolean') {
        expect(result.value).toBe(false);
      }
    });
  });

  describe('type reference', () => {
    it('converts string to reference', () => {
      const result = applyModifiers(
        str('customer.name'),
        [mod('type', 'reference')],
        context,
        resolver
      );
      expect(result.type).toBe('reference');
      if (result.type === 'reference') {
        expect(result.path).toBe('customer.name');
      }
    });
  });

  describe('type binary', () => {
    it('converts base64 string to binary', () => {
      const result = applyModifiers(str('SGVsbG8='), [mod('type', 'binary')], context, resolver);
      expect(result.type).toBe('binary');
      if (result.type === 'binary') {
        expect(Array.from(result.data)).toEqual([72, 101, 108, 108, 111]);
      }
    });

    it('converts base64 with algorithm to binary', () => {
      const result = applyModifiers(
        str('sha256:SGVsbG8='),
        [mod('type', 'binary')],
        context,
        resolver
      );
      expect(result.type).toBe('binary');
      if (result.type === 'binary') {
        expect(result.algorithm).toBe('sha256');
        expect(Array.from(result.data)).toEqual([72, 101, 108, 108, 111]);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Decimals Modifier Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Decimals Modifier', () => {
  const context = createContext();
  const resolver = createResolver({});

  it('changes decimal places on currency', () => {
    const result = applyModifiers(currency(99.99, 2), [mod('decimals', 4)], context, resolver);
    expect(result.type).toBe('currency');
    if (result.type === 'currency') {
      expect(result.decimalPlaces).toBe(4);
    }
  });

  it('does not affect non-currency values', () => {
    const result = applyModifiers(num(99.99), [mod('decimals', 4)], context, resolver);
    expect(result).toEqual(num(99.99));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Temporal Modifier Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Temporal Modifiers', () => {
  const context = createContext();
  const resolver = createResolver({});

  describe('date', () => {
    it('parses ISO string to date', () => {
      const result = applyModifiers(str('2024-01-15'), [mod('date')], context, resolver);
      expect(result.type).toBe('date');
      if (result.type === 'date') {
        expect(result.raw).toBe('2024-01-15');
      }
    });

    it('converts timestamp to date', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = applyModifiers(
        timestamp(date, '2024-01-15T10:30:00Z'),
        [mod('date')],
        context,
        resolver
      );
      expect(result.type).toBe('date');
      if (result.type === 'date') {
        expect(result.raw).toBe('2024-01-15');
      }
    });

    it('returns original for invalid date string', () => {
      const result = applyModifiers(str('not a date'), [mod('date')], context, resolver);
      expect(result).toEqual(str('not a date'));
    });
  });

  describe('timestamp', () => {
    it('parses ISO string to timestamp', () => {
      const result = applyModifiers(
        str('2024-01-15T10:30:00Z'),
        [mod('timestamp')],
        context,
        resolver
      );
      expect(result.type).toBe('timestamp');
    });

    it('converts date to timestamp', () => {
      const date = new Date('2024-01-15');
      const result = applyModifiers(
        dateVal(date, '2024-01-15'),
        [mod('timestamp')],
        context,
        resolver
      );
      expect(result.type).toBe('timestamp');
    });
  });

  describe('time', () => {
    it('extracts time from ISO string', () => {
      const result = applyModifiers(str('2024-01-15T10:30:00Z'), [mod('time')], context, resolver);
      expect(result.type).toBe('time');
      if (result.type === 'time') {
        expect(result.value).toBe('T10:30:00');
      }
    });

    it('converts timestamp to time', () => {
      const date = new Date(Date.UTC(2024, 0, 15, 14, 30, 45));
      const result = applyModifiers(
        timestamp(date, '2024-01-15T14:30:45Z'),
        [mod('time')],
        context,
        resolver
      );
      expect(result.type).toBe('time');
      if (result.type === 'time') {
        expect(result.value).toBe('T14:30:45');
      }
    });
  });

  describe('duration', () => {
    it('converts string to duration', () => {
      const result = applyModifiers(str('P1DT2H30M'), [mod('duration')], context, resolver);
      expect(result.type).toBe('duration');
      if (result.type === 'duration') {
        expect(result.value).toBe('P1DT2H30M');
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyModifiers Integration Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('applyModifiers', () => {
  const context = createContext();
  const resolver = createResolver({});

  it('applies single modifier', () => {
    const result = applyModifiers(str('hello'), [mod('upper')], context, resolver);
    expect(result.type).toBe('string');
    if (result.type === 'string') {
      expect(result.value).toBe('HELLO');
    }
  });

  it('chains multiple modifiers', () => {
    const result = applyModifiers(
      str('  Hello World  '),
      [mod('trim'), mod('upper')],
      context,
      resolver
    );
    expect(result.type).toBe('string');
    if (result.type === 'string') {
      expect(result.value).toBe('HELLO WORLD');
    }
  });

  it('ignores unknown modifiers', () => {
    const result = applyModifiers(
      str('hello'),
      [mod('unknownModifier'), mod('upper')],
      context,
      resolver
    );
    expect(result.type).toBe('string');
    if (result.type === 'string') {
      expect(result.value).toBe('HELLO');
    }
  });

  it('returns value unchanged with empty modifiers', () => {
    const result = applyModifiers(str('hello'), [], context, resolver);
    expect(result).toEqual(str('hello'));
  });

  it('applies modifiers in order', () => {
    // First default, then upper
    const result = applyModifiers(
      nil(),
      [mod('default', 'hello'), mod('upper')],
      context,
      resolver
    );
    expect(result.type).toBe('string');
    if (result.type === 'string') {
      expect(result.value).toBe('HELLO');
    }
  });
});
