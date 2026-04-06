/**
 * ODIN Transform Numeric Verbs
 *
 * Numeric verbs: formatNumber, formatInteger, formatCurrency, abs, round, floor,
 * ceil, add, subtract, multiply, divide, mod, negate, switch.
 */

import type { VerbFunction } from '../../types/transform.js';
import { toString, toNumber, str, int, num, numericResult, nil } from './helpers.js';

/**
 * %formatNumber @path decimals - Format with decimal places
 */
export const formatNumber: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const n = toNumber(args[0]!);
  const decimals = Math.floor(toNumber(args[1]!));
  return str(n.toFixed(decimals));
};

/**
 * %formatInteger @path - Format as integer
 */
export const formatInteger: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return str(String(Math.floor(toNumber(args[0]!))));
};

/**
 * %formatCurrency @path - Format as currency (2 decimals)
 */
export const formatCurrency: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return str(toNumber(args[0]!).toFixed(2));
};

/**
 * %abs @path - Absolute value
 */
export const abs: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return numericResult(Math.abs(toNumber(args[0]!)));
};

/**
 * %round @path decimals - Round to decimal places
 */
export const round: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const n = toNumber(args[0]!);
  const decimals = Math.floor(toNumber(args[1]!));
  const factor = Math.pow(10, decimals);
  return numericResult(Math.round(n * factor) / factor);
};

/**
 * %floor @path - Round down
 */
export const floor: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return int(Math.floor(toNumber(args[0]!)));
};

/**
 * %ceil @path - Round up
 */
export const ceil: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return int(Math.ceil(toNumber(args[0]!)));
};

/**
 * %add @a @b - Add two values
 */
export const add: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  return numericResult(toNumber(args[0]!) + toNumber(args[1]!));
};

/**
 * %subtract @a @b - Subtract values
 */
export const subtract: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  return numericResult(toNumber(args[0]!) - toNumber(args[1]!));
};

/**
 * %multiply @path factor - Multiply
 */
export const multiply: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  return numericResult(toNumber(args[0]!) * toNumber(args[1]!));
};

/**
 * %divide @path divisor - Divide
 * Always returns number type (not integer) since division implies decimal result
 */
export const divide: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const divisor = toNumber(args[1]!);
  if (divisor === 0) return nil();
  return num(toNumber(args[0]!) / divisor);
};

/**
 * %mod @path divisor - Modulo
 */
export const mod: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const divisor = toNumber(args[1]!);
  if (divisor === 0) return nil();
  return numericResult(toNumber(args[0]!) % divisor);
};

/**
 * %negate @path - Negate value
 */
export const negate: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return numericResult(-toNumber(args[0]!));
};

/**
 * %switch @path "v1" "r1" "v2" "r2" ... "default" - Multi-way switch
 */
export const switchVerb: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const value = toString(args[0]!);

  // Process pairs: value, result, value, result, ..., default
  for (let i = 1; i < args.length - 1; i += 2) {
    const matchValue = toString(args[i]!);
    if (value === matchValue && i + 1 < args.length) {
      return args[i + 1]!;
    }
  }

  // Return default (last arg if odd number of args after value)
  if ((args.length - 1) % 2 === 1) {
    return args[args.length - 1]!;
  }
  return nil();
};

// ─────────────────────────────────────────────────────────────────────────────
// Additional Numeric Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %sign @path - Return the sign of a number: -1, 0, or 1
 */
export const sign: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const n = toNumber(args[0]!);
  if (Number.isNaN(n)) return nil();
  return int(Math.sign(n));
};

/**
 * %trunc @path - Truncate to integer (toward zero)
 * 3.7 → 3, -3.7 → -3
 */
export const trunc: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const n = toNumber(args[0]!);
  if (Number.isNaN(n)) return nil();
  return int(Math.trunc(n));
};

/**
 * Simple seeded random number generator (Mulberry32)
 * Returns a function that generates deterministic random numbers [0, 1)
 */
function seededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert a string seed to a numeric seed
 */
function stringToSeed(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash >>> 0; // Convert to unsigned
}

/**
 * %random [min] [max] [seed] - Generate random number
 * Without seed: generates a random number (not deterministic)
 * With seed: generates a deterministic number for the same seed
 *
 * @example
 * %random                    → random number [0, 1)
 * %random 1 10               → random integer [1, 10]
 * %random 1 10 "seed123"     → deterministic integer [1, 10]
 */
