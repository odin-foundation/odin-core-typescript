/**
 * Compute differences between ODIN documents.
 */

import type { OdinDocument } from '../types/document.js';
import type { OdinDiff, PathValue, PathChange, PathMove } from '../types/diff.js';
import type {
  OdinValue,
  OdinTypedValue,
  OdinModifiers,
  OdinBoolean,
  OdinString,
  OdinNumber,
  OdinInteger,
  OdinCurrency,
  OdinPercent,
  OdinDate,
  OdinTimestamp,
  OdinTime,
  OdinDuration,
  OdinReference,
  OdinBinary,
  OdinArray,
} from '../types/values.js';

/**
 * Compute the difference between two ODIN documents.
 *
 * Detects additions, deletions, modifications, and moves.
 *
 * @param a - Original document
 * @param b - Modified document
 * @returns Diff object describing all changes from a to b
 */
export function diff(a: OdinDocument, b: OdinDocument): OdinDiff {
  const additions: PathValue[] = [];
  const deletions: PathValue[] = [];
  const modifications: PathChange[] = [];
  const moves: PathMove[] = [];

  const pathsA = new Set(a.paths());
  const pathsB = new Set(b.paths());

  // Additions: paths in b but not in a
  for (const path of pathsB) {
    if (!pathsA.has(path)) {
      const value = b.get(path);
      if (value !== undefined) {
        additions.push({ path, value });
      }
    }
  }

  // Deletions: paths in a but not in b
  for (const path of pathsA) {
    if (!pathsB.has(path)) {
      const value = a.get(path);
      if (value !== undefined) {
        deletions.push({ path, value });
      }
    }
  }

  // Modifications: paths in both with different values or different modifiers
  for (const path of pathsA) {
    if (pathsB.has(path)) {
      const valueA = a.get(path);
      const valueB = b.get(path);
      if (valueA !== undefined && valueB !== undefined) {
        const valuesDiffer = !valuesEqual(valueA, valueB);
        const modsDiffer = !modifiersEqual(a.modifiers.get(path), b.modifiers.get(path));
        if (valuesDiffer || modsDiffer) {
          modifications.push({
            path,
            oldValue: valueA,
            newValue: valueB,
          });
        }
      }
    }
  }

  /**
   * Detect moves by matching deleted and added values.
   * Uses exact value matching. When duplicate values exist, first match wins.
   * Complex renames or partial matches are not detected.
   */
  const unusedDeletions = new Set(deletions.map((d) => d.path));
  const unusedAdditions = new Set(additions.map((a) => a.path));

  for (const del of deletions) {
    if (!unusedDeletions.has(del.path)) continue;

    for (const add of additions) {
      if (!unusedAdditions.has(add.path)) continue;

      if (valuesEqual(del.value, add.value)) {
        moves.push({
          fromPath: del.path,
          toPath: add.path,
        });
        unusedDeletions.delete(del.path);
        unusedAdditions.delete(add.path);
        break;
      }
    }
  }

  // Filter out moved items from additions/deletions
  const filteredAdditions = additions.filter((a) => unusedAdditions.has(a.path));
  const filteredDeletions = deletions.filter((d) => unusedDeletions.has(d.path));

  const isEmpty =
    filteredAdditions.length === 0 &&
    filteredDeletions.length === 0 &&
    modifications.length === 0 &&
    moves.length === 0;

  return {
    additions: filteredAdditions,
    deletions: filteredDeletions,
    modifications,
    moves,
    isEmpty,
  };
}

/**
 * Check if two ODIN values are equal.
 */
function valuesEqual(a: OdinValue, b: OdinValue): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case 'null':
      return true;

    case 'boolean':
      return a.value === (b as OdinBoolean).value;

    case 'string':
      return a.value === (b as OdinString).value;

    case 'number':
      return a.value === (b as OdinNumber).value;

    case 'integer':
      return a.value === (b as OdinInteger).value;

    case 'currency':
      return compareCurrency(a, b as OdinCurrency);

    case 'percent':
      return comparePercent(a as OdinPercent, b as OdinPercent);

    case 'date':
      return (a as OdinDate).value.getTime() === (b as OdinDate).value.getTime();

    case 'timestamp':
      return (a as OdinTimestamp).value.getTime() === (b as OdinTimestamp).value.getTime();

    case 'time':
      return (a as OdinTime).value === (b as OdinTime).value;

    case 'duration':
      return (a as OdinDuration).value === (b as OdinDuration).value;

    case 'reference':
      return a.path === (b as OdinReference).path;

    case 'binary':
      return compareBinary(a, b as OdinBinary);

    case 'array':
      return compareArrays(a, b as OdinArray);

    default:
      return false;
  }
}

function modifiersEqual(
  a: OdinModifiers | undefined,
  b: OdinModifiers | undefined
): boolean {
  const aReq = a?.required ?? false;
  const bReq = b?.required ?? false;
  const aConf = a?.confidential ?? false;
  const bConf = b?.confidential ?? false;
  const aDep = a?.deprecated ?? false;
  const bDep = b?.deprecated ?? false;
  return aReq === bReq && aConf === bConf && aDep === bDep;
}

function compareCurrency(a: OdinCurrency, b: OdinCurrency): boolean {
  return (
    a.value === b.value && a.decimalPlaces === b.decimalPlaces && a.currencyCode === b.currencyCode
  );
}

function comparePercent(a: OdinPercent, b: OdinPercent): boolean {
  return a.value === b.value;
}

function compareBinary(a: OdinBinary, b: OdinBinary): boolean {
  if (a.algorithm !== b.algorithm) return false;
  if (a.data.length !== b.data.length) return false;

  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) return false;
  }
  return true;
}

function compareArrays(a: OdinArray, b: OdinArray): boolean {
  if (a.items.length !== b.items.length) return false;

  for (let i = 0; i < a.items.length; i++) {
    const itemA = a.items[i]!;
    const itemB = b.items[i]!;

    // Check if both items are Maps (object arrays)
    if (itemA instanceof Map && itemB instanceof Map) {
      if (itemA.size !== itemB.size) return false;
      for (const [key, val] of itemA) {
        const bVal = itemB.get(key);
        if (bVal === undefined || !valuesEqual(val, bVal)) return false;
      }
    } else if (!(itemA instanceof Map) && !(itemB instanceof Map)) {
      // Both are OdinTypedValue (flat arrays)
      if (!valuesEqual(itemA as OdinTypedValue, itemB as OdinTypedValue)) return false;
    } else {
      // Type mismatch
      return false;
    }
  }
  return true;
}
