/**
 * ODIN Tokenizer - Single-pass character scanner.
 */

import type { Token } from './tokens.js';
import {
  TokenType,
  createToken,
  createSpanToken,
  createSpanOnlyToken,
  isIdentifierStart,
  isWhitespace,
  isDigit,
  isBareStringChar,
} from './tokens.js';
import { ParseError } from '../types/errors.js';
import { decodeEscapes } from './parse-utils.js';
import { SECURITY_LIMITS } from '../utils/security-limits.js';

const CHAR_NEWLINE = 10;
const CHAR_CR = 13;
const CHAR_SPACE = 32;
const CHAR_TAB = 9;
const CHAR_SEMICOLON = 59;
const CHAR_LESS_THAN = 60;
const CHAR_GREATER_THAN = 62;
const CHAR_DASH = 45;
const CHAR_OPEN_BRACE = 123;
const CHAR_CLOSE_BRACE = 125;
const CHAR_EQUALS = 61;
const CHAR_DOT = 46;
const CHAR_COLON = 58;
const CHAR_COMMA = 44;
const CHAR_OPEN_BRACKET = 91;
const CHAR_HASH = 35;
const CHAR_QUESTION = 63;
const CHAR_AT = 64;
const CHAR_CARET = 94;
const CHAR_TILDE = 126;
const CHAR_AMPERSAND = 38;
const CHAR_BANG = 33;
const CHAR_ASTERISK = 42;
const CHAR_DOLLAR = 36;
const CHAR_QUOTE = 34;
const CHAR_PERCENT = 37;
const CHAR_ZERO = 48;
const CHAR_NINE = 57;
const CHAR_T = 84;
const CHAR_P = 80;

/** Tokenizer state for tabular mode handling. */
export interface TokenizerState {
  tabularMode: boolean;
  tabularColumns: string[];
}

/** Options for the tokenizer. */
export interface TokenizerOptions {
  /** When true, unknown escape sequences in strings are preserved as-is instead of throwing P005. */
  lenient?: boolean;
}

/** ODIN Tokenizer - converts source text into tokens. */
export class Tokenizer {
  private readonly source: string;
  private readonly lenient: boolean;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private state: TokenizerState = {
    tabularMode: false,
    tabularColumns: [],
  };

  constructor(source: string, options?: TokenizerOptions) {
    this.source = source;
    this.lenient = options?.lenient ?? false;
  }

  /**
   * Estimate token count for array pre-allocation.
   * Divides by 12 as empirical average: typical tokens are ~6-8 chars plus
   * delimiters (newlines, equals, spaces). The +16 buffer handles small docs.
   */
  private estimateTokenCount(): number {
    return Math.ceil(this.source.length / 12) + 16;
  }

  /** Tokenize the source into an array of tokens. */
  tokenize(): Token[] {
    const estimatedSize = this.estimateTokenCount();
    const tokens: Token[] = new Array(estimatedSize);
    let tokenCount = 0;

    while (!this.isAtEnd()) {
      const token = this.nextToken();
      if (token) {
        if (tokenCount >= tokens.length) {
          tokens.length = tokens.length * 2;
        }
        tokens[tokenCount++] = token;
      }
    }

    if (tokenCount >= tokens.length) {
      tokens.length = tokenCount + 1;
    }
    tokens[tokenCount++] = createSpanOnlyToken(
      TokenType.EOF,
      this.line,
      this.column,
      this.pos,
      this.pos
    );

    tokens.length = tokenCount;
    return tokens;
  }

