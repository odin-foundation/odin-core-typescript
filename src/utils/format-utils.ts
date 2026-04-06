/**
 * Shared formatting utilities for ODIN values.
 *
 * This module provides common formatting functions used across
 * serialization, canonicalization, and transformation modules.
 */

import type { OdinValue, OdinModifiers } from '../types/values.js';
import { uint8ArrayToBase64 } from './security-limits.js';

// ─────────────────────────────────────────────────────────────────────────────
// Modifier Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format modifier prefixes for ODIN notation.
 *
 * Converts an OdinModifiers object into the corresponding ODIN prefix string.
 * Order is significant: ! (required) * (confidential) - (deprecated)
 *
 * @param modifiers - Modifiers object (may be undefined)
 * @returns Prefix string ("!", "*", "-", or combinations like "!*", "!-", etc.)
 *
 * @example
 * formatModifierPrefix({ required: true }) // "!"
 * formatModifierPrefix({ required: true, confidential: true }) // "!*"
 * formatModifierPrefix({ deprecated: true, confidential: true }) // "*-"
 * formatModifierPrefix(undefined) // ""
 */
export function formatModifierPrefix(modifiers?: OdinModifiers): string {
  if (!modifiers) return '';

  let prefix = '';
  if (modifiers.required) prefix += '!';
  if (modifiers.confidential) prefix += '*';
  if (modifiers.deprecated) prefix += '-';
  return prefix;
}

/**
 * Check if any modifier is set.
 *
 * Returns true if at least one modifier (required, confidential, or deprecated)
 * is truthy in the modifiers object.
 *
 * @param modifiers - Modifiers object to check (may be undefined)
 * @returns true if any modifier is set, false otherwise
 *
 * @example
 * hasAnyModifier({ required: true }) // true
 * hasAnyModifier({ required: false, confidential: false }) // false
 * hasAnyModifier(undefined) // false
 */
export function hasAnyModifier(modifiers?: OdinModifiers): boolean {
  return !!(modifiers?.required || modifiers?.confidential || modifiers?.deprecated);
}

/**
 * Format modifier attributes for XML output.
 *
 * Converts an OdinModifiers object into an array of XML attribute strings
 * suitable for inclusion in XML element tags.
 *
 * @param modifiers - Modifiers object (may be undefined)
 * @returns Array of XML attribute strings (e.g., ['odin:required="true"'])
 *
 * @example
 * formatModifierAttributes({ required: true })
 * // ['odin:required="true"']
 *
 * formatModifierAttributes({ required: true, confidential: true })
 * // ['odin:required="true"', 'odin:confidential="true"']
 */
export function formatModifierAttributes(modifiers?: OdinModifiers): string[] {
  const attrs: string[] = [];
  if (modifiers) {
    if (modifiers.required) attrs.push('odin:required="true"');
    if (modifiers.confidential) attrs.push('odin:confidential="true"');
    if (modifiers.deprecated) attrs.push('odin:deprecated="true"');
  }
  return attrs;
}

// ─────────────────────────────────────────────────────────────────────────────
// String Escaping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape special characters in a quoted string.
 *
 * @param value - String to escape
 * @param canonical - If true, uses minimal escaping for canonical form.
 *                    If false, uses optimized escaping for regular stringify.
 * @returns Escaped string (without surrounding quotes)
 *
 * Escapes:
 * - Backslash: \\
 * - Double quote: \"
 * - Newline: \n
 * - Carriage return: \r
 * - Tab: \t
 */
export function escapeOdinString(value: string, canonical = false): string {
  if (canonical) {
    // Canonical form: slice-based to avoid per-character string concat
    const len = value.length;
    // Fast check: does the string need escaping at all?
    let needsEscape = false;
    for (let i = 0; i < len; i++) {
      const code = value.charCodeAt(i);
      if (code === 92 || code === 34 || code === 10 || code === 13 || code === 9) {
        needsEscape = true;
        break;
      }
    }
    if (!needsEscape) return value;

    let result = '';
    let lastIndex = 0;
    for (let i = 0; i < len; i++) {
      const code = value.charCodeAt(i);
      let escape: string | undefined;
      switch (code) {
        case 92: escape = '\\\\'; break;
        case 34: escape = '\\"'; break;
        case 10: escape = '\\n'; break;
        case 13: escape = '\\r'; break;
        case 9: escape = '\\t'; break;
      }
      if (escape) {
        result += value.slice(lastIndex, i) + escape;
        lastIndex = i + 1;
      }
    }
    result += value.slice(lastIndex);
    return result;
  }

  // Regular form: optimized single-pass implementation
  let needsEscape = false;
  const len = value.length;
  for (let i = 0; i < len; i++) {
    const code = value.charCodeAt(i);
    if (code === 92 || code === 34 || code === 10 || code === 13 || code === 9) {
      needsEscape = true;
      break;
    }
  }

  if (!needsEscape) {
    return value;
  }

  let result = '';
  let lastIndex = 0;

  for (let i = 0; i < len; i++) {
    const code = value.charCodeAt(i);
    let escape: string | undefined;

    switch (code) {
      case 92: // \
        escape = '\\\\';
        break;
      case 34: // "
        escape = '\\"';
        break;
      case 10: // \n
        escape = '\\n';
        break;
      case 13: // \r
        escape = '\\r';
        break;
      case 9: // \t
        escape = '\\t';
        break;
    }

    if (escape) {
      result += value.slice(lastIndex, i) + escape;
      lastIndex = i + 1;
    }
  }

  result += value.slice(lastIndex);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Binary Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a binary value as ODIN binary notation.
 *
 * @param value - Binary ODIN value
 * @returns Formatted binary string (^base64 or ^algorithm:base64)
 */
export function formatBinary(value: OdinValue & { type: 'binary' }): string {
  // Use chunked encoding to prevent stack overflow with large binary data
  const base64 = uint8ArrayToBase64(value.data);

  if (value.algorithm) {
    return `^${value.algorithm}:${base64}`;
  }
  return `^${base64}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD string.
 *
 * @param date - Date to format
 * @returns ISO date string (YYYY-MM-DD)
 */
export function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
