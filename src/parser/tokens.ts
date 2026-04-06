/**
 * Token types, character utilities, and path interning for ODIN tokenization.
 */

import { SECURITY_LIMITS } from '../utils/security-limits.js';

// ─────────────────────────────────────────────────────────────────────────────
// Character Code Constants
// ─────────────────────────────────────────────────────────────────────────────

const CHAR_TAB = 9;
const CHAR_NEWLINE = 10;
const CHAR_CR = 13;
const CHAR_SPACE = 32;
const CHAR_QUOTE = 34;
const CHAR_PLUS = 43;
const CHAR_SLASH = 47;
const CHAR_0 = 48;
const CHAR_9 = 57;
const CHAR_SEMICOLON = 59;
const CHAR_LESS_THAN = 60;
const CHAR_EQUALS = 61;
const CHAR_GREATER_THAN = 62;
const CHAR_UPPER_A = 65;
const CHAR_UPPER_F = 70;
const CHAR_UPPER_Z = 90;
const CHAR_OPEN_BRACKET = 91;
const CHAR_UNDERSCORE = 95;
const CHAR_LOWER_A = 97;
const CHAR_LOWER_F = 102;
const CHAR_LOWER_Z = 122;
const CHAR_OPEN_BRACE = 123;
const CHAR_CLOSE_BRACE = 125;
const CHAR_HYPHEN = 45;
const CHAR_DOT = 46;

// ─────────────────────────────────────────────────────────────────────────────
// Token Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Token types recognized by the ODIN tokenizer.
 * Uses numeric constants for faster comparison.
 */
export const enum TokenType {
  // Structure (0-9)
  HEADER_OPEN = 0, // {
  HEADER_CLOSE = 1, // }
  EQUALS = 2, // =
  NEWLINE = 3, // \n or \r\n
  EOF = 4, // End of input
  LESS_THAN = 5, // <
  GREATER_THAN = 6, // >

  // Comments and Directives (10-19)
  COMMENT = 10, // ; ...
  DIRECTIVE_IMPORT = 11, // @import
  DIRECTIVE_SCHEMA = 12, // @schema
  DIRECTIVE_COND = 13, // @if

  // Document (20-29)
  DOC_SEPARATOR = 20, // ---

  // Identifiers and Paths (30-39)
  IDENTIFIER = 30, // field names
  ARRAY_INDEX = 31, // [0], [1], etc.
  DOT = 32, // .

  // Type Prefixes (40-49)
  PREFIX_NUMBER = 40, // #
  PREFIX_INTEGER = 41, // ##
  PREFIX_CURRENCY = 42, // #$
  PREFIX_BOOLEAN = 43, // ?
  PREFIX_REFERENCE = 44, // @
  PREFIX_BINARY = 45, // ^
  PREFIX_NULL = 46, // ~
  PREFIX_EXTENSION = 47, // &
  PREFIX_META = 48, // $ (standalone, for {$identifier} headers)
  PREFIX_VERB = 49, // % (verb expression)
  PREFIX_PERCENT = 50, // #% (percentage)

  // Modifiers (51-59)
  MODIFIER_CRITICAL = 51, // !
  MODIFIER_REDACTED = 52, // *
  MODIFIER_DEPRECATED = 53, // -

  // Values (60-79)
  STRING_BARE = 60, // unquoted string
  STRING_QUOTED = 61, // "quoted string"
  NUMBER = 62, // numeric value
  BOOLEAN = 63, // true, false
  DATE = 64, // 2024-06-15
  TIMESTAMP = 65, // 2024-06-15T10:30:00Z
  TIME = 66, // T10:30:00
  DURATION = 67, // P1Y2M3D
  BASE64 = 68, // base64 data

  // Tabular (80-89)
  COMMA = 80, // , (in tabular mode)
  COLON = 81, // : (in tabular header)

  // Whitespace (90-99)
  WHITESPACE = 90, // spaces and tabs
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A token produced by the tokenizer.
 * Stores span positions for zero-copy access to source text.
 */
export interface Token {
  /** Token type (numeric for fast comparison) */
  type: TokenType;

  /** Token value or SPAN_ONLY_SENTINEL for span-based tokens */
  value: string;

  /** Line number (1-based) */
  line: number;

  /** Column number (1-based) */
  column: number;

  /** Start position in source (0-based) */
  start: number;

  /** End position in source (0-based, exclusive) */
  end: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Creation
// ─────────────────────────────────────────────────────────────────────────────

/** Token types that don't need value extraction. */
export const SPAN_ONLY_TOKEN_TYPES = new Set<TokenType>([
  TokenType.HEADER_OPEN,
  TokenType.HEADER_CLOSE,
  TokenType.EQUALS,
  TokenType.NEWLINE,
  TokenType.EOF,
  TokenType.DOT,
  TokenType.COMMA,
  TokenType.COLON,
  TokenType.PREFIX_NUMBER,
  TokenType.PREFIX_INTEGER,
  TokenType.PREFIX_CURRENCY,
  TokenType.PREFIX_BOOLEAN,
  TokenType.PREFIX_REFERENCE,
  TokenType.PREFIX_BINARY,
  TokenType.PREFIX_NULL,
  TokenType.PREFIX_EXTENSION,
  TokenType.PREFIX_META,
  TokenType.PREFIX_VERB,
  TokenType.PREFIX_PERCENT,
  TokenType.MODIFIER_CRITICAL,
  TokenType.MODIFIER_REDACTED,
  TokenType.MODIFIER_DEPRECATED,
]);

/** Sentinel value for span-only tokens (enables reference equality checks). */
export const SPAN_ONLY_SENTINEL = '\x00SPAN_ONLY\x00';

/** Create a token with a pre-computed value. */
export function createToken(
  type: TokenType,
  value: string,
  line: number,
  column: number,
  start: number,
  end: number
): Token {
  return { type, value, line, column, start, end };
}

/** Create a span-only token (type alone conveys meaning). */
export function createSpanOnlyToken(
  type: TokenType,
  line: number,
  column: number,
  start: number,
  end: number
): Token {
  return { type, value: SPAN_ONLY_SENTINEL, line, column, start, end };
}

/** Create a token that slices its value from the source. */
export function createSpanToken(
  type: TokenType,
  source: string,
  line: number,
  column: number,
  start: number,
  end: number
): Token {
  return {
    type,
    value: source.slice(start, end),
    line,
    column,
    start,
    end,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Character Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Extract raw text from a token span. */
export function getTokenValue(source: string, token: Token): string {
  return source.slice(token.start, token.end);
}

/**
 * Check if a character is a valid identifier start (a-z, A-Z, _).
 */
export function isIdentifierStart(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= CHAR_LOWER_A && code <= CHAR_LOWER_Z) ||
    (code >= CHAR_UPPER_A && code <= CHAR_UPPER_Z) ||
    code === CHAR_UNDERSCORE
  );
}

/**
 * Check if a character is a valid identifier continuation (a-z, A-Z, 0-9, _, -).
 */
export function isIdentifierChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= CHAR_LOWER_A && code <= CHAR_LOWER_Z) ||
    (code >= CHAR_UPPER_A && code <= CHAR_UPPER_Z) ||
    (code >= CHAR_0 && code <= CHAR_9) ||
    code === CHAR_UNDERSCORE ||
    code === CHAR_HYPHEN
  );
}

