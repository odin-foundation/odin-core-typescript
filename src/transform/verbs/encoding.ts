/**
 * ODIN Transform Encoding Verbs
 *
 * Encoding verbs: base64Encode, base64Decode, urlEncode, urlDecode,
 * jsonEncode, jsonDecode.
 */

import type { VerbFunction, TransformValue } from '../../types/transform.js';
import { toString, str, nil } from './helpers.js';

/**
 * Convert a CDM TransformValue to a raw JS value for JSON serialization.
 */
function cdmToJs(val: unknown): unknown {
  if (val === null || val === undefined) return null;

  // Handle TransformValue objects (CDM)
  if (typeof val === 'object' && 'type' in val) {
    const tv = val as TransformValue;
    switch (tv.type) {
      case 'null':
        return null;
      case 'string':
      case 'time':
      case 'duration':
        return tv.value;
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        return tv.value;
      case 'boolean':
        return tv.value;
      case 'date':
      case 'timestamp':
        return tv.value.toISOString();
      case 'array':
        return (tv.items as unknown[]).map((item: unknown) => cdmToJs(item));
      case 'object': {
        const result: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(tv.value)) {
          result[key] = cdmToJs(v);
        }
        return result;
      }
      default:
        return val;
    }
  }

  // Handle arrays of CDM items
  if (Array.isArray(val)) {
    return val.map((item) => cdmToJs(item));
  }

  // Handle plain objects (might contain CDM items)
  if (typeof val === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
      result[key] = cdmToJs(v);
    }
    return result;
  }

  return val;
}

/**
 * Convert a raw JS value to a CDM TransformValue (recursively).
 */
function jsToCdm(val: unknown): unknown {
  if (val === null || val === undefined) {
    return { type: 'null' };
  }
  if (typeof val === 'string') {
    return { type: 'string', value: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { type: 'integer', value: val };
    }
    return { type: 'number', value: val };
  }
  if (typeof val === 'boolean') {
    return { type: 'boolean', value: val };
  }
  if (Array.isArray(val)) {
    return val.map((item) => jsToCdm(item));
  }
  if (typeof val === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
      result[key] = jsToCdm(v);
    }
    return result;
  }
  return val;
}

/**
 * %base64Encode @path - Encode string to base64
 *
 * @example
 * encoded = "%base64Encode @data"
 */
export const base64Encode: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);

  // Use Buffer in Node.js, btoa in browser
  if (typeof Buffer !== 'undefined') {
    return str(Buffer.from(value, 'utf-8').toString('base64'));
  } else if (typeof btoa === 'function') {
    // btoa doesn't handle Unicode well, need to encode first
    const utf8 = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1 as string, 16))
    );
    return str(btoa(utf8));
  }

  return nil();
};

/**
 * %base64Decode @path - Decode base64 string
 *
 * @example
 * decoded = "%base64Decode @encoded"
 */
export const base64Decode: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);

  // Validate base64 format for cross-language consistency
  // Allow standard base64 chars (A-Za-z0-9+/) and padding (=)
  // Also allow URL-safe variants (- instead of +, _ instead of /)
  const base64Regex = /^[A-Za-z0-9+/\-_]*={0,2}$/;
  if (!base64Regex.test(value)) {
    return nil();
  }

  try {
    // Use Buffer in Node.js, atob in browser
    if (typeof Buffer !== 'undefined') {
      return str(Buffer.from(value, 'base64').toString('utf-8'));
    } else if (typeof atob === 'function') {
      const decoded = atob(value);
      // Decode URI-encoded characters for Unicode support
      return str(
        decodeURIComponent(
          decoded
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        )
      );
    }
  } catch {
    // Invalid base64 string
    return nil();
  }

  return nil();
};

/**
 * %urlEncode @path - URL-encode a string (percent encoding)
 *
 * @example
 * encoded = "%urlEncode @query"  ; "hello world" -> "hello%20world"
 */
