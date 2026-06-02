/**
 * ODIN Transform Object Verbs
 *
 * Object manipulation: keys, values, entries, has, get, merge.
 */

import type { VerbFunction, TransformValue } from '../../types/transform.js';
import { toString, arr, obj, bool, nil, jsToTransformValue } from './helpers.js';
import { extractArray } from './array-helpers.js';

/**
 * Check if a property key is safe from prototype pollution.
 * Blocks access to __proto__, constructor, and prototype.
 */
function isSafePropertyKey(key: string): boolean {
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  return !dangerousKeys.includes(key.toLowerCase());
}

/**
 * Filter out dangerous keys from an object's keys.
 */
function getSafeKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).filter(isSafePropertyKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Object Introspection Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %keys @object - Get object keys as an array
 * Returns an array of the object's own enumerable property names.
 * Excludes prototype-pollution-related keys (__proto__, constructor, prototype).
 */
export const keys: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const val = args[0]!;

  if (val.type !== 'object') {
    return nil();
  }

  // Filter out dangerous keys to prevent prototype pollution
  const keyList = getSafeKeys(val.value as Record<string, unknown>);
  return arr(keyList);
};

/**
 * %values @object - Get object values as an array
 * Returns an array of the object's own enumerable property values.
 * Excludes prototype-pollution-related keys (__proto__, constructor, prototype).
 */
export const values: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const val = args[0]!;

  if (val.type !== 'object') {
    return nil();
  }

  // Only include values for safe keys
  const obj = val.value as Record<string, unknown>;
  const valueList = getSafeKeys(obj).map((k) => obj[k]);
  return arr(valueList);
};

/**
 * %entries @object - Get object as [key, value] pairs array
 * Returns an array of [key, value] arrays.
 * Excludes prototype-pollution-related keys (__proto__, constructor, prototype).
 */
export const entries: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const val = args[0]!;

  if (val.type !== 'object') {
    return nil();
  }

  // Only include entries for safe keys
  const obj = val.value as Record<string, unknown>;
  const entryList = getSafeKeys(obj).map((k) => [k, obj[k]]);
  return arr(entryList);
};

// ─────────────────────────────────────────────────────────────────────────────
// Object Access Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %has @object "key" - Check if object has a key
 * Supports dot notation for nested paths: "a.b.c"
 * Returns false for prototype-pollution-related keys.
 */
export const has: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const val = args[0]!;
  const keyPath = toString(args[1]!);

  if (val.type !== 'object') {
    return bool(false);
  }

  // Support dot notation for nested paths
  const parts = keyPath.split('.');
  let current: unknown = val.value;

  for (const part of parts) {
    // Block access to dangerous prototype properties
    if (!isSafePropertyKey(part)) {
      return bool(false);
    }
    if (current === null || current === undefined) {
      return bool(false);
    }
    if (typeof current !== 'object') {
      return bool(false);
    }
    if (!Object.hasOwn(current as Record<string, unknown>, part)) {
      return bool(false);
    }
    current = (current as Record<string, unknown>)[part];
  }

  return bool(true);
};

/**
 * %get @object "path" [default] - Safe path access with optional default
 * Supports dot notation for nested paths: "a.b.c"
 * Returns default value (or null) if path doesn't exist or references unsafe properties.
 */
export const get: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const val = args[0]!;
  const keyPath = toString(args[1]!);
  const defaultVal = args.length >= 3 ? args[2]! : nil();

  if (val.type !== 'object') {
    return defaultVal;
  }

  // Support dot notation for nested paths
  const parts = keyPath.split('.');
  let current: unknown = val.value;

  for (const part of parts) {
    // Block access to dangerous prototype properties
    if (!isSafePropertyKey(part)) {
      return defaultVal;
    }
    if (current === null || current === undefined) {
      return defaultVal;
    }
    if (typeof current !== 'object') {
      return defaultVal;
    }
    if (!Object.hasOwn(current as Record<string, unknown>, part)) {
      return defaultVal;
    }
    current = (current as Record<string, unknown>)[part];
  }

  // Convert the JS value back to TransformValue
  return jsToTransformValue(current);
};