/**
 * Check if a character is whitespace (space or tab).
 */
export function isWhitespace(char: string): boolean {
  const code = char.charCodeAt(0);
  return code === CHAR_SPACE || code === CHAR_TAB;
}

/**
 * Check if a character is a digit (0-9).
 */
export function isDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= CHAR_0 && code <= CHAR_9;
}

/**
 * Check if a character is a hex digit (0-9, A-F, a-f).
 */
export function isHexDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= CHAR_0 && code <= CHAR_9) ||
    (code >= CHAR_UPPER_A && code <= CHAR_UPPER_F) ||
    (code >= CHAR_LOWER_A && code <= CHAR_LOWER_F)
  );
}

/**
 * Check if a character is valid in a bare string.
 * Excludes: " = ; { } < > and newlines.
 */
export function isBareStringChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    code !== CHAR_QUOTE &&
    code !== CHAR_EQUALS &&
    code !== CHAR_SEMICOLON &&
    code !== CHAR_OPEN_BRACE &&
    code !== CHAR_CLOSE_BRACE &&
    code !== CHAR_LESS_THAN &&
    code !== CHAR_GREATER_THAN &&
    code !== CHAR_NEWLINE &&
    code !== CHAR_CR
  );
}

/**
 * Check if a character is valid in base64 (A-Z, a-z, 0-9, +, /, =).
 */
export function isBase64Char(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= CHAR_UPPER_A && code <= CHAR_UPPER_Z) ||
    (code >= CHAR_LOWER_A && code <= CHAR_LOWER_Z) ||
    (code >= CHAR_0 && code <= CHAR_9) ||
    code === CHAR_PLUS ||
    code === CHAR_SLASH ||
    code === CHAR_EQUALS
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Path Interning - Shared across all documents in process
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum number of entries in each cache before LRU eviction.
 * Prevents unbounded memory growth in long-running processes.
 */
const MAX_PATH_POOL_SIZE = SECURITY_LIMITS.MAX_PATH_POOL_SIZE;
const MAX_SEGMENT_POOL_SIZE = Math.floor(SECURITY_LIMITS.MAX_PATH_POOL_SIZE / 2);
const MAX_PARSED_PATH_CACHE_SIZE = SECURITY_LIMITS.MAX_PATH_POOL_SIZE;

/**
 * Path string pool for interning commonly used paths.
 * Paths repeat heavily in ODIN documents, so interning saves memory.
 * Uses LRU eviction when size limit is exceeded.
 */
const PATH_POOL = new Map<string, string>();

/**
 * Segment string pool for interning path segments.
 * Segments like "envelope", "files", "keychain" appear thousands of times.
 * Uses LRU eviction when size limit is exceeded.
 */
const SEGMENT_POOL = new Map<string, string>();