  /** Get the next token, or null if skipped. */
  private nextToken(): Token | null {
    if (!this.state.tabularMode) {
      this.skipWhitespace();
    }

    if (this.pos >= this.source.length) {
      return null;
    }

    const code = this.source.charCodeAt(this.pos);
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    if (code === CHAR_NEWLINE) {
      this.advance();
      return createSpanOnlyToken(TokenType.NEWLINE, startLine, startColumn, startPos, this.pos);
    }

    if (code === CHAR_CR) {
      this.advance();
      if (this.peekCode() === CHAR_NEWLINE) {
        this.advancePos();
      }
      return createSpanOnlyToken(TokenType.NEWLINE, startLine, startColumn, startPos, this.pos);
    }

    if (code === CHAR_SEMICOLON) {
      return this.scanComment();
    }

    if (code === CHAR_DASH && this.peekCode(1) === CHAR_DASH && this.peekCode(2) === CHAR_DASH) {
      this.advance();
      this.advance();
      this.advance();
      return createSpanOnlyToken(
        TokenType.DOC_SEPARATOR,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (code === CHAR_OPEN_BRACE) {
      this.advance();
      return createSpanOnlyToken(TokenType.HEADER_OPEN, startLine, startColumn, startPos, this.pos);
    }

    if (code === CHAR_CLOSE_BRACE) {
      this.advance();
      return createSpanOnlyToken(
        TokenType.HEADER_CLOSE,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (code === CHAR_EQUALS) {
      this.advance();
      return createSpanOnlyToken(TokenType.EQUALS, startLine, startColumn, startPos, this.pos);
    }

    if (code === CHAR_LESS_THAN) {
      this.advance();
      return createSpanOnlyToken(TokenType.LESS_THAN, startLine, startColumn, startPos, this.pos);
    }

    if (code === CHAR_GREATER_THAN) {
      this.advance();
      return createSpanOnlyToken(
        TokenType.GREATER_THAN,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (code === CHAR_DOT) {
      this.advance();
      return createSpanOnlyToken(TokenType.DOT, startLine, startColumn, startPos, this.pos);
    }

    if (code === CHAR_COLON) {
      this.advance();
      return createSpanOnlyToken(TokenType.COLON, startLine, startColumn, startPos, this.pos);
    }

    if (code === CHAR_COMMA) {
      this.advance();
      return createSpanOnlyToken(TokenType.COMMA, startLine, startColumn, startPos, this.pos);
    }

    if (code === CHAR_OPEN_BRACKET) {
      return this.scanArrayIndex();
    }
    if (code === CHAR_HASH) {
      return this.scanNumberPrefix();
    }

    if (code === CHAR_QUESTION) {
      this.advance();
      return createSpanOnlyToken(
        TokenType.PREFIX_BOOLEAN,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (code === CHAR_AT) {
      // At line start (column 1), check for directive
      if (startColumn === 1) {
        const directive = this.tryParseDirective();
        if (directive) {
          return directive;
        }
      }
      // Otherwise it's a reference prefix
      this.advance();
      return createSpanOnlyToken(
        TokenType.PREFIX_REFERENCE,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (code === CHAR_CARET) {
      this.advance();
      return createSpanOnlyToken(
        TokenType.PREFIX_BINARY,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (code === CHAR_TILDE) {
      this.advance();
      return createSpanOnlyToken(TokenType.PREFIX_NULL, startLine, startColumn, startPos, this.pos);
    }

    if (code === CHAR_AMPERSAND) {
      this.advance();
      return createSpanOnlyToken(
        TokenType.PREFIX_EXTENSION,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (code === CHAR_BANG) {
      this.advance();
      return createSpanOnlyToken(
        TokenType.MODIFIER_CRITICAL,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (code === CHAR_ASTERISK) {
      this.advance();
      return createSpanOnlyToken(
        TokenType.MODIFIER_REDACTED,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    // Standalone $ for meta headers (e.g., {$target}, {$source})
    if (code === CHAR_DOLLAR) {
      this.advance();
      return createSpanOnlyToken(TokenType.PREFIX_META, startLine, startColumn, startPos, this.pos);
    }

    // Verb expression prefix (% for transforms)
    if (code === CHAR_PERCENT) {
      this.advance();
      return createSpanOnlyToken(TokenType.PREFIX_VERB, startLine, startColumn, startPos, this.pos);
    }

    // Quoted string
    if (code === CHAR_QUOTE) {
      return this.scanQuotedString();
    }

    const char = this.source[this.pos]!;

    // Identifier or keyword (true/false) or temporal
    if (isIdentifierStart(char)) {
      return this.scanIdentifierOrKeyword();
    }

    // Number (starting with digit or negative sign in certain contexts)
    if (code >= CHAR_ZERO && code <= CHAR_NINE) {
      return this.scanNumberOrTemporal();
    }

    // Negative number OR deprecated modifier
    if (code === CHAR_DASH) {
      const nextCode = this.peekCode(1);
      // If followed by digit, check for deprecated modifier + date pattern: -DDDD-
      if (nextCode >= CHAR_ZERO && nextCode <= CHAR_NINE) {
        // Look ahead: if 4 digits then dash, it's deprecated modifier before a date
        if (
          this.peekCode(2) >= CHAR_ZERO && this.peekCode(2) <= CHAR_NINE &&
          this.peekCode(3) >= CHAR_ZERO && this.peekCode(3) <= CHAR_NINE &&
          this.peekCode(4) >= CHAR_ZERO && this.peekCode(4) <= CHAR_NINE &&
          this.peekCode(5) === CHAR_DASH
        ) {
          // It's deprecated modifier + date (e.g., -2024-01-15)
          this.advance();
          return createSpanOnlyToken(
            TokenType.MODIFIER_DEPRECATED,
            startLine,
            startColumn,
            startPos,
            this.pos
          );
        }
        return this.scanNumber();
      }
      // If followed by quote, another modifier, type prefix, whitespace, newline, colon,
      // or end of input, it's the deprecated modifier
      if (
        nextCode === CHAR_QUOTE ||
        nextCode === CHAR_BANG ||
        nextCode === CHAR_ASTERISK ||
        nextCode === CHAR_HASH ||
        nextCode === CHAR_QUESTION ||
        nextCode === CHAR_AT ||
        nextCode === CHAR_CARET ||
        nextCode === CHAR_TILDE ||
        nextCode === CHAR_SPACE ||
        nextCode === CHAR_TAB ||
        nextCode === CHAR_NEWLINE ||
        nextCode === CHAR_CR ||
        nextCode === CHAR_COLON ||
        nextCode === CHAR_SEMICOLON || // comment
        nextCode === 0 // end of input (peekCode returns 0)
      ) {
        this.advance();
        return createSpanOnlyToken(
          TokenType.MODIFIER_DEPRECATED,
          startLine,
          startColumn,
          startPos,
          this.pos
        );
      }
    }

    // Whitespace in tabular mode
    if (isWhitespace(char)) {
      this.skipWhitespace();
      return this.nextToken();
    }

    // Bare string (anything else that's valid)
    if (isBareStringChar(char)) {
      return this.scanBareString();
    }

    // Unknown character
    throw new ParseError(`Unexpected character '${char}'`, 'P001', this.line, this.column, {
      char,
    });
  }

  /**
   * Try to parse a directive at line start (@import, @schema, @if).
   * Returns null if not a valid directive.
   */
  private tryParseDirective(): Token | null {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    // Peek ahead to determine directive type (don't consume yet)
    const remaining = this.source.slice(this.pos + 1, this.pos + 10);

    if (remaining.startsWith('import')) {
      this.advance(); // @
      const rest = this.scanToEndOfLine();
      return createToken(
        TokenType.DIRECTIVE_IMPORT,
        '@' + rest,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (remaining.startsWith('schema')) {
      this.advance(); // @
      const rest = this.scanToEndOfLine();
      return createToken(
        TokenType.DIRECTIVE_SCHEMA,
        '@' + rest,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (remaining.startsWith('if')) {
      this.advance(); // @
      const rest = this.scanToEndOfLine();
      return createToken(
        TokenType.DIRECTIVE_COND,
        '@' + rest,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    // Not a directive
    return null;
  }

  /**
   * Scan a comment (lines starting with ;).
   */
  private scanComment(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    this.advance(); // ;

    // Regular comment - everything after ; is comment text
    const comment = this.scanToEndOfLine();
    return createToken(
      TokenType.COMMENT,
      ';' + comment,
      startLine,
      startColumn,
      startPos,
      this.pos
    );
  }

  /**
   * Scan an array index [n].
   * Zero-copy: uses source.slice() instead of building string character-by-character.
   */
  private scanArrayIndex(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    this.advancePos(); // [

    // Check what kind of content is inside the brackets
    const firstChar = this.peek();

    if (firstChar === ']') {
      this.advancePos(); // ]
      return createSpanToken(
        TokenType.ARRAY_INDEX,
        this.source,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    // JSONPath filter expression [?(...)]
    if (firstChar === '?') {
      let depth = 1;
      let maxDepthReached = 1;
      let inString = false;
      let stringChar = '';

      this.advancePos(); // consume ?

      while (!this.isAtEnd() && depth > 0) {
        const char = this.peek();
        if (inString) {
          if (char === '\\') {
            this.advancePos();
            if (!this.isAtEnd()) this.advancePos();
          } else if (char === stringChar) {
            inString = false;
            this.advancePos();
          } else {
            this.advancePos();
          }
        } else {
          if (char === '"' || char === "'") {
            inString = true;
            stringChar = char;
            this.advancePos();
          } else if (char === '[') {
            depth++;
            maxDepthReached = Math.max(maxDepthReached, depth);
            // Security: Prevent stack overflow from deeply nested JSONPath filters
            if (maxDepthReached > SECURITY_LIMITS.MAX_NESTING_DEPTH) {
              throw new ParseError(
                `JSONPath filter nesting depth ${maxDepthReached} exceeds maximum of ${SECURITY_LIMITS.MAX_NESTING_DEPTH}`,
                'P010',
                this.line,
                this.column
              );
            }
            this.advancePos();
          } else if (char === ']') {
            depth--;
            if (depth === 0) break;
            this.advancePos();
          } else {
            this.advancePos();
          }
        }
      }

      if (this.peek() !== ']') {
        throw new ParseError('Expected ] after JSONPath filter', 'P003', this.line, this.column);
      }

      this.advancePos(); // consume final ]

      return createSpanToken(
        TokenType.ARRAY_INDEX,
        this.source,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (isDigit(firstChar)) {
      while (!this.isAtEnd() && isDigit(this.peek())) {
        this.advancePos();
      }

      if (this.peek() !== ']') {
        throw new ParseError('Expected ] after array index', 'P003', this.line, this.column);
      }

      this.advancePos(); // ]

      return createSpanToken(
        TokenType.ARRAY_INDEX,
        this.source,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (isIdentifierStart(firstChar)) {
      // Consume everything until the closing bracket
      while (!this.isAtEnd() && this.peek() !== ']') {
        this.advancePos();
      }

      if (this.peek() !== ']') {
        throw new ParseError('Expected ] after key list', 'P003', this.line, this.column);
      }

      this.advancePos(); // ]

      return createSpanToken(
        TokenType.ARRAY_INDEX,
        this.source,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    throw new ParseError('Expected array index or key list', 'P003', this.line, this.column);
  }

  /**
   * Scan # prefix variants: #, ##, #$
   */
  private scanNumberPrefix(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    this.advance(); // #

    if (this.peek() === '#') {
      this.advance(); // #
      return createSpanOnlyToken(
        TokenType.PREFIX_INTEGER,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (this.peek() === '$') {
      this.advance(); // $
      return createSpanOnlyToken(
        TokenType.PREFIX_CURRENCY,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    if (this.peek() === '%') {
      this.advance(); // %
      return createSpanOnlyToken(
        TokenType.PREFIX_PERCENT,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    return createSpanOnlyToken(TokenType.PREFIX_NUMBER, startLine, startColumn, startPos, this.pos);
  }

  /**
   * Scan a quoted string with escape handling.
   * First pass checks for escapes. If none, uses slice (zero-copy).
   * If escapes are present, decodes them.
   */
  private scanQuotedString(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;
    const source = this.source;
    const len = source.length;

    this.pos++; // opening "
    this.column++;
    const contentStart = this.pos;

    let hasEscapes = false;
    while (this.pos < len) {
      const code = source.charCodeAt(this.pos);

      if (code === CHAR_QUOTE) {
        break;
      }

      if (code === CHAR_NEWLINE) {
        throw new ParseError('Unterminated string', 'P004', startLine, startColumn);
      }

      if (code === 92) {
        hasEscapes = true;
        this.pos++;
        this.column++;
        if (this.pos < len) {
          if (source.charCodeAt(this.pos) === CHAR_NEWLINE) {
            this.line++;
            this.column = 1;
          } else {
            this.column++;
          }
          this.pos++;
        }
      } else {
        this.pos++;
        this.column++;
      }
    }

    if (this.pos >= len) {
      throw new ParseError('Unterminated string', 'P004', startLine, startColumn);
    }

    const contentEnd = this.pos;
    this.pos++; // closing "
    this.column++;

    if (!hasEscapes) {
      return createToken(
        TokenType.STRING_QUOTED,
        source.slice(contentStart, contentEnd),
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    const value = decodeEscapes(source.slice(contentStart, contentEnd), startLine, startColumn, this.lenient);
    return createToken(TokenType.STRING_QUOTED, value, startLine, startColumn, startPos, this.pos);
  }

  /**
   * Scan an identifier or keyword (true/false).
   * Zero-copy: uses source.slice() instead of building string character-by-character.
   */
  private scanIdentifierOrKeyword(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;
    const source = this.source;

    const firstCode = source.charCodeAt(startPos);
    const secondCode = source.charCodeAt(startPos + 1);
    if (firstCode === CHAR_T && secondCode >= CHAR_ZERO && secondCode <= CHAR_NINE) {
      return this.scanTime();
    }

    if (
      firstCode === CHAR_P &&
      (secondCode === CHAR_T || (secondCode >= CHAR_ZERO && secondCode <= CHAR_NINE))
    ) {
      return this.scanDuration();
    }

    const len = source.length;
    while (this.pos < len) {
      const code = source.charCodeAt(this.pos);
      if (
        !(
          (code >= 65 && code <= 90) ||
          (code >= 97 && code <= 122) ||
          (code >= 48 && code <= 57) ||
          code === 95 ||
          code === 45
        )
      ) {
        break;
      }
      this.pos++;
      this.column++;
    }

    // Check for XML namespace pattern (prefix:localName)
    // Only consume if NOT followed by a known ODIN directive keyword
    if (this.pos < len && source.charCodeAt(this.pos) === CHAR_COLON) {
      const afterColon = source.charCodeAt(this.pos + 1);
      // If next char is identifier start (a-z, A-Z, _), check if it's a directive
      if (
        (afterColon >= 65 && afterColon <= 90) || // A-Z
        (afterColon >= 97 && afterColon <= 122) || // a-z
        afterColon === 95 // _
      ) {
        // Peek ahead to see the next identifier
        let peekPos = this.pos + 1;
        while (peekPos < len) {
          const code = source.charCodeAt(peekPos);
          if (
            !(
              (code >= 65 && code <= 90) ||
              (code >= 97 && code <= 122) ||
              (code >= 48 && code <= 57) ||
              code === 95 ||
              code === 45
            )
          ) {
            break;
          }
          peekPos++;
        }
        const nextIdent = source.slice(this.pos + 1, peekPos);

        // Known ODIN directive keywords that should NOT be consumed as namespace
        const directives = [
          'if',
          'import',
          'schema',
          'required',
          'optional',
          'confidential',
          'deprecated',
          'default',
          'type',
          'trim',
          'upper',
          'lower',
          'date',
          'format',
          'pattern',
          'min',
          'max',
          'enum',
          'ref',
          'unique',
          'index',
          'key',
          'field',
          'pos',
          'len',
          'loop',
        ];

        // Only consume as namespace if NOT a directive keyword
        if (!directives.includes(nextIdent)) {
          this.pos++; // consume :
          this.column++;
          // Consume local name
          while (this.pos < len) {
            const code = source.charCodeAt(this.pos);
            if (
              !(
                (code >= 65 && code <= 90) ||
                (code >= 97 && code <= 122) ||
                (code >= 48 && code <= 57) ||
                code === 95 ||
                code === 45
              )
            ) {
              break;
            }
            this.pos++;
            this.column++;
          }
        }
      }
    }

    const value = source.slice(startPos, this.pos);

    if (value.length === 4 && value === 'true') {
      return createToken(TokenType.BOOLEAN, value, startLine, startColumn, startPos, this.pos);
    }
    if (value.length === 5 && value === 'false') {
      return createToken(TokenType.BOOLEAN, value, startLine, startColumn, startPos, this.pos);
    }

    return createToken(TokenType.IDENTIFIER, value, startLine, startColumn, startPos, this.pos);
  }

  /**
   * Scan a number or temporal value.
   */
  private scanNumberOrTemporal(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    let digitCount = 0;
    while (!this.isAtEnd() && isDigit(this.peek())) {
      this.advancePos();
      digitCount++;
    }

    if (digitCount === 4 && this.peek() === '-') {
      this.pos = startPos;
      this.column = startColumn;
      this.line = startLine;
      return this.scanDateOrTimestamp();
    }

    this.pos = startPos;
    this.column = startColumn;
    this.line = startLine;
    return this.scanNumber();
  }

  /**
   * Scan a number value.
   */
  private scanNumber(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    if (this.peek() === '-') {
      this.advancePos();
    }

    while (!this.isAtEnd() && isDigit(this.peek())) {
      this.advancePos();
    }

    if (this.peek() === '.' && isDigit(this.peek(1))) {
      this.advancePos();
      while (!this.isAtEnd() && isDigit(this.peek())) {
        this.advancePos();
      }
    }

    if (this.peek() === 'e' || this.peek() === 'E') {
      this.advancePos();
      if (this.peek() === '+' || this.peek() === '-') {
        this.advancePos();
      }
      if (!isDigit(this.peek())) {
        throw new ParseError(
          'Invalid number: exponent requires digits',
          'P001',
          this.line,
          this.column
        );
      }
      while (!this.isAtEnd() && isDigit(this.peek())) {
        this.advancePos();
      }
    }

    return createSpanToken(
      TokenType.NUMBER,
      this.source,
      startLine,
      startColumn,
      startPos,
      this.pos
    );
  }

  /**
   * Scan a date (YYYY-MM-DD) or timestamp (YYYY-MM-DDTHH:MM:SSZ).
   */
  private scanDateOrTimestamp(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    for (let i = 0; i < 4; i++) {
      if (!isDigit(this.peek())) {
        throw new ParseError('Invalid date format', 'P001', this.line, this.column);
      }
      this.advancePos();
    }

    // -
    if (this.peek() !== '-') {
      throw new ParseError('Invalid date format', 'P001', this.line, this.column);
    }
    this.advancePos();

    for (let i = 0; i < 2; i++) {
      if (!isDigit(this.peek())) {
        throw new ParseError('Invalid date format', 'P001', this.line, this.column);
      }
      this.advancePos();
    }

    // -
    if (this.peek() !== '-') {
      throw new ParseError('Invalid date format', 'P001', this.line, this.column);
    }
    this.advancePos();

    for (let i = 0; i < 2; i++) {
      if (!isDigit(this.peek())) {
        throw new ParseError('Invalid date format', 'P001', this.line, this.column);
      }
      this.advancePos();
    }

    if (this.peek() === 'T') {
      this.advancePos();

      for (let i = 0; i < 2; i++) {
        if (!isDigit(this.peek())) break;
        this.advancePos();
      }
      if (this.peek() === ':') {
        this.advancePos();
        for (let i = 0; i < 2; i++) {
          if (!isDigit(this.peek())) break;
          this.advancePos();
        }
        if (this.peek() === ':') {
          this.advancePos();
          for (let i = 0; i < 2; i++) {
            if (!isDigit(this.peek())) break;
            this.advancePos();
          }
          if (this.peek() === '.') {
            this.advancePos();
            while (isDigit(this.peek())) {
              this.advancePos();
            }
          }
        }
      }

      if (this.peek() === 'Z') {
        this.advancePos();
      } else if (this.peek() === '+' || this.peek() === '-') {
        this.advancePos();
        for (let i = 0; i < 2; i++) {
          if (isDigit(this.peek())) this.advancePos();
        }
        if (this.peek() === ':') {
          this.advancePos();
          for (let i = 0; i < 2; i++) {
            if (isDigit(this.peek())) this.advancePos();
          }
        }
      }

      return createSpanToken(
        TokenType.TIMESTAMP,
        this.source,
        startLine,
        startColumn,
        startPos,
        this.pos
      );
    }

    return createSpanToken(TokenType.DATE, this.source, startLine, startColumn, startPos, this.pos);
  }

  /**
   * Scan a time value (THH:MM:SS).
   */
  private scanTime(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    this.advancePos();

    for (let i = 0; i < 2; i++) {
      if (isDigit(this.peek())) this.advancePos();
    }

    if (this.peek() === ':') {
      this.advancePos();
      for (let i = 0; i < 2; i++) {
        if (isDigit(this.peek())) this.advancePos();
      }
    }

    if (this.peek() === ':') {
      this.advancePos();
      for (let i = 0; i < 2; i++) {
        if (isDigit(this.peek())) this.advancePos();
      }
    }

    if (this.peek() === '.') {
      this.advancePos();
      while (isDigit(this.peek())) {
        this.advancePos();
      }
    }

    return createSpanToken(TokenType.TIME, this.source, startLine, startColumn, startPos, this.pos);
  }

  /**
   * Scan a duration value (P...).
   */
  private scanDuration(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    this.advancePos();

    while (!this.isAtEnd()) {
      const char = this.peek();

      if (isDigit(char)) {
        this.advancePos();
      } else if ('YMWDTHS'.includes(char)) {
        this.advancePos();
      } else if (char === '.') {
        this.advancePos();
      } else {
        break;
      }
    }

    return createSpanToken(
      TokenType.DURATION,
      this.source,
      startLine,
      startColumn,
      startPos,
      this.pos
    );
  }

  /**
   * Scan a bare string value.
   */
  private scanBareString(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startPos = this.pos;

    while (!this.isAtEnd() && isBareStringChar(this.peek())) {
      this.advancePos();
    }

    const value = this.source.slice(startPos, this.pos).trimEnd();

    return createToken(TokenType.STRING_BARE, value, startLine, startColumn, startPos, this.pos);
  }

  /**
   * Scan to end of line (for comments).
   */
  private scanToEndOfLine(): string {
    const startPos = this.pos;
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advancePos();
    }
    return this.source.slice(startPos, this.pos);
  }

  /**
   * Skip whitespace characters.
   */
  private skipWhitespace(): void {
    const source = this.source;
    const len = source.length;
    while (this.pos < len) {
      const code = source.charCodeAt(this.pos);
      if (code !== 32 && code !== 9) break;
      this.pos++;
      this.column++;
    }
  }

  /**
   * Check if we're at the end of input.
   */
  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  /**
   * Peek at a character ahead.
   */
  private peek(offset: number = 0): string {
    const pos = this.pos + offset;
    if (pos >= this.source.length) {
      return '\0';
    }
    return this.source[pos]!;
  }

  /**
   * Peek at character code ahead.
   */
  private peekCode(offset: number = 0): number {
    const pos = this.pos + offset;
    if (pos >= this.source.length) {
      return 0;
    }
    return this.source.charCodeAt(pos);
  }

  /**
   * Advance and return the current character.
   */
  private advance(): string {
    const char = this.source[this.pos]!;
    this.pos++;

    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }

    return char;
  }

  /**
   * Advance position without returning the character.
   */
  private advancePos(): void {
    const char = this.source[this.pos]!;
    this.pos++;

    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
  }
}

/**
 * Tokenize ODIN source text into an array of tokens.
 *
 * @param source - ODIN text to tokenize
 * @param options - Optional tokenizer configuration
 * @returns Array of tokens including EOF
 * @throws {ParseError} If the source contains invalid characters
 */
export function tokenize(source: string, options?: TokenizerOptions): Token[] {
  const tokenizer = new Tokenizer(source, options);
  return tokenizer.tokenize();
}