// ─────────────────────────────────────────────────────────────────────────────
// Object Manipulation Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %merge @obj1 @obj2 - Shallow merge two objects
 * Properties from obj2 override properties from obj1.
 * Returns a new object without modifying the originals.
 */
export const merge: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const obj1 = args[0]!;
  const obj2 = args[1]!;

  // Both must be objects
  if (obj1.type !== 'object' || obj2.type !== 'object') {
    // If only one is an object, return that one
    if (obj1.type === 'object') return obj1;
    if (obj2.type === 'object') return obj2;
    return nil();
  }

  // Shallow merge
  const merged = { ...obj1.value, ...obj2.value };
  return { type: 'object', value: merged };
};

/**
 * %pick @object "k1", "k2" - New object with only the named keys (argument order).
 */
export const pick: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const val = args[0]!;
  if (val.type !== 'object') return nil();
  const src = val.value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (let i = 1; i < args.length; i++) {
    const key = toString(args[i]!);
    if (isSafePropertyKey(key) && Object.hasOwn(src, key)) {
      result[key] = src[key];
    }
  }
  return obj(result);
};

/**
 * %omit @object "k1", "k2" - New object without the named keys (preserves source order).
 */
export const omit: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const val = args[0]!;
  if (val.type !== 'object') return nil();
  const src = val.value as Record<string, unknown>;
  const drop = new Set<string>();
  for (let i = 1; i < args.length; i++) drop.add(toString(args[i]!));
  const result: Record<string, unknown> = {};
  for (const k of getSafeKeys(src)) {
    if (!drop.has(k)) result[k] = src[k];
  }
  return obj(result);
};

/**
 * %fromEntries @pairs - Build an object from an array of [key, value] pairs (pair order).
 */
export const fromEntries: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const pairs = extractArray(args[0]!);
  if (!pairs) return nil();
  const result: Record<string, unknown> = {};
  for (const entry of pairs) {
    const pair = Array.isArray(entry)
      ? entry
      : entry && typeof entry === 'object' && (entry as TransformValue).type === 'array'
        ? extractArray(entry as TransformValue)
        : null;
    if (!pair || pair.length < 2) continue;
    const key = toString(jsToTransformValue(pair[0]));
    if (isSafePropertyKey(key)) result[key] = pair[1];
  }
  return obj(result);
};

/**
 * %invert @object - Swap keys and values; values become string keys (last wins on duplicates).
 */
export const invert: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const val = args[0]!;
  if (val.type !== 'object') return nil();
  const src = val.value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const k of getSafeKeys(src)) {
    const newKey = toString(jsToTransformValue(src[k]));
    if (isSafePropertyKey(newKey)) result[newKey] = k;
  }
  return obj(result);
};

/**
 * %defaults @object @defaults - Fill keys missing from object using defaults (object wins).
 */
export const defaults: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const a = args[0]!;
  const d = args[1]!;
  if (a.type !== 'object') return d.type === 'object' ? d : nil();
  if (d.type !== 'object') return a;
  const src = a.value as Record<string, unknown>;
  const def = d.value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const k of getSafeKeys(src)) result[k] = src[k];
  for (const k of getSafeKeys(def)) {
    if (!Object.hasOwn(result, k)) result[k] = def[k];
  }
  return obj(result);
};

/**
 * %renameKeys @object @mapping - Rename keys named in the mapping (old -> new), keeping position.
 */
export const renameKeys: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const val = args[0]!;
  const map = args[1]!;
  if (val.type !== 'object') return nil();
  if (map.type !== 'object') return val;
  const src = val.value as Record<string, unknown>;
  const rename = map.value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const k of getSafeKeys(src)) {
    const newKey =
      Object.hasOwn(rename, k) ? toString(jsToTransformValue(rename[k])) : k;
    if (isSafePropertyKey(newKey)) result[newKey] = src[k];
  }
  return obj(result);
};

/**
 * %compactObject @object - Drop entries whose value is null, empty string, empty array, or empty object.
 */
export const compactObject: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const val = args[0]!;
  if (val.type !== 'object') return nil();
  const src = val.value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const k of getSafeKeys(src)) {
    const v = src[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    result[k] = v;
  }
  return obj(result);
};
