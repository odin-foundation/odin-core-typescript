/**
 * ODIN Transform Array Verbs
 *
 * Array manipulation verbs: filter, flatten, distinct, sort, map,
 * indexOf, at, slice, reverse, and many more.
 *
 * @see array-helpers.ts for shared utility functions
 */

import type { VerbFunction, TransformValue, TransformContext } from '../../types/transform.js';
import { toString, toNumber, int, nil, arr, bool, obj, jsToTransformValue } from './helpers.js';
import { extractArray, unwrapCdmObjects, getComparableValue } from './array-helpers.js';
import { SECURITY_LIMITS } from '../../utils/security-limits.js';

/**
 * %filter @array "field" "op" value - Filter array items by field condition
 *
 * Supported operators: =, !=, <, <=, >, >=, contains, startsWith, endsWith
 *
 * @example
 * active = "%filter @items \"status\" \"=\" \"active\""
 * highValue = "%filter @orders \"amount\" \">\" ##1000"
 */
export const filter: VerbFunction = (args) => {
  if (args.length < 4) return arr([]);

  const arrayArg = args[0]!;
  const fieldName = toString(args[1]!);
  const operator = toString(args[2]!);
  const compareValue = args[3]!;

  const resolved = extractArray(arrayArg);
  if (!resolved) return arr([]);

  const filtered = resolved.filter((item) => {
    if (typeof item !== 'object' || item === null) return false;

    // Handle CDM objects: { type: 'object', value: { field1: {...}, field2: {...} } }
    let fieldValue: unknown;
    const itemObj = item as Record<string, unknown>;

    if (itemObj.type === 'object' && typeof itemObj.value === 'object' && itemObj.value !== null) {
      // CDM object format - extract field from .value
      fieldValue = (itemObj.value as Record<string, unknown>)[fieldName];
    } else {
      // Plain object format
      fieldValue = itemObj[fieldName];
    }

    const itemVal = jsToTransformValue(fieldValue);
    const cmpVal = compareValue;

    switch (operator) {
      case '=':
      case '==':
        return toString(itemVal) === toString(cmpVal);
      case '!=':
      case '<>':
        return toString(itemVal) !== toString(cmpVal);
      case '<':
        return toNumber(itemVal) < toNumber(cmpVal);
      case '<=':
        return toNumber(itemVal) <= toNumber(cmpVal);
      case '>':
        return toNumber(itemVal) > toNumber(cmpVal);
      case '>=':
        return toNumber(itemVal) >= toNumber(cmpVal);
      case 'contains':
        return toString(itemVal).includes(toString(cmpVal));
      case 'startsWith':
        return toString(itemVal).startsWith(toString(cmpVal));
      case 'endsWith':
        return toString(itemVal).endsWith(toString(cmpVal));
      default:
        return false;
    }
  });

  // Unwrap CDM objects and return as array TransformValue
  const unwrapped = unwrapCdmObjects(filtered);
  return arr(unwrapped);
};

/**
 * %flatten @array - Flatten nested arrays one level deep
 *
 * @example
 * flat = "%flatten @nestedItems"  ; [[1,2],[3,4]] -> [1,2,3,4]
 */
export const flatten: VerbFunction = (args) => {
  if (args.length === 0) return arr([]);

  const resolved = extractArray(args[0]!);
  if (!resolved) return arr([]);

  // Flatten one level, handling both raw arrays and CDM array objects
  const flattened: unknown[] = [];
  for (const item of resolved) {
    // Check if item is a CDM array object (has type: 'array' and items property)
    if (item !== null && typeof item === 'object' && 'type' in item) {
      const tv = item as TransformValue;
      if (tv.type === 'array' && tv.items) {
        // Extract items from CDM array
        flattened.push(...(tv.items as unknown[]));
        continue;
      }
    }
    // Check if item is a raw JavaScript array
    if (Array.isArray(item)) {
      flattened.push(...item);
      continue;
    }
    // Otherwise, add the item as-is
    flattened.push(item);
  }

  return arr(flattened);
};

/**
 * %distinct @array - Remove duplicate values from array
 * %distinct @array "field" - Remove duplicates by field value
 *
 * @example
 * unique = "%distinct @tags"
 * uniqueByCode = "%distinct @items \"code\""
 */
