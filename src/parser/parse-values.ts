/**
 * ODIN Value Parsing - Type-specific value parsing utilities.
 *
 * Consolidates repeated value parsing patterns from parser.ts:
 * - Boolean parsing (2 occurrences)
 * - Number parsing (3 occurrences for different prefixes)
 * - Binary parsing
 *
 * Also provides pre-allocated singleton values for performance.
 */

import type { Token } from './tokens.js';
import { TokenType } from './tokens.js';
import type { OdinValue, OdinModifiers } from '../types/values.js';
import { ParseError } from '../types/errors.js';
import { decodeBase64 } from './parse-utils.js';
import { parseNegativePrefix } from './parse-helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Base64 Validation
// ─────────────────────────────────────────────────────────────────────────────

/** Valid Base64 characters (without padding) */
const BASE64_CHARS_REGEX = /^[A-Za-z0-9+/]*$/;

/**
 * Validate Base64 string for character set and padding.
 * Returns ParseError if invalid, null if valid.
 */
function validateBase64String(base64: string, token: Token): ParseError | null {
  // Empty string is valid (empty binary)
  if (base64.length === 0) {
    return null;
  }

  // Find padding position
  const paddingIdx = base64.indexOf('=');
  const contentPart = paddingIdx !== -1 ? base64.slice(0, paddingIdx) : base64;
  const paddingPart = paddingIdx !== -1 ? base64.slice(paddingIdx) : '';

  // Validate content characters (A-Za-z0-9+/)
  if (!BASE64_CHARS_REGEX.test(contentPart)) {
    return new ParseError('Invalid Base64 character', 'P001', token.line, token.column, {
      value: base64,
    });
  }

  // Validate padding
  if (paddingPart.length > 0) {
    // Padding must only contain '='
    if (!/^={1,2}$/.test(paddingPart)) {
      return new ParseError('Invalid Base64 padding', 'P001', token.line, token.column, {
        value: base64,
      });
    }

    // Total length must be multiple of 4
    if (base64.length % 4 !== 0) {
      return new ParseError('Invalid Base64 padding', 'P001', token.line, token.column, {
        value: base64,
      });
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-allocated Singleton Values
// ─────────────────────────────────────────────────────────────────────────────

/** Pre-allocated default modifiers object (empty = no modifiers) */
export const DEFAULT_MODIFIERS: OdinModifiers = {};

/** Pre-allocated singleton null value */
export const NULL_VALUE: OdinValue = { type: 'null' };

/** Pre-allocated singleton boolean values */
export const TRUE_VALUE: OdinValue = { type: 'boolean', value: true };
export const FALSE_VALUE: OdinValue = { type: 'boolean', value: false };

// ─────────────────────────────────────────────────────────────────────────────
// Parsing Context Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context object providing token access methods.
 * Passed to parsing functions to avoid tight coupling to Parser class.
 */
export interface ParseContext {
  peek: () => Token;
  advance: () => Token;
  getTokenVal: (token: Token) => string;
  isAtEnd: () => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Boolean Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a boolean value from the current token position.
 * Handles both prefixed (?true) and bare (true/false) forms.
 *
 * @param token - Current token (PREFIX_BOOLEAN or BOOLEAN)
 * @param ctx - Parse context with token methods
 * @returns OdinValue with boolean type
 * @throws ParseError if expected boolean not found
 */
export function parseBoolean(token: Token, ctx: ParseContext): OdinValue {
  if (token.type === TokenType.PREFIX_BOOLEAN) {
    ctx.advance();
    const boolToken = ctx.peek();
    if (boolToken.type === TokenType.BOOLEAN) {
      ctx.advance();
      return ctx.getTokenVal(boolToken) === 'true' ? TRUE_VALUE : FALSE_VALUE;
    }
    throw new ParseError(
      'Expected "true" or "false" after ? prefix',
      'P006',
      token.line,
      token.column
    );
  }

  if (token.type === TokenType.BOOLEAN) {
    ctx.advance();
    return ctx.getTokenVal(token) === 'true' ? TRUE_VALUE : FALSE_VALUE;
  }

  throw new ParseError('Expected boolean value', 'P006', token.line, token.column);
}

// ─────────────────────────────────────────────────────────────────────────────
// Number Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a typed number value after the type prefix has been consumed.
 * Handles number (#), integer (##), currency (#$), and percent (#%) types.
 *
 * Currency values can have an optional currency code suffix: #$99.99:USD
 * When no code is specified, local currency is assumed.
 *
 * @param kind - The number type to parse
 * @param ctx - Parse context with token methods
 * @returns OdinValue with appropriate number type
 * @throws ParseError if expected number not found
 */
export function parseTypedNumber(
  kind: 'number' | 'integer' | 'currency' | 'percent',
  ctx: ParseContext
): OdinValue {
  const token = ctx.peek();
  const negative = parseNegativePrefix(token, ctx.advance);

  const numToken = ctx.peek();
  if (numToken.type !== TokenType.NUMBER) {
    const prefixMap = { integer: '##', currency: '#$', percent: '#%', number: '#' };
    const prefix = prefixMap[kind];
    throw new ParseError(
      `Expected number after ${prefix} prefix but found unexpected token`,
      'P006',
      numToken.line,
      numToken.column
    );
  }

  ctx.advance();
  const rawStr = ctx.getTokenVal(numToken);
  let value = parseFloat(rawStr);
  if (negative) value = -value;

  if (kind === 'currency') {
    const eIndex = rawStr.toLowerCase().indexOf('e');
    const numPart = eIndex >= 0 ? rawStr.substring(0, eIndex) : rawStr;
    const dotIndex = numPart.indexOf('.');
    const decimalPlaces = dotIndex === -1 ? 0 : numPart.length - dotIndex - 1;
    const raw = negative ? `-${rawStr}` : rawStr;

    // Check for optional currency code suffix (:USD, :EUR, etc.)
    let currencyCode: string | undefined;
    const nextToken = ctx.peek();
    if (nextToken.type === TokenType.COLON) {
      ctx.advance(); // consume :
      const codeToken = ctx.peek();
      if (codeToken.type === TokenType.IDENTIFIER) {
        currencyCode = ctx.getTokenVal(codeToken).toUpperCase();
        ctx.advance(); // consume currency code
      }
    }

    const result: OdinValue = {
      type: 'currency',
      value,
      decimalPlaces: Math.max(2, decimalPlaces),
      raw,
    };
    if (currencyCode) {
      (result as { currencyCode?: string }).currencyCode = currencyCode;
    }
    return result;
  }

  if (kind === 'percent') {
    const raw = negative ? `-${rawStr}` : rawStr;
    return {
      type: 'percent',
      value,
      raw,
    };
  }

  if (kind === 'integer') {
    const intValue = Math.trunc(value);
    const rawInt = negative ? `-${rawStr}` : rawStr;
    // Preserve raw for large integers that may lose precision
    if (!Number.isSafeInteger(intValue) || rawStr.length > 15) {
      return {
        type: 'integer',
        value: intValue,
        raw: rawInt,
      };
    }
    return {
      type: 'integer',
      value: intValue,
    };
  }

  // Regular number - store raw string for high-precision round-trip
  const rawNumber = negative ? `-${rawStr}` : rawStr;
  return {
    type: 'number',
    value,
    raw: rawNumber,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Binary Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a binary value after the ^ prefix has been consumed.
 * Handles optional algorithm prefix (e.g., ^sha256:...).
 *
 * @param ctx - Parse context with token methods
 * @param tokens - Full token array for lookahead
 * @param pos - Current position in token array
 * @returns OdinValue with binary type
 * @throws ParseError if invalid base64 data
 */
export function parseBinaryValue(ctx: ParseContext, tokens: Token[], pos: number): OdinValue {
  let algorithm: string | undefined;
  let base64 = '';

  const token = ctx.peek();

  // Check for algorithm prefix (e.g., sha256:)
  if (token.type === TokenType.IDENTIFIER) {
    const value = ctx.getTokenVal(token);
    const colonIdx = value.indexOf(':');

    if (colonIdx > 0 && colonIdx < value.length - 1) {
      // Identifier contains colon (e.g., "SHA256:SGVsbG8")
      // This happens when namespace colon scanning consumed the colon
      algorithm = value.slice(0, colonIdx);
      base64 = value.slice(colonIdx + 1);
      ctx.advance();
    } else {
      // Check for separate COLON token
      const nextToken = tokens[pos + 1];
      if (nextToken && nextToken.type === TokenType.COLON) {
        algorithm = value;
        ctx.advance(); // consume algorithm name
        ctx.advance(); // consume colon
      }
    }
  }

  // Collect base64 content
  while (
    !ctx.isAtEnd() &&
    ctx.peek().type !== TokenType.NEWLINE &&
    ctx.peek().type !== TokenType.COMMENT
  ) {
    const t = ctx.peek();
    if (
      t.type === TokenType.IDENTIFIER ||
      t.type === TokenType.NUMBER ||
      t.type === TokenType.STRING_BARE
    ) {
      base64 += ctx.getTokenVal(t);
      ctx.advance();
    } else if (t.type === TokenType.EQUALS) {
      base64 += '=';
      ctx.advance();
    } else {
      break;
    }
  }

  // Validate Base64 string before decoding
  const base64Error = validateBase64String(base64, token);
  if (base64Error) {
    throw base64Error;
  }

  let data: Uint8Array;
  try {
    data = decodeBase64(base64);
  } catch {
    throw new ParseError('Invalid base64 data', 'P001', token.line, token.column);
  }

  if (algorithm) {
    return { type: 'binary', data, algorithm };
  }
  return { type: 'binary', data };
}
