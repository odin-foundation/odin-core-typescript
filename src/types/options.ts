/**
 * Options types for ODIN operations.
 */

import type { OdinValue } from './values.js';

// ─────────────────────────────────────────────────────────────────────────────
// Parser Configuration Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default maximum document size in bytes (100MB) */
export const DEFAULT_MAX_DOCUMENT_SIZE = 100 * 1024 * 1024;

/** Default maximum nesting depth for paths */
export const DEFAULT_MAX_NESTING_DEPTH = 64;

/**
 * Options for parsing ODIN text.
 */
export interface ParseOptions {
  /**
   * Continue parsing after errors (collect all errors).
   * @default false
   */
  continueOnError?: boolean;

  /**
   * Preserve comments for round-trip.
   * @default false
   */
  preserveComments?: boolean;

  /**
   * Preserve original whitespace/formatting.
   * @default false
   */
  preserveWhitespace?: boolean;

  /**
   * Maximum document size in bytes.
   * @default 104857600 (100MB)
   */
  maxDocumentSize?: number;

  /**
   * Maximum nesting depth.
   * @default 64
   */
  maxNestingDepth?: number;
}

/**
 * Options for serializing to ODIN text.
 */
export interface StringifyOptions {
  /**
   * Human-readable formatting with headers.
   * @default false
   */
  pretty?: boolean;

  /**
   * Line ending style.
   * @default '\n'
   */
  lineEnding?: string;

  /**
   * Include preserved comments.
   * @default true
   */
  includeComments?: boolean;

  /**
   * Sort paths alphabetically.
   * @default false
   */
  sortPaths?: boolean;

  /**
   * Use headers to group assignments.
   * @default true
   */
  useHeaders?: boolean;

  /**
   * Use tabular syntax for eligible arrays.
   * Arrays are eligible if they contain objects with only primitive fields
   * (no nested objects or arrays) and all items have the same fields.
   * Significantly reduces file size.
   * @default true
   */
  useTabular?: boolean;

  /**
   * Indentation for pretty mode.
   * @default '  '
   */
  indent?: string;
}

/**
 * Options for validation.
 */
export interface ValidateOptions {
  /**
   * Stop on first error.
   * @default false
   */
  failFast?: boolean;

  /**
   * Treat unknown fields as errors.
   * @default false
   */
  strict?: boolean;

  /**
   * Include warnings in result.
   * @default true
   */
  includeWarnings?: boolean;
}

/**
 * Handler for streaming parse events.
 *
 * **Important:** Handler callbacks should not throw exceptions. If a callback
 * throws, the error will propagate and interrupt streaming. Use `onError` to
 * handle parse errors gracefully. If your handlers need error handling, wrap
 * their bodies in try-catch and report errors through your own mechanism.
 */
export interface ParseHandler {
  /**
   * Called when a new document starts.
   */
  onDocumentStart?(): void;

  /**
   * Called when a header is encountered.
   */
  onHeader?(path: string): void;

  /**
   * Called for each assignment.
   */
  onAssignment?(path: string, value: OdinValue): void;

  /**
   * Called when a document ends.
   */
  onDocumentEnd?(): void;

  /**
   * Called on parse error.
   */
  onError?(error: Error): void;
}
