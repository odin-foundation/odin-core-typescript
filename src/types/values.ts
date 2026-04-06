/**
 * ODIN Value Types
 *
 * Unified type system for ODIN values with embedded modifiers.
 * This is the canonical data model (CDM) representation used throughout
 * the SDK, including parsing, transformation, and serialization.
 *
 * Design principles:
 * 1. Each value is self-contained (type + value + modifiers)
 * 2. No separate modifier maps - modifiers are intrinsic to values
 * 3. Factory methods create values with proper types
 * 4. Strict typing prevents non-ODIN types from leaking in
 * 5. Language-agnostic naming for cross-SDK portability
 */

import { formatDateOnly, hasAnyModifier } from '../utils/format-utils.js';
import { isValidNumberString, validateSafeNumber } from '../utils/security-limits.js';

// ─────────────────────────────────────────────────────────────────────────────
// Modifiers (embedded in all value types)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Modifiers that can be applied to any ODIN value.
 *
 * In ODIN notation:
 * - `!` prefix = required (called "critical" in some contexts)
 * - `*` prefix = confidential (should be redacted/masked)
 * - `-` prefix = deprecated (obsolete, may be removed)
 *
 * Modifiers can be combined: `!*"secret"` is both required and confidential.
 */
export interface OdinModifiers {
  /** Field is required (! modifier). */
  readonly required?: boolean;

  /** Value should be masked/redacted (* modifier). */
  readonly confidential?: boolean;

  /** Field is deprecated (- modifier). */
  readonly deprecated?: boolean;

  /** Emit as XML attribute instead of child element (:attr modifier). */
  readonly attr?: boolean;
}

/**
 * Trailing directives that can follow any ODIN value.
 *
 * In ODIN notation, directives follow values with colon prefix:
 * - `:pos 3` = position directive
 * - `:len 8` = length directive
 * - `:format ssn` = format directive
 * - `:trim` = trim directive (no value)
 *
 * Example: `field = @_line :pos 3 :len 8 :trim`
 */
