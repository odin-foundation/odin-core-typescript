/**
 * ODIN Validator - Validate documents against schemas.
 */

import type { OdinDocument } from '../types/document.js';
import type { OdinValue } from '../types/values.js';
import type {
  OdinSchema,
  SchemaField,
  SchemaFieldType,
  SchemaArray,
  SchemaType,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ConditionalOperator,
} from '../types/schema.js';
import type { ValidateOptions } from '../types/options.js';
import type { TypeRegistry } from '../resolver/type-registry.js';
import { SECURITY_LIMITS } from '../utils/security-limits.js';

// Import from extracted constraint modules
import {
  validateConstraint,
  validateCardinality,
  validateInvariant,
  addError,
  addWarning,
} from './validate-constraints.js';
import { validateTypeFromRegistry, type TypeValidationContext } from './type-validators.js';

/**
 * Default validation options.
 */
const defaultOptions: Required<ValidateOptions> = {
  failFast: false,
  strict: false,
  includeWarnings: true,
};

/**
 * Internal state during validation.
 */
interface ValidationContext {
  doc: OdinDocument;
  schema: OdinSchema;
  options: Required<ValidateOptions>;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  visitedRefs: Set<string>; // For circular reference detection
  typeRegistry?: TypeRegistry | undefined; // Optional type registry from resolved imports
}

/**
 * Validate a document against a schema.
 *
 * @param doc - The document to validate
 * @param schema - The schema to validate against
 * @param options - Optional validation options
 * @param typeRegistry - Optional type registry from resolved imports
 */
export function validate(
  doc: OdinDocument,
  schema: OdinSchema,
  options?: ValidateOptions,
  typeRegistry?: TypeRegistry
): ValidationResult {
  const opts = { ...defaultOptions, ...options };

  const ctx: ValidationContext = {
    doc,
    schema,
    options: opts,
    errors: [],
    warnings: [],
    visitedRefs: new Set(),
    typeRegistry,
  };

  // First, validate all references are resolvable and non-circular
  validateReferences(ctx);

  // Validate schema-level type references (cycles and unresolved types)
  validateSchemaTypeReferences(ctx);

  if (opts.failFast && ctx.errors.length > 0) {
    return createResult(ctx);
  }

  // Expand type compositions (e.g., billing._composition: @address -> billing.line1, billing.city, etc.)
  const expandedFields = expandTypeCompositions(ctx);

  // Validate each field defined in the schema
  for (const [path, fieldSchema] of expandedFields) {
    validateField(ctx, path, fieldSchema);
    if (opts.failFast && ctx.errors.length > 0) {
      return createResult(ctx);
    }
  }

  // Validate arrays
  for (const [path, arraySchema] of schema.arrays) {
    validateArray(ctx, path, arraySchema);
    if (opts.failFast && ctx.errors.length > 0) {
      return createResult(ctx);
    }
  }

  // Check for unknown fields if strict mode
  if (opts.strict) {
    validateNoUnknownFields(ctx);
  }

  // Validate object-level constraints
  for (const [path, constraints] of schema.constraints) {
    for (const constraint of constraints) {
      if (constraint.kind === 'cardinality') {
        validateCardinality(ctx, path, constraint);
      } else if (constraint.kind === 'invariant') {
        validateInvariant(ctx, path, constraint);
      }
    }
  }

  return createResult(ctx);
}

/**
 * Expand type compositions in schema fields.
 *
 * When a field has `_composition` suffix with a typeRef, this expands it to include
 * all fields from the referenced type prefixed with the parent path.
 *
 * With :override modifier, explicit fields can override inherited fields from the
 * base type without generating a warning.
 *
 * Example: billing._composition: @address -> billing.line1, billing.city, etc.
 * Example with import: billing._composition: @types.address -> billing.line1, etc.
 * Example with override: billing._composition: @address :override -> allows billing.line1 override
 */
