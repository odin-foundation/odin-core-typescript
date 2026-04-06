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
