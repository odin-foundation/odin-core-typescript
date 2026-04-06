/**
 * Schema types for ODIN validation.
 */

import type { OdinValue } from './values.js';

/**
 * Import directive in a schema.
 */
export interface SchemaImport {
  /** Import path (relative, absolute, or URL) */
  readonly path: string;
  /** Optional alias for namespacing imported content */
  readonly alias?: string;
  /** Source line number */
  readonly line: number;
}

/**
 * Parsed ODIN Schema.
 */
export interface OdinSchema {
  /**
   * Schema metadata.
   */
  readonly metadata: SchemaMetadata;

  /**
   * Import directives from @import statements.
   * Note: The parser extracts import metadata but does not resolve imports.
   * Import resolution is handled by the resolver module.
   */
  readonly imports: readonly SchemaImport[];

  /**
   * Type definitions ({@name}).
   */
  readonly types: ReadonlyMap<string, SchemaType>;

  /**
   * Field definitions by path.
   */
  readonly fields: ReadonlyMap<string, SchemaField>;

  /**
   * Array definitions.
   */
  readonly arrays: ReadonlyMap<string, SchemaArray>;

  /**
   * Object-level constraints (invariants, cardinality).
   */
  readonly constraints: ReadonlyMap<string, SchemaObjectConstraint[]>;
}

/**
 * Schema metadata from {$} header.
 */
export interface SchemaMetadata {
  odin?: string;
  schema?: string;
  id?: string;
  version?: string;
  title?: string;
  description?: string;
}

/**
 * Reusable type definition ({@name}).
 */
export interface SchemaType {
  name: string;
  namespace?: string;
  fields: ReadonlyMap<string, SchemaField>;
}

/**
 * Field definition in schema.
 */
export interface SchemaField {
  /**
   * Field path.
   */
  path: string;

  /**
   * Field type.
   */
  type: SchemaFieldType;

  /**
   * Whether field is required (!).
   */
  required: boolean;

  /**
   * Whether field can be null (~).
   */
  nullable: boolean;

  /**
   * Whether field is redacted (*).
   */
  redacted: boolean;

  /**
   * Whether field is deprecated (-).
   */
  deprecated: boolean;

  /**
   * Whether field is computed (:computed).
   * Computed fields are derived values, not provided in input.
   */
  computed?: boolean;

  /**
   * Whether field is immutable (:immutable).
   * Immutable fields cannot be changed after initial creation.
   */
  immutable?: boolean;

  /**
   * Constraints on the field.
   */
  constraints: SchemaConstraint[];

  /**
   * Conditional requirements (:if field = value).
   */
  conditionals: SchemaConditional[];

  /**
   * Default value.
   */
  defaultValue?: OdinValue;

  /**
   * Reference to type definition (@typename).
   */
  typeRef?: string;
}

/**
 * Field type specification.
 */
export type SchemaFieldType =
  | { kind: 'string' }
  | { kind: 'boolean' }
  | { kind: 'number' }
  | { kind: 'integer' }
  | { kind: 'decimal'; places: number }
  | { kind: 'currency'; places: number }
  | { kind: 'percent' }
  | { kind: 'date' }
  | { kind: 'timestamp' }
  | { kind: 'time' }
  | { kind: 'duration' }
  | { kind: 'reference'; targetPath?: string }
  | { kind: 'binary'; algorithm?: string }
  | { kind: 'null' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'union'; types: SchemaFieldType[] }
  | { kind: 'typeRef'; name: string; override?: boolean };

/**
 * Constraint on a field.
 */
export type SchemaConstraint =
  | SchemaBoundsConstraint
  | SchemaPatternConstraint
  | SchemaEnumConstraint
  | SchemaUniqueConstraint
  | SchemaSizeConstraint
  | SchemaFormatConstraint;

/**
 * Bounds constraint (min..max).
 */
export interface SchemaBoundsConstraint {
  kind: 'bounds';
  min?: number | string; // number for numeric, string for date
  max?: number | string;
}

/**
 * Pattern constraint (regex).
 */
export interface SchemaPatternConstraint {
  kind: 'pattern';
  pattern: string;
}

/**
 * Enum constraint (value1, value2, ...).
 */
export interface SchemaEnumConstraint {
  kind: 'enum';
  values: string[];
}

/**
 * Unique constraint for arrays.
 */
export interface SchemaUniqueConstraint {
  kind: 'unique';
}

/**
 * Size constraint for binary data.
 */
export interface SchemaSizeConstraint {
  kind: 'size';
  min?: number;
  max?: number;
}

/**
 * Format constraint for strings (:format email, :format url, etc.).
 * Standard formats: email, url, uri, uuid, date, time, datetime,
 * date-time, hostname, ipv4, ipv6, phone, credit-card, ssn, ein.
 */
export interface SchemaFormatConstraint {
  kind: 'format';
  format: string;
}

/**
 * Conditional operator type.
 */
export type ConditionalOperator = '=' | '!=' | '>' | '<' | '>=' | '<=';

/**
 * Conditional field requirement.
 */
export interface SchemaConditional {
  /**
   * Field to check.
   */
  field: string;

  /**
   * Comparison operator (default: '=').
   */
  operator: ConditionalOperator;

  /**
   * Value to compare against.
   */
  value: string | number | boolean;

  /**
   * If true, this is an :unless condition (inverted logic).
   * Field is required when condition is FALSE.
   */
  unless?: boolean;
}

/**
 * Array schema definition.
 */
export interface SchemaArray {
  /**
   * Array path.
   */
  path: string;

  /**
   * Minimum items.
   */
  minItems?: number;

  /**
   * Maximum items.
   */
  maxItems?: number;

  /**
   * Whether items must be unique.
   */
  unique: boolean;

  /**
   * Item field definitions.
   */
  itemFields: ReadonlyMap<string, SchemaField>;

  /**
   * Column order for tabular syntax.
   */
  columns?: string[];
}

/**
 * Object-level constraint.
 */
export type SchemaObjectConstraint = SchemaInvariant | SchemaCardinality;

/**
 * Invariant constraint (:invariant expression).
 */
export interface SchemaInvariant {
  kind: 'invariant';
  expression: string;
}

/**
 * Cardinality constraint (:of, :one_of, etc.).
 */
export interface SchemaCardinality {
  kind: 'cardinality';
  type: 'of' | 'one_of' | 'exactly_one' | 'at_most_one';
  min?: number;
  max?: number;
  fields: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of validating a document against a schema.
 */
export interface ValidationResult {
  /**
   * Whether the document is valid.
   */
  readonly valid: boolean;

  /**
   * Validation errors (if any).
   */
  readonly errors: ValidationError[];

  /**
   * Validation warnings (if any).
   */
  readonly warnings: ValidationWarning[];
}

/**
 * Validation error.
 */
export interface ValidationError {
  /**
   * Path where error occurred.
   */
  readonly path: string;

  /**
   * Error code (V001-V099).
   */
  readonly code: string;

  /**
   * Human-readable message.
   */
  readonly message: string;

  /**
   * What was expected.
   */
  readonly expected?: unknown;

  /**
   * What was found.
   */
  readonly actual?: unknown;

  /**
   * Path in schema where constraint is defined.
   */
  readonly schemaPath?: string;
}

/**
 * Validation warning.
 */
export interface ValidationWarning {
  /**
   * Path where warning applies.
   */
  readonly path: string;

  /**
   * Warning code.
   */
  readonly code: string;

  /**
   * Human-readable message.
   */
  readonly message: string;
}
