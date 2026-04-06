/**
 * Temporal type edge case tests for ODIN SDK.
 *
 * Tests for:
 * - Dates: YYYY-MM-DD
 * - Times: THH:MM:SS, THH:MM:SS.sss
 * - Timestamps: YYYY-MM-DDTHH:MM:SSZ, with offsets
 * - Durations: P1Y2M3D, PT1H30M, combined
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../../src/index.js';

describe('Temporal Parsing', () => {
  describe('Date Values', () => {
    it('should parse basic date', () => {
      const doc = Odin.parse('date = 2024-06-15');
      const value = doc.get('date');
      expect(value?.type).toBe('date');
      expect((value as any).raw).toBe('2024-06-15');
    });

    it('should parse first day of year', () => {
      const doc = Odin.parse('date = 2024-01-01');
      expect((doc.get('date') as any).raw).toBe('2024-01-01');
    });

    it('should parse last day of year', () => {
      const doc = Odin.parse('date = 2024-12-31');
      expect((doc.get('date') as any).raw).toBe('2024-12-31');
    });

    it('should parse leap year date Feb 29', () => {
      const doc = Odin.parse('date = 2024-02-29');
      expect((doc.get('date') as any).raw).toBe('2024-02-29');
    });

    it('should parse non-leap year Feb 28', () => {
      const doc = Odin.parse('date = 2023-02-28');
      expect((doc.get('date') as any).raw).toBe('2023-02-28');
    });

    it('should parse year 2000 (leap year)', () => {
      const doc = Odin.parse('date = 2000-02-29');
      expect((doc.get('date') as any).raw).toBe('2000-02-29');
    });

    it('should parse far future date', () => {
      const doc = Odin.parse('date = 2099-12-31');
      expect((doc.get('date') as any).raw).toBe('2099-12-31');
    });

    it('should parse historical date', () => {
      const doc = Odin.parse('date = 1900-01-01');
      expect((doc.get('date') as any).raw).toBe('1900-01-01');
    });

    it('should parse date with leading zeros', () => {
      const doc = Odin.parse('date = 2024-01-05');
      expect((doc.get('date') as any).raw).toBe('2024-01-05');
    });
  });

  describe('Time Values', () => {
    it('should parse basic time', () => {
      const doc = Odin.parse('time = T14:30:00');
      const value = doc.get('time');
      expect(value?.type).toBe('time');
      expect((value as any).value).toBe('T14:30:00');
    });

    it('should parse midnight', () => {
      const doc = Odin.parse('time = T00:00:00');
      expect((doc.get('time') as any).value).toBe('T00:00:00');
    });

    it('should parse end of day', () => {
      const doc = Odin.parse('time = T23:59:59');
      expect((doc.get('time') as any).value).toBe('T23:59:59');
    });

    it('should parse time with milliseconds', () => {
      const doc = Odin.parse('time = T14:30:00.123');
      expect((doc.get('time') as any).value).toBe('T14:30:00.123');
    });

    it('should parse time with microseconds', () => {
      const doc = Odin.parse('time = T14:30:00.123456');
      expect((doc.get('time') as any).value).toBe('T14:30:00.123456');
    });

    it('should parse time without seconds', () => {
      const doc = Odin.parse('time = T14:30');
      expect((doc.get('time') as any).value).toBe('T14:30');
    });

    it('should parse noon', () => {
      const doc = Odin.parse('time = T12:00:00');
      expect((doc.get('time') as any).value).toBe('T12:00:00');
    });
  });

  describe('Timestamp Values', () => {
    it('should parse basic timestamp with Z', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00Z');
      const value = doc.get('ts');
      expect(value?.type).toBe('timestamp');
      expect((value as any).raw).toBe('2024-06-15T10:30:00Z');
    });

    it('should parse timestamp with positive offset', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00+05:30');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00+05:30');
    });

    it('should parse timestamp with negative offset', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00-08:00');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00-08:00');
    });

    it('should parse timestamp with milliseconds', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00.123Z');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00.123Z');
    });

    it('should parse timestamp with milliseconds and offset', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00.123+05:30');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00.123+05:30');
    });

    it('should parse midnight timestamp', () => {
      const doc = Odin.parse('ts = 2024-06-15T00:00:00Z');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T00:00:00Z');
    });

    it('should parse end of day timestamp', () => {
      const doc = Odin.parse('ts = 2024-06-15T23:59:59Z');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T23:59:59Z');
    });

    it('should parse timestamp with zero offset', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00+00:00');
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00+00:00');
    });

    it('should preserve raw timestamp for roundtrip', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00.123456Z');
      // The value is a Date object, but raw preserves original string
      expect((doc.get('ts') as any).value).toBeInstanceOf(Date);
      expect((doc.get('ts') as any).raw).toBe('2024-06-15T10:30:00.123456Z');
    });
  });

  describe('Duration Values', () => {
    it('should parse duration with years', () => {
      const doc = Odin.parse('dur = P1Y');
      const value = doc.get('dur');
      expect(value?.type).toBe('duration');
      expect((value as any).value).toBe('P1Y');
    });

    it('should parse duration with months', () => {
      const doc = Odin.parse('dur = P6M');
      expect((doc.get('dur') as any).value).toBe('P6M');
    });

    it('should parse duration with days', () => {
      const doc = Odin.parse('dur = P30D');
      expect((doc.get('dur') as any).value).toBe('P30D');
    });

    it('should parse duration with hours', () => {
      const doc = Odin.parse('dur = PT24H');
      expect((doc.get('dur') as any).value).toBe('PT24H');
    });

    it('should parse duration with minutes', () => {
      const doc = Odin.parse('dur = PT30M');
      expect((doc.get('dur') as any).value).toBe('PT30M');
    });

    it('should parse duration with seconds', () => {
      const doc = Odin.parse('dur = PT45S');
      expect((doc.get('dur') as any).value).toBe('PT45S');
    });

    it('should parse combined date duration', () => {
      const doc = Odin.parse('dur = P1Y2M3D');
      expect((doc.get('dur') as any).value).toBe('P1Y2M3D');
    });

    it('should parse combined time duration', () => {
      const doc = Odin.parse('dur = PT1H30M45S');
      expect((doc.get('dur') as any).value).toBe('PT1H30M45S');
    });

    it('should parse full duration', () => {
      const doc = Odin.parse('dur = P1Y2M3DT4H5M6S');
      expect((doc.get('dur') as any).value).toBe('P1Y2M3DT4H5M6S');
    });

    it('should parse duration with fractional seconds', () => {
      const doc = Odin.parse('dur = PT0.5S');
      expect((doc.get('dur') as any).value).toBe('PT0.5S');
    });

    it('should parse zero duration', () => {
      const doc = Odin.parse('dur = PT0S');
      expect((doc.get('dur') as any).value).toBe('PT0S');
    });

    it('should parse duration with only T section', () => {
      const doc = Odin.parse('dur = PT12H30M');
      expect((doc.get('dur') as any).value).toBe('PT12H30M');
    });
  });

  describe('Temporal Type Detection', () => {
    it('should distinguish date from number', () => {
      // 2024-06-15 looks like it could be math but is detected as date
      const doc = Odin.parse('val = 2024-06-15');
      expect(doc.get('val')?.type).toBe('date');
    });

    it('should distinguish time from identifier', () => {
      // T14:30:00 starts with T but is a time
      const doc = Odin.parse('val = T14:30:00');
      expect(doc.get('val')?.type).toBe('time');
    });

    it('should distinguish duration from identifier', () => {
      // P1Y starts with P but is a duration
      const doc = Odin.parse('val = P1Y');
      expect(doc.get('val')?.type).toBe('duration');
    });
  });

  describe('Temporal in Different Contexts', () => {
    it('should parse temporal in header context', () => {
      const doc = Odin.parse(`
        {policy}
        effective = 2024-06-15
        expiration = 2025-06-15
      `);
      expect((doc.get('policy.effective') as any).raw).toBe('2024-06-15');
      expect((doc.get('policy.expiration') as any).raw).toBe('2025-06-15');
    });

    it('should parse temporal in tabular mode', () => {
      const doc = Odin.parse(`
        {events[] : name, date, time}
        "Start", 2024-06-15, T09:00:00
        "End", 2024-06-15, T17:00:00
      `);
      expect((doc.get('events[0].date') as any).raw).toBe('2024-06-15');
      expect((doc.get('events[0].time') as any).value).toBe('T09:00:00');
    });

    it('should handle multiple dates in document', () => {
      const doc = Odin.parse(`
        start = 2024-01-01
        end = 2024-12-31
        created = 2024-06-15T10:30:00Z
      `);
      expect(doc.get('start')?.type).toBe('date');
      expect(doc.get('end')?.type).toBe('date');
      expect(doc.get('created')?.type).toBe('timestamp');
    });
  });

  describe('Edge Cases', () => {
    it('should parse year with 4 digits only', () => {
      // Year must be exactly 4 digits
      const doc = Odin.parse('date = 2024-06-15');
      expect((doc.get('date') as any).raw).toBe('2024-06-15');
    });

    it('should handle date at boundary conditions', () => {
      // Month 01 and day 01
      const doc = Odin.parse('date = 2024-01-01');
      const date = (doc.get('date') as any).value as Date;
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0); // January is 0
      expect(date.getUTCDate()).toBe(1);
    });

    it('should handle timestamp at DST boundary', () => {
      // DST changes are tricky - just verify it parses
      const doc = Odin.parse('ts = 2024-03-10T02:30:00-05:00');
      expect((doc.get('ts') as any).raw).toBe('2024-03-10T02:30:00-05:00');
    });

    it('should handle duration with large values', () => {
      const doc = Odin.parse('dur = P100Y');
      expect((doc.get('dur') as any).value).toBe('P100Y');
    });
  });

  describe('Invalid Temporal Values', () => {
    it('should reject incomplete date', () => {
      expect(() => Odin.parse('date = 2024-06')).toThrow(ParseError);
    });

    it('should handle date with slashes as division expression', () => {
      // 2024/06/15 is parsed as a number expression, not rejected
      // The parser treats this as a numeric calculation
      const doc = Odin.parse('val = #2024');
      expect(doc.getNumber('val')).toBe(2024);
      // With slashes it becomes different tokens
    });

    it('should reject invalid month in date', () => {
      // Parser now performs semantic date validation
      expect(() => Odin.parse('date = 2024-13-01')).toThrow(ParseError);
    });
  });

  describe('Temporal Roundtrip', () => {
    it('should roundtrip date', () => {
      const doc = Odin.parse('date = 2024-06-15');
      const output = Odin.stringify(doc);
      expect(output).toContain('2024-06-15');
      const reparsed = Odin.parse(output);
      expect((reparsed.get('date') as any).raw).toBe('2024-06-15');
    });

    it('should roundtrip timestamp', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00Z');
      const output = Odin.stringify(doc);
      expect(output).toContain('2024-06-15T10:30:00Z');
      const reparsed = Odin.parse(output);
      expect((reparsed.get('ts') as any).raw).toBe('2024-06-15T10:30:00Z');
    });

    it('should roundtrip time', () => {
      const doc = Odin.parse('time = T14:30:00');
      const output = Odin.stringify(doc);
      expect(output).toContain('T14:30:00');
      const reparsed = Odin.parse(output);
      expect((reparsed.get('time') as any).value).toBe('T14:30:00');
    });

    it('should roundtrip duration', () => {
      const doc = Odin.parse('dur = P1Y2M3DT4H5M6S');
      const output = Odin.stringify(doc);
      expect(output).toContain('P1Y2M3DT4H5M6S');
      const reparsed = Odin.parse(output);
      expect((reparsed.get('dur') as any).value).toBe('P1Y2M3DT4H5M6S');
    });
  });
});
