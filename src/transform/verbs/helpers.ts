/**
 * ODIN Transform Verb Helpers
 *
 * Shared utilities and type creators for verb implementations.
 */

import type { TransformValue } from '../../types/transform.js';
import { transformValueToString } from '../engine-value-utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Threshold for distinguishing Unix timestamps in seconds vs milliseconds.
 * 100 billion ms ≈ March 1973, 100 billion s ≈ year 5138.
 * Values below this are assumed to be seconds, above are milliseconds.
 */
export const UNIX_TIMESTAMP_SECONDS_THRESHOLD = 100_000_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// Type Conversion Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert TransformValue to string.
 * Re-exported from engine-value-utils for API compatibility.
 */
export const toString = transformValueToString;

/**
 * Convert TransformValue to number
 */
export function toNumber(val: TransformValue): number {
  switch (val.type) {
    case 'null':
      return 0;
    case 'string': {
      const n = parseFloat(val.value);
      return isNaN(n) ? 0 : n;
    }
    case 'integer':
    case 'number':
    case 'currency':
    case 'percent':
      return val.value;
    case 'boolean':
      return val.value ? 1 : 0;
    case 'date':
    case 'timestamp':
      return val.value.getTime();
    case 'time':
    case 'duration':
    case 'reference':
    case 'binary':
    case 'verb':
      return 0;
    case 'array':
      return val.items.length;
    case 'object':
      return 0;
  }
}

/**
 * Convert TransformValue to boolean
 */
