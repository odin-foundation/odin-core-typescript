/**
 * ODIN Transform Error Codes
 *
 * Standardized error codes (T001-T010) for transform operations.
 * These codes are consistent across all ODIN implementations.
 */

import type { TransformError, TransformWarning } from '../types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Error Code Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform error codes as defined in the ODIN specification.
 *
 * T001-T010 are reserved for core transform errors.
 * Higher codes (T011+) can be used for implementation-specific errors.
 */
export const TransformErrorCodes = {
  /** Unknown verb - the specified verb does not exist */
  T001_UNKNOWN_VERB: 'T001',

  /** Invalid verb arguments - wrong number or type of arguments */
  T002_INVALID_VERB_ARGS: 'T002',

  /** Lookup table not found - referenced table doesn't exist */
  T003_LOOKUP_TABLE_NOT_FOUND: 'T003',

  /** Lookup key not found - key doesn't exist in table */
  T004_LOOKUP_KEY_NOT_FOUND: 'T004',

  /** Source path not found - cannot resolve source path */
  T005_SOURCE_PATH_NOT_FOUND: 'T005',

  /** Invalid output format - unsupported or misconfigured format */
  T006_INVALID_OUTPUT_FORMAT: 'T006',

  /** Invalid modifier for format - modifier not applicable to target format */
  T007_INVALID_MODIFIER: 'T007',

  /** Accumulator overflow - accumulator value exceeds limits */
  T008_ACCUMULATOR_OVERFLOW: 'T008',

  /** Loop source not array - :loop directive target is not an array */
  T009_LOOP_SOURCE_NOT_ARRAY: 'T009',

  /** Position/length exceeds line width - fixed-width field extends past line */
  T010_POSITION_OVERFLOW: 'T010',

  /** Incompatible or unknown conversion target */
  T011_INCOMPATIBLE_CONVERSION: 'T011',

  /** Conditional branch (elif/else) with no preceding if */
  T012_DANGLING_BRANCH: 'T012',

  /** Field value failed a :validate / :enum / :range constraint */
  T013_VALIDATION_FAILED: 'T013',

  /** Nested ${...} interpolation inside a literal block */
  T014_NESTED_INTERPOLATION: 'T014',

  /** Invalid %expr formula - cannot compile to a verb tree */
  T015_INVALID_EXPRESSION: 'T015',

  /** Transform fuel budget exceeded */
  T016_TRANSFORM_BUDGET_EXCEEDED: 'T016',

  /** Transform wall-clock timeout exceeded */
  T017_TRANSFORM_TIMEOUT_EXCEEDED: 'T017',

  /** Expression evaluation depth exceeded */
  T018_EXPRESSION_DEPTH_EXCEEDED: 'T018',

  // Extended codes (implementation-specific)

  /** Configuration error - transform document is misconfigured */
  CONFIG_ERROR: 'CONFIG_ERROR',

  /** Unknown record type - discriminator value has no matching segment */
  UNKNOWN_RECORD_TYPE: 'UNKNOWN_RECORD_TYPE',

  /** Transform execution error - general runtime error */
  TRANSFORM_ERROR: 'TRANSFORM_ERROR',

  /** Required field is missing */
  SOURCE_MISSING: 'SOURCE_MISSING',

  /** Value overflow - value exceeds field capacity */
  VALUE_OVERFLOW: 'VALUE_OVERFLOW',
} as const;

export type TransformErrorCode = (typeof TransformErrorCodes)[keyof typeof TransformErrorCodes];

// ─────────────────────────────────────────────────────────────────────────────
// Special Error Classes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error thrown when strict type validation fails.
 * This error type is not caught by the general transform error handler,
 * ensuring strict mode violations always propagate.
 */
export class TypeValidationError extends Error {
  readonly code = TransformErrorCodes.T002_INVALID_VERB_ARGS;

  constructor(
    public readonly verb: string,
    public readonly errors: string[]
  ) {
    super(`Type error in %${verb}: ${errors.join('; ')}`);
    this.name = 'TypeValidationError';
  }
}

/**
 * Error carrying a stable transform error code thrown during expression
 * evaluation. The engine's mapping handler reads `.transformError` to preserve
 * the code instead of collapsing it to TRANSFORM_ERROR.
 */
export class CodedTransformError extends Error {
  constructor(public readonly transformError: TransformError) {
    super(transformError.message);
    this.name = 'CodedTransformError';
  }
}

/**
 * Execution guard abort (fuel, timeout, or depth). Not downgraded by the onError
 * policy; the execute boundary surfaces `.transformError` as a failed result.
 */
export class TransformAbortError extends Error {
  constructor(public readonly transformError: TransformError) {
    super(transformError.message);
    this.name = 'TransformAbortError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Factory Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a T001 Unknown Verb error.
 */
export function unknownVerbError(verb: string, field?: string): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T001_UNKNOWN_VERB,
    message: `Unknown verb: ${verb}`,
  };
  if (field !== undefined) error.field = field;
  return error;
}

/**
 * Create a T002 Invalid Verb Arguments error.
 */
