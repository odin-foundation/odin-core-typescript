/**
 * ODIN Transform Date/Time Verbs
 *
 * Date and time verbs: formatDate, parseDate, today, now, addDays, addMonths,
 * addYears, dateDiff, formatTime, formatTimestamp, parseTimestamp.
 *
 * **Timezone handling:** All date/time operations use UTC internally for consistency.
 * Input strings without timezone info are treated as UTC. Output strings are UTC.
 */

import type { VerbFunction, TransformValue } from '../../types/transform.js';
import { toString, toNumber, str, int, nil, bool } from './helpers.js';
import { formatDateOnly as formatDateOnlyUtil } from '../../utils/format-utils.js';
import { incompatibleConversionError } from '../errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Date Formatting Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format date patterns
 */
function formatDatePattern(date: Date, pattern: string): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');

  return pattern
    .replace(/YYYY/g, String(date.getUTCFullYear()))
    .replace(/YY/g, String(date.getUTCFullYear()).slice(-2))
    .replace(/MM/g, pad(date.getUTCMonth() + 1))
    .replace(/DD/g, pad(date.getUTCDate()))
    .replace(/HH/g, pad(date.getUTCHours()))
    .replace(/hh/g, pad(date.getUTCHours() % 12 || 12))
    .replace(/mm/g, pad(date.getUTCMinutes()))
    .replace(/ss/g, pad(date.getUTCSeconds()))
    .replace(/SSS/g, pad(date.getUTCMilliseconds(), 3))
    .replace(/A/g, date.getUTCHours() < 12 ? 'AM' : 'PM');
}

/**
 * Parse date from string using pattern
 */
function parseDatePattern(value: string, pattern: string): Date | null {
  const parts: Record<string, number> = {};

  const findPos = (pat: string): number => pattern.indexOf(pat);

  const yyyy = findPos('YYYY');
  const yy = findPos('YY');
  const mm = findPos('MM');
  const dd = findPos('DD');
  const hh = findPos('HH');
  const min = findPos('mm');
  const ss = findPos('ss');

  if (yyyy >= 0) parts['year'] = parseInt(value.slice(yyyy, yyyy + 4), 10);
  else if (yy >= 0) parts['year'] = 2000 + parseInt(value.slice(yy, yy + 2), 10);

  if (mm >= 0) parts['month'] = parseInt(value.slice(mm, mm + 2), 10) - 1;
  if (dd >= 0) parts['day'] = parseInt(value.slice(dd, dd + 2), 10);
  if (hh >= 0) parts['hour'] = parseInt(value.slice(hh, hh + 2), 10);
  if (min >= 0) parts['minute'] = parseInt(value.slice(min, min + 2), 10);
  if (ss >= 0) parts['second'] = parseInt(value.slice(ss, ss + 2), 10);

  if (parts['year'] === undefined) return null;

  return new Date(
    Date.UTC(
      parts['year'],
      parts['month'] ?? 0,
      parts['day'] ?? 1,
      parts['hour'] ?? 0,
      parts['minute'] ?? 0,
      parts['second'] ?? 0
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Date Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %formatDate @path "pattern" - Format date
 */
export const formatDate: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const val = args[0]!;
  const pattern = toString(args[1]!);

  let date: Date;
  if (val.type === 'date' || val.type === 'timestamp') {
    date = val.value;
  } else {
    const s = toString(val);
    date = new Date(s);
    if (isNaN(date.getTime())) return nil();
  }

  return str(formatDatePattern(date, pattern));
};

/**
 * %parseDate @path "pattern" - Parse date from string
 * Returns ISO date string (YYYY-MM-DD)
 */
export const parseDate: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const value = toString(args[0]!);
  const pattern = toString(args[1]!);

  const date = parseDatePattern(value, pattern);
  if (!date) return nil();

  // Return ISO date string (YYYY-MM-DD)
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return str(`${year}-${month}-${day}`);
};

/**
 * Helper to format date as YYYY-MM-DD string.
 * Re-exported from format-utils for internal use in this module.
 */
function formatDateOnly(d: Date): string {
  return formatDateOnlyUtil(d);
}

/**
 * %today - Current date
 */
export const today: VerbFunction = () => {
  const now = new Date();
  const dateValue = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return {
    type: 'date',
    value: dateValue,
    raw: formatDateOnly(dateValue),
  };
};

/**
 * %now - Current timestamp
 */
export const now: VerbFunction = () => {
  const timestamp = new Date();
  return { type: 'timestamp', value: timestamp, raw: timestamp.toISOString() };
};

// ─────────────────────────────────────────────────────────────────────────────
// Date Arithmetic Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %addDays @date days - Add days to date
 * Returns ISO date string (YYYY-MM-DD)
 */
export const addDays: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const val = args[0]!;
  let date: Date;
  if (val.type === 'date' || val.type === 'timestamp') {
    date = new Date(val.value);
  } else {
    let s = toString(val);
    // Treat date-only strings as UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      s += 'T00:00:00Z';
    }
    date = new Date(s);
    if (isNaN(date.getTime())) return nil();
  }

  const days = Math.floor(toNumber(args[1]!));
  date.setUTCDate(date.getUTCDate() + days);

  // Return ISO date string (YYYY-MM-DD)
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return str(`${year}-${month}-${day}`);
};

