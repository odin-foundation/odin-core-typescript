/**
 * Shared parsing utilities used by both the main parser and streaming parser.
 */

import { ParseError } from '../types/errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Regex patterns for value type detection
// ─────────────────────────────────────────────────────────────────────────────

/** ISO 8601 timestamp pattern: 2024-06-15T10:30:00Z or with timezone offset */
export const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** ISO 8601 date pattern: 2024-06-15 */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Time pattern: T14:30:00 or T14:30:00.500 */
export const TIME_PATTERN = /^T\d{2}:\d{2}:\d{2}/;

/** Duration pattern: P1Y6M, PT30M, P2W */
export const DURATION_PATTERN = /^P(?:\d+[YMWD])*(?:T(?:\d+[HMS])*)?$/;

// ─────────────────────────────────────────────────────────────────────────────
// Base64 decoding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode base64 string to Uint8Array.
 * Works in both Node.js and browser environments.
 */
export function decodeBase64(base64: string): Uint8Array {
  // Use Buffer in Node.js environment
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  // Browser fallback using atob
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeric utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count decimal places in a numeric string.
 * Returns at least 2 for currency values.
 */
export function countDecimalPlaces(numStr: string, minPlaces: number = 2): number {
  const dotIndex = numStr.indexOf('.');
  if (dotIndex === -1) {
    return minPlaces;
  }
  // Count digits after decimal point
  const afterDot = numStr.slice(dotIndex + 1);
  // Remove any non-digit characters at the end
  const digits = afterDot.replace(/\D.*$/, '');
  return Math.max(minPlaces, digits.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// String escape handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode escape sequences in a string.
 * Supports: \\, \", \n, \t, \r, \0, \uXXXX, \UXXXXXXXX
 *
 * This is the canonical escape decoder used by both the tokenizer and streaming parser.
 */
export function decodeEscapes(s: string, line: number = 0, column: number = 0, lenient: boolean = false): string {
  let result = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const next = s[i + 1]!;
      switch (next) {
        case '\\':
          result += '\\';
          i += 2;
          break;
        case '"':
          result += '"';
          i += 2;
          break;
        case 'n':
          result += '\n';
          i += 2;
          break;
        case 't':
          result += '\t';
          i += 2;
          break;
        case 'r':
          result += '\r';
          i += 2;
          break;
        case '0':
          result += '\0';
          i += 2;
          break;
        case 'u': {
          // \uXXXX
          const hex = s.slice(i + 2, i + 6);
          if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
            result += String.fromCodePoint(parseInt(hex, 16));
            i += 6;
          } else {
            throw new ParseError(
              `Invalid escape sequence: \\u${hex}`,
              'P005',
              line,
              column + i
            );
          }
          break;
        }
        case 'U': {
          // \UXXXXXXXX
          const hex = s.slice(i + 2, i + 10);
          if (hex.length === 8 && /^[0-9a-fA-F]{8}$/.test(hex)) {
            result += String.fromCodePoint(parseInt(hex, 16));
            i += 10;
          } else {
            throw new ParseError(
              `Invalid escape sequence: \\U${hex}`,
              'P005',
              line,
              column + i
            );
          }
          break;
        }
        default:
          if (lenient) {
            // In lenient mode, preserve unknown escapes as literal characters
            result += '\\' + next;
            i += 2;
            break;
          }
          throw new ParseError(
            `Invalid escape sequence: \\${next}`,
            'P005',
            line,
            column + i
          );
      }
    } else {
      result += s[i]!;
      i++;
    }
  }
  return result;
}

/**
 * Result of parsing a quoted string.
 */
export interface ParsedString {
  value: string;
  error?: string;
}

/**
 * Parse a quoted string, handling escape sequences.
 * Detects unterminated strings and returns an error.
 *
 * @param text - The full text including opening quote
 * @returns Parsed string value and optional error
 */
export function parseQuotedString(text: string): ParsedString {
  if (!text.startsWith('"')) {
    return { value: text };
  }

  // Find the closing quote (respecting escape sequences)
  let i = 1; // Skip opening quote
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (ch === '"') {
      // Found closing quote - decode escapes in content
      const content = text.slice(1, i);
      return { value: decodeEscapes(content) };
    }

    if (ch === '\\' && i + 1 < len) {
      // Skip escaped character
      i += 2;
    } else {
      i++;
    }
  }

  // No closing quote found
  const content = text.slice(1);
  return { value: decodeEscapes(content), error: 'Unterminated string literal' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Comment stripping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip inline comment from value text.
 * Comments start with ; but not inside quoted strings.
 */
export function stripInlineComment(text: string): string {
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (ch === ';' && !inString) {
      return text.slice(0, i);
    }
  }

  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Binary value parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of parsing binary data.
 */
export interface ParsedBinary {
  data: Uint8Array;
  algorithm?: string;
}

/**
 * Parse binary value text (after ^ prefix).
 * Handles optional algorithm prefix (e.g., sha256:abc123).
 */
export function parseBinaryValue(binaryText: string): ParsedBinary {
  const colonIndex = binaryText.indexOf(':');
  let base64Data: string;
  let algorithm: string | undefined;

  if (colonIndex !== -1 && colonIndex < binaryText.length - 1) {
    algorithm = binaryText.slice(0, colonIndex);
    base64Data = binaryText.slice(colonIndex + 1);
  } else {
    base64Data = binaryText;
  }

  const data = decodeBase64(base64Data);
  return algorithm ? { data, algorithm } : { data };
}
