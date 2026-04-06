/**
 * ODIN Transform Aggregation Verbs
 *
 * Array aggregation verbs: sum, count, min, max, avg, first, last, accumulate.
 */

import type { VerbFunction, TransformValue } from '../../types/transform.js';
import { resolvePath } from '../utils.js';
import {
  toString,
  toNumber,
  int,
  num,
  numericResult,
  nil,
  jsToTransformValue,
  extractNumericValue,
} from './helpers.js';

/**
 * Helper to extract an array from a TransformValue.
 * Handles array type, stringified JSON arrays and path resolution.
 */
function extractArray(val: TransformValue, source: unknown): unknown[] | undefined {
  // Handle array type directly (from resolved path expressions)
  if (val.type === 'array') {
    return val.items as unknown[];
  }

  if (val.type === 'string') {
    const str = val.value;

    // Check if it's a JSON array string (from resolved array.field path)
    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // Not valid JSON, treat as path
      }
    }

    // Try to resolve as path
    const resolved = resolvePath(str, source);
    if (Array.isArray(resolved)) {
      return resolved;
    }
  }
  return undefined;
}

/**
 * %accumulate name value - Add value to accumulator
 */
export const accumulate: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const name = toString(args[0]!);
  const value = args[1]!;

  const current = context.accumulators.get(name);
  if (!current) return nil();

  // Add the value to the current accumulator
  const currentNum = toNumber(current);
  const addNum = toNumber(value);
  const newValue = numericResult(currentNum + addNum);

  context.accumulators.set(name, newValue);
  return newValue;
};

/**
 * %set name value - Set accumulator to specific value (replaces current value)
 */
export const set: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const name = toString(args[0]!);
  const value = args[1]!;

  // Check if accumulator exists
  if (!context.accumulators.has(name)) return nil();

  // Set the value directly (supports both numbers and strings)
  context.accumulators.set(name, value);
  return value;
};

/**
 * %sum @array.field - Sum array field values
 */
export const sum: VerbFunction = (args, context) => {
  if (args.length === 0) return num(0);

  const val = args[0]!;
  const arr = extractArray(val, context.source);
  if (arr) {
    const total = arr.reduce((acc: number, item) => {
      return acc + extractNumericValue(item);
    }, 0);
    // Return integer if result is a whole number
    return Number.isInteger(total) ? int(total) : num(total);
  }
  return num(0);
};

/**
 * %count @array - Count array items
 */
export const count: VerbFunction = (args, context) => {
  if (args.length === 0) return int(0);

  const val = args[0]!;
  const arr = extractArray(val, context.source);
  if (arr) {
    return int(arr.length);
  }
  return int(0);
};

/**
 * %min @array.field - Minimum value
 */
export const min: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const val = args[0]!;
  const arr = extractArray(val, context.source);
  if (arr && arr.length > 0) {
    // Use reduce instead of spread to avoid stack overflow on large arrays
    const minVal = arr.reduce((acc: number, item) => {
      const n = extractNumericValue(item);
      return Math.min(acc, n);
    }, Infinity);
    if (minVal === Infinity) return nil();
    return Number.isInteger(minVal) ? int(minVal) : num(minVal);
  }
  return nil();
};

/**
 * %max @array.field - Maximum value
 */
export const max: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const val = args[0]!;
  const arr = extractArray(val, context.source);
  if (arr && arr.length > 0) {
    // Use reduce instead of spread to avoid stack overflow on large arrays
    const maxVal = arr.reduce((acc: number, item) => {
      const n = extractNumericValue(item);
      return Math.max(acc, n);
    }, -Infinity);
    if (maxVal === -Infinity) return nil();
    return Number.isInteger(maxVal) ? int(maxVal) : num(maxVal);
  }
  return nil();
};

/**
 * %avg @array.field - Average value
 */
export const avg: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const val = args[0]!;
  const arr = extractArray(val, context.source);
  if (arr && arr.length > 0) {
    const nums = arr.map((item) => extractNumericValue(item));
    const total = nums.reduce((a, b) => a + b, 0);
    return numericResult(total / nums.length);
  }
  return nil();
};

/**
 * %first @array - First array item
 */
export const first: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const val = args[0]!;
  const arr = extractArray(val, context.source);
  if (arr && arr.length > 0) {
    return jsToTransformValue(arr[0]);
  }
  return nil();
};

/**
 * %last @array - Last array item
 */
export const last: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const val = args[0]!;
  const arr = extractArray(val, context.source);
  if (arr && arr.length > 0) {
    return jsToTransformValue(arr[arr.length - 1]);
  }
  return nil();
};
