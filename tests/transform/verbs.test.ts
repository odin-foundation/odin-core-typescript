/**
 * Tests for ODIN Transform Verbs
 */

import { describe, it, expect } from 'vitest';
import { defaultVerbRegistry, createVerbRegistry } from '../../src/transform/verbs.js';
import type { TransformContext, TransformValue, LookupTable } from '../../src/types/transform.js';

// Helper to create a minimal context
function createContext(overrides?: Partial<TransformContext>): TransformContext {
  return {
    source: {},
    current: undefined,
    aliases: new Map(),
    counters: new Map(),
    accumulators: new Map(),
    tables: new Map(),
    constants: new Map(),
    ...overrides,
  };
}

// Helper to create string value
const str = (s: string): TransformValue => ({ type: 'string', value: s });
const int = (n: number): TransformValue => ({ type: 'integer', value: n });
const num = (n: number): TransformValue => ({ type: 'number', value: n });
const bool = (b: boolean): TransformValue => ({ type: 'boolean', value: b });
const nil = (): TransformValue => ({ type: 'null' });
const date = (d: Date): TransformValue => ({ type: 'date', value: d });

describe('Transform Verbs', () => {
  describe('Core Verbs', () => {
    describe('concat', () => {
      it('concatenates string values', () => {
        const concat = defaultVerbRegistry.get('concat')!;
        const result = concat([str('Hello'), str(' '), str('World')], createContext());
        expect(result).toEqual(str('Hello World'));
      });

      it('concatenates mixed types', () => {
        const concat = defaultVerbRegistry.get('concat')!;
        const result = concat([str('Count: '), int(42)], createContext());
        expect(result).toEqual(str('Count: 42'));
      });
    });

    describe('upper', () => {
      it('converts to uppercase', () => {
        const upper = defaultVerbRegistry.get('upper')!;
        const result = upper([str('hello')], createContext());
        expect(result).toEqual(str('HELLO'));
      });
    });

    describe('lower', () => {
      it('converts to lowercase', () => {
        const lower = defaultVerbRegistry.get('lower')!;
        const result = lower([str('HELLO')], createContext());
        expect(result).toEqual(str('hello'));
      });
    });

    describe('trim', () => {
      it('trims whitespace', () => {
        const trim = defaultVerbRegistry.get('trim')!;
        const result = trim([str('  hello  ')], createContext());
        expect(result).toEqual(str('hello'));
      });
    });

    describe('trimLeft', () => {
      it('trims leading whitespace', () => {
        const trimLeft = defaultVerbRegistry.get('trimLeft')!;
        const result = trimLeft([str('  hello  ')], createContext());
        expect(result).toEqual(str('hello  '));
      });
    });

    describe('trimRight', () => {
      it('trims trailing whitespace', () => {
        const trimRight = defaultVerbRegistry.get('trimRight')!;
        const result = trimRight([str('  hello  ')], createContext());
        expect(result).toEqual(str('  hello'));
      });
    });

    describe('coalesce', () => {
      it('returns first non-null value', () => {
        const coalesce = defaultVerbRegistry.get('coalesce')!;
        const result = coalesce([nil(), str('default')], createContext());
        expect(result).toEqual(str('default'));
      });

      it('returns first value if not null', () => {
        const coalesce = defaultVerbRegistry.get('coalesce')!;
        const result = coalesce([str('first'), str('second')], createContext());
        expect(result).toEqual(str('first'));
      });
    });

    describe('ifNull', () => {
      it('returns fallback when null', () => {
        const ifNull = defaultVerbRegistry.get('ifNull')!;
        const result = ifNull([nil(), str('fallback')], createContext());
        expect(result).toEqual(str('fallback'));
      });

      it('returns original when not null', () => {
        const ifNull = defaultVerbRegistry.get('ifNull')!;
        const result = ifNull([str('original'), str('fallback')], createContext());
        expect(result).toEqual(str('original'));
      });
    });

    describe('ifEmpty', () => {
      it('returns fallback when empty string', () => {
        const ifEmpty = defaultVerbRegistry.get('ifEmpty')!;
        const result = ifEmpty([str(''), str('fallback')], createContext());
        expect(result).toEqual(str('fallback'));
      });

      it('returns original when not empty', () => {
        const ifEmpty = defaultVerbRegistry.get('ifEmpty')!;
        const result = ifEmpty([str('value'), str('fallback')], createContext());
        expect(result).toEqual(str('value'));
      });
    });

    describe('ifElse', () => {
      it('returns then value when condition is true', () => {
        const ifElse = defaultVerbRegistry.get('ifElse')!;
        const result = ifElse([bool(true), str('yes'), str('no')], createContext());
        expect(result).toEqual(str('yes'));
      });

      it('returns else value when condition is false', () => {
        const ifElse = defaultVerbRegistry.get('ifElse')!;
        const result = ifElse([bool(false), str('yes'), str('no')], createContext());
        expect(result).toEqual(str('no'));
      });
    });

    describe('type coercion', () => {
      it('coerceString converts number to string', () => {
        const coerceString = defaultVerbRegistry.get('coerceString')!;
        const result = coerceString([int(42)], createContext());
        expect(result).toEqual(str('42'));
      });

      it('coerceNumber converts string to number', () => {
        const coerceNumber = defaultVerbRegistry.get('coerceNumber')!;
        const result = coerceNumber([str('3.14')], createContext());
        expect(result).toEqual(num(3.14));
      });

      it('coerceInteger converts and truncates', () => {
        const coerceInteger = defaultVerbRegistry.get('coerceInteger')!;
        const result = coerceInteger([str('3.99')], createContext());
        expect(result).toEqual(int(3));
      });

      it('coerceBoolean converts truthy strings', () => {
        const coerceBoolean = defaultVerbRegistry.get('coerceBoolean')!;
        expect(coerceBoolean([str('true')], createContext())).toEqual(bool(true));
        expect(coerceBoolean([str('yes')], createContext())).toEqual(bool(true));
        expect(coerceBoolean([str('Y')], createContext())).toEqual(bool(true));
        expect(coerceBoolean([str('1')], createContext())).toEqual(bool(true));
        expect(coerceBoolean([str('false')], createContext())).toEqual(bool(false));
      });

      it('tryCoerce auto-detects integer from string', () => {
        const tryCoerce = defaultVerbRegistry.get('tryCoerce')!;
        expect(tryCoerce([str('42')], createContext())).toEqual(int(42));
        expect(tryCoerce([str('-100')], createContext())).toEqual(int(-100));
      });

      it('tryCoerce auto-detects number from string', () => {
        const tryCoerce = defaultVerbRegistry.get('tryCoerce')!;
        expect(tryCoerce([str('3.14')], createContext())).toEqual(num(3.14));
        expect(tryCoerce([str('-0.5')], createContext())).toEqual(num(-0.5));
      });

      it('tryCoerce auto-detects boolean from string', () => {
        const tryCoerce = defaultVerbRegistry.get('tryCoerce')!;
        expect(tryCoerce([str('true')], createContext())).toEqual(bool(true));
        expect(tryCoerce([str('false')], createContext())).toEqual(bool(false));
        expect(tryCoerce([str('TRUE')], createContext())).toEqual(bool(true));
      });

      it('tryCoerce passes through regular strings unchanged', () => {
        const tryCoerce = defaultVerbRegistry.get('tryCoerce')!;
        const result = tryCoerce([str('hello')], createContext());
        expect(result).toEqual(str('hello'));
      });

      it('tryCoerce converts empty string to null', () => {
        const tryCoerce = defaultVerbRegistry.get('tryCoerce')!;
        const result = tryCoerce([str('')], createContext());
        expect(result.type).toBe('null');
      });

      it('tryCoerce passes through already typed values', () => {
        const tryCoerce = defaultVerbRegistry.get('tryCoerce')!;
        expect(tryCoerce([int(42)], createContext())).toEqual(int(42));
        expect(tryCoerce([bool(true)], createContext())).toEqual(bool(true));
      });
    });

    describe('lookup', () => {
      it('looks up value in table', () => {
        const lookup = defaultVerbRegistry.get('lookup')!;
        const table: LookupTable = {
          name: 'STATUS',
          columns: ['name', 'code'],
          rows: [
            [str('active'), str('A')],
            [str('pending'), str('P')],
          ],
        };
        const context = createContext({ tables: new Map([['STATUS', table]]) });

        // New syntax: %lookup TABLE.column @match_value
        const result = lookup([str('STATUS.code'), str('active')], context);
        expect(result).toEqual(str('A'));
      });

      it('returns null for missing key', () => {
        const lookup = defaultVerbRegistry.get('lookup')!;
        const table: LookupTable = {
          name: 'STATUS',
          columns: ['name', 'code'],
          rows: [[str('active'), str('A')]],
        };
        const context = createContext({ tables: new Map([['STATUS', table]]) });

        const result = lookup([str('STATUS.code'), str('unknown')], context);
        expect(result).toEqual(nil());
      });

      it('supports reverse lookup with same syntax', () => {
        const lookup = defaultVerbRegistry.get('lookup')!;
        const table: LookupTable = {
          name: 'STATUS',
          columns: ['name', 'code'],
          rows: [
            [str('active'), str('A')],
            [str('pending'), str('P')],
          ],
        };
        const context = createContext({ tables: new Map([['STATUS', table]]) });

        // Reverse: get name where code matches
        const result = lookup([str('STATUS.name'), str('A')], context);
        expect(result).toEqual(str('active'));
      });

      it('supports multi-column tables', () => {
        const lookup = defaultVerbRegistry.get('lookup')!;
        const table: LookupTable = {
          name: 'RATE',
          columns: ['vehicle_type', 'coverage', 'base', 'factor'],
          rows: [
            [str('sedan'), str('liability'), int(250), num(1.15)],
            [str('sedan'), str('collision'), int(175), num(1.1)],
            [str('truck'), str('liability'), int(300), num(1.2)],
          ],
        };
        const context = createContext({ tables: new Map([['RATE', table]]) });

        // Get base where vehicle_type and coverage match
        const result = lookup([str('RATE.base'), str('sedan'), str('liability')], context);
        expect(result).toEqual(int(250));

        // Get factor from same table
        const factor = lookup([str('RATE.factor'), str('sedan'), str('liability')], context);
        expect(factor).toEqual(num(1.15));
      });
    });

    describe('lookupDefault', () => {
      it('returns default for missing key', () => {
        const lookupDefault = defaultVerbRegistry.get('lookupDefault')!;
        const table: LookupTable = {
          name: 'STATUS',
          columns: ['name', 'code'],
          rows: [[str('active'), str('A')]],
        };
        const context = createContext({ tables: new Map([['STATUS', table]]) });

        const result = lookupDefault([str('STATUS.code'), str('unknown'), str('X')], context);
        expect(result).toEqual(str('X'));
      });

      it('returns value when key exists', () => {
        const lookupDefault = defaultVerbRegistry.get('lookupDefault')!;
        const table: LookupTable = {
          name: 'STATUS',
          columns: ['name', 'code'],
          rows: [[str('active'), str('A')]],
        };
        const context = createContext({ tables: new Map([['STATUS', table]]) });

        const result = lookupDefault([str('STATUS.code'), str('active'), str('X')], context);
        expect(result).toEqual(str('A'));
      });
    });
  });

  describe('Date/Time Verbs', () => {
    describe('formatDate', () => {
      it('formats date with pattern', () => {
        const formatDate = defaultVerbRegistry.get('formatDate')!;
        const d = new Date(Date.UTC(2024, 5, 15)); // June 15, 2024
        const result = formatDate([date(d), str('YYYY-MM-DD')], createContext());
        expect(result).toEqual(str('2024-06-15'));
      });

      it('formats with US pattern', () => {
        const formatDate = defaultVerbRegistry.get('formatDate')!;
        const d = new Date(Date.UTC(2024, 5, 15));
        const result = formatDate([date(d), str('MMDDYYYY')], createContext());
        expect(result).toEqual(str('06152024'));
      });
    });

    describe('parseDate', () => {
      it('parses date from string', () => {
        const parseDate = defaultVerbRegistry.get('parseDate')!;
        const result = parseDate([str('20240615'), str('YYYYMMDD')], createContext());
        // parseDate returns ISO date string per spec
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('2024-06-15');
        }
      });
    });

    describe('today', () => {
      it('returns current date', () => {
        const today = defaultVerbRegistry.get('today')!;
        const result = today([], createContext());
        expect(result.type).toBe('date');
      });
    });

    describe('now', () => {
      it('returns current timestamp', () => {
        const now = defaultVerbRegistry.get('now')!;
        const result = now([], createContext());
        expect(result.type).toBe('timestamp');
      });
    });
  });

  describe('String Verbs', () => {
    describe('capitalize', () => {
      it('capitalizes first letter', () => {
        const capitalize = defaultVerbRegistry.get('capitalize')!;
        const result = capitalize([str('hello')], createContext());
        expect(result).toEqual(str('Hello'));
      });
    });

    describe('titleCase', () => {
      it('converts to title case', () => {
        const titleCase = defaultVerbRegistry.get('titleCase')!;
        const result = titleCase([str('hello world')], createContext());
        expect(result).toEqual(str('Hello World'));
      });
    });

    describe('length', () => {
      it('returns string length', () => {
        const length = defaultVerbRegistry.get('length')!;
        const result = length([str('hello')], createContext());
        expect(result).toEqual(int(5));
      });
    });

    describe('contains', () => {
      it('checks for substring', () => {
        const contains = defaultVerbRegistry.get('contains')!;
        expect(contains([str('hello world'), str('world')], createContext())).toEqual(bool(true));
        expect(contains([str('hello'), str('world')], createContext())).toEqual(bool(false));
      });
    });

    describe('startsWith', () => {
      it('checks prefix', () => {
        const startsWith = defaultVerbRegistry.get('startsWith')!;
        expect(startsWith([str('hello world'), str('hello')], createContext())).toEqual(bool(true));
        expect(startsWith([str('hello world'), str('world')], createContext())).toEqual(
          bool(false)
        );
      });
    });

    describe('endsWith', () => {
      it('checks suffix', () => {
        const endsWith = defaultVerbRegistry.get('endsWith')!;
        expect(endsWith([str('hello world'), str('world')], createContext())).toEqual(bool(true));
        expect(endsWith([str('hello world'), str('hello')], createContext())).toEqual(bool(false));
      });
    });

    describe('substring', () => {
      it('extracts substring', () => {
        const substring = defaultVerbRegistry.get('substring')!;
        const result = substring([str('hello world'), int(0), int(5)], createContext());
        expect(result).toEqual(str('hello'));
      });
    });

    describe('replace', () => {
      it('replaces all occurrences', () => {
        const replace = defaultVerbRegistry.get('replace')!;
        const result = replace([str('foo-bar-baz'), str('-'), str('_')], createContext());
        expect(result).toEqual(str('foo_bar_baz'));
      });
    });

    describe('padLeft', () => {
      it('pads string on left', () => {
        const padLeft = defaultVerbRegistry.get('padLeft')!;
        const result = padLeft([str('42'), int(5), str('0')], createContext());
        expect(result).toEqual(str('00042'));
      });
    });

    describe('padRight', () => {
      it('pads string on right', () => {
        const padRight = defaultVerbRegistry.get('padRight')!;
        const result = padRight([str('42'), int(5), str(' ')], createContext());
        expect(result).toEqual(str('42   '));
      });
    });

    describe('truncate', () => {
      it('truncates to max length', () => {
        const truncate = defaultVerbRegistry.get('truncate')!;
        const result = truncate([str('hello world'), int(5)], createContext());
        expect(result).toEqual(str('hello'));
      });
    });

    describe('split', () => {
      it('splits and returns element', () => {
        const split = defaultVerbRegistry.get('split')!;
        const result = split([str('a,b,c'), str(','), int(1)], createContext());
        expect(result).toEqual(str('b'));
      });

      it('handles negative index', () => {
        const split = defaultVerbRegistry.get('split')!;
        const result = split([str('a,b,c'), str(','), int(-1)], createContext());
        expect(result).toEqual(str('c'));
      });
    });
  });

  describe('Numeric Verbs', () => {
    describe('formatNumber', () => {
      it('formats with decimal places', () => {
        const formatNumber = defaultVerbRegistry.get('formatNumber')!;
        const result = formatNumber([num(3.14159), int(2)], createContext());
        expect(result).toEqual(str('3.14'));
      });
    });

    describe('formatInteger', () => {
      it('formats as integer', () => {
        const formatInteger = defaultVerbRegistry.get('formatInteger')!;
        const result = formatInteger([num(3.99)], createContext());
        expect(result).toEqual(str('3'));
      });
    });

    describe('formatCurrency', () => {
      it('formats with 2 decimals', () => {
        const formatCurrency = defaultVerbRegistry.get('formatCurrency')!;
        const result = formatCurrency([num(100)], createContext());
        expect(result).toEqual(str('100.00'));
      });
    });

    describe('abs', () => {
      it('returns absolute value', () => {
        const abs = defaultVerbRegistry.get('abs')!;
        expect(abs([int(-5)], createContext())).toEqual(int(5));
        expect(abs([int(5)], createContext())).toEqual(int(5));
      });
    });

    describe('round', () => {
      it('rounds to decimal places', () => {
        const round = defaultVerbRegistry.get('round')!;
        const result = round([num(3.14159), int(2)], createContext());
        expect(result).toEqual(num(3.14));
      });
    });

    describe('floor', () => {
      it('rounds down', () => {
        const floor = defaultVerbRegistry.get('floor')!;
        expect(floor([num(3.9)], createContext())).toEqual(int(3));
      });
    });

    describe('ceil', () => {
      it('rounds up', () => {
        const ceil = defaultVerbRegistry.get('ceil')!;
        expect(ceil([num(3.1)], createContext())).toEqual(int(4));
      });
    });

    describe('arithmetic', () => {
      it('adds values', () => {
        const add = defaultVerbRegistry.get('add')!;
        expect(add([int(10), int(5)], createContext())).toEqual(int(15));
      });

      it('subtracts values', () => {
        const subtract = defaultVerbRegistry.get('subtract')!;
        expect(subtract([int(10), int(3)], createContext())).toEqual(int(7));
      });

      it('multiplies values', () => {
        const multiply = defaultVerbRegistry.get('multiply')!;
        expect(multiply([int(10), int(3)], createContext())).toEqual(int(30));
      });

      it('divides values', () => {
        const divide = defaultVerbRegistry.get('divide')!;
        expect(divide([int(10), int(4)], createContext())).toEqual(num(2.5));
      });

      it('calculates modulo', () => {
        const mod = defaultVerbRegistry.get('mod')!;
        expect(mod([int(10), int(3)], createContext())).toEqual(int(1));
      });

      it('negates values', () => {
        const negate = defaultVerbRegistry.get('negate')!;
        expect(negate([int(5)], createContext())).toEqual(int(-5));
      });
    });
  });

  describe('Date Arithmetic', () => {
    describe('addDays', () => {
      it('adds days to date', () => {
        const addDays = defaultVerbRegistry.get('addDays')!;
        const d = new Date(Date.UTC(2024, 5, 15));
        const result = addDays([date(d), int(10)], createContext());
        // Date arithmetic verbs return ISO date strings per spec
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('2024-06-25');
        }
      });
    });

    describe('addMonths', () => {
      it('adds months to date', () => {
        const addMonths = defaultVerbRegistry.get('addMonths')!;
        const d = new Date(Date.UTC(2024, 5, 15));
        const result = addMonths([date(d), int(3)], createContext());
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('2024-09-15'); // September 15
        }
      });
    });

    describe('addYears', () => {
      it('adds years to date', () => {
        const addYears = defaultVerbRegistry.get('addYears')!;
        const d = new Date(Date.UTC(2024, 5, 15));
        const result = addYears([date(d), int(2)], createContext());
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('2026-06-15');
        }
      });
    });

    describe('dateDiff', () => {
      it('calculates difference in days', () => {
        const dateDiff = defaultVerbRegistry.get('dateDiff')!;
        const d1 = new Date(Date.UTC(2024, 5, 15));
        const d2 = new Date(Date.UTC(2024, 5, 25));
        const result = dateDiff([date(d1), date(d2), str('days')], createContext());
        expect(result).toEqual(int(10));
      });

      it('calculates difference in months', () => {
        const dateDiff = defaultVerbRegistry.get('dateDiff')!;
        const d1 = new Date(Date.UTC(2024, 0, 15));
        const d2 = new Date(Date.UTC(2024, 5, 15));
        const result = dateDiff([date(d1), date(d2), str('months')], createContext());
        expect(result).toEqual(int(5));
      });
    });
  });

  describe('Conditional', () => {
    describe('switch', () => {
      it('matches value and returns result', () => {
        const switchVerb = defaultVerbRegistry.get('switch')!;
        const result = switchVerb(
          [str('B'), str('A'), str('First'), str('B'), str('Second'), str('Default')],
          createContext()
        );
        expect(result).toEqual(str('Second'));
      });

      it('returns default when no match', () => {
        const switchVerb = defaultVerbRegistry.get('switch')!;
        const result = switchVerb(
          [str('X'), str('A'), str('First'), str('B'), str('Second'), str('Default')],
          createContext()
        );
        expect(result).toEqual(str('Default'));
      });
    });
  });

  describe('Regex Verbs', () => {
    describe('replaceRegex', () => {
      it('replaces using regex pattern', () => {
        const replaceRegex = defaultVerbRegistry.get('replaceRegex')!;
        const result = replaceRegex(
          [str('(512) 555-1234'), str('[^0-9]'), str('')],
          createContext()
        );
        expect(result).toEqual(str('5125551234'));
      });

      it('normalizes multiple spaces', () => {
        const replaceRegex = defaultVerbRegistry.get('replaceRegex')!;
        const result = replaceRegex(
          [str('too   many   spaces'), str('\\s+'), str(' ')],
          createContext()
        );
        expect(result).toEqual(str('too many spaces'));
      });
    });

    describe('mask', () => {
      it('applies phone mask', () => {
        const mask = defaultVerbRegistry.get('mask')!;
        const result = mask([str('5125551234'), str('###-###-####')], createContext());
        expect(result).toEqual(str('512-555-1234'));
      });

      it('applies SSN mask', () => {
        const mask = defaultVerbRegistry.get('mask')!;
        const result = mask([str('123456789'), str('###-##-####')], createContext());
        expect(result).toEqual(str('123-45-6789'));
      });
    });
  });

  describe('Time Formatting Verbs', () => {
    describe('formatTime', () => {
      it('formats time portion', () => {
        const formatTime = defaultVerbRegistry.get('formatTime')!;
        const d = new Date(Date.UTC(2024, 5, 15, 14, 30, 45));
        const result = formatTime(
          [{ type: 'timestamp', value: d }, str('HH:mm:ss')],
          createContext()
        );
        expect(result).toEqual(str('14:30:45'));
      });

      it('formats compact time', () => {
        const formatTime = defaultVerbRegistry.get('formatTime')!;
        const d = new Date(Date.UTC(2024, 5, 15, 9, 5, 7));
        const result = formatTime(
          [{ type: 'timestamp', value: d }, str('HHmmss')],
          createContext()
        );
        expect(result).toEqual(str('090507'));
      });
    });

    describe('formatTimestamp', () => {
      it('formats full timestamp', () => {
        const formatTimestamp = defaultVerbRegistry.get('formatTimestamp')!;
        const d = new Date(Date.UTC(2024, 5, 15, 14, 30, 45));
        const result = formatTimestamp(
          [{ type: 'timestamp', value: d }, str('YYYY-MM-DD HH:mm:ss')],
          createContext()
        );
        expect(result).toEqual(str('2024-06-15 14:30:45'));
      });

      it('formats compact timestamp', () => {
        const formatTimestamp = defaultVerbRegistry.get('formatTimestamp')!;
        const d = new Date(Date.UTC(2024, 5, 15, 14, 30, 45));
        const result = formatTimestamp(
          [{ type: 'timestamp', value: d }, str('YYYYMMDDHHmmss')],
          createContext()
        );
        expect(result).toEqual(str('20240615143045'));
      });
    });

    describe('parseTimestamp', () => {
      it('parses timestamp from string', () => {
        const parseTimestamp = defaultVerbRegistry.get('parseTimestamp')!;
        const result = parseTimestamp(
          [str('20240615143045'), str('YYYYMMDDHHmmss')],
          createContext()
        );
        // parseTimestamp returns ISO timestamp string per spec
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('2024-06-15T14:30:45');
        }
      });
    });
  });

  describe('Aggregation Verbs', () => {
    describe('accumulate', () => {
      it('adds value to accumulator', () => {
        const accumulate = defaultVerbRegistry.get('accumulate')!;
        const context = createContext({
          accumulators: new Map([['total', int(100)]]),
        });
        const result = accumulate([str('total'), int(50)], context);
        expect(result).toEqual(int(150));
        expect(context.accumulators.get('total')).toEqual(int(150));
      });
    });

    describe('sum', () => {
      it('sums array field values', () => {
        const sumVerb = defaultVerbRegistry.get('sum')!;
        const context = createContext({
          source: { items: [10, 20, 30] },
        });
        const result = sumVerb([str('items')], context);
        expect(result).toEqual(int(60)); // Returns integer when result is whole number
      });
    });

    describe('count', () => {
      it('counts array items', () => {
        const countVerb = defaultVerbRegistry.get('count')!;
        const context = createContext({
          source: { items: ['a', 'b', 'c', 'd'] },
        });
        const result = countVerb([str('items')], context);
        expect(result).toEqual(int(4));
      });
    });

    describe('min', () => {
      it('finds minimum value', () => {
        const minVerb = defaultVerbRegistry.get('min')!;
        const context = createContext({
          source: { values: [30, 10, 20, 50] },
        });
        const result = minVerb([str('values')], context);
        expect(result).toEqual(int(10)); // Returns integer when result is whole number
      });
    });

    describe('max', () => {
      it('finds maximum value', () => {
        const maxVerb = defaultVerbRegistry.get('max')!;
        const context = createContext({
          source: { values: [30, 10, 20, 50] },
        });
        const result = maxVerb([str('values')], context);
        expect(result).toEqual(int(50)); // Returns integer when result is whole number
      });
    });

    describe('avg', () => {
      it('calculates average', () => {
        const avgVerb = defaultVerbRegistry.get('avg')!;
        const context = createContext({
          source: { values: [10, 20, 30] },
        });
        const result = avgVerb([str('values')], context);
        expect(result).toEqual(int(20));
      });
    });

    describe('first', () => {
      it('returns first array item', () => {
        const firstVerb = defaultVerbRegistry.get('first')!;
        const context = createContext({
          source: { items: ['alpha', 'beta', 'gamma'] },
        });
        const result = firstVerb([str('items')], context);
        expect(result).toEqual(str('alpha'));
      });
    });

    describe('last', () => {
      it('returns last array item', () => {
        const lastVerb = defaultVerbRegistry.get('last')!;
        const context = createContext({
          source: { items: ['alpha', 'beta', 'gamma'] },
        });
        const result = lastVerb([str('items')], context);
        expect(result).toEqual(str('gamma'));
      });
    });
  });

  describe('Verb Registry', () => {
    it('can create new registry', () => {
      const registry = createVerbRegistry();
      expect(registry.get('concat')).toBeDefined();
    });

    it('can register custom verbs', () => {
      const registry = createVerbRegistry();
      registry.register('com.example', 'double', (args) => {
        const val = args[0];
        if (val?.type === 'integer' || val?.type === 'number') {
          return { type: 'integer', value: val.value * 2 };
        }
        return { type: 'null' };
      });

      const customVerb = registry.getCustom('com.example.double');
      expect(customVerb).toBeDefined();

      const result = customVerb!([int(21)], createContext());
      expect(result).toEqual(int(42));
    });
  });
});
