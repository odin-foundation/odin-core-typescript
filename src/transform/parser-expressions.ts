/**
 * ODIN Transform Parser - Expression Parsing
 *
 * Functions for parsing value expressions (@path, %verb, literals).
 */

import type { ValueExpression } from '../types/transform.js';
import { getVerbArity } from './arity.js';

/**
 * Parse a value expression from a raw string.
 *
 * Supports:
 * - Copy expressions: @path
 * - Transform expressions: %verb args
 * - Literal values: "string", #number, ##integer, #$currency, ~null
 */
export function parseValueExpression(raw: string): ValueExpression {
  const trimmed = raw.trim();

  // Copy expression: @path
  if (trimmed.startsWith('@')) {
    const pathEnd = trimmed.search(/\s+:|$/);
    const path = pathEnd > 0 ? trimmed.slice(1, pathEnd) : trimmed.slice(1);
    return { type: 'copy', path };
  }

  // Transform expression: %verb args or %&namespace.verb args
  if (trimmed.startsWith('%')) {
    return parseTransformExpression(trimmed);
  }

  // Literal expressions
  if (trimmed.startsWith('"') && trimmed.includes('"')) {
    // String literal
    const endQuote = trimmed.indexOf('"', 1);
    const value = trimmed.slice(1, endQuote);
    return { type: 'literal', value: { type: 'string', value } };
  }

  if (trimmed.startsWith('#$')) {
    // Currency literal - default to 2 decimal places
    const numPart = trimmed.slice(2).split(/\s/)[0]!;
    return {
      type: 'literal',
      value: { type: 'currency', value: parseFloat(numPart), decimalPlaces: 2 },
    };
  }

  if (trimmed.startsWith('##')) {
    // Integer literal
    const numPart = trimmed.slice(2).split(/\s/)[0]!;
    return {
      type: 'literal',
      value: { type: 'integer', value: parseInt(numPart, 10) },
    };
  }

  if (trimmed.startsWith('#')) {
    // Number literal
    const numPart = trimmed.slice(1).split(/\s/)[0]!;
    return {
      type: 'literal',
      value: { type: 'number', value: parseFloat(numPart) },
    };
  }

  if (trimmed === '~') {
    // Null literal
    return { type: 'literal', value: { type: 'null' } };
  }

  // Default: treat as string literal
  return { type: 'literal', value: { type: 'string', value: trimmed } };
}

/**
 * Parse a transform expression starting with %.
 */
export function parseTransformExpression(raw: string): ValueExpression {
  return parseTransformExpressionWithLength(raw).expr;
}

/**
 * Parse a transform expression with length tracking.
 * Returns the expression and the number of characters consumed.
 */
export function parseTransformExpressionWithLength(raw: string): {
  expr: ValueExpression;
  consumed: number;
} {
  const isCustom = raw.startsWith('%&');
  const start = isCustom ? 2 : 1;

  // Find verb name (ends at whitespace or end of string)
  const verbEndOffset = raw.slice(start).search(/\s/);
  const verbEnd = verbEndOffset >= 0 ? verbEndOffset + start : raw.length;
  const verb = raw.slice(start, verbEnd);

  // Get arity for this verb
  const arity = getVerbArity(verb);

  // Parse arguments with arity limit
  const argsStr = verbEnd < raw.length ? raw.slice(verbEnd) : '';
  const { args, consumed: argsConsumed } = parseTransformArgs(argsStr, arity);

  const totalConsumed = verbEnd + argsConsumed;

  return {
    expr: {
      type: 'transform',
      verb,
      isCustom,
      args,
    },
    consumed: totalConsumed,
  };
}

/**
 * Parse transform arguments with an optional limit on count.
 * Returns the parsed arguments and number of characters consumed.
 *
 * @param argsStr - The string to parse arguments from
 * @param limit - Maximum number of arguments to parse (-1 for unlimited/variadic)
 */