export const distinct: VerbFunction = (args) => {
  if (args.length === 0) return arr([]);

  const fieldName = args.length > 1 ? toString(args[1]!) : null;

  const resolved = extractArray(args[0]!);
  if (!resolved) return arr([]);

  if (fieldName) {
    // Deduplicate by field value
    const seen = new Set<string>();
    const unique = resolved.filter((item) => {
      if (typeof item !== 'object' || item === null) return false;
      const key = String((item as Record<string, unknown>)[fieldName]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return arr(unique);
  } else {
    // Deduplicate primitives - use comparable value for CDM objects
    const seen = new Set<string>();
    const maxKeyLen = SECURITY_LIMITS.MAX_DISTINCT_KEY_LENGTH;
    const unique = resolved.filter((item) => {
      const comparable = getComparableValue(item);
      let key = JSON.stringify(comparable);
      // Truncate very long keys to prevent memory issues
      if (key.length > maxKeyLen) {
        key = key.slice(0, maxKeyLen);
      }
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return arr(unique);
  }
};

/**
 * %sort @array - Sort array (ascending)
 * %sort @array "field" - Sort by field (ascending)
 * %sort @array "field" "desc" - Sort by field descending
 *
 * @example
 * sorted = "%sort @names"
 * byDate = "%sort @items \"date\""
 * byAmountDesc = "%sort @orders \"amount\" \"desc\""
 */
export const sort: VerbFunction = (args) => {
  if (args.length === 0) return arr([]);

  const fieldName = args.length > 1 ? toString(args[1]!) : null;
  const direction = args.length > 2 ? toString(args[2]!).toLowerCase() : 'asc';

  const resolved = extractArray(args[0]!);
  if (!resolved) return arr([]);

  const multiplier = direction === 'desc' ? -1 : 1;

  const sorted = [...resolved].sort((a, b) => {
    let aVal: unknown;
    let bVal: unknown;

    if (fieldName && typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;

      // Handle CDM objects: { type: 'object', value: { field1: {...}, field2: {...} } }
      if (aObj.type === 'object' && typeof aObj.value === 'object' && aObj.value !== null) {
        aVal = (aObj.value as Record<string, unknown>)[fieldName];
      } else {
        aVal = aObj[fieldName];
      }

      if (bObj.type === 'object' && typeof bObj.value === 'object' && bObj.value !== null) {
        bVal = (bObj.value as Record<string, unknown>)[fieldName];
      } else {
        bVal = bObj[fieldName];
      }

      // Extract comparable values from CDM field values
      aVal = getComparableValue(aVal);
      bVal = getComparableValue(bVal);
    } else {
      // Extract comparable values from CDM TransformValue objects
      aVal = getComparableValue(a);
      bVal = getComparableValue(b);
    }

    // Numeric comparison if both are numbers
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * multiplier;
    }

    // String comparison otherwise
    const aStr = String(aVal ?? '');
    const bStr = String(bVal ?? '');
    return aStr.localeCompare(bStr) * multiplier;
  });

  // Unwrap CDM objects and return as array TransformValue
  const unwrapped = unwrapCdmObjects(sorted);
  return arr(unwrapped);
};

/**
 * %map @array "field" - Extract a single field from all array items
 *
 * @example
 * ids = "%map @items \"id\""  ; [{id:1},{id:2}] -> [1,2]
 */
export const map: VerbFunction = (args) => {
  if (args.length < 2) return arr([]);

  const fieldName = toString(args[1]!);

  const resolved = extractArray(args[0]!);
  if (!resolved) return arr([]);

  const mapped = resolved.map((item) => {
    if (typeof item === 'object' && item !== null) {
      const value = getFieldValue(item, fieldName);
      return value !== undefined ? value : null;
    }
    return null;
  });

  return arr(mapped);
};

/**
 * %indexOf @array value - Find index of value in array (-1 if not found)
 *
 * @example
 * pos = "%indexOf @codes \"CA\""
 */
export const indexOf: VerbFunction = (args) => {
  if (args.length < 2) return int(-1);

  const searchValue = toString(args[1]!);

  const resolved = extractArray(args[0]!);
  if (!resolved) return int(-1);

  const index = resolved.findIndex((item) => String(item) === searchValue);
  return int(index);
};

/**
 * %at @array index - Get array element at index (supports negative indices)
 *
 * @example
 * first = "%at @items ##0"
 * last = "%at @items ##-1"
 */
export const at: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  let index = Math.floor(toNumber(args[1]!));

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  // Handle negative index
  if (index < 0) {
    index = resolved.length + index;
  }

  if (index < 0 || index >= resolved.length) return nil();

  return jsToTransformValue(resolved[index]);
};

/**
 * %slice @array start end - Get portion of array (supports negative indices)
 *
 * @example
 * firstThree = "%slice @items ##0 ##3"
 * lastTwo = "%slice @items ##-2"
 */
export const slice: VerbFunction = (args) => {
  if (args.length < 2) return arr([]);

  const start = Math.floor(toNumber(args[1]!));
  const end = args.length > 2 ? Math.floor(toNumber(args[2]!)) : undefined;

  const resolved = extractArray(args[0]!);
  if (!resolved) return arr([]);

  const sliced = resolved.slice(start, end);
  return arr(sliced);
};

/**
 * %reverse @array - Reverse array order
 *
 * @example
 * reversed = "%reverse @items"
 */
export const reverse: VerbFunction = (args) => {
  if (args.length === 0) return arr([]);

  const resolved = extractArray(args[0]!);
  if (!resolved) return arr([]);

  return arr([...resolved].reverse());
};

/**
 * %sortDesc @array - Sort array descending
 *
 * @example
 * sorted_desc = "%sortDesc @values"  ; [1, 3, 2] -> [3, 2, 1]
 */
export const sortDesc: VerbFunction = (args) => {
  if (args.length === 0) return arr([]);

  const resolved = extractArray(args[0]!);
  if (!resolved) return arr([]);

  const sorted = [...resolved].sort((a, b) => {
    // Extract comparable values from CDM TransformValue objects
    const aVal = getComparableValue(a);
    const bVal = getComparableValue(b);

    // Numeric comparison if both are numbers
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return bVal - aVal; // Descending
    }

    // String comparison otherwise
    const aStr = String(aVal ?? '');
    const bStr = String(bVal ?? '');
    return bStr.localeCompare(aStr); // Descending
  });

  return arr(sorted);
};

/**
 * %sortBy @array "field" - Sort array of objects by field (ascending)
 *
 * @example
 * by_premium = "%sortBy @coverages \"premium\""
 * by_date = "%sortBy @claims \"date\""
 */
export const sortBy: VerbFunction = (args) => {
  if (args.length < 2) return arr([]);

  const fieldName = toString(args[1]!);

  const resolved = extractArray(args[0]!);
  if (!resolved) return arr([]);

  const sorted = [...resolved].sort((a, b) => {
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
      return 0;
    }

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    // Handle CDM objects: { type: 'object', value: { field1: {...}, field2: {...} } }
    let aVal: unknown;
    let bVal: unknown;

    if (aObj.type === 'object' && typeof aObj.value === 'object' && aObj.value !== null) {
      aVal = (aObj.value as Record<string, unknown>)[fieldName];
    } else {
      aVal = aObj[fieldName];
    }

    if (bObj.type === 'object' && typeof bObj.value === 'object' && bObj.value !== null) {
      bVal = (bObj.value as Record<string, unknown>)[fieldName];
    } else {
      bVal = bObj[fieldName];
    }

    // Extract comparable values from CDM field values
    aVal = getComparableValue(aVal);
    bVal = getComparableValue(bVal);

    // Numeric comparison if both are numbers
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return aVal - bVal; // Ascending
    }

    // String comparison otherwise
    const aStr = String(aVal ?? '');
    const bStr = String(bVal ?? '');
    return aStr.localeCompare(bStr); // Ascending
  });

  // Unwrap CDM objects and return as array TransformValue
  const unwrapped = unwrapCdmObjects(sorted);
  return arr(unwrapped);
};

