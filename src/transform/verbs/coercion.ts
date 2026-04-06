/**
 * ODIN Transform Coercion Verbs
 *
 * Type coercion verbs: coerceString, coerceNumber, coerceInteger,
 * coerceBoolean, coerceDate, coerceTimestamp.
 */

import type { VerbFunction, TransformValue } from '../../types/transform.js';
import {
  toString,
  toNumber,
  toBoolean,
  str,
  int,
  bool,
  nil,
  numericResult,
  UNIX_TIMESTAMP_SECONDS_THRESHOLD,
} from './helpers.js';
import { formatDateOnly as formatDateOnlyUtil } from '../../utils/format-utils.js';

/**
 * %coerceString @path - Convert to string
 */
export const coerceString: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return str(toString(args[0]!));
};

/**
 * %coerceNumber @path - Convert to number
 */
export const coerceNumber: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return numericResult(toNumber(args[0]!));
};

/**
 * %coerceInteger @path - Convert to integer
 */
export const coerceInteger: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return int(Math.floor(toNumber(args[0]!)));
};

/**
 * %coerceBoolean @path - Convert to boolean
 */
export const coerceBoolean: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return bool(toBoolean(args[0]!));
};

// ─────────────────────────────────────────────────────────────────────────────
// Date Coercion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate date parts are within valid ranges
 */
function isValidDateParts(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999) return false;
  if (month < 0 || month > 11) return false;
  if (day < 1 || day > 31) return false;

  // Check days in month
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Leap year check
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (isLeapYear && month === 1) {
    return day <= 29;
  }

  return day <= (daysInMonth[month] ?? 31);
}

/**
 * Comprehensive date coercion supporting multiple input formats.
 * Inspired by Zod's coerce.date() - handles strings, numbers, and dates.
 */