export const urlEncode: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);
  return str(encodeURIComponent(value));
};

/**
 * %urlDecode @path - Decode a URL-encoded string
 *
 * @example
 * decoded = "%urlDecode @encoded"  ; "hello%20world" -> "hello world"
 */
export const urlDecode: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);
  try {
    return str(decodeURIComponent(value));
  } catch {
    // Invalid URL encoding
    return nil();
  }
};

/**
 * %jsonEncode @path - Serialize value to JSON string
 *
 * For objects and arrays: returns the JSON serialization
 * For strings: escapes for safe inclusion in JSON (quotes, backslashes, etc.)
 *
 * @example
 * json_obj = "%jsonEncode @data"  ; {name:"John"} -> '{"name":"John"}'
 * escaped = "%jsonEncode @text"   ; "line1\nline2" -> "line1\\nline2"
 */
export const jsonEncode: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const val = args[0]!;

  // For objects, convert CDM to JS and serialize to JSON
  if (val.type === 'object') {
    return str(JSON.stringify(cdmToJs(val)));
  }
  // For arrays, convert CDM items to JS and serialize to JSON
  if (val.type === 'array') {
    return str(JSON.stringify(cdmToJs(val)));
  }

  // For other types, convert to string and escape for JSON inclusion
  const strVal = toString(val);
  const encoded = JSON.stringify(strVal);
  // Remove surrounding quotes for string escaping use case
  return str(encoded.slice(1, -1));
};

/**
 * %jsonDecode @path - Parse JSON string to value
 *
 * For JSON object/array strings: parses and returns the object/array
 * For escaped strings: unescapes and returns the string
 *
 * @example
 * obj = "%jsonDecode @json_str"  ; '{"name":"John"}' -> {name:"John"}
 * unescaped = "%jsonDecode @escaped"  ; "line1\\nline2" -> "line1\nline2"
 */
export const jsonDecode: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);

  // Try to parse as JSON first (handles objects, arrays, and valid JSON primitives)
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        // For arrays, convert items to CDM and wrap in array type
        const cdmItems = parsed.map((item) => jsToCdm(item));
        return {
          type: 'array',
          items: cdmItems as ReadonlyArray<
            ReadonlyMap<string, import('../../types/values.js').OdinTypedValue>
          >,
        };
      }

      if (typeof parsed === 'object' && parsed !== null) {
        // For objects, convert to CDM but return as plain object (not wrapped in type: 'object')
        // This matches how the transform system handles object values in assignments
        return jsToCdm(parsed) as TransformValue;
      }
    } catch {
      // Not valid JSON - fall through to string unescaping
    }
  }

  try {
    // Wrap in quotes and parse as JSON string to unescape
    return str(JSON.parse(`"${value}"`));
  } catch {
    // Invalid escape sequence - per spec, verbs return null on invalid input
    return nil();
  }
};

/**
 * %hexEncode @path - Encode string to hexadecimal
 *
 * @example
 * hex_data = "%hexEncode @data"  ; "Hello" -> "48656C6C6F"
 */
export const hexEncode: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);

  // Convert each character to its hex representation
  let hex = '';
  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);
    // Handle multi-byte UTF-8 encoding for characters > 127
    if (charCode > 127) {
      // Encode as UTF-8 bytes
      const encoded = encodeURIComponent(value.charAt(i));
      // Convert %XX sequences to hex
      hex += encoded.replace(/%/g, '');
    } else {
      hex += charCode.toString(16).padStart(2, '0');
    }
  }

  return str(hex);
};

/**
 * %hexDecode @path - Decode hexadecimal string
 *
 * @example
 * binary = "%hexDecode @hex_string"  ; "48656C6C6F" -> "Hello"
 */