/**
 * %addMonths @date months - Add months to date
 * Returns ISO date string (YYYY-MM-DD)
 */
export const addMonths: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const val = args[0]!;
  let date: Date;
  if (val.type === 'date' || val.type === 'timestamp') {
    date = new Date(val.value);
  } else {
    let s = toString(val);
    // Treat date-only strings as UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      s += 'T00:00:00Z';
    }
    date = new Date(s);
    if (isNaN(date.getTime())) return nil();
  }

  const months = Math.floor(toNumber(args[1]!));
  date.setUTCMonth(date.getUTCMonth() + months);

  // Return ISO date string (YYYY-MM-DD)
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return str(`${year}-${month}-${day}`);
};

/**
 * %addYears @date years - Add years to date
 * Returns ISO date string (YYYY-MM-DD)
 */
export const addYears: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const val = args[0]!;
  let date: Date;
  if (val.type === 'date' || val.type === 'timestamp') {
    date = new Date(val.value);
  } else {
    let s = toString(val);
    // Treat date-only strings as UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      s += 'T00:00:00Z';
    }
    date = new Date(s);
    if (isNaN(date.getTime())) return nil();
  }

  const years = Math.floor(toNumber(args[1]!));
  date.setUTCFullYear(date.getUTCFullYear() + years);

  // Return ISO date string (YYYY-MM-DD)
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return str(`${year}-${month}-${day}`);
};

/**
 * %dateDiff @date1 @date2 "unit" - Difference between dates
 */