// ─────────────────────────────────────────────────────────────────────────────
// Additional Array Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper to get field value from an object (handles CDM and plain objects)
 */
function getFieldValue(item: unknown, fieldName: string): unknown {
  if (typeof item !== 'object' || item === null) return undefined;

  const itemObj = item as Record<string, unknown>;

  // Handle CDM objects: { type: 'object', value: { field1: {...}, field2: {...} } }
  if (itemObj.type === 'object' && typeof itemObj.value === 'object' && itemObj.value !== null) {
    return (itemObj.value as Record<string, unknown>)[fieldName];
  }

  return itemObj[fieldName];
}

/**
 * Helper to check if an item matches a condition
 */
function matchesCondition(
  item: unknown,
  fieldName: string,
  operator: string,
  compareValue: TransformValue
): boolean {
  const fieldValue = getFieldValue(item, fieldName);
  const itemVal = jsToTransformValue(fieldValue);
  const cmpVal = compareValue;

  switch (operator) {
    case '=':
    case '==':
      return toString(itemVal) === toString(cmpVal);
    case '!=':
    case '<>':
      return toString(itemVal) !== toString(cmpVal);
    case '<':
      return toNumber(itemVal) < toNumber(cmpVal);
    case '<=':
      return toNumber(itemVal) <= toNumber(cmpVal);
    case '>':
      return toNumber(itemVal) > toNumber(cmpVal);
    case '>=':
      return toNumber(itemVal) >= toNumber(cmpVal);
    case 'contains':
      return toString(itemVal).includes(toString(cmpVal));
    case 'startsWith':
      return toString(itemVal).startsWith(toString(cmpVal));
    case 'endsWith':
      return toString(itemVal).endsWith(toString(cmpVal));
    default:
      return false;
  }
}

/**
 * %every @array "field" "op" value - Check if all items match condition
 *
 * @example
 * allActive = "%every @items \"status\" \"=\" \"active\""
 */
export const every: VerbFunction = (args) => {
  if (args.length < 4) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  // Empty array returns true (vacuous truth)
  if (resolved.length === 0) return bool(true);

  const fieldName = toString(args[1]!);
  const operator = toString(args[2]!);
  const compareValue = args[3]!;

  const allMatch = resolved.every((item) =>
    matchesCondition(item, fieldName, operator, compareValue)
  );
  return bool(allMatch);
};

/**
 * %some @array "field" "op" value - Check if any item matches condition
 *
 * @example
 * hasActive = "%some @items \"status\" \"=\" \"active\""
 */