export const hexDecode: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);

  // Empty string is valid
  if (value === '') return str('');

  // Validate hex string: must have even length and only hex characters
  if (value.length % 2 !== 0) return nil();
  if (!/^[0-9A-Fa-f]+$/.test(value)) return nil();

  try {
    // Convert hex pairs to characters
    let result = '';
    for (let i = 0; i < value.length; i += 2) {
      const hexByte = value.substring(i, i + 2);
      const charCode = parseInt(hexByte, 16);
      result += String.fromCharCode(charCode);
    }
    return str(result);
  } catch {
    // Invalid hex - per spec, verbs return null on invalid input
    return nil();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Cryptographic Hash Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %md5 @path - Compute MD5 hash of string
 * Returns lowercase hexadecimal string (32 characters).
 *
 * WARNING: MD5 is cryptographically broken and should NOT be used for security.
 * Use only for checksums, cache keys, or legacy compatibility.
 *
 * @example
 * hash = "%md5 @data"  ; "hello" -> "5d41402abc4b2a76b9719d911017c592"
 */
export const md5: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);

  try {
    // Use Node.js crypto module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(value, 'utf-8').digest('hex');
    return str(hash.toLowerCase());
  } catch {
    // Crypto not available
    return nil();
  }
};

/**
 * %sha1 @path - Compute SHA-1 hash of string
 * Returns lowercase hexadecimal string (40 characters).
 *
 * WARNING: SHA-1 is deprecated for security use. Use SHA-256 or SHA-512 instead.
 * SHA-1 is still acceptable for non-cryptographic uses like content addressing.
 *
 * @example
 * hash = "%sha1 @data"  ; "hello" -> "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"
 */
export const sha1: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);

  try {
    // Use Node.js crypto module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const hash = crypto.createHash('sha1').update(value, 'utf-8').digest('hex');
    return str(hash.toLowerCase());
  } catch {
    // Crypto not available
    return nil();
  }
};

/**
 * %sha256 @path - Compute SHA-256 hash of string
 * Returns lowercase hexadecimal string (64 characters).
 *
 * Cross-platform implementation using Node.js crypto module.
 *
 * @example
 * hash = "%sha256 @password"  ; "hello" -> "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
 */
export const sha256: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);

  try {
    // Use Node.js crypto module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(value, 'utf-8').digest('hex');
    return str(hash.toLowerCase());
  } catch {
    // Crypto not available
    return nil();
  }
};

/**
 * %sha512 @path - Compute SHA-512 hash of string
 * Returns lowercase hexadecimal string (128 characters).
 *
 * SHA-512 provides stronger security than SHA-256 with 512-bit output.
 *
 * @example
 * hash = "%sha512 @data"  ; "hello" -> "9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043"
 */
export const sha512: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);

  try {
    // Use Node.js crypto module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const hash = crypto.createHash('sha512').update(value, 'utf-8').digest('hex');
    return str(hash.toLowerCase());
  } catch {
    // Crypto not available
    return nil();
  }
};

/**
 * %crc32 @path - Compute CRC-32 checksum of string
 * Returns lowercase hexadecimal string (8 characters).
 *
 * CRC-32 is a fast checksum algorithm for data integrity verification.
 * NOT suitable for cryptographic purposes.
 *
 * @example
 * checksum = "%crc32 @data"  ; "hello" -> "3610a686"
 */
export const crc32: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const value = toString(args[0]!);

  // CRC-32 lookup table (IEEE polynomial)
  const crcTable = makeCRC32Table();

  // Calculate CRC-32
  let crc = 0xffffffff;
  const bytes = Buffer.from(value, 'utf-8');
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]!) & 0xff]!;
  }
  crc = (crc ^ 0xffffffff) >>> 0;

  // Return as 8-character lowercase hex
  return str(crc.toString(16).padStart(8, '0').toLowerCase());
};

/**
 * Generate CRC-32 lookup table using IEEE polynomial.
 */