function expandTypeCompositions(ctx: ValidationContext): Map<string, SchemaField> {
  const result = new Map<string, SchemaField>();

  // Track composition overrides by parent path
  const overrideByPath = new Map<string, boolean>();

  // First pass: expand all compositions and collect inherited fields
  for (const [path, field] of ctx.schema.fields) {
    if (path.endsWith('._composition') && field.type.kind === 'typeRef') {
      const parentPath = path.substring(0, path.length - '._composition'.length);
      const allowOverride = field.type.override === true;
      overrideByPath.set(parentPath, allowOverride);

      // Get the type definition - use lookupType to support imported types
      const typeDef = lookupType(ctx, field.type.name);
      if (typeDef) {
        // Add all fields from the type definition with the parent path prefix
        for (const [fieldName, typeField] of typeDef.fields) {
          if (fieldName === '_composition') continue;
          const fullPath = `${parentPath}.${fieldName}`;
          // Clone the field with the new path
          result.set(fullPath, { ...typeField, path: fullPath });
        }
      }
    }
  }

  // Second pass: add explicit fields (may override inherited fields)
  for (const [path, field] of ctx.schema.fields) {
    if (path.endsWith('._composition')) {
      continue; // Skip composition markers
    }

    const existingField = result.get(path);
    if (existingField) {
      // Field already exists from composition - check if override is allowed
      // Find the parent path that has the composition
      const pathParts = path.split('.');
      let parentPath = '';
      let allowOverride = false;
      for (let i = pathParts.length - 1; i >= 0; i--) {
        parentPath = pathParts.slice(0, i).join('.');
        if (overrideByPath.has(parentPath)) {
          allowOverride = overrideByPath.get(parentPath) === true;
          break;
        }
      }

      if (!allowOverride) {
        addWarning(
          ctx,
          path,
          'W001',
          `Field '${path}' overrides inherited field without :override modifier`
        );
      }
    }

    // Set the field (explicit field overrides inherited)
    result.set(path, field);
  }

  return result;
}

/**
 * Create the validation result from context.
 */
