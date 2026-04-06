/**
 * @odin-foundation/core
 *
 * Official TypeScript implementation of ODIN (Open Data Interchange Notation)
 * Canonical reference implementation - all other language implementations must match this behavior.
 *
 * @example
 * ```typescript
 * import { Odin } from '@odin-foundation/core';
 *
 * // Parse ODIN text
 * const doc = Odin.parse(`
 *   {policy}
 *   number = "PAP-2024-001"
 *   premium = #$747.50
 * `);
 *
 * // Access values
 * const premium = doc.get('policy.premium');
 *
 * // Build documents programmatically
 * const newDoc = Odin.builder()
 *   .set('name', 'John')
 *   .build();
 *
 * // Serialize to ODIN text
 * const text = Odin.stringify(newDoc);
 * ```
 *
 * @packageDocumentation
 */

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export { Odin } from './odin.js';

// ─────────────────────────────────────────────────────────────────────────────
// Value Type Guards
// ─────────────────────────────────────────────────────────────────────────────

export {
  isOdinNull,
  isOdinBoolean,
  isOdinString,
  isOdinNumeric,
  isOdinInteger,
  isOdinNumber,
  isOdinCurrency,
  isOdinTemporal,
  isOdinDate,
  isOdinTimestamp,
  isOdinTime,
  isOdinDuration,
  isOdinReference,
  isOdinBinary,
  isOdinArray,
  isOdinObject,
  OdinValues,
} from './types/values.js';

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export {
  OdinError,
  ParseError,
  PatchError,
  ParseErrorCodes,
  ValidationErrorCodes,
} from './types/errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types - Document
// ─────────────────────────────────────────────────────────────────────────────

export type {
  OdinDocument,
  OdinDocumentBuilder,
  OdinMetadata,
  OdinHeader,
  OdinImport,
} from './types/document.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types - Values
// ─────────────────────────────────────────────────────────────────────────────

export type {
  OdinValue,
  OdinNull,
  OdinBoolean,
  OdinString,
  OdinNumber,
  OdinInteger,
  OdinCurrency,
  OdinDate,
  OdinTimestamp,
  OdinTime,
  OdinDuration,
  OdinReference,
  OdinBinary,
  OdinArray,
  OdinModifiers,
} from './types/values.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types - Schema
// ─────────────────────────────────────────────────────────────────────────────

export type {
  OdinSchema,
  SchemaMetadata,
  SchemaType,
  SchemaField,
  SchemaFieldType,
  SchemaConstraint,
  SchemaBoundsConstraint,
  SchemaPatternConstraint,
  SchemaEnumConstraint,
  SchemaUniqueConstraint,
  SchemaSizeConstraint,
  SchemaConditional,
  SchemaArray,
  SchemaObjectConstraint,
  SchemaInvariant,
  SchemaCardinality,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types - Options
// ─────────────────────────────────────────────────────────────────────────────

export type {
  ParseOptions,
  StringifyOptions,
  ValidateOptions,
  ParseHandler,
} from './types/options.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types - Diff
// ─────────────────────────────────────────────────────────────────────────────

export type { OdinDiff, PathValue, PathChange, PathMove } from './types/diff.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types - Errors
// ─────────────────────────────────────────────────────────────────────────────

export type { ValidationErrorType } from './types/errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Transform
// ─────────────────────────────────────────────────────────────────────────────

export {
  parseTransform,
  executeTransform,
  transformDocument,
  defaultVerbRegistry,
  createVerbRegistry,
  VERB_ARITY,
} from './transform/index.js';
export type { TransformOptions } from './transform/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types - Transform
// ─────────────────────────────────────────────────────────────────────────────

export type {
  OdinTransform,
  TransformMetadata,
  SourceConfig,
  TargetConfig,
  AccumulatorDef,
  LookupTable,
  TransformSegment,
  SegmentDirective,
  FieldMapping,
  ValueExpression,
  CopyExpression,
  TransformExpression,
  LiteralExpression,
  ObjectExpression,
  Modifier,
  TransformValue,
  ImportRef,
  Discriminator,
  TransformContext,
  TransformResult,
  TransformError,
  TransformWarning,
  VerbFunction,
  VerbRegistry,
} from './types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Forms
// ─────────────────────────────────────────────────────────────────────────────

export { parseForm, renderForm } from './forms/index.js';

export type {
  OdinForm,
  FormElement,
  RenderFormOptions,
} from './forms/index.js';