export const random: VerbFunction = (args) => {
  let min = 0;
  let max = 1;
  let useIntegers = false;
  let rng: () => number;

  // Parse arguments
  if (args.length >= 2) {
    min = toNumber(args[0]!);
    max = toNumber(args[1]!);
    useIntegers = true;
  } else if (args.length === 1) {
    // Single arg could be max or seed
    const arg = args[0]!;
    if (arg.type === 'string') {
      // Treat as seed for [0, 1)
      const seed = stringToSeed(arg.value);
      rng = seededRandom(seed);
      return numericResult(rng());
    }
    max = toNumber(arg);
    useIntegers = true;
  }

  // Check for seed as third argument
  if (args.length >= 3) {
    const seedArg = args[2]!;
    const seedStr = toString(seedArg);
    const seed = stringToSeed(seedStr);
    rng = seededRandom(seed);
  } else {
    rng = Math.random;
  }

  // Validate range
  if (min > max) return nil();

  // Generate random number in range
  if (useIntegers) {
    const range = Math.floor(max) - Math.floor(min) + 1;
    const value = Math.floor(min) + Math.floor(rng() * range);
    return int(value);
  }

  // Return float in [min, max)
  return numericResult(min + rng() * (max - min));
};

/**
 * %minOf @a @b @c ... - Return minimum of multiple values
 */
export const minOf: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  let minValue = Infinity;
  for (const arg of args) {
    const n = toNumber(arg);
    if (n < minValue) minValue = n;
  }

  if (!Number.isFinite(minValue)) return nil();
  return numericResult(minValue);
};

/**
 * %maxOf @a @b @c ... - Return maximum of multiple values
 */
export const maxOf: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  let maxValue = -Infinity;
  for (const arg of args) {
    const n = toNumber(arg);
    if (n > maxValue) maxValue = n;
  }

  if (!Number.isFinite(maxValue)) return nil();
  return numericResult(maxValue);
};

/**
 * %formatPercent @path [decimals] - Format number as percentage string
 * 0.1234 → "12.34%"
 * 0.1234, 1 → "12.3%"
 */
export const formatPercent: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const n = toNumber(args[0]!);
  const decimals = args.length >= 2 ? Math.floor(toNumber(args[1]!)) : 2;

  if (Number.isNaN(n)) return nil();

  const percent = n * 100;
  return str(percent.toFixed(Math.max(0, decimals)) + '%');
};

/**
 * %isFinite @path - Check if number is finite
 * Returns true for regular numbers, false for Infinity, -Infinity, and NaN
 */
export const isFiniteVerb: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const val = args[0]!;

  // Only makes sense for numeric types
  if (val.type !== 'integer' && val.type !== 'number' && val.type !== 'currency') {
    return { type: 'boolean', value: false };
  }

  return { type: 'boolean', value: Number.isFinite(val.value) };
};

/**
 * %isNaN @path - Check if value is NaN
 * Returns true if value is NaN, false otherwise
 */
export const isNaNVerb: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const val = args[0]!;

  // Only makes sense for numeric types
  if (val.type !== 'integer' && val.type !== 'number' && val.type !== 'currency') {
    return { type: 'boolean', value: false };
  }

  return { type: 'boolean', value: Number.isNaN(val.value) };
};

/**
 * %parseInt @path [radix] - Parse string to integer with optional radix
 * "FF", 16 → 255
 * "42" → 42
 */
export const parseIntVerb: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);
  const radix = args.length >= 2 ? Math.floor(toNumber(args[1]!)) : 10;

  // Validate radix
  if (radix < 2 || radix > 36) return nil();

  const result = parseInt(s, radix);
  if (Number.isNaN(result)) return nil();

  return int(result);
};

// ─────────────────────────────────────────────────────────────────────────────
// Safe Arithmetic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %safeDivide @numerator @denominator @default - Divide with fallback for zero denominator
 * Returns default value if denominator is 0, NaN, or Infinity.
 * Avoids the common pattern: %ifElse %eq @denom ##0 @default %divide @num @denom
 *
 * @example
 * ratio = "%safeDivide @total @count ##0"     ; Returns 0 if count is 0
 * pct = "%safeDivide @part @whole #1.0"       ; Returns 1.0 if whole is 0
 */
export const safeDivide: VerbFunction = (args) => {
  if (args.length < 3) return nil();

  const numerator = toNumber(args[0]!);
  const denominator = toNumber(args[1]!);
  const defaultValue = args[2]!;

  // Return default for division by zero or invalid denominator
  if (denominator === 0 || !Number.isFinite(denominator)) {
    return defaultValue;
  }

  // Also check for invalid numerator
  if (!Number.isFinite(numerator)) {
    return defaultValue;
  }

  const result = numerator / denominator;

  // Additional check for Infinity/NaN result (defensive safety check)
  if (!Number.isFinite(result)) {
    return defaultValue;
  }

  return numericResult(result);
};

