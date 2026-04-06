/**
 * ODIN Transform Source Parser Types
 *
 * Shared types and interfaces for all source parsers.
 */

import type { SourceConfig } from '../../types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Source Parser Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedSource {
  /** Parsed data as JavaScript object/array */
  data: unknown;

  /** Original raw input (for discriminator extraction) */
  raw: string;
}

export interface SourceParserOptions {
  /** Source configuration from transform */
  config?: SourceConfig | undefined;

  /** CSV delimiter (default: ',') */
  delimiter?: string | undefined;

  /** CSV quote character (default: '"') */
  quote?: string | undefined;

  /** Whether CSV has header row (default: true) */
  hasHeader?: boolean | undefined;

  /** Fixed-width field definitions for single-record parsing */
  fields?: FixedWidthField[] | undefined;

  /** XML namespace mappings */
  namespaces?: Map<string, string> | undefined;
}

export interface FixedWidthField {
  name: string;
  pos: number;
  len: number;
  type?: 'string' | 'integer' | 'number' | 'date';
  /** Implied decimal places (e.g., 2 means divide by 100) */
  impliedDecimals?: number;
}