export const some: VerbFunction = (args) => {
  if (args.length < 4) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  // Empty array returns false
  if (resolved.length === 0) return bool(false);

  const fieldName = toString(args[1]!);
  const operator = toString(args[2]!);
  const compareValue = args[3]!;

  const anyMatch = resolved.some((item) =>
    matchesCondition(item, fieldName, operator, compareValue)
  );
  return bool(anyMatch);
};

/**
 * %find @array "field" "op" value - Find first matching item
 *
 * @example
 * active = "%find @items \"status\" \"=\" \"active\""
 */
export const find: VerbFunction = (args) => {
  if (args.length < 4) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const fieldName = toString(args[1]!);
  const operator = toString(args[2]!);
  const compareValue = args[3]!;

  const found = resolved.find((item) => matchesCondition(item, fieldName, operator, compareValue));
  if (found === undefined) return nil();

  return jsToTransformValue(found);
};

/**
 * %findIndex @array "field" "op" value - Find index of first matching item
 * Returns -1 if not found.
 *
 * @example
 * activeIndex = "%findIndex @items \"status\" \"=\" \"active\""
 */
export const findIndex: VerbFunction = (args) => {
  if (args.length < 4) return int(-1);

  const resolved = extractArray(args[0]!);
  if (!resolved) return int(-1);

  const fieldName = toString(args[1]!);
  const operator = toString(args[2]!);
  const compareValue = args[3]!;

  const index = resolved.findIndex((item) =>
    matchesCondition(item, fieldName, operator, compareValue)
  );
  return int(index);
};

/**
 * %includes @array value - Check if array contains value
 *
 * @example
 * hasCA = "%includes @states \"CA\""
 */
export const includes: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const searchValue = args[1]!;
  const searchStr = toString(searchValue);

  const found = resolved.some((item) => {
    const itemStr = toString(jsToTransformValue(item));
    return itemStr === searchStr;
  });

  return bool(found);
};

/**
 * %concatArrays @arr1 @arr2 - Concatenate two arrays
 *
 * @example
 * combined = "%concatArrays @items1 @items2"
 */
export const concatArrays: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const arr1 = extractArray(args[0]!);
  const arr2 = extractArray(args[1]!);

  if (!arr1 && !arr2) return nil();

  const result = [...(arr1 || []), ...(arr2 || [])];
  return arr(result);
};

/**
 * %zip @arr1 @arr2 - Zip two arrays together
 * Creates array of [a, b] pairs. Stops at shorter array length.
 *
 * @example
 * pairs = "%zip @names @values"  ; ["a","b"], [1,2] → [["a",1],["b",2]]
 */
export const zip: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const arr1 = extractArray(args[0]!);
  const arr2 = extractArray(args[1]!);

  if (!arr1 || !arr2) return nil();

  const minLen = Math.min(arr1.length, arr2.length);
  const result: unknown[] = [];

  for (let i = 0; i < minLen; i++) {
    result.push([arr1[i], arr2[i]]);
  }

  return arr(result);
};

/**
 * %groupBy @array "field" - Group array items by field value
 * Returns array of { key, items } objects (OdinArray compatible).
 *
 * @example
 * byStatus = "%groupBy @orders \"status\""
 * ; Returns: [{ key: "active", items: [...] }, { key: "pending", items: [...] }]
 */
export const groupBy: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const fieldName = toString(args[1]!);

  // Group items by field value
  const groups = new Map<string, unknown[]>();

  for (const item of resolved) {
    const fieldValue = getFieldValue(item, fieldName);
    const key = toString(jsToTransformValue(fieldValue));

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }

  // Convert to array of { key, items } objects
  const result: unknown[] = [];
  for (const [key, items] of groups) {
    result.push(obj({ key, items: arr(items) }));
  }

  return arr(result);
};

/**
 * %partition @array "field" "op" value - Split array by condition
 * Returns [matching, non-matching] arrays.
 *
 * @example
 * [active, inactive] = "%partition @items \"status\" \"=\" \"active\""
 */
export const partition: VerbFunction = (args) => {
  if (args.length < 4) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const fieldName = toString(args[1]!);
  const operator = toString(args[2]!);
  const compareValue = args[3]!;

  const matching: unknown[] = [];
  const nonMatching: unknown[] = [];

  for (const item of resolved) {
    if (matchesCondition(item, fieldName, operator, compareValue)) {
      matching.push(item);
    } else {
      nonMatching.push(item);
    }
  }

  return arr([arr(matching), arr(nonMatching)]);
};

/**
 * %take @array count - Get first N elements
 *
 * @example
 * firstThree = "%take @items ##3"
 */
export const take: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const count = Math.floor(toNumber(args[1]!));
  if (count < 0) return nil();

  return arr(resolved.slice(0, count));
};

/**
 * %drop @array count - Skip first N elements
 *
 * @example
 * afterFirst = "%drop @items ##1"
 */
export const drop: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const count = Math.floor(toNumber(args[1]!));
  if (count < 0) return nil();

  return arr(resolved.slice(count));
};

