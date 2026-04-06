/**
 * ODIN Transform Source Parser Utilities
 *
 * Shared utility functions used across multiple parsers.
 */

import type { Discriminator } from '../../types/transform.js';

/**
 * Extract discriminator value from a fixed-width line.
 */
export function extractFixedWidthDiscriminator(line: string, discriminator: Discriminator): string {
  if (discriminator.type === 'position' && discriminator.pos !== undefined) {
    const len = discriminator.len ?? 2;
    return line.slice(discriminator.pos, discriminator.pos + len).trim();
  }
  return '';
}

/**
 * Extract discriminator value from source data based on discriminator config.
 */
export function extractDiscriminator(data: unknown, discriminator: Discriminator): string {
  switch (discriminator.type) {
    case 'position':
      // For fixed-width - data should be string
      if (typeof data === 'string') {
        return extractFixedWidthDiscriminator(data, discriminator);
      }
      return '';

    case 'field':
      // For CSV - data should be array
      if (Array.isArray(data) && discriminator.field !== undefined) {
        return String(data[discriminator.field] ?? '');
      }
      return '';

    case 'path':
      // For JSON/XML - use path expression
      if (discriminator.path && typeof data === 'object' && data !== null) {
        return String(getValueAtPath(data as Record<string, unknown>, discriminator.path) ?? '');
      }
      return '';

    default:
      return '';
  }
}

/**
 * Get value at a dot-notation path.
 */
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    // Handle array index notation
    const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);
    if (arrayMatch) {
      const key = arrayMatch[1]!;
      const index = parseInt(arrayMatch[2]!, 10);
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}
