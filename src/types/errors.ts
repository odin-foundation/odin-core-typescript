/**
 * Error types for ODIN.
 */

/**
 * Base error for all ODIN operations.
 */
export class OdinError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OdinError';
  }
}

/**
 * Error during parsing.
 */
export class ParseError extends OdinError {
  constructor(
    message: string,
    code: string,
    public readonly line: number,
    public readonly column: number,
    context?: Record<string, unknown>
  ) {
    super(`${message} at line ${line}, column ${column}`, code, {
      ...context,
      line,
      column,
    });
    this.name = 'ParseError';
  }
}

/**
 * Error during patching.
 */
export class PatchError extends OdinError {
  constructor(message: string, path: string) {
    super(message, 'PATCH_ERROR', { path });
    this.name = 'PatchError';
  }
}

/**
 * Validation error type for use in ValidationResult.
 */
export interface ValidationErrorType {
  path: string;
  code: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
  schemaPath?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Codes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse error codes (P001-P099).
 */
export const ParseErrorCodes = {
  P001: 'Unexpected character',
  P002: 'Invalid path segment',
  P003: 'Invalid array index',
  P004: 'Unterminated string',
  P005: 'Invalid escape sequence',
  P006: 'Invalid type prefix',
  P007: 'Duplicate path assignment',
  P008: 'Invalid header syntax',
  P009: 'Invalid directive',
  P010: 'Maximum depth exceeded',
  P011: 'Maximum document size exceeded',
  P012: 'Invalid UTF-8 sequence',
  P013: 'Non-contiguous array indices',
  P014: 'Empty document',
  P015: 'Array index out of range',
} as const;

/**
 * Validation error codes (V001-V099).
 */
export const ValidationErrorCodes = {
  V001: 'Required field missing',
  V002: 'Type mismatch',
  V003: 'Value out of bounds',
  V004: 'Pattern mismatch',
  V005: 'Invalid enum value',
  V006: 'Array length violation',
  V007: 'Unique constraint violation',
  V008: 'Invariant violation',
  V009: 'Cardinality constraint violation',
  V010: 'Conditional requirement not met',
  V011: 'Unknown field',
  V012: 'Circular reference',
  V013: 'Unresolved reference',
} as const;

export type ParseErrorCode = keyof typeof ParseErrorCodes;
export type ValidationErrorCode = keyof typeof ValidationErrorCodes;
