/**
 * ODIN Transform String Verbs
 *
 * String verbs: capitalize, titleCase, length, contains, startsWith, endsWith,
 * substring, replace, padLeft, padRight, pad, truncate, split, join,
 * replaceRegex, mask.
 */

import type { VerbFunction } from '../../types/transform.js';
import { toString, toNumber, str, int, bool, nil, extractStringValue } from './helpers.js';
import { SECURITY_LIMITS } from '../../utils/security-limits.js';

/**
 * %capitalize @path - Capitalize first letter
 */
export const capitalize: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);
  if (s.length === 0) return str('');
  return str(s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
};

/**
 * %titleCase @path - Title Case Each Word
 */
export const titleCase: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);
  return str(
    s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ')
  );
};

/**
 * %length @path - String length
 */
export const length: VerbFunction = (args) => {
  if (args.length === 0) return int(0);
  return int(toString(args[0]!).length);
};

/**
 * %contains @path "search" - Check if contains substring
 */
export const contains: VerbFunction = (args) => {
  if (args.length < 2) return bool(false);
  return bool(toString(args[0]!).includes(toString(args[1]!)));
};

/**
 * %startsWith @path "prefix" - Check if starts with prefix
 */
export const startsWith: VerbFunction = (args) => {
  if (args.length < 2) return bool(false);
  return bool(toString(args[0]!).startsWith(toString(args[1]!)));
};

/**
 * %endsWith @path "suffix" - Check if ends with suffix
 */
export const endsWith: VerbFunction = (args) => {
  if (args.length < 2) return bool(false);
  return bool(toString(args[0]!).endsWith(toString(args[1]!)));
};

/**
 * %substring @path start len - Extract substring
 */
export const substring: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const s = toString(args[0]!);
  const start = Math.floor(toNumber(args[1]!));
  const len = Math.floor(toNumber(args[2]!));
  return str(s.substring(start, start + len));
};

/**
 * %replace @path "find" "replacement" - Replace all occurrences
 */
export const replace: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const s = toString(args[0]!);
  const find = toString(args[1]!);
  const repl = toString(args[2]!);
  return str(s.split(find).join(repl));
};

/**
 * %padLeft @path len "char" - Left pad to length
 */
export const padLeft: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const s = toString(args[0]!);
  const len = Math.floor(toNumber(args[1]!));
  const char = toString(args[2]!).charAt(0) || ' ';
  return str(s.padStart(len, char));
};

/**
 * %padRight @path len "char" - Right pad to length
 */
export const padRight: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const s = toString(args[0]!);
  const len = Math.floor(toNumber(args[1]!));
  const char = toString(args[2]!).charAt(0) || ' ';
  return str(s.padEnd(len, char));
};

/**
 * %pad @path len "char" - Pad string (alias for padRight, default behavior)
 */
export const pad: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const s = toString(args[0]!);
  const len = Math.floor(toNumber(args[1]!));
  const char = toString(args[2]!).charAt(0) || ' ';
  return str(s.padEnd(len, char));
};

/**
 * %truncate @path len - Truncate to max length
 */
export const truncate: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s = toString(args[0]!);
  const len = Math.floor(toNumber(args[1]!));
  return str(s.slice(0, len));
};

/**
 * %split @path "delim" index - Split and get element
 */
export const split: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const s = toString(args[0]!);
  const delim = toString(args[1]!);
  let index = Math.floor(toNumber(args[2]!));
  const parts = s.split(delim);

  // Handle negative index
  if (index < 0) index = parts.length + index;
  if (index < 0 || index >= parts.length) return nil();

  return str(parts[index]!);
};

/**
 * %join @array "delim" - Join array elements
 */
export const join: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const arr = args[0]!;
  const delim = toString(args[1]!);

  // Handle array type - elements may be CDM TransformValue or raw JS values
  if (arr.type === 'array') {
    const elements = (arr.items as unknown[]).map((item: unknown) => extractStringValue(item));
    return str(elements.join(delim));
  }

  // If it's a string, treat it as already joined (return as-is)
  if (arr.type === 'string') {
    return str(arr.value);
  }

  // Empty or null input
  return str('');
};

// ─────────────────────────────────────────────────────────────────────────────
// Regex Verbs
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum allowed regex pattern length to prevent complexity attacks */
const MAX_REGEX_PATTERN_LENGTH = SECURITY_LIMITS.MAX_REGEX_PATTERN_LENGTH;