/**
 * %chunk @array size - Split array into chunks of specified size
 *
 * @example
 * pages = "%chunk @items ##10"  ; [1,2,3,4,5], 2 → [[1,2],[3,4],[5]]
 */
export const chunk: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const size = Math.floor(toNumber(args[1]!));
  if (size <= 0) return nil();

  const chunks: unknown[] = [];
  for (let i = 0; i < resolved.length; i += size) {
    chunks.push(arr(resolved.slice(i, i + size)));
  }

  return arr(chunks);
};

/**
 * %range start end [step] - Generate array of numbers
 * End is exclusive: range(1, 5) → [1, 2, 3, 4]
 *
 * @example
 * nums = "%range ##1 ##5"       ; [1, 2, 3, 4]
 * evens = "%range ##0 ##10 ##2" ; [0, 2, 4, 6, 8]
 */
export const range: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const start = Math.floor(toNumber(args[0]!));
  const end = Math.floor(toNumber(args[1]!));
  const step = args.length >= 3 ? Math.floor(toNumber(args[2]!)) : 1;

  if (step === 0) return nil();

  const result: number[] = [];

  // Limit to prevent memory issues
  const maxElements = 10000;

  if (step > 0) {
    for (let i = start; i < end && result.length < maxElements; i += step) {
      result.push(i);
    }
  } else {
    for (let i = start; i > end && result.length < maxElements; i += step) {
      result.push(i);
    }
  }

  return arr(result);
};

/**
 * %compact @array - Remove null, undefined, and empty string values
 *
 * @example
 * clean = "%compact @values"  ; [1, null, 2, "", 3] → [1, 2, 3]
 */
export const compact: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const compacted = resolved.filter((item) => {
    if (item === null || item === undefined) return false;
    if (item === '') return false;

    // Handle CDM null type
    if (typeof item === 'object' && item !== null && 'type' in item) {
      const tv = item as TransformValue;
      if (tv.type === 'null') return false;
      if (tv.type === 'string' && tv.value === '') return false;
    }

    return true;
  });

  return arr(compacted);
};

/**
 * %pluck @array "field" - Extract field values from array of objects
 * Alias for %map with slightly different semantics.
 *
 * @example
 * ids = "%pluck @users \"id\""
 */
export const pluck: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const fieldName = toString(args[1]!);

  const values = resolved.map((item) => {
    const value = getFieldValue(item, fieldName);
    return value !== undefined ? value : null;
  });

  return arr(values);
};

/**
 * %unique @array - Remove duplicate values (alias for %distinct)
 *
 * @example
 * uniq = "%unique @tags"
 */
export const unique: VerbFunction = (args, context) => {
  // Delegate to distinct
  return distinct(args, context);
};

// ─────────────────────────────────────────────────────────────────────────────
// Cumulative and Time-Series Array Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %cumsum @array - Cumulative sum of numeric array
 * Returns an array where each element is the sum of all previous elements including itself.
 *
 * @example
 * running = "%cumsum @values"  ; [1, 2, 3, 4] → [1, 3, 6, 10]
 */
export const cumsum: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const result: number[] = [];
  let sum = 0;

  for (const item of resolved) {
    const val = toNumber(jsToTransformValue(item));
    if (Number.isNaN(val)) {
      result.push(NaN);
    } else {
      sum += val;
      result.push(sum);
    }
  }

  return arr(result);
};

/**
 * %cumprod @array - Cumulative product of numeric array
 * Returns an array where each element is the product of all previous elements including itself.
 *
 * @example
 * growth = "%cumprod @rates"  ; [1.1, 1.2, 0.9] → [1.1, 1.32, 1.188]
 */
export const cumprod: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const result: number[] = [];
  let product = 1;

  for (const item of resolved) {
    const val = toNumber(jsToTransformValue(item));
    if (Number.isNaN(val)) {
      result.push(NaN);
    } else {
      product *= val;
      result.push(product);
    }
  }

  return arr(result);
};

/**
 * %shift @array [periods] [fillValue] - Shift array elements by N positions
 * Positive periods shift forward (values move to later indices), negative shifts backward.
 * Empty positions are filled with fillValue (default: null).
 *
 * @example
 * lagged = "%shift @prices ##1"         ; [10, 20, 30] → [null, 10, 20]
 * lead = "%shift @prices ##-1"          ; [10, 20, 30] → [20, 30, null]
 * filled = "%shift @prices ##1 ##0"     ; [10, 20, 30] → [0, 10, 20]
 */
export const shift: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const periods = args.length >= 2 ? Math.floor(toNumber(args[1]!)) : 1;
  const fillValue = args.length >= 3 ? args[2]! : { type: 'null' as const };

  const len = resolved.length;
  const result: unknown[] = new Array(len);

  if (periods >= 0) {
    // Shift forward: values move to higher indices
    for (let i = 0; i < len; i++) {
      if (i < periods) {
        result[i] = fillValue;
      } else {
        result[i] = resolved[i - periods];
      }
    }
  } else {
    // Shift backward: values move to lower indices
    const absShift = -periods;
    for (let i = 0; i < len; i++) {
      if (i >= len - absShift) {
        result[i] = fillValue;
      } else {
        result[i] = resolved[i + absShift];
      }
    }
  }

  return arr(result);
};

