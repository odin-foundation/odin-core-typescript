/**
 * Document types for ODIN.
 */

import type { OdinValue, OdinModifiers } from './values.js';

/**
 * Import directive parsed from @import statement.
 */
export interface OdinImport {
  /** Import path (relative, absolute, or URL) */
  readonly path: string;
  /** Optional alias for namespacing imported content */
  readonly alias?: string;
  /** Source line number */
  readonly line: number;
}

/**
 * Schema directive parsed from @schema statement.
 */
export interface OdinSchema {
  /** Schema URL */
  readonly url: string;
  /** Source line number */
  readonly line: number;
}

/**
 * Conditional directive parsed from @if statement.
 */
export interface OdinConditional {
  /** Condition expression */
  readonly condition: string;
  /** Source line number */
  readonly line: number;
}

/**
 * Represents a parsed ODIN document.
 *
 * Documents are immutable - all mutation methods return new documents.
 */
export interface OdinDocument {
  /**
   * Document metadata from {$} header.
   */
  readonly metadata: ReadonlyMap<string, OdinValue>;

  /**
   * All path assignments in the document.
   */
  readonly assignments: ReadonlyMap<string, OdinValue>;

  /**
   * Modifiers (required, confidential, deprecated) per path.
   */
  readonly modifiers: ReadonlyMap<string, OdinModifiers>;

  /**
   * Import directives from @import statements.
   * Note: The parser extracts import metadata but does not resolve imports.
   * Import resolution is handled by the application layer.
   */
  readonly imports: readonly OdinImport[];

  /**
   * Schema directives from @schema statements.
   * Note: The parser extracts schema URLs but does not load or validate schemas.
   * Schema resolution is handled by the application layer.
   */
  readonly schemas: readonly OdinSchema[];

  /**
   * Conditional directives from @if statements.
   *
   * Design Decision: The parser extracts @if conditions and stores them as
   * metadata but does NOT evaluate them. Condition evaluation is delegated
   * to the application layer. This provides flexibility for:
   * - Different evaluation strategies (compile-time, runtime, external context)
   * - Consuming systems to evaluate based on their specific requirements
   * - Conditions that reference external data not available at parse time
   *
   * See ODIN 1.0 Specification, Section "Conditional Directive" for details.
   */
  readonly conditionals: readonly OdinConditional[];

  /**
   * Get value at path.
   *
   * @param path - Dot-separated path (e.g., "policy.vehicles[0].vin")
   * @returns Value at path, or undefined if not found
   */
  get(path: string): OdinValue | undefined;

  /**
   * Get value at path as string.
   *
   * @param path - Dot-separated path
   * @returns String value
   * @throws If path not found or value is not a string
   */
  getString(path: string): string;

  /**
   * Get value at path as number.
   *
   * @param path - Dot-separated path
   * @returns Number value
   * @throws If path not found or value is not numeric
   */
  getNumber(path: string): number;

  /**
   * Get value at path as integer.
   *
   * @param path - Dot-separated path
   * @returns Integer value
   * @throws If path not found or value is not an integer
   */
  getInteger(path: string): number;

  /**
   * Get value at path as boolean.
   *
   * @param path - Dot-separated path
   * @returns Boolean value
   * @throws If path not found or value is not a boolean
   */
  getBoolean(path: string): boolean;

  /**
   * Check if path exists in document.
   *
   * @param path - Dot-separated path
   * @returns True if path exists
   */
  has(path: string): boolean;

  /**
   * Resolve reference at path.
   *
   * If value at path is an OdinReference, follows it and returns the target value.
   * Otherwise returns the value directly.
   *
   * @param path - Dot-separated path
   * @returns Resolved value
   * @throws If reference cannot be resolved
   */
  resolve(path: string): OdinValue | undefined;

  /**
   * Create new document with value set at path.
   *
   * @param path - Dot-separated path
   * @param value - Value to set
   * @returns New document with value set
   */
  with(path: string, value: OdinValue): OdinDocument;

  /**
   * Create new document with path removed.
   *
   * @param path - Dot-separated path
   * @returns New document with path removed
   */
  without(path: string): OdinDocument;

  /**
   * List all paths in document.
   *
   * @returns Array of all paths
   */
  paths(): string[];

  /**
   * Flatten document to key-value pairs.
   *
   * Returns all paths and their values as strings, useful for diagnostics
   * and debugging. Values are formatted without ODIN type prefixes.
   *
   * @param options - Optional settings for flattening
   * @returns Map of path to string value
   *
   * @example
   * ```typescript
   * const doc = Odin.parse(`
   *   {policy}
   *   number = "PAP-2024-001"
   *   premium = #$747.50
   * `);
   *
   * const flat = doc.flatten();
   * // Map {
   * //   'policy.number' => 'PAP-2024-001',
   * //   'policy.premium' => '747.50'
   * // }
   *
   * // Include metadata
   * const withMeta = doc.flatten({ includeMetadata: true });
   * ```
   */
  flatten(options?: FlattenOptions): Map<string, string>;

  /**
   * Convert to JSON-compatible object.
   */
  toJSON(): Record<string, unknown>;

}

/**
 * Builder for constructing ODIN documents.
 *
 * @example
 * ```typescript
 * const doc = new OdinDocumentBuilder()
 *   .metadata('odin', '1.0.0')
 *   .metadata('id', 'doc_123')
 *   .set('policy.number', 'PAP-2024-001')
 *   .set('policy.premium', { type: 'currency', value: 747.50 })
 *   .build();
 * ```
 */
export interface OdinDocumentBuilder {
  /**
   * Set document metadata.
   *
   * @param key - Metadata key
   * @param value - Metadata value
   * @returns This builder for chaining
   */
  metadata(key: string, value: OdinValue | string | number | boolean): this;

  /**
   * Set value at path.
   *
   * @param path - Dot-separated path
   * @param value - Value to set
   * @returns This builder for chaining
   */
  set(path: string, value: OdinValue | string | number | boolean | null): this;

  /**
   * Set value with modifiers.
   *
   * @param path - Dot-separated path
   * @param value - Value to set
   * @param modifiers - Modifiers to apply
   * @returns This builder for chaining
   */
  setWithModifiers(
    path: string,
    value: OdinValue | string | number | boolean | null,
    modifiers: Partial<OdinModifiers>
  ): this;

  /**
   * Build the document.
   *
   * @returns Immutable document
   * @throws If document is invalid (e.g., non-contiguous arrays)
   */
  build(): OdinDocument;
}

/**
 * Metadata about a document (from {$} header).
 */
export interface OdinMetadata {
  odin?: string;
  id?: string;
  created?: Date;
  source?: {
    format?: string;
    version?: string;
  };
  hash?: Uint8Array;
  signature?: Uint8Array;
}

/**
 * Options for flattening a document.
 */
export interface FlattenOptions {
  /**
   * Include metadata paths ($.xxx) in output.
   * @default false
   */
  includeMetadata?: boolean;

  /**
   * Include null values in output.
   * @default false
   */
  includeNulls?: boolean;

  /**
   * Sort paths alphabetically.
   * @default true
   */
  sort?: boolean;
}

/**
 * Represents a header in the document.
 */
export interface OdinHeader {
  /**
   * Path this header sets as context.
   */
  path: string;

  /**
   * Whether this is a tabular header.
   */
  tabular: boolean;

  /**
   * Column names if tabular.
   */
  columns?: string[];

  /**
   * Line number in source.
   */
  line: number;
}
