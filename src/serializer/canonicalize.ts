/**
 * Produce deterministic canonical form for hashing and signatures.
 */

import type { OdinDocument } from '../types/document.js';
import type { OdinValue, OdinModifiers } from '../types/values.js';
import { escapeOdinString, formatBinary, formatModifierPrefix } from '../utils/format-utils.js';

/**
 * Produce canonical form of a document.
 *
 * @param doc - Document to canonicalize
 * @returns UTF-8 bytes of canonical form
 */
// Reuse a single TextEncoder instance
const textEncoder = new TextEncoder();

export function canonicalize(doc: OdinDocument): Uint8Array {
  const lines: string[] = [];

  // Build sorted entries directly from maps, avoiding doc.paths() allocation
  const entries: { path: string; value: OdinValue }[] = [];
  for (const [key, value] of doc.metadata) {
    entries.push({ path: '$.' + key, value });
  }
  for (const [key, value] of doc.assignments) {
    // Skip $.key entries already in metadata
    if (key.length > 1 && key.charCodeAt(0) === 36 && key.charCodeAt(1) === 46) continue;
    entries.push({ path: key, value });
  }
  entries.sort((a, b) => canonicalPathCompare(a.path, b.path));

  for (const entry of entries) {
    const modifiers = doc.modifiers.get(entry.path);
    lines.push(formatCanonicalAssignment(entry.path, entry.value, modifiers));
  }

  const text = lines.join('\n') + (lines.length > 0 ? '\n' : '');

  return textEncoder.encode(text);
}

/**
 * Format a single assignment in canonical form.
 */
function formatCanonicalAssignment(
  path: string,
  value: OdinValue,
  modifiers?: OdinModifiers
): string {
  let line = path + ' = ';
  line += formatModifierPrefix(modifiers);
  line += formatCanonicalValue(value);
  return line;
}

/**
 * Format a value in canonical form.
 */
function formatCanonicalValue(value: OdinValue): string {
  switch (value.type) {
    case 'null':
      return '~';

    case 'boolean':
      return value.value ? 'true' : 'false';

    case 'string':
      return formatCanonicalString(value.value);

    case 'number':
      // Canonical form always strips trailing zeros (don't use raw)
      return `#${formatCanonicalNumberValue(value.value)}`;

    case 'integer':
      return `##${value.value}`;

    case 'currency': {
      // Canonical form: currency always has exactly 2 decimal places
      const dp = Math.max(value.decimalPlaces, 2);
      const currencyValue = `#$${value.value.toFixed(dp)}`;
      // Append currency code if present (uppercase in canonical form)
      return value.currencyCode
        ? `${currencyValue}:${value.currencyCode.toUpperCase()}`
        : currencyValue;
    }

    case 'percent':
      // Use raw value if available (preserves precision)
      return value.raw !== undefined ? `#%${value.raw}` : `#%${value.value}`;

    case 'date':
      return value.raw;

    case 'timestamp':
      return value.raw;

    case 'time':
      return value.value;

    case 'duration':
      return value.value;

    case 'reference':
      return `@${value.path}`;

    case 'binary':
      return formatBinary(value);

    case 'verb':
      return formatCanonicalVerbExpression(value);

    case 'array':
      // Arrays are expanded to indexed paths during document construction
      return '[]';

    case 'object':
      // Objects are expanded to dot-separated paths during document construction
      return '{}';

    default:
      return '';
  }
}

/**
 * Format a verb expression in canonical form.
 */
function formatCanonicalVerbExpression(value: {
  type: 'verb';
  verb: string;
  isCustom: boolean;
  args: readonly OdinValue[];
}): string {
  const prefix = value.isCustom ? '%&' : '%';
  let result = `${prefix}${value.verb}`;

  for (const arg of value.args) {
    result += ' ';
    result += formatCanonicalVerbArgument(arg);
  }

  return result;
}

/**
 * Format a single verb argument in canonical form.
 */
function formatCanonicalVerbArgument(value: OdinValue): string {
  switch (value.type) {
    case 'reference':
      return `@${value.path}`;
    case 'string':
      return formatCanonicalString(value.value);
    case 'verb':
      return formatCanonicalVerbExpression(value);
    case 'number':
      return value.raw !== undefined
        ? `#${value.raw}`
        : `#${formatCanonicalNumberValue(value.value)}`;
    case 'integer':
      return `##${value.value}`;
    case 'currency': {
      const currencyVal =
        value.raw !== undefined
          ? `#$${value.raw}`
          : `#$${value.value.toFixed(value.decimalPlaces)}`;
      return value.currencyCode ? `${currencyVal}:${value.currencyCode}` : currencyVal;
    }
    case 'percent':
      return value.raw !== undefined ? `#%${value.raw}` : `#%${value.value}`;
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'null':
      return '~';
    default:
      return formatCanonicalValue(value);
  }
}

