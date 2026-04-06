/**
 * ODIN Transform Engine - Value Conversion Utilities
 *
 * Standalone functions for converting between TransformValue (CDM) and JavaScript values.
 * These utilities are used by the transform engine and can be used independently.
 */

import type { TransformValue } from '../types/transform.js';
import { formatDateOnly as formatDateOnlyUtil } from '../utils/format-utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Type Checking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valid TransformValue type names.
 */
const VALID_TRANSFORM_TYPES = new Set([
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
  'verb',
]);

/**
 * Check if a value is already a TransformValue/CDM object.
 */
export function isTransformValue(value: unknown): value is TransformValue {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.type === 'string' && VALID_TRANSFORM_TYPES.has(obj.type);
}

// ─────────────────────────────────────────────────────────────────────────────
// JS to TransformValue Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a JavaScript value to a TransformValue.
 *
 * @param value - Any JavaScript value
 * @returns Corresponding TransformValue
 */
export function jsToTransformValue(value: unknown): TransformValue {
  if (value === null || value === undefined) {
    return { type: 'null' };
  }

  // Check if already a TransformValue - return as-is
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
    const raw = value.toISOString();
    return { type: 'timestamp', value, raw };
  }

  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.map((item) => jsToTransformValue(item)),
    } as unknown as TransformValue;
  }

  if (typeof value === 'object') {
    return { type: 'object', value: value as Record<string, unknown> };
  }

  return { type: 'string', value: String(value) };
}

// ─────────────────────────────────────────────────────────────────────────────
// TransformValue to JS Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a TransformValue to a JavaScript value.
 *
 * @param value - TransformValue to convert
 * @returns JavaScript value
 */
export function transformValueToJs(value: TransformValue): unknown {
  switch (value.type) {
    case 'null':
      return null;
    case 'string':
      return value.value;
    case 'integer':
    case 'number':
    case 'currency':
    case 'percent':
      return value.value;
    case 'boolean':
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
    case 'array':
      return value.items;
    case 'object':
      return value.value;
    case 'verb': {
      const prefix = value.isCustom ? '%&' : '%';
      const argsStr = value.args.map((a) => transformValueToJs(a as TransformValue)).join(' ');
      return `${prefix}${value.verb}${argsStr ? ' ' + argsStr : ''}`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TransformValue to String Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a TransformValue to a string representation.
 *
 * @param value - TransformValue to convert
 * @returns String representation
 */
export function transformValueToString(value: TransformValue): string {
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
    case 'timestamp':
      return value.value.toISOString();
    case 'time':
    case 'duration':
      return value.value;
    case 'reference':
      return `@${value.path}`;
    case 'binary': {
      const b64 = btoa(String.fromCharCode(...value.data));
      return value.algorithm ? `^${value.algorithm}:${b64}` : `^${b64}`;
    }
    case 'verb': {
      const prefix = value.isCustom ? '%&' : '%';
      const argsStr = value.args.map((a) => transformValueToString(a as TransformValue)).join(' ');
      return `${prefix}${value.verb}${argsStr ? ' ' + argsStr : ''}`;
    }
    case 'array':
      return JSON.stringify(value.items);
    case 'object':
      return JSON.stringify(value.value);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD string.
 * Re-exported from format-utils for API compatibility.
 */
export function formatDateOnly(date: Date): string {
  return formatDateOnlyUtil(date);
}

// ─────────────────────────────────────────────────────────────────────────────
// Truthiness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a TransformValue is truthy.
 *
 * Truthy values:
 * - Non-empty strings
 * - Non-zero numbers
 * - true boolean
 * - Non-empty arrays
 * - Non-empty objects
 *
 * Falsy values:
 * - null
 * - empty strings
 * - zero
 * - false boolean
 * - empty arrays
 * - empty objects
 */
export function isTruthy(value: TransformValue): boolean {
  switch (value.type) {
    case 'null':
      return false;
    case 'string':
      return value.value.length > 0;
    case 'integer':
    case 'number':
    case 'currency':
    case 'percent':
      return value.value !== 0;
    case 'boolean':
      return value.value;
    case 'date':
    case 'timestamp':
      return true;
    case 'time':
    case 'duration':
      return value.value !== '';
    case 'reference':
      return true;
    case 'binary':
      return value.data.length > 0;
    case 'array':
      return Array.isArray(value.items) && value.items.length > 0;
    case 'object':
      return value.value !== null && Object.keys(value.value).length > 0;
    case 'verb':
      return true;
  }
}