export function parseTransformArgs(
  argsStr: string,
  limit: number
): { args: ValueExpression[]; consumed: number } {
  const args: ValueExpression[] = [];
  let pos = 0;
  let remaining = argsStr;

  // Skip leading whitespace
  const leadingWs = remaining.match(/^\s*/)?.[0].length ?? 0;
  pos += leadingWs;
  remaining = remaining.slice(leadingWs);

  while (remaining.length > 0) {
    // Stop if we've reached the argument limit (unless variadic)
    if (limit >= 0 && args.length >= limit) {
      break;
    }

    // Skip modifiers (they're handled separately)
    if (remaining.startsWith(':')) {
      break;
    }

    // Parse next argument
    if (remaining.startsWith('@')) {
      // Copy expression
      const endMatch = remaining.search(/\s|$/);
      const pathEnd = endMatch > 0 ? endMatch : remaining.length;
      const path = remaining.slice(1, pathEnd);
      args.push({ type: 'copy', path });
      pos += pathEnd;
      remaining = remaining.slice(pathEnd);
    } else if (remaining.startsWith('%')) {
      // Nested transform - recursively parse with arity awareness
      const { expr, consumed } = parseTransformExpressionWithLength(remaining);
      args.push(expr);
      pos += consumed;
      remaining = remaining.slice(consumed);
    } else if (remaining.startsWith('"')) {
      // String literal - handle escaped quotes
      let endQuote = 1;
      while (endQuote < remaining.length) {
        if (remaining[endQuote] === '\\' && endQuote + 1 < remaining.length) {
          endQuote += 2; // Skip escaped character
        } else if (remaining[endQuote] === '"') {
          break;
        } else {
          endQuote++;
        }
      }
      if (endQuote < remaining.length) {
        // Unescape the string content
        const rawContent = remaining.slice(1, endQuote);
        const value = rawContent.replace(/\\(.)/g, '$1');
        args.push({
          type: 'literal',
          value: { type: 'string', value },
        });
        pos += endQuote + 1;
        remaining = remaining.slice(endQuote + 1);
      } else {
        break;
      }
    } else if (remaining.startsWith('#$')) {
      // Currency - default to 2 decimal places
      const numMatch = remaining.slice(2).match(/^[\d.]+/);
      if (numMatch) {
        args.push({
          type: 'literal',
          value: { type: 'currency', value: parseFloat(numMatch[0]), decimalPlaces: 2 },
        });
        const consumed = 2 + numMatch[0].length;
        pos += consumed;
        remaining = remaining.slice(consumed);
      } else {
        break;
      }
    } else if (remaining.startsWith('##')) {
      // Integer
      const numMatch = remaining.slice(2).match(/^-?\d+/);
      if (numMatch) {
        args.push({
          type: 'literal',
          value: { type: 'integer', value: parseInt(numMatch[0], 10) },
        });
        const consumed = 2 + numMatch[0].length;
        pos += consumed;
        remaining = remaining.slice(consumed);
      } else {
        break;
      }
    } else if (remaining.startsWith('#')) {
      // Number
      const numMatch = remaining.slice(1).match(/^-?[\d.]+/);
      if (numMatch) {
        args.push({
          type: 'literal',
          value: { type: 'number', value: parseFloat(numMatch[0]) },
        });
        const consumed = 1 + numMatch[0].length;
        pos += consumed;
        remaining = remaining.slice(consumed);
      } else {
        break;
      }
    } else {
      // Unquoted string (table name, etc.)
      const endMatch = remaining.search(/\s|$/);
      const tokenEnd = endMatch > 0 ? endMatch : remaining.length;
      const value = remaining.slice(0, tokenEnd);
      args.push({
        type: 'literal',
        value: { type: 'string', value },
      });
      pos += tokenEnd;
      remaining = remaining.slice(tokenEnd);
    }

    // Skip whitespace between arguments
    const ws = remaining.match(/^\s*/)?.[0].length ?? 0;
    pos += ws;
    remaining = remaining.slice(ws);
  }

  return { args, consumed: pos };
}