/**
 * Format a string in canonical form.
 * All strings must be quoted in ODIN.
 */
function formatCanonicalString(value: string): string {
  return `"${escapeOdinString(value, true)}"`;
}

/**
 * Format a number value in canonical form.
 * Uses minimal representation - removes unnecessary trailing zeros.
 */
function formatCanonicalNumberValue(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('Non-finite numbers cannot be canonicalized');
  }

  const str = String(value);

  if (str.includes('.') && !str.includes('e') && !str.includes('E')) {
    return str.replace(/\.?0+$/, '');
  }

  return str;
}

/**
 * Format a date in canonical form: YYYY-MM-DD.
 * @internal Reserved for future use
 */
function _formatCanonicalDate(date: Date, raw?: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a timestamp in canonical form.
 * @internal Reserved for future use
 */
function _formatCanonicalTimestamp(date: Date, raw?: string): string {
  if (raw) {
    return raw;
  }
  return date.toISOString();
}

// Silence unused function warnings - these may be used in future
void _formatCanonicalDate;
void _formatCanonicalTimestamp;

/**
 * Compare two ODIN paths for canonical sorting.
 *
 * Rules:
 * 1. $ metadata first
 * 2. Segment-by-segment comparison
 * 3. Array indices sort numerically
 * 4. Extension paths (&domain) sort last
 */
function canonicalPathCompare(a: string, b: string): number {
  // $ metadata paths sort first
  const aIsMeta = a.charCodeAt(0) === 36; // '$'
  const bIsMeta = b.charCodeAt(0) === 36;
  if (aIsMeta && !bIsMeta) return -1;
  if (!aIsMeta && bIsMeta) return 1;

  // Extension paths sort last
  const aIsExt = a.charCodeAt(0) === 38; // '&'
  const bIsExt = b.charCodeAt(0) === 38;
  if (aIsExt && !bIsExt) return 1;
  if (!aIsExt && bIsExt) return -1;

  // Fast path: no array brackets — plain string comparison
  if (a.indexOf('[') < 0 && b.indexOf('[') < 0) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // Segment-by-segment comparison with inline numeric array index support
  let aPos = 0;
  let bPos = 0;
  while (aPos < a.length && bPos < b.length) {
    // Skip leading dots
    if (a.charCodeAt(aPos) === 46) aPos++;
    if (bPos < b.length && b.charCodeAt(bPos) === 46) bPos++;
    if (aPos >= a.length || bPos >= b.length) break;

    if (a.charCodeAt(aPos) === 91 && b.charCodeAt(bPos) === 91) {
      // Both are array indices — compare numerically
      const aClose = a.indexOf(']', aPos);
      const bClose = b.indexOf(']', bPos);
      if (aClose > aPos + 1 && bClose > bPos + 1) {
        let aVal = 0;
        let bVal = 0;
        for (let i = aPos + 1; i < aClose; i++) aVal = aVal * 10 + (a.charCodeAt(i) - 48);
        for (let i = bPos + 1; i < bClose; i++) bVal = bVal * 10 + (b.charCodeAt(i) - 48);
        if (aVal !== bVal) return aVal - bVal;
        aPos = aClose + 1;
        bPos = bClose + 1;
        continue;
      }
    }

    // Regular segments: find end (dot or bracket)
    const aStart = aPos;
    const bStart = bPos;
    while (aPos < a.length && a.charCodeAt(aPos) !== 46 && a.charCodeAt(aPos) !== 91) aPos++;
    while (bPos < b.length && b.charCodeAt(bPos) !== 46 && b.charCodeAt(bPos) !== 91) bPos++;

    const aLen = aPos - aStart;
    const bLen = bPos - bStart;
    const minLen = aLen < bLen ? aLen : bLen;
    for (let i = 0; i < minLen; i++) {
      const ac = a.charCodeAt(aStart + i);
      const bc = b.charCodeAt(bStart + i);
      if (ac !== bc) return ac - bc;
    }
    if (aLen !== bLen) return aLen - bLen;
  }

  return a.length - b.length;
}
