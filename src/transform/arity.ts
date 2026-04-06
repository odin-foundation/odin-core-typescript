/**
 * ODIN Verb Arity Map
 *
 * Defines the expected argument count for each transform verb.
 * Used by both the ODIN parser (for first-class verb expressions)
 * and the transform parser (for quoted string fallback).
 *
 * -1 means variadic (consume remaining args until modifier or EOL).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Verb Arity Map
// ─────────────────────────────────────────────────────────────────────────────

export const VERB_ARITY: Record<string, number> = {
  // Core verbs
  concat: -1, // variadic
  upper: 1,
  lower: 1,
  trim: 1,
  trimLeft: 1,
  trimRight: 1,
  coalesce: -1, // variadic
  ifNull: 2,
  ifEmpty: 2,
  ifElse: 3,
  lookup: -1, // variadic: TABLE @key1 [@key2 @key3 ...] for multi-key tables
  lookupDefault: -1, // variadic: TABLE @key1 [@key2 ...] "default"

  // Coercion verbs
  coerceString: 1,
  coerceNumber: 1,
  coerceInteger: 1,
  coerceBoolean: 1,
  coerceDate: 1,
  coerceTimestamp: 1,
  tryCoerce: 1, // auto-detect type from string and coerce

  // Date/Time verbs
  formatDate: 2,
  parseDate: 2,
  today: 0,
  now: 0,
  formatTime: 2,
  formatTimestamp: 2,
  parseTimestamp: 2,
  addDays: 2,
  addMonths: 2,
  addYears: 2,
  dateDiff: 3,

  // String verbs
  capitalize: 1,
  titleCase: 1,
  length: 1,
  contains: 2,
  startsWith: 2,
  endsWith: 2,
  substring: 3,
  replace: 3,
  replaceRegex: 3,
  padLeft: 3,
  padRight: 3,
  pad: 3,
  truncate: 3,
  split: 3,
  join: 2,
  mask: 2,

  // Numeric verbs
  formatNumber: 2,
  formatInteger: 1,
  formatCurrency: 1,
  abs: 1,
  round: 2,
  floor: 1,
  ceil: 1,
  add: 2,
  subtract: 2,
  multiply: 2,
  divide: 2,
  mod: 2,
  negate: 1,
  switch: -1, // variadic

  // Aggregation verbs
  accumulate: 2,
  set: 2,
  sum: 1,
  count: 1,
  min: 1,
  max: 1,
  avg: 1,
  first: 1,
  last: 1,

  // Generation verbs
  uuid: 1, // 0 or 1 (optional seed)
  sequence: 1,
  resetSequence: 1,

  // Encoding verbs
  base64Encode: 1,
  base64Decode: 1,
  urlEncode: 1,
  urlDecode: 1,
  jsonEncode: 1,
  jsonDecode: 1,
  hexEncode: 1,
  hexDecode: 1,

  // Array verbs
  filter: 4, // @array "field" "op" value
  flatten: 1,
  distinct: 1, // distinct can also take 2 args: @array "field" - but 1 is more common
  sort: 1, // sort can take up to 3 args: @array "field" "desc"
  sortDesc: 1,
  sortBy: 2,
  map: 2,
  indexOf: 2,
  at: 2,
  slice: 3,
  reverse: 1,

  // Financial & Statistical verbs
  // Mathematical
  log: 2, // @value [base] - base is optional, defaults to e
  ln: 1,
  log10: 1,
  exp: 1,
  pow: 2,
  sqrt: 1,
  // Time Value of Money
  compound: 3, // @principal @rate @periods
  discount: 3, // @futureValue @rate @periods
  pmt: 3, // @principal @rate @periods
  fv: 3, // @payment @rate @periods
  pv: 3, // @payment @rate @periods
  // Statistics
  std: 1,
  stdSample: 1,
  variance: 1,
  varianceSample: 1,
  median: 1,
  mode: 1,
  percentile: 2, // @array @pct
  quantile: 2, // @array @q
  // Correlation
  covariance: 2, // @array1 @array2
  correlation: 2, // @array1 @array2
  // Utility
  clamp: 3, // @value @min @max
  interpolate: 5, // @x @x1 @y1 @x2 @y2
  weightedAvg: 2, // @values @weights
  // Additional financial verbs
  npv: 2, // @rate @cashflows
  irr: 2, // @cashflows [@guess] — guess is optional
  rate: 4, // @periods @pmt @pv @fv
  nper: 4, // @rate @pmt @pv @fv
  depreciation: 3, // cost salvage life

  // Logic verbs
  and: 2,
  or: 2,
  not: 1,
  xor: 2,
  eq: 2,
  ne: 2,
  lt: 2,
  lte: 2,
  gt: 2,
  gte: 2,
  between: 3, // @value @min @max
  isNull: 1,
  isString: 1,
  isNumber: 1,
  isBoolean: 1,
  isArray: 1,
  isObject: 1,
  isDate: 1,
  typeOf: 1,
  cond: -1, // variadic: @c1 @v1 @c2 @v2 ... @default

  // Object verbs
  keys: 1,
  values: 1,
  entries: 1,
  has: 2, // @object "key"
  get: 3, // @object "path" [default] — default is optional
  merge: 2, // @obj1 @obj2

  // Additional string verbs
  reverseString: 1,
  repeat: 2, // @path count
  camelCase: 1,
  snakeCase: 1,
  kebabCase: 1,
  pascalCase: 1,
  slugify: 1,
  match: 2, // @path "regex"
  extract: 3, // @path "regex" group
  normalizeSpace: 1,
  leftOf: 2, // @path "delim"
  rightOf: 2, // @path "delim"
  wrap: 2, // @path width
  center: 3, // @path width "char"

  // Additional numeric verbs
  sign: 1,
  trunc: 1,
  random: 3, // [min] [max] [seed] - all optional
  minOf: -1, // variadic
  maxOf: -1, // variadic
  formatPercent: 2, // @path [decimals]
  isFinite: 1,
  isNaN: 1,
  parseInt: 2, // @path [radix]

  // Additional datetime verbs
  addHours: 2,
  addMinutes: 2,
  addSeconds: 2,
  startOfDay: 1,
  endOfDay: 1,
  startOfMonth: 1,
  endOfMonth: 1,
  startOfYear: 1,
  endOfYear: 1,
  dayOfWeek: 1,
  weekOfYear: 1,
  quarter: 1,
  isLeapYear: 1,
  isBefore: 2,
  isAfter: 2,
  isBetween: 3, // @date @start @end
  toUnix: 1,
  fromUnix: 1,

  // Additional array verbs
  every: 4, // @array "field" "op" value
  some: 4, // @array "field" "op" value
  find: 4, // @array "field" "op" value
  findIndex: 4, // @array "field" "op" value
  includes: 2, // @array value
  concatArrays: 2, // @arr1 @arr2
  zip: 2, // @arr1 @arr2
  groupBy: 2, // @array "field"
  partition: 4, // @array "field" "op" value
  take: 2, // @array count
  drop: 2, // @array count
  chunk: 2, // @array size
  range: 3, // start end [step] — step is optional
  compact: 1,
  pluck: 2, // @array "field"
  unique: 1,

  // Additional encoding verbs
  sha256: 1,
  md5: 1,
  sha1: 1,
  sha512: 1,
  crc32: 1,

  // Additional generation verbs
  nanoid: 2, // [size] [seed]

  // Locale-aware formatting verbs
  formatLocaleNumber: 2, // @path [locale] — locale is optional
  formatLocaleDate: 2, // @path [locale]

  // Cumulative and time-series array verbs
  cumsum: 1, // @array
  cumprod: 1, // @array
  shift: 3, // @array [periods] [fillValue]
  diff: 2, // @array [periods]
  pctChange: 2, // @array [periods]

  // Additional string verbs
  matches: 2, // @path "regex"
  stripAccents: 1, // @path
  clean: 1, // @path

  // Statistical verbs
  zscore: 2, // @value @array

  // Date calculation verbs
  daysBetweenDates: 2, // @startDate @endDate
  ageFromDate: 2, // @birthDate [@asOfDate]
  isValidDate: 2, // @value @format

  // Safe arithmetic verbs
  safeDivide: 3, // @numerator @denominator @default

  // Deduplication verbs
  dedupe: 2, // @array "keyField"

  // Geo/Spatial verbs
  distance: 5, // @lat1 @lon1 @lat2 @lon2 [unit]
  inBoundingBox: 6, // @lat @lon @minLat @minLon @maxLat @maxLon
  toRadians: 1,
  toDegrees: 1,
  bearing: 4, // @lat1 @lon1 @lat2 @lon2
  midpoint: 4, // @lat1 @lon1 @lat2 @lon2

  // LLM/Text processing verbs
  tokenize: 2, // @path [delimiter]
  wordCount: 1,

  // Fuzzy string matching verbs
  levenshtein: 2, // @str1 @str2
  soundex: 1,

  // Window/Ranking verbs
  rowNumber: 1,
  rank: 3, // @array [field] [direction]
  lag: 3, // @array [periods] [default]
  lead: 3, // @array [periods] [default]

  // Sampling verbs
  sample: 3, // @array count [seed]
  limit: 2, // @array count (alias for take)
  fillMissing: 3, // @array [value] [strategy]

  // Validation verbs
  assert: 2, // @condition [message]

  // Collection coercion verbs
  toArray: 1,
  toObject: 1,

  // JSON query verbs
  jsonPath: 2, // @object "path"

  // New verbs
  reduce: 3, // @array "verbName" initialValue
  pivot: 3, // @array "keyField" "valueField"
  unpivot: 3, // @object "keyName" "valueName"
  formatPhone: 2, // @value "countryCode"
  movingAvg: 2, // @array ##windowSize
  businessDays: 2, // @date ##count
  nextBusinessDay: 1, // @date
  formatDuration: 1, // @duration
  convertUnit: 3, // @value "fromUnit" "toUnit"
};

/**
 * Minimum arity for verbs with optional arguments.
 * If not listed, min arity equals the arity (all args required).
 */
