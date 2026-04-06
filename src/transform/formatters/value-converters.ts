/**
 * ODIN Value Converters - Unified value-to-string conversion.
 *
 * Consolidates 4 duplicate switch statements from formatters.ts:
 * - odinValueToJsonValue (lines 152-215)
 * - odinValueToXmlString (lines 555-605)
 * - transformValueToString (lines 811-848)
 * - odinValueToFlatString (lines 1096-1141)
 */

import type { OdinValue } from '../../types/values.js';
import type { TransformValue } from '../../types/transform.js';
import type { ValueConversionOptions } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Core Conversion Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert OdinValue to string representation.
 * Unified function replacing duplicate switch statements across formatters.
 *
 * @param value - The OdinValue to convert
 * @param options - Conversion options for format-specific behavior
 * @returns String representation of the value
 */
export function odinValueToString(value: OdinValue, options: ValueConversionOptions = {}): string {
  const { preservePrecision = false, xmlEscape = false } = options;

  switch (value.type) {
    case 'null':
      return '';
    case 'boolean':
      return String(value.value);
    case 'string':
      return xmlEscape ? escapeXml(value.value) : value.value;
    case 'integer':
      return String(value.value);
    case 'number':
      if (preservePrecision && value.raw !== undefined) {
        return value.raw;
      }
      return String(value.value);
    case 'currency':
      if (preservePrecision && value.raw !== undefined) {
        return value.raw;
      }
      // Preserve decimal places for currency (default 2)
      if (value.decimalPlaces !== undefined && value.decimalPlaces >= 0) {
        return value.value.toFixed(value.decimalPlaces);
      }
      return String(value.value);
    case 'percent':
      if (preservePrecision && value.raw !== undefined) {
        return value.raw;
      }
      return String(value.value);
    case 'date':
      return value.raw;
    case 'timestamp':
      return value.raw;
    case 'time':
      return value.value;
    case 'duration':
      return value.value;
    case 'reference':
      return `@${value.path}`;
    case 'binary': {
      const b64 = btoa(String.fromCharCode(...value.data));
      return value.algorithm ? `^${value.algorithm}:${b64}` : `^${b64}`;
    }
    case 'array':
      return JSON.stringify(
        value.items.map((item) => {
          if (item instanceof Map) {
            const obj: Record<string, unknown> = {};
            for (const [k, v] of item) {
              obj[k] = odinValueToJsonCompatible(v as OdinValue, options);
            }
            return obj;
          }
          return odinValueToJsonCompatible(item as OdinValue, options);
        })
      );
    case 'object':
      return JSON.stringify(value.value);
    case 'verb':
      return `%${value.verb}`;
    default:
      return '';
  }
}

/**
 * Convert OdinValue to JSON-compatible value.
 * Used for JSON output where we want actual types (numbers, booleans) not strings.
 *
 * @param value - The OdinValue to convert
 * @param options - Conversion options
 * @returns JSON-compatible value
 */
export function odinValueToJsonCompatible(
  value: OdinValue,
  options: ValueConversionOptions = {}
): unknown {
  const { preservePrecision = false } = options;

  switch (value.type) {
    case 'null':
      return null;
    case 'boolean':
      return value.value;
    case 'string':
      return value.value;
    case 'integer':
      return value.value;
    case 'number':
      // Use raw string if available and it's a high-precision value
      if (preservePrecision && value.raw !== undefined && isHighPrecision(value.raw)) {
        return value.raw;
      }
      return value.value;
    case 'currency':
      // Currency often needs high precision
      if (preservePrecision && value.raw !== undefined) {
        return value.raw;
      }
      return value.value;
    case 'percent':
      // Percent may need high precision
      if (preservePrecision && value.raw !== undefined) {
        return value.raw;
      }
      return value.value;
    case 'date':
      return value.raw;
    case 'timestamp':
      return value.raw;
    case 'time':
      return value.value;
    case 'duration':
      return value.value;
    case 'reference':
      return `@${value.path}`;
    case 'binary': {
      const b64 = btoa(String.fromCharCode(...value.data));
      return value.algorithm ? `^${value.algorithm}:${b64}` : `^${b64}`;
    }
    case 'array':
      return value.items.map((item) => {
        if (item instanceof Map) {
          const obj: Record<string, unknown> = {};
          for (const [k, v] of item) {
            obj[k] = odinValueToJsonCompatible(v as OdinValue, options);
          }
          return obj;
        }
        return odinValueToJsonCompatible(item as OdinValue, options);
      });
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value.value)) {
        obj[k] = odinValueToJsonCompatible(v as OdinValue, options);
      }
      return obj;
    }
    case 'verb':
      return `%${value.verb}`;
    default:
      return null;
  }
}

/**
 * Convert TransformValue to string for fixed-width output.
 *
 * @param value - The TransformValue to convert
 * @returns String representation
 */
export function transformValueToString(value: TransformValue | undefined): string {
  if (!value) return '';

  switch (value.type) {
    case 'null':
      return '';
    case 'string':
      return value.value;
    case 'integer':
    case 'number':
    case 'currency':
    case 'percent':
      return String(value.value);
    case 'boolean':
      return String(value.value);
    case 'date':
      return value.raw;
    case 'timestamp':
      return value.raw;
    case 'time':
    case 'duration':
      return value.value;
    case 'reference':
      return `@${value.path}`;
    case 'binary': {
      const b64 = btoa(String.fromCharCode(...value.data));
      return value.algorithm ? `^${value.algorithm}:${b64}` : `^${b64}`;
    }
    case 'array':
      return JSON.stringify(value.items);
    case 'object':
      return JSON.stringify(value.value);
    case 'verb': {
      const prefix = value.isCustom ? '%&' : '%';
      const argsStr = value.args.map((a) => transformValueToString(a as TransformValue)).join(' ');
      return `${prefix}${value.verb}${argsStr ? ' ' + argsStr : ''}`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Escape Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape XML special characters.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escape CSV value if it contains special characters.
 */
export function csvEscape(value: string, quote: string, delimiter: string): string {
  if (value.includes(quote) || value.includes(delimiter) || value.includes('\n')) {
    return quote + value.replace(new RegExp(quote, 'g'), quote + quote) + quote;
  }
  return value;
}

/**
 * Escape special characters in flat format string values.
 */
export function escapeFlat(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a numeric string has more precision than JavaScript can represent.
 * JavaScript's Number has ~15-17 significant digits of precision.
 */
export function isHighPrecision(numStr: string): boolean {
  // Remove sign and leading zeros
  const cleaned = numStr.replace(/^-/, '').replace(/^0+/, '');
  // Count significant digits (exclude decimal point)
  const significantDigits = cleaned.replace('.', '').length;
  return significantDigits > 15;
}

/**
 * Check if a TransformValue is numeric (for padding decisions in fixed-width).
 */
export function isNumericValue(value: TransformValue | undefined): boolean {
  if (!value) return false;
  return value.type === 'integer' || value.type === 'number' || value.type === 'currency';
}

/**
 * Check if a string value needs quoting in flat format.
 */
export function needsQuoting(value: string): boolean {
  return (
    value.includes('=') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    value.startsWith('"') ||
    value.startsWith("'")
  );
}

/**
 * Format a value for YAML output.
 */
export function yamlValue(value: string): string {
  if (
    value === '' ||
    value === 'true' ||
    value === 'false' ||
    value === 'null' ||
    value === 'yes' ||
    value === 'no' ||
    value.includes(':') ||
    value.includes('#') ||
    value.includes('\n') ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    value.startsWith('"') ||
    value.startsWith("'")
  ) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return value;
}
