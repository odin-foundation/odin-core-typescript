/**
 * ODIN Transform Engine Types - Exported types for transform engine module.
 * @module
 */

import type { VerbRegistry } from '../types/transform.js';

/**
 * Transform engine options
 */
export interface TransformOptions {
  /** Custom verb registry */
  verbRegistry?: VerbRegistry;
  /** Enable strict type checking for verb arguments */
  strictTypes?: boolean;
  /**
   * Resolves an @import path to ODIN transform text. Imported lookup tables,
   * constants, accumulators, and named segments are merged into the transform
   * before execution. Returning undefined leaves that import unresolved.
   */
  importResolver?: (path: string) => string | undefined;
}

/**
 * Multi-record input for discriminator-based routing
 */
export interface MultiRecordInput {
  /** Input records (lines for fixed-width, rows for delimited, etc.) */
  records: string[];
  /** Delimiter for delimited format */
  delimiter?: string;
}