export const dateDiff: VerbFunction = (args, context) => {
  if (args.length < 3) return nil();

  const getDate = (v: import('../../types/transform.js').TransformValue): Date | null => {
    if (v.type === 'date' || v.type === 'timestamp') return v.value;
    let s = toString(v);
    // Treat date-only strings as UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      s += 'T00:00:00Z';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  const d1 = getDate(args[0]!);
  const d2 = getDate(args[1]!);
  if (!d1 || !d2) return nil();

  const unit = toString(args[2]!).toLowerCase();
  const diffMs = d2.getTime() - d1.getTime();

  switch (unit) {
    case 'days':
      return int(Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    case 'months': {
      const months =
        (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + (d2.getUTCMonth() - d1.getUTCMonth());
      return int(months);
    }
    case 'years':
      return int(d2.getUTCFullYear() - d1.getUTCFullYear());
    default:
      if (context.errors) {
        context.errors.push(incompatibleConversionError('dateDiff', `unknown unit '${unit}' (expected 'days', 'months', or 'years')`));
      }
      return nil();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Time Formatting Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %formatTime @path "pattern" - Format time portion
 */
export const formatTime: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const val = args[0]!;
  const pattern = toString(args[1]!);

  let date: Date;
  if (val.type === 'date' || val.type === 'timestamp') {
    date = val.value;
  } else {
    const s = toString(val);
    // Try parsing directly first
    date = new Date(s);
    if (isNaN(date.getTime())) {
      // Handle time-only strings like "14:30:45" by prepending a date with Z (UTC)
      const timeMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (timeMatch) {
        date = new Date(`1970-01-01T${s}Z`);
        if (isNaN(date.getTime())) return nil();
      } else {
        return nil();
      }
    }
  }

  return str(formatDatePattern(date, pattern));
};

/**
 * %formatTimestamp @path "pattern" - Format full timestamp
 */
export const formatTimestamp: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const val = args[0]!;
  const pattern = toString(args[1]!);

  let date: Date;
  if (val.type === 'date' || val.type === 'timestamp') {
    date = val.value;
  } else {
    let s = toString(val);
    // Treat timestamps without timezone as UTC
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
      s += 'Z';
    }
    date = new Date(s);
    if (isNaN(date.getTime())) return nil();
  }

  return str(formatDatePattern(date, pattern));
};

/**
 * %parseTimestamp @path "pattern" - Parse timestamp from string
 * Returns ISO timestamp string (YYYY-MM-DDTHH:mm:ss)
 */
export const parseTimestamp: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const value = toString(args[0]!);
  const pattern = toString(args[1]!);

  const date = parseDatePattern(value, pattern);
  if (!date) return nil();

  // Return ISO timestamp string (YYYY-MM-DDTHH:mm:ss) without timezone
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  return str(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Additional Time Arithmetic Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper to parse a TransformValue to a Date
 */
function parseToDate(val: TransformValue): Date | null {
  if (val.type === 'date' || val.type === 'timestamp') {
    return new Date(val.value);
  }
  let s = toString(val);
  // Treat date-only strings as UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    s += 'T00:00:00Z';
  }
  const date = new Date(s);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * %addHours @date hours - Add hours to date/timestamp
 * Returns ISO timestamp string
 */
export const addHours: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  const hours = toNumber(args[1]!);
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);

  return str(date.toISOString());
};

/**
 * %addMinutes @date minutes - Add minutes to date/timestamp
 * Returns ISO timestamp string
 */
export const addMinutes: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  const minutes = toNumber(args[1]!);
  date.setTime(date.getTime() + minutes * 60 * 1000);

  return str(date.toISOString());
};

/**
 * %addSeconds @date seconds - Add seconds to date/timestamp
 * Returns ISO timestamp string
 */
export const addSeconds: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  const seconds = toNumber(args[1]!);
  date.setTime(date.getTime() + seconds * 1000);

  return str(date.toISOString());
};

// ─────────────────────────────────────────────────────────────────────────────
// Date Boundary Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %startOfDay @date - Get start of day (00:00:00.000)
 * Returns ISO timestamp string
 */
export const startOfDay: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  date.setUTCHours(0, 0, 0, 0);
  return str(date.toISOString());
};

/**
 * %endOfDay @date - Get end of day (23:59:59.999)
 * Returns ISO timestamp string
 */
export const endOfDay: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  date.setUTCHours(23, 59, 59, 999);
  return str(date.toISOString());
};

/**
 * %startOfMonth @date - Get first day of month
 * Returns ISO date string (YYYY-MM-DD)
 */
export const startOfMonth: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);

  return str(formatDateOnly(date));
};

/**
 * %endOfMonth @date - Get last day of month
 * Returns ISO date string (YYYY-MM-DD)
 */
export const endOfMonth: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  // Go to next month, then back one day
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  date.setUTCHours(0, 0, 0, 0);

  return str(formatDateOnly(date));
};

/**
 * %startOfYear @date - Get first day of year (Jan 1)
 * Returns ISO date string (YYYY-MM-DD)
 */
