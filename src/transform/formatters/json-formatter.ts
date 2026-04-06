/**
 * ODIN JSON Formatter - Format OdinDocument as JSON.
 *
 * Converts the canonical ODIN representation to JSON output.
 * Extracted from formatters.ts for single responsibility.
 */

import type { OdinDocument } from '../../types/document.js';
import type { OdinTransform } from '../../types/transform.js';
import { odinValueToJsonCompatible } from './value-converters.js';

/**
 * Format OdinDocument as JSON.
 *
 * Preserves type fidelity:
 * - Currency/number values use `raw` string when available to maintain precision
 * - This ensures high-precision values (crypto, scientific) roundtrip correctly
 */
export function formatJsonFromOdin(doc: OdinDocument, transform: OdinTransform): string {
  const indent = transform.target.indent ?? 2;
  const nulls = transform.target.nulls ?? 'include';
  const emptyArrays = transform.target.emptyArrays ?? 'include';

  // Convert OdinDocument to JSON-compatible object with type fidelity
  const output = odinDocToJsonWithFidelity(doc);

  // Apply null/empty filtering
  const filtered = filterJsonOutput(output, nulls, emptyArrays);

  return JSON.stringify(filtered, null, indent);
}

/**
 * Convert OdinDocument to JSON object while preserving type fidelity.
 *
 * Unlike doc.toJSON(), this function:
 * - Uses `raw` string values for currency/number to preserve precision
 * - Converts high-precision values to strings in JSON (standard practice for crypto/financial)
 */
function odinDocToJsonWithFidelity(doc: OdinDocument): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const path of doc.paths()) {
    // Skip metadata paths
    if (path.startsWith('$.')) continue;

    const value = doc.get(path);
    if (value === undefined) continue;

    setNestedValue(result, path, odinValueToJsonCompatible(value, { preservePrecision: true }));
  }

  return result;
}

/**
 * Set a value at a nested path in an object.
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = parsePath(path);
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const nextPart = parts[i + 1]!;

    if (typeof part === 'number') {
      // Current position is an array index
      if (!Array.isArray(current)) continue;
      if (current[part] === undefined) {
        current[part] = typeof nextPart === 'number' ? [] : {};
      }
      current = current[part] as Record<string, unknown>;
    } else {
      // Current position is an object key
      if (current[part] === undefined) {
        current[part] = typeof nextPart === 'number' ? [] : {};
      }
      current = current[part] as Record<string, unknown>;
    }
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart !== undefined) {
    if (typeof lastPart === 'number' && Array.isArray(current)) {
      current[lastPart] = value;
    } else if (typeof lastPart === 'string') {
      current[lastPart] = value;
    }
  }
}

/**
 * Parse a path string into segments (handles both dot notation and array indices).
 */
export function parsePath(path: string): (string | number)[] {
  const parts: (string | number)[] = [];
  let current = '';

  for (let i = 0; i < path.length; i++) {
    const char = path[i]!;

    if (char === '.') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else if (char === '[') {
      if (current) {
        parts.push(current);
        current = '';
      }
      // Read array index
      i++;
      let indexStr = '';
      while (i < path.length && path[i] !== ']') {
        indexStr += path[i];
        i++;
      }
      parts.push(parseInt(indexStr, 10));
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Filter JSON output based on null and empty array handling options.
 */
function filterJsonOutput(
  obj: unknown,
  nulls: 'omit' | 'include',
  emptyArrays: 'omit' | 'include'
): unknown {
  if (obj === null) {
    return nulls === 'include' ? null : undefined;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0 && emptyArrays === 'omit') {
      return undefined;
    }
    return obj
      .map((item) => filterJsonOutput(item, nulls, emptyArrays))
      .filter((v) => v !== undefined);
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const filtered = filterJsonOutput(value, nulls, emptyArrays);
      if (filtered !== undefined) {
        result[key] = filtered;
      }
    }
    return result;
  }

  return obj;
}
