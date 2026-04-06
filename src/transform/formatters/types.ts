/**
 * ODIN Formatter Types - Shared types for output formatters.
 */

import type { OdinTransform, TransformWarning } from '../../types/transform.js';

/**
 * Options passed to formatter functions.
 */
export interface FormatterOptions {
  transform: OdinTransform;
  onWarning: (warning: TransformWarning) => void;
}

/**
 * Options for value conversion to string.
 */
export interface ValueConversionOptions {
  /** Whether to preserve high-precision numbers as strings */
  preservePrecision?: boolean;
  /** Whether to escape XML special characters */
  xmlEscape?: boolean;
  /** Whether to escape CSV special characters */
  csvEscape?: boolean;
  /** CSV delimiter for escaping detection */
  csvDelimiter?: string;
  /** CSV quote character for escaping */
  csvQuote?: string;
}