/**
 * %diff @array [periods] - Difference between consecutive elements
 * Returns array of differences: arr[i] - arr[i - periods].
 * First 'periods' elements will be null.
 *
 * @example
 * changes = "%diff @values"         ; [10, 15, 12, 18] → [null, 5, -3, 6]
 * changes2 = "%diff @values ##2"    ; [10, 15, 12, 18] → [null, null, 2, 3]
 */
export const diff: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const periods = args.length >= 2 ? Math.max(1, Math.floor(toNumber(args[1]!))) : 1;

  const result: unknown[] = [];

  for (let i = 0; i < resolved.length; i++) {
    if (i < periods) {
      result.push({ type: 'null' as const });
    } else {
      const current = toNumber(jsToTransformValue(resolved[i]));
      const previous = toNumber(jsToTransformValue(resolved[i - periods]));

      if (Number.isNaN(current) || Number.isNaN(previous)) {
        result.push({ type: 'null' as const });
      } else {
        result.push(current - previous);
      }
    }
  }

  return arr(result);
};

/**
 * %pctChange @array [periods] - Percentage change between consecutive elements
 * Returns array of percentage changes: (arr[i] - arr[i - periods]) / arr[i - periods].
 * First 'periods' elements will be null. Division by zero returns null.
 *
 * @example
 * returns = "%pctChange @prices"      ; [100, 110, 99] → [null, 0.1, -0.1]
 * returns2 = "%pctChange @prices ##2" ; [100, 110, 121] → [null, null, 0.21]
 */
export const pctChange: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const periods = args.length >= 2 ? Math.max(1, Math.floor(toNumber(args[1]!))) : 1;

  const result: unknown[] = [];

  for (let i = 0; i < resolved.length; i++) {
    if (i < periods) {
      result.push({ type: 'null' as const });
    } else {
      const current = toNumber(jsToTransformValue(resolved[i]));
      const previous = toNumber(jsToTransformValue(resolved[i - periods]));

      if (Number.isNaN(current) || Number.isNaN(previous) || previous === 0) {
        result.push({ type: 'null' as const });
      } else {
        result.push((current - previous) / previous);
      }
    }
  }

  return arr(result);
};

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %dedupe @array "keyField" - Remove duplicates by key field, preserving order
 * Unlike distinct/unique which removes duplicate values, dedupe removes duplicate
 * objects based on a specific field value. Keeps the first occurrence.
 *
 * @example
 * unique = "%dedupe @records \"id\""       ; Keep first record for each id
 * unique = "%dedupe @claims \"claimNo\""   ; Dedupe by claim number
 */
export const dedupe: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const keyField = toString(args[1]!);
  const seen = new Set<string>();
  const result: unknown[] = [];

  for (const item of resolved) {
    // Get the key value from the object
    let keyValue: string;

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      const fieldValue = obj[keyField];
      if (fieldValue === undefined || fieldValue === null) {
        // Items without the key field are kept (unique)
        result.push(item);
        continue;
      }
      // Convert to string for comparison
      if (typeof fieldValue === 'object' && 'type' in fieldValue && 'value' in fieldValue) {
        // CDM typed value
        keyValue = String((fieldValue as { value: unknown }).value);
      } else {
        keyValue = String(fieldValue);
      }
    } else {
      // Non-object items - use the value itself as key
      keyValue = String(item);
    }

    if (!seen.has(keyValue)) {
      seen.add(keyValue);
      result.push(item);
    }
  }

  return arr(result);
};

// ─────────────────────────────────────────────────────────────────────────────
// Window/Ranking Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %rowNumber @array - Add sequential row numbers to array items
 *
 * Returns array of objects with original item and _rowNum property (1-based).
 * Useful for adding sequence numbers to records.
 *
 * @example
 * numbered = "%rowNumber @items"  ; [{a:1},{a:2}] → [{_rowNum:1,a:1},{_rowNum:2,a:2}]
 */
export const rowNumber: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const result: unknown[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const item = resolved[i];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      // Merge row number into object
      result.push({ _rowNum: i + 1, ...(item as object) });
    } else {
      // For primitives, wrap in object
      result.push({ _rowNum: i + 1, value: item });
    }
  }

  return arr(result);
};

/**
 * %rank @array ["field"] ["direction"] - Rank array items
 *
 * Returns array with _rank property added. Items with same value get same rank.
 * Supports ranking by field for object arrays.
 *
 * @example
 * ranked = "%rank @scores"                    ; [10,20,20,30] → ranks [4,2,2,1]
 * ranked = "%rank @students \"score\" \"desc\""  ; Rank by score descending
 */
