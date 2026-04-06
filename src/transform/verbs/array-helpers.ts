/**
 * ODIN Transform Array Helpers
 *
 * Shared utility functions for array verb implementations.
 */

import type { TransformValue } from '../../types/transform.js';
import { jsToTransformValue } from './helpers.js';

/**
 * Dangerous keys that could lead to prototype pollution attacks.
 * These are blocked during JSON parsing to prevent object prototype manipulation.
 */
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively sanitize an object to prevent prototype pollution attacks.
 * Removes any keys that could manipulate the prototype chain.
 */
function sanitizeObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (!PROTOTYPE_POLLUTION_KEYS.has(key)) {
      clean[key] = sanitizeObject(value);
    }
  }
  return clean;
}

/**
 * Helper to extract array from a TransformValue.
 * Expects an array type (from evaluateExpression) or a JSON array string.
 */
export function extractArray(val: TransformValue): unknown[] | undefined {
  // Direct array type (from evaluateExpression resolution)
  if (val.type === 'array') {
    return val.items as unknown[];
  }

  // JSON array string (for chained verbs where result is stringified)
  if (val.type === 'string') {
    const strVal = val.value;
    if (strVal.startsWith('[') && strVal.endsWith(']')) {
      try {
        const parsed = JSON.parse(strVal);
        if (Array.isArray(parsed)) {
          // Security: Sanitize to prevent prototype pollution attacks
          return sanitizeObject(parsed) as unknown[];
        }
      } catch {
        // Not valid JSON
      }
    }
  }

  return undefined;
}

/**
 * Process array items for output, ensuring consistent CDM format.
 * - CDM objects like { type: 'object', value: {...} } are unwrapped
 * - Plain JS objects have their properties converted to CDM values
 * - Primitive CDM values are kept as-is
 */
export function unwrapCdmObjects(items: unknown[]): unknown[] {
  return items.map((item) => {
    if (item === null || typeof item !== 'object') {
      return item;
    }

    const itemObj = item as Record<string, unknown>;

    // Check if this is a CDM value with a 'type' property
    if ('type' in itemObj) {
      const tv = item as TransformValue;
      if (tv.type === 'object' && tv.value) {
        // Unwrap CDM object: ensure properties are CDM values
        const unwrapped = tv.value as Record<string, unknown>;
        const result: Record<string, unknown> = {};

        for (const [key, val] of Object.entries(unwrapped)) {
          if (val !== null && typeof val === 'object' && 'type' in val) {
            result[key] = val;
          } else {
            result[key] = jsToTransformValue(val);
          }
        }

        return result;
      }
      // Other CDM types (string, integer, etc.) - return as-is
      return item;
    }

    // Plain JS object - convert properties to CDM values
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(itemObj)) {
      if (val !== null && typeof val === 'object' && 'type' in val) {
        result[key] = val;
      } else {
        result[key] = jsToTransformValue(val);
      }
    }
    return result;
  });
}

/**
 * Extract comparable value from an item (handles both CDM TransformValue and raw JS values).
 */
export function getComparableValue(item: unknown): unknown {
  if (item !== null && typeof item === 'object' && 'type' in item) {
    const tv = item as TransformValue;
    switch (tv.type) {
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        return tv.value;
      case 'string':
        return tv.value;
      case 'boolean':
        return tv.value;
      case 'null':
        return null;
      case 'date':
      case 'timestamp':
        return tv.value instanceof Date ? tv.value.getTime() : tv.raw;
      case 'time':
        return tv.value;
      default:
        return item;
    }
  }
  return item;
}

/**
 * Get a nested field value from an item using dot notation.
 */
export function getNestedValue(item: unknown, fieldPath: string): unknown {
  if (item === null || item === undefined) {
    return undefined;
  }

  const parts = fieldPath.split('.');
  let current: unknown = item;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle CDM object wrapper
    if (typeof current === 'object' && 'type' in current) {
      const tv = current as TransformValue;
      if (tv.type === 'object' && tv.value) {
        current = (tv.value as Record<string, unknown>)[part];
        continue;
      }
    }

    // Handle plain object
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Compare two values for equality.
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
  const aVal = getComparableValue(a);
  const bVal = getComparableValue(b);

  if (aVal === bVal) return true;

  // Handle date comparison
  if (aVal instanceof Date && bVal instanceof Date) {
    return aVal.getTime() === bVal.getTime();
  }

  // Handle number comparison with tolerance
  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return Math.abs(aVal - bVal) < Number.EPSILON;
  }

  return false;
}

/**
 * Compare two values for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareValues(a: unknown, b: unknown): number {
  const aVal = getComparableValue(a);
  const bVal = getComparableValue(b);

  // Handle null/undefined (using == to check both null and undefined)
  if (aVal === null || aVal === undefined) {
    if (bVal === null || bVal === undefined) return 0;
    return 1;
  }
  if (bVal === null || bVal === undefined) return -1;

  // Handle numbers
  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return aVal - bVal;
  }

  // Handle strings
  if (typeof aVal === 'string' && typeof bVal === 'string') {
    return aVal.localeCompare(bVal);
  }

  // Handle dates
  if (aVal instanceof Date && bVal instanceof Date) {
    return aVal.getTime() - bVal.getTime();
  }

  // Handle booleans
  if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
    return aVal === bVal ? 0 : aVal ? 1 : -1;
  }

  // Fallback to string comparison
  return String(aVal).localeCompare(String(bVal));
}