/** Maximum input string length for regex operations */
const MAX_REGEX_INPUT_LENGTH = SECURITY_LIMITS.MAX_STRING_LENGTH;

/**
 * Check if a regex pattern contains potentially dangerous ReDoS patterns.
 * Detects nested quantifiers and other patterns known to cause catastrophic backtracking.
 */
function isUnsafeRegexPattern(pattern: string): boolean {
  // Reject patterns that are too long
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return true;
  }

  // Detect nested quantifiers: (a+)+, (a*)+, (a+)*, (a*)*
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern)) {
    return true;
  }

  // Detect overlapping alternations with quantifiers: (a|a)+
  if (/\([^)]*\|[^)]*\)[+*]/.test(pattern)) {
    return true;
  }

  // Detect quantified groups followed by similar patterns: (.*a){10,}
  if (/\{[0-9]*,[0-9]*\}/.test(pattern) && /[+*]/.test(pattern)) {
    const match = pattern.match(/\{(\d*),?(\d*)\}/);
    if (match) {
      const min = parseInt(match[1] || '0', 10);
      const max = parseInt(match[2] || match[1] || '0', 10);
      if (min > 100 || max > 100) {
        return true;
      }
    }
  }

  return false;
}

/**
 * %replaceRegex @path "pattern" "replacement" - Regex replacement
 *
 * Includes ReDoS protection:
 * - Pattern length limited to 256 characters
 * - Input length limited to 100,000 characters
 * - Dangerous patterns (nested quantifiers) are rejected
 */
export const replaceRegex: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const s = toString(args[0]!);
  const pattern = toString(args[1]!);
  const replacement = toString(args[2]!);

  // ReDoS protection: limit input length
  if (s.length > MAX_REGEX_INPUT_LENGTH) {
    return nil();
  }

  // ReDoS protection: reject dangerous patterns
  if (isUnsafeRegexPattern(pattern)) {
    return nil();
  }

  try {
    const regex = new RegExp(pattern, 'g');
    return str(s.replace(regex, replacement));
  } catch {
    // Invalid regex pattern - per spec, verbs return null on invalid input
    return nil();
  }
};

/**
 * %mask @path "pattern" - Apply formatting mask (# = digit, A = letter, * = any)
 */
export const mask: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s = toString(args[0]!);
  const pattern = toString(args[1]!);

  let result = '';
  let valueIndex = 0;

  for (let i = 0; i < pattern.length && valueIndex < s.length; i++) {
    const maskChar = pattern.charAt(i);
    if (maskChar === '#' || maskChar === 'A' || maskChar === '*') {
      result += s.charAt(valueIndex);
      valueIndex++;
    } else {
      result += maskChar;
    }
  }

  return str(result);
};

// ─────────────────────────────────────────────────────────────────────────────
// Case Conversion Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split a string into words based on common delimiters and case boundaries.
 * Handles: snake_case, kebab-case, camelCase, PascalCase, space-separated, etc.
 */
function splitIntoWords(s: string): string[] {
  if (!s) return [];

  // Replace common delimiters with spaces
  let normalized = s.replace(/[-_\s]+/g, ' ');

  // Insert space before uppercase letters that follow lowercase letters (camelCase)
  normalized = normalized.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Insert space before uppercase letters that are followed by lowercase (PascalCase acronyms)
  normalized = normalized.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  // Split and filter empty
  return normalized.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * %camelCase @path - Convert to camelCase
 * "hello-world" → "helloWorld"
 * "HelloWorld" → "helloWorld"
 * "hello_world" → "helloWorld"
 */
export const camelCase: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);
  if (!s) return str('');

  const words = splitIntoWords(s);
  if (words.length === 0) return str('');

  const result = words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');

  return str(result);
};

/**
 * %pascalCase @path - Convert to PascalCase
 * "hello-world" → "HelloWorld"
 * "helloWorld" → "HelloWorld"
 */
export const pascalCase: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);
  if (!s) return str('');

  const words = splitIntoWords(s);
  if (words.length === 0) return str('');

  const result = words
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');

  return str(result);
};

/**
 * %snakeCase @path - Convert to snake_case
 * "helloWorld" → "hello_world"
 * "HelloWorld" → "hello_world"
 */
export const snakeCase: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);
  if (!s) return str('');

  const words = splitIntoWords(s);
  return str(words.map((w) => w.toLowerCase()).join('_'));
};

/**
 * %kebabCase @path - Convert to kebab-case
 * "helloWorld" → "hello-world"
 * "HelloWorld" → "hello-world"
 */