export const rank: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const fieldName = args.length > 1 ? toString(args[1]!) : null;
  const direction = args.length > 2 ? toString(args[2]!).toLowerCase() : 'desc';

  // Get values for ranking
  const values = resolved.map((item, idx) => {
    let val: unknown;
    if (fieldName && typeof item === 'object' && item !== null) {
      val = getFieldValue(item, fieldName);
      val = getComparableValue(val);
    } else {
      val = getComparableValue(item);
    }
    return { idx, val, item };
  });

  // Sort to determine ranks
  const sorted = [...values].sort((a, b) => {
    const aVal = a.val;
    const bVal = b.val;
    const mult = direction === 'asc' ? 1 : -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * mult;
    }
    return String(aVal ?? '').localeCompare(String(bVal ?? '')) * mult;
  });

  // Assign ranks (same value = same rank)
  const ranks = new Map<number, number>();
  let currentRank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]!.val !== sorted[i - 1]!.val) {
      currentRank = i + 1;
    }
    ranks.set(sorted[i]!.idx, currentRank);
  }

  // Build result in original order
  const result = resolved.map((item, idx) => {
    const rankVal = ranks.get(idx) ?? idx + 1;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return { _rank: rankVal, ...(item as object) };
    }
    return { _rank: rankVal, value: item };
  });

  return arr(result);
};

/**
 * %lag @array [periods] [default] - Get previous value in array
 *
 * Returns array where each element is the value from N positions earlier.
 * First N elements use the default value (null if not specified).
 *
 * @example
 * prev = "%lag @prices"           ; [10,20,30] → [null,10,20]
 * prev = "%lag @prices ##2 ##0"   ; [10,20,30] → [0,0,10]
 */
export const lag: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const periods = args.length >= 2 ? Math.max(1, Math.floor(toNumber(args[1]!))) : 1;
  const defaultVal = args.length >= 3 ? args[2]! : { type: 'null' as const };

  const result: unknown[] = [];
  for (let i = 0; i < resolved.length; i++) {
    if (i < periods) {
      result.push(defaultVal);
    } else {
      result.push(resolved[i - periods]);
    }
  }

  return arr(result);
};

/**
 * %lead @array [periods] [default] - Get next value in array
 *
 * Returns array where each element is the value from N positions ahead.
 * Last N elements use the default value (null if not specified).
 *
 * @example
 * next = "%lead @prices"           ; [10,20,30] → [20,30,null]
 * next = "%lead @prices ##2 ##0"   ; [10,20,30] → [30,0,0]
 */
export const lead: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const periods = args.length >= 2 ? Math.max(1, Math.floor(toNumber(args[1]!))) : 1;
  const defaultVal = args.length >= 3 ? args[2]! : { type: 'null' as const };

  const result: unknown[] = [];
  for (let i = 0; i < resolved.length; i++) {
    if (i >= resolved.length - periods) {
      result.push(defaultVal);
    } else {
      result.push(resolved[i + periods]);
    }
  }

  return arr(result);
};

// ─────────────────────────────────────────────────────────────────────────────
// Sampling and Null Handling Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %sample @array count [seed] - Random sample of N items from array
 *
 * Returns a random subset of the array without replacement.
 * Optional seed for reproducible results.
 *
 * @example
 * subset = "%sample @items ##10"         ; Random 10 items
 * subset = "%sample @items ##5 ##42"     ; Seeded for reproducibility
 */
export const sample: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const count = Math.max(0, Math.floor(toNumber(args[1]!)));
  if (count === 0) return arr([]);
  if (count >= resolved.length) return arr([...resolved]);

  // Simple seeded random (mulberry32)
  const seed = args.length >= 3 ? Math.floor(toNumber(args[2]!)) : Date.now();
  let state = seed;
  const random = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Fisher-Yates shuffle first 'count' elements
  const copy = [...resolved];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }

  return arr(copy.slice(0, count));
};

/**
 * %limit @array count - Get first N items (alias for take)
 *
 * Returns the first N items from the array. Useful for pagination
 * and limiting result sets.
 *
 * @example
 * top10 = "%limit @results ##10"
 */
export const limit: VerbFunction = (args, context) => {
  return take(args, context);
};

/**
 * %fillMissing @array [value] [strategy] - Replace null/undefined values
 *
 * Fills missing (null/undefined) values in array. Strategies:
 * - "value" (default): Replace with specified value
 * - "forward": Fill with previous non-null value
 * - "backward": Fill with next non-null value
 * - "mean": Fill with mean of non-null numeric values
 *
 * @example
 * filled = "%fillMissing @values ##0"               ; Replace nulls with 0
 * filled = "%fillMissing @values ~ \"forward\""     ; Forward fill
 * filled = "%fillMissing @prices ~ \"mean\""        ; Fill with mean
 */
