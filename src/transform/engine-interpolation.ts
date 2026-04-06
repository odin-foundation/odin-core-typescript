/**
 * ODIN Transform Engine - String Interpolation
 *
 * Standalone functions for interpolating ${...} expressions in string templates.
 * Supports path resolution and inline verb expressions.
 */

import type { TransformValue, TransformContext, ValueExpression } from '../types/transform.js';
import { transformValueToString } from './engine-value-utils.js';
import { SECURITY_LIMITS } from '../utils/security-limits.js';

// ─────────────────────────────────────────────────────────────────────────────
// Path and Expression Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a path value from the transform context.
 */
export type PathValueResolver = (path: string, context: TransformContext) => TransformValue;

/**
 * Evaluate a transform expression.
 */
export type ExpressionEvaluator = (
  expr: ValueExpression,
  context: TransformContext
) => TransformValue;

// ─────────────────────────────────────────────────────────────────────────────
// Inline Expression Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse arguments for inline transform expression.
 *
 * @param argsStr - Argument string (e.g., "@.field \"literal\" 123")
 * @returns Array of parsed ValueExpression arguments
 */
export function parseInlineArgs(argsStr: string): ValueExpression[] {
  const args: ValueExpression[] = [];
  let remaining = argsStr.trim();

  while (remaining.length > 0) {
    // Path expression: @path
    if (remaining.startsWith('@')) {
      const endMatch = remaining.search(/\s|$/);
      const pathEnd = endMatch > 0 ? endMatch : remaining.length;
      const path = remaining.slice(1, pathEnd);
      args.push({ type: 'copy', path });
      remaining = remaining.slice(pathEnd).trim();
      continue;
    }

    // Quoted string
    if (remaining.startsWith('"')) {
      let endQuote = 1;
      while (endQuote < remaining.length && remaining[endQuote] !== '"') {
        if (remaining[endQuote] === '\\' && endQuote + 1 < remaining.length) {
          endQuote += 2;
        } else {
          endQuote++;
        }
      }
      if (endQuote < remaining.length) {
        const value = remaining.slice(1, endQuote).replace(/\\(.)/g, '$1');
        args.push({ type: 'literal', value: { type: 'string', value } });
        remaining = remaining.slice(endQuote + 1).trim();
        continue;
      }
    }

    // Unquoted token (literal)
    const endMatch = remaining.search(/\s|$/);
    const tokenEnd = endMatch > 0 ? endMatch : remaining.length;
    const value = remaining.slice(0, tokenEnd);
    args.push({ type: 'literal', value: { type: 'string', value } });
    remaining = remaining.slice(tokenEnd).trim();
  }

  return args;
}

/**
 * Parse an inline transform expression (for interpolation).
 * Similar to parser's parseTransformExpression but simplified.
 *
 * @param raw - Raw expression string (e.g., "%upper @.name")
 * @returns Parsed ValueExpression or null if parsing fails
 */
export function parseInlineTransformExpression(raw: string): ValueExpression | null {
  const isCustom = raw.startsWith('%&');
  const start = isCustom ? 2 : 1;

  // Find verb name (ends at whitespace or end of string)
  const verbEndOffset = raw.slice(start).search(/\s/);
  const verbEnd = verbEndOffset >= 0 ? verbEndOffset + start : raw.length;
  const verb = raw.slice(start, verbEnd);

  // Parse arguments
  const argsStr = verbEnd < raw.length ? raw.slice(verbEnd).trim() : '';
  const args = parseInlineArgs(argsStr);

  return {
    type: 'transform',
    verb,
    isCustom,
    args,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// String Interpolation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interpolate ${...} expressions within a string template.
 *
 * Supports:
 * - ${@path} - Source path value
 * - ${@.path} - Current context path value
 * - ${%verb args} - Transformation verb result
 * - \${...} - Escaped (literal ${)
 *
 * @param template - Template string with ${...} expressions
 * @param context - Transform context for path resolution
 * @param resolvePathValue - Function to resolve path values
 * @param evaluateExpression - Function to evaluate verb expressions
 * @returns Interpolated TransformValue
 *
 * @example
 * interpolateString(
 *   "Policy ${@.number} for ${@.customer.name}",
 *   context,
 *   resolvePathValue,
 *   evaluateExpression
 * ) // => { type: 'string', value: 'Policy POL123 for John Doe' }
 */
export function interpolateString(
  template: string,
  context: TransformContext,
  resolvePathValue: PathValueResolver,
  evaluateExpression: ExpressionEvaluator
): TransformValue {
  // Track interpolation count to prevent resource exhaustion
  let interpolationCount = 0;
  const maxInterpolations = SECURITY_LIMITS.MAX_EXPRESSION_DEPTH * 10; // Allow reasonable nesting

  // Replace ${...} with evaluated values, handling escapes
  const result = template.replace(/\\?\$\{([^}]+)\}/g, (match, expr: string) => {
    // Limit number of interpolations to prevent DoS
    if (++interpolationCount > maxInterpolations) {
      return match; // Return unchanged when limit exceeded
    }

    // Handle escaped \${
    if (match.startsWith('\\')) {
      return '${' + expr + '}';
    }

    const trimmedExpr = expr.trim();

    // Verb expression: %verb args
    if (trimmedExpr.startsWith('%')) {
      // Parse and evaluate as transform expression
      const verbExpr = parseInlineTransformExpression(trimmedExpr);
      if (verbExpr) {
        const value = evaluateExpression(verbExpr, context);
        return transformValueToString(value);
      }
      return match; // Return unchanged if parse fails
    }

    // Path expression: @path or @.path
    if (trimmedExpr.startsWith('@')) {
      const path = trimmedExpr.slice(1); // Remove @
      const value = resolvePathValue(path, context);
      return transformValueToString(value);
    }

    // Unknown expression format
    return match;
  });

  return { type: 'string', value: result };
}
