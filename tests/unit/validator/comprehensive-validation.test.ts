/**
 * Comprehensive Validation Tests for ODIN SDK
 *
 * These tests cover:
 * 1. Date/temporal edge cases (leap years, invalid dates, boundary conditions)
 * 2. Type validation (all type prefixes and variants)
 * 3. Structural validation (arrays, paths, headers, nesting)
 * 4. Schema-level validation (constraints, bounds, patterns)
 * 5. Regression prevention tests (expected behavior that must not change)
 *
 * Philosophy: TDD approach - tests define expected behavior that code must satisfy.
 * These tests should catch any future code changes that break expected semantics.
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../../src/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: DATE AND TEMPORAL VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Comprehensive Date Validation', () => {
  describe('Leap Year Handling', () => {
    // Leap year rules:
    // - Divisible by 4 = leap year
    // - EXCEPT divisible by 100 = NOT leap year
    // - EXCEPT divisible by 400 = leap year

    it('should parse Feb 29 on divisible-by-4 leap years', () => {
      const testYears = [2024, 2028, 2032, 2036, 2040];
      for (const year of testYears) {
        const doc = Odin.parse(`date = ${year}-02-29`);
        expect((doc.get('date') as any).raw).toBe(`${year}-02-29`);
      }
    });

    it('should parse Feb 29 on divisible-by-400 leap years', () => {
      // 2000 is divisible by 400, so it IS a leap year
      const doc = Odin.parse('date = 2000-02-29');
      expect((doc.get('date') as any).raw).toBe('2000-02-29');
    });

    it('should parse Feb 29 on year 1600 (divisible by 400)', () => {
      const doc = Odin.parse('date = 1600-02-29');
      expect((doc.get('date') as any).raw).toBe('1600-02-29');
    });

    it('should parse Feb 29 on year 2400 (divisible by 400)', () => {
      const doc = Odin.parse('date = 2400-02-29');
      expect((doc.get('date') as any).raw).toBe('2400-02-29');
    });

    // ODIN validates calendar correctness at parse time
    describe('Invalid leap year dates (rejected at parse time)', () => {
      it('should reject Feb 29 on non-leap years', () => {
        // 2023 is NOT a leap year (not divisible by 4)
        expect(() => Odin.parse('date = 2023-02-29')).toThrow(ParseError);
      });

      it('should reject Feb 29 on century years not divisible by 400', () => {
        // 1900 is NOT a leap year (divisible by 100 but not 400)
        expect(() => Odin.parse('date = 1900-02-29')).toThrow(ParseError);
      });

      it('should reject Feb 29 on 2100 (not a leap year)', () => {
        // 2100 is NOT a leap year (divisible by 100 but not 400)
        expect(() => Odin.parse('date = 2100-02-29')).toThrow(ParseError);
      });
    });
  });

  describe('Invalid Date Formats', () => {
    it('should reject date with month 00', () => {
      // Month 00 is invalid
      expect(() => Odin.parse('date = 2024-00-15')).toThrow(ParseError);
    });

    it('should reject date with month 13', () => {
      // Month 13 is invalid
      expect(() => Odin.parse('date = 2024-13-01')).toThrow(ParseError);
    });

    it('should reject invalid date for day 00', () => {
      // ODIN validates dates at parse time - day 0 is invalid
      expect(() => Odin.parse('date = 2024-03-00')).toThrow(ParseError);
    });

    it('should reject invalid date for day 32', () => {
      // ODIN validates dates at parse time - day 32 is invalid
      expect(() => Odin.parse('date = 2024-01-32')).toThrow(ParseError);
    });

    it('should reject incomplete date format (year-month only)', () => {
      expect(() => Odin.parse('date = 2024-06')).toThrow(ParseError);
    });

    it('should reject date with wrong separators', () => {
      // Slashes create invalid tokens that result in errors
      expect(() => Odin.parse('date = 2024/06/15')).toThrow(ParseError);
    });

    it('should reject date with dots as separators', () => {
      // Dots create invalid trailing content after number
      expect(() => Odin.parse('date = 2024.06.15')).toThrow(ParseError);
    });
  });

  describe('Month Day Limits', () => {
    // Test last valid day for each month

    it('should parse last day of 31-day months', () => {
      const months31 = ['01', '03', '05', '07', '08', '10', '12'];
      for (const month of months31) {
        const doc = Odin.parse(`date = 2024-${month}-31`);
        expect((doc.get('date') as any).raw).toBe(`2024-${month}-31`);
        const dateValue = (doc.get('date') as any).value as Date;
        expect(dateValue.getUTCDate()).toBe(31);
      }
    });

    it('should parse last day of 30-day months', () => {
      const months30 = ['04', '06', '09', '11'];
      for (const month of months30) {
        const doc = Odin.parse(`date = 2024-${month}-30`);
        expect((doc.get('date') as any).raw).toBe(`2024-${month}-30`);
        const dateValue = (doc.get('date') as any).value as Date;
        expect(dateValue.getUTCDate()).toBe(30);
      }
    });

    it('should reject day 31 on 30-day months', () => {
      // April has 30 days, so April 31 is invalid
      expect(() => Odin.parse('date = 2024-04-31')).toThrow(ParseError);
    });
  });

  describe('Time Edge Cases', () => {
    it('should parse time at day boundary (00:00:00)', () => {
      const doc = Odin.parse('time = T00:00:00');
      expect((doc.get('time') as any).value).toBe('T00:00:00');
    });

    it('should parse time just before midnight (23:59:59)', () => {
      const doc = Odin.parse('time = T23:59:59');
      expect((doc.get('time') as any).value).toBe('T23:59:59');
    });

    it('should parse time with maximum milliseconds (23:59:59.999)', () => {
      const doc = Odin.parse('time = T23:59:59.999');
      expect((doc.get('time') as any).value).toBe('T23:59:59.999');
    });

    it('should parse time with sub-millisecond precision', () => {
      const doc = Odin.parse('time = T12:30:45.123456789');
      expect((doc.get('time') as any).value).toBe('T12:30:45.123456789');
    });

    it('should handle hour 24 (if supported by JS Date)', () => {
      // ISO 8601 allows 24:00:00 to mean midnight at end of day
      // This test documents behavior - may or may not be supported
      const doc = Odin.parse('time = T24:00:00');
      expect((doc.get('time') as any).value).toBe('T24:00:00');
    });
  });

  describe('Timestamp Timezone Edge Cases', () => {
    it('should parse timestamp with Z timezone', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00Z');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00Z');
    });

    it('should parse timestamp with positive offset', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00+05:30');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00+05:30');
    });

    it('should parse timestamp with negative offset', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00-12:00');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00-12:00');
    });

    it('should parse timestamp with maximum positive offset (+14:00)', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00+14:00');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00+14:00');
    });

    it('should parse timestamp with -00:00 offset', () => {
      // -00:00 is semantically different from +00:00 in some contexts
      const doc = Odin.parse('ts = 2024-06-15T10:30:00-00:00');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00-00:00');
    });

    it('should parse timestamp on leap second (23:59:60)', () => {
      // Leap seconds are rare but valid in ISO 8601
      const doc = Odin.parse('ts = 2024-06-30T23:59:60Z');
      expect((doc.get('ts') as any).raw).toBe('2024-06-30T23:59:60Z');
    });
  });

  describe('Duration Edge Cases', () => {
    it('should parse zero duration', () => {
      const doc = Odin.parse('dur = PT0S');
      expect((doc.get('dur') as any).value).toBe('PT0S');
    });

    it('should parse very large duration', () => {
      const doc = Odin.parse('dur = P999Y12M31DT23H59M59S');
      expect((doc.get('dur') as any).value).toBe('P999Y12M31DT23H59M59S');
    });

    it('should parse duration with only date components', () => {
      const doc = Odin.parse('dur = P5Y3M10D');
      expect((doc.get('dur') as any).value).toBe('P5Y3M10D');
    });

    it('should parse duration with only time components', () => {
      const doc = Odin.parse('dur = PT5H30M15S');
      expect((doc.get('dur') as any).value).toBe('PT5H30M15S');
    });

    it('should parse duration with fractional seconds', () => {
      const doc = Odin.parse('dur = PT0.5S');
      expect((doc.get('dur') as any).value).toBe('PT0.5S');
    });

    it('should parse duration with very precise fractional seconds', () => {
      const doc = Odin.parse('dur = PT0.123456789S');
      expect((doc.get('dur') as any).value).toBe('PT0.123456789S');
    });

    it('should parse duration with weeks (if supported)', () => {
      // ISO 8601 includes W for weeks
      const doc = Odin.parse('dur = P2W');
      expect((doc.get('dur') as any).value).toBe('P2W');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: NUMERIC TYPE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Comprehensive Numeric Validation', () => {
  describe('Number (#) Type', () => {
    it('should parse zero', () => {
      const doc = Odin.parse('val = #0');
      expect(doc.getNumber('val')).toBe(0);
    });

    it('should parse negative zero', () => {
      const doc = Odin.parse('val = #-0');
      expect(doc.getNumber('val')).toBe(-0);
      expect(Object.is(doc.getNumber('val'), -0)).toBe(true);
    });

    it('should parse positive integer as number', () => {
      const doc = Odin.parse('val = #42');
      expect(doc.getNumber('val')).toBe(42);
    });

    it('should parse negative integer as number', () => {
      const doc = Odin.parse('val = #-42');
      expect(doc.getNumber('val')).toBe(-42);
    });

    it('should parse very large number', () => {
      const doc = Odin.parse('val = #9007199254740991');
      expect(doc.getNumber('val')).toBe(9007199254740991); // Number.MAX_SAFE_INTEGER
    });

    it('should parse very small decimal', () => {
      const doc = Odin.parse('val = #0.000000001');
      expect(doc.getNumber('val')).toBe(0.000000001);
    });

    it('should parse scientific notation (lowercase e)', () => {
      const doc = Odin.parse('val = #1.5e10');
      expect(doc.getNumber('val')).toBe(1.5e10);
    });

    it('should parse scientific notation (uppercase E)', () => {
      const doc = Odin.parse('val = #1.5E10');
      expect(doc.getNumber('val')).toBe(1.5e10);
    });

    it('should parse scientific notation with negative exponent', () => {
      const doc = Odin.parse('val = #1.5e-10');
      expect(doc.getNumber('val')).toBe(1.5e-10);
    });

    it('should parse scientific notation with positive exponent sign', () => {
      const doc = Odin.parse('val = #1.5e+10');
      expect(doc.getNumber('val')).toBe(1.5e10);
    });

    it('should parse IEEE 754 limits', () => {
      const doc = Odin.parse(`val = #${Number.MAX_VALUE}`);
      expect(doc.getNumber('val')).toBe(Number.MAX_VALUE);
    });

    it('should parse minimum positive number', () => {
      const doc = Odin.parse(`val = #${Number.MIN_VALUE}`);
      expect(doc.getNumber('val')).toBe(Number.MIN_VALUE);
    });
  });

  describe('Integer (##) Type', () => {
    it('should parse zero', () => {
      const doc = Odin.parse('val = ##0');
      expect(doc.getInteger('val')).toBe(0);
      expect(doc.get('val')?.type).toBe('integer');
    });

    it('should parse negative integer', () => {
      const doc = Odin.parse('val = ##-42');
      expect(doc.getInteger('val')).toBe(-42);
    });

    it('should parse max safe integer', () => {
      const doc = Odin.parse(`val = ##${Number.MAX_SAFE_INTEGER}`);
      expect(doc.getInteger('val')).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should parse min safe integer', () => {
      const doc = Odin.parse(`val = ##${Number.MIN_SAFE_INTEGER}`);
      expect(doc.getInteger('val')).toBe(Number.MIN_SAFE_INTEGER);
    });

    it('should parse integer with leading zeros', () => {
      const doc = Odin.parse('val = ##007');
      expect(doc.getInteger('val')).toBe(7);
    });

    it('should reject integer prefix without value', () => {
      expect(() => Odin.parse('val = ##')).toThrow(ParseError);
    });
  });

  describe('Currency (#$) Type', () => {
    it('should parse zero currency', () => {
      const doc = Odin.parse('val = #$0.00');
      expect(doc.getNumber('val')).toBe(0);
      expect(doc.get('val')?.type).toBe('currency');
      expect((doc.get('val') as any).decimalPlaces).toBe(2);
    });

    it('should parse negative currency', () => {
      const doc = Odin.parse('val = #$-99.99');
      expect(doc.getNumber('val')).toBe(-99.99);
    });

    it('should parse currency without decimal', () => {
      const doc = Odin.parse('val = #$100');
      expect(doc.getNumber('val')).toBe(100);
    });

    it('should parse currency with one decimal', () => {
      const doc = Odin.parse('val = #$100.5');
      expect(doc.getNumber('val')).toBe(100.5);
    });

    it('should parse very large currency', () => {
      const doc = Odin.parse('val = #$9999999.99');
      expect(doc.getNumber('val')).toBe(9999999.99);
    });

    it('should parse sub-cent value', () => {
      const doc = Odin.parse('val = #$0.001');
      expect(doc.getNumber('val')).toBe(0.001);
    });

    it('should reject currency prefix without value', () => {
      expect(() => Odin.parse('val = #$')).toThrow(ParseError);
    });
  });

  describe('Number Precision Edge Cases', () => {
    it('should preserve floating point precision within limits', () => {
      const doc = Odin.parse('val = #0.1');
      // JavaScript floating point: 0.1 is not exactly representable
      expect(doc.getNumber('val')).toBeCloseTo(0.1, 15);
    });

    it('should handle classic floating point issue', () => {
      const doc = Odin.parse('a = #0.1\nb = #0.2');
      // 0.1 + 0.2 !== 0.3 in floating point
      expect(doc.getNumber('a')! + doc.getNumber('b')!).not.toBe(0.3);
      expect(doc.getNumber('a')! + doc.getNumber('b')!).toBeCloseTo(0.3, 15);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: BOOLEAN AND NULL VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Boolean and Null Validation', () => {
  describe('Boolean Without Prefix', () => {
    it('should parse true', () => {
      const doc = Odin.parse('val = true');
      expect(doc.getBoolean('val')).toBe(true);
    });

    it('should parse false', () => {
      const doc = Odin.parse('val = false');
      expect(doc.getBoolean('val')).toBe(false);
    });

    it('should reject TRUE (case sensitive)', () => {
      expect(() => Odin.parse('val = TRUE')).toThrow(ParseError);
    });

    it('should reject FALSE (case sensitive)', () => {
      expect(() => Odin.parse('val = FALSE')).toThrow(ParseError);
    });

    it('should reject True (case sensitive)', () => {
      expect(() => Odin.parse('val = True')).toThrow(ParseError);
    });
  });

  describe('Boolean With Prefix', () => {
    it('should parse ?true', () => {
      const doc = Odin.parse('val = ?true');
      expect(doc.getBoolean('val')).toBe(true);
    });

    it('should parse ?false', () => {
      const doc = Odin.parse('val = ?false');
      expect(doc.getBoolean('val')).toBe(false);
    });

    it('should reject ?maybe', () => {
      expect(() => Odin.parse('val = ?maybe')).toThrow(ParseError);
    });

    it('should reject ? alone', () => {
      expect(() => Odin.parse('val = ?')).toThrow(ParseError);
    });

    it('should reject ?TRUE', () => {
      expect(() => Odin.parse('val = ?TRUE')).toThrow(ParseError);
    });
  });

  describe('Null Value', () => {
    it('should parse null as ~', () => {
      const doc = Odin.parse('val = ~');
      expect(doc.get('val')?.type).toBe('null');
    });

    it('should parse multiple nulls', () => {
      const doc = Odin.parse('a = ~\nb = ~\nc = ~');
      expect(doc.get('a')?.type).toBe('null');
      expect(doc.get('b')?.type).toBe('null');
      expect(doc.get('c')?.type).toBe('null');
    });

    it('should parse null with critical modifier', () => {
      const doc = Odin.parse('val = !~');
      expect(doc.get('val')?.type).toBe('null');
      expect(doc.modifiers.get('val')?.required).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: STRING VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Comprehensive String Validation', () => {
  describe('Basic Strings', () => {
    it('should require quotes for all strings', () => {
      expect(() => Odin.parse('val = hello')).toThrow(ParseError);
    });

    it('should parse empty string', () => {
      const doc = Odin.parse('val = ""');
      expect(doc.getString('val')).toBe('');
    });

    it('should parse single character', () => {
      const doc = Odin.parse('val = "a"');
      expect(doc.getString('val')).toBe('a');
    });

    it('should parse string with spaces', () => {
      const doc = Odin.parse('val = "hello world"');
      expect(doc.getString('val')).toBe('hello world');
    });

    it('should preserve internal whitespace', () => {
      const doc = Odin.parse('val = "  a  b  "');
      expect(doc.getString('val')).toBe('  a  b  ');
    });
  });

  describe('All Escape Sequences', () => {
    it('should parse \\n (newline)', () => {
      const doc = Odin.parse('val = "a\\nb"');
      expect(doc.getString('val')).toBe('a\nb');
    });

    it('should parse \\t (tab)', () => {
      const doc = Odin.parse('val = "a\\tb"');
      expect(doc.getString('val')).toBe('a\tb');
    });

    it('should parse \\r (carriage return)', () => {
      const doc = Odin.parse('val = "a\\rb"');
      expect(doc.getString('val')).toBe('a\rb');
    });

    it('should parse \\\\ (backslash)', () => {
      const doc = Odin.parse('val = "a\\\\b"');
      expect(doc.getString('val')).toBe('a\\b');
    });

    it('should parse \\" (quote)', () => {
      const doc = Odin.parse('val = "a\\"b"');
      expect(doc.getString('val')).toBe('a"b');
    });

    it('should parse \\0 (null character)', () => {
      const doc = Odin.parse('val = "a\\0b"');
      expect(doc.getString('val')).toBe('a\0b');
    });

    it('should parse \\uXXXX (4-digit unicode)', () => {
      const doc = Odin.parse('val = "\\u0041"');
      expect(doc.getString('val')).toBe('A');
    });

    it('should parse \\UXXXXXXXX (8-digit unicode)', () => {
      const doc = Odin.parse('val = "\\U00000041"');
      expect(doc.getString('val')).toBe('A');
    });

    it('should parse emoji via unicode escape', () => {
      const doc = Odin.parse('val = "\\U0001F600"');
      expect(doc.getString('val')).toBe('\u{1F600}');
    });
  });

  describe('String Edge Cases', () => {
    it('should parse string that looks like number', () => {
      const doc = Odin.parse('val = "42"');
      expect(doc.get('val')?.type).toBe('string');
      expect(doc.getString('val')).toBe('42');
    });

    it('should parse string that looks like boolean', () => {
      const doc = Odin.parse('val = "true"');
      expect(doc.get('val')?.type).toBe('string');
      expect(doc.getString('val')).toBe('true');
    });

    it('should parse string that looks like date', () => {
      const doc = Odin.parse('val = "2024-06-15"');
      expect(doc.get('val')?.type).toBe('string');
      expect(doc.getString('val')).toBe('2024-06-15');
    });

    it('should parse string that looks like null', () => {
      const doc = Odin.parse('val = "~"');
      expect(doc.get('val')?.type).toBe('string');
      expect(doc.getString('val')).toBe('~');
    });

    it('should parse string with all ODIN special characters', () => {
      const doc = Odin.parse('val = "#$@^~?!*-={};[]:."');
      expect(doc.getString('val')).toBe('#$@^~?!*-={};[]:.');
    });

    it('should parse very long string', () => {
      const longStr = 'x'.repeat(100000);
      const doc = Odin.parse(`val = "${longStr}"`);
      expect(doc.getString('val')?.length).toBe(100000);
    });
  });

  describe('Unterminated Strings', () => {
    it('should reject string not closed at EOF', () => {
      expect(() => Odin.parse('val = "unclosed')).toThrow(ParseError);
    });

    it('should reject string with embedded raw newline', () => {
      expect(() => Odin.parse('val = "line1\nline2"')).toThrow(ParseError);
    });

    it('should reject string ending with single backslash', () => {
      expect(() => Odin.parse('val = "test\\')).toThrow(ParseError);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: BINARY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Binary Value Validation', () => {
  describe('Basic Binary', () => {
    it('should parse empty binary', () => {
      const doc = Odin.parse('val = ^');
      expect(doc.get('val')?.type).toBe('binary');
      expect((doc.get('val') as any).data.length).toBe(0);
    });

    it('should parse simple base64', () => {
      // "Hello" = SGVsbG8=
      const doc = Odin.parse('val = ^SGVsbG8=');
      const decoded = new TextDecoder().decode((doc.get('val') as any).data);
      expect(decoded).toBe('Hello');
    });

    it('should parse base64 with padding', () => {
      // "a" = YQ==
      const doc = Odin.parse('val = ^YQ==');
      expect((doc.get('val') as any).data).toEqual(new Uint8Array([97]));
    });

    it('should parse base64 with single padding', () => {
      // "ab" = YWI=
      const doc = Odin.parse('val = ^YWI=');
      expect((doc.get('val') as any).data).toEqual(new Uint8Array([97, 98]));
    });
  });

  describe('Binary With Algorithm', () => {
    it('should parse sha256 algorithm prefix', () => {
      const doc = Odin.parse('val = ^sha256:YWJj');
      expect((doc.get('val') as any).algorithm).toBe('sha256');
    });

    it('should parse ed25519 algorithm prefix', () => {
      const doc = Odin.parse('val = ^ed25519:YWJj');
      expect((doc.get('val') as any).algorithm).toBe('ed25519');
    });

    it('should parse algorithm with hyphen', () => {
      const doc = Odin.parse('val = ^sha-256:YWJj');
      expect((doc.get('val') as any).algorithm).toBe('sha-256');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: REFERENCE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Reference Validation', () => {
  describe('Basic References', () => {
    it('should parse simple reference', () => {
      const doc = Odin.parse('a = "value"\nb = @a');
      expect(doc.get('b')?.type).toBe('reference');
      expect((doc.get('b') as any).path).toBe('a');
    });

    it('should parse nested reference', () => {
      const doc = Odin.parse('obj.field = "value"\nref = @obj.field');
      expect((doc.get('ref') as any).path).toBe('obj.field');
    });

    it('should parse reference to array element', () => {
      const doc = Odin.parse('arr[0] = "value"\nref = @arr[0]');
      expect((doc.get('ref') as any).path).toBe('arr[0]');
    });

    it('should parse reference to nested array element', () => {
      const doc = Odin.parse('obj.arr[0].field = "value"\nref = @obj.arr[0].field');
      expect((doc.get('ref') as any).path).toBe('obj.arr[0].field');
    });
  });

  describe('Reference Resolution', () => {
    it('should resolve simple reference', () => {
      const doc = Odin.parse('name = "John"\nalias = @name');
      const resolved = doc.resolve('alias');
      expect(resolved?.type).toBe('string');
      expect((resolved as any).value).toBe('John');
    });

    it('should resolve chained references', () => {
      const doc = Odin.parse('a = "value"\nb = @a\nc = @b');
      const resolved = doc.resolve('c');
      expect((resolved as any).value).toBe('value');
    });

    it('should resolve reference to number', () => {
      const doc = Odin.parse('num = ##42\nref = @num');
      const resolved = doc.resolve('ref');
      expect(resolved?.type).toBe('integer');
      expect((resolved as any).value).toBe(42);
    });
  });

  describe('Forward References', () => {
    it('should allow forward references', () => {
      // Reference defined before target
      const doc = Odin.parse('ref = @target\ntarget = "value"');
      const resolved = doc.resolve('ref');
      expect((resolved as any).value).toBe('value');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: MODIFIER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Modifier Validation', () => {
  describe('Critical Modifier (!)', () => {
    it('should parse critical string', () => {
      const doc = Odin.parse('val = !"required"');
      expect(doc.modifiers.get('val')?.required).toBe(true);
      expect(doc.getString('val')).toBe('required');
    });

    it('should parse critical number', () => {
      const doc = Odin.parse('val = !#42');
      expect(doc.modifiers.get('val')?.required).toBe(true);
    });

    it('should parse critical integer', () => {
      const doc = Odin.parse('val = !##42');
      expect(doc.modifiers.get('val')?.required).toBe(true);
    });

    it('should parse critical currency', () => {
      const doc = Odin.parse('val = !#$99.99');
      expect(doc.modifiers.get('val')?.required).toBe(true);
    });

    it('should parse critical boolean', () => {
      const doc = Odin.parse('val = !true');
      expect(doc.modifiers.get('val')?.required).toBe(true);
    });

    it('should parse critical null', () => {
      const doc = Odin.parse('val = !~');
      expect(doc.modifiers.get('val')?.required).toBe(true);
    });

    it('should parse critical reference', () => {
      const doc = Odin.parse('a = "x"\nval = !@a');
      expect(doc.modifiers.get('val')?.required).toBe(true);
    });
  });

  describe('Redacted Modifier (*)', () => {
    it('should parse redacted string', () => {
      const doc = Odin.parse('val = *"secret"');
      expect(doc.modifiers.get('val')?.confidential).toBe(true);
    });

    it('should parse redacted with critical', () => {
      const doc = Odin.parse('val = !*"secret"');
      expect(doc.modifiers.get('val')?.required).toBe(true);
      expect(doc.modifiers.get('val')?.confidential).toBe(true);
    });
  });

  describe('Deprecated Modifier (-)', () => {
    it('should parse deprecated string', () => {
      const doc = Odin.parse('val = -"old"');
      expect(doc.modifiers.get('val')?.deprecated).toBe(true);
    });
  });

  describe('Combined Modifiers', () => {
    it('should parse all three modifiers together', () => {
      const doc = Odin.parse('val = !-*"value"');
      const mods = doc.modifiers.get('val');
      expect(mods?.required).toBe(true);
      expect(mods?.deprecated).toBe(true);
      expect(mods?.confidential).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: ARRAY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Array Validation', () => {
  describe('Array Index Rules', () => {
    it('should require arrays to start at index 0', () => {
      expect(() => Odin.parse('arr[1] = "value"')).toThrow(ParseError);
      try {
        Odin.parse('arr[1] = "value"');
      } catch (e) {
        expect((e as ParseError).code).toBe('P013');
      }
    });

    it('should require contiguous indices', () => {
      expect(() => Odin.parse('arr[0] = "a"\narr[2] = "c"')).toThrow(ParseError);
    });

    it('should allow indices in any order if contiguous', () => {
      const doc = Odin.parse('arr[2] = "c"\narr[0] = "a"\narr[1] = "b"');
      expect(doc.getString('arr[0]')).toBe('a');
      expect(doc.getString('arr[1]')).toBe('b');
      expect(doc.getString('arr[2]')).toBe('c');
    });

    it('should reject negative indices', () => {
      expect(() => Odin.parse('arr[-1] = "value"')).toThrow();
    });

    it('should reject floating point indices', () => {
      expect(() => Odin.parse('arr[1.5] = "value"')).toThrow(ParseError);
    });

    it('should accept identifier-based indices (for table column lists)', () => {
      // Non-numeric indices like [abc] are now valid to support table column lists
      // e.g., {$table.RATE[vehicle_type, coverage]}
      const doc = Odin.parse('arr[abc] = "value"');
      expect(doc.paths()).toContain('arr[abc]');
    });
  });

  describe('Array Element Types', () => {
    it('should allow different types in array elements', () => {
      const doc = Odin.parse(`
        arr[0].name = "first"
        arr[0].count = ##1
        arr[1].name = "second"
        arr[1].count = ##2
      `);
      expect(doc.getString('arr[0].name')).toBe('first');
      expect(doc.getInteger('arr[0].count')).toBe(1);
    });

    it('should support nested arrays', () => {
      const doc = Odin.parse(`
        matrix[0][0] = ##1
        matrix[0][1] = ##2
        matrix[1][0] = ##3
        matrix[1][1] = ##4
      `);
      expect(doc.getInteger('matrix[0][0]')).toBe(1);
      expect(doc.getInteger('matrix[1][1]')).toBe(4);
    });
  });

  describe('Empty and Null Arrays', () => {
    it('should parse explicit empty array', () => {
      const doc = Odin.parse('arr[] = ~');
      // This creates an explicit empty/null array marker
      expect(doc.get('arr[]')?.type).toBe('null');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: TABULAR SYNTAX VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Tabular Syntax Validation', () => {
  describe('Basic Tabular', () => {
    it('should parse tabular header with columns', () => {
      const doc = Odin.parse(`
        {items[] : sku, name, qty}
        "ABC-001", "Widget", ##10
        "ABC-002", "Gadget", ##5
      `);
      expect(doc.getString('items[0].sku')).toBe('ABC-001');
      expect(doc.getString('items[0].name')).toBe('Widget');
      expect(doc.getInteger('items[0].qty')).toBe(10);
      expect(doc.getString('items[1].sku')).toBe('ABC-002');
    });

    it('should handle null cells in tabular', () => {
      const doc = Odin.parse(`
        {items[] : a, b, c}
        "x", ~, "z"
      `);
      expect(doc.getString('items[0].a')).toBe('x');
      expect(doc.get('items[0].b')?.type).toBe('null');
      expect(doc.getString('items[0].c')).toBe('z');
    });

    it('should handle absent cells (empty between commas)', () => {
      const doc = Odin.parse(`
        {items[] : a, b, c}
        "x", , "z"
      `);
      expect(doc.getString('items[0].a')).toBe('x');
      expect(doc.has('items[0].b')).toBe(false); // Absent, no path created
      expect(doc.getString('items[0].c')).toBe('z');
    });

    it('should handle empty string vs null vs absent', () => {
      const doc = Odin.parse(`
        {items[] : a, b, c}
        "", ~,
      `);
      expect(doc.getString('items[0].a')).toBe(''); // Empty string
      expect(doc.get('items[0].b')?.type).toBe('null'); // Null
      expect(doc.has('items[0].c')).toBe(false); // Absent
    });
  });

  describe('Tabular with Single-Level Nesting', () => {
    it('should parse single-level dot notation columns', () => {
      const doc = Odin.parse(`
        {items[] : product.name, product.sku, qty}
        "Widget", "WGT-001", ##10
      `);
      expect(doc.getString('items[0].product.name')).toBe('Widget');
      expect(doc.getString('items[0].product.sku')).toBe('WGT-001');
    });

    it('should parse single-level array index columns', () => {
      const doc = Odin.parse(`
        {users[] : name, permissions[0], permissions[1]}
        "Admin", "read", "write"
      `);
      expect(doc.getString('users[0].name')).toBe('Admin');
      expect(doc.getString('users[0].permissions[0]')).toBe('read');
      expect(doc.getString('users[0].permissions[1]')).toBe('write');
    });
  });

  describe('Tabular Type Support', () => {
    it('should support all primitive types in tabular', () => {
      const doc = Odin.parse(`
        {items[] : str, int, num, curr, bool, date}
        "text", ##42, #3.14, #$99.99, true, 2024-06-15
      `);
      expect(doc.getString('items[0].str')).toBe('text');
      expect(doc.getInteger('items[0].int')).toBe(42);
      expect(doc.getNumber('items[0].num')).toBeCloseTo(3.14);
      expect(doc.getNumber('items[0].curr')).toBe(99.99);
      expect(doc.getBoolean('items[0].bool')).toBe(true);
      expect(doc.get('items[0].date')?.type).toBe('date');
    });

    it('should support references in tabular', () => {
      const doc = Odin.parse(`
        target = "referenced"
        {items[] : name, ref}
        "first", @target
      `);
      expect((doc.get('items[0].ref') as any).path).toBe('target');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: HEADER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Header Validation', () => {
  describe('Empty Header', () => {
    it('should reset to root with {}', () => {
      const doc = Odin.parse(`
        {section}
        inner = "value"
        {}
        outer = "root"
      `);
      expect(doc.getString('section.inner')).toBe('value');
      expect(doc.getString('outer')).toBe('root');
    });
  });

  describe('Metadata Header', () => {
    it('should parse {$} for metadata', () => {
      const doc = Odin.parse(`
        {$}
        odin = "1.0.0"
        id = "doc-001"
      `);
      expect(doc.getString('$.odin')).toBe('1.0.0');
      expect(doc.getString('$.id')).toBe('doc-001');
    });
  });

  describe('Relative Headers', () => {
    it('should resolve relative header with dot prefix', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
        {.address}
        city = "Austin"
      `);
      expect(doc.getString('customer.name')).toBe('John');
      expect(doc.getString('customer.address.city')).toBe('Austin');
    });

    it('should chain relative headers', () => {
      const doc = Odin.parse(`
        {policy}
        number = "P001"
        {.insured}
        name = "John"
        {.contact}
        phone = "555-1234"
      `);
      // Per spec: relative headers resolve against last absolute header, making them siblings
      expect(doc.getString('policy.contact.phone')).toBe('555-1234');
    });
  });

  describe('Array Headers', () => {
    it('should parse header with array index', () => {
      const doc = Odin.parse(`
        {items[0]}
        name = "First"
        qty = ##1
      `);
      expect(doc.getString('items[0].name')).toBe('First');
    });
  });

  describe('Extension Headers', () => {
    it('should parse extension namespace header', () => {
      const doc = Odin.parse(`
        {&com.acme}
        custom = "value"
      `);
      expect(doc.getString('&com.acme.custom')).toBe('value');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11: PATH VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Path Validation', () => {
  describe('Identifier Rules', () => {
    it('should allow underscore-prefixed identifiers', () => {
      const doc = Odin.parse('_private = "value"');
      expect(doc.getString('_private')).toBe('value');
    });

    it('should allow identifiers with numbers', () => {
      const doc = Odin.parse('field1 = "value"');
      expect(doc.getString('field1')).toBe('value');
    });

    it('should allow identifiers with hyphens', () => {
      const doc = Odin.parse('my-field = "value"');
      expect(doc.getString('my-field')).toBe('value');
    });

    it('should allow identifiers with multiple underscores', () => {
      const doc = Odin.parse('my__field = "value"');
      expect(doc.getString('my__field')).toBe('value');
    });
  });

  describe('Duplicate Path Detection', () => {
    it('should reject duplicate simple path', () => {
      expect(() => Odin.parse('a = "1"\na = "2"')).toThrow(ParseError);
      try {
        Odin.parse('a = "1"\na = "2"');
      } catch (e) {
        expect((e as ParseError).code).toBe('P007');
      }
    });

    it('should reject duplicate nested path', () => {
      expect(() => Odin.parse('a.b = "1"\na.b = "2"')).toThrow(ParseError);
    });

    it('should reject duplicate via header', () => {
      expect(() =>
        Odin.parse(`
        {section}
        field = "1"
        field = "2"
      `)
      ).toThrow(ParseError);
    });

    it('should reject duplicate across header and direct', () => {
      expect(() =>
        Odin.parse(`
        section.field = "1"
        {section}
        field = "2"
      `)
      ).toThrow(ParseError);
    });
  });

  describe('Extension Paths', () => {
    it('should parse extension path assignment', () => {
      const doc = Odin.parse('&com.acme.custom = "value"');
      expect(doc.getString('&com.acme.custom')).toBe('value');
    });

    it('should parse extension within regular path', () => {
      const doc = Odin.parse('policy.&com.acme.extension = "data"');
      expect(doc.getString('policy.&com.acme.extension')).toBe('data');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12: DOCUMENT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Document Validation', () => {
  describe('Circular Reference Detection', () => {
    it('should detect direct circular reference', () => {
      const doc = Odin.parse('a = @a');
      const schema = createMinimalSchema();
      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V012')).toBe(true);
    });

    it('should detect indirect circular reference', () => {
      const doc = Odin.parse('a = @b\nb = @c\nc = @a');
      const schema = createMinimalSchema();
      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });
  });

  describe('Unresolved Reference Detection', () => {
    it('should detect unresolved reference', () => {
      const doc = Odin.parse('ref = @nonexistent');
      const schema = createMinimalSchema();
      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V013')).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13: COMMENT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Comment Validation', () => {
  it('should ignore full-line comments', () => {
    const doc = Odin.parse(`
      ; This is a comment
      name = "value"
    `);
    expect(doc.getString('name')).toBe('value');
    expect(doc.paths().length).toBe(1);
  });

  it('should ignore inline comments', () => {
    const doc = Odin.parse('name = "value" ; inline comment');
    expect(doc.getString('name')).toBe('value');
  });

  it('should not treat semicolon in string as comment', () => {
    const doc = Odin.parse('text = "a; b; c"');
    expect(doc.getString('text')).toBe('a; b; c');
  });

  it('should handle document with only comments', () => {
    const doc = Odin.parse('; comment\n; another');
    expect(doc.paths().length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 14: DOCUMENT CHAINING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Document Chaining', () => {
  it('should parse multiple documents separated by ---', () => {
    const doc = Odin.parse(`
      {$}
      id = "doc1"
      ---
      {$}
      id = "doc2"
    `);
    expect(doc.getString('$.id')).toBe('doc1');
    // Chained documents are accessible via chainedDocuments
  });

  it('should reset state between chained documents', () => {
    const doc = Odin.parse(`
      {section}
      field = "first"
      ---
      field = "second"
    `);
    // First doc has section.field, second doc has root field
    expect(doc.getString('section.field')).toBe('first');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 15: ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error Handling', () => {
  describe('Error Codes', () => {
    it('should return P001 for unexpected character', () => {
      try {
        Odin.parse('% invalid');
      } catch (e) {
        expect((e as ParseError).code).toMatch(/^P00[12]$/);
      }
    });

    it('should return P002 for bare string', () => {
      try {
        Odin.parse('name = unquoted');
      } catch (e) {
        expect((e as ParseError).code).toBe('P002');
      }
    });

    it('should return P003 for invalid array index', () => {
      try {
        Odin.parse('arr[abc] = "value"');
      } catch (e) {
        expect((e as ParseError).code).toBe('P003');
      }
    });

    it('should return P004 for unterminated string', () => {
      try {
        Odin.parse('val = "unterminated');
      } catch (e) {
        expect((e as ParseError).code).toBe('P004');
      }
    });

    it('should return P006 for invalid type prefix', () => {
      try {
        Odin.parse('val = ##');
      } catch (e) {
        expect((e as ParseError).code).toBe('P006');
      }
    });

    it('should return P007 for duplicate path', () => {
      try {
        Odin.parse('a = "1"\na = "2"');
      } catch (e) {
        expect((e as ParseError).code).toBe('P007');
      }
    });

    it('should return P013 for non-contiguous array', () => {
      try {
        Odin.parse('arr[1] = "value"');
      } catch (e) {
        expect((e as ParseError).code).toBe('P013');
      }
    });
  });

  describe('Error Location Reporting', () => {
    it('should report correct line number', () => {
      try {
        Odin.parse('ok = "fine"\n\n\n% bad');
      } catch (e) {
        expect((e as ParseError).line).toBe(4);
      }
    });

    it('should report column number', () => {
      try {
        Odin.parse('name = bad');
      } catch (e) {
        expect((e as ParseError).column).toBeGreaterThan(0);
      }
    });
  });

  describe('No Partial Parsing', () => {
    it('should not return partial document on error', () => {
      let doc;
      try {
        doc = Odin.parse('ok = "fine"\nbad = unquoted');
      } catch {
        // Expected
      }
      expect(doc).toBeUndefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 16: REGRESSION PREVENTION TESTS
// These tests lock in expected behavior that must not change
// ═══════════════════════════════════════════════════════════════════════════════

describe('Regression Prevention', () => {
  describe('Type Prefix Behavior', () => {
    it('# must be followed by number', () => {
      expect(() => Odin.parse('val = #')).toThrow(ParseError);
    });

    it('## must be followed by integer', () => {
      expect(() => Odin.parse('val = ##')).toThrow(ParseError);
    });

    it('#$ must be followed by number', () => {
      expect(() => Odin.parse('val = #$')).toThrow(ParseError);
    });

    it('? must be followed by true or false', () => {
      expect(() => Odin.parse('val = ?')).toThrow(ParseError);
    });

    it('@  can be followed by path', () => {
      const doc = Odin.parse('a = "x"\nb = @a');
      expect(doc.get('b')?.type).toBe('reference');
    });

    it('^ can be empty for empty binary', () => {
      const doc = Odin.parse('val = ^');
      expect(doc.get('val')?.type).toBe('binary');
    });
  });

  describe('String Quoting Requirement', () => {
    it('all string values must be quoted', () => {
      expect(() => Odin.parse('val = unquoted')).toThrow(ParseError);
    });

    it('even single words must be quoted', () => {
      expect(() => Odin.parse('val = hello')).toThrow(ParseError);
    });

    it('quoted strings are strings regardless of content', () => {
      const doc = Odin.parse('val = "42"');
      expect(doc.get('val')?.type).toBe('string');
    });
  });

  describe('Array Contiguity Requirement', () => {
    it('arrays must start at 0', () => {
      expect(() => Odin.parse('a[1] = "x"')).toThrow(ParseError);
    });

    it('array indices must be contiguous', () => {
      expect(() => Odin.parse('a[0] = "x"\na[5] = "y"')).toThrow(ParseError);
    });
  });

  describe('Case Sensitivity', () => {
    it('true and false must be lowercase', () => {
      expect(() => Odin.parse('val = True')).toThrow(ParseError);
      expect(() => Odin.parse('val = FALSE')).toThrow(ParseError);
    });

    it('field names are case-sensitive', () => {
      const doc = Odin.parse('Name = "A"\nname = "B"');
      expect(doc.getString('Name')).toBe('A');
      expect(doc.getString('name')).toBe('B');
    });
  });

  describe('Null Semantics', () => {
    it('~ is null, not tilde string', () => {
      const doc = Odin.parse('val = ~');
      expect(doc.get('val')?.type).toBe('null');
    });

    it('"~" is tilde string, not null', () => {
      const doc = Odin.parse('val = "~"');
      expect(doc.get('val')?.type).toBe('string');
      expect(doc.getString('val')).toBe('~');
    });
  });

  describe('Reference Semantics', () => {
    it('@ followed by path is reference', () => {
      const doc = Odin.parse('a = "x"\nb = @a');
      expect(doc.get('b')?.type).toBe('reference');
    });

    it('"@path" is string, not reference', () => {
      const doc = Odin.parse('val = "@path"');
      expect(doc.get('val')?.type).toBe('string');
      expect(doc.getString('val')).toBe('@path');
    });
  });

  describe('Date/Time Pattern Detection', () => {
    it('YYYY-MM-DD is date, not arithmetic', () => {
      const doc = Odin.parse('val = 2024-06-15');
      expect(doc.get('val')?.type).toBe('date');
    });

    it('T followed by HH:MM:SS is time', () => {
      const doc = Odin.parse('val = T14:30:00');
      expect(doc.get('val')?.type).toBe('time');
    });

    it('P followed by duration is duration', () => {
      const doc = Odin.parse('val = P1Y');
      expect(doc.get('val')?.type).toBe('duration');
    });
  });

  describe('Roundtrip Stability', () => {
    it('stringify then parse should preserve values', () => {
      const original = Odin.parse(`
        str = "hello"
        num = #3.14
        int = ##42
        curr = #$99.99
        bool = true
        date = 2024-06-15
      `);
      const serialized = Odin.stringify(original);
      const reparsed = Odin.parse(serialized);

      expect(reparsed.getString('str')).toBe('hello');
      expect(reparsed.getNumber('num')).toBeCloseTo(3.14);
      expect(reparsed.getInteger('int')).toBe(42);
      expect(reparsed.getNumber('curr')).toBe(99.99);
      expect(reparsed.getBoolean('bool')).toBe(true);
      expect((reparsed.get('date') as any).raw).toBe('2024-06-15');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function createMinimalSchema() {
  return {
    metadata: {},
    types: new Map(),
    fields: new Map(),
    arrays: new Map(),
    constraints: new Map(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 17: MALFORMED DOCUMENT TESTS
// Tests for poorly structured, corrupted, or edge-case document formats
// ═══════════════════════════════════════════════════════════════════════════════

describe('Malformed Document Handling', () => {
  describe('Whitespace and Formatting Issues', () => {
    it('should reject multiple assignments on single line', () => {
      // Parser now strict - rejects trailing content after value
      expect(() => Odin.parse('a = "1" b = "2"')).toThrow(ParseError);
    });

    it('should handle excessive blank lines', () => {
      const doc = Odin.parse('a = "1"\n\n\n\n\n\nb = "2"');
      expect(doc.getString('a')).toBe('1');
      expect(doc.getString('b')).toBe('2');
    });

    it('should handle mixed line endings (CRLF)', () => {
      const doc = Odin.parse('a = "1"\r\nb = "2"\r\n');
      expect(doc.getString('a')).toBe('1');
      expect(doc.getString('b')).toBe('2');
    });

    it('should handle CR only line endings', () => {
      const doc = Odin.parse('a = "1"\rb = "2"\r');
      expect(doc.getString('a')).toBe('1');
      expect(doc.getString('b')).toBe('2');
    });

    it('should handle trailing whitespace on lines', () => {
      const doc = Odin.parse('a = "1"   \nb = "2"\t\t');
      expect(doc.getString('a')).toBe('1');
      expect(doc.getString('b')).toBe('2');
    });

    it('should handle leading whitespace on lines', () => {
      const doc = Odin.parse('   a = "1"\n\t\tb = "2"');
      expect(doc.getString('a')).toBe('1');
      expect(doc.getString('b')).toBe('2');
    });

    it('should handle whitespace before equals', () => {
      const doc = Odin.parse('a   = "1"');
      expect(doc.getString('a')).toBe('1');
    });

    it('should handle whitespace after equals', () => {
      const doc = Odin.parse('a =   "1"');
      expect(doc.getString('a')).toBe('1');
    });

    it('should handle no whitespace around equals', () => {
      const doc = Odin.parse('a="1"');
      expect(doc.getString('a')).toBe('1');
    });

    it('should handle tab-only indentation', () => {
      const doc = Odin.parse('\t\ta = "1"\n\t\tb = "2"');
      expect(doc.getString('a')).toBe('1');
    });

    it('should handle space-only indentation', () => {
      const doc = Odin.parse('    a = "1"\n    b = "2"');
      expect(doc.getString('a')).toBe('1');
    });

    it('should handle document ending without newline', () => {
      const doc = Odin.parse('a = "1"');
      expect(doc.getString('a')).toBe('1');
    });

    it('should handle document with BOM', () => {
      // UTF-8 BOM: 0xEF 0xBB 0xBF
      const bom = String.fromCharCode(0xfeff);
      const doc = Odin.parse(`${bom}a = "1"`);
      expect(doc.getString('a')).toBe('1');
    });
  });

  describe('Incomplete Syntax', () => {
    it('should reject assignment without value', () => {
      expect(() => Odin.parse('name =')).toThrow(ParseError);
    });

    it('should reject assignment with only whitespace after equals', () => {
      expect(() => Odin.parse('name =   ')).toThrow(ParseError);
    });

    it('should reject path without assignment', () => {
      expect(() => Odin.parse('customer.name')).toThrow(ParseError);
    });

    it('should reject unclosed header', () => {
      expect(() => Odin.parse('{section')).toThrow(ParseError);
    });

    it('should reject header with no closing brace and content', () => {
      expect(() => Odin.parse('{section\nname = "value"')).toThrow(ParseError);
    });

    it('should reject unclosed array bracket', () => {
      expect(() => Odin.parse('arr[0 = "value"')).toThrow(ParseError);
    });

    it('should reject unclosed array bracket in header', () => {
      expect(() => Odin.parse('{items[\nname = "value"')).toThrow(ParseError);
    });
  });

  describe('Broken Header Syntax', () => {
    it('should allow empty header (valid - resets to root)', () => {
      const doc = Odin.parse('{   }\na = "1"');
      expect(doc.getString('a')).toBe('1');
    });

    it('should reject header with invalid characters', () => {
      expect(() => Odin.parse('{sec%tion}\nval = "x"')).toThrow(ParseError);
    });

    it('should reject header with equals sign', () => {
      expect(() => Odin.parse('{section = value}\nval = "x"')).toThrow(ParseError);
    });

    it('should reject nested braces', () => {
      expect(() => Odin.parse('{{section}}\nval = "x"')).toThrow(ParseError);
    });

    it('should reject header starting with number', () => {
      expect(() => Odin.parse('{123section}\nval = "x"')).toThrow(ParseError);
    });

    it('should reject header with comma but no array syntax', () => {
      // Tabular column syntax requires [] on the header path
      expect(() => Odin.parse('{section : a, b}\nval = "x"')).toThrow(ParseError);
    });
  });

  describe('Broken Assignment Syntax', () => {
    it('should reject double equals', () => {
      expect(() => Odin.parse('val == "x"')).toThrow(ParseError);
    });

    it('should reject colon instead of equals', () => {
      expect(() => Odin.parse('val : "x"')).toThrow(ParseError);
    });

    it('should reject arrow instead of equals', () => {
      expect(() => Odin.parse('val -> "x"')).toThrow(ParseError);
    });

    it('should reject multiple values on same line', () => {
      // Parser now strict - rejects trailing content after value
      expect(() => Odin.parse('val = "a" "b"')).toThrow(ParseError);
    });

    it('should reject value before equals', () => {
      expect(() => Odin.parse('"value" = name')).toThrow(ParseError);
    });
  });

  describe('Broken Tabular Syntax', () => {
    it('should reject tabular row with extra columns', () => {
      // Extra values beyond column count should throw to prevent silent data loss
      expect(() =>
        Odin.parse(`
        {items[] : a, b}
        "x", "y", "z"
      `)
      ).toThrow(ParseError);
    });

    it('should handle tabular row with too few columns (missing absent)', () => {
      const doc = Odin.parse(`
        {items[] : a, b, c}
        "x"
      `);
      expect(doc.getString('items[0].a')).toBe('x');
      expect(doc.has('items[0].b')).toBe(false);
      expect(doc.has('items[0].c')).toBe(false);
    });

    it('should reject tabular with no columns but data rows', () => {
      // Data rows without columns would cause silent data loss - reject
      expect(() =>
        Odin.parse(`
        {items[] :}
        "x", "y"
      `)
      ).toThrow(ParseError);
    });

    it('should handle assignment in tabular context (switches mode)', () => {
      const doc = Odin.parse(`
        {items[] : a, b}
        "x", "y"
        a = "direct"
      `);
      // Assignment in tabular context switches to non-tabular mode
      expect(doc.getString('items[0].a')).toBe('x');
      expect(doc.getString('a')).toBe('direct');
    });
  });

  describe('Broken Value Syntax', () => {
    it('should reject number with multiple decimal points', () => {
      // Parser now strict - rejects trailing content after number value
      expect(() => Odin.parse('val = #1.2.3')).toThrow(ParseError);
    });

    it('should reject number with trailing e', () => {
      // Parser now strict - exponent requires digits
      expect(() => Odin.parse('val = #1e')).toThrow(ParseError);
    });

    it('should reject number with invalid exponent', () => {
      // Parser now strict - exponent requires digits after sign
      expect(() => Odin.parse('val = #1e++')).toThrow(ParseError);
    });

    it('should parse valid escaped tab in string', () => {
      const doc = Odin.parse('val = "a\\tb"');
      expect(doc.getString('val')).toBe('a\tb');
    });

    it('should reject date with wrong number of parts', () => {
      expect(() => Odin.parse('val = 2024-06')).toThrow(ParseError);
    });

    it('should reject date with text month', () => {
      expect(() => Odin.parse('val = 2024-Jun-15')).toThrow(ParseError);
    });

    it('should reject date with single digit parts without leading zeros', () => {
      // 2024-6-5 instead of 2024-06-05
      expect(() => Odin.parse('val = 2024-6-5')).toThrow(ParseError);
    });

    it('should reject timestamp with space separator instead of T', () => {
      // Parser now strict - rejects trailing content after date value
      expect(() => Odin.parse('val = 2024-06-15 10:30:00Z')).toThrow(ParseError);
    });

    it('should reject duration with no components', () => {
      expect(() => Odin.parse('val = P')).toThrow(ParseError);
    });

    it('should reject time without T prefix', () => {
      // Parser now strict - rejects trailing content after number
      expect(() => Odin.parse('val = 10:30:00')).toThrow(ParseError);
    });
  });

  describe('Unicode and Encoding Issues', () => {
    it('should handle valid UTF-8 characters', () => {
      const doc = Odin.parse('val = "Hello World"');
      expect(doc.getString('val')).toBe('Hello World');
    });

    it('should handle emoji in strings', () => {
      const doc = Odin.parse('val = "test 🎉 emoji"');
      expect(doc.getString('val')).toBe('test 🎉 emoji');
    });

    it('should handle RTL text in strings', () => {
      const doc = Odin.parse('val = "مرحبا"');
      expect(doc.getString('val')).toBe('مرحبا');
    });

    it('should handle zero-width characters in strings', () => {
      const zeroWidth = '\u200B'; // Zero-width space
      const doc = Odin.parse(`val = "a${zeroWidth}b"`);
      expect(doc.getString('val')).toBe(`a${zeroWidth}b`);
    });

    it('should parse escaped null byte in string', () => {
      const doc = Odin.parse('val = "a\\0b"');
      expect(doc.getString('val')).toBe('a\0b');
    });
  });

  describe('Boundary and Size Limits', () => {
    it('should handle very deeply nested paths', () => {
      const segments = Array.from({ length: 30 }, (_, i) => `l${i}`);
      const path = segments.join('.');
      const doc = Odin.parse(`${path} = "deep"`);
      expect(doc.getString(path)).toBe('deep');
    });

    it('should respect max nesting depth option', () => {
      const segments = Array.from({ length: 10 }, (_, i) => `l${i}`);
      const path = segments.join('.');
      expect(() => Odin.parse(`${path} = "deep"`, { maxNestingDepth: 5 })).toThrow(ParseError);
    });

    it('should respect max document size option', () => {
      const content = 'x = "' + 'a'.repeat(2000) + '"';
      expect(() => Odin.parse(content, { maxDocumentSize: 1000 })).toThrow(ParseError);
      try {
        Odin.parse(content, { maxDocumentSize: 1000 });
      } catch (e) {
        expect((e as ParseError).code).toBe('P011');
      }
    });

    it('should handle very long field names', () => {
      const longName = 'a'.repeat(1000);
      const doc = Odin.parse(`${longName} = "value"`);
      expect(doc.getString(longName)).toBe('value');
    });

    it('should handle very long path', () => {
      const path = 'a.' + 'b.'.repeat(50) + 'c';
      const doc = Odin.parse(`${path} = "value"`);
      expect(doc.getString(path)).toBe('value');
    });
  });

  describe('Empty and Null Edge Cases', () => {
    it('should handle completely empty document', () => {
      const doc = Odin.parse('');
      expect(doc.paths().length).toBe(0);
    });

    it('should handle document with only whitespace', () => {
      const doc = Odin.parse('   \n\t\n   ');
      expect(doc.paths().length).toBe(0);
    });

    it('should handle document with only comments', () => {
      const doc = Odin.parse('; comment\n; another');
      expect(doc.paths().length).toBe(0);
    });

    it('should handle document with only empty headers', () => {
      const doc = Odin.parse('{}\n{}\n{}');
      expect(doc.paths().length).toBe(0);
    });
  });

  describe('Special Character Handling in Identifiers', () => {
    it('should allow hyphens in field names', () => {
      const doc = Odin.parse('field-name = "value"');
      expect(doc.getString('field-name')).toBe('value');
    });

    it('should allow underscores in field names', () => {
      const doc = Odin.parse('field_name = "value"');
      expect(doc.getString('field_name')).toBe('value');
    });

    it('should allow mixed case in field names', () => {
      const doc = Odin.parse('fieldName = "value"');
      expect(doc.getString('fieldName')).toBe('value');
    });

    it('should reject field name starting with digit', () => {
      expect(() => Odin.parse('123field = "value"')).toThrow(ParseError);
    });

    it('should reject field name starting with hyphen', () => {
      expect(() => Odin.parse('-field = "value"')).toThrow(ParseError);
    });

    it('should reject field name with exclamation mark', () => {
      expect(() => Odin.parse('field! = "value"')).toThrow(ParseError);
    });

    it('should reject field name with at sign', () => {
      expect(() => Odin.parse('field@ = "value"')).toThrow(ParseError);
    });

    it('should reject field name with hash', () => {
      expect(() => Odin.parse('field# = "value"')).toThrow(ParseError);
    });

    it('should reject field name with dollar sign', () => {
      expect(() => Odin.parse('field$ = "value"')).toThrow(ParseError);
    });
  });

  describe('Directive Handling', () => {
    // ODIN directive syntax uses semicolon prefix: @import, ;$schema, ;?condition
    // See ODIN_1_0_Specification.md section on Directives
    it('should handle import directive (currently skipped)', () => {
      const doc = Odin.parse('@import ./other.odin\nname = "value"');
      expect(doc.getString('name')).toBe('value');
    });

    it('should handle schema directive (currently skipped)', () => {
      const doc = Odin.parse(';$schema = https://example.com/policy.odinschema\nname = "value"');
      expect(doc.getString('name')).toBe('value');
    });

    it('should handle conditional directive (currently skipped)', () => {
      const doc = Odin.parse(';?feature_enabled\nname = "value"');
      expect(doc.getString('name')).toBe('value');
    });
  });

  describe('Mixed Valid and Invalid Content', () => {
    it('should reject document with error after valid content', () => {
      expect(() =>
        Odin.parse(`
        valid = "ok"
        another = "fine"
        bad = unquoted
      `)
      ).toThrow(ParseError);
    });

    it('should reject document with error in header after valid assignments', () => {
      expect(() =>
        Odin.parse(`
        valid = "ok"
        {sec%tion}
        name = "value"
      `)
      ).toThrow(ParseError);
    });

    it('should reject document with error after valid tabular', () => {
      expect(() =>
        Odin.parse(`
        {items[] : name, qty}
        "Widget", ##10
        $ invalid
      `)
      ).toThrow(ParseError);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 18: SCHEMA VALIDATION EDGE CASES
// Comprehensive tests for schema validation scenarios
// ═══════════════════════════════════════════════════════════════════════════════

describe('Schema Validation Edge Cases', () => {
  describe('Required Field Validation', () => {
    it('should fail when required field is missing', () => {
      const doc = Odin.parse('name = "John"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'name',
            {
              path: 'name',
              type: { kind: 'string' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
          [
            'age',
            {
              path: 'age',
              type: { kind: 'integer' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V001')).toBe(true);
    });
  });

  describe('Type Mismatch Validation', () => {
    it('should fail when string field has number value', () => {
      const doc = Odin.parse('name = ##42');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'name',
            {
              path: 'name',
              type: { kind: 'string' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V002')).toBe(true);
    });

    it('should fail when integer field has currency value', () => {
      const doc = Odin.parse('count = #$99.99');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'count',
            {
              path: 'count',
              type: { kind: 'integer' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
    });
  });

  describe('Null Handling', () => {
    it('should pass when nullable field is null', () => {
      const doc = Odin.parse('notes = ~');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'notes',
            {
              path: 'notes',
              type: { kind: 'string' as const },
              required: false,
              nullable: true,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(true);
    });

    it('should fail when non-nullable field is null', () => {
      const doc = Odin.parse('notes = ~');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'notes',
            {
              path: 'notes',
              type: { kind: 'string' as const },
              required: false,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.code).toBe('V002');
    });
  });

  describe('Bounds Constraint Validation', () => {
    it('should fail when number is below minimum', () => {
      const doc = Odin.parse('age = ##-5');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'age',
            {
              path: 'age',
              type: { kind: 'integer' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'bounds' as const, min: 0, max: 150 }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
    });

    it('should fail when number is above maximum', () => {
      const doc = Odin.parse('age = ##200');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'age',
            {
              path: 'age',
              type: { kind: 'integer' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'bounds' as const, min: 0, max: 150 }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
    });

    it('should pass when number is at boundary', () => {
      const doc = Odin.parse('age = ##0');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'age',
            {
              path: 'age',
              type: { kind: 'integer' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'bounds' as const, min: 0, max: 150 }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(true);
    });
  });

  describe('Pattern Constraint Validation', () => {
    it('should fail when string does not match pattern', () => {
      const doc = Odin.parse('email = "not-an-email"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'email',
            {
              path: 'email',
              type: { kind: 'string' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'pattern' as const, pattern: '^[^@]+@[^@]+\\.[^@]+$' }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V004')).toBe(true);
    });

    it('should pass when string matches pattern', () => {
      const doc = Odin.parse('email = "user@example.com"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'email',
            {
              path: 'email',
              type: { kind: 'string' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'pattern' as const, pattern: '^[^@]+@[^@]+\\.[^@]+$' }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(true);
    });
  });

  describe('Enum Constraint Validation', () => {
    it('should fail when value is not in enum', () => {
      const doc = Odin.parse('status = "unknown"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'status',
            {
              path: 'status',
              type: { kind: 'string' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'enum' as const, values: ['active', 'inactive', 'pending'] }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V005')).toBe(true);
    });

    it('should pass when value is in enum', () => {
      const doc = Odin.parse('status = "active"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'status',
            {
              path: 'status',
              type: { kind: 'string' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'enum' as const, values: ['active', 'inactive', 'pending'] }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(true);
    });
  });

  describe('Cardinality Constraint Validation', () => {
    it('should fail one_of when none present', () => {
      const doc = Odin.parse('name = "John"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'name',
            {
              path: 'name',
              type: { kind: 'string' as const },
              required: false,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map([
          [
            '',
            [
              {
                kind: 'cardinality' as const,
                type: 'one_of' as const,
                fields: ['email', 'phone'],
              },
            ],
          ],
        ]),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V009')).toBe(true);
    });

    it('should pass one_of when one present', () => {
      const doc = Odin.parse('email = "user@example.com"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'email',
            {
              path: 'email',
              type: { kind: 'string' as const },
              required: false,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map([
          [
            '',
            [
              {
                kind: 'cardinality' as const,
                type: 'one_of' as const,
                fields: ['email', 'phone'],
              },
            ],
          ],
        ]),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(true);
    });

    it('should fail exactly_one when more than one present', () => {
      const doc = Odin.parse('email = "user@example.com"\nphone = "555-1234"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'email',
            {
              path: 'email',
              type: { kind: 'string' as const },
              required: false,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
          [
            'phone',
            {
              path: 'phone',
              type: { kind: 'string' as const },
              required: false,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map([
          [
            '',
            [
              {
                kind: 'cardinality' as const,
                type: 'exactly_one' as const,
                fields: ['email', 'phone'],
              },
            ],
          ],
        ]),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
    });

    it('should pass at_most_one when none present', () => {
      const doc = Odin.parse('name = "John"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'name',
            {
              path: 'name',
              type: { kind: 'string' as const },
              required: false,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map([
          [
            '',
            [
              {
                kind: 'cardinality' as const,
                type: 'at_most_one' as const,
                fields: ['email', 'phone'],
              },
            ],
          ],
        ]),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(true);
    });
  });

  describe('Array Validation', () => {
    it('should fail when array has too few items', () => {
      const doc = Odin.parse('items[0].name = "One"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map(),
        arrays: new Map([
          [
            'items',
            {
              path: 'items',
              minItems: 2,
              maxItems: 10,
              unique: false,
              itemFields: new Map([
                [
                  'name',
                  {
                    path: 'name',
                    type: { kind: 'string' as const },
                    required: true,
                    nullable: false,
                    confidential: false,
                    deprecated: false,
                    constraints: [],
                    conditionals: [],
                  },
                ],
              ]),
            },
          ],
        ]),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V006')).toBe(true);
    });

    it('should fail when array has too many items', () => {
      const doc = Odin.parse(`
        items[0].name = "One"
        items[1].name = "Two"
        items[2].name = "Three"
      `);
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map(),
        arrays: new Map([
          [
            'items',
            {
              path: 'items',
              minItems: 1,
              maxItems: 2,
              unique: false,
              itemFields: new Map([
                [
                  'name',
                  {
                    path: 'name',
                    type: { kind: 'string' as const },
                    required: true,
                    nullable: false,
                    confidential: false,
                    deprecated: false,
                    constraints: [],
                    conditionals: [],
                  },
                ],
              ]),
            },
          ],
        ]),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V006')).toBe(true);
    });
  });

  describe('Date Bounds Validation', () => {
    it('should fail when date is before minimum', () => {
      const doc = Odin.parse('effective = 2020-01-01');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'effective',
            {
              path: 'effective',
              type: { kind: 'date' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'bounds' as const, min: '2024-01-01', max: '2030-12-31' }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
    });

    it('should pass when date is within bounds', () => {
      const doc = Odin.parse('effective = 2025-06-15');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'effective',
            {
              path: 'effective',
              type: { kind: 'date' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'bounds' as const, min: '2024-01-01', max: '2030-12-31' }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(true);
    });
  });

  describe('String Length Bounds Validation', () => {
    it('should fail when string is too short', () => {
      const doc = Odin.parse('code = "AB"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'code',
            {
              path: 'code',
              type: { kind: 'string' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'bounds' as const, min: 5, max: 10 }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
    });

    it('should fail when string is too long', () => {
      const doc = Odin.parse('code = "ABCDEFGHIJKLMNOP"');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'code',
            {
              path: 'code',
              type: { kind: 'string' as const },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [{ kind: 'bounds' as const, min: 5, max: 10 }],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Reference Target Path Pattern Regex Injection Regression Tests
  // Ensures regex special characters in targetPath patterns are properly escaped
  // and don't cause regex syntax errors
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Reference Target Path Pattern - Regex Safety (Regression)', () => {
    it('should not throw regex syntax error with brackets in pattern', () => {
      // Brackets [ ] are regex character class delimiters
      // Without proper escaping, pattern "data[0].*" would be invalid regex
      const doc = Odin.parse('link = @simple.path');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'link',
            {
              path: 'link',
              type: { kind: 'reference' as const, targetPath: 'data[0].*' },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      // The critical test: validation should not throw a regex syntax error
      expect(() => Odin.validate(doc, schema as any)).not.toThrow();
    });

    it('should not throw regex syntax error with curly braces in pattern', () => {
      // Curly braces { } are regex quantifier delimiters
      const doc = Odin.parse('link = @simple.path');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'link',
            {
              path: 'link',
              type: { kind: 'reference' as const, targetPath: 'data{key}.*' },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      expect(() => Odin.validate(doc, schema as any)).not.toThrow();
    });

    it('should not throw regex syntax error with plus sign in pattern', () => {
      // Plus + is regex "one or more" quantifier
      const doc = Odin.parse('link = @simple.path');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'link',
            {
              path: 'link',
              type: { kind: 'reference' as const, targetPath: 'items+values.*' },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      expect(() => Odin.validate(doc, schema as any)).not.toThrow();
    });

    it('should not throw regex syntax error with question mark in pattern', () => {
      // Question mark ? is regex "zero or one" quantifier
      const doc = Odin.parse('link = @simple.path');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'link',
            {
              path: 'link',
              type: { kind: 'reference' as const, targetPath: 'optional?field.*' },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      expect(() => Odin.validate(doc, schema as any)).not.toThrow();
    });

    it('should not throw regex syntax error with caret in pattern', () => {
      // Caret ^ is regex start anchor (or negation in character class)
      const doc = Odin.parse('link = @simple.path');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'link',
            {
              path: 'link',
              type: { kind: 'reference' as const, targetPath: '^header.*' },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      expect(() => Odin.validate(doc, schema as any)).not.toThrow();
    });

    it('should not throw regex syntax error with multiple special chars in pattern', () => {
      // Test combination of special characters
      const doc = Odin.parse('link = @simple.path');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'link',
            {
              path: 'link',
              type: { kind: 'reference' as const, targetPath: 'data[0].items[1].value+extra' },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      expect(() => Odin.validate(doc, schema as any)).not.toThrow();
    });

    it('should reject reference not matching pattern (validates pattern works after escaping)', () => {
      // This verifies that after escaping, the pattern still correctly validates
      const doc = Odin.parse('link = @other.path');
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'link',
            {
              path: 'link',
              type: { kind: 'reference' as const, targetPath: 'users.*' },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      // Should be invalid because @other.path doesn't match users.*
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V004')).toBe(true);
    });
  });
});
