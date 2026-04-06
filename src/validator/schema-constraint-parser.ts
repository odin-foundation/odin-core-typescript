/**
 * ODIN Schema Parser - Constraint parsing (bounds, patterns, enums, conditionals).
 */

import { TokenType } from '../parser/tokens.js';
import type { SchemaConstraint, SchemaConditional, ConditionalOperator } from '../types/schema.js';
import type { FieldAccumulator, ConditionalParseResult } from './schema-parser-types.js';
import type { SchemaTokenReader } from './schema-token-reader.js';

// ─────────────────────────────────────────────────────────────────────────────
// Bounds Parsing Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of parsing bounds constraint.
 * Includes the constraint and any pending conditional found in the same token.
 */
export interface BoundsParseResult {
  constraint: SchemaConstraint | null;
  pendingConditional?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constraint Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse constraints: :(bounds), :/pattern/, :unique, :format
 * Returns any pending conditional string found in bounds parsing.
 */
export function parseConstraints(
  reader: SchemaTokenReader,
  field: FieldAccumulator
): string | undefined {
  if (reader.peek().type !== TokenType.COLON) return undefined;

  // Peek ahead to check if this is a constraint or conditional
  const nextToken = reader.peekAhead(1);
  if (nextToken.type === TokenType.IDENTIFIER) {
    const val = reader.getTokenVal(nextToken);
    if (
      val === 'if' ||
      val === 'unless' ||
      val === 'invariant' ||
      val === 'of' ||
      val === 'one_of' ||
      val === 'exactly_one' ||
      val === 'at_most_one'
    ) {
      return undefined; // Not a constraint, it's a conditional or object constraint
    }
  }

  reader.advance(); // consume :

  const token = reader.peek();
  const val = reader.getTokenVal(token);

  // Unique constraint
  if (val === 'unique') {
    reader.advance();
    field.constraints.push({ kind: 'unique' });
    return undefined;
  }

  // Format constraint :format email, :format url, etc.
  if (val === 'format') {
    reader.advance(); // consume 'format'
    reader.skipWhitespace();
    const formatToken = reader.peek();
    if (formatToken.type === TokenType.IDENTIFIER || formatToken.type === TokenType.STRING_BARE) {
      const formatName = reader.getTokenVal(formatToken);
      reader.advance();
      field.constraints.push({ kind: 'format', format: formatName });
    }
    return undefined;
  }

  // Computed directive :computed
  if (val === 'computed') {
    reader.advance();
    field.computed = true;
    return undefined;
  }

  // Immutable directive :immutable
  if (val === 'immutable') {
    reader.advance();
    field.immutable = true;
    return undefined;
  }

  // Pattern constraint :/regex/ or :|regex|
  if (val.length > 0 && '/|#~'.includes(val[0]!)) {
    const constraint = parsePatternConstraint(reader, val[0]!);
    if (constraint) {
      field.constraints.push(constraint);
    }
    return undefined;
  }

  // Bounds constraint (min..max) - val could be "(3..10)" or just "("
  if (val.startsWith('(') || token.type === TokenType.NUMBER) {
    const result = parseBoundsConstraint(reader);
    if (result.constraint) {
      field.constraints.push(result.constraint);
    }
    return result.pendingConditional;
  }

  return undefined;
}

/**
 * Parse pattern constraint.
 * Pattern can be: :/regex/ or :|regex|
 *
 * Because the tokenizer may break regex patterns containing characters like
 * `{`, `}`, `[`, `]` into header/array tokens, we extract the pattern
 * directly from the source string using character offsets.
 */
export function parsePatternConstraint(
  reader: SchemaTokenReader,
  delimiter: string
): SchemaConstraint | null {
  const token = reader.peek();
  const source = reader.getSource();

  // The current token starts with the delimiter (e.g., "/^[A-Z]" or "/")
  // We need to find the closing delimiter in the raw source text
  const patternStart = token.start + 1; // skip opening delimiter character

  // Find the closing delimiter in the source, searching from patternStart
  // We need to find the LAST occurrence of the delimiter on this line
  const lineEnd = source.indexOf('\n', patternStart);
  const searchEnd = lineEnd === -1 ? source.length : lineEnd;
  const lineSlice = source.substring(patternStart, searchEnd);
  const closingIdx = lineSlice.lastIndexOf(delimiter);

  let pattern: string;
  let consumeUntil: number;

  if (closingIdx > 0) {
    pattern = lineSlice.substring(0, closingIdx);
    consumeUntil = patternStart + closingIdx + 1; // past closing delimiter
  } else {
    // No closing delimiter found - use everything to end of line
    pattern = lineSlice.trim();
    consumeUntil = searchEnd;
  }

  // Advance the reader past all tokens that fall within the pattern range
  while (!reader.isAtEnd()) {
    const t = reader.peek();
    if (t.type === TokenType.NEWLINE || t.type === TokenType.EOF) break;
    if (t.start >= consumeUntil) break;
    reader.advance();
  }

  if (pattern) {
    return { kind: 'pattern', pattern };
  }
  return null;
}

/**
 * Parse bounds constraint.
 * Bounds can be: (3..10), (3..), (..10), or (3)
 * Returns the constraint and any pending conditional string found in the same token.
 */
export function parseBoundsConstraint(reader: SchemaTokenReader): BoundsParseResult {
  const token = reader.peek();
  const tokenVal = reader.getTokenVal(token);

  // Check if entire bounds is in one token (e.g., "(3..10)" or "(3..10):if")
  if (tokenVal.startsWith('(') && tokenVal.includes(')')) {
    reader.advance(); // consume the token
    // Extract content between parens
    const openIdx = tokenVal.indexOf('(');
    const closeIdx = tokenVal.lastIndexOf(')');
    if (closeIdx > openIdx) {
      const content = tokenVal.substring(openIdx + 1, closeIdx);
      // Check for :if after the closing paren
      const afterParen = tokenVal.substring(closeIdx + 1);
      if (afterParen.includes(':if')) {
        return {
          constraint: parseBoundsFromString(content),
          pendingConditional: afterParen,
        };
      }
      return { constraint: parseBoundsFromString(content) };
    }
    return { constraint: null };
  }

  // Handle token-by-token parsing
  let min: number | string | undefined;
  let max: number | string | undefined;

  // Skip opening paren if present
  if (tokenVal === '(') {
    reader.advance();
  }

  // Parse min value
  if (reader.peek().type === TokenType.NUMBER) {
    min = parseFloat(reader.getTokenVal(reader.peek()));
    reader.advance();
  } else if (reader.peek().type === TokenType.DATE) {
    min = reader.getTokenVal(reader.peek());
    reader.advance();
  }

  // Check for ..
  if (reader.peek().type === TokenType.DOT) {
    reader.advance();
    if (reader.peek().type === TokenType.DOT) {
      reader.advance();
    }
  }

  // Parse max value
  if (reader.peek().type === TokenType.NUMBER) {
    max = parseFloat(reader.getTokenVal(reader.peek()));
    reader.advance();
  } else if (reader.peek().type === TokenType.DATE) {
    max = reader.getTokenVal(reader.peek());
    reader.advance();
  }

  // Skip closing paren if present
  const endVal = reader.getTokenVal(reader.peek());
  if (endVal === ')') {
    reader.advance();
  }

  if (min !== undefined || max !== undefined) {
    const constraint: SchemaConstraint = { kind: 'bounds' };
    if (min !== undefined) {
      (constraint as { kind: 'bounds'; min?: number | string }).min = min;
    }
    if (max !== undefined) {
      (constraint as { kind: 'bounds'; max?: number | string }).max = max;
    }
    return { constraint };
  }
  return { constraint: null };
}

/**
 * Parse bounds from a string like "3..10", "3..", "..10", or "3"
 */
export function parseBoundsFromString(content: string): SchemaConstraint | null {
  let min: number | string | undefined;
  let max: number | string | undefined;

  const trimmed = content.trim();
  if (trimmed.includes('..')) {
    const parts = trimmed.split('..');
    const minStr = parts[0]?.trim();
    const maxStr = parts[1]?.trim();
    if (minStr) {
      min = parseFloat(minStr);
      if (isNaN(min)) min = minStr; // date string
    }
    if (maxStr) {
      max = parseFloat(maxStr);
      if (isNaN(max)) max = maxStr; // date string
    }
  } else {
    // Exact value like (3) means min = max
    const val = parseFloat(trimmed);
    if (!isNaN(val)) {
      min = val;
      max = val;
    }
  }

  if (min !== undefined || max !== undefined) {
    const constraint: SchemaConstraint = { kind: 'bounds' };
    if (min !== undefined) {
      (constraint as { kind: 'bounds'; min?: number | string }).min = min;
    }
    if (max !== undefined) {
      (constraint as { kind: 'bounds'; max?: number | string }).max = max;
    }
    return constraint;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conditional Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse conditional fields: :if field op value
 * Supported operators: =, !=, >, <, >=, <=
 *
 * @param reader - Token reader
 * @param field - Field accumulator to add conditionals to
 * @param pendingConditionalString - Optional string from bounds parsing containing :if
 */
export function parseConditionals(
  reader: SchemaTokenReader,
  field: FieldAccumulator,
  pendingConditionalString?: string
): void {
  // First, check if we have pending conditional from bounds parsing
  if (pendingConditionalString) {
    const ifMatch = pendingConditionalString.match(/:if\s+(\w+)\s*/);
    if (ifMatch) {
      const condField = ifMatch[1] || '';

      reader.skipWhitespace();
      const { operator, value } = parseConditionalOperatorAndValue(reader);

      if (condField && operator) {
        field.conditionals.push({ field: condField, operator, value });
      }
    }
  }

  // Then check for :if as separate tokens
  while (reader.peek().type === TokenType.COLON) {
    const nextToken = reader.peekAhead(1);
    if (nextToken.type === TokenType.EOF) break;
    if (nextToken.type !== TokenType.IDENTIFIER) break;

    const keyword = reader.getTokenVal(nextToken);
    if (keyword !== 'if' && keyword !== 'unless') break;
    const isUnless = keyword === 'unless';

    reader.advance(); // :
    reader.advance(); // if/unless
    reader.skipWhitespace();

    // Parse condition field
    let condField = '';
    while (reader.peek().type === TokenType.IDENTIFIER || reader.peek().type === TokenType.DOT) {
      if (reader.peek().type === TokenType.DOT) {
        condField += '.';
      } else {
        condField += reader.getTokenVal(reader.peek());
      }
      reader.advance();
    }

    reader.skipWhitespace();

    // Parse operator and value
    const { operator, value } = parseConditionalOperatorAndValue(reader);

    const conditional: SchemaConditional = {
      field: condField,
      operator,
      value,
    };
    if (isUnless) {
      conditional.unless = true;
    }
    field.conditionals.push(conditional);
  }
}

/**
 * Parse conditional operator and value.
 */
export function parseConditionalOperatorAndValue(
  reader: SchemaTokenReader
): ConditionalParseResult {
  let operator: ConditionalOperator = '=';
  const token = reader.peek();

  // Check for operator
  if (token.type === TokenType.MODIFIER_CRITICAL) {
    // != operator
    reader.advance(); // !
    reader.expect(TokenType.EQUALS, 'Expected = after ! in conditional');
    operator = '!=';
  } else if (token.type === TokenType.GREATER_THAN) {
    reader.advance(); // >
    if (reader.peek().type === TokenType.EQUALS) {
      reader.advance(); // =
      operator = '>=';
    } else {
      operator = '>';
    }
  } else if (token.type === TokenType.LESS_THAN) {
    reader.advance(); // <
    if (reader.peek().type === TokenType.EQUALS) {
      reader.advance(); // =
      operator = '<=';
    } else {
      operator = '<';
    }
  } else if (token.type === TokenType.EQUALS) {
    reader.advance(); // =
    operator = '=';
  } else {
    // No explicit operator - shorthand for `:if field` meaning `:if field = true`
    return { operator: '=', value: true };
  }

  reader.skipWhitespace();

  // Parse condition value
  const valueToken = reader.peek();
  let value: string | number | boolean;

  if (valueToken.type === TokenType.BOOLEAN) {
    value = reader.getTokenVal(valueToken) === 'true';
    reader.advance();
  } else if (valueToken.type === TokenType.NUMBER) {
    value = parseFloat(reader.getTokenVal(valueToken));
    reader.advance();
  } else if (valueToken.type === TokenType.IDENTIFIER) {
    value = reader.getTokenVal(valueToken);
    reader.advance();
  } else if (valueToken.type === TokenType.STRING_QUOTED) {
    value = reader.getTokenVal(valueToken);
    reader.advance();
  } else {
    value = true; // Default to true for boolean check
  }

  return { operator, value };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enum Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse enum values: (value1, value2, value3)
 */
export function parseEnumValues(reader: SchemaTokenReader): string[] {
  const values: string[] = [];
  const token = reader.peek();
  const tokenVal = reader.getTokenVal(token);

  // Check if entire enum is in one token (e.g., "(pending, active, closed)")
  if (tokenVal.startsWith('(') && tokenVal.includes(')')) {
    reader.advance(); // consume the token
    // Extract content between parens
    const openIdx = tokenVal.indexOf('(');
    const closeIdx = tokenVal.lastIndexOf(')');
    if (closeIdx > openIdx) {
      const content = tokenVal.substring(openIdx + 1, closeIdx);
      // Split by comma and trim whitespace
      const parts = content.split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          values.push(trimmed);
        }
      }
    }
    return values;
  }

  // Handle token-by-token parsing (if enum spans multiple tokens)
  if (tokenVal === '(') {
    reader.advance();
  }

  while (!reader.isAtEnd()) {
    const nextToken = reader.peek();
    const val = reader.getTokenVal(nextToken);

    if (val === ')') {
      reader.advance();
      break;
    }

    if (nextToken.type === TokenType.COMMA) {
      reader.advance();
      continue;
    }

    if (nextToken.type === TokenType.WHITESPACE) {
      reader.advance();
      continue;
    }

    if (nextToken.type === TokenType.IDENTIFIER) {
      values.push(reader.getTokenVal(nextToken));
      reader.advance();
      continue;
    }

    if (nextToken.type === TokenType.STRING_QUOTED) {
      values.push(reader.getTokenVal(nextToken));
      reader.advance();
      continue;
    }

    // For multi-line enums, skip newlines and continue parsing
    if (nextToken.type === TokenType.NEWLINE) {
      reader.advance();
      continue;
    }

    // Skip comments in multi-line enums
    if (nextToken.type === TokenType.COMMENT) {
      reader.advance();
      continue;
    }

    // Unknown token type, stop parsing
    break;
  }

  return values;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Directive Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse field directives: :computed, :immutable, :format
 */
export function parseFieldDirectives(reader: SchemaTokenReader, field: FieldAccumulator): void {
  while (reader.peek().type === TokenType.COLON) {
    const nextToken = reader.peekAhead(1);
    if (nextToken.type === TokenType.EOF) break;
    if (nextToken.type !== TokenType.IDENTIFIER) break;

    const keyword = reader.getTokenVal(nextToken);

    if (keyword === 'computed') {
      reader.advance(); // :
      reader.advance(); // computed
      field.computed = true;
      continue;
    }

    if (keyword === 'immutable') {
      reader.advance(); // :
      reader.advance(); // immutable
      field.immutable = true;
      continue;
    }

    if (keyword === 'format') {
      reader.advance(); // :
      reader.advance(); // format
      reader.skipWhitespace();
      // Parse format name
      if (reader.peek().type === TokenType.IDENTIFIER) {
        const formatName = reader.getTokenVal(reader.peek());
        reader.advance();
        field.constraints.push({ kind: 'format', format: formatName });
      } else if (reader.peek().type === TokenType.STRING_QUOTED) {
        const formatName = reader.getTokenVal(reader.peek());
        reader.advance();
        field.constraints.push({ kind: 'format', format: formatName });
      }
      continue;
    }

    // Not a recognized field directive, stop
    break;
  }
}