export const kebabCase: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);
  if (!s) return str('');

  const words = splitIntoWords(s);
  return str(words.map((w) => w.toLowerCase()).join('-'));
};

/**
 * %slugify @path - Create URL-safe slug
 * "Hello World!" → "hello-world"
 * Removes non-alphanumeric characters, converts to lowercase, uses hyphens.
 */
export const slugify: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);
  if (!s) return str('');

  const slug = s
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens

  return str(slug);
};

// ─────────────────────────────────────────────────────────────────────────────
// String Manipulation Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %reverseString @path - Reverse string characters
 * "hello" → "olleh"
 * Handles Unicode characters correctly using spread operator.
 */
export const reverseString: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);
  // Use spread to handle Unicode correctly
  return str([...s].reverse().join(''));
};

/**
 * %repeat @path count - Repeat string N times
 * "ab", 3 → "ababab"
 */
export const repeat: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s = toString(args[0]!);
  const count = Math.floor(toNumber(args[1]!));

  // Handle edge cases
  if (count < 0) return nil();
  if (count === 0) return str('');

  // Limit to prevent memory issues
  const safeCount = Math.min(count, SECURITY_LIMITS.MAX_STRING_REPEAT);
  return str(s.repeat(safeCount));
};

/**
 * %normalizeSpace @path - Collapse and trim whitespace
 * "  a   b  " → "a b"
 */
export const normalizeSpace: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);
  return str(s.replace(/\s+/g, ' ').trim());
};

/**
 * %leftOf @path "delimiter" - Get text before first occurrence of delimiter
 * "a.b.c", "." → "a"
 */
export const leftOf: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s = toString(args[0]!);
  const delim = toString(args[1]!);

  const index = s.indexOf(delim);
  if (index === -1) return str(s); // No delimiter found, return original
  return str(s.substring(0, index));
};

/**
 * %rightOf @path "delimiter" - Get text after first occurrence of delimiter
 * "a.b.c", "." → "b.c"
 */
export const rightOf: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s = toString(args[0]!);
  const delim = toString(args[1]!);

  const index = s.indexOf(delim);
  if (index === -1) return str(''); // No delimiter found, return empty
  return str(s.substring(index + delim.length));
};

/**
 * %wrap @path width - Word wrap at specified width
 * Wraps text at word boundaries to fit within specified width.
 */
export const wrap: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s = toString(args[0]!);
  const width = Math.floor(toNumber(args[1]!));

  if (width <= 0) return nil();
  if (s.length <= width) return str(s);

  const lines: string[] = [];
  const words = s.split(/\s+/);
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= width) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return str(lines.join('\n'));
};

/**
 * %center @path width [char] - Center-pad string to width
 * "hi", 6, "-" → "--hi--"
 */
export const center: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s = toString(args[0]!);
  const width = Math.floor(toNumber(args[1]!));
  const char = args.length >= 3 ? toString(args[2]!).charAt(0) || ' ' : ' ';

  if (width <= 0) return nil();
  if (s.length >= width) return str(s);

  const totalPadding = width - s.length;
  const leftPad = Math.floor(totalPadding / 2);
  const rightPad = totalPadding - leftPad;

  return str(char.repeat(leftPad) + s + char.repeat(rightPad));
};

// ─────────────────────────────────────────────────────────────────────────────
// Regex Match/Extract Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %match @path "regex" - Test if string matches regex pattern
 * Returns true if pattern matches, false otherwise.
 */
export const match: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s = toString(args[0]!);
  const pattern = toString(args[1]!);

  // ReDoS protection
  if (s.length > MAX_REGEX_INPUT_LENGTH) return nil();
  if (isUnsafeRegexPattern(pattern)) return nil();

  try {
    const regex = new RegExp(pattern);
    return bool(regex.test(s));
  } catch {
    // Invalid regex pattern - per spec, verbs return null on invalid input
    return nil();
  }
};

/**
 * %extract @path "regex" [group] - Extract regex capture group
 * Returns the matched group (default: 0 = entire match, 1 = first capture group).
 */