function coerceDateValue(val: TransformValue): Date | null {
  // Already a date type - return as-is
  if (val.type === 'date' || val.type === 'timestamp') {
    return val.value;
  }

  // Null returns null
  if (val.type === 'null') {
    return null;
  }

  // Number - treat as Unix timestamp
  if (
    val.type === 'integer' ||
    val.type === 'number' ||
    val.type === 'currency' ||
    val.type === 'percent'
  ) {
    const num = val.value;
    if (num === 0) return null;

    const isSeconds = num > 0 && num < UNIX_TIMESTAMP_SECONDS_THRESHOLD;
    const ms = isSeconds ? num * 1000 : num;

    const date = new Date(ms);
    if (isNaN(date.getTime())) return null;
    return date;
  }

  // Boolean - invalid for date
  if (val.type === 'boolean') {
    return null;
  }

  // Array/Object/Reference/Binary/Verb - invalid for date
  if (
    val.type === 'array' ||
    val.type === 'object' ||
    val.type === 'reference' ||
    val.type === 'binary' ||
    val.type === 'verb'
  ) {
    return null;
  }

  // String/Time/Duration - try multiple parsing strategies
  const str = val.value.trim();
  if (str === '') return null;

  // Strategy 1: Try native Date parsing (handles ISO 8601 and many formats)
  let date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Strategy 2: Compact format YYYYMMDD
  if (/^\d{8}$/.test(str)) {
    const year = parseInt(str.slice(0, 4), 10);
    const month = parseInt(str.slice(4, 6), 10) - 1;
    const day = parseInt(str.slice(6, 8), 10);
    if (!isValidDateParts(year, month, day)) {
      return null;
    }
    date = new Date(Date.UTC(year, month, day));
    if (!isNaN(date.getTime())) {
      return date;
    }
    return null;
  }

  // Strategy 3 & 4: Handle US (MM/DD/YYYY) and European (DD/MM/YYYY) formats
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const first = parseInt(slashMatch[1]!, 10);
    const second = parseInt(slashMatch[2]!, 10);
    const year = parseInt(slashMatch[3]!, 10);

    if (first > 12) {
      const day = first;
      const month = second - 1;
      if (!isValidDateParts(year, month, day)) {
        return null;
      }
      date = new Date(Date.UTC(year, month, day));
      if (!isNaN(date.getTime())) {
        return date;
      }
      return null;
    }

    const month = first - 1;
    const day = second;
    if (!isValidDateParts(year, month, day)) {
      return null;
    }
    date = new Date(Date.UTC(year, month, day));
    if (!isNaN(date.getTime())) {
      return date;
    }
    return null;
  }

  // European format with dot separator DD.MM.YYYY
  const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1]!, 10);
    const month = parseInt(dotMatch[2]!, 10) - 1;
    const year = parseInt(dotMatch[3]!, 10);
    if (!isValidDateParts(year, month, day)) {
      return null;
    }
    date = new Date(Date.UTC(year, month, day));
    if (!isNaN(date.getTime())) {
      return date;
    }
    return null;
  }

  // Strategy 5: Written formats "June 15, 2024" or "15 June 2024"
  const monthNames: Record<string, number> = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sep: 8,
    sept: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11,
  };

  const writtenMatch1 = str.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (writtenMatch1) {
    const monthStr = writtenMatch1[1]!.toLowerCase();
    const month = monthNames[monthStr];
    if (month !== undefined) {
      const day = parseInt(writtenMatch1[2]!, 10);
      const year = parseInt(writtenMatch1[3]!, 10);
      if (!isValidDateParts(year, month, day)) {
        return null;
      }
      date = new Date(Date.UTC(year, month, day));
      if (!isNaN(date.getTime())) {
        return date;
      }
      return null;
    }
  }

  const writtenMatch2 = str.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (writtenMatch2) {
    const day = parseInt(writtenMatch2[1]!, 10);
    const monthStr = writtenMatch2[2]!.toLowerCase();
    const month = monthNames[monthStr];
    if (month !== undefined) {
      const year = parseInt(writtenMatch2[3]!, 10);
      if (!isValidDateParts(year, month, day)) {
        return null;
      }
      date = new Date(Date.UTC(year, month, day));
      if (!isNaN(date.getTime())) {
        return date;
      }
      return null;
    }
  }

  // Strategy 6: Numeric string (Unix timestamp)
  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    const isSeconds = num < UNIX_TIMESTAMP_SECONDS_THRESHOLD;
    const ms = isSeconds ? num * 1000 : num;
    date = new Date(ms);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

/**
 * Helper to format date as YYYY-MM-DD string.
 * Re-exported from format-utils for internal use in this module.
 */
function formatDateOnly(d: Date): string {
  return formatDateOnlyUtil(d);
}

/**
 * %coerceDate @path - Convert value to date with comprehensive format support
 */
export const coerceDate: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = coerceDateValue(args[0]!);
  if (date === null) return nil();

  return { type: 'date', value: date, raw: formatDateOnly(date) };
};

/**
 * %coerceTimestamp @path - Convert value to timestamp with comprehensive format support
 */
export const coerceTimestamp: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = coerceDateValue(args[0]!);
  if (date === null) return nil();

  return { type: 'timestamp', value: date, raw: date.toISOString() };
};

// ─────────────────────────────────────────────────────────────────────────────
// Collection Coercion Verbs
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Detection Coercion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %tryCoerce @value - Attempt to detect and coerce value to its natural type
 *
 * Tries to infer the type from a string value and coerce it. Falls back to
 * the original value if no type can be detected. Useful for XML/CSV sources
 * where all values come in as strings.
 *
 * Detection order (most specific first):
 * 1. null/empty → null
 * 2. "true"/"false" (case insensitive) → boolean
 * 3. Integer pattern (^-?\d+$) → integer
 * 4. Number pattern (^-?\d*\.\d+$) → number
 * 5. ISO date pattern (YYYY-MM-DD) → date
 * 6. ISO timestamp pattern → timestamp
 * 7. Otherwise → original value unchanged
 *
 * @example
 * val = "%tryCoerce @.amount"     ; "42" → ##42, "3.14" → #3.14
 * val = "%tryCoerce @.flag"       ; "true" → ?true
 * val = "%tryCoerce @.name"       ; "John" → "John" (unchanged)
 */
