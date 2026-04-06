/**
 * ODIN Transform CSV Parser
 *
 * Parse CSV/delimited text to array of objects with features:
 * - Configurable delimiter (default: comma)
 * - Configurable quote character (default: double quote)
 * - Header row detection
 * - Quoted field handling (with escaped quotes)
 * - Multi-line field support
 */

import type { SourceParserOptions } from './types.js';
import { SECURITY_LIMITS } from '../../utils/security-limits.js';

/**
 * Parse CSV/delimited text to array of objects.
 */
export function parseCsv(input: string, options?: SourceParserOptions): Record<string, unknown>[] {
  const delimiter = options?.delimiter ?? ',';
  const quote = options?.quote ?? '"';
  const hasHeader = options?.hasHeader !== false;

  const lines = parseCsvLines(input, delimiter, quote);

  if (lines.length === 0) {
    return [];
  }

  // Get column names from header or generate them
  let columns: string[];
  let dataStartIndex: number;

  if (hasHeader && lines.length > 0) {
    columns = lines[0]!;
    dataStartIndex = 1;
  } else {
    // Generate column names: col0, col1, col2, ...
    columns = lines[0]!.map((_, i) => `col${i}`);
    dataStartIndex = 0;
  }

  // Convert remaining lines to objects
  const result: Record<string, unknown>[] = [];
  for (let i = dataStartIndex; i < lines.length; i++) {
    const row = lines[i]!;
    const obj: Record<string, unknown> = {};

    for (let j = 0; j < columns.length; j++) {
      const value = row[j] ?? '';
      obj[columns[j]!] = inferCsvValue(value);
    }

    result.push(obj);
  }

  return result;
}

/**
 * Parse CSV into array of string arrays (one per line).
 */
function parseCsvLines(input: string, delimiter: string, quote: string): string[][] {
  const result: string[][] = [];
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    const { row, endPos } = parseCsvRow(input, pos, delimiter, quote);
    result.push(row);
    pos = endPos;

    // Skip line ending
    if (input[pos] === '\r') pos++;
    if (input[pos] === '\n') pos++;
  }

  return result;
}

/**
 * Parse a single CSV row.
 */
function parseCsvRow(
  input: string,
  startPos: number,
  delimiter: string,
  quote: string
): { row: string[]; endPos: number } {
  const row: string[] = [];
  let pos = startPos;
  const len = input.length;

  while (pos < len) {
    // Security: Check column count to prevent resource exhaustion
    if (row.length >= SECURITY_LIMITS.MAX_CSV_COLUMNS) {
      throw new Error(
        `CSV column count ${row.length + 1} exceeds maximum allowed columns of ${SECURITY_LIMITS.MAX_CSV_COLUMNS}`
      );
    }

    // Check for end of line
    if (input[pos] === '\r' || input[pos] === '\n') {
      break;
    }

    // Parse field
    const { value, endPos } = parseCsvField(input, pos, delimiter, quote);
    row.push(value);
    pos = endPos;

    // Check for delimiter or end of line
    if (input[pos] === delimiter) {
      pos++; // Skip delimiter
    } else {
      break;
    }
  }

  return { row, endPos: pos };
}

/**
 * Parse a single CSV field.
 */
function parseCsvField(
  input: string,
  startPos: number,
  delimiter: string,
  quote: string
): { value: string; endPos: number } {
  let pos = startPos;
  const len = input.length;

  // Check for quoted field
  if (input[pos] === quote) {
    pos++; // Skip opening quote
    let value = '';

    while (pos < len) {
      if (input[pos] === quote) {
        // Check for escaped quote (doubled)
        if (input[pos + 1] === quote) {
          value += quote;
          pos += 2;
        } else {
          // End of quoted field
          pos++; // Skip closing quote
          break;
        }
      } else {
        value += input[pos];
        pos++;
      }
    }

    return { value, endPos: pos };
  }

  // Unquoted field - read until delimiter or end of line
  let value = '';
  while (pos < len && input[pos] !== delimiter && input[pos] !== '\r' && input[pos] !== '\n') {
    value += input[pos];
    pos++;
  }

  return { value: value.trim(), endPos: pos };
}

/**
 * Infer value type from CSV string.
 */
function inferCsvValue(value: string): unknown {
  if (value === '') return null;

  // Check for boolean
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  // Check for number
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d*\.\d+$/.test(value)) {
    return parseFloat(value);
  }

  // Return as string
  return value;
}