export function invalidVerbArgsError(
  verb: string,
  expected: string,
  actual: number,
  field?: string
): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T002_INVALID_VERB_ARGS,
    message: `Invalid arguments for verb '${verb}': expected ${expected}, got ${actual}`,
  };
  if (field !== undefined) error.field = field;
  return error;
}

/**
 * Create a T012 Dangling Branch error (elif/else without a preceding if).
 */
export function danglingBranchError(directive: string, segment?: string): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T012_DANGLING_BRANCH,
    message: `'${directive}' segment has no preceding 'if'`,
  };
  if (segment !== undefined) error.segment = segment;
  return error;
}

/**
 * Create a T014 Nested Interpolation error.
 */
export function nestedInterpolationError(expr: string, segment?: string): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T014_NESTED_INTERPOLATION,
    message: `Nested interpolation is not allowed: \${${expr}}`,
  };
  if (segment !== undefined) error.segment = segment;
  return error;
}

/**
 * Create a T003 Lookup Table Not Found error.
 */
export function lookupTableNotFoundError(tableName: string, field?: string): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T003_LOOKUP_TABLE_NOT_FOUND,
    message: `Lookup table not found: ${tableName}`,
  };
  if (field !== undefined) error.field = field;
  return error;
}

/**
 * Create a T004 Lookup Key Not Found error/warning.
 */
export function lookupKeyNotFoundError(
  tableName: string,
  key: string,
  field?: string
): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T004_LOOKUP_KEY_NOT_FOUND,
    message: `Lookup key '${key}' not found in table '${tableName}'`,
  };
  if (field !== undefined) error.field = field;
  return error;
}

/**
 * Create a T004 Lookup Key Not Found warning (for warn mode).
 */
export function lookupKeyNotFoundWarning(
  tableName: string,
  key: string,
  field?: string
): TransformWarning {
  const warning: TransformWarning = {
    code: TransformErrorCodes.T004_LOOKUP_KEY_NOT_FOUND,
    message: `Lookup key '${key}' not found in table '${tableName}'`,
  };
  if (field !== undefined) warning.field = field;
  return warning;
}

/**
 * Create a T005 Source Path Not Found error.
 */
export function sourcePathNotFoundError(path: string, field?: string): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T005_SOURCE_PATH_NOT_FOUND,
    message: `Source path not found: ${path}`,
    sourcePath: path,
  };
  if (field !== undefined) error.field = field;
  return error;
}

/**
 * Create a T006 Invalid Output Format error.
 */
export function invalidOutputFormatError(format: string): TransformError {
  return {
    code: TransformErrorCodes.T006_INVALID_OUTPUT_FORMAT,
    message: `Invalid or unsupported output format: ${format}`,
  };
}

/**
 * Create a T007 Invalid Modifier error.
 */
export function invalidModifierError(
  modifier: string,
  format: string,
  field?: string
): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T007_INVALID_MODIFIER,
    message: `Modifier '${modifier}' is not valid for format '${format}'`,
  };
  if (field !== undefined) error.field = field;
  return error;
}

/**
 * Create a T007 Invalid Modifier warning (for warn mode).
 */
export function invalidModifierWarning(
  modifier: string,
  format: string,
  field?: string
): TransformWarning {
  const warning: TransformWarning = {
    code: TransformErrorCodes.T007_INVALID_MODIFIER,
    message: `Modifier ':${modifier}' is not applicable to format '${format}' and will be ignored`,
  };
  if (field !== undefined) warning.field = field;
  return warning;
}

/**
 * Modifiers that are only applicable to specific output formats.
 * Using these modifiers with incompatible formats will generate a warning.
 */
export const FORMAT_SPECIFIC_MODIFIERS: Record<string, string[]> = {
  // Fixed-width only modifiers
  pos: ['fixed-width', 'fwf'],
  len: ['fixed-width', 'fwf'],
  leftPad: ['fixed-width', 'fwf'],
  rightPad: ['fixed-width', 'fwf'],
  truncate: ['fixed-width', 'fwf'],

  // XML only modifiers
  element: ['xml'],
  attr: ['xml'],
  ns: ['xml'],
  cdata: ['xml'],
  omitEmpty: ['xml', 'json'],

  // JSON only modifiers
  raw: ['json'],
};

/**
 * Check if a modifier is compatible with the target format.
 *
 * @param modifier - The modifier name (e.g., 'pos', 'element')
 * @param format - The target format (e.g., 'json', 'xml', 'fixed-width')
 * @returns true if compatible, false if incompatible
 */
export function isModifierCompatible(modifier: string, format: string): boolean {
  const allowedFormats = FORMAT_SPECIFIC_MODIFIERS[modifier];
  if (!allowedFormats) {
    // Modifier is not format-specific, compatible with all
    return true;
  }
  return allowedFormats.includes(format);
}

/**
 * Create a T008 Accumulator Overflow error.
 */
export function accumulatorOverflowError(
  accumulator: string,
  value: number,
  field?: string
): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T008_ACCUMULATOR_OVERFLOW,
    message: `Accumulator '${accumulator}' overflow with value ${value}`,
  };
  if (field !== undefined) error.field = field;
  return error;
}

