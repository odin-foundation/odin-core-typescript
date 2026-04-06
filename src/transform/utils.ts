/**
 * ODIN Transform Utilities
 *
 * Shared utility functions for transform operations.
 */

import { SECURITY_LIMITS } from '../utils/security-limits.js';

/**
 * Resolve a dot-notation path from an object.
 *
 * Supports:
 * - Dot notation: "policy.holder.name"
 * - Array indices: "items[0].value" or "items.0.value"
 * - Nested paths: "data.nested[2].field"
 *
 * @param path - The path to resolve (e.g., "policy.holder.name")
 * @param obj - The object to resolve the path from
 * @param depth - Current recursion depth (for stack overflow prevention)
 * @returns The value at the path, or undefined if not found
 *
 * @example
 * const data = { policy: { holder: { name: "John" } } };
 * resolvePath("policy.holder.name", data); // "John"
 *
 * @example
 * const data = { items: [{ id: 1 }, { id: 2 }] };
 * resolvePath("items[1].id", data); // 2
 */
export function resolvePath(path: string, obj: unknown, depth: number = 0): unknown {
  // Prevent stack overflow from deeply nested path resolution
  if (depth > SECURITY_LIMITS.MAX_PATH_RESOLUTION_DEPTH) {
    return undefined;
  }

  if (!path) return obj;
  if (obj === null || obj === undefined) return undefined;

  // Parse path into segments, handling [], [n], and dot notation
  const segments: Array<string | number | 'all'> = [];
  let i = 0;
  let current = '';

  while (i < path.length) {
    const char = path[i];

    if (char === '.') {
      if (current) {
        segments.push(current);
        current = '';
      }
      i++;
    } else if (char === '[') {
      if (current) {
        segments.push(current);
        current = '';
      }
      i++; // skip [
      const start = i;
      while (i < path.length && path[i] !== ']') i++;
      const indexStr = path.slice(start, i);
      if (indexStr === '') {
        segments.push('all'); // [] means iterate all
      } else {
        segments.push(parseInt(indexStr, 10));
      }
      i++; // skip ]
    } else {
      current += char;
      i++;
    }
  }
  if (current) segments.push(current);

  let result: unknown = obj;

  for (let j = 0; j < segments.length; j++) {
    const seg = segments[j]!;
    if (result === null || result === undefined) return undefined;

    if (seg === 'all') {
      if (!Array.isArray(result)) return undefined;
      const remainingSegs = segments.slice(j + 1);
      if (remainingSegs.length === 0) return result;
      const remainingPath = segmentsToPath(remainingSegs);
      return result.map((item) => resolvePath(remainingPath, item, depth + 1));
    } else if (typeof seg === 'number') {
      if (!Array.isArray(result)) return undefined;
      result = result[seg];
    } else {
      if (typeof result !== 'object') return undefined;
      if (Array.isArray(result)) {
        // Handle array.field pattern
        const remainingPath = segmentsToPath(segments.slice(j));
        return result.map((item) => resolvePath(remainingPath, item, depth + 1));
      }
      result = (result as Record<string, unknown>)[seg];
    }
  }

  return result;
}

function segmentsToPath(segments: Array<string | number | 'all'>): string {
  let path = '';
  for (const seg of segments) {
    if (seg === 'all') {
      path += '[]';
    } else if (typeof seg === 'number') {
      path += `[${seg}]`;
    } else {
      path += path ? '.' + seg : seg;
    }
  }
  return path;
}
