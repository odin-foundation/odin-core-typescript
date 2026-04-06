/**
 * ODIN Schema Token Reader
 *
 * Token navigation utilities for schema parsing.
 */

import type { Token } from '../parser/tokens.js';
import { TokenType, getTokenValue, SPAN_ONLY_SENTINEL } from '../parser/tokens.js';
import { ParseError } from '../types/errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cached EOF Token
// ─────────────────────────────────────────────────────────────────────────────

const EOF_TOKEN: Token = {
  type: TokenType.EOF,
  value: '',
  line: 1,
  column: 1,
  start: 0,
  end: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Schema Token Reader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Token reader for schema parsing.
 *
 * Encapsulates token navigation, peeking, and consumption utilities.
 * Can be used independently or as part of the SchemaParserContext.
 */
export class SchemaTokenReader {
  private tokens: Token[] = [];
  private pos: number = 0;
  private source: string = '';

  /**
   * Initialize the reader with tokens and source.
   */
  init(tokens: Token[], source: string): void {
    this.tokens = tokens;
    this.pos = 0;
    this.source = source;
  }

  /**
   * Reset the reader position.
   */
  reset(): void {
    this.pos = 0;
  }

  /**
   * Get current position.
   */
  getPosition(): number {
    return this.pos;
  }

  /**
   * Set position (for backtracking).
   */
  setPosition(pos: number): void {
    this.pos = pos;
  }

  /**
   * Peek at current token without advancing.
   */
  peek(): Token {
    return this.pos < this.tokens.length ? this.tokens[this.pos]! : EOF_TOKEN;
  }

  /**
   * Peek ahead by n tokens.
   */
  peekAhead(n: number): Token {
    const idx = this.pos + n;
    return idx < this.tokens.length ? this.tokens[idx]! : EOF_TOKEN;
  }

  /**
   * Advance to next token and return current.
   */
  advance(): Token {
    const token = this.tokens[this.pos]!;
    this.pos++;
    return token;
  }

  /**
   * Check if at end of tokens.
   */
  isAtEnd(): boolean {
    if (this.pos >= this.tokens.length) return true;
    return this.tokens[this.pos]!.type === TokenType.EOF;
  }

  /**
   * Get token value with lazy extraction from source.
   */
  getTokenVal(token: Token): string {
    if (token.value !== SPAN_ONLY_SENTINEL) return token.value;
    return getTokenValue(this.source, token);
  }

  /**
   * Expect a specific token type and throw if not found.
   */
  expect(type: TokenType, message: string): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new ParseError(message, 'P001', token.line, token.column);
    }
    return this.advance();
  }

  /**
   * Skip newline tokens.
   */
  skipNewlines(): void {
    while (this.peek().type === TokenType.NEWLINE) {
      this.advance();
    }
  }

  /**
   * Skip whitespace tokens.
   */
  skipWhitespace(): void {
    while (this.peek().type === TokenType.WHITESPACE) {
      this.advance();
    }
  }

  /**
   * Consume tokens until newline or EOF.
   */
  consumeToNewline(): void {
    while (!this.isAtEnd()) {
      const type = this.peek().type;
      if (type === TokenType.NEWLINE) {
        this.advance();
        return;
      }
      if (type === TokenType.EOF) {
        return;
      }
      this.advance();
    }
  }

  /**
   * Check if current token matches type.
   */
  check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  /**
   * Match and consume if current token matches type.
   */
  match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  /**
   * Get the source string.
   */
  getSource(): string {
    return this.source;
  }

  /**
   * Get the tokens array (for backwards compatibility during migration).
   */
  getTokens(): Token[] {
    return this.tokens;
  }
}
