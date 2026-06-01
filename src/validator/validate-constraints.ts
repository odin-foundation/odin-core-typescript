/**
 * ODIN Validator - Constraint evaluation (bounds, pattern, format, cardinality).
 */

import type { OdinValue } from '../types/values.js';
import type { SchemaField, ValidationError, ValidationWarning } from '../types/schema.js';
import { FORMAT_VALIDATORS } from './format-validators.js';
import { isUnsafeRegexPattern, safeRegexTest, MAX_REGEX_EXECUTION_MS } from './validate-redos.js';
import { evaluateInvariant, type FieldResolver } from './invariant-evaluator.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constraint Validation Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validation context interface for constraint evaluation.
 */
export interface ConstraintValidationContext {
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Add an error to the context.
 */
export function addError(
  ctx: ConstraintValidationContext,
  path: string,
  code: string,
  message: string,
  expected?: unknown,
  actual?: unknown,
  schemaPath?: string
): void {
  const error: {
    path: string;
    code: string;
    message: string;
    expected?: unknown;
    actual?: unknown;
    schemaPath?: string;
  } = { path, code, message };
  if (expected !== undefined) error.expected = expected;
  if (actual !== undefined) error.actual = actual;
  if (schemaPath !== undefined) error.schemaPath = schemaPath;
  ctx.errors.push(error);
}

/**
 * Add a warning to the context.
 */
export function addWarning(
  ctx: ConstraintValidationContext,
  path: string,
  code: string,
  message: string
): void {
  ctx.warnings.push({ path, code, message });
}

// ─────────────────────────────────────────────────────────────────────────────
// Constraint Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a constraint on a value.
 */
export function validateConstraint(
  ctx: ConstraintValidationContext,
  path: string,
  value: OdinValue,
  constraint: SchemaField['constraints'][0]
): void {
  switch (constraint.kind) {
    case 'bounds':
      validateBounds(ctx, path, value, constraint);
      break;

    case 'pattern':
      validatePattern(ctx, path, value, constraint);
      break;

    case 'enum':
      if (value.type === 'string' && !constraint.values.includes(value.value)) {
        addError(ctx, path, 'V005', `Invalid enum value`, constraint.values, value.value);
      }
      break;

    case 'size':
      if (value.type === 'binary') {
        const size = value.data.length;
        if (constraint.min !== undefined && size < constraint.min) {
          addError(ctx, path, 'V003', `Binary size below minimum`, `>= ${constraint.min}`, size);
        }
        if (constraint.max !== undefined && size > constraint.max) {
          addError(ctx, path, 'V003', `Binary size above maximum`, `<= ${constraint.max}`, size);
        }
      }
      break;

    case 'format':
      validateFormat(ctx, path, value, constraint);
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounds Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate bounds constraint.
 */
export function validateBounds(
  ctx: ConstraintValidationContext,
  path: string,
  value: OdinValue,
  constraint: { kind: 'bounds'; min?: number | string; max?: number | string }
): void {
  // Accept number, integer, currency, and percent types for numeric bounds
  if (
    value.type === 'number' ||
    value.type === 'integer' ||
    value.type === 'currency' ||
    value.type === 'percent'
  ) {
    const num = value.value;
    if (constraint.min !== undefined && num < (constraint.min as number)) {
      addError(ctx, path, 'V003', `Value below minimum`, `>= ${constraint.min}`, num);
    }
    if (constraint.max !== undefined && num > (constraint.max as number)) {
      addError(ctx, path, 'V003', `Value above maximum`, `<= ${constraint.max}`, num);
    }
  } else if (value.type === 'string') {
    // Length bounds for strings
    const len = value.value.length;
    if (constraint.min !== undefined && len < (constraint.min as number)) {
      addError(ctx, path, 'V003', `String length below minimum`, `>= ${constraint.min}`, len);
    }
    if (constraint.max !== undefined && len > (constraint.max as number)) {
      addError(ctx, path, 'V003', `String length above maximum`, `<= ${constraint.max}`, len);
    }
  } else if (value.type === 'binary') {
    // Byte-length bounds for binary values
    const len = value.data.length;
    if (constraint.min !== undefined && len < (constraint.min as number)) {
      addError(ctx, path, 'V003', `Binary size below minimum`, `>= ${constraint.min}`, len);
    }
    if (constraint.max !== undefined && len > (constraint.max as number)) {
      addError(ctx, path, 'V003', `Binary size above maximum`, `<= ${constraint.max}`, len);
    }
  } else if (value.type === 'date' || value.type === 'timestamp') {
    // Date bounds
    const dateValue = value.value;
    if (constraint.min !== undefined) {
      const minDate = new Date(constraint.min as string);
      if (dateValue < minDate) {
        addError(
          ctx,
          path,
          'V003',
          `Date below minimum`,
          `>= ${constraint.min}`,
          dateValue.toISOString()
        );
      }
    }
    if (constraint.max !== undefined) {
      const maxDate = new Date(constraint.max as string);
      if (dateValue > maxDate) {
        addError(
          ctx,
          path,
          'V003',
          `Date above maximum`,
          `<= ${constraint.max}`,
          dateValue.toISOString()
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate pattern constraint.
 * Includes ReDoS protection for user-provided schema patterns.
 */
export function validatePattern(
  ctx: ConstraintValidationContext,
  path: string,
  value: OdinValue,
  constraint: { kind: 'pattern'; pattern: string }
): void {
  if (value.type === 'string') {
    // ReDoS protection: reject dangerous patterns at the pattern level
    if (isUnsafeRegexPattern(constraint.pattern)) {
      addError(
        ctx,
        path,
        'V014',
        `Unsafe regex pattern rejected (potential ReDoS)`,
        'safe pattern',
        constraint.pattern
      );
      return;
    }

    try {
      const regex = new RegExp(constraint.pattern);

      // Use safe regex test with timing protection
      const result = safeRegexTest(regex, value.value);

      if (result.timedOut) {
        addError(
          ctx,
          path,
          'V016',
          `Pattern validation timed out or string too long`,
          `execution < ${MAX_REGEX_EXECUTION_MS}ms`,
          `${result.executionTimeMs.toFixed(1)}ms`
        );
        return;
      }

      if (!result.matched) {
        addError(
          ctx,
          path,
          'V004',
          `Value does not match pattern`,
          constraint.pattern,
          value.value
        );
      }
    } catch {
      addError(ctx, path, 'V015', `Invalid regex pattern`, 'valid regex', constraint.pattern);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Format Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a format constraint.
 */
export function validateFormat(
  ctx: ConstraintValidationContext,
  path: string,
  value: OdinValue,
  constraint: { kind: 'format'; format: string }
): void {
  // Determine the string value to validate
  let stringValue: string;
  if (value.type === 'string') {
    stringValue = value.value;
  } else if (value.type === 'date' || value.type === 'timestamp') {
    // Date/timestamp types: use the raw value if available, or ISO string
    stringValue = (value as { raw?: string }).raw ?? value.value.toISOString().split('T')[0]!;
  } else {
    return; // Format validation only applies to strings and date types
  }

  const validator = FORMAT_VALIDATORS[constraint.format];
  if (!validator) {
    // Unknown format - add warning but don't fail
    addWarning(ctx, path, 'W002', `Unknown format '${constraint.format}' - skipping validation`);
    return;
  }

  const isValid = typeof validator === 'function' ? validator(stringValue) : validator.test(stringValue);
  if (!isValid) {
    addError(
      ctx,
      path,
      'V004',
      `Value does not match format '${constraint.format}'`,
      constraint.format,
      value.value
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cardinality Validation
// ─────────────────────────────────────────────────────────────────────────────

import type { OdinDocument } from '../types/document.js';

/**
 * Context for cardinality validation (needs document access).
 */
export interface CardinalityValidationContext extends ConstraintValidationContext {
  doc: OdinDocument;
}

/**
 * Validate cardinality constraint.
 */
export function validateCardinality(
  ctx: CardinalityValidationContext,
  path: string,
  constraint: {
    kind: 'cardinality';
    type: 'of' | 'one_of' | 'exactly_one' | 'at_most_one';
    min?: number;
    max?: number;
    fields: string[];
  }
): void {
  // Count how many of the fields are present
  let count = 0;
  for (const field of constraint.fields) {
    const fullPath = path ? `${path}.${field}` : field;
    if (ctx.doc.get(fullPath) !== undefined) {
      count++;
    }
  }

  switch (constraint.type) {
    case 'of':
      // Validate that field count falls within specified min/max bounds
      if (constraint.min !== undefined && count < constraint.min) {
        addError(
          ctx,
          path,
          'V009',
          `Too few fields present`,
          `at least ${constraint.min} of ${constraint.fields.join(', ')}`,
          `${count} present`
        );
      }
      if (constraint.max !== undefined && count > constraint.max) {
        addError(
          ctx,
          path,
          'V009',
          `Too many fields present`,
          `at most ${constraint.max} of ${constraint.fields.join(', ')}`,
          `${count} present`
        );
      }
      break;

    case 'one_of':
      // Validate that count is at least one
      if (count === 0) {
        addError(
          ctx,
          path,
          'V009',
          `At least one field required`,
          `one of ${constraint.fields.join(', ')}`,
          'none present'
        );
      }
      break;

    case 'exactly_one':
      // Validate that count equals exactly one
      if (count !== 1) {
        addError(
          ctx,
          path,
          'V009',
          `Exactly one field required`,
          `exactly one of ${constraint.fields.join(', ')}`,
          `${count} present`
        );
      }
      break;

    case 'at_most_one':
      // Validate that count does not exceed one
      if (count > 1) {
        addError(
          ctx,
          path,
          'V009',
          `At most one field allowed`,
          `at most one of ${constraint.fields.join(', ')}`,
          `${count} present`
        );
      }
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate invariant constraint by evaluating its full expression grammar.
 *
 * A null operand makes the expression false (V008). Absent operands make the
 * invariant inapplicable. A malformed expression is reported as V008.
 */
export function validateInvariant(
  ctx: CardinalityValidationContext,
  path: string,
  constraint: { kind: 'invariant'; expression: string }
): void {
  const expr = constraint.expression.trim();

  const resolve: FieldResolver = (name) => {
    const fullPath = path ? `${path}.${name}` : name;
    return ctx.doc.get(fullPath);
  };

  let result;
  try {
    result = evaluateInvariant(expr, resolve);
  } catch {
    addError(ctx, path, 'V008', `Invalid invariant expression: ${expr}`, `${expr} to be valid`, 'parse error');
    return;
  }

  // Absent operands: invariant does not apply.
  if (result.value === undefined && !result.nullOperand) {
    return;
  }

  if (result.value === false) {
    addError(
      ctx,
      path,
      'V008',
      `Invariant violation: ${expr}`,
      `${expr} to be true`,
      result.nullOperand ? 'null operand' : 'false'
    );
  }
}
