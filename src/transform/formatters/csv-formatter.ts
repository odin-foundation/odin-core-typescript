/**
 * ODIN CSV Formatter - Format OdinDocument as CSV.
 *
 * Converts the canonical ODIN representation to CSV output.
 * Extracted from formatters.ts for single responsibility.
 */

import type { OdinDocument } from '../../types/document.js';
import type { OdinValue } from '../../types/values.js';
import type { OdinTransform } from '../../types/transform.js';
import { csvEscape } from './value-converters.js';

/**
 * Format an OdinValue as a CSV-friendly string, preserving currency decimal places.
 */
function odinValueToCsvString(value: OdinValue): string {
  switch (value.type) {
    case 'null':
      return '';
    case 'currency':
      if (value.raw !== undefined) return value.raw;
      return value.value.toFixed(value.decimalPlaces);
    case 'number':
      if (value.raw !== undefined) return value.raw;
      return String(value.value);
    case 'percent':
      if (value.raw !== undefined) return value.raw;
      return String(value.value);
    case 'date':
    case 'timestamp':
      return value.raw;
    default:
      return 'value' in value ? String(value.value) : '';
  }
}

/**
 * Format OdinDocument as CSV.
 */
export function formatCsvFromOdin(doc: OdinDocument, transform: OdinTransform): string {
  const delimiter = transform.target.delimiter ?? ',';
  const quote = transform.target.quote ?? '"';
  const includeHeader = transform.target.header !== false;

  // Find array paths to export
  const paths = doc.paths();
  const arrayPrefix = findArrayPrefix(paths);

  if (arrayPrefix) {
    return formatArrayAsCsv(doc, arrayPrefix, delimiter, quote, includeHeader, transform);
  }

  // Fallback to object-based conversion
  const output = doc.toJSON();
  return formatCsvFromObject(output, transform);
}

/**
 * Find the array prefix from document paths (e.g., "products" from "products[0].sku").
 */
function findArrayPrefix(paths: string[]): string | null {
  for (const p of paths) {
    const bracketPos = p.indexOf('[');
    if (bracketPos >= 0) {
      return p.substring(0, bracketPos);
    }
  }
  return null;
}

/**
 * Format array data from OdinDocument as CSV, preserving type fidelity.
 */
function formatArrayAsCsv(
  doc: OdinDocument,
  arrayPrefix: string,
  delimiter: string,
  quote: string,
  includeHeader: boolean,
  transform: OdinTransform
): string {
  // Collect rows from array paths
  const rows: Map<number, Map<string, OdinValue>> = new Map();
  const columnSet: string[] = [];

  for (const path of doc.paths()) {
    if (!path.startsWith(arrayPrefix + '[')) continue;
    const match = path.match(/\[(\d+)\]\.(.+)$/);
    if (!match) continue;
    const index = parseInt(match[1]!, 10);
    const field = match[2]!;

    if (!rows.has(index)) {
      rows.set(index, new Map());
    }
    const value = doc.get(path);
    if (value) {
      rows.get(index)!.set(field, value);
    }
    if (!columnSet.includes(field)) {
      columnSet.push(field);
    }
  }

  const lines: string[] = [];

  if (includeHeader) {
    lines.push(columnSet.map((c) => csvEscape(c, quote, delimiter)).join(delimiter));
  }

  const sortedIndices = [...rows.keys()].sort((a, b) => a - b);
  for (const idx of sortedIndices) {
    const row = rows.get(idx)!;
    const values = columnSet.map((col) => {
      const val = row.get(col);
      if (!val) return csvEscape('', quote, delimiter);
      return csvEscape(odinValueToCsvString(val), quote, delimiter);
    });
    lines.push(values.join(delimiter));
  }

  return lines.join(transform.target.lineEnding ?? '\n');
}

/**
 * Format a JavaScript object as CSV.
 */
function formatCsvFromObject(output: Record<string, unknown>, transform: OdinTransform): string {
  const delimiter = transform.target.delimiter ?? ',';
  const quote = transform.target.quote ?? '"';
  const includeHeader = transform.target.header !== false;

  // Find array data to export
  let rows: Record<string, unknown>[] = [];
  for (const value of Object.values(output)) {
    if (Array.isArray(value)) {
      rows = value as Record<string, unknown>[];
      break;
    }
  }

  if (rows.length === 0) {
    rows = [output];
  }

  // Get columns from first row
  const columns = Object.keys(rows[0] ?? {});

  const lines: string[] = [];

  if (includeHeader) {
    lines.push(columns.map((c) => csvEscape(c, quote, delimiter)).join(delimiter));
  }

  for (const row of rows) {
    const values = columns.map((col) => {
      const val = row[col];
      return csvEscape(val === null || val === undefined ? '' : String(val), quote, delimiter);
    });
    lines.push(values.join(delimiter));
  }

  return lines.join(transform.target.lineEnding ?? '\n');
}
