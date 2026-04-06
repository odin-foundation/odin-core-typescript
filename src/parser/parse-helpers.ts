/**
 * ODIN Parser Helpers - Shared utility functions for parsing.
 *
 * Consolidates repeated patterns from parser.ts:
 * - Whitespace skipping (16 occurrences)
 * - Path depth validation (2 occurrences)
 * - Negative number prefix parsing (2 occurrences)
 */

import type { Token } from './tokens.js';
import { TokenType } from './tokens.js';
import { ParseError } from '../types/errors.js';

/**
 * Skip whitespace tokens using provided peek and advance functions.
 * Replaces 16 inline `while (this.peek().type === TokenType.WHITESPACE) { this.advance(); }` patterns.
 *
 * @param peek - Function to peek at current token
 * @param advance - Function to advance to next token
 * @returns Number of whitespace tokens skipped
 */
export function skipWhitespace(peek: () => Token, advance: () => Token): number {
  let skipped = 0;
  while (peek().type === TokenType.WHITESPACE) {
    advance();
    skipped++;
  }
  return skipped;
}

/**
 * Count the nesting depth of a path (number of segments).
 *
 * @param path - The path string to analyze
 * @returns The nesting depth (1 for root, higher for nested paths)
 */
export function getPathDepth(path: string): number {
  if (!path || path === '$') return 1;
  let depth = 1;
  for (let i = 0; i < path.length; i++) {
    const ch = path.charCodeAt(i);
    if (ch === 46 /* '.' */ || ch === 91 /* '[' */) {
      depth++;
    }
  }
  return depth;
}

/**
 * Validate path depth against maximum nesting limit.
 * Throws ParseError if depth exceeds maximum.
 *
 * @param path - The path string to validate
 * @param maxDepth - Maximum allowed nesting depth
 * @param line - Line number for error reporting
 * @param column - Column number for error reporting
 * @throws ParseError if depth exceeds maxDepth
 */
export function validatePathDepth(
  path: string,
  maxDepth: number,
  line: number,
  column: number
): void {
  const depth = getPathDepth(path);
  if (depth > maxDepth) {
    throw new ParseError(
      `Maximum nesting depth exceeded: ${depth} > ${maxDepth}`,
      'P010',
      line,
      column,
      { depth, maxDepth }
    );
  }
}

/**
 * Check if current token is a negative sign (MODIFIER_DEPRECATED used as minus).
 * If so, advance past it.
 *
 * @param token - Current token to check
 * @param advance - Function to advance to next token
 * @returns true if negative sign was consumed
 */
export function parseNegativePrefix(token: Token, advance: () => Token): boolean {
  if (token.type === TokenType.MODIFIER_DEPRECATED) {
    advance();
    return true;
  }
  return false;
}

/**
 * Check if at end of value context (newline, comment, colon, or EOF).
 * Used for stopping value parsing at appropriate boundaries.
 *
 * @param token - Token to check
 * @returns true if token indicates end of value
 */
export function isValueTerminator(token: Token): boolean {
  return (
    token.type === TokenType.NEWLINE ||
    token.type === TokenType.COMMENT ||
    token.type === TokenType.COLON ||
    token.type === TokenType.EOF
  );
}