export const fillMissing: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const fillValue = args.length >= 2 ? args[1]! : { type: 'null' as const };
  const strategy = args.length >= 3 ? toString(args[2]!).toLowerCase() : 'value';

  const isNullish = (val: unknown): boolean => {
    if (val === null || val === undefined) return true;
    if (typeof val === 'object' && val !== null && 'type' in val) {
      return (val as TransformValue).type === 'null';
    }
    return false;
  };

  if (strategy === 'forward') {
    const result: unknown[] = [];
    let lastNonNull: unknown = fillValue;
    for (const item of resolved) {
      if (isNullish(item)) {
        result.push(lastNonNull);
      } else {
        result.push(item);
        lastNonNull = item;
      }
    }
    return arr(result);
  }

  if (strategy === 'backward') {
    const result: unknown[] = new Array(resolved.length);
    let lastNonNull: unknown = fillValue;
    for (let i = resolved.length - 1; i >= 0; i--) {
      if (isNullish(resolved[i])) {
        result[i] = lastNonNull;
      } else {
        result[i] = resolved[i];
        lastNonNull = resolved[i];
      }
    }
    return arr(result);
  }

  if (strategy === 'mean') {
    // Calculate mean of non-null numeric values
    let sum = 0;
    let count = 0;
    for (const item of resolved) {
      if (!isNullish(item)) {
        const num = toNumber(jsToTransformValue(item));
        if (!Number.isNaN(num)) {
          sum += num;
          count++;
        }
      }
    }
    const mean = count > 0 ? sum / count : 0;
    const meanValue = { type: 'number' as const, value: mean };

    const result = resolved.map((item) => (isNullish(item) ? meanValue : item));
    return arr(result);
  }

  // Default: replace with specified value
  const result = resolved.map((item) => (isNullish(item) ? fillValue : item));
  return arr(result);
};

// ─────────────────────────────────────────────────────────────────────────────
// Fold/Reshape Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %reduce @array %verb initialValue - Fold array to single value using verb
 *
 * Iterates array, calling %verb(accumulator, currentElement) at each step.
 * Empty array returns initialValue.
 *
 * @example
 * total = "%reduce @.prices %add ##0"         ; Sum: 150
 * all = "%reduce @.words %concat \"\""        ; Concatenate strings
 */
export const reduce: VerbFunction = (args, context) => {
  if (args.length < 3) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  // args[1] is the verb name (passed as a string)
  const verbName = toString(args[1]!);

  let accumulator: TransformValue = args[2]!;

  // Look up verb in the registry from context
  const registry = context?.verbRegistry;
  if (!registry) return nil();

  const verbFn = registry.get(verbName);
  if (!verbFn) return nil();

  for (const item of resolved) {
    const itemValue = jsToTransformValue(item);
    accumulator = verbFn([accumulator, itemValue], context as TransformContext);
  }

  return accumulator;
};

/**
 * %pivot @array "keyField" "valueField" - Array of objects → object keyed by field
 *
 * Reshapes an array of objects into a single object where keys come from
 * one field and values from another. Duplicate keys: last value wins.
 * Elements missing the key or value field are skipped.
 *
 * @example
 * lookup = "%pivot @.items \"name\" \"value\""
 * ; [{name:"a",value:1},{name:"b",value:2}] → {a:1, b:2}
 */
export const pivot: VerbFunction = (args) => {
  if (args.length < 3) return nil();

  const resolved = extractArray(args[0]!);
  if (!resolved) return nil();

  const keyField = toString(args[1]!);
  const valueField = toString(args[2]!);

  const result: Record<string, unknown> = {};

  for (const item of resolved) {
    if (typeof item !== 'object' || item === null) continue;

    const itemObj = item as Record<string, unknown>;

    // Handle CDM objects
    let source: Record<string, unknown>;
    if (itemObj.type === 'object' && typeof itemObj.value === 'object' && itemObj.value !== null) {
      source = itemObj.value as Record<string, unknown>;
    } else {
      source = itemObj;
    }

    const keyRaw = source[keyField];
    if (keyRaw === undefined || keyRaw === null) continue;

    const key = typeof keyRaw === 'object' && keyRaw !== null && 'value' in keyRaw
      ? String((keyRaw as Record<string, unknown>).value)
      : String(keyRaw);

    const valueRaw = source[valueField];
    if (valueRaw === undefined) continue;

    // Store the raw value — the serializer handles type detection
    result[key] = valueRaw;
  }

  return obj(result);
};

/**
 * %unpivot @object "keyName" "valueName" - Object → array of {key, value} objects
 *
 * Reshapes an object into an array of objects, each with the specified
 * key and value field names. Iteration order is insertion order.
 *
 * @example
 * rows = "%unpivot @.lookup \"key\" \"value\""
 * ; {a:1, b:2} → [{key:"a",value:1},{key:"b",value:2}]
 */
export const unpivot: VerbFunction = (args) => {
  if (args.length < 3) return nil();

  const source = args[0]!;
  if (source.type !== 'object') return nil();

  const keyName = toString(args[1]!);
  const valueName = toString(args[2]!);

  const entries = Object.entries(source.value);
  const result: unknown[] = [];

  for (const [k, v] of entries) {
    const entry: Record<string, unknown> = {};
    entry[keyName] = k;
    entry[valueName] = v;
    result.push(entry);
  }

  return arr(result);
};