function makeCRC32Table(): number[] {
  const table: number[] = [];
  const polynomial = 0xedb88320;

  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ polynomial;
      } else {
        crc = crc >>> 1;
      }
    }
    table[i] = crc >>> 0;
  }

  return table;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Path Query Verb
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %jsonPath @object "path" - Query nested JSON/object with path expression
 *
 * Simple JSONPath-like query support for extracting nested values.
 * Supports: dot notation, bracket notation, array indices, wildcards.
 *
 * Path syntax:
 * - `$.field` or `.field` - object property
 * - `[0]` - array index
 * - `[*]` - all array elements
 * - `..field` - recursive descent (find anywhere)
 *
 * @example
 * name = "%jsonPath @.data \"$.user.name\""
 * ids = "%jsonPath @.data \"$.items[*].id\""
 * deep = "%jsonPath @.data \"$..email\""
 */
export const jsonPath: VerbFunction = (args) => {
  if (args.length < 2) return nil();

  const val = args[0]!;
  const path = toString(args[1]!);

  // Get the actual value to query
  let data: unknown;
  if (val.type === 'object') {
    data = val.value;
  } else if (val.type === 'array') {
    data = val.items;
  } else if (val.type === 'string') {
    // Try to parse as JSON
    try {
      data = JSON.parse(val.value);
    } catch {
      return nil();
    }
  } else {
    return nil();
  }

  // Parse and execute path
  const result = executeJsonPath(data, path);

  if (result === undefined || result === null) {
    return nil();
  }

  // Convert result to TransformValue
  return jsToTransformValue(result);
};

/**
 * Execute a JSONPath-like query on data
 */
function executeJsonPath(data: unknown, path: string): unknown {
  // Normalize path
  let normalizedPath = path.trim();
  if (normalizedPath.startsWith('$')) {
    normalizedPath = normalizedPath.slice(1);
  }
  if (normalizedPath.startsWith('.') && !normalizedPath.startsWith('..')) {
    normalizedPath = normalizedPath.slice(1);
  }

  // Handle empty path
  if (!normalizedPath) {
    return data;
  }

  // Handle recursive descent
  if (normalizedPath.startsWith('..')) {
    const field = normalizedPath.slice(2).split(/[.[]/)[0]!;
    return findRecursive(data, field);
  }

  // Parse path segments
  const segments = parsePathSegments(normalizedPath);
  return traversePath(data, segments);
}

/**
 * Parse path into segments
 */
function parsePathSegments(path: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inBracket = false;

  for (let i = 0; i < path.length; i++) {
    const char = path[i]!;

    if (char === '[' && !inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
      inBracket = true;
    } else if (char === ']' && inBracket) {
      segments.push(`[${current}]`);
      current = '';
      inBracket = false;
    } else if (char === '.' && !inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    segments.push(current);
  }

  return segments;
}

/**
 * Traverse data using path segments
 */
function traversePath(data: unknown, segments: string[]): unknown {
  let current: unknown = data;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle wildcard [*]
    if (segment === '[*]') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      // Return array as-is (all elements)
      continue;
    }

    // Handle array index [n]
    const indexMatch = segment.match(/^\[(\d+)\]$/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1]!, 10);
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return undefined;
      }
      continue;
    }

    // Handle object property
    if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[segment];
    } else if (Array.isArray(current)) {
      // Map over array elements
      current = current
        .map((item) => {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            return (item as Record<string, unknown>)[segment];
          }
          return undefined;
        })
        .filter((v) => v !== undefined);
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Recursively find all values for a field name
 */
function findRecursive(data: unknown, field: string): unknown[] {
  const results: unknown[] = [];

  function search(obj: unknown): void {
    if (obj === null || obj === undefined) return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        search(item);
      }
    } else if (typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      if (field in record) {
        results.push(record[field]);
      }
      for (const value of Object.values(record)) {
        search(value);
      }
    }
  }

  search(data);
  return results;
}

// Import helper from helpers.ts
import { jsToTransformValue } from './helpers.js';
