/**
 * ODIN Transform Types
 *
 * Type definitions for ODIN Transform 1.0 specification.
 * Transforms define mappings between ODIN documents and external formats.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Transform Document Structure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A complete transform document
 */
export interface OdinTransform {
  /** Transform metadata */
  metadata: TransformMetadata;

  /** Source format configuration */
  source?: SourceConfig | undefined;

  /** Target format configuration */
  target: TargetConfig;

  /** Document-level constants */
  constants: Map<string, TransformValue>;

  /** Accumulator definitions */
  accumulators: Map<string, AccumulatorDef>;

  /** Lookup tables */
  tables: Map<string, LookupTable>;

  /** Segment definitions in order */
  segments: TransformSegment[];

  /** Import references */
  imports: ImportRef[];

  /** Pass numbers for multi-pass execution (sorted ascending) */
  passes: number[];

  /** Confidential field enforcement mode */
  enforceConfidential?: 'redact' | 'mask' | undefined;

  /** Enable strict type checking for verb arguments */
  strictTypes?: boolean | undefined;
}

/**
 * Transform document metadata (from {$} header)
 */
export interface TransformMetadata {
  /** ODIN version */
  odin: string;

  /** Transform spec version */
  transform: string;

  /** Unique identifier */
  id?: string | undefined;

  /** Human-readable name */
  name?: string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Source format configuration
 */
export interface SourceConfig {
  /** Source format type */
  format?:
    | 'odin'
    | 'json'
    | 'xml'
    | 'fixed-width'
    | 'csv'
    | 'flat'
    | 'delimited'
    | 'properties'
    | string;

  /** Schema reference for validation */
  schema?: string;

  /** Record type discriminator for multi-record files */
  discriminator?: Discriminator;

  /** XML namespace declarations */
  namespaces?: Map<string, string>;

  /** Delimiter for CSV/delimited formats (default: ',') */
  delimiter?: string;
}

/**
 * Discriminator for identifying record types
 */
export interface Discriminator {
  /** Discriminator type */
  type: 'position' | 'field' | 'path';

  /** Position-based: start position (0-indexed) */
  pos?: number;

  /** Position-based: field length */
  len?: number;

  /** Field-based: field index (0-indexed) */
  field?: number;

  /** Path-based: source path expression */
  path?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Target Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Target format configuration
 */
export interface TargetConfig {
  /** Output format */
  format: 'json' | 'xml' | 'fixed-width' | 'csv' | 'odin' | 'flat' | 'properties' | string;

  /** Character encoding */
  encoding?: string | undefined;

  /** Indentation (for JSON/XML) */
  indent?: number | undefined;

  /** Line ending (for fixed-width/CSV) */
  lineEnding?: string | undefined;

  /** Line width (for fixed-width) */
  lineWidth?: number | undefined;

  /** Default pad character (for fixed-width) */
  padChar?: string | undefined;

  /** Truncate overlong values (for fixed-width) */
  truncate?: boolean | undefined;

  /** Include XML declaration */
  declaration?: boolean | undefined;

  /** Omit empty elements/fields */
  omitEmpty?: boolean | undefined;

  /** CSV delimiter */
  delimiter?: string | undefined;

  /** CSV quote character */
  quote?: string | undefined;

  /** Include header row (CSV) */
  header?: boolean | undefined;

  /** Flat output style */
  style?: 'kvp' | 'yaml' | undefined;

  /** How to handle nulls in JSON */
  nulls?: 'omit' | 'include' | undefined;

  /** How to handle empty arrays in JSON */
  emptyArrays?: 'omit' | 'include' | undefined;

  /** Error handling mode */
  onError?: 'fail' | 'warn' | 'skip' | undefined;

  /** Missing value handling */
  onMissing?: 'fail' | 'warn' | 'skip' | 'default' | undefined;

  /** Validation failure handling */
  onValidation?: 'fail' | 'warn' | 'skip' | undefined;

  /** XML namespace declarations */
  namespaces?: Map<string, string> | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Accumulators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Accumulator definition
 */
export interface AccumulatorDef {
  /** Accumulator name */
  name: string;

  /** Initial value */
  initialValue: TransformValue;

  /** Persist across documents in batch mode */
  persist?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup Tables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single row in a lookup table
 */
export type TableRow = TransformValue[];

/**
 * Lookup table definition
 *
 * Tables are defined with named columns and data rows. Any column can be
 * matched on and any column can be returned.
 *
 * @example
 * ```odin
 * {$table.RATE[vehicle_type, coverage, base, factor]}
 * sedan, liability, ##250, #1.15
 * sedan, collision, ##175, #1.10
 * truck, liability, ##300, #1.20
 * ```
 *
 * Usage:
 * ```odin
 * base = "%lookup RATE.base @.vehicle_type @.coverage"
 * factor = "%lookup RATE.factor @.vehicle_type @.coverage"
 * ```
 */
export interface LookupTable {
  /** Table name */
  name: string;

  /** Column names in order */
  columns: string[];

  /** Table rows (each row is an array of values matching column order) */
  rows: TableRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Segments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A segment groups related mappings
 */
export interface TransformSegment {
  /** Segment path/name (e.g., "policy", "segment.HDR", "vehicles[]") */
  path: string;

  /** Whether this is an array segment */
  isArray: boolean;