export const startOfYear: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  date.setUTCMonth(0, 1);
  date.setUTCHours(0, 0, 0, 0);

  return str(formatDateOnly(date));
};

/**
 * %endOfYear @date - Get last day of year (Dec 31)
 * Returns ISO date string (YYYY-MM-DD)
 */
export const endOfYear: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  date.setUTCMonth(11, 31);
  date.setUTCHours(0, 0, 0, 0);

  return str(formatDateOnly(date));
};

// ─────────────────────────────────────────────────────────────────────────────
// Date Component Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %dayOfWeek @date - Get day of week (1-7, Monday=1, Sunday=7)
 * ISO 8601 week day numbering
 */
export const dayOfWeek: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  // JavaScript: 0=Sunday, 1=Monday, ..., 6=Saturday
  // ISO 8601: 1=Monday, ..., 7=Sunday
  const jsDay = date.getUTCDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;

  return int(isoDay);
};

/**
 * %weekOfYear @date - Get ISO week number (1-53)
 */
export const weekOfYear: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  // ISO 8601 week calculation
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Make Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Set to Thursday of current week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return int(weekNum);
};

/**
 * %quarter @date - Get quarter (1-4)
 */
export const quarter: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  const month = date.getUTCMonth(); // 0-11
  const q = Math.floor(month / 3) + 1;

  return int(q);
};

/**
 * %isLeapYear @date - Check if year is a leap year
 */
export const isLeapYear: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  const year = date.getUTCFullYear();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

  return bool(isLeap);
};

// ─────────────────────────────────────────────────────────────────────────────
// Date Comparison Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %isBefore @date1 @date2 - Check if date1 is before date2
 */
export const isBefore: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const d1 = parseToDate(args[0]!);
  const d2 = parseToDate(args[1]!);
  if (!d1 || !d2) return nil();

  return bool(d1.getTime() < d2.getTime());
};

/**
 * %isAfter @date1 @date2 - Check if date1 is after date2
 */
export const isAfter: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const d1 = parseToDate(args[0]!);
  const d2 = parseToDate(args[1]!);
  if (!d1 || !d2) return nil();

  return bool(d1.getTime() > d2.getTime());
};

/**
 * %isBetween @date @start @end - Check if date is between start and end (inclusive)
 */
export const isBetween: VerbFunction = (args) => {
  if (args.length < 3) return nil();

  const date = parseToDate(args[0]!);
  const start = parseToDate(args[1]!);
  const end = parseToDate(args[2]!);
  if (!date || !start || !end) return nil();

  const t = date.getTime();
  return bool(t >= start.getTime() && t <= end.getTime());
};

// ─────────────────────────────────────────────────────────────────────────────
// Unix Timestamp Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %toUnix @date - Convert date to Unix timestamp (seconds since epoch)
 */
export const toUnix: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  return int(Math.floor(date.getTime() / 1000));
};

/**
 * %fromUnix @timestamp - Convert Unix timestamp to ISO date string
 * Handles both seconds and milliseconds automatically.
 */
export const fromUnix: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const timestamp = toNumber(args[0]!);
  if (!Number.isFinite(timestamp)) return nil();

  // Detect if timestamp is in seconds or milliseconds
  // 100 billion ms ≈ 1973, 100 billion s ≈ year 5138
  const THRESHOLD = 100_000_000_000;
  const ms = timestamp < THRESHOLD ? timestamp * 1000 : timestamp;

  const date = new Date(ms);
  if (isNaN(date.getTime())) return nil();

  return str(date.toISOString());
};

// ─────────────────────────────────────────────────────────────────────────────
// Locale-Aware Date Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %formatLocaleDate @date [locale] - Format date using locale-specific conventions
 * Uses Intl.DateTimeFormat for locale-aware date formatting.
 *
 * @example
 * %formatLocaleDate @date "de-DE"  ; 2024-03-15 → "15.3.2024"
 * %formatLocaleDate @date "en-US"  ; 2024-03-15 → "3/15/2024"
 * %formatLocaleDate @date "ja-JP"  ; 2024-03-15 → "2024/3/15"
 * %formatLocaleDate @date          ; Uses system default locale
 */