export function toBoolean(val: TransformValue): boolean {
  switch (val.type) {
    case 'null':
      return false;
    case 'string': {
      const s = val.value.toLowerCase();
      return s === 'true' || s === 'yes' || s === 'y' || s === '1';
    }
    case 'integer':
    case 'number':
    case 'currency':
    case 'percent':
      return val.value !== 0;
    case 'boolean':
      return val.value;
    case 'date':
    case 'timestamp':
      return true;
    case 'time':
    case 'duration':
      return val.value !== '';
    case 'reference':
      return val.path !== '';
    case 'binary':
      return val.data.length > 0;
    case 'verb':
      return true; // Verb expressions are truthy
    case 'array':
      return val.items.length > 0;
    case 'object':
      return Object.keys(val.value).length > 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Value Checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if value is null type
 */
export function isNull(val: TransformValue): boolean {
  return val.type === 'null';
}

/**
 * Check if value is empty string
 */
export function isEmpty(val: TransformValue): boolean {
  return val.type === 'string' && val.value === '';
}

// ─────────────────────────────────────────────────────────────────────────────
// TransformValue Creators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create string TransformValue
 */
export function str(value: string): TransformValue {
  return { type: 'string', value };
}

/**
 * Create integer TransformValue
 */
export function int(value: number): TransformValue {
  return { type: 'integer', value: Math.floor(value) };
}

/**
 * Create number TransformValue
 */
export function num(value: number): TransformValue {
  return { type: 'number', value };
}

/**
 * Create numeric TransformValue - integer if whole number, number if decimal
 * This is the preferred way to return numeric results from verbs.
 * Uses epsilon tolerance for floating point comparison to handle
 * cases like 114.99999999999999 which should be treated as 115.
 */
export function numericResult(value: number): TransformValue {
  // Handle special cases: Infinity, NaN
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return { type: 'number', value };
  }

  // For very small numbers (< 1e-9), keep as number type
  // These are clearly not intended to be integers
  if (Math.abs(value) < 1e-9 && value !== 0) {
    return { type: 'number', value };
  }

  // For extremely large numbers (> 1e100), keep as number
  // These are clearly scientific/floating point values, not integers
  if (Math.abs(value) > 1e100) {
    return { type: 'number', value };
  }

  // Check if value is very close to an integer (within floating point tolerance)
  const rounded = Math.round(value);
  const epsilon = 1e-10;
  if (Math.abs(value - rounded) < epsilon) {
    return { type: 'integer', value: rounded };
  }
  return { type: 'number', value };
}

/**
 * Create boolean TransformValue
 */
export function bool(value: boolean): TransformValue {
  return { type: 'boolean', value };
}

/**
 * Create null TransformValue
 */
export function nil(): TransformValue {
  return { type: 'null' };
}

/**
 * Create array TransformValue
 *
 * Note: In transform context, arrays may contain raw JS values (from JSON parsing,
 * source data, etc.) rather than strictly typed OdinTypedValue maps. The type
 * cast here is intentional to bridge transform runtime with the strict CDM types.
 */
export function arr(items: unknown[]): TransformValue {
  return {
    type: 'array',
    items: items as ReadonlyArray<
      ReadonlyMap<string, import('../../types/values.js').OdinTypedValue>
    >,
  };
}

/**
 * Create object TransformValue
 */
export function obj(value: Record<string, unknown>): TransformValue {
  return { type: 'object', value };
}

// ─────────────────────────────────────────────────────────────────────────────
// JS <-> TransformValue Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valid TransformValue type names
 */
const TRANSFORM_VALUE_TYPES = new Set([
  'null',
  'boolean',
  'string',
  'integer',
  'number',
  'currency',
  'date',
  'timestamp',
  'time',
  'duration',
  'reference',
  'binary',
  'array',
  'object',
]);

/**
 * Check if a value is already a TransformValue/CDM object
 */
export function isTransformValue(value: unknown): value is TransformValue {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.type === 'string' && TRANSFORM_VALUE_TYPES.has(obj.type);
}

/**
 * Convert JS value to TransformValue
 */
export function jsToTransformValue(value: unknown): TransformValue {
  if (value === null || value === undefined) {
    return { type: 'null' };
  }
  // If already a TransformValue/CDM object, return as-is
  if (isTransformValue(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return { type: 'string', value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { type: 'integer', value };
    }
    return { type: 'number', value };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', value };
  }
  if (value instanceof Date) {
    return { type: 'timestamp', value, raw: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value as ReadonlyArray<
        ReadonlyMap<string, import('../../types/values.js').OdinTypedValue>
      >,
    };
  }
  if (typeof value === 'object') {
    return { type: 'object', value: value as Record<string, unknown> };
  }
  return { type: 'string', value: String(value) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a numeric value from an item.
 * Handles both raw JS values and TransformValue objects.
 * Used by aggregation and financial verbs.
 */
export function extractNumericValue(item: unknown): number {
  // Handle TransformValue objects
  if (item !== null && typeof item === 'object' && 'type' in item) {
    const tv = item as TransformValue;
    if (tv.type === 'integer' || tv.type === 'number' || tv.type === 'currency') {
      return tv.value;
    }
    if (tv.type === 'string') {
      const n = parseFloat(tv.value);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }

  // Handle raw JS values
  if (typeof item === 'number') {
    return item;
  }
  const n = parseFloat(String(item));
  return isNaN(n) ? 0 : n;
}

/**
 * Extract string value from an item that might be a CDM TransformValue or raw JS value.
 * Used by string verbs for converting various types to strings.
 */
export function extractStringValue(item: unknown): string {
  // Handle TransformValue objects (CDM)
  if (item !== null && typeof item === 'object' && 'type' in item) {
    const tv = item as TransformValue;
    switch (tv.type) {
      case 'string':
        return tv.value;
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        return String(tv.value);
      case 'boolean':
        return String(tv.value);
      case 'null':
        return '';
      case 'date':
      case 'timestamp':
        return tv.value.toISOString();
      case 'time':
      case 'duration':
        return tv.value;
      default:
        return JSON.stringify(item);
    }
  }

  // Handle raw JS values
  if (item === null || item === undefined) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'number' || typeof item === 'boolean') return String(item);
  if (item instanceof Date) return item.toISOString();
  return String(item);
}
