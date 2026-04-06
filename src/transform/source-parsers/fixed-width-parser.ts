/**
 * ODIN Transform Fixed-Width Parser
 *
 * Parse fixed-width format strings.
 * For single-line parsing with field definitions, extracts fields by position.
 * For multi-line files, returns array of raw lines (engine handles routing).
 */

import type { SourceParserOptions, FixedWidthField } from './types.js';

/**
 * Parse fixed-width format string.
 *
 * @param input - Raw fixed-width input
 * @param options - Parser options including field definitions
 */
export function parseFixedWidth(input: string, options?: SourceParserOptions): unknown {
  const fields = options?.fields;

  // If field definitions provided, parse single record
  if (fields && fields.length > 0) {
    return parseFixedWidthRecord(input, fields);
  }

  // Otherwise, return lines for multi-record processing
  return input.split(/\r?\n/).filter((line) => line.length > 0);
}

/**
 * Parse a single fixed-width record using field definitions.
 */
export function parseFixedWidthRecord(
  line: string,
  fields: FixedWidthField[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    // Extract field value by position (0-indexed)
    const rawValue = line.slice(field.pos, field.pos + field.len);
    const trimmed = rawValue.trim();

    // Convert based on field type
    let value: unknown;

    switch (field.type) {
      case 'integer': {
        const num = parseInt(trimmed, 10);
        value = isNaN(num) ? null : num;
        break;
      }
      case 'number': {
        let num = parseFloat(trimmed);
        if (field.impliedDecimals) {
          num = num / Math.pow(10, field.impliedDecimals);
        }
        value = isNaN(num) ? null : num;
        break;
      }
      case 'date': {
        // Assume YYYYMMDD format, convert to ISO
        if (trimmed.length === 8) {
          const year = trimmed.slice(0, 4);
          const month = trimmed.slice(4, 6);
          const day = trimmed.slice(6, 8);
          value = `${year}-${month}-${day}`;
        } else {
          value = trimmed || null;
        }
        break;
      }
      default:
        value = trimmed || null;
    }

    result[field.name] = value;
  }

  return result;
}
