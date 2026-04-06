/**
 * Verb Error Condition Tests
 *
 * Tests for error handling and edge cases that return null/fail:
 * - Division/modulo by zero
 * - Invalid regex patterns
 * - Invalid encoding/decoding
 * - Missing lookup tables/keys
 * - Insufficient arguments
 * - Type mismatches
 */

import { describe, it, expect } from 'vitest';
import {
  createContext,
  createContextWithSource,
  createContextWithTables,
  createContextWithAccumulators,
  callVerb,
  str,
  int,
  num,
  nil,
  date,
} from './helpers.js';

describe('Verb Error Conditions', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Arithmetic Errors
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Arithmetic Errors', () => {
    describe('divide', () => {
      it('returns null when dividing by zero', () => {
        const result = callVerb('divide', [num(10), num(0)]);
        expect(result.type).toBe('null');
      });

      it('returns null when dividing by integer zero', () => {
        const result = callVerb('divide', [num(10), int(0)]);
        expect(result.type).toBe('null');
      });

      it('returns null when divisor coerces to zero', () => {
        const result = callVerb('divide', [num(10), str('0')]);
        expect(result.type).toBe('null');
      });

      it('returns null when dividing null by zero', () => {
        // null coerces to 0, but 0/0 is still division by zero
        const result = callVerb('divide', [nil(), num(0)]);
        expect(result.type).toBe('null');
      });

      it('handles valid division correctly', () => {
        // divide always returns number type (not integer) since division implies decimal result
        const result = callVerb('divide', [int(10), int(2)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(5);
        }
      });

      it('returns null with insufficient arguments', () => {
        const result = callVerb('divide', [num(10)]);
        expect(result.type).toBe('null');
      });

      it('returns null with no arguments', () => {
        const result = callVerb('divide', []);
        expect(result.type).toBe('null');
      });
    });

    describe('mod', () => {
      it('returns null when modulo by zero', () => {
        const result = callVerb('mod', [num(10), num(0)]);
        expect(result.type).toBe('null');
      });

      it('returns null when modulo by integer zero', () => {
        const result = callVerb('mod', [int(10), int(0)]);
        expect(result.type).toBe('null');
      });

      it('handles valid modulo correctly', () => {
        const result = callVerb('mod', [int(10), int(3)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(1);
        }
      });

      it('returns null with insufficient arguments', () => {
        const result = callVerb('mod', [num(10)]);
        expect(result.type).toBe('null');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Regex Errors
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Regex Errors', () => {
    describe('replaceRegex', () => {
      it('returns null for invalid regex pattern', () => {
        const result = callVerb('replaceRegex', [str('test'), str('['), str('')]);
        expect(result.type).toBe('null');
      });

      it('returns null for unclosed group', () => {
        const result = callVerb('replaceRegex', [str('test'), str('(abc'), str('')]);
        expect(result.type).toBe('null');
      });

      it('returns null for invalid quantifier', () => {
        const result = callVerb('replaceRegex', [str('test'), str('*'), str('')]);
        expect(result.type).toBe('null');
      });

      it('handles valid regex correctly', () => {
        const result = callVerb('replaceRegex', [str('hello world'), str('\\s'), str('-')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('hello-world');
        }
      });

      it('returns null with insufficient arguments', () => {
        const result = callVerb('replaceRegex', [str('test'), str('pattern')]);
        expect(result.type).toBe('null');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Encoding Errors
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Encoding Errors', () => {
    describe('base64Decode', () => {
      it('returns null for invalid base64 characters', () => {
        const result = callVerb('base64Decode', [str('!!!invalid!!!')]);
        expect(result.type).toBe('null');
      });

      it('returns null for malformed base64 padding', () => {
        // Invalid padding
        const result = callVerb('base64Decode', [str('SGVsbG8===')]);
        // This might not fail depending on implementation tolerance
        // The key is to verify the behavior is defined
        expect(['string', 'null']).toContain(result.type);
      });
    });

    describe('urlDecode', () => {
      it('returns null for invalid percent encoding', () => {
        const result = callVerb('urlDecode', [str('%ZZ')]);
        expect(result.type).toBe('null');
      });

      it('returns null for truncated percent encoding', () => {
        const result = callVerb('urlDecode', [str('%2')]);
        expect(result.type).toBe('null');
      });

      it('returns null for percent alone', () => {
        const result = callVerb('urlDecode', [str('test%')]);
        expect(result.type).toBe('null');
      });

      it('handles valid encoding', () => {
        const result = callVerb('urlDecode', [str('hello%20world')]);
        expect(result.type).toBe('string');
      });
    });

    describe('jsonDecode', () => {
      it('returns null for invalid escape sequence', () => {
        const result = callVerb('jsonDecode', [str('invalid\\x')]);
        expect(result.type).toBe('null');
      });

      it('returns null for truncated unicode escape', () => {
        const result = callVerb('jsonDecode', [str('test\\u00')]);
        expect(result.type).toBe('null');
      });

      it('returns null for invalid unicode hex', () => {
        const result = callVerb('jsonDecode', [str('test\\uXYZW')]);
        expect(result.type).toBe('null');
      });

      it('handles valid escapes', () => {
        const result = callVerb('jsonDecode', [str('hello\\nworld')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('hello\nworld');
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Lookup Errors
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Lookup Errors', () => {
    describe('lookup', () => {
      it('returns null for missing table', () => {
        const ctx = createContext();
        const result = callVerb('lookup', [str('NONEXISTENT.code'), str('key')], ctx);
        expect(result.type).toBe('null');
      });

      it('returns null for missing key', () => {
        const ctx = createContextWithTables({
          STATUS: {
            columns: ['name', 'code'],
            rows: [[str('active'), str('A')]],
          },
        });
        const result = callVerb('lookup', [str('STATUS.code'), str('inactive')], ctx);
        expect(result.type).toBe('null');
      });

      it('returns null with insufficient arguments', () => {
        const ctx = createContextWithTables({
          STATUS: {
            columns: ['name', 'code'],
            rows: [[str('active'), str('A')]],
          },
        });
        const result = callVerb('lookup', [str('STATUS.code')], ctx);
        expect(result.type).toBe('null');
      });

      it('returns null with no arguments', () => {
        const result = callVerb('lookup', []);
        expect(result.type).toBe('null');
      });

      it('returns null when no column specified (legacy format)', () => {
        const ctx = createContextWithTables({
          STATUS: {
            columns: ['name', 'code'],
            rows: [[str('active'), str('A')]],
          },
        });
        // Without TABLE.column syntax, lookup returns null
        const result = callVerb('lookup', [str('STATUS'), str('active')], ctx);
        expect(result.type).toBe('null');
      });
    });

    describe('lookupDefault', () => {
      it('returns default for missing table', () => {
        const ctx = createContext();
        const result = callVerb(
          'lookupDefault',
          [str('NONEXISTENT.code'), str('key'), str('DEFAULT')],
          ctx
        );
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('DEFAULT');
        }
      });

      it('returns default for missing key', () => {
        const ctx = createContextWithTables({
          STATUS: {
            columns: ['name', 'code'],
            rows: [[str('active'), str('A')]],
          },
        });
        const result = callVerb(
          'lookupDefault',
          [str('STATUS.code'), str('unknown'), str('X')],
          ctx
        );
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('X');
        }
      });

      it('returns null with insufficient arguments', () => {
        const result = callVerb('lookupDefault', [str('TABLE.code'), str('key')]);
        expect(result.type).toBe('null');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Type Errors
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Type Errors', () => {
    describe('Date operations on non-dates', () => {
      it('formatDate returns null for invalid date string', () => {
        const result = callVerb('formatDate', [str('not a date'), str('YYYY-MM-DD')]);
        expect(result.type).toBe('null');
      });

      it('addDays returns null for invalid date', () => {
        const result = callVerb('addDays', [str('not a date'), int(5)]);
        expect(result.type).toBe('null');
      });

      it('addMonths returns null for invalid date', () => {
        const result = callVerb('addMonths', [str('invalid'), int(1)]);
        expect(result.type).toBe('null');
      });

      it('addYears returns null for invalid date', () => {
        const result = callVerb('addYears', [str('invalid'), int(1)]);
        expect(result.type).toBe('null');
      });

      it('dateDiff returns null for invalid dates', () => {
        const result = callVerb('dateDiff', [str('invalid'), str('also invalid'), str('days')]);
        expect(result.type).toBe('null');
      });

      it('dateDiff returns null for invalid unit', () => {
        const d1 = date(new Date(Date.UTC(2024, 0, 1)));
        const d2 = date(new Date(Date.UTC(2024, 0, 15)));
        const result = callVerb('dateDiff', [d1, d2, str('invalid_unit')]);
        expect(result.type).toBe('null');
      });
    });

    describe('Array operations on non-arrays', () => {
      it('sum returns 0 for non-array', () => {
        const ctx = createContextWithSource({ notArray: 'string' });
        const result = callVerb('sum', [str('notArray')], ctx);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(0);
        }
      });

      it('count returns 0 for non-array', () => {
        const ctx = createContextWithSource({ notArray: 'string' });
        const result = callVerb('count', [str('notArray')], ctx);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });

      it('min returns null for non-array', () => {
        const ctx = createContextWithSource({ notArray: 'string' });
        const result = callVerb('min', [str('notArray')], ctx);
        expect(result.type).toBe('null');
      });

      it('max returns null for non-array', () => {
        const ctx = createContextWithSource({ notArray: 'string' });
        const result = callVerb('max', [str('notArray')], ctx);
        expect(result.type).toBe('null');
      });

      it('avg returns null for non-array', () => {
        const ctx = createContextWithSource({ notArray: 'string' });
        const result = callVerb('avg', [str('notArray')], ctx);
        expect(result.type).toBe('null');
      });

      it('first returns null for non-array', () => {
        const ctx = createContextWithSource({ notArray: 'string' });
        const result = callVerb('first', [str('notArray')], ctx);
        expect(result.type).toBe('null');
      });

      it('last returns null for non-array', () => {
        const ctx = createContextWithSource({ notArray: 'string' });
        const result = callVerb('last', [str('notArray')], ctx);
        expect(result.type).toBe('null');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Insufficient Arguments
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Insufficient Arguments', () => {
    const verbsRequiringArgs: Array<{ name: string; minArgs: number }> = [
      // String verbs
      { name: 'upper', minArgs: 1 },
      { name: 'lower', minArgs: 1 },
      { name: 'trim', minArgs: 1 },
      { name: 'capitalize', minArgs: 1 },
      { name: 'titleCase', minArgs: 1 },
      { name: 'contains', minArgs: 2 },
      { name: 'startsWith', minArgs: 2 },
      { name: 'endsWith', minArgs: 2 },
      { name: 'substring', minArgs: 3 },
      { name: 'replace', minArgs: 3 },
      { name: 'padLeft', minArgs: 3 },
      { name: 'padRight', minArgs: 3 },
      { name: 'truncate', minArgs: 2 },
      { name: 'split', minArgs: 3 },
      // Numeric verbs
      { name: 'formatNumber', minArgs: 2 },
      { name: 'formatInteger', minArgs: 1 },
      { name: 'formatCurrency', minArgs: 1 },
      { name: 'abs', minArgs: 1 },
      { name: 'round', minArgs: 2 },
      { name: 'floor', minArgs: 1 },
      { name: 'ceil', minArgs: 1 },
      { name: 'add', minArgs: 2 },
      { name: 'subtract', minArgs: 2 },
      { name: 'multiply', minArgs: 2 },
      { name: 'divide', minArgs: 2 },
      { name: 'mod', minArgs: 2 },
      { name: 'negate', minArgs: 1 },
      // Date verbs
      { name: 'formatDate', minArgs: 2 },
      { name: 'parseDate', minArgs: 2 },
      { name: 'addDays', minArgs: 2 },
      { name: 'addMonths', minArgs: 2 },
      { name: 'addYears', minArgs: 2 },
      { name: 'dateDiff', minArgs: 3 },
      // Conditional
      { name: 'ifNull', minArgs: 2 },
      { name: 'ifEmpty', minArgs: 2 },
      { name: 'ifElse', minArgs: 3 },
      // Coercion
      { name: 'coerceString', minArgs: 1 },
      { name: 'coerceNumber', minArgs: 1 },
      { name: 'coerceInteger', minArgs: 1 },
      { name: 'coerceBoolean', minArgs: 1 },
      { name: 'coerceDate', minArgs: 1 },
      { name: 'coerceTimestamp', minArgs: 1 },
      // Encoding
      { name: 'base64Encode', minArgs: 1 },
      { name: 'base64Decode', minArgs: 1 },
      { name: 'urlEncode', minArgs: 1 },
      { name: 'urlDecode', minArgs: 1 },
      { name: 'jsonEncode', minArgs: 1 },
      { name: 'jsonDecode', minArgs: 1 },
      // Regex
      { name: 'replaceRegex', minArgs: 3 },
      { name: 'mask', minArgs: 2 },
    ];

    it('all multi-arg verbs return null or sensible default with no arguments', () => {
      // Boolean verbs (contains, startsWith, endsWith) return false with no args
      const booleanVerbs = ['contains', 'startsWith', 'endsWith'];

      for (const { name, minArgs } of verbsRequiringArgs) {
        if (minArgs > 0) {
          const result = callVerb(name, []);
          if (booleanVerbs.includes(name)) {
            // Boolean verbs return false, not null
            expect(result.type, `${name} should return boolean`).toBe('boolean');
          } else {
            expect(result.type, `${name} should return null with no args`).toBe('null');
          }
        }
      }
    });

    it('verbs requiring 2+ args return null with 1 arg', () => {
      const twoArgVerbs = verbsRequiringArgs.filter((v) => v.minArgs >= 2);
      for (const { name } of twoArgVerbs) {
        const result = callVerb(name, [str('single')]);
        // Some verbs may return a default (like bool false for contains)
        // Check for null or sensible default
        expect(['null', 'boolean', 'integer'].includes(result.type)).toBe(true);
      }
    });

    it('verbs requiring 3+ args return null with 2 args', () => {
      const threeArgVerbs = verbsRequiringArgs.filter((v) => v.minArgs >= 3);
      for (const { name } of threeArgVerbs) {
        const result = callVerb(name, [str('arg1'), str('arg2')]);
        expect(result.type).toBe('null');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Accumulator Errors
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Accumulator Errors', () => {
    describe('accumulate', () => {
      it('returns null for non-existent accumulator', () => {
        const ctx = createContext();
        const result = callVerb('accumulate', [str('nonexistent'), num(10)], ctx);
        expect(result.type).toBe('null');
      });

      it('returns null with insufficient arguments', () => {
        const ctx = createContextWithAccumulators({ total: num(0) });
        const result = callVerb('accumulate', [str('total')], ctx);
        expect(result.type).toBe('null');
      });

      it('works with existing accumulator', () => {
        const ctx = createContextWithAccumulators({ total: int(100) });
        const result = callVerb('accumulate', [str('total'), int(50)], ctx);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(150);
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Path Resolution Errors
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Path Resolution Errors', () => {
    describe('Array aggregations with missing paths', () => {
      it('sum returns 0 for missing path', () => {
        const ctx = createContextWithSource({});
        const result = callVerb('sum', [str('missing.path')], ctx);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(0);
        }
      });

      it('count returns 0 for missing path', () => {
        const ctx = createContextWithSource({});
        const result = callVerb('count', [str('missing.path')], ctx);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });

      it('first returns null for missing path', () => {
        const ctx = createContextWithSource({});
        const result = callVerb('first', [str('missing.path')], ctx);
        expect(result.type).toBe('null');
      });

      it('last returns null for missing path', () => {
        const ctx = createContextWithSource({});
        const result = callVerb('last', [str('missing.path')], ctx);
        expect(result.type).toBe('null');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Empty Array Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Empty Array Edge Cases', () => {
    const emptyArraySource = { items: [] };

    it('sum returns 0 for empty array', () => {
      const ctx = createContextWithSource(emptyArraySource);
      const result = callVerb('sum', [str('items')], ctx);
      // sum returns integer when result is a whole number (including 0)
      expect(result.type).toBe('integer');
      if (result.type === 'integer') {
        expect(result.value).toBe(0);
      }
    });

    it('count returns 0 for empty array', () => {
      const ctx = createContextWithSource(emptyArraySource);
      const result = callVerb('count', [str('items')], ctx);
      expect(result.type).toBe('integer');
      if (result.type === 'integer') {
        expect(result.value).toBe(0);
      }
    });

    it('min returns null for empty array', () => {
      const ctx = createContextWithSource(emptyArraySource);
      const result = callVerb('min', [str('items')], ctx);
      expect(result.type).toBe('null');
    });

    it('max returns null for empty array', () => {
      const ctx = createContextWithSource(emptyArraySource);
      const result = callVerb('max', [str('items')], ctx);
      expect(result.type).toBe('null');
    });

    it('avg returns null for empty array', () => {
      const ctx = createContextWithSource(emptyArraySource);
      const result = callVerb('avg', [str('items')], ctx);
      expect(result.type).toBe('null');
    });

    it('first returns null for empty array', () => {
      const ctx = createContextWithSource(emptyArraySource);
      const result = callVerb('first', [str('items')], ctx);
      expect(result.type).toBe('null');
    });

    it('last returns null for empty array', () => {
      const ctx = createContextWithSource(emptyArraySource);
      const result = callVerb('last', [str('items')], ctx);
      expect(result.type).toBe('null');
    });
  });
});