export const extract: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s = toString(args[0]!);
  const pattern = toString(args[1]!);
  const groupIndex = args.length >= 3 ? Math.floor(toNumber(args[2]!)) : 0;

  // ReDoS protection
  if (s.length > MAX_REGEX_INPUT_LENGTH) return nil();
  if (isUnsafeRegexPattern(pattern)) return nil();

  try {
    const regex = new RegExp(pattern);
    const match = s.match(regex);

    if (!match) return nil();
    if (groupIndex < 0 || groupIndex >= match.length) return nil();

    const result = match[groupIndex];
    return result !== undefined ? str(result) : nil();
  } catch {
    // Invalid regex pattern - per spec, verbs return null on invalid input
    return nil();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Additional String Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %matches @path "regex" - Test if string matches regex (boolean)
 * Alias for %match, returns true if pattern matches anywhere in string.
 *
 * @example
 * isEmail = "%matches @value \"^[\\w.+-]+@[\\w-]+\\.[a-z]{2,}$\""
 */
export const matches: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s = toString(args[0]!);
  const pattern = toString(args[1]!);

  // ReDoS protection
  if (s.length > MAX_REGEX_INPUT_LENGTH) return nil();
  if (isUnsafeRegexPattern(pattern)) return nil();

  try {
    const regex = new RegExp(pattern);
    return bool(regex.test(s));
  } catch {
    // Invalid regex pattern - per spec, verbs return null on invalid input
    return nil();
  }
};

/**
 * %stripAccents @path - Remove diacritical marks (accents) from characters
 * Uses Unicode NFD normalization to decompose characters then removes combining marks.
 * "café" → "cafe", "naïve" → "naive", "résumé" → "resume"
 *
 * @example
 * normalized = "%stripAccents @name"  ; "José García" → "Jose Garcia"
 */
export const stripAccents: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);

  // NFD normalization separates base characters from combining diacritical marks
  // \u0300-\u036f covers the Combining Diacritical Marks block
  const normalized = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  return str(normalized);
};

/**
 * %clean @path - Clean string by removing control characters and normalizing whitespace
 * Removes ASCII control characters (0x00-0x1F, 0x7F) except tab/newline/carriage return,
 * normalizes various Unicode whitespace to regular spaces, and trims the result.
 *
 * @example
 * cleaned = "%clean @userInput"  ; removes \x00, normalizes whitespace
 */
export const clean: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!);

  // Remove ASCII control characters except \t (0x09), \n (0x0A), \r (0x0D)
  // Also remove DEL character (0x7F)
  // eslint-disable-next-line no-control-regex
  let cleaned = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Normalize various Unicode whitespace characters to regular spaces
  // Includes: non-breaking space, em space, en space, thin space, etc.
  cleaned = cleaned.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');

  // Collapse multiple whitespace and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return str(cleaned);
};

// ─────────────────────────────────────────────────────────────────────────────
// LLM/Text Processing Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %tokenize @path [delimiter] - Split text into tokens/words
 *
 * Splits text into an array of tokens. Default splits on whitespace.
 * Essential for LLM-era text processing and analysis.
 *
 * @example
 * words = "%tokenize @.text"                    ; Split on whitespace
 * parts = "%tokenize @.csv \",\""               ; Split on comma
 * sentences = "%tokenize @.paragraph \".\""     ; Split on period
 */