/**
 * Create a T009 Loop Source Not Array error.
 */
export function loopSourceNotArrayError(path: string, segment?: string): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T009_LOOP_SOURCE_NOT_ARRAY,
    message: `Loop source path '${path}' does not resolve to an array`,
    sourcePath: path,
  };
  if (segment !== undefined) error.segment = segment;
  return error;
}

/**
 * Create a T010 Position Overflow error.
 */
export function positionOverflowError(
  position: number,
  length: number,
  lineWidth: number,
  field?: string
): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T010_POSITION_OVERFLOW,
    message: `Field at position ${position} with length ${length} exceeds line width ${lineWidth}`,
  };
  if (field !== undefined) error.field = field;
  return error;
}

/**
 * Create a T010 Position Overflow warning (for warn mode).
 */
export function positionOverflowWarning(
  position: number,
  length: number,
  lineWidth: number,
  field?: string
): TransformWarning {
  const warning: TransformWarning = {
    code: TransformErrorCodes.T010_POSITION_OVERFLOW,
    message: `Field at position ${position} with length ${length} exceeds line width ${lineWidth}`,
  };
  if (field !== undefined) warning.field = field;
  return warning;
}

/**
 * Create a T016 Transform Budget Exceeded error.
 */
export function budgetExceededError(limit: number): TransformError {
  return {
    code: TransformErrorCodes.T016_TRANSFORM_BUDGET_EXCEEDED,
    message: `Transform fuel budget exceeded (limit ${limit})`,
  };
}

/**
 * Create a T017 Transform Timeout Exceeded error.
 */
export function timeoutExceededError(limitMs: number): TransformError {
  return {
    code: TransformErrorCodes.T017_TRANSFORM_TIMEOUT_EXCEEDED,
    message: `Transform timeout exceeded (limit ${limitMs}ms)`,
  };
}

/**
 * Create a T018 Expression Depth Exceeded error.
 */
export function expressionDepthExceededError(limit: number): TransformError {
  return {
    code: TransformErrorCodes.T018_EXPRESSION_DEPTH_EXCEEDED,
    message: `Expression evaluation depth exceeded (limit ${limit})`,
  };
}

/**
 * Create a T011 Incompatible Conversion error.
 */
export function incompatibleConversionError(
  verb: string,
  detail: string,
  field?: string
): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T011_INCOMPATIBLE_CONVERSION,
    message: `Incompatible conversion in '${verb}': ${detail}`,
  };
  if (field !== undefined) error.field = field;
  return error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extended Error Factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a configuration error.
 */
export function configError(message: string): TransformError {
  return {
    code: TransformErrorCodes.CONFIG_ERROR,
    message,
  };
}

/**
 * Create an unknown record type error.
 */
export function unknownRecordTypeError(
  discriminatorValue: string,
  recordIndex: number
): TransformError {
  return {
    code: TransformErrorCodes.UNKNOWN_RECORD_TYPE,
    message: `No segment matches discriminator value '${discriminatorValue}' at record ${recordIndex}`,
  };
}

/**
 * Create an unknown record type warning.
 */
export function unknownRecordTypeWarning(
  discriminatorValue: string,
  recordIndex: number
): TransformWarning {
  return {
    code: TransformErrorCodes.UNKNOWN_RECORD_TYPE,
    message: `No segment matches discriminator value '${discriminatorValue}' at record ${recordIndex}`,
  };
}

/**
 * Create a source missing (required field) error.
 */
export function sourceMissingError(field: string): TransformError {
  return {
    code: TransformErrorCodes.SOURCE_MISSING,
    message: `Required field '${field}' is missing or null`,
    field,
  };
}

/**
 * Create a value overflow warning.
 */
export function valueOverflowWarning(
  value: string,
  length: number,
  field?: string
): TransformWarning {
  const warning: TransformWarning = {
    code: TransformErrorCodes.VALUE_OVERFLOW,
    message: `Value '${value}' exceeds field length ${length}`,
  };
  if (field !== undefined) warning.field = field;
  return warning;
}

/**
 * Create a general transform error.
 */
export function transformError(message: string, field?: string): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.TRANSFORM_ERROR,
    message,
  };
  if (field !== undefined) error.field = field;
  return error;
}

/**
 * Create a general transform warning.
 */
export function transformWarning(message: string, field?: string): TransformWarning {
  const warning: TransformWarning = {
    code: TransformErrorCodes.TRANSFORM_ERROR,
    message,
  };
  if (field !== undefined) warning.field = field;
  return warning;
}

/**
 * Create a validation failure error (T013).
 */
export function validationError(message: string, field?: string): TransformError {
  const error: TransformError = {
    code: TransformErrorCodes.T013_VALIDATION_FAILED,
    message,
  };
  if (field !== undefined) error.field = field;
  return error;
}

/**
 * Create a validation failure warning (T013).
 */
export function validationWarning(message: string, field?: string): TransformWarning {
  const warning: TransformWarning = {
    code: TransformErrorCodes.T013_VALIDATION_FAILED,
    message,
  };
  if (field !== undefined) warning.field = field;
  return warning;
}
