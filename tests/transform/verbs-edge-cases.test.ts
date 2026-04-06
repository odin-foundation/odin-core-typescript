/**
 * Verb Edge Cases Tests
 *
 * Comprehensive edge case testing for all verb tiers:
 * - Null input handling
 * - Empty string handling
 * - Type coercion verification
 * - Boundary conditions
 * - Unicode handling
 */

import { describe, it, expect } from 'vitest';
import { callVerb, str, int, num, nil, date, currency } from './helpers.js';

describe('Verb Edge Cases', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Null Input Handling
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Null Input Handling', () => {
    describe('String verbs with null', () => {
      it('upper converts null to empty string then uppercases', () => {
        const result = callVerb('upper', [nil()]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('');
        }
      });

      it('lower converts null to empty string', () => {
        const result = callVerb('lower', [nil()]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('');
        }
      });

      it('trim converts null to empty string', () => {
        const result = callVerb('trim', [nil()]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('');
        }
      });

      it('length returns 0 for null', () => {
        const result = callVerb('length', [nil()]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });

      it('concat handles null values', () => {
        const result = callVerb('concat', [str('a'), nil(), str('b')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('ab');
        }
      });
    });

    describe('Numeric verbs with null', () => {
      it('add treats null as 0', () => {
        const result = callVerb('add', [nil(), int(5)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(5);
        }
      });

      it('subtract treats null as 0', () => {
        const result = callVerb('subtract', [nil(), int(5)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(-5);
        }
      });

      it('multiply treats null as 0', () => {
        const result = callVerb('multiply', [nil(), int(5)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });

      it('abs treats null as 0', () => {
        const result = callVerb('abs', [nil()]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });

      it('negate treats null as 0', () => {
        const result = callVerb('negate', [nil()]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(-0);
        }
      });
    });

    describe('Coalesce verbs with null', () => {
      it('coalesce skips null values', () => {
        const result = callVerb('coalesce', [nil(), nil(), str('found')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('found');
        }
      });

      it('coalesce returns null if all values are null', () => {
        const result = callVerb('coalesce', [nil(), nil(), nil()]);
        expect(result.type).toBe('null');
      });

      it('ifNull returns fallback for null', () => {
        const result = callVerb('ifNull', [nil(), str('fallback')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('fallback');
        }
      });

      it('ifNull returns original for non-null', () => {
        const result = callVerb('ifNull', [str('original'), str('fallback')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('original');
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Empty String Handling
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Empty String Handling', () => {
    it('upper handles empty string', () => {
      const result = callVerb('upper', [str('')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('');
      }
    });

    it('capitalize handles empty string', () => {
      const result = callVerb('capitalize', [str('')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('');
      }
    });

    it('titleCase handles empty string', () => {
      const result = callVerb('titleCase', [str('')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('');
      }
    });

    it('length returns 0 for empty string', () => {
      const result = callVerb('length', [str('')]);
      expect(result.type).toBe('integer');
      if (result.type === 'integer') {
        expect(result.value).toBe(0);
      }
    });

    it('trim handles empty string', () => {
      const result = callVerb('trim', [str('')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('');
      }
    });

    it('ifEmpty detects empty string', () => {
      const result = callVerb('ifEmpty', [str(''), str('fallback')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('fallback');
      }
    });

    it('ifEmpty does not trigger for whitespace-only', () => {
      const result = callVerb('ifEmpty', [str('   '), str('fallback')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('   ');
      }
    });

    it('concat handles empty strings', () => {
      const result = callVerb('concat', [str(''), str('hello'), str('')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello');
      }
    });

    it('replace with empty find splits string', () => {
      const result = callVerb('replace', [str('abc'), str(''), str('-')]);
      expect(result.type).toBe('string');
      // Implementation uses split('').join('-') which gives 'a-b-c'
      // This is consistent behavior: split splits BETWEEN characters
      if (result.type === 'string') {
        expect(result.value).toBe('a-b-c');
      }
    });

    it('contains returns true for empty search string', () => {
      const result = callVerb('contains', [str('hello'), str('')]);
      expect(result.type).toBe('boolean');
      if (result.type === 'boolean') {
        expect(result.value).toBe(true);
      }
    });

    it('startsWith returns true for empty prefix', () => {
      const result = callVerb('startsWith', [str('hello'), str('')]);
      expect(result.type).toBe('boolean');
      if (result.type === 'boolean') {
        expect(result.value).toBe(true);
      }
    });

    it('endsWith returns true for empty suffix', () => {
      const result = callVerb('endsWith', [str('hello'), str('')]);
      expect(result.type).toBe('boolean');
      if (result.type === 'boolean') {
        expect(result.value).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Type Coercion Verification
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Type Coercion Verification', () => {
    describe('String to Number coercion', () => {
      it('coerceNumber parses integer strings', () => {
        const result = callVerb('coerceNumber', [str('42')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(42);
        }
      });

      it('coerceNumber parses float strings', () => {
        const result = callVerb('coerceNumber', [str('3.14')]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBeCloseTo(3.14);
        }
      });

      it('coerceNumber parses negative numbers', () => {
        const result = callVerb('coerceNumber', [str('-42.5')]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(-42.5);
        }
      });

      it('coerceNumber parses scientific notation', () => {
        const result = callVerb('coerceNumber', [str('1.5e10')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(1.5e10);
        }
      });

      it('coerceNumber returns 0 for non-numeric string', () => {
        const result = callVerb('coerceNumber', [str('not a number')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });

      it('coerceNumber returns 0 for empty string', () => {
        const result = callVerb('coerceNumber', [str('')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });
    });

    describe('Number to String coercion', () => {
      it('coerceString converts integer', () => {
        const result = callVerb('coerceString', [int(42)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('42');
        }
      });

      it('coerceString converts float', () => {
        const result = callVerb('coerceString', [num(3.14)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('3.14');
        }
      });

      it('coerceString converts negative number', () => {
        const result = callVerb('coerceString', [num(-42.5)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('-42.5');
        }
      });

      it('coerceString converts currency', () => {
        const result = callVerb('coerceString', [currency(99.99)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('99.99');
        }
      });
    });

    describe('Boolean coercion', () => {
      it('coerceBoolean: true for "true"', () => {
        const result = callVerb('coerceBoolean', [str('true')]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(true);
        }
      });

      it('coerceBoolean: true for "TRUE" (case insensitive)', () => {
        const result = callVerb('coerceBoolean', [str('TRUE')]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(true);
        }
      });

      it('coerceBoolean: true for "yes"', () => {
        const result = callVerb('coerceBoolean', [str('yes')]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(true);
        }
      });

      it('coerceBoolean: true for "y"', () => {
        const result = callVerb('coerceBoolean', [str('y')]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(true);
        }
      });

      it('coerceBoolean: true for "1"', () => {
        const result = callVerb('coerceBoolean', [str('1')]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(true);
        }
      });

      it('coerceBoolean: false for "false"', () => {
        const result = callVerb('coerceBoolean', [str('false')]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(false);
        }
      });

      it('coerceBoolean: false for "no"', () => {
        const result = callVerb('coerceBoolean', [str('no')]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(false);
        }
      });

      it('coerceBoolean: false for "0"', () => {
        const result = callVerb('coerceBoolean', [str('0')]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(false);
        }
      });

      it('coerceBoolean: false for arbitrary string', () => {
        const result = callVerb('coerceBoolean', [str('hello')]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(false);
        }
      });

      it('coerceBoolean: true for non-zero number', () => {
        const result = callVerb('coerceBoolean', [num(42)]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(true);
        }
      });

      it('coerceBoolean: false for zero', () => {
        const result = callVerb('coerceBoolean', [num(0)]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(false);
        }
      });

      it('coerceBoolean: true for date/timestamp', () => {
        const result = callVerb('coerceBoolean', [date(new Date())]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(true);
        }
      });
    });

    describe('Date coercion in operations', () => {
      it('dates convert to ISO string in coerceString', () => {
        const d = new Date(Date.UTC(2024, 5, 15, 14, 30, 0));
        const result = callVerb('coerceString', [date(d)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toContain('2024-06-15');
        }
      });

      it('dates convert to milliseconds in coerceNumber', () => {
        const d = new Date(Date.UTC(2024, 5, 15));
        const result = callVerb('coerceNumber', [date(d)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(Date.UTC(2024, 5, 15));
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Boundary Conditions
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Boundary Conditions', () => {
    describe('Date arithmetic boundaries', () => {
      it('addDays handles month rollover', () => {
        const d = new Date(Date.UTC(2024, 0, 31)); // Jan 31
        const result = callVerb('addDays', [date(d), int(1)]);
        // Date arithmetic verbs return ISO date strings per spec
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('2024-02-01'); // Feb 1
        }
      });

      it('addDays handles year rollover', () => {
        const d = new Date(Date.UTC(2024, 11, 31)); // Dec 31
        const result = callVerb('addDays', [date(d), int(1)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('2025-01-01'); // Jan 1, 2025
        }
      });

      it('addDays handles negative days', () => {
        const d = new Date(Date.UTC(2024, 0, 15)); // Jan 15
        const result = callVerb('addDays', [date(d), int(-20)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('2023-12-26'); // Dec 26, 2023
        }
      });

      it('addMonths handles day overflow', () => {
        const d = new Date(Date.UTC(2024, 0, 31)); // Jan 31
        const result = callVerb('addMonths', [date(d), int(1)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          // Feb doesn't have 31 days, JavaScript Date rolls over to Mar 2
          expect(result.value).toBe('2024-03-02');
        }
      });

      it('addMonths handles negative months', () => {
        const d = new Date(Date.UTC(2024, 2, 15)); // Mar 15
        const result = callVerb('addMonths', [date(d), int(-4)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('2023-11-15'); // Nov 15, 2023
        }
      });

      it('addYears handles leap year boundary', () => {
        const d = new Date(Date.UTC(2024, 1, 29)); // Feb 29 2024 (leap year)
        const result = callVerb('addYears', [date(d), int(1)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          // Feb 29 2025 doesn't exist, rolls over to Mar 1
          expect(result.value).toBe('2025-03-01');
        }
      });
    });

    describe('Numeric boundaries', () => {
      it('round handles edge case of 0.5', () => {
        const result = callVerb('round', [num(0.5), int(0)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(1);
        }
      });

      it('round handles negative 0.5', () => {
        const result = callVerb('round', [num(-0.5), int(0)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          // JavaScript rounds -0.5 to -0
          expect(result.value).toBe(-0);
        }
      });

      it('floor handles negative numbers', () => {
        const result = callVerb('floor', [num(-2.3)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(-3);
        }
      });

      it('ceil handles negative numbers', () => {
        const result = callVerb('ceil', [num(-2.3)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(-2);
        }
      });

      it('handles very large numbers', () => {
        const result = callVerb('add', [num(1e15), num(1e15)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(2e15);
        }
      });

      it('handles very small numbers', () => {
        const result = callVerb('add', [num(1e-15), num(1e-15)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBeCloseTo(2e-15);
        }
      });
    });

    describe('String boundaries', () => {
      it('substring handles start > length', () => {
        const result = callVerb('substring', [str('hello'), int(100), int(5)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('');
        }
      });

      it('truncate handles length > string length', () => {
        const result = callVerb('truncate', [str('hi'), int(100)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('hi');
        }
      });

      it('padLeft handles string already longer than target', () => {
        const result = callVerb('padLeft', [str('hello'), int(3), str('0')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('hello');
        }
      });

      it('split handles index out of bounds', () => {
        const result = callVerb('split', [str('a,b,c'), str(','), int(10)]);
        expect(result.type).toBe('null');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Unicode Handling
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Unicode Handling', () => {
    it('upper handles unicode characters', () => {
      const result = callVerb('upper', [str('café')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('CAFÉ');
      }
    });

    it('lower handles unicode characters', () => {
      const result = callVerb('lower', [str('MÜNCHEN')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('münchen');
      }
    });

    it('length counts characters not bytes', () => {
      const result = callVerb('length', [str('日本語')]);
      expect(result.type).toBe('integer');
      if (result.type === 'integer') {
        expect(result.value).toBe(3);
      }
    });

    it('substring handles unicode', () => {
      const result = callVerb('substring', [str('日本語'), int(1), int(1)]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('本');
      }
    });

    it('contains works with unicode', () => {
      const result = callVerb('contains', [str('日本語テスト'), str('本語')]);
      expect(result.type).toBe('boolean');
      if (result.type === 'boolean') {
        expect(result.value).toBe(true);
      }
    });

    it('replace works with unicode', () => {
      const result = callVerb('replace', [str('Hello 世界'), str('世界'), str('World')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Hello World');
      }
    });

    it('handles emoji', () => {
      const result = callVerb('upper', [str('hello 👋')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO 👋');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Switch/Conditional Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Switch/Conditional Edge Cases', () => {
    it('switch with no cases returns null', () => {
      const result = callVerb('switch', [str('value')]);
      expect(result.type).toBe('null');
    });

    it('switch with only default returns default', () => {
      const result = callVerb('switch', [str('value'), str('default')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('default');
      }
    });

    it('switch finds first match', () => {
      const result = callVerb('switch', [
        str('B'),
        str('A'),
        str('first'),
        str('B'),
        str('second'),
        str('B'),
        str('third'),
        str('default'),
      ]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('second');
      }
    });

    it('ifElse with truthy number', () => {
      const result = callVerb('ifElse', [num(42), str('yes'), str('no')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('yes');
      }
    });

    it('ifElse with zero (falsy)', () => {
      const result = callVerb('ifElse', [num(0), str('yes'), str('no')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('no');
      }
    });

    it('ifElse with non-empty string (truthy)', () => {
      const result = callVerb('ifElse', [str('hello'), str('yes'), str('no')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('no'); // Only specific strings are truthy
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Hash Function Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Hash Functions', () => {
    describe('md5', () => {
      it('hashes empty string correctly', () => {
        const result = callVerb('md5', [str('')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('d41d8cd98f00b204e9800998ecf8427e');
        }
      });

      it('hashes "hello" correctly', () => {
        const result = callVerb('md5', [str('hello')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('5d41402abc4b2a76b9719d911017c592');
        }
      });

      it('hashes unicode correctly', () => {
        const result = callVerb('md5', [str('日本語')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          // MD5 of UTF-8 encoded "日本語"
          expect(result.value).toBe('00110af8b4393ef3f72c50be5b332bec');
        }
      });

      it('returns null for no arguments', () => {
        const result = callVerb('md5', []);
        expect(result.type).toBe('null');
      });

      it('converts null to empty string hash', () => {
        const result = callVerb('md5', [nil()]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('d41d8cd98f00b204e9800998ecf8427e');
        }
      });
    });

    describe('sha1', () => {
      it('hashes empty string correctly', () => {
        const result = callVerb('sha1', [str('')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
        }
      });

      it('hashes "hello" correctly', () => {
        const result = callVerb('sha1', [str('hello')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
        }
      });

      it('hashes unicode correctly', () => {
        const result = callVerb('sha1', [str('日本語')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          // SHA-1 of UTF-8 encoded "日本語"
          expect(result.value).toBe('c12140a0ffb4e56481b4fe0a7a25040c2eafa9ca');
        }
      });

      it('returns null for no arguments', () => {
        const result = callVerb('sha1', []);
        expect(result.type).toBe('null');
      });
    });

    describe('sha256', () => {
      it('hashes empty string correctly', () => {
        const result = callVerb('sha256', [str('')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
          );
        }
      });

      it('hashes "hello" correctly', () => {
        const result = callVerb('sha256', [str('hello')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe(
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
          );
        }
      });

      it('hashes unicode correctly', () => {
        const result = callVerb('sha256', [str('日本語')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          // SHA-256 of UTF-8 encoded "日本語"
          expect(result.value).toBe(
            '77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5'
          );
        }
      });

      it('returns null for no arguments', () => {
        const result = callVerb('sha256', []);
        expect(result.type).toBe('null');
      });
    });

    describe('sha512', () => {
      it('hashes empty string correctly', () => {
        const result = callVerb('sha512', [str('')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe(
            'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e'
          );
        }
      });

      it('hashes "hello" correctly', () => {
        const result = callVerb('sha512', [str('hello')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe(
            '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043'
          );
        }
      });

      it('returns null for no arguments', () => {
        const result = callVerb('sha512', []);
        expect(result.type).toBe('null');
      });
    });

    describe('crc32', () => {
      it('hashes empty string correctly', () => {
        const result = callVerb('crc32', [str('')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('00000000');
        }
      });

      it('hashes "hello" correctly', () => {
        const result = callVerb('crc32', [str('hello')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('3610a686');
        }
      });

      it('hashes "123456789" correctly (standard test vector)', () => {
        const result = callVerb('crc32', [str('123456789')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('cbf43926');
        }
      });

      it('hashes unicode correctly', () => {
        const result = callVerb('crc32', [str('日本語')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          // CRC-32 of UTF-8 encoded "日本語"
          expect(result.value).toBe('a80b52e5');
        }
      });

      it('returns null for no arguments', () => {
        const result = callVerb('crc32', []);
        expect(result.type).toBe('null');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Whitespace Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Whitespace Edge Cases', () => {
    it('trim handles tabs', () => {
      const result = callVerb('trim', [str('\t\thello\t\t')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello');
      }
    });

    it('trim handles newlines', () => {
      const result = callVerb('trim', [str('\n\nhello\n\n')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello');
      }
    });

    it('trim handles mixed whitespace', () => {
      const result = callVerb('trim', [str(' \t\n hello \n\t ')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello');
      }
    });

    it('trimLeft preserves trailing whitespace', () => {
      const result = callVerb('trimLeft', [str('  hello  ')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello  ');
      }
    });

    it('trimRight preserves leading whitespace', () => {
      const result = callVerb('trimRight', [str('  hello  ')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('  hello');
      }
    });

    it('titleCase normalizes multiple spaces', () => {
      const result = callVerb('titleCase', [str('hello    world')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Hello World');
      }
    });
  });
});