export const tryCoerce: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const val = args[0]!;

  // Already typed (not string) - return as-is
  if (val.type !== 'string') {
    return val;
  }

  const s = val.value.trim();

  // Empty string → null
  if (s === '') {
    return nil();
  }

  // Boolean detection (case insensitive)
  const lower = s.toLowerCase();
  if (lower === 'true') {
    return bool(true);
  }
  if (lower === 'false') {
    return bool(false);
  }

  // Integer pattern: optional minus, one or more digits
  if (/^-?\d+$/.test(s)) {
    const num = parseInt(s, 10);
    if (!isNaN(num) && Number.isSafeInteger(num)) {
      return int(num);
    }
  }

  // Number pattern: optional minus, optional digits, dot, one or more digits
  if (/^-?\d*\.\d+$/.test(s) || /^-?\d+\.\d*$/.test(s)) {
    const num = parseFloat(s);
    if (!isNaN(num) && isFinite(num)) {
      return numericResult(num);
    }
  }

  // ISO date pattern: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const date = new Date(s + 'T00:00:00Z');
    if (!isNaN(date.getTime())) {
      return { type: 'date', value: date, raw: s };
    }
  }

  // ISO timestamp pattern: YYYY-MM-DDTHH:MM:SS with optional timezone
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
    const date = new Date(s);
    if (!isNaN(date.getTime())) {
      return { type: 'timestamp', value: date, raw: date.toISOString() };
    }
  }

  // No pattern matched - return original string value
  return val;
};

// ─────────────────────────────────────────────────────────────────────────────
// Collection Coercion Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %toArray @value - Wrap value in array if not already an array
 *
 * Ensures value is always an array. Useful for normalizing inputs that
 * may be single values or arrays.
 *
 * @example
 * arr = "%toArray @.tags"       ; "single" → ["single"], ["a","b"] → ["a","b"]
 * arr = "%toArray @.maybeList"  ; null → []
 */
export const toArray: VerbFunction = (args) => {
  if (args.length === 0) return { type: 'array' as const, items: [] };

  const val = args[0]!;

  // Already an array - return as-is
  if (val.type === 'array') {
    return val;
  }

  // Null/undefined - return empty array
  if (val.type === 'null') {
    return { type: 'array' as const, items: [] };
  }

  // Wrap in array
  return { type: 'array' as const, items: [val] };
};

/**
 * %toObject @array - Convert array of key-value pairs to object
 *
 * Converts an array of [key, value] pairs (or {key, value} objects) to
 * a single object. Useful for transforming entry arrays back to objects.
 *
 * @example
 * obj = "%toObject @.pairs"  ; [["a",1],["b",2]] → {a:1, b:2}
 * obj = "%toObject @.kvs"    ; [{key:"a",value:1}] → {a:1}
 */
export const toObject: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const val = args[0]!;

  // Must be an array
  if (val.type !== 'array') {
    return nil();
  }

  const items = val.items as unknown[];
  const result: Record<string, unknown> = {};

  for (const item of items) {
    if (Array.isArray(item) && item.length >= 2) {
      // [key, value] pair
      const key = String(item[0]);
      result[key] = item[1];
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;

      // Check for CDM typed value structure
      if ('type' in obj && obj.type === 'object' && 'value' in obj) {
        const inner = obj.value as Record<string, unknown>;
        if ('key' in inner && 'value' in inner) {
          const key = String(inner.key);
          result[key] = inner.value;
          continue;
        }
      }

      // {key, value} or {k, v} structure
      if ('key' in obj && 'value' in obj) {
        const key = String(obj.key);
        result[key] = obj.value;
      } else if ('k' in obj && 'v' in obj) {
        const key = String(obj.k);
        result[key] = obj.v;
      }
    }
  }

  return { type: 'object' as const, value: result };
};