// ─────────────────────────────────────────────────────────────────────────────
// Locale-Aware Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %formatLocaleNumber @path [locale] - Format number using locale-specific conventions
 * Uses Intl.NumberFormat for locale-aware number formatting.
 *
 * @example
 * %formatLocaleNumber @amount "de-DE"  ; 1234.56 → "1.234,56"
 * %formatLocaleNumber @amount "en-US"  ; 1234.56 → "1,234.56"
 * %formatLocaleNumber @amount          ; Uses system default locale
 */
export const formatLocaleNumber: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const n = toNumber(args[0]!);
  if (!Number.isFinite(n)) return nil();

  const locale = args.length >= 2 ? toString(args[1]!) : undefined;

  try {
    const formatter = new Intl.NumberFormat(locale);
    return str(formatter.format(n));
  } catch {
    // Invalid locale - fall back to default
    return str(new Intl.NumberFormat().format(n));
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Unit Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unit conversion factors organized by family.
 * Each family maps unit identifiers to their factor relative to the base unit.
 * Temperature is handled separately via formulas.
 */
const UNIT_FAMILIES: Record<string, Record<string, number>> = {
  mass: { kg: 1, g: 0.001, mg: 0.000001, lb: 0.453592, oz: 0.0283495, ton: 907.185, tonne: 1000 },
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048, in: 0.0254, yd: 0.9144 },
  volume: { L: 1, mL: 0.001, gal: 3.78541, qt: 0.946353, pt: 0.473176, cup: 0.236588, floz: 0.0295735 },
  speed: { mps: 1, kph: 0.277778, mph: 0.44704 },
  area: { sqm: 1, sqft: 0.092903, sqkm: 1000000, sqmi: 2589988.11, acre: 4046.8564, hectare: 10000 },
  data: { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 },
  time: { ms: 0.001, s: 1, min: 60, hr: 3600, day: 86400 },
};

/** Find which family a unit belongs to. Returns [familyName, factor] or null. */
function findUnitFamily(unit: string): [string, number] | null {
  for (const [family, units] of Object.entries(UNIT_FAMILIES)) {
    if (unit in units) return [family, units[unit]!];
  }
  return null;
}

/**
 * %convertUnit @value "fromUnit" "toUnit" - Convert between compatible units
 *
 * Supports mass, length, volume, speed, area, data, time, and temperature.
 * Incompatible units (kg→km) → T011. Unknown unit → T002.
 * Result rounded to 6 decimal places max.
 *
 * @example
 * weight = "%convertUnit @.mass \"kg\" \"lb\""    ; 100 → 220.462
 * temp = "%convertUnit @.temp \"F\" \"C\""         ; 72 → 22.222222
 */
export const convertUnit: VerbFunction = (args) => {
  if (args.length < 3) return nil();

  const value = toNumber(args[0]!);
  if (!Number.isFinite(value)) return nil();

  const fromUnit = toString(args[1]!);
  const toUnit = toString(args[2]!);

  // Handle temperature separately (formula-based, not ratio-based)
  const tempUnits = new Set(['C', 'F', 'K']);
  if (tempUnits.has(fromUnit) && tempUnits.has(toUnit)) {
    if (fromUnit === toUnit) return numericResult(value);

    // Convert to Celsius first
    let celsius: number;
    switch (fromUnit) {
      case 'C': celsius = value; break;
      case 'F': celsius = (value - 32) * 5 / 9; break;
      case 'K': celsius = value - 273.15; break;
      default: return nil();
    }

    // Convert from Celsius to target
    let result: number;
    switch (toUnit) {
      case 'C': result = celsius; break;
      case 'F': result = celsius * 9 / 5 + 32; break;
      case 'K': result = celsius + 273.15; break;
      default: return nil();
    }

    // Round to 6 decimal places
    result = Math.round(result * 1000000) / 1000000;
    return numericResult(result);
  }

  // One is temp, other is not → incompatible
  if (tempUnits.has(fromUnit) || tempUnits.has(toUnit)) return nil();

  // Look up families
  const fromFamily = findUnitFamily(fromUnit);
  const toFamily = findUnitFamily(toUnit);

  if (!fromFamily || !toFamily) return nil(); // Unknown unit
  if (fromFamily[0] !== toFamily[0]) return nil(); // Incompatible families

  if (fromUnit === toUnit) return numericResult(value);

  // Convert: value * fromFactor / toFactor
  const result = value * fromFamily[1] / toFamily[1];
  const rounded = Math.round(result * 1000000) / 1000000;
  return numericResult(rounded);
};