export const formatLocaleDate: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  const locale = args.length >= 2 ? toString(args[1]!) : undefined;

  try {
    const formatter = new Intl.DateTimeFormat(locale);
    return str(formatter.format(date));
  } catch {
    // Invalid locale - fall back to default
    return str(new Intl.DateTimeFormat().format(date));
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Age and Date Calculation Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %daysBetweenDates @startDate @endDate - Calculate days between two dates
 * Returns the number of whole days between start and end dates.
 * Result is positive if end > start, negative if end < start.
 * Simpler than %dateDiff @d1 @d2 "days" - commonly used in claims processing.
 *
 * @example
 * days = "%daysBetweenDates @lossDate @reportDate"   ; Days from loss to report
 * tenure = "%daysBetweenDates @hireDate @today"      ; Days employed
 */
export const daysBetweenDates: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const startDate = parseToDate(args[0]!);
  const endDate = parseToDate(args[1]!);

  if (!startDate || !endDate) return nil();

  // Calculate difference in milliseconds, then convert to days
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffMs / msPerDay);

  return int(diffDays);
};

/**
 * %ageFromDate @birthDate [@asOfDate] - Calculate age in complete years
 * Handles leap years and month boundaries correctly.
 * If asOfDate is not provided, uses current date.
 *
 * @example
 * age = "%ageFromDate @birthDate"              ; Age as of today
 * age = "%ageFromDate @birthDate @policyDate"  ; Age as of policy date
 */
export const ageFromDate: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const birthDate = parseToDate(args[0]!);
  if (!birthDate) return nil();

  // Use provided date or current date
  const asOf = args.length >= 2 ? parseToDate(args[1]!) : new Date();
  if (!asOf) return nil();

  // Birth date must be before or equal to as-of date
  if (birthDate.getTime() > asOf.getTime()) return nil();

  // Calculate age in years
  let age = asOf.getUTCFullYear() - birthDate.getUTCFullYear();

  // Adjust if birthday hasn't occurred yet this year
  const birthMonth = birthDate.getUTCMonth();
  const birthDay = birthDate.getUTCDate();
  const asOfMonth = asOf.getUTCMonth();
  const asOfDay = asOf.getUTCDate();

  if (asOfMonth < birthMonth || (asOfMonth === birthMonth && asOfDay < birthDay)) {
    age--;
  }

  return int(age);
};

/**
 * %isValidDate @value @format - Strictly validate if a string matches a date format
 * Returns boolean. More strict than coerceDate - validates format AND value validity.
 *
 * Supports formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, YYYY/MM/DD
 *
 * @example
 * valid = "%isValidDate @input \"YYYY-MM-DD\""   ; "2024-02-29" → true (leap year)
 * valid = "%isValidDate @input \"YYYY-MM-DD\""   ; "2023-02-29" → false (not leap year)
 * valid = "%isValidDate @input \"MM/DD/YYYY\""   ; "12/31/2024" → true
 */
