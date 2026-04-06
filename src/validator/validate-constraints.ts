/**
 * ODIN Validator - Constraint evaluation (bounds, pattern, format, cardinality).
 */

import type { OdinValue } from '../types/values.js';
import type { SchemaField, ValidationError, ValidationWarning } from '../types/schema.js';
import { FORMAT_VALIDATORS } from './format-validators.js';
import { isUnsafeRegexPattern, safeRegexTest, MAX_REGEX_EXECUTION_MS } from './validate-redos.js';

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
  // Accept number, integer, and currency types for numeric bounds
  if (value.type === 'number' || value.type === 'integer' || value.type === 'currency') {
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
 * Validate invariant constraint (simple expression evaluation).
 */
export function validateInvariant(
  ctx: CardinalityValidationContext,
  path: string,
  constraint: { kind: 'invariant'; expression: string }
): void {
  const expr = constraint.expression.trim();

  // Try arithmetic equality: field = expr1 op expr2 (e.g., "total = subtotal + tax")
  const arithmeticMatch = expr.match(/^(\w+)\s*=\s*(\w+)\s*([+\-*/])\s*(\w+)$/);
  if (arithmeticMatch) {
    const lhsField = arithmeticMatch[1]!;
    const rhsField1 = arithmeticMatch[2]!;
    const arithOp = arithmeticMatch[3]!;
    const rhsField2 = arithmeticMatch[4]!;

    const lhsValue = resolveNumericValue(ctx, path, lhsField);
    const rhs1Value = resolveNumericValue(ctx, path, rhsField1);
    const rhs2Value = resolveNumericValue(ctx, path, rhsField2);

    if (lhsValue === undefined || rhs1Value === undefined || rhs2Value === undefined) {
      return; // Fields missing, invariant doesn't apply
    }

    let rhsResult: number;
    switch (arithOp) {
      case '+': rhsResult = rhs1Value + rhs2Value; break;
      case '-': rhsResult = rhs1Value - rhs2Value; break;
      case '*': rhsResult = rhs1Value * rhs2Value; break;
      case '/': rhsResult = rhs2Value !== 0 ? rhs1Value / rhs2Value : NaN; break;
      default: return;
    }

    // Use approximate equality for floating point
    if (Math.abs(lhsValue - rhsResult) > 0.001) {
      addError(ctx, path, 'V008', `Invariant violation: ${expr}`, `${expr} to be true`, 'false');
    }
    return;
  }

  // Try simple comparison: field OP value_or_field
  const comparisonMatch = expr.match(/^(\w+)\s*(>=|<=|>|<|==|!=|=)\s*(.+)$/);
  if (comparisonMatch) {
    const fieldName = comparisonMatch[1]!;
    const operator = comparisonMatch[2]!;
    const compareExpr = comparisonMatch[3]!.trim();

    const fullPath = path ? `${path}.${fieldName}` : fieldName;
    const value = ctx.doc.get(fullPath);

    if (value === undefined) {
      return; // Field doesn't exist, invariant doesn't apply
    }

    // Check if compare value is a field reference or a literal
    const compareFieldPath = path ? `${path}.${compareExpr}` : compareExpr;
    const compareFieldValue = ctx.doc.get(compareFieldPath);

    if (compareFieldValue !== undefined) {
      // Field-to-field comparison
      const passes = evaluateFieldComparison(value, operator, compareFieldValue);
      if (!passes) {
        addError(ctx, path, 'V008', `Invariant violation: ${expr}`, `${expr} to be true`, 'false');
      }
    } else {
      // Literal comparison
      const passes = evaluateComparison(value, operator, compareExpr);
      if (!passes) {
        addError(ctx, path, 'V008', `Invariant violation: ${expr}`, `${expr} to be true`, 'false');
      }
    }
  }
}

/**
 * Resolve a numeric value from a field name or literal.
 */
function resolveNumericValue(
  ctx: CardinalityValidationContext,
  path: string,
  fieldOrLiteral: string
): number | undefined {
  const fullPath = path ? `${path}.${fieldOrLiteral}` : fieldOrLiteral;
  const value = ctx.doc.get(fullPath);
  if (value !== undefined) {
    if (value.type === 'number' || value.type === 'integer' || value.type === 'currency') {
      return value.value;
    }
    return undefined;
  }
  // Try as literal number
  const num = parseFloat(fieldOrLiteral);
  return isNaN(num) ? undefined : num;
}

/**
 * Evaluate a field-to-field comparison.
 */
function evaluateFieldComparison(left: OdinValue, operator: string, right: OdinValue): boolean {
  const leftNum = (left.type === 'number' || left.type === 'integer' || left.type === 'currency')
    ? left.value : undefined;
  const rightNum = (right.type === 'number' || right.type === 'integer' || right.type === 'currency')
    ? right.value : undefined;

  if (leftNum !== undefined && rightNum !== undefined) {
    switch (operator) {
      case '>': return leftNum > rightNum;
      case '>=': return leftNum >= rightNum;
      case '<': return leftNum < rightNum;
      case '<=': return leftNum <= rightNum;
      case '==': case '=': return Math.abs(leftNum - rightNum) < 0.001;
      case '!=': return Math.abs(leftNum - rightNum) >= 0.001;
      default: return true;
    }
  }

  // String comparison
  if (left.type === 'string' && right.type === 'string') {
    switch (operator) {
      case '>': return left.value > right.value;
      case '>=': return left.value >= right.value;
      case '<': return left.value < right.value;
      case '<=': return left.value <= right.value;
      case '==': case '=': return left.value === right.value;
      case '!=': return left.value !== right.value;
      default: return true;
    }
  }

  return true; // Can't compare different types, skip
}

/**
 * Evaluate a simple comparison against a literal.
 */
function evaluateComparison(value: OdinValue, operator: string, compareValue: string): boolean {
  // Check for numeric types (number, integer, currency)
  const isNumeric =
    value.type === 'number' || value.type === 'integer' || value.type === 'currency';
  if (!isNumeric && value.type !== 'string') {
    return true; // Can't compare, skip
  }

  const actual = isNumeric ? value.value : value.value;
  const expected = isNumeric ? parseFloat(compareValue) : compareValue.replace(/^["']|["']$/g, '');

  switch (operator) {
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
    case '==':
    case '=':
      return actual === expected;
    case '!=':
      return actual !== expected;
    default:
      return true;
  }
}