export const VERB_MIN_ARITY: Record<string, number> = {
  uuid: 0, // seed is optional
  random: 0, // all args optional (min, max, seed)
  log: 1, // base is optional, defaults to e
  distinct: 1, // field is optional
  sort: 1, // field and direction are optional
  nanoid: 0, // size and seed are optional
  parseInt: 1, // radix is optional
  shift: 1, // periods and fillValue are optional
  diff: 1, // periods is optional
  pctChange: 1, // periods is optional
  ageFromDate: 1, // asOfDate is optional
  distance: 4, // unit is optional
  tokenize: 1, // delimiter is optional
  rank: 1, // field and direction are optional
  lag: 1, // periods and default are optional
  lead: 1, // periods and default are optional
  sample: 2, // seed is optional
  fillMissing: 1, // value and strategy are optional
  assert: 1, // message is optional
  range: 2, // step is optional
  irr: 1, // guess is optional
  get: 2, // default is optional
  formatLocaleNumber: 1, // locale is optional
  truncate: 2, // suffix is optional
  padLeft: 2, // pad char is optional (defaults to space)
  padRight: 2, // pad char is optional (defaults to space)
  pad: 2, // pad char is optional (defaults to space)
  split: 2, // index is optional (returns array when omitted)
};

/**
 * Get the arity for a verb. Returns -1 for unknown verbs (treat as variadic).
 */
export function getVerbArity(verb: string): number {
  return VERB_ARITY[verb] ?? -1;
}

/**
 * Get the minimum required arguments for a verb.
 * For variadic verbs (-1 arity), returns 1 (most need at least one arg).
 * For fixed-arity verbs, returns the min arity (equals arity unless has optional args).
 */
export function getVerbMinArity(verb: string): number {
  const minArity = VERB_MIN_ARITY[verb];
  if (minArity !== undefined) {
    return minArity;
  }
  const arity = getVerbArity(verb);
  // Variadic verbs: require at least 1 arg for safety
  // Zero-arity verbs: require 0
  // Fixed-arity verbs: require exactly arity
  if (arity < 0) return 1;
  return arity;
}
