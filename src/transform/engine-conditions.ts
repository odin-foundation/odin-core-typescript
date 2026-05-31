/**
 * ODIN Transform Engine - Conditional Evaluation
 *
 * Standalone functions for evaluating conditional expressions in transforms.
 * Supports comparison operators (=, ==, !=, <>, <, <=, >, >=) and truthy checks.
 */

import type { TransformValue, TransformContext } from '../types/transform.js';
import { isTruthy, transformValueToString } from './engine-value-utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Path Value Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a path value from the transform context.
 * Handles special paths like $accumulator, $const, _index, and aliases.
 */
export type PathValueResolver = (path: string, context: TransformContext) => TransformValue;

// ─────────────────────────────────────────────────────────────────────────────
// Condition Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a condition value (right side of comparison).
 * Handles: 'string', "string", numbers, booleans, null
 *
 * @param valuePart - Raw condition value string
 * @returns Parsed TransformValue
 *
 * @example
 * parseConditionValue("'active'")  // => { type: 'string', value: 'active' }
 * parseConditionValue("100")       // => { type: 'integer', value: 100 }
 * parseConditionValue("true")      // => { type: 'boolean', value: true }
 */
export function parseConditionValue(valuePart: string): TransformValue {
  // Single-quoted string
  if (valuePart.startsWith("'") && valuePart.endsWith("'")) {
    return { type: 'string', value: valuePart.slice(1, -1) };
  }

  // Double-quoted string
  if (valuePart.startsWith('"') && valuePart.endsWith('"')) {
    return { type: 'string', value: valuePart.slice(1, -1) };
  }

  // Boolean
  const lower = valuePart.toLowerCase();
  if (lower === 'true') return { type: 'boolean', value: true };
  if (lower === 'false') return { type: 'boolean', value: false };

  // Null
  if (lower === 'null' || lower === 'nil') return { type: 'null' };

  // Number (integer or decimal)
  const num = parseFloat(valuePart);
  if (!isNaN(num)) {
    if (Number.isInteger(num)) {
      return { type: 'integer', value: num };
    }
    return { type: 'number', value: num };
  }

  // Treat as string if no quotes but not a recognized type
  return { type: 'string', value: valuePart };
}

// ─────────────────────────────────────────────────────────────────────────────
// Value Comparison
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Try to extract a numeric value from a TransformValue for numeric comparisons.
 *
 * @param value - TransformValue to extract number from
 * @returns Number if extractable, null otherwise
 */
function tryParseNumber(value: TransformValue): number | null {
  switch (value.type) {
    case 'integer':
    case 'number':
    case 'currency':
    case 'percent':
      return value.value;
    case 'string': {
      const num = parseFloat(value.value);
      return isNaN(num) ? null : num;
    }
    default:
      return null;
  }
}

/**
 * Compare two TransformValues using the given operator.
 *
 * Supports: =, ==, !=, <>, <, <=, >, >=
 * For numeric types, compares as numbers; otherwise compares as strings.
 *
 * @param left - Left operand
 * @param operator - Comparison operator
 * @param right - Right operand
 * @returns Comparison result
 *
 * @example
 * compareConditionValues(
 *   { type: 'integer', value: 100 },
 *   '>',
 *   { type: 'integer', value: 50 }
 * ) // => true
 */
export function compareConditionValues(
  left: TransformValue,
  operator: string,
  right: TransformValue
): boolean {
  // Get comparable representations
  const leftStr = transformValueToString(left);
  const rightStr = transformValueToString(right);

  // For numeric comparisons, try to compare as numbers
  const leftNum = tryParseNumber(left);
  const rightNum = tryParseNumber(right);
  const canCompareNumeric = leftNum !== null && rightNum !== null;

  switch (operator) {
    case '=':
    case '==':
      return leftStr === rightStr;

    case '!=':
    case '<>':
      return leftStr !== rightStr;

    case '<':
      if (canCompareNumeric) return leftNum! < rightNum!;
      return leftStr < rightStr;

    case '<=':
      if (canCompareNumeric) return leftNum! <= rightNum!;
      return leftStr <= rightStr;

    case '>':
      if (canCompareNumeric) return leftNum! > rightNum!;
      return leftStr > rightStr;

    case '>=':
      if (canCompareNumeric) return leftNum! >= rightNum!;
      return leftStr >= rightStr;

    default:
      return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conditional Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a conditional expression string.
 *
 * Supports formats:
 * - Simple path (truthy check): "@.active", "policy.status"
 * - Comparison: "@.status = 'active'", "@.amount > 100", "@.type != 'VOID'"
 * - Operators: =, ==, !=, <>, <, <=, >, >=
 * - Literal comparison values: 'string', "string", numbers
 *
 * @param condition - Condition expression string
 * @param context - Transform context for path resolution
 * @param resolvePathValue - Function to resolve path values from context
 * @returns Boolean result of condition evaluation
 *
 * @example
 * evaluateCondition("@.coverageType = 'COLLISION'", context, resolvePathValue)
 * evaluateCondition("@.amount > 0", context, resolvePathValue)
 * evaluateCondition("@.isActive", context, resolvePathValue)
 */
export function evaluateCondition(
  condition: string,
  context: TransformContext,
  resolvePathValue: PathValueResolver
): boolean {
  const trimmed = condition.trim();

  // Try to parse as comparison expression
  // Pattern: path operator value
  // Operators: =, ==, !=, <>, <, <=, >, >=
  const comparisonMatch = trimmed.match(/^(@?[\w.[\]]+)\s*(=|==|!=|<>|<=|>=|<|>)\s*(.+)$/);

  if (comparisonMatch) {
    const [, pathPart, operator, valuePart] = comparisonMatch;
    const path = pathPart!.startsWith('@') ? pathPart!.slice(1) : pathPart!;
    const leftValue = resolvePathValue(path, context);

    // Parse the right side value
    const rightValue = parseConditionValue(valuePart!.trim());

    return compareConditionValues(leftValue, operator!, rightValue);
  }

  // No comparison operator - treat as truthy check on path
  const path = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  const value = resolvePathValue(path, context);

  return isTruthy(value);
}