function createResult(ctx: ValidationContext): ValidationResult {
  return {
    valid: ctx.errors.length === 0,
    errors: ctx.errors,
    warnings: ctx.options.includeWarnings ? ctx.warnings : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate all references in the document.
 */
function validateReferences(ctx: ValidationContext): void {
  const paths = ctx.doc.paths();

  for (const path of paths) {
    const value = ctx.doc.get(path);
    if (value?.type === 'reference') {
      validateReference(ctx, path, value);
    }
  }
}

/**
 * Validate a single reference.
 */
function validateReference(
  ctx: ValidationContext,
  path: string,
  value: OdinValue & { type: 'reference' }
): void {
  const targetPath = value.path;

  // Check if target exists
  const targetValue = ctx.doc.get(targetPath);
  if (targetValue === undefined) {
    addError(
      ctx,
      path,
      'V013',
      `Unresolved reference: @${targetPath}`,
      'existing path',
      `@${targetPath}`
    );
    return;
  }

  // Check for circular references
  ctx.visitedRefs.clear();
  if (detectCircularReference(ctx, targetPath)) {
    addError(
      ctx,
      path,
      'V012',
      `Circular reference detected: @${targetPath}`,
      'non-circular reference',
      `@${targetPath}`
    );
  }
}

/**
 * Detect circular references by following reference chains.
 * @param depth - Current recursion depth (for stack overflow prevention)
 */
function detectCircularReference(
  ctx: ValidationContext,
  targetPath: string,
  depth: number = 0
): boolean {
  // Prevent stack overflow from deep reference chains
  if (depth > SECURITY_LIMITS.MAX_CIRCULAR_REF_DEPTH) {
    addError(
      ctx,
      targetPath,
      'V012',
      `Reference chain exceeds maximum depth of ${SECURITY_LIMITS.MAX_CIRCULAR_REF_DEPTH}`,
      'non-circular reference',
      `@${targetPath}`
    );
    return true; // Treat as circular to stop further processing
  }

  if (ctx.visitedRefs.has(targetPath)) {
    return true;
  }

  ctx.visitedRefs.add(targetPath);

  const value = ctx.doc.get(targetPath);
  if (value?.type === 'reference') {
    return detectCircularReference(ctx, value.path, depth + 1);
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Type Reference Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate schema-level type references for cycles (V012) and unresolved types (V013).
 *
 * This checks that all @typeRef fields in the schema reference types that exist,
 * and that type definitions don't form circular reference chains.
 */
function validateSchemaTypeReferences(ctx: ValidationContext): void {
  // Check for unresolved type references in schema fields
  for (const [path, field] of ctx.schema.fields) {
    if (field.type.kind === 'typeRef' || field.type.kind === 'reference') {
      const targetName = field.type.kind === 'typeRef'
        ? field.type.name
        : (field.type as { targetPath?: string }).targetPath;
      if (targetName) {
        const typeDef = lookupType(ctx, targetName);
        if (!typeDef) {
          addError(
            ctx,
            path,
            'V013',
            `Unresolved type reference: @${targetName}`,
            'defined type',
            `@${targetName}`
          );
        }
      }
    }
  }

  // Check for circular type references among defined types
  for (const [typeName, typeDef] of ctx.schema.types) {
    const visited = new Set<string>();
    if (detectSchemaTypeCycle(ctx, typeName, typeDef, visited)) {
      addError(
        ctx,
        `@${typeName}`,
        'V012',
        `Circular type reference detected: @${typeName}`,
        'non-circular type reference',
        `@${typeName}`
      );
    }
  }
}

/**
 * Detect circular type references by following typeRef fields in type definitions.
 */
function detectSchemaTypeCycle(
  ctx: ValidationContext,
  typeName: string,
  typeDef: SchemaType,
  visited: Set<string>
): boolean {
  if (visited.has(typeName)) {
    return true; // Cycle detected
  }
  visited.add(typeName);

  for (const [, field] of typeDef.fields) {
    const refName = field.type.kind === 'typeRef'
      ? field.type.name
      : field.type.kind === 'reference'
        ? (field.type as { targetPath?: string }).targetPath
        : undefined;
    if (refName) {
      const referencedType = ctx.schema.types.get(refName);
      if (referencedType) {
        if (detectSchemaTypeCycle(ctx, refName, referencedType, new Set(visited))) {
          return true;
        }
      }
    }
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a single field against its schema.
 */
function validateField(ctx: ValidationContext, path: string, fieldSchema: SchemaField): void {
  const value = ctx.doc.get(path);

  // Check required
  if (value === undefined) {
    if (fieldSchema.required) {
      // Check conditionals
      if (fieldSchema.conditionals.length > 0) {
        const shouldBeRequired = fieldSchema.conditionals.some((cond) => {
          // Resolve conditional field path relative to current field's parent
          const parentPath = path.includes('.') ? path.substring(0, path.lastIndexOf('.')) : '';
          const condFieldPath = cond.field.includes('.')
            ? cond.field
            : parentPath
              ? `${parentPath}.${cond.field}`
              : cond.field;
          const condValue = ctx.doc.get(condFieldPath);
          return matchesConditionValue(condValue, cond.operator, cond.value);
        });
        if (shouldBeRequired) {
          addError(
            ctx,
            path,
            'V010',
            `Conditional requirement not met: field is required`,
            'value',
            undefined,
            path
          );
        }
      } else {
        addError(ctx, path, 'V001', `Required field missing: ${path}`, 'value', undefined);
      }
    }
    return;
  }

  // Check nullable
  if (value.type === 'null') {
    if (!fieldSchema.nullable) {
      addError(ctx, path, 'V002', `Field ${path} cannot be null`, 'non-null value', 'null');
    }
    return;
  }

  // Check type - but skip if the field has a format constraint compatible with the value type
  // e.g., a string field with :format date-iso should accept date-typed values
  const hasCompatibleFormat = fieldSchema.constraints.some(c =>
    c.kind === 'format' && isFormatCompatibleWithType(c.format, value.type)
  );
  if (!hasCompatibleFormat) {
    validateType(ctx, path, value, fieldSchema.type);
  }

  // Check constraints
  for (const constraint of fieldSchema.constraints) {
    validateConstraint(ctx, path, value, constraint);
    if (ctx.options.failFast && ctx.errors.length > 0) return;
  }

  // Warn if deprecated
  if (fieldSchema.deprecated) {
    addWarning(ctx, path, 'W001', `Field ${path} is deprecated`);
  }
}

/**
 * Check if a value matches a condition using the specified operator.
 */
function matchesConditionValue(
  value: OdinValue | undefined,
  operator: ConditionalOperator,
  expected: string | number | boolean
): boolean {
  if (value === undefined) return false;

  // Get the actual value
  let actual: string | number | boolean | undefined;
  switch (value.type) {
    case 'string':
      actual = value.value;
      break;
    case 'number':
    case 'integer':
    case 'currency':
    case 'percent':
      actual = value.value;
      break;
    case 'boolean':
      actual = value.value;
      break;
    default:
      return false;
  }

  // Apply operator
  switch (operator) {
    case '=':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      if (typeof actual === 'number' && typeof expected === 'number') {
        return actual > expected;
      }
      return false;
    case '<':
      if (typeof actual === 'number' && typeof expected === 'number') {
        return actual < expected;
      }
      return false;
    case '>=':
      if (typeof actual === 'number' && typeof expected === 'number') {
        return actual >= expected;
      }
      return false;
    case '<=':
      if (typeof actual === 'number' && typeof expected === 'number') {
        return actual <= expected;
      }
      return false;
    default:
      return false;
  }
}

/**
 * Validate value type against schema type.
 *
 * Uses the type validator registry (OCP pattern) for extensibility.
 * New type validators can be registered without modifying this function.
 */
function validateType(
  ctx: ValidationContext,
  path: string,
  value: OdinValue,
  schemaType: SchemaFieldType
): void {
  // Create registry-compatible context
  const typeCtx: TypeValidationContext = {
    path,
    addError: (code, message, expected, actual) =>
      addError(ctx, path, code, message, expected, actual),
    lookupType: (name) => {
      const typeDef = lookupType(ctx, name);
      return typeDef ? { kind: 'typeRef' as const, name } : undefined;
    },
    validateType: (v, t) => validateType(ctx, path, v, t),
  };

  // Try registry first (allows extension without modifying this function)
  if (validateTypeFromRegistry(typeCtx, value, schemaType)) {
    return;
  }

  // Fallback for any types not in registry (shouldn't happen with built-in types)
  switch (schemaType.kind) {
    case 'string':
      if (value.type !== 'string') {
        addError(ctx, path, 'V002', `Type mismatch: expected string`, 'string', value.type);
      }
      break;

    case 'boolean':
      if (value.type !== 'boolean') {
        addError(ctx, path, 'V002', `Type mismatch: expected boolean`, 'boolean', value.type);
      }
      break;

    case 'number':
      if (value.type !== 'number') {
        addError(ctx, path, 'V002', `Type mismatch: expected number`, 'number', value.type);
      }
      break;

    case 'integer':
      if (value.type !== 'integer') {
        addError(ctx, path, 'V002', `Type mismatch: expected integer`, 'integer', value.type);
      }
      break;

    case 'decimal':
      if (value.type !== 'number') {
        addError(ctx, path, 'V002', `Type mismatch: expected decimal`, 'decimal', value.type);
      }
      break;

    case 'currency':
      if (value.type !== 'currency') {
        addError(ctx, path, 'V002', `Type mismatch: expected currency`, 'currency', value.type);
      }
      break;

    case 'percent':
      if (value.type !== 'percent') {
        addError(ctx, path, 'V002', `Type mismatch: expected percent`, 'percent', value.type);
      }
      break;

    case 'date':
      if (value.type !== 'date') {
        addError(ctx, path, 'V002', `Type mismatch: expected date`, 'date', value.type);
      }
      break;

    case 'timestamp':
      if (value.type !== 'timestamp') {
        addError(ctx, path, 'V002', `Type mismatch: expected timestamp`, 'timestamp', value.type);
      }
      break;

    case 'time':
      if (value.type !== 'time') {
        addError(ctx, path, 'V002', `Type mismatch: expected time`, 'time', value.type);
      }
      break;

    case 'duration':
      if (value.type !== 'duration') {
        addError(ctx, path, 'V002', `Type mismatch: expected duration`, 'duration', value.type);
      }
      break;

    case 'reference':
      if (value.type !== 'reference') {
        addError(ctx, path, 'V002', `Type mismatch: expected reference`, 'reference', value.type);
      }
      // Optionally validate target path pattern
      if (schemaType.targetPath && value.type === 'reference') {
        // Escape regex special chars first, then convert * wildcards to .*
        const escapedPattern = escapeRegex(schemaType.targetPath).replace(/\\\*/g, '.*');
        const regex = new RegExp('^' + escapedPattern + '$');
        if (!regex.test(value.path)) {
          addError(
            ctx,
            path,
            'V004',
            `Reference target does not match pattern`,
            schemaType.targetPath,
            value.path
          );
        }
      }
      break;

    case 'binary':
      if (value.type !== 'binary') {
        addError(ctx, path, 'V002', `Type mismatch: expected binary`, 'binary', value.type);
      }
      if (
        schemaType.algorithm &&
        value.type === 'binary' &&
        value.algorithm !== schemaType.algorithm
      ) {
        addError(
          ctx,
          path,
          'V002',
          `Binary algorithm mismatch`,
          schemaType.algorithm,
          value.algorithm
        );
      }
      break;

    case 'null':
      if (value.type !== 'null') {
        addError(ctx, path, 'V002', `Type mismatch: expected null`, 'null', value.type);
      }
      break;

    case 'enum':
      if (value.type !== 'string') {
        addError(
          ctx,
          path,
          'V002',
          `Type mismatch: expected string for enum`,
          'string',
          value.type
        );
      } else if (!schemaType.values.includes(value.value)) {
        addError(ctx, path, 'V005', `Invalid enum value`, schemaType.values, value.value);
      }
      break;

    case 'union': {
      // Try each type in the union
      let matchesAny = false;
      for (const unionType of schemaType.types) {
        const tempCtx: ValidationContext = {
          ...ctx,
          errors: [],
          warnings: [],
        };
        validateType(tempCtx, path, value, unionType);
        if (tempCtx.errors.length === 0) {
          matchesAny = true;
          break;
        }
      }
      if (!matchesAny) {
        addError(
          ctx,
          path,
          'V002',
          `Type mismatch: value does not match any union type`,
          schemaType.types.map((t) => t.kind),
          value.type
        );
      }
      break;
    }

    case 'typeRef': {
      // Look up type definition - check type registry first (for imported types),
      // then fall back to local schema types
      const typeDef = lookupType(ctx, schemaType.name);
      if (!typeDef) {
        addError(
          ctx,
          path,
          'V002',
          `Unknown type reference: ${schemaType.name}`,
          schemaType.name,
          undefined
        );
      }
      // Type refs are validated at the object level
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Array Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an array against its schema.
 */
function validateArray(ctx: ValidationContext, basePath: string, arraySchema: SchemaArray): void {
  // Find all items in this array
  const paths = ctx.doc.paths();
  // Match both formats: basePath[N].field and basePath[].[N].field
  const escapedBase = escapeRegex(basePath);
  const arrayPattern = new RegExp(`^${escapedBase}(?:\\[\\])?\\[?\\.?\\[?(\\d+)\\]`);
  const indices = new Set<number>();

  for (const path of paths) {
    const match = path.match(arrayPattern);
    if (match) {
      indices.add(parseInt(match[1]!, 10));
    }
  }

  const count = indices.size;

  // Check min/max items
  if (arraySchema.minItems !== undefined && count < arraySchema.minItems) {
    addError(ctx, basePath, 'V006', `Array has too few items`, `>= ${arraySchema.minItems}`, count);
  }
  if (arraySchema.maxItems !== undefined && count > arraySchema.maxItems) {
    addError(
      ctx,
      basePath,
      'V006',
      `Array has too many items`,
      `<= ${arraySchema.maxItems}`,
      count
    );
  }

  // Determine the path format used in the document
  // Paths may be either "basePath[N].field" or "basePath[].[N].field"
  const samplePath = paths.find(p => arrayPattern.test(p));
  const useBracketDot = samplePath ? samplePath.includes('[].') : false;

  // Validate each item's fields
  for (const index of indices) {
    for (const [fieldName, fieldSchema] of arraySchema.itemFields) {
      const itemPath = useBracketDot
        ? `${basePath}[].[${index}].${fieldName}`
        : `${basePath}[${index}].${fieldName}`;
      validateField(ctx, itemPath, fieldSchema);
      if (ctx.options.failFast && ctx.errors.length > 0) return;
    }
  }

  // Check uniqueness if required
  if (arraySchema.unique) {
    validateArrayUniqueness(ctx, basePath, arraySchema, indices, useBracketDot);
  }
}

/**
 * Validate array item uniqueness.
 */
function validateArrayUniqueness(
  ctx: ValidationContext,
  basePath: string,
  arraySchema: SchemaArray,
  indices: Set<number>,
  useBracketDot: boolean = false
): void {
  // Create a map of serialized items to detect duplicates
  const seen = new Map<string, number>();

  for (const index of indices) {
    const itemValues: string[] = [];
    for (const fieldName of arraySchema.itemFields.keys()) {
      const itemPath = useBracketDot
        ? `${basePath}[].[${index}].${fieldName}`
        : `${basePath}[${index}].${fieldName}`;
      const value = ctx.doc.get(itemPath);
      itemValues.push(JSON.stringify(value));
    }
    const key = itemValues.join('|');

    if (seen.has(key)) {
      addError(
        ctx,
        basePath,
        'V007',
        `Duplicate array item`,
        'unique items',
        `duplicate of item at index ${seen.get(key)}`
      );
    } else {
      seen.set(key, index);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strict Mode Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check for fields not defined in schema.
 */
function validateNoUnknownFields(ctx: ValidationContext): void {
  const paths = ctx.doc.paths();

  for (const path of paths) {
    // Skip metadata
    if (path.startsWith('$.')) continue;

    // Check if field is in schema
    if (!ctx.schema.fields.has(path)) {
      // Check if it's part of an array
      const arrayMatch = path.match(/^(.+?)\[\d+\]\.(.+)$/);
      if (arrayMatch) {
        const arrayPath = arrayMatch[1]!;
        const fieldName = arrayMatch[2]!;
        const arraySchema = ctx.schema.arrays.get(arrayPath);
        if (arraySchema && arraySchema.itemFields.has(fieldName)) {
          continue; // Valid array item field
        }
      }

      addError(ctx, path, 'V011', `Unknown field: ${path}`, 'defined in schema', 'not found');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a type definition by name.
 *
 * Supports namespaced references (e.g., "types.address" for imported types)
 * and local references (e.g., "address" for types defined in the same schema).
 *
 * When the type has a _composition field (type inheritance), this expands
 * it by merging fields from the base type(s).
 *
 * Lookup order:
 * 1. Type registry (if provided) - handles namespaced and local types from imports
 * 2. Local schema types - types defined in the current schema
 */
function lookupType(ctx: ValidationContext, typeName: string): SchemaType | undefined {
  // Try type registry first (handles imported types with namespaces)
  let type: SchemaType | undefined;
  if (ctx.typeRegistry) {
    type = ctx.typeRegistry.lookup(typeName);
  }

  // Fall back to local schema types
  if (!type) {
    type = ctx.schema.types.get(typeName);
  }

  if (!type) {
    return undefined;
  }

  // Check for type composition (_composition field) and expand it
  return expandTypeDefinition(ctx, type);
}

/**
 * Expand a type definition that has a _composition field.
 *
 * When a type is defined as `{@child} = @base :override`, this merges
 * fields from the base type with the child type's local fields.
 *
 * @param ctx - Validation context
 * @param type - The type to expand
 * @param depth - Current recursion depth (for stack overflow prevention)
 * @returns The expanded type with all inherited fields
 */
function expandTypeDefinition(
  ctx: ValidationContext,
  type: SchemaType,
  depth: number = 0
): SchemaType {
  // Prevent stack overflow from deeply nested or circular type compositions
  if (depth > SECURITY_LIMITS.MAX_TYPE_EXPANSION_DEPTH) {
    addWarning(
      ctx,
      type.name,
      'W002',
      `Type composition exceeds maximum depth of ${SECURITY_LIMITS.MAX_TYPE_EXPANSION_DEPTH} for type '${type.name}'`
    );
    return type; // Return unexpanded type to prevent infinite recursion
  }

  const compositionField = type.fields.get('_composition');
  if (!compositionField || compositionField.type.kind !== 'typeRef') {
    // No composition, return type as-is
    return type;
  }

  const baseTypeNames = compositionField.type.name.split('&').map((n) => n.trim());
  const allowOverride = compositionField.type.override === true;

  // Security: Limit the number of types that can be composed together
  if (baseTypeNames.length > SECURITY_LIMITS.MAX_COMPOSITE_TYPES) {
    addWarning(
      ctx,
      type.name,
      'W002',
      `Type composition has ${baseTypeNames.length} base types, exceeds maximum of ${SECURITY_LIMITS.MAX_COMPOSITE_TYPES}`
    );
    return type; // Return unexpanded to prevent explosion
  }

  // Collect fields from all base types
  const mergedFields = new Map<string, SchemaField>();

  for (const baseTypeName of baseTypeNames) {
    // Recursively look up base type (may also have composition)
    let baseType: SchemaType | undefined;
    if (ctx.typeRegistry) {
      baseType = ctx.typeRegistry.lookup(baseTypeName);
    }
    if (!baseType) {
      baseType = ctx.schema.types.get(baseTypeName);
    }
    if (baseType) {
      // Recursively expand the base type with incremented depth
      const expandedBase = expandTypeDefinition(ctx, baseType, depth + 1);
      // Add all fields from base type
      for (const [fieldName, field] of expandedBase.fields) {
        if (fieldName !== '_composition') {
          mergedFields.set(fieldName, field);

          // Security: Check field count to prevent field explosion attacks
          if (mergedFields.size > SECURITY_LIMITS.MAX_TYPE_FIELDS) {
            addWarning(
              ctx,
              type.name,
              'W002',
              `Type '${type.name}' exceeds maximum field count of ${SECURITY_LIMITS.MAX_TYPE_FIELDS} during expansion`
            );
            return type; // Return unexpanded to prevent explosion
          }
        }
      }
    }
  }

  // Add/override with local fields from this type
  for (const [fieldName, field] of type.fields) {
    if (fieldName === '_composition') {
      continue; // Skip the composition marker
    }

    const existingField = mergedFields.get(fieldName);
    if (existingField && !allowOverride) {
      // Field conflict without :override - add warning but still override
      // (In strict mode this could be an error, but for now we allow it with warning)
      addWarning(
        ctx,
        fieldName,
        'W001',
        `Field '${fieldName}' in type '${type.name}' overrides base type field without :override modifier`
      );
    }
    // Set the field (override if exists)
    mergedFields.set(fieldName, field);
  }

  // Return a new type with merged fields
  const result: SchemaType = {
    name: type.name,
    fields: mergedFields,
  };
  if (type.namespace) {
    result.namespace = type.namespace;
  }
  return result;
}

/**
 * Check if a format constraint is compatible with a given value type.
 * This allows e.g. a string field with :format date-iso to accept date-typed values.
 */
function isFormatCompatibleWithType(format: string, valueType: string): boolean {
  const dateFormats = new Set(['date', 'date-iso', 'date-time', 'datetime', 'time']);
  if (dateFormats.has(format) && (valueType === 'date' || valueType === 'timestamp' || valueType === 'time')) {
    return true;
  }
  return false;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
