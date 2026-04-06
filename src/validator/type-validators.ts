/**
 * ODIN Type Validators - Registry-based type validation (OCP compliant).
 *
 * This module provides a registry pattern for type validators, allowing
 * new type validators to be added without modifying existing code.
 */

import type { OdinValue } from '../types/values.js';
import type { SchemaFieldType } from '../types/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validation context passed to type validators.
 */
export interface TypeValidationContext {
  /** Path to the value being validated */
  path: string;

  /** Add a validation error */
  addError: (code: string, message: string, expected: unknown, actual: unknown) => void;

  /** Lookup a type reference */
  lookupType?: (name: string) => SchemaFieldType | undefined;

  /** Validate a nested type (for recursive validation) */
  validateType?: (value: OdinValue, schemaType: SchemaFieldType) => void;
}

/**
 * Type validator function signature.
 */
export type TypeValidator = (
  ctx: TypeValidationContext,
  value: OdinValue,
  schemaType: SchemaFieldType
) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map of type kind to validator function.
 */
const typeValidators = new Map<string, TypeValidator>();

/**
 * Register a type validator.
 *
 * @param kind - The schema type kind (e.g., 'string', 'number')
 * @param validator - The validator function
 */
export function registerTypeValidator(kind: string, validator: TypeValidator): void {
  typeValidators.set(kind, validator);
}

/**
 * Get a type validator by kind.
 *
 * @param kind - The schema type kind
 * @returns The validator function or undefined
 */
export function getTypeValidator(kind: string): TypeValidator | undefined {
  return typeValidators.get(kind);
}

/**
 * Validate a value against a schema type using the registry.
 *
 * @param ctx - Validation context
 * @param value - Value to validate
 * @param schemaType - Schema type to validate against
 * @returns true if validation was handled by registry
 */
export function validateTypeFromRegistry(
  ctx: TypeValidationContext,
  value: OdinValue,
  schemaType: SchemaFieldType
): boolean {
  const validator = typeValidators.get(schemaType.kind);
  if (validator) {
    validator(ctx, value, schemaType);
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Validators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple type validator that checks if value.type matches expected type.
 */
function simpleTypeValidator(expectedType: string, displayName?: string): TypeValidator {
  const name = displayName ?? expectedType;
  return (ctx, value) => {
    if (value.type !== expectedType) {
      ctx.addError('V002', `Type mismatch: expected ${name}`, name, value.type);
    }
  };
}

// Register simple type validators
registerTypeValidator('string', simpleTypeValidator('string'));
registerTypeValidator('boolean', simpleTypeValidator('boolean'));
registerTypeValidator('number', simpleTypeValidator('number'));
registerTypeValidator('integer', simpleTypeValidator('integer'));
registerTypeValidator('decimal', simpleTypeValidator('number', 'decimal'));
registerTypeValidator('currency', simpleTypeValidator('currency'));
registerTypeValidator('date', simpleTypeValidator('date'));
registerTypeValidator('timestamp', simpleTypeValidator('timestamp'));
registerTypeValidator('time', simpleTypeValidator('time'));
registerTypeValidator('duration', simpleTypeValidator('duration'));
registerTypeValidator('null', simpleTypeValidator('null'));

// Reference validator (with optional target path pattern validation)
registerTypeValidator('reference', (ctx, value, schemaType) => {
  if (value.type !== 'reference') {
    ctx.addError('V002', `Type mismatch: expected reference`, 'reference', value.type);
    return;
  }

  // Validate target path pattern if specified
  if (schemaType.kind === 'reference' && schemaType.targetPath && value.type === 'reference') {
    const escapedPattern = escapeRegex(schemaType.targetPath).replace(/\\\*/g, '.*');
    const regex = new RegExp('^' + escapedPattern + '$');
    if (!regex.test(value.path)) {
      ctx.addError(
        'V004',
        `Reference target does not match pattern`,
        schemaType.targetPath,
        value.path
      );
    }
  }
});

// Binary validator (with optional algorithm validation)
registerTypeValidator('binary', (ctx, value, schemaType) => {
  if (value.type !== 'binary') {
    ctx.addError('V002', `Type mismatch: expected binary`, 'binary', value.type);
    return;
  }

  if (schemaType.kind === 'binary' && schemaType.algorithm && value.type === 'binary') {
    if (value.algorithm !== schemaType.algorithm) {
      ctx.addError('V002', `Binary algorithm mismatch`, schemaType.algorithm, value.algorithm);
    }
  }
});

// Enum validator
registerTypeValidator('enum', (ctx, value, schemaType) => {
  if (value.type !== 'string') {
    ctx.addError('V002', `Type mismatch: expected string for enum`, 'string', value.type);
    return;
  }

  if (schemaType.kind === 'enum' && !schemaType.values.includes(value.value)) {
    ctx.addError('V005', `Invalid enum value`, schemaType.values, value.value);
  }
});

// Union validation is handled in validate.ts (requires special error context)

// Type reference validator
registerTypeValidator('typeRef', (ctx, _value, schemaType) => {
  if (schemaType.kind !== 'typeRef' || !ctx.lookupType) {
    return;
  }

  const typeDef = ctx.lookupType(schemaType.name);
  if (!typeDef) {
    ctx.addError('V002', `Unknown type reference: ${schemaType.name}`, schemaType.name, undefined);
  }
  // Type refs are validated at the object level
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
