/**
 * ODIN Transform Core Verbs
 *
 * Essential verbs for basic transformations: concat, upper, lower, trim,
 * coalesce, ifNull, ifEmpty, ifElse, lookup.
 */

import type { VerbFunction } from '../../types/transform.js';
import { toString, toBoolean, isNull, isEmpty, str, nil } from './helpers.js';

/**
 * %concat @p1 "sep" @p2 ... - Concatenate values
 */
export const concat: VerbFunction = (args) => {
  const result = args.map(toString).join('');
  return str(result);
};

/**
 * %upper @path - Convert to uppercase
 */
export const upper: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return str(toString(args[0]!).toUpperCase());
};

/**
 * %lower @path - Convert to lowercase
 */
export const lower: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return str(toString(args[0]!).toLowerCase());
};

/**
 * %trim @path - Remove leading/trailing whitespace
 */
export const trim: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return str(toString(args[0]!).trim());
};

/**
 * %trimLeft @path - Remove leading whitespace
 */
export const trimLeft: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return str(toString(args[0]!).trimStart());
};

/**
 * %trimRight @path - Remove trailing whitespace
 */
export const trimRight: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return str(toString(args[0]!).trimEnd());
};

/**
 * %coalesce @p1 @p2 @p3 ... - First non-null value
 */
export const coalesce: VerbFunction = (args) => {
  for (const arg of args) {
    if (!isNull(arg)) {
      return arg;
    }
  }
  return nil();
};

/**
 * %ifNull @path @fallback - Fallback if null
 */
export const ifNull: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  return isNull(args[0]!) ? args[1]! : args[0]!;
};

/**
 * %ifEmpty @path @fallback - Fallback if empty string
 */
export const ifEmpty: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  return isEmpty(args[0]!) ? args[1]! : args[0]!;
};

/**
 * %ifElse @condition @then @else - Conditional value
 */
export const ifElse: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  return toBoolean(args[0]!) ? args[1]! : args[2]!;
};

/**
 * %lookup TABLE.column @.match_col1 [@.match_col2 ...] - Lookup table value
 *
 * New syntax: TABLE.column specifies which column to return.
 * Match values are compared against columns in order (excluding return column).
 *
 * @example
 * ```odin
 * {$table.RATE[vehicle_type, coverage, base, factor]}
 * sedan, liability, ##250, #1.15
 *
 * ; Get base for sedan+liability
 * base = "%lookup RATE.base @.vehicle_type @.coverage"
 *
 * ; Get vehicle_type where base = 250 (reverse lookup - same syntax!)
 * vehicle = "%lookup RATE.vehicle_type @.base"
 * ```
 */
export const lookup: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const tableRef = toString(args[0]!);

  // Parse TABLE.column syntax
  const dotIndex = tableRef.indexOf('.');
  if (dotIndex === -1) {
    // Legacy format without column - return null (or could handle differently)
    return nil();
  }

  const tableName = tableRef.slice(0, dotIndex);
  const returnColumn = tableRef.slice(dotIndex + 1);

  const table = context.tables.get(tableName);
  if (!table) return nil();

  // Find the return column index
  const returnColIndex = table.columns.indexOf(returnColumn);
  if (returnColIndex === -1) return nil();

  // Get match values
  const matchValues = args.slice(1).map(toString);

  // Build list of match column indices (all columns except return column)
  const matchColIndices = table.columns
    .map((_, idx) => idx)
    .filter((idx) => idx !== returnColIndex);

  // Find matching row
  for (const row of table.rows) {
    let matches = true;

    // Compare each match value against corresponding column
    for (let i = 0; i < matchValues.length && i < matchColIndices.length; i++) {
      const colIdx = matchColIndices[i]!;
      const rowValue = row[colIdx];
      if (rowValue && toString(rowValue) !== matchValues[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return row[returnColIndex] ?? nil();
    }
  }

  return nil();
};

/**
 * %lookupDefault TABLE.column @.match_col1 [...] "default" - Lookup with fallback
 *
 * Same as %lookup but returns default value if no match found.
 */
export const lookupDefault: VerbFunction = (args, context) => {
  if (args.length < 3) return nil();

  const tableRef = toString(args[0]!);
  const defaultVal = args[args.length - 1]!;

  // Parse TABLE.column syntax
  const dotIndex = tableRef.indexOf('.');
  if (dotIndex === -1) return defaultVal;

  const tableName = tableRef.slice(0, dotIndex);
  const returnColumn = tableRef.slice(dotIndex + 1);

  const table = context.tables.get(tableName);
  if (!table) return defaultVal;

  // Find the return column index
  const returnColIndex = table.columns.indexOf(returnColumn);
  if (returnColIndex === -1) return defaultVal;

  // Get match values (excluding table ref and default)
  const matchValues = args.slice(1, -1).map(toString);

  // Build list of match column indices (all columns except return column)
  const matchColIndices = table.columns
    .map((_, idx) => idx)
    .filter((idx) => idx !== returnColIndex);

  // Find matching row
  for (const row of table.rows) {
    let matches = true;

    for (let i = 0; i < matchValues.length && i < matchColIndices.length; i++) {
      const colIdx = matchColIndices[i]!;
      const rowValue = row[colIdx];
      if (rowValue && toString(rowValue) !== matchValues[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return row[returnColIndex] ?? defaultVal;
    }
  }

  return defaultVal;
};