export const isValidDate: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const value = toString(args[0]!);
  const format = toString(args[1]!);

  // Extract date parts based on format
  let year: number, month: number, day: number;

  try {
    if (format === 'YYYY-MM-DD') {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!match) return bool(false);
      year = parseInt(match[1]!, 10);
      month = parseInt(match[2]!, 10);
      day = parseInt(match[3]!, 10);
    } else if (format === 'MM/DD/YYYY') {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
      if (!match) return bool(false);
      month = parseInt(match[1]!, 10);
      day = parseInt(match[2]!, 10);
      year = parseInt(match[3]!, 10);
    } else if (format === 'DD/MM/YYYY') {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
      if (!match) return bool(false);
      day = parseInt(match[1]!, 10);
      month = parseInt(match[2]!, 10);
      year = parseInt(match[3]!, 10);
    } else if (format === 'YYYY/MM/DD') {
      const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value);
      if (!match) return bool(false);
      year = parseInt(match[1]!, 10);
      month = parseInt(match[2]!, 10);
      day = parseInt(match[3]!, 10);
    } else {
      // Unsupported format
      return nil();
    }

    // Validate month range
    if (month < 1 || month > 12) return bool(false);

    // Validate day range for the specific month
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    // Handle leap year for February
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (month === 2 && isLeap) {
      daysInMonth[1] = 29;
    }

    const maxDay = daysInMonth[month - 1]!;
    if (day < 1 || day > maxDay) return bool(false);

    // All validations passed
    return bool(true);
  } catch {
    // Parsing failed - return false for invalid date
    return bool(false);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Business Day Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %businessDays @date ##count - Add N business days (skip weekends)
 *
 * Skips Saturday and Sunday. Negative count subtracts business days.
 * No holiday calendar — weekends only.
 *
 * @example
 * due = "%businessDays @.startDate ##5"
 * ; 2024-01-15 (Mon) + 5 → 2024-01-22 (Mon)
 */
export const businessDays: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  const count = Math.floor(toNumber(args[1]!));
  if (count === 0) return str(formatDateOnlyUtil(date));

  const result = new Date(date);
  const absCount = Math.abs(count);
  const direction = count >= 0 ? 1 : -1;

  // O(1) arithmetic: full weeks + remaining days
  const fullWeeks = Math.floor(absCount / 5);
  let remaining = absCount % 5;

  // Advance by full weeks (each week = 7 calendar days)
  result.setUTCDate(result.getUTCDate() + direction * fullWeeks * 7);

  // Add remaining business days, skipping weekends
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + direction);
    const dow = result.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }

  return str(formatDateOnlyUtil(result));
};

/**
 * %nextBusinessDay @date - Next weekday (Mon-Fri)
 *
 * If already Mon-Fri, returns same date. Sat→Mon, Sun→Mon.
 *
 * @example
 * effective = "%nextBusinessDay @.submittedDate"
 * ; 2024-01-20 (Sat) → 2024-01-22 (Mon)
 */
export const nextBusinessDay: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const date = parseToDate(args[0]!);
  if (!date) return nil();

  const result = new Date(date);
  const dow = result.getUTCDay();

  if (dow === 0) {
    // Sunday → Monday
    result.setUTCDate(result.getUTCDate() + 1);
  } else if (dow === 6) {
    // Saturday → Monday
    result.setUTCDate(result.getUTCDate() + 2);
  }

  return str(formatDateOnlyUtil(result));
};

/**
 * %formatDuration @duration - Human-readable duration from ISO 8601
 *
 * Converts ISO 8601 duration string to English comma-separated components.
 * Zero components are omitted. Singular/plural handled.
 *
 * @example
 * readable = "%formatDuration @.elapsed"
 * ; "PT2H30M" → "2 hours, 30 minutes"
 * ; "P1DT6H" → "1 day, 6 hours"
 * ; "PT45S" → "45 seconds"
 */
export const formatDuration: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const input = toString(args[0]!);
  if (!input) return nil();

  // Parse ISO 8601 duration: P[nY][nM][nD][T[nH][nM][nS]]
  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(input);
  if (!match) return nil();

  const years = parseInt(match[1] || '0', 10);
  const months = parseInt(match[2] || '0', 10);
  const days = parseInt(match[3] || '0', 10);
  const hours = parseInt(match[4] || '0', 10);
  const minutes = parseInt(match[5] || '0', 10);
  const seconds = parseFloat(match[6] || '0');

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (seconds > 0) {
    const secStr = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
    parts.push(`${secStr} ${seconds === 1 ? 'second' : 'seconds'}`);
  }

  if (parts.length === 0) return str('0 seconds');

  return str(parts.join(', '));
};