export const tokenize: VerbFunction = (args) => {
  if (args.length === 0) return { type: 'array' as const, items: [] };
  const s = toString(args[0]!);
  if (!s) return { type: 'array' as const, items: [] };

  // Default: split on whitespace
  const delimiter = args.length >= 2 ? toString(args[1]!) : '';

  let tokens: string[];
  if (delimiter === '') {
    // Split on whitespace, filter empty
    tokens = s.split(/\s+/).filter((t) => t.length > 0);
  } else {
    // Split on delimiter
    tokens = s
      .split(delimiter)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  return { type: 'array' as const, items: tokens.map((t) => str(t)) };
};

/**
 * %wordCount @path - Count words in text
 *
 * Returns the number of words (whitespace-separated tokens) in the text.
 *
 * @example
 * count = "%wordCount @.description"  ; "Hello world" → 2
 */
export const wordCount: VerbFunction = (args) => {
  if (args.length === 0) return int(0);
  const s = toString(args[0]!);
  if (!s.trim()) return int(0);

  const words = s.split(/\s+/).filter((w) => w.length > 0);
  return int(words.length);
};

// ─────────────────────────────────────────────────────────────────────────────
// Fuzzy String Matching Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %levenshtein @str1 @str2 - Calculate Levenshtein edit distance
 *
 * Returns the minimum number of single-character edits (insertions, deletions,
 * or substitutions) required to transform str1 into str2.
 * Useful for fuzzy matching, spell checking, and data deduplication.
 *
 * @example
 * dist = "%levenshtein @.name1 @.name2"  ; "kitten", "sitting" → 3
 */
export const levenshtein: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const s1 = toString(args[0]!);
  const s2 = toString(args[1]!);

  // Limit input length to prevent O(m*n) performance issues
  const maxLen = SECURITY_LIMITS.MAX_LEVENSHTEIN_LENGTH;
  if (s1.length > maxLen || s2.length > maxLen) return nil();

  const m = s1.length;
  const n = s2.length;

  // Handle edge cases
  if (m === 0) return int(n);
  if (n === 0) return int(m);

  // Create two rows for dynamic programming (space optimization)
  let prevRow = new Array(n + 1);
  let currRow = new Array(n + 1);

  // Initialize first row
  for (let j = 0; j <= n; j++) {
    prevRow[j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return int(prevRow[n]);
};

/**
 * %soundex @path - Generate Soundex phonetic code
 *
 * Returns the 4-character Soundex code for a string. Soundex encodes
 * similar-sounding names to the same code, useful for phonetic matching.
 * Based on the American Soundex algorithm.
 *
 * @example
 * code = "%soundex @.lastName"  ; "Robert" → "R163", "Rupert" → "R163"
 */
export const soundex: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const s = toString(args[0]!)
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (!s) return str('');

  // Soundex mapping: A,E,I,O,U,H,W,Y = 0 (ignored after first letter)
  // B,F,P,V = 1; C,G,J,K,Q,S,X,Z = 2; D,T = 3; L = 4; M,N = 5; R = 6
  const getCode = (c: string): string => {
    switch (c) {
      case 'B':
      case 'F':
      case 'P':
      case 'V':
        return '1';
      case 'C':
      case 'G':
      case 'J':
      case 'K':
      case 'Q':
      case 'S':
      case 'X':
      case 'Z':
        return '2';
      case 'D':
      case 'T':
        return '3';
      case 'L':
        return '4';
      case 'M':
      case 'N':
        return '5';
      case 'R':
        return '6';
      default:
        return '0';
    }
  };

  let result = s[0]!; // First letter kept as-is
  let prevCode = getCode(s[0]!);

  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = getCode(s[i]!);
    if (code !== '0' && code !== prevCode) {
      result += code;
    }
    prevCode = code;
  }

  // Pad with zeros to length 4
  while (result.length < 4) {
    result += '0';
  }

  return str(result);
};

// ─────────────────────────────────────────────────────────────────────────────
// Phone Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %formatPhone @value "countryCode" - Format phone number
 *
 * Strips non-digit characters and formats according to country code.
 * Supported: US, CA, GB, DE, FR, AU, JP.
 * Invalid digit count for country → returns original unformatted value with T011.
 * Missing/invalid country code → T002.
 *
 * @example
 * %formatPhone @phone "US"   ; "2125551234" → "(212) 555-1234"
 * %formatPhone @phone "GB"   ; "2071234567" → "+44 2071 234567"
 */
export const formatPhone: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const raw = toString(args[0]!);
  const country = toString(args[1]!).toUpperCase();

  // Strip non-digit characters
  const digits = raw.replace(/\D/g, '');

  switch (country) {
    case 'US':
    case 'CA': {
      // Strip leading 1 for US/CA
      const d = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
      if (d.length !== 10) return str(raw); // T011 - return original
      return str(`(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`);
    }
    case 'GB': {
      // Strip leading 44
      const d = digits.startsWith('44') ? digits.slice(2) : digits;
      if (d.length < 10 || d.length > 11) return str(raw);
      return str(`+44 ${d.slice(0, 4)} ${d.slice(4)}`);
    }
    case 'DE': {
      const d = digits.startsWith('49') ? digits.slice(2) : digits;
      if (d.length < 10 || d.length > 11) return str(raw);
      return str(`+49 ${d.slice(0, 4)} ${d.slice(4)}`);
    }
    case 'FR': {
      const d = digits.startsWith('33') ? digits.slice(2) : digits;
      if (d.length !== 9) return str(raw);
      return str(`+33 ${d[0]} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}`);
    }
    case 'AU': {
      const d = digits.startsWith('61') ? digits.slice(2) : digits;
      if (d.length !== 9) return str(raw);
      return str(`+61 ${d[0]} ${d.slice(1, 5)} ${d.slice(5)}`);
    }
    case 'JP': {
      const d = digits.startsWith('81') ? digits.slice(2) : digits;
      if (d.length < 10 || d.length > 11) return str(raw);
      return str(`+81 ${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`);
    }
    default:
      return str(raw); // Unknown country code
  }
};
