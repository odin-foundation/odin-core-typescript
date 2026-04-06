/**
 * Diff types for ODIN document comparison.
 */

import type { OdinValue } from './values.js';

/**
 * Difference between two ODIN documents.
 */
export interface OdinDiff {
  /**
   * Paths added in the new document.
   */
  readonly additions: PathValue[];

  /**
   * Paths removed from the original document.
   */
  readonly deletions: PathValue[];

  /**
   * Paths with changed values.
   */
  readonly modifications: PathChange[];

  /**
   * Paths that moved (e.g., array reordering).
   */
  readonly moves: PathMove[];

  /**
   * Whether there are any changes.
   */
  readonly isEmpty: boolean;
}

/**
 * A path and its value.
 */
export interface PathValue {
  /**
   * Full path.
   */
  readonly path: string;

  /**
   * Value at path.
   */
  readonly value: OdinValue;
}

/**
 * A path with old and new values.
 */
export interface PathChange {
  /**
   * Full path.
   */
  readonly path: string;

  /**
   * Original value.
   */
  readonly oldValue: OdinValue;

  /**
   * New value.
   */
  readonly newValue: OdinValue;
}

/**
 * A path that moved from one location to another.
 */
export interface PathMove {
  /**
   * Original path.
   */
  readonly fromPath: string;

  /**
   * New path.
   */
  readonly toPath: string;
}