export interface OdinDirective {
  /** Directive name (e.g., "pos", "len", "format", "trim"). */
  readonly name: string;
  /** Optional directive value (e.g., 3, 8, "ssn"). */
  readonly value?: string | number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Value Type Discriminators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All possible ODIN value types.
 */
export type OdinValueType =
  | 'null'
  | 'boolean'
  | 'string'
  | 'integer'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'timestamp'
  | 'time'
  | 'duration'
  | 'reference'
  | 'binary'
  | 'verb'
  | 'array'
  | 'object';

// ─────────────────────────────────────────────────────────────────────────────
// Base Value Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base interface for all ODIN values.
 *
 * Every ODIN value has:
 * - A type discriminator
 * - Optional modifiers (required, confidential, deprecated)
 *
 * Specific value types extend this with their payload.
 */
export interface OdinTypedValueBase {
  readonly type: OdinValueType;
  readonly modifiers?: OdinModifiers;
  /** Trailing directives (e.g., :pos 3 :len 8). */
  readonly directives?: ReadonlyArray<OdinDirective>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete Value Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Null value (~).
 */
export interface OdinNull extends OdinTypedValueBase {
  readonly type: 'null';
}

/**
 * Boolean value (true, false, ?true, ?false).
 */
export interface OdinBoolean extends OdinTypedValueBase {
  readonly type: 'boolean';
  readonly value: boolean;
}

/**
 * String value (bare word or quoted).
 */
export interface OdinString extends OdinTypedValueBase {
  readonly type: 'string';
  readonly value: string;
}

/**
 * Integer value (##).
 *
 * Integers are whole numbers with no decimal component.
 * In ODIN notation: `##42`, `##-17`
 *
 * For values beyond JavaScript's safe integer range (2^53 - 1),
 * the `raw` field preserves the exact string representation
 * while `value` contains the best-effort numeric approximation.
 * Use `raw` for round-trip serialization of large integers.
 */
export interface OdinInteger extends OdinTypedValueBase {
  readonly type: 'integer';
  readonly value: number;
  /** Original string representation for round-trip preservation. */
  readonly raw?: string;
}

/**
 * Decimal number value (#).
 *
 * Numbers can have decimal places.
 * In ODIN notation: `#99.99`, `#3.14159`
 *
 * For high-precision values (e.g., scientific constants), the `raw`
 * field preserves the exact string representation to avoid floating-point
 * precision loss during round-trip serialization.
 */
export interface OdinNumber extends OdinTypedValueBase {
  readonly type: 'number';
  readonly value: number;
  /** Number of decimal places (for formatting). */
  readonly decimalPlaces?: number;
  /** Original string representation for round-trip preservation. */
  readonly raw?: string;
}

/**
 * Currency value (#$).
 *
 * Currency values have a fixed number of decimal places (default 2).
 * In ODIN notation: `#$100.00`, `#$1234.5678` (4 decimals)
 *
 * Currency codes can be specified after the value: `#$100.00:USD`
 * When no code is specified, local currency is assumed.
 *
 * For high-precision values (e.g., crypto with 18 decimals), the `raw`
 * field preserves the exact string representation to avoid floating-point
 * precision loss during round-trip serialization.
 */
export interface OdinCurrency extends OdinTypedValueBase {
  readonly type: 'currency';
  readonly value: number;
  /** Number of decimal places (default 2). */
  readonly decimalPlaces: number;
  /** Optional currency code (e.g., "USD", "EUR"). When absent, local currency is assumed. */
  readonly currencyCode?: string;
  /** Original string representation for round-trip preservation. */
  readonly raw?: string;
}

/**
 * Percentage value (#%).
 *
 * Percentages are stored as decimal values in the 0-1 range.
 * In ODIN notation: `#%0.15` (15%), `#%1.0` (100%), `#%0.055` (5.5%)
 *
 * The canonical range is 0-1, but values outside this range are permitted
 * (e.g., `#%1.5` for 150%). Schema validation can enforce bounds if needed.
 */
export interface OdinPercent extends OdinTypedValueBase {
  readonly type: 'percent';
  readonly value: number;
  /** Original string representation for round-trip preservation. */
  readonly raw?: string;
}

/**
 * Date value (YYYY-MM-DD).
 *
 * Dates represent a calendar day without time.
 * In ODIN notation: `2024-06-15`
 */
export interface OdinDate extends OdinTypedValueBase {
  readonly type: 'date';
  readonly value: Date;
  /** Original string representation for round-trip preservation. */
  readonly raw: string;
}

/**
 * Timestamp value (ISO 8601 with time and timezone).
 *
 * Timestamps represent a specific instant in time.
 * In ODIN notation: `2024-06-15T14:30:00Z`
 */
export interface OdinTimestamp extends OdinTypedValueBase {
  readonly type: 'timestamp';
  readonly value: Date;
  /** Original string representation for round-trip preservation. */
  readonly raw: string;
}

/**
 * Time value (THH:MM:SS).
 *
 * Times represent a time of day without a date.
 * In ODIN notation: `T14:30:00`, `T09:15:30.500`
 */
export interface OdinTime extends OdinTypedValueBase {
  readonly type: 'time';
  /** Time as string with T prefix (e.g., "T14:30:00"). */
  readonly value: string;
}

/**
 * Duration value (ISO 8601 duration).
 *
 * Durations represent a span of time.
 * In ODIN notation: `P1Y6M`, `PT30M`, `P2W`
 */
export interface OdinDuration extends OdinTypedValueBase {
  readonly type: 'duration';
  /** Duration as ISO 8601 string with P prefix. */
  readonly value: string;
}

/**
 * Reference to another path (@path).
 *
 * References point to other values in the document.
 * In ODIN notation: `@policy.id`, `@.current_item`
 */
export interface OdinReference extends OdinTypedValueBase {
  readonly type: 'reference';
  /** Target path (without @ prefix). */
  readonly path: string;
}

/**
 * Binary value (^base64 or ^algorithm:base64).
 *
 * Binary data encoded in base64.
 * In ODIN notation: `^SGVsbG8=`, `^sha256:abc123...`
 */
export interface OdinBinary extends OdinTypedValueBase {
  readonly type: 'binary';
  /** Decoded binary data. */
  readonly data: Uint8Array;
  /** Algorithm if specified (e.g., "sha256", "ed25519"). */
  readonly algorithm?: string;
}

/**
 * Verb expression value (%verb args).
 *
 * Verb expressions represent transformation operations.
 * In ODIN notation: `%upper @name`, `%concat @first " " @last`
 *
 * This is a first-class value type, eliminating the need to quote
 * verb expressions as strings in transform documents.
 */
export interface OdinVerbExpression extends OdinTypedValueBase {
  readonly type: 'verb';
  /** Verb name (e.g., 'upper', 'concat', 'lookup'). */
  readonly verb: string;
  /** Whether this is a custom verb (%&namespace.verb). */
  readonly isCustom: boolean;
  /** Parsed arguments (can include nested verb expressions). */
  readonly args: ReadonlyArray<OdinTypedValue>;
}

/**
 * Array item type - can be either:
 * - A Map of field names to values (for ODIN array-of-records syntax)
 * - An OdinTypedValue directly (for flat arrays from transforms)
 */
export type OdinArrayItem = ReadonlyMap<string, OdinTypedValue> | OdinTypedValue;

/**
 * Array of values.
 *
 * Arrays hold ordered collections that can be:
 * - Arrays of objects (Maps) for ODIN array-of-records syntax: [{Name="Alice"}, {Name="Bob"}]
 * - Arrays of typed values for flat arrays: [1, 2, 3] or transform results
 */
export interface OdinArray extends OdinTypedValueBase {
  readonly type: 'array';
  /** Array items (each is either an object Map or a typed value). */
  readonly items: ReadonlyArray<OdinArrayItem>;
}

/**
 * Object value (nested key-value pairs).
 *
 * Objects hold named fields with values.
 */
export interface OdinObject extends OdinTypedValueBase {
  readonly type: 'object';
  /** Object fields. */
  readonly value: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Union of all ODIN value types.
 *
 * This is the canonical type for any ODIN value throughout the SDK.
 */
export type OdinTypedValue =
  | OdinNull
  | OdinBoolean
  | OdinString
  | OdinInteger
  | OdinNumber
  | OdinCurrency
  | OdinPercent
  | OdinDate
  | OdinTimestamp
  | OdinTime
  | OdinDuration
  | OdinReference
  | OdinBinary
  | OdinVerbExpression
  | OdinArray
  | OdinObject;

/**
 * Alias for OdinTypedValue - the canonical value type.
 *
 * Both names are valid; use whichever fits better in your context:
 * - OdinTypedValue: More explicit about the unified type system
 * - OdinValue: Shorter, more commonly used in document operations
 */
export type OdinValue = OdinTypedValue;

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

export function isOdinNull(value: OdinTypedValue): value is OdinNull {
  return value.type === 'null';
}

export function isOdinBoolean(value: OdinTypedValue): value is OdinBoolean {
  return value.type === 'boolean';
}

export function isOdinString(value: OdinTypedValue): value is OdinString {
  return value.type === 'string';
}

export function isOdinInteger(value: OdinTypedValue): value is OdinInteger {
  return value.type === 'integer';
}

export function isOdinNumber(value: OdinTypedValue): value is OdinNumber {
  return value.type === 'number';
}

export function isOdinCurrency(value: OdinTypedValue): value is OdinCurrency {
  return value.type === 'currency';
}

export function isOdinPercent(value: OdinTypedValue): value is OdinPercent {
  return value.type === 'percent';
}

export function isOdinDate(value: OdinTypedValue): value is OdinDate {
  return value.type === 'date';
}

export function isOdinTimestamp(value: OdinTypedValue): value is OdinTimestamp {
  return value.type === 'timestamp';
}

export function isOdinTime(value: OdinTypedValue): value is OdinTime {
  return value.type === 'time';
}

export function isOdinDuration(value: OdinTypedValue): value is OdinDuration {
  return value.type === 'duration';
}

export function isOdinReference(value: OdinTypedValue): value is OdinReference {
  return value.type === 'reference';
}

export function isOdinBinary(value: OdinTypedValue): value is OdinBinary {
  return value.type === 'binary';
}

export function isOdinVerbExpression(value: OdinTypedValue): value is OdinVerbExpression {
  return value.type === 'verb';
}

export function isOdinArray(value: OdinTypedValue): value is OdinArray {
  return value.type === 'array';
}

export function isOdinObject(value: OdinTypedValue): value is OdinObject {
  return value.type === 'object';
}

/**
 * Check if a value is any numeric type (integer, number, currency, or percent).
 */
export function isOdinNumeric(
  value: OdinTypedValue
): value is OdinInteger | OdinNumber | OdinCurrency | OdinPercent {
  return (
    value.type === 'integer' ||
    value.type === 'number' ||
    value.type === 'currency' ||
    value.type === 'percent'
  );
}

/**
 * Check if a value is any temporal type (date, timestamp, time, or duration).
 */
export function isOdinTemporal(
  value: OdinTypedValue
): value is OdinDate | OdinTimestamp | OdinTime | OdinDuration {
  return (
    value.type === 'date' ||
    value.type === 'timestamp' ||
    value.type === 'time' ||
    value.type === 'duration'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Functions (OdinValues namespace)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory functions for creating ODIN values.
 *
 * Use these instead of constructing value objects directly.
 * This ensures proper defaults and type safety.
 *
 * @example
 * ```typescript
 * // Create a required currency value
 * const price = OdinValues.currency(99.99, { required: true });
 *
 * // Create a confidential string
 * const secret = OdinValues.string("password123", { confidential: true });
 *
 * // Create a date from ISO string
 * const date = OdinValues.date("2024-06-15");
 * ```
 */
/**
 * Helper to build modifiers object with only truthy values.
 * Works around TypeScript's exactOptionalPropertyTypes.
 */
function buildModifiers(m: Partial<OdinModifiers>): OdinModifiers {
  const result: { required?: boolean; confidential?: boolean; deprecated?: boolean } = {};
  if (m.required) result.required = m.required;
  if (m.confidential) result.confidential = m.confidential;
  if (m.deprecated) result.deprecated = m.deprecated;
  return result;
}

export namespace OdinValues {
  /**
   * Create a null value.
   */
  export function nullValue(modifiers?: OdinModifiers): OdinNull {
    return modifiers ? { type: 'null', modifiers } : { type: 'null' };
  }

  /**
   * Create a boolean value.
   */
  export function boolean(value: boolean, modifiers?: OdinModifiers): OdinBoolean {
    return modifiers ? { type: 'boolean', value, modifiers } : { type: 'boolean', value };
  }

  /**
   * Create a string value.
   */
  export function string(value: string, modifiers?: OdinModifiers): OdinString {
    return modifiers ? { type: 'string', value, modifiers } : { type: 'string', value };
  }

  /**
   * Create an integer value.
   *
   * @param value - Integer as number or string
   * @param options - Options including raw string and modifiers
   *
   * For values beyond JavaScript's safe integer range (2^53 - 1),
   * pass as string to preserve the exact value in the `raw` field.
   *
   * @example
   * ```typescript
   * // Standard integer
   * OdinValues.integer(42);
   *
   * // Large integer (beyond safe range) - use string
   * OdinValues.integer('12345678901234567890');
   * ```
   */
  export function integer(
    value: number | string,
    options?: { raw?: string; modifiers?: OdinModifiers }
  ): OdinInteger {
    let intValue: number;
    let raw: string | undefined = options?.raw;

    if (typeof value === 'string') {
      intValue = Math.trunc(Number(value));
      // Preserve raw for large numbers that lose precision
      if (!Number.isSafeInteger(intValue) || value.length > 15) {
        raw = raw ?? value;
      }
    } else {
      intValue = Math.trunc(value);
    }

    const result: OdinInteger = { type: 'integer', value: intValue };
    if (raw !== undefined) {
      (result as { raw: string }).raw = raw;
    }
    if (options?.modifiers) {
      (result as { modifiers: OdinModifiers }).modifiers = options.modifiers;
    }
    return result;
  }

  /**
   * Create a number value.
   *
   * @param value - Numeric value or string for high-precision values
   * @param options - Options including decimalPlaces, raw, and modifiers
   *
   * For high-precision values (e.g., scientific constants), pass the value as a string
   * or include `raw` in options to preserve exact representation during serialization.
   *
   * @example
   * ```typescript
   * // Standard number
   * OdinValues.number(3.14159);
   *
   * // High-precision - pass as string to preserve precision
   * OdinValues.number("3.14159265358979323846", { decimalPlaces: 20 });
   * ```
   */
  export function number(
    value: number | string,
    options?: { decimalPlaces?: number; raw?: string } & OdinModifiers
  ): OdinNumber {
    const { decimalPlaces, raw, ...modifiers } = options ?? {};

    // If value is a string, use it as raw and parse to number
    let numValue: number;
    let rawValue: string | undefined;

    if (typeof value === 'string') {
      // Validate that the string is a valid number format
      if (!isValidNumberString(value)) {
        throw new Error(`Invalid number string: "${value}"`);
      }
      numValue = parseFloat(value);
      rawValue = value;
    } else {
      numValue = value;
      rawValue = raw;
    }

    // Validate the parsed number is safe to use
    if (!validateSafeNumber(numValue)) {
      throw new Error(`Number value is not safe: ${numValue}`);
    }

    const result: OdinNumber = { type: 'number', value: numValue };
    if (rawValue) {
      (result as { raw?: string }).raw = rawValue;
    }
    if (decimalPlaces !== undefined) {
      (result as { decimalPlaces?: number }).decimalPlaces = decimalPlaces;
    }
    if (hasAnyModifier(modifiers)) {
      (result as { modifiers?: OdinModifiers }).modifiers = buildModifiers(modifiers);
    }
    return result;
  }

  /**
   * Create a currency value.
   *
   * @param value - Numeric value or string for high-precision values
   * @param options - Options including decimalPlaces (default 2), currencyCode, raw, and modifiers
   *
   * For high-precision values (e.g., crypto with 18 decimals), pass the value as a string
   * or include `raw` in options to preserve exact representation during serialization.
   *
   * @example
   * ```typescript
   * // Standard currency (2 decimals)
   * OdinValues.currency(99.99);
   *
   * // Crypto with 18 decimals - pass as string to preserve precision
   * OdinValues.currency("123.450000000000000000", { decimalPlaces: 18 });
   *
   * // Or pass raw separately
   * OdinValues.currency(123.45, { decimalPlaces: 18, raw: "123.450000000000000000" });
   * ```
   */
  export function currency(
    value: number | string,
    options?: { decimalPlaces?: number; currencyCode?: string; raw?: string } & OdinModifiers
  ): OdinCurrency {
    const { decimalPlaces = 2, currencyCode, raw, ...modifiers } = options ?? {};

    // If value is a string, use it as raw and parse to number
    let numValue: number;
    let rawValue: string | undefined;

    if (typeof value === 'string') {
      // Validate that the string is a valid number format
      if (!isValidNumberString(value)) {
        throw new Error(`Invalid currency string: "${value}"`);
      }
      numValue = parseFloat(value);
      rawValue = value;
    } else {
      numValue = value;
      rawValue = raw;
    }

    // Validate the parsed number is safe to use
    if (!validateSafeNumber(numValue)) {
      throw new Error(`Currency value is not safe: ${numValue}`);
    }

    const result: OdinCurrency = { type: 'currency', value: numValue, decimalPlaces };
    if (rawValue) {
      (result as { raw?: string }).raw = rawValue;
    }
    if (currencyCode) {
      (result as { currencyCode?: string }).currencyCode = currencyCode;
    }
    if (hasAnyModifier(modifiers)) {
      (result as { modifiers?: OdinModifiers }).modifiers = buildModifiers(modifiers);
    }
    return result;
  }

  /**
   * Create a percentage value.
   *
   * @param value - Numeric value (0-1 range, where 0.5 = 50%) or string for precision
   * @param options - Options including raw string and modifiers
   *
   * The canonical range is 0-1, but values outside this range are permitted.
   * Schema validation can enforce bounds if needed.
   *
   * @example
   * ```typescript
   * // 15% as decimal
   * OdinValues.percent(0.15);
   *
   * // 100%
   * OdinValues.percent(1.0);
   *
   * // High-precision - pass as string
   * OdinValues.percent("0.123456789");
   * ```
   */
  export function percent(
    value: number | string,
    options?: { raw?: string } & OdinModifiers
  ): OdinPercent {
    const { raw, ...modifiers } = options ?? {};

    let numValue: number;
    let rawValue: string | undefined;

    if (typeof value === 'string') {
      if (!isValidNumberString(value)) {
        throw new Error(`Invalid percent string: "${value}"`);
      }
      numValue = parseFloat(value);
      rawValue = value;
    } else {
      numValue = value;
      rawValue = raw;
    }

    if (!validateSafeNumber(numValue)) {
      throw new Error(`Percent value is not safe: ${numValue}`);
    }

    const result: OdinPercent = { type: 'percent', value: numValue };
    if (rawValue) {
      (result as { raw?: string }).raw = rawValue;
    }
    if (hasAnyModifier(modifiers)) {
      (result as { modifiers?: OdinModifiers }).modifiers = buildModifiers(modifiers);
    }
    return result;
  }

  /**
   * Create a date value from a Date object or ISO string.
   */
  export function date(value: Date | string, modifiers?: OdinModifiers): OdinDate {
    const dateValue = typeof value === 'string' ? new Date(value) : value;
    const raw =
      typeof value === 'string' ? value.split('T')[0]! : formatDateOnlyInternal(dateValue);
    return modifiers
      ? { type: 'date', value: dateValue, raw, modifiers }
      : { type: 'date', value: dateValue, raw };
  }

  /**
   * Create a timestamp value from a Date object or ISO string.
   */
  export function timestamp(value: Date | string, modifiers?: OdinModifiers): OdinTimestamp {
    const dateValue = typeof value === 'string' ? new Date(value) : value;
    const raw = typeof value === 'string' ? value : dateValue.toISOString();
    return modifiers
      ? { type: 'timestamp', value: dateValue, raw, modifiers }
      : { type: 'timestamp', value: dateValue, raw };
  }

  /**
   * Create a time value.
   *
   * @param value - Time string with or without T prefix (e.g., "14:30:00" or "T14:30:00")
   */
  export function time(value: string, modifiers?: OdinModifiers): OdinTime {
    const timeValue = value.startsWith('T') ? value : `T${value}`;
    return modifiers
      ? { type: 'time', value: timeValue, modifiers }
      : { type: 'time', value: timeValue };
  }

  /**
   * Create a duration value.
   *
   * @param value - ISO 8601 duration string (e.g., "P1Y6M", "PT30M")
   */
  export function duration(value: string, modifiers?: OdinModifiers): OdinDuration {
    return modifiers ? { type: 'duration', value, modifiers } : { type: 'duration', value };
  }

  /**
   * Create a reference value.
   *
   * @param path - Target path without @ prefix
   */
  export function reference(path: string, modifiers?: OdinModifiers): OdinReference {
    return modifiers ? { type: 'reference', path, modifiers } : { type: 'reference', path };
  }

  /**
   * Create a binary value.
   */
  export function binary(
    data: Uint8Array,
    options?: { algorithm?: string } & OdinModifiers
  ): OdinBinary {
    const { algorithm, ...modifiers } = options ?? {};
    const result: OdinBinary = { type: 'binary', data };
    if (algorithm) {
      (result as { algorithm?: string }).algorithm = algorithm;
    }
    if (hasAnyModifier(modifiers)) {
      (result as { modifiers?: OdinModifiers }).modifiers = buildModifiers(modifiers);
    }
    return result;
  }

  /**
   * Create a verb expression value.
   *
   * @param verbName - The verb name (e.g., 'upper', 'concat')
   * @param args - The verb arguments (can include nested verb expressions)
   * @param options - Options including isCustom flag and modifiers
   */
  export function verb(
    verbName: string,
    args: ReadonlyArray<OdinTypedValue>,
    options?: { isCustom?: boolean } & OdinModifiers
  ): OdinVerbExpression {
    const { isCustom = false, ...modifiers } = options ?? {};
    const result: OdinVerbExpression = { type: 'verb', verb: verbName, isCustom, args };
    if (hasAnyModifier(modifiers)) {
      (result as { modifiers?: OdinModifiers }).modifiers = buildModifiers(modifiers);
    }
    return result;
  }

  /**
   * Create an array value.
   */
  export function array(items: ReadonlyArray<OdinArrayItem>, modifiers?: OdinModifiers): OdinArray {
    return modifiers ? { type: 'array', items, modifiers } : { type: 'array', items };
  }

  /**
   * Create an object value.
   */
  export function object(value: Record<string, unknown>, modifiers?: OdinModifiers): OdinObject {
    return modifiers ? { type: 'object', value, modifiers } : { type: 'object', value };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Type Coercion Functions
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Helper to format date as YYYY-MM-DD string.
   * Re-exported from format-utils for internal use in this module.
   */
  function formatDateOnlyInternal(date: Date): string {
    return formatDateOnly(date);
  }

  /**
   * Coerce any ODIN value to a string.
   */
  export function toString(value: OdinTypedValue): OdinString {
    let stringValue: string;
    switch (value.type) {
      case 'null':
        stringValue = '';
        break;
      case 'boolean':
        stringValue = value.value.toString();
        break;
      case 'string':
        stringValue = value.value;
        break;
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        stringValue = value.value.toString();
        break;
      case 'date':
        stringValue = value.raw;
        break;
      case 'timestamp':
        stringValue = value.raw;
        break;
      case 'time':
      case 'duration':
        stringValue = value.value;
        break;
      case 'reference':
        stringValue = `@${value.path}`;
        break;
      case 'binary':
        stringValue = Buffer.from(value.data).toString('base64');
        break;
      case 'verb': {
        const prefix = value.isCustom ? '%&' : '%';
        const argsStr = value.args.map((a) => toString(a).value).join(' ');
        stringValue = `${prefix}${value.verb}${argsStr ? ' ' + argsStr : ''}`;
        break;
      }
      case 'array':
        stringValue = JSON.stringify(value.items);
        break;
      case 'object':
        stringValue = JSON.stringify(value.value);
        break;
    }
    return string(stringValue, value.modifiers);
  }

  /**
   * Coerce any ODIN value to an integer.
   */
  export function toInteger(value: OdinTypedValue): OdinInteger {
    let intValue: number;
    switch (value.type) {
      case 'null':
        intValue = 0;
        break;
      case 'boolean':
        intValue = value.value ? 1 : 0;
        break;
      case 'string':
        intValue = Math.trunc(parseFloat(value.value) || 0);
        break;
      case 'integer':
        intValue = value.value;
        break;
      case 'number':
      case 'currency':
      case 'percent':
        intValue = Math.trunc(value.value);
        break;
      default:
        intValue = 0;
    }
    return integer(intValue, value.modifiers ? { modifiers: value.modifiers } : undefined);
  }

  /**
   * Coerce any ODIN value to a number.
   */
  export function toNumber(
    value: OdinTypedValue,
    options?: { decimalPlaces?: number }
  ): OdinNumber {
    let numValue: number;
    switch (value.type) {
      case 'null':
        numValue = 0;
        break;
      case 'boolean':
        numValue = value.value ? 1 : 0;
        break;
      case 'string':
        numValue = parseFloat(value.value) || 0;
        break;
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        numValue = value.value;
        break;
      default:
        numValue = 0;
    }
    return number(numValue, { ...options, ...value.modifiers });
  }

  /**
   * Coerce any ODIN value to a currency.
   */
  export function toCurrency(
    value: OdinTypedValue,
    options?: { decimalPlaces?: number; currencyCode?: string }
  ): OdinCurrency {
    let numValue: number;
    switch (value.type) {
      case 'null':
        numValue = 0;
        break;
      case 'boolean':
        numValue = value.value ? 1 : 0;
        break;
      case 'string':
        numValue = parseFloat(value.value) || 0;
        break;
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        numValue = value.value;
        break;
      default:
        numValue = 0;
    }
    return currency(numValue, { ...options, ...value.modifiers });
  }

  /**
   * Coerce any ODIN value to a percent.
   */
  export function toPercent(value: OdinTypedValue): OdinPercent {
    let numValue: number;
    switch (value.type) {
      case 'null':
        numValue = 0;
        break;
      case 'boolean':
        numValue = value.value ? 1 : 0;
        break;
      case 'string':
        numValue = parseFloat(value.value) || 0;
        break;
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        numValue = value.value;
        break;
      default:
        numValue = 0;
    }
    return percent(numValue, value.modifiers);
  }

  /**
   * Coerce any ODIN value to a boolean.
   */
  export function toBoolean(value: OdinTypedValue): OdinBoolean {
    let boolValue: boolean;
    switch (value.type) {
      case 'null':
        boolValue = false;
        break;
      case 'boolean':
        boolValue = value.value;
        break;
      case 'string':
        boolValue = value.value.toLowerCase() === 'true' || value.value === '1';
        break;
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        boolValue = value.value !== 0;
        break;
      default:
        boolValue = false;
    }
    return boolean(boolValue, value.modifiers);
  }

  /**
   * Coerce any ODIN value to a date.
   */
  export function toDate(value: OdinTypedValue): OdinDate {
    let dateValue: Date;
    switch (value.type) {
      case 'date':
        return value;
      case 'timestamp':
        dateValue = value.value;
        break;
      case 'string':
        dateValue = new Date(value.value);
        break;
      default:
        dateValue = new Date(0);
    }
    return date(dateValue, value.modifiers);
  }

  /**
   * Coerce any ODIN value to a timestamp.
   */
  export function toTimestamp(value: OdinTypedValue): OdinTimestamp {
    let dateValue: Date;
    switch (value.type) {
      case 'timestamp':
        return value;
      case 'date':
        dateValue = value.value;
        break;
      case 'string':
        dateValue = new Date(value.value);
        break;
      default:
        dateValue = new Date(0);
    }
    return timestamp(dateValue, value.modifiers);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Value Introspection
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Check if a value has the required modifier.
   */
  export function isRequired(value: OdinTypedValue): boolean {
    return value.modifiers?.required === true;
  }

  /**
   * Check if a value has the confidential modifier.
   */
  export function isConfidential(value: OdinTypedValue): boolean {
    return value.modifiers?.confidential === true;
  }

  /**
   * Check if a value has the deprecated modifier.
   */
  export function isDeprecated(value: OdinTypedValue): boolean {
    return value.modifiers?.deprecated === true;
  }

  /**
   * Create a copy of a value with updated modifiers.
   */
  export function withModifiers<T extends OdinTypedValue>(value: T, modifiers: OdinModifiers): T {
    if (!hasAnyModifier(modifiers)) {
      // Remove modifiers if all are falsy
      const { modifiers: _, ...rest } = value as OdinTypedValue & { modifiers?: OdinModifiers };
      return rest as T;
    }
    return { ...value, modifiers };
  }

  /**
   * Extract the raw JS value from an OdinTypedValue.
   *
   * This is useful for interoperability but should be used sparingly
   * as it loses type information.
   */
  export function unwrap(value: OdinTypedValue): unknown {
    switch (value.type) {
      case 'null':
        return null;
      case 'boolean':
      case 'string':
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        return value.value;
      case 'date':
      case 'timestamp':
        return value.value;
      case 'time':
      case 'duration':
        return value.value;
      case 'reference':
        return value.path;
      case 'binary':
        return value.data;
      case 'verb':
        return { verb: value.verb, isCustom: value.isCustom, args: value.args.map(unwrap) };
      case 'array':
        return value.items;
      case 'object':
        return value.value;
    }
  }
}