  /** Segment directives */
  directives: SegmentDirective[];

  /** Field mappings */
  mappings: FieldMapping[];

  /** Pass number for multi-pass execution (undefined = run after all numbered passes) */
  pass?: number | undefined;
}

/**
 * Segment directive
 */
export interface SegmentDirective {
  /** Directive type */
  type: 'type' | 'loop' | 'counter' | 'from' | 'if' | 'literal';

  /** Directive value */
  value: string;

  /** Optional alias (for :loop :as) */
  alias?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Mappings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A field mapping definition
 */
export interface FieldMapping {
  /** Target field name */
  target: string;

  /** Value expression */
  value: ValueExpression;

  /** Modifiers applied to the value */
  modifiers: Modifier[];

  /** Whether this field is marked confidential (from * prefix) */
  confidential?: boolean | undefined;
}

/**
 * Value expression types
 */
export type ValueExpression =
  | CopyExpression
  | TransformExpression
  | LiteralExpression
  | ObjectExpression;

/**
 * Copy from source path: @path
 */
export interface CopyExpression {
  type: 'copy';
  path: string;
  /** Trailing directives (e.g., :pos 3 :len 8 for fixed-width extraction) */
  directives?: ReadonlyArray<{ name: string; value?: string | number }>;
}

/**
 * Apply transformation: %verb args
 */
export interface TransformExpression {
  type: 'transform';
  verb: string;
  isCustom: boolean;
  args: ValueExpression[];
}

/**
 * Literal value: "string", ##42, #$100.00
 */
export interface LiteralExpression {
  type: 'literal';
  value: TransformValue;
}

/**
 * Inline object construction: :object {key = @path, ...}
 */
export interface ObjectExpression {
  type: 'object';
  fields: Map<string, ValueExpression>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modifiers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Field modifier
 */
export interface Modifier {
  /** Modifier name */
  name: string;

  /** Modifier value (if any) */
  value?: string | number | boolean | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform Values
// ─────────────────────────────────────────────────────────────────────────────

// Import the unified type system
import type { OdinTypedValue } from './values.js';

/**
 * Value types in transform context.
 *
 * TransformValue is now an alias for OdinTypedValue, the unified type system.
 * This eliminates the dual type system that previously required constant conversion.
 *
 * All ODIN types are supported:
 * - null: ~
 * - string: "value"
 * - integer: ##42
 * - number: #99.99
 * - currency: #$100.00
 * - boolean: ?true, ?false
 * - date: 2024-06-15
 * - timestamp: 2025-12-06T14:30:00Z
 * - time: T14:30:00
 * - duration: P1Y, PT30M
 * - reference: @path.to.field
 * - binary: ^base64data
 * - array: [...]
 * - object: {...}
 *
 * Values can now also carry modifiers (required, confidential, deprecated).
 */
export type TransformValue = OdinTypedValue;

// ─────────────────────────────────────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Import reference
 */
export interface ImportRef {
  /** Import path */
  path: string;

  /** Optional alias */
  alias?: string;

  /** Line number where import was declared */
  line?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform Execution Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform execution context
 */
export interface TransformContext {
  /** Source document data */
  source: unknown;

  /** Source ODIN document (when source.format = 'odin', preserves type info) */
  sourceOdinDoc?: import('./document.js').OdinDocument;

  /** Current loop item (for @. references) */
  current?: unknown;

  /** Loop aliases */
  aliases: Map<string, unknown>;

  /** Loop counters */
  counters: Map<string, number>;

  /** Accumulator values */
  accumulators: Map<string, TransformValue>;

  /** Lookup tables */
  tables: Map<string, LookupTable>;

  /** Constants */
  constants: Map<string, TransformValue>;

  /** Sequence counters for %sequence verb (scoped to execution) */
  sequenceCounters: Map<string, number>;

  /** Current loop nesting depth for security limits */
  loopDepth: number;

  /** Verb registry (for verbs like %reduce that invoke other verbs) */
  verbRegistry?: VerbRegistry;

  /** Errors collected by verbs (T011, etc.) — merged into TransformResult.errors */
  errors?: TransformError[];
}

/**
 * Transform result
 */
export interface TransformResult {
  /** Whether transform succeeded */
  success: boolean;

  /** Output data */
  output?: unknown;

  /** Formatted output string */
  formatted?: string;

  /** Errors encountered */
  errors: TransformError[];

  /** Warnings encountered */
  warnings: TransformWarning[];
}

/**
 * Transform error
 */
export interface TransformError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Segment where error occurred */
  segment?: string;

  /** Field where error occurred */
  field?: string;

  /** Source path involved */
  sourcePath?: string;
}

/**
 * Transform warning
 */
export interface TransformWarning {
  /** Warning code */
  code: string;

  /** Warning message */
  message: string;

  /** Segment where warning occurred */
  segment?: string;

  /** Field where warning occurred */
  field?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verb Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verb function signature
 */
export type VerbFunction = (args: TransformValue[], context: TransformContext) => TransformValue;

/**
 * Verb registry
 */
export interface VerbRegistry {
  /** Get a built-in verb by name */
  get(name: string): VerbFunction | undefined;

  /** Register a custom verb */
  register(namespace: string, name: string, fn: VerbFunction): void;

  /** Get a custom verb by namespaced name */
  getCustom(fullName: string): VerbFunction | undefined;
}
