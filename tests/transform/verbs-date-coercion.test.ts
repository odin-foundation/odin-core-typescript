/**
 * Date Coercion Verbs Tests
 *
 * Comprehensive tests for coerceDate and coerceTimestamp verbs.
 * These verbs have complex parsing logic supporting multiple date formats:
 * - ISO 8601 formats
 * - Unix timestamps (ms and s with auto-detection)
 * - US format (MM/DD/YYYY)
 * - European format (DD/MM/YYYY, DD.MM.YYYY)
 * - Compact format (YYYYMMDD)
 * - Written formats (Month DD, YYYY and DD Month YYYY)
 */

import { describe, it, expect } from 'vitest';
import { callVerb, str, int, num, bool, nil, date, timestamp } from './helpers.js';

describe('Date Coercion Verbs', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // coerceDate
  // ─────────────────────────────────────────────────────────────────────────────

  describe('coerceDate', () => {
    describe('ISO 8601 formats', () => {
      it('parses ISO date string (YYYY-MM-DD)', () => {
        const result = callVerb('coerceDate', [str('2024-06-15')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCFullYear()).toBe(2024);
          expect(result.value.getUTCMonth()).toBe(5); // June (0-indexed)
          expect(result.value.getUTCDate()).toBe(15);
        }
      });

      it('parses ISO datetime with Z', () => {
        const result = callVerb('coerceDate', [str('2024-06-15T14:30:00Z')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCFullYear()).toBe(2024);
          expect(result.value.getUTCMonth()).toBe(5);
          expect(result.value.getUTCDate()).toBe(15);
        }
      });

      it('parses ISO datetime with timezone offset', () => {
        const result = callVerb('coerceDate', [str('2024-06-15T14:30:00+05:30')]);
        expect(result.type).toBe('date');
      });

      it('parses ISO datetime with milliseconds', () => {
        const result = callVerb('coerceDate', [str('2024-06-15T14:30:00.123Z')]);
        expect(result.type).toBe('date');
      });

      it('parses first day of year', () => {
        const result = callVerb('coerceDate', [str('2024-01-01')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(0);
          expect(result.value.getUTCDate()).toBe(1);
        }
      });

      it('parses last day of year', () => {
        const result = callVerb('coerceDate', [str('2024-12-31')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(11);
          expect(result.value.getUTCDate()).toBe(31);
        }
      });
    });

    describe('Unix timestamps', () => {
      it('parses millisecond timestamp (number)', () => {
        // 2024-06-15T00:00:00Z in milliseconds
        const ms = Date.UTC(2024, 5, 15);
        const result = callVerb('coerceDate', [int(ms)]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCFullYear()).toBe(2024);
          expect(result.value.getUTCMonth()).toBe(5);
          expect(result.value.getUTCDate()).toBe(15);
        }
      });

      it('parses second timestamp (auto-detected)', () => {
        // Timestamps under 100 billion are treated as seconds
        const seconds = Math.floor(Date.UTC(2024, 5, 15) / 1000);
        const result = callVerb('coerceDate', [int(seconds)]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCFullYear()).toBe(2024);
        }
      });

      it('correctly distinguishes ms vs seconds at threshold', () => {
        // 100_000_000_000 ms = ~1973
        // 100_000_000_000 s = ~5138
        // Below threshold: treated as seconds
        const belowThreshold = 99_999_999_999;
        const result = callVerb('coerceDate', [int(belowThreshold)]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          // Should be treated as seconds, giving a date around year 5138
          expect(result.value.getFullYear()).toBeGreaterThan(5000);
        }
      });

      it('parses timestamp string as numeric', () => {
        const ms = Date.UTC(2024, 5, 15);
        const result = callVerb('coerceDate', [str(String(ms))]);
        expect(result.type).toBe('date');
      });

      it('returns null for zero timestamp', () => {
        const result = callVerb('coerceDate', [int(0)]);
        expect(result.type).toBe('null');
      });

      it('handles negative timestamp (dates before 1970)', () => {
        // 1969-06-15 as negative ms
        const ms = Date.UTC(1969, 5, 15);
        const result = callVerb('coerceDate', [int(ms)]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCFullYear()).toBe(1969);
        }
      });
    });

    describe('US format (MM/DD/YYYY)', () => {
      it('parses standard US format', () => {
        const result = callVerb('coerceDate', [str('06/15/2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(5); // June
          expect(result.value.getUTCDate()).toBe(15);
          expect(result.value.getUTCFullYear()).toBe(2024);
        }
      });

      it('parses US format with single-digit month', () => {
        const result = callVerb('coerceDate', [str('6/15/2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(5);
        }
      });

      it('parses US format with single-digit day', () => {
        const result = callVerb('coerceDate', [str('06/5/2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCDate()).toBe(5);
        }
      });

      it('parses US format with both single digits', () => {
        const result = callVerb('coerceDate', [str('1/2/2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(0); // January
          expect(result.value.getUTCDate()).toBe(2);
        }
      });
    });

    describe('European format (DD/MM/YYYY, DD.MM.YYYY)', () => {
      it('parses unambiguous European format (day > 12)', () => {
        const result = callVerb('coerceDate', [str('15/06/2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCDate()).toBe(15);
          expect(result.value.getUTCMonth()).toBe(5); // June
        }
      });

      it('parses European dot format', () => {
        const result = callVerb('coerceDate', [str('15.06.2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCDate()).toBe(15);
          expect(result.value.getUTCMonth()).toBe(5);
        }
      });

      it('defaults to US format for ambiguous dates', () => {
        // 01/02/2024 - ambiguous (Jan 2 US or Feb 1 EU)
        // Implementation defaults to US when ambiguous
        const result = callVerb('coerceDate', [str('01/02/2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          // US interpretation: January 2
          expect(result.value.getUTCMonth()).toBe(0);
          expect(result.value.getUTCDate()).toBe(2);
        }
      });
    });

    describe('Compact format (YYYYMMDD)', () => {
      it('parses compact 8-digit format', () => {
        const result = callVerb('coerceDate', [str('20240615')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCFullYear()).toBe(2024);
          expect(result.value.getUTCMonth()).toBe(5);
          expect(result.value.getUTCDate()).toBe(15);
        }
      });

      it('parses compact format for January', () => {
        const result = callVerb('coerceDate', [str('20240101')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(0);
          expect(result.value.getUTCDate()).toBe(1);
        }
      });

      it('parses compact format for December', () => {
        const result = callVerb('coerceDate', [str('20241231')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(11);
          expect(result.value.getUTCDate()).toBe(31);
        }
      });
    });

    describe('Written formats', () => {
      it('parses "Month DD, YYYY" format', () => {
        const result = callVerb('coerceDate', [str('June 15, 2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(5);
          expect(result.value.getUTCDate()).toBe(15);
        }
      });

      it('parses "Month DD YYYY" format (no comma)', () => {
        const result = callVerb('coerceDate', [str('June 15 2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(5);
        }
      });

      it('parses "DD Month YYYY" format', () => {
        const result = callVerb('coerceDate', [str('15 June 2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCDate()).toBe(15);
          expect(result.value.getUTCMonth()).toBe(5);
        }
      });

      it('parses abbreviated month names', () => {
        const result = callVerb('coerceDate', [str('Jun 15, 2024')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(5);
        }
      });

      it('handles all month names', () => {
        const months = [
          { name: 'January', idx: 0 },
          { name: 'February', idx: 1 },
          { name: 'March', idx: 2 },
          { name: 'April', idx: 3 },
          { name: 'May', idx: 4 },
          { name: 'June', idx: 5 },
          { name: 'July', idx: 6 },
          { name: 'August', idx: 7 },
          { name: 'September', idx: 8 },
          { name: 'October', idx: 9 },
          { name: 'November', idx: 10 },
          { name: 'December', idx: 11 },
        ];

        for (const { name, idx } of months) {
          const result = callVerb('coerceDate', [str(`${name} 1, 2024`)]);
          expect(result.type).toBe('date');
          if (result.type === 'date') {
            expect(result.value.getUTCMonth()).toBe(idx);
          }
        }
      });

      it('handles abbreviated month names', () => {
        const abbreviations = [
          { abbr: 'Jan', idx: 0 },
          { abbr: 'Feb', idx: 1 },
          { abbr: 'Mar', idx: 2 },
          { abbr: 'Apr', idx: 3 },
          { abbr: 'Jun', idx: 5 },
          { abbr: 'Jul', idx: 6 },
          { abbr: 'Aug', idx: 7 },
          { abbr: 'Sep', idx: 8 },
          { abbr: 'Sept', idx: 8 },
          { abbr: 'Oct', idx: 9 },
          { abbr: 'Nov', idx: 10 },
          { abbr: 'Dec', idx: 11 },
        ];

        for (const { abbr, idx } of abbreviations) {
          const result = callVerb('coerceDate', [str(`${abbr} 1, 2024`)]);
          expect(result.type).toBe('date');
          if (result.type === 'date') {
            expect(result.value.getUTCMonth()).toBe(idx);
          }
        }
      });

      it('is case-insensitive for month names', () => {
        const result1 = callVerb('coerceDate', [str('JUNE 15, 2024')]);
        const result2 = callVerb('coerceDate', [str('june 15, 2024')]);
        const result3 = callVerb('coerceDate', [str('JuNe 15, 2024')]);

        expect(result1.type).toBe('date');
        expect(result2.type).toBe('date');
        expect(result3.type).toBe('date');
      });
    });

    describe('Leap year handling', () => {
      it('accepts Feb 29 on leap year (divisible by 4)', () => {
        const result = callVerb('coerceDate', [str('2024-02-29')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCMonth()).toBe(1);
          expect(result.value.getUTCDate()).toBe(29);
        }
      });

      it('accepts Feb 29 on leap year (divisible by 400)', () => {
        const result = callVerb('coerceDate', [str('2000-02-29')]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCDate()).toBe(29);
        }
      });

      it('rejects Feb 29 on non-leap year', () => {
        // 2023 is not a leap year
        const result = callVerb('coerceDate', [str('20230229')]);
        expect(result.type).toBe('null');
      });

      it('rejects Feb 29 on century non-divisible by 400', () => {
        // 1900 is not a leap year (divisible by 100 but not 400)
        const result = callVerb('coerceDate', [str('19000229')]);
        expect(result.type).toBe('null');
      });
    });

    describe('Invalid inputs', () => {
      it('returns null for empty string', () => {
        const result = callVerb('coerceDate', [str('')]);
        expect(result.type).toBe('null');
      });

      it('returns null for null value', () => {
        const result = callVerb('coerceDate', [nil()]);
        expect(result.type).toBe('null');
      });

      it('returns null for whitespace-only string', () => {
        const result = callVerb('coerceDate', [str('   ')]);
        expect(result.type).toBe('null');
      });

      it('returns null for invalid date string', () => {
        const result = callVerb('coerceDate', [str('not a date')]);
        expect(result.type).toBe('null');
      });

      it('returns null for Feb 30', () => {
        const result = callVerb('coerceDate', [str('20240230')]);
        expect(result.type).toBe('null');
      });

      it('returns null for Feb 31', () => {
        const result = callVerb('coerceDate', [str('20240231')]);
        expect(result.type).toBe('null');
      });

      it('returns null for invalid month', () => {
        const result = callVerb('coerceDate', [str('20241315')]);
        expect(result.type).toBe('null');
      });

      it('returns null for invalid day', () => {
        const result = callVerb('coerceDate', [str('20240632')]);
        expect(result.type).toBe('null');
      });

      it('returns null for boolean input', () => {
        const result = callVerb('coerceDate', [bool(true)]);
        expect(result.type).toBe('null');
      });

      it('returns null with no arguments', () => {
        const result = callVerb('coerceDate', []);
        expect(result.type).toBe('null');
      });
    });

    describe('Pass-through behavior', () => {
      it('passes through existing date values', () => {
        const d = new Date(Date.UTC(2024, 5, 15));
        const result = callVerb('coerceDate', [date(d)]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value).toBe(d);
        }
      });

      it('passes through existing timestamp values', () => {
        const d = new Date(Date.UTC(2024, 5, 15, 14, 30, 0));
        const result = callVerb('coerceDate', [timestamp(d)]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value).toBe(d);
        }
      });
    });

    describe('Number coercion', () => {
      it('handles float timestamps (truncates)', () => {
        const ms = Date.UTC(2024, 5, 15) + 0.5;
        const result = callVerb('coerceDate', [num(ms)]);
        expect(result.type).toBe('date');
      });

      it('handles currency values as timestamps', () => {
        const ms = Date.UTC(2024, 5, 15);
        const result = callVerb('coerceDate', [{ type: 'currency', value: ms }]);
        expect(result.type).toBe('date');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // coerceTimestamp
  // ─────────────────────────────────────────────────────────────────────────────

  describe('coerceTimestamp', () => {
    it('returns timestamp type instead of date', () => {
      const result = callVerb('coerceTimestamp', [str('2024-06-15T14:30:00Z')]);
      expect(result.type).toBe('timestamp');
    });

    it('preserves time information in timestamp', () => {
      const result = callVerb('coerceTimestamp', [str('2024-06-15T14:30:45.123Z')]);
      expect(result.type).toBe('timestamp');
      if (result.type === 'timestamp') {
        expect(result.value.getUTCHours()).toBe(14);
        expect(result.value.getUTCMinutes()).toBe(30);
        expect(result.value.getUTCSeconds()).toBe(45);
        expect(result.value.getUTCMilliseconds()).toBe(123);
      }
    });

    it('parses date-only strings as timestamp', () => {
      const result = callVerb('coerceTimestamp', [str('2024-06-15')]);
      expect(result.type).toBe('timestamp');
      if (result.type === 'timestamp') {
        expect(result.value.getUTCFullYear()).toBe(2024);
      }
    });

    it('handles Unix timestamps', () => {
      const ms = Date.UTC(2024, 5, 15, 14, 30, 0);
      const result = callVerb('coerceTimestamp', [int(ms)]);
      expect(result.type).toBe('timestamp');
      if (result.type === 'timestamp') {
        expect(result.value.getUTCHours()).toBe(14);
        expect(result.value.getUTCMinutes()).toBe(30);
      }
    });

    it('returns null for invalid input', () => {
      const result = callVerb('coerceTimestamp', [str('not a timestamp')]);
      expect(result.type).toBe('null');
    });

    it('returns null for empty string', () => {
      const result = callVerb('coerceTimestamp', [str('')]);
      expect(result.type).toBe('null');
    });

    it('returns null with no arguments', () => {
      const result = callVerb('coerceTimestamp', []);
      expect(result.type).toBe('null');
    });

    it('passes through existing timestamp values', () => {
      const d = new Date(Date.UTC(2024, 5, 15, 14, 30, 0));
      const result = callVerb('coerceTimestamp', [timestamp(d)]);
      expect(result.type).toBe('timestamp');
      if (result.type === 'timestamp') {
        expect(result.value).toBe(d);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge cases and boundary conditions
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('handles dates at year boundaries', () => {
      const newYear = callVerb('coerceDate', [str('2024-01-01')]);
      const newYearsEve = callVerb('coerceDate', [str('2024-12-31')]);

      expect(newYear.type).toBe('date');
      expect(newYearsEve.type).toBe('date');
    });

    it('handles month boundary dates', () => {
      // 31-day months
      const jan31 = callVerb('coerceDate', [str('2024-01-31')]);
      const mar31 = callVerb('coerceDate', [str('2024-03-31')]);

      // 30-day months
      const apr30 = callVerb('coerceDate', [str('2024-04-30')]);
      const jun30 = callVerb('coerceDate', [str('2024-06-30')]);

      expect(jan31.type).toBe('date');
      expect(mar31.type).toBe('date');
      expect(apr30.type).toBe('date');
      expect(jun30.type).toBe('date');
    });

    it('rejects invalid month boundary dates', () => {
      const apr31 = callVerb('coerceDate', [str('20240431')]);
      const jun31 = callVerb('coerceDate', [str('20240631')]);

      expect(apr31.type).toBe('null');
      expect(jun31.type).toBe('null');
    });

    it('handles very old dates', () => {
      const oldDate = callVerb('coerceDate', [str('1900-01-01')]);
      expect(oldDate.type).toBe('date');
      if (oldDate.type === 'date') {
        expect(oldDate.value.getUTCFullYear()).toBe(1900);
      }
    });

    it('handles future dates', () => {
      const futureDate = callVerb('coerceDate', [str('2099-12-31')]);
      expect(futureDate.type).toBe('date');
      if (futureDate.type === 'date') {
        expect(futureDate.value.getUTCFullYear()).toBe(2099);
      }
    });

    it('handles single-digit day in written format', () => {
      const result = callVerb('coerceDate', [str('June 1, 2024')]);
      expect(result.type).toBe('date');
      if (result.type === 'date') {
        expect(result.value.getUTCDate()).toBe(1);
      }
    });

    it('trims whitespace from input', () => {
      const result = callVerb('coerceDate', [str('  2024-06-15  ')]);
      expect(result.type).toBe('date');
    });
  });
});