/**
 * Parsed path cache - avoids re-parsing the same path multiple times.
 * Key is the original path string, value is the array of segments.
 * Uses LRU eviction when size limit is exceeded.
 */
const PARSED_PATH_CACHE = new Map<string, readonly string[]>();

/**
 * Evict oldest entries from a Map when it exceeds the max size.
 * Uses simple LRU approximation - Map maintains insertion order,
 * so deleting from the start removes oldest entries.
 */
function evictIfNeeded<K, V>(map: Map<K, V>, maxSize: number): void {
  if (map.size > maxSize) {
    // Evict entries to avoid frequent evictions
    const evictCount = Math.max(1, Math.floor(maxSize * SECURITY_LIMITS.CACHE_EVICTION_PERCENT));
    const iterator = map.keys();
    for (let i = 0; i < evictCount; i++) {
      const key = iterator.next().value;
      if (key !== undefined) {
        map.delete(key);
      }
    }
  }
}

/**
 * Intern a path string, returning the canonical instance.
 *
 * Interning provides two benefits:
 * 1. **Memory savings**: Identical paths share a single string instance
 * 2. **Reference equality**: Interned paths can be compared with `===`
 *
 * If the path has been seen before, returns the existing instance.
 * Uses LRU eviction to bound memory in long-running processes.
 *
 * @param path - The path string to intern
 * @returns The canonical interned instance of the path
 */
export function internPath(path: string): string {
  const existing = PATH_POOL.get(path);
  if (existing !== undefined) {
    // Move to end (most recently used) by deleting and re-adding
    PATH_POOL.delete(path);
    PATH_POOL.set(path, existing);
    return existing;
  }
  evictIfNeeded(PATH_POOL, MAX_PATH_POOL_SIZE);
  PATH_POOL.set(path, path);
  return path;
}

/**
 * Intern a path segment, returning the canonical instance.
 *
 * Segments like "envelope", "files", "keychain" appear thousands of times
 * across documents. Interning reduces memory by sharing instances and enables
 * fast reference equality comparison.
 *
 * Uses LRU eviction to bound memory in long-running processes.
 *
 * @param segment - The segment string to intern
 * @returns The canonical interned instance of the segment
 */
export function internSegment(segment: string): string {
  const existing = SEGMENT_POOL.get(segment);
  if (existing !== undefined) {
    // Move to end (most recently used)
    SEGMENT_POOL.delete(segment);
    SEGMENT_POOL.set(segment, existing);
    return existing;
  }
  evictIfNeeded(SEGMENT_POOL, MAX_SEGMENT_POOL_SIZE);
  SEGMENT_POOL.set(segment, segment);
  return segment;
}

/**
 * Parse a path into segments with caching.
 * Results are cached to avoid re-parsing the same path multiple times.
 * Implements LRU-like behavior for cache management.
 */
export function parsePathCached(path: string): readonly string[] {
  const cached = PARSED_PATH_CACHE.get(path);
  if (cached !== undefined) {
    // Move to end (most recently used)
    PARSED_PATH_CACHE.delete(path);
    PARSED_PATH_CACHE.set(path, cached);
    return cached;
  }

  const segments = parsePathFast(path);
  evictIfNeeded(PARSED_PATH_CACHE, MAX_PARSED_PATH_CACHE_SIZE);
  PARSED_PATH_CACHE.set(path, segments);
  return segments;
}

/**
 * Fast path parsing with minimal allocations.
 * Returns interned segments to share memory across documents.
 */
function parsePathFast(path: string): string[] {
  const segments: string[] = [];
  const len = path.length;
  let start = 0;
  let i = 0;

  while (i < len) {
    const code = path.charCodeAt(i);

    if (code === CHAR_DOT) {
      if (i > start) {
        segments.push(internSegment(path.slice(start, i)));
      }
      start = i + 1;
      i++;
    } else if (code === CHAR_OPEN_BRACKET) {
      if (i > start) {
        segments.push(internSegment(path.slice(start, i)));
      }
      const end = path.indexOf(']', i);
      if (end === -1) {
        segments.push(internSegment(path.slice(i)));
        break;
      }
      segments.push(internSegment(path.slice(i, end + 1)));
      i = end + 1;
      start = i;
    } else {
      i++;
    }
  }

  if (start < len) {
    segments.push(internSegment(path.slice(start)));
  }

  return segments;
}

/**
 * Clear the path pool (useful for testing or memory management).
 */
export function clearPathPool(): void {
  PATH_POOL.clear();
}

/**
 * Clear all caches (useful for testing or memory management).
 */
export function clearAllCaches(): void {
  PATH_POOL.clear();
  SEGMENT_POOL.clear();
  PARSED_PATH_CACHE.clear();
}

/**
 * Get the current size of the path pool.
 */
export function getPathPoolSize(): number {
  return PATH_POOL.size;
}

/**
 * Get cache statistics for debugging.
 */
export function getCacheStats(): { paths: number; segments: number; parsedPaths: number } {
  return {
    paths: PATH_POOL.size,
    segments: SEGMENT_POOL.size,
    parsedPaths: PARSED_PATH_CACHE.size,
  };
}
