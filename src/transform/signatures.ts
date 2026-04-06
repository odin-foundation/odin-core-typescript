/**
 * ODIN Verb Type Signatures
 *
 * Defines expected argument types for each verb, enabling optional strict
 * type validation at transform execution time.
 *
 * Type system:
 * - Primitive types: 'string', 'number', 'integer', 'boolean', 'null'
 * - Complex types: 'array', 'object', 'date', 'timestamp', 'time', 'duration'
 * - Special types: 'any' (accepts all), 'T' (generic - must match other T args)
 */

import type { TransformValue } from '../types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Argument types for verb signatures.
 * 'T' is a generic type - all 'T' args in a signature must have compatible types.
 */
export type VerbArgType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null'
  | 'array'
  | 'object'
  | 'date'
  | 'timestamp'
  | 'time'
  | 'duration'
  | 'binary'
  | 'any'
  | 'T'; // Generic type placeholder

/**
 * Signature definition for a verb.
 */
export interface VerbSignature {
  /** Expected types for fixed positional arguments (in order) */
  args: VerbArgType[];
  /** Type for variadic (remaining) arguments, if the verb is variadic */
  variadic?: VerbArgType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Compatibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type compatibility groups. Types in the same group can be compared/used together.
 */
const TYPE_COMPATIBILITY: Record<string, Set<string>> = {
  // Numeric types are compatible with each other
  number: new Set(['number', 'integer', 'currency', 'null']),
  integer: new Set(['number', 'integer', 'currency', 'null']),
  currency: new Set(['number', 'integer', 'currency', 'null']),

  // String compatible only with string
  string: new Set(['string', 'null']),

  // Boolean compatible only with boolean
  boolean: new Set(['boolean', 'null']),

  // Date/time types are compatible
  date: new Set(['date', 'timestamp', 'null']),
  timestamp: new Set(['date', 'timestamp', 'null']),
  time: new Set(['time', 'null']),
  duration: new Set(['duration', 'null']),

  // Null is compatible with everything
  null: new Set([
    'null',
    'string',
    'number',
    'integer',
    'currency',
    'boolean',
    'date',
    'timestamp',
    'time',
    'duration',
    'array',
    'object',
    'binary',
  ]),

  // These are only compatible with themselves
  array: new Set(['array', 'null']),
  object: new Set(['object', 'null']),
  binary: new Set(['binary', 'null']),
};

/**
 * Check if two types are compatible for comparison operations.
 */
export function areTypesCompatible(type1: string, type2: string): boolean {
  // Same type is always compatible
  if (type1 === type2) return true;

  // Check compatibility groups
  const compat1 = TYPE_COMPATIBILITY[type1];
  if (compat1 && compat1.has(type2)) return true;

  const compat2 = TYPE_COMPATIBILITY[type2];
  if (compat2 && compat2.has(type1)) return true;

  return false;
}

/**
 * Check if an actual type matches an expected type in a signature.
 */
export function isTypeMatch(actual: string, expected: VerbArgType): boolean {
  // 'any' accepts everything
  if (expected === 'any') return true;

  // 'T' is handled separately (generic type matching)
  if (expected === 'T') return true;

  // null is compatible with all types (represents absence of value)
  if (actual === 'null') return true;

  // 'number' in signature accepts number, integer, currency
  if (expected === 'number') {
    return actual === 'number' || actual === 'integer' || actual === 'currency';
  }

  // Exact match
  return actual === expected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verb Signatures
// ─────────────────────────────────────────────────────────────────────────────

export const VERB_SIGNATURES: Record<string, VerbSignature> = {
  // ─────────────────────────────────────────────────────────────────────────────
  // Core String Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  upper: { args: ['string'] },
  lower: { args: ['string'] },
  trim: { args: ['string'] },
  trimLeft: { args: ['string'] },
  trimRight: { args: ['string'] },
  capitalize: { args: ['string'] },
  titleCase: { args: ['string'] },
  length: { args: ['string'] },
  concat: { args: [], variadic: 'any' },
  contains: { args: ['string', 'string'] },
  startsWith: { args: ['string', 'string'] },
  endsWith: { args: ['string', 'string'] },
  substring: { args: ['string', 'integer', 'integer'] },
  replace: { args: ['string', 'string', 'string'] },
  replaceRegex: { args: ['string', 'string', 'string'] },
  padLeft: { args: ['string', 'integer', 'string'] },
  padRight: { args: ['string', 'integer', 'string'] },
  pad: { args: ['string', 'integer', 'string'] },
  truncate: { args: ['string', 'integer'] },
  split: { args: ['string', 'string', 'integer'] },
  join: { args: ['array', 'string'] },
  mask: { args: ['string', 'integer'] },
  reverseString: { args: ['string'] },
  repeat: { args: ['string', 'integer'] },
  camelCase: { args: ['string'] },
  snakeCase: { args: ['string'] },
  kebabCase: { args: ['string'] },
  pascalCase: { args: ['string'] },
  slugify: { args: ['string'] },
  match: { args: ['string', 'string'] },
  matches: { args: ['string', 'string'] },
  extract: { args: ['string', 'string', 'integer'] },
  normalizeSpace: { args: ['string'] },
  leftOf: { args: ['string', 'string'] },
  rightOf: { args: ['string', 'string'] },
  wrap: { args: ['string', 'integer'] },
  center: { args: ['string', 'integer', 'string'] },
  stripAccents: { args: ['string'] },
  clean: { args: ['string'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Coercion Verbs (accept any, return specific type)
  // ─────────────────────────────────────────────────────────────────────────────
  coerceString: { args: ['any'] },
  coerceNumber: { args: ['any'] },
  coerceInteger: { args: ['any'] },
  coerceBoolean: { args: ['any'] },
  coerceDate: { args: ['any'] },
  coerceTimestamp: { args: ['any'] },
  tryCoerce: { args: ['any'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Numeric Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  abs: { args: ['number'] },
  round: { args: ['number', 'integer'] },
  floor: { args: ['number'] },
  ceil: { args: ['number'] },
  trunc: { args: ['number'] },
  sign: { args: ['number'] },
  negate: { args: ['number'] },
  add: { args: ['number', 'number'] },
  subtract: { args: ['number', 'number'] },
  multiply: { args: ['number', 'number'] },
  divide: { args: ['number', 'number'] },
  mod: { args: ['number', 'number'] },
  pow: { args: ['number', 'number'] },
  sqrt: { args: ['number'] },
  log: { args: ['number', 'number'] },
  ln: { args: ['number'] },
  log10: { args: ['number'] },
  exp: { args: ['number'] },
  formatNumber: { args: ['number', 'integer'] },
  formatInteger: { args: ['integer'] },
  formatCurrency: { args: ['number'] },
  formatPercent: { args: ['number', 'integer'] },
  clamp: { args: ['number', 'number', 'number'] },
  interpolate: { args: ['number', 'number', 'number', 'number', 'number'] },
  random: { args: ['number', 'number', 'integer'] },
  isFinite: { args: ['number'] },
  isNaN: { args: ['number'] },
  parseInt: { args: ['string', 'integer'] },
  safeDivide: { args: ['number', 'number', 'number'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Comparison Verbs (Generic Type - both args must be compatible)
  // ─────────────────────────────────────────────────────────────────────────────
  eq: { args: ['T', 'T'] },
  ne: { args: ['T', 'T'] },
  lt: { args: ['T', 'T'] },
  lte: { args: ['T', 'T'] },
  gt: { args: ['T', 'T'] },
  gte: { args: ['T', 'T'] },
  between: { args: ['T', 'T', 'T'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Logic Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  and: { args: ['boolean', 'boolean'] },
  or: { args: ['boolean', 'boolean'] },
  not: { args: ['boolean'] },
  xor: { args: ['boolean', 'boolean'] },
  ifElse: { args: ['boolean', 'any', 'any'] },
  ifNull: { args: ['any', 'any'] },
  ifEmpty: { args: ['any', 'any'] },
  coalesce: { args: [], variadic: 'any' },
  switch: { args: [], variadic: 'any' },
  cond: { args: [], variadic: 'any' },

  // ─────────────────────────────────────────────────────────────────────────────
  // Type Check Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  isNull: { args: ['any'] },
  isString: { args: ['any'] },
  isNumber: { args: ['any'] },
  isBoolean: { args: ['any'] },
  isArray: { args: ['any'] },
  isObject: { args: ['any'] },
  isDate: { args: ['any'] },
  typeOf: { args: ['any'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Date/Time Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  today: { args: [] },
  now: { args: [] },
  formatDate: { args: ['date', 'string'] },
  parseDate: { args: ['string', 'string'] },
  formatTime: { args: ['time', 'string'] },
  formatTimestamp: { args: ['timestamp', 'string'] },
  parseTimestamp: { args: ['string', 'string'] },
  addDays: { args: ['date', 'integer'] },
  addMonths: { args: ['date', 'integer'] },
  addYears: { args: ['date', 'integer'] },
  addHours: { args: ['timestamp', 'integer'] },
  addMinutes: { args: ['timestamp', 'integer'] },
  addSeconds: { args: ['timestamp', 'integer'] },
  dateDiff: { args: ['date', 'date', 'string'] },
  daysBetweenDates: { args: ['date', 'date'] },
  startOfDay: { args: ['date'] },
  endOfDay: { args: ['date'] },
  startOfMonth: { args: ['date'] },
  endOfMonth: { args: ['date'] },
  startOfYear: { args: ['date'] },
  endOfYear: { args: ['date'] },
  dayOfWeek: { args: ['date'] },
  weekOfYear: { args: ['date'] },
  quarter: { args: ['date'] },
  isLeapYear: { args: ['date'] },
  isBefore: { args: ['T', 'T'] },
  isAfter: { args: ['T', 'T'] },
  isBetween: { args: ['T', 'T', 'T'] },
  toUnix: { args: ['timestamp'] },
  fromUnix: { args: ['integer'] },
  ageFromDate: { args: ['date', 'date'] },
  isValidDate: { args: ['any', 'string'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Array Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  filter: { args: ['array', 'string', 'string', 'any'] },
  flatten: { args: ['array'] },
  distinct: { args: ['array', 'string'] },
  sort: { args: ['array', 'string', 'string'] },
  sortDesc: { args: ['array'] },
  sortBy: { args: ['array', 'string'] },
  map: { args: ['array', 'string'] },
  indexOf: { args: ['array', 'any'] },
  at: { args: ['array', 'integer'] },
  slice: { args: ['array', 'integer', 'integer'] },
  reverse: { args: ['array'] },
  every: { args: ['array', 'string', 'string', 'any'] },
  some: { args: ['array', 'string', 'string', 'any'] },
  find: { args: ['array', 'string', 'string', 'any'] },
  findIndex: { args: ['array', 'string', 'string', 'any'] },
  includes: { args: ['array', 'any'] },
  concatArrays: { args: ['array', 'array'] },
  zip: { args: ['array', 'array'] },
  groupBy: { args: ['array', 'string'] },
  partition: { args: ['array', 'string', 'string', 'any'] },
  take: { args: ['array', 'integer'] },
  drop: { args: ['array', 'integer'] },
  chunk: { args: ['array', 'integer'] },
  range: { args: ['integer', 'integer', 'integer'] },
  compact: { args: ['array'] },
  pluck: { args: ['array', 'string'] },
  unique: { args: ['array'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Aggregation Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  sum: { args: ['array'] },
  count: { args: ['array'] },
  min: { args: ['array'] },
  max: { args: ['array'] },
  avg: { args: ['array'] },
  first: { args: ['array'] },
  last: { args: ['array'] },
  accumulate: { args: ['string', 'any'] },
  set: { args: ['string', 'any'] },
  minOf: { args: [], variadic: 'number' },
  maxOf: { args: [], variadic: 'number' },
  weightedAvg: { args: ['array', 'array'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Statistical Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  std: { args: ['array'] },
  stdSample: { args: ['array'] },
  variance: { args: ['array'] },
  varianceSample: { args: ['array'] },
  median: { args: ['array'] },
  mode: { args: ['array'] },
  percentile: { args: ['array', 'number'] },
  quantile: { args: ['array', 'number'] },
  covariance: { args: ['array', 'array'] },
  correlation: { args: ['array', 'array'] },
  zscore: { args: ['number', 'array'] },
  cumsum: { args: ['array'] },
  cumprod: { args: ['array'] },
  shift: { args: ['array', 'integer', 'any'] },
  diff: { args: ['array', 'integer'] },
  pctChange: { args: ['array', 'integer'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Financial Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  compound: { args: ['number', 'number', 'integer'] },
  discount: { args: ['number', 'number', 'integer'] },
  pmt: { args: ['number', 'number', 'integer'] },
  fv: { args: ['number', 'number', 'integer'] },
  pv: { args: ['number', 'number', 'integer'] },
  npv: { args: ['number', 'array'] },
  irr: { args: ['array', 'number'] },
  rate: { args: ['integer', 'number', 'number', 'number'] },
  nper: { args: ['number', 'number', 'number', 'number'] },
  depreciation: { args: ['number', 'number', 'integer'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Object Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  keys: { args: ['object'] },
  values: { args: ['object'] },
  entries: { args: ['object'] },
  has: { args: ['object', 'string'] },
  get: { args: ['object', 'string', 'any'] },
  merge: { args: ['object', 'object'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Encoding Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  base64Encode: { args: ['string'] },
  base64Decode: { args: ['string'] },
  urlEncode: { args: ['string'] },
  urlDecode: { args: ['string'] },
  jsonEncode: { args: ['any'] },
  jsonDecode: { args: ['string'] },
  hexEncode: { args: ['string'] },
  hexDecode: { args: ['string'] },
  sha256: { args: ['string'] },
  sha512: { args: ['string'] },
  sha1: { args: ['string'] },
  md5: { args: ['string'] },
  crc32: { args: ['string'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Generation Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  uuid: { args: ['string'] },
  nanoid: { args: ['integer', 'string'] },
  sequence: { args: ['string'] },
  resetSequence: { args: ['string'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Lookup Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  lookup: { args: ['string'], variadic: 'any' },
  lookupDefault: { args: ['string'], variadic: 'any' },

  // ─────────────────────────────────────────────────────────────────────────────
  // Locale Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  formatLocaleNumber: { args: ['number', 'string'] },
  formatLocaleDate: { args: ['date', 'string'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Deduplication Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  dedupe: { args: ['array', 'string'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Geo/Spatial Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  distance: { args: ['number', 'number', 'number', 'number', 'string'] },
  inBoundingBox: { args: ['number', 'number', 'number', 'number', 'number', 'number'] },
  toRadians: { args: ['number'] },
  toDegrees: { args: ['number'] },
  bearing: { args: ['number', 'number', 'number', 'number'] },
  midpoint: { args: ['number', 'number', 'number', 'number'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Text Processing Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  tokenize: { args: ['string', 'string'] },
  wordCount: { args: ['string'] },
  levenshtein: { args: ['string', 'string'] },
  soundex: { args: ['string'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Window/Ranking Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  rowNumber: { args: ['any'] },
  rank: { args: ['array', 'string', 'string'] },
  lag: { args: ['array', 'integer', 'any'] },
  lead: { args: ['array', 'integer', 'any'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Sampling Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  sample: { args: ['array', 'integer', 'integer'] },
  limit: { args: ['array', 'integer'] },
  fillMissing: { args: ['array', 'any', 'string'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Validation Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  assert: { args: ['boolean', 'string'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // Collection Coercion Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  toArray: { args: ['any'] },
  toObject: { args: ['any'] },

  // ─────────────────────────────────────────────────────────────────────────────
  // JSON Query Verbs
  // ─────────────────────────────────────────────────────────────────────────────
  jsonPath: { args: ['object', 'string'] },
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface TypeValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate verb argument types against signature.
 *
 * @param verb - The verb name
 * @param args - The actual arguments (with their types)
 * @param isCustom - Whether this is a custom verb (skip validation)
 * @returns Validation result with any type errors
 */
export function validateVerbArgTypes(
  verb: string,
  args: TransformValue[],
  isCustom: boolean
): TypeValidationResult {
  // Skip validation for custom verbs (no signatures)
  if (isCustom) {
    return { valid: true, errors: [] };
  }

  // Get signature, skip if unknown verb
  const sig = VERB_SIGNATURES[verb];
  if (!sig) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];

  // Track generic type 'T' - first T encountered sets the type
  let genericType: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    // Determine expected type (fixed arg or variadic)
    const expectedType: VerbArgType = sig.args[i] ?? sig.variadic ?? 'any';

    // Handle generic type 'T'
    if (expectedType === 'T') {
      if (genericType === null) {
        // First T - set the generic type
        genericType = arg.type;
      } else {
        // Subsequent T - must be compatible with first
        if (!areTypesCompatible(genericType, arg.type)) {
          errors.push(
            `Arg ${i + 1}: type '${arg.type}' is not compatible with '${genericType}' (mismatched types in comparison)`
          );
        }
      }
      continue;
    }

    // Handle 'any' - accepts everything
    if (expectedType === 'any') {
      continue;
    }

    // Check type match
    if (!isTypeMatch(arg.type, expectedType)) {
      errors.push(`Arg ${i + 1}: expected ${expectedType}, got ${arg.type}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get the signature for a verb, if defined.
 */
export function getVerbSignature(verb: string): VerbSignature | undefined {
  return VERB_SIGNATURES[verb];
}
