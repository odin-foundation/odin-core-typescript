/**
 * Value Visitor - Unified value-to-string conversion utility.
 *
 * Consolidates 20+ duplicate switch statements across the codebase.
 * Provides a visitor pattern for converting OdinValue to different string representations.
 *
 * Usage:
 * - For simple conversions: use pre-built visitors (toOdinString, toJsonValue, etc.)
 * - For custom conversions: create a ValueVisitor and pass to visitValue()
 */

import type { OdinValue } from '../types/values.js';
import type { TransformValue } from '../types/transform.js';
import { uint8ArrayToBase64 } from './security-limits.js';

// ─────────────────────────────────────────────────────────────────────────────
// Visitor Pattern Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Visitor for converting OdinValue types to different representations.
 * Each method handles one value type and returns the converted result.
 */
export interface ValueVisitor<T> {
  visitNull(): T;
  visitBoolean(value: boolean): T;
  visitString(value: string): T;
  visitInteger(value: number): T;
  visitNumber(value: number, raw?: string, decimalPlaces?: number): T;
  visitCurrency(value: number, decimalPlaces: number, raw?: string, currencyCode?: string): T;
  visitPercent(value: number, raw?: string): T;
  visitDate(value: Date, raw: string): T;
  visitTimestamp(value: Date, raw: string): T;
  visitTime(value: string): T;
  visitDuration(value: string): T;
  visitReference(path: string): T;
  visitBinary(data: Uint8Array, algorithm?: string): T;
  visitVerb(verb: string, isCustom: boolean, args: readonly OdinValue[]): T;
  visitArray(items: readonly unknown[]): T;
  visitObject(value: Record<string, unknown>): T;
}

/**
 * Visit an OdinValue using the provided visitor.
 * Dispatches to the appropriate visitor method based on value type.
 */
export function visitValue<T>(value: OdinValue, visitor: ValueVisitor<T>): T {
  switch (value.type) {
    case 'null':
      return visitor.visitNull();

    case 'boolean':
      return visitor.visitBoolean(value.value);

    case 'string':
      return visitor.visitString(value.value);

    case 'integer':
      return visitor.visitInteger(value.value);

    case 'number':
      return visitor.visitNumber(value.value, value.raw, value.decimalPlaces);

    case 'currency':
      return visitor.visitCurrency(value.value, value.decimalPlaces, value.raw, value.currencyCode);

    case 'percent':
      return visitor.visitPercent(value.value, value.raw);

    case 'date':
      return visitor.visitDate(value.value, value.raw);

    case 'timestamp':
      return visitor.visitTimestamp(value.value, value.raw);

    case 'time':
      return visitor.visitTime(value.value);

    case 'duration':
      return visitor.visitDuration(value.value);

    case 'reference':
      return visitor.visitReference(value.path);

    case 'binary':
      return visitor.visitBinary(value.data, value.algorithm);

    case 'verb':
      return visitor.visitVerb(value.verb, value.isCustom, value.args);

    case 'array':
      return visitor.visitArray(value.items);

    case 'object':
      return visitor.visitObject(value.value);
  }
}

/**
 * Visit a TransformValue using the provided visitor.
 * TransformValue is compatible with OdinValue, so we can reuse the same visitor.
 */
export function visitTransformValue<T>(value: TransformValue, visitor: ValueVisitor<T>): T {
  return visitValue(value as OdinValue, visitor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-built Visitors for Common Conversions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert to ODIN string representation with type prefixes.
 * Used by: serializer/stringify.ts (formatValue)
 */
export class OdinStringVisitor implements ValueVisitor<string> {
  visitNull(): string {
    return '~';
  }

  visitBoolean(value: boolean): string {
    return value ? '?true' : '?false';
  }

  visitString(value: string): string {
    return this.formatString(value);
  }

  visitInteger(value: number): string {
    return `##${value}`;
  }

  visitNumber(value: number, raw?: string): string {
    return raw !== undefined ? `#${raw}` : `#${value}`;
  }

  visitCurrency(
    value: number,
    decimalPlaces: number,
    raw?: string,
    _currencyCode?: string
  ): string {
    if (raw !== undefined) {
      return `#$${raw}`;
    }
    const numStr = value.toFixed(decimalPlaces);
    return `#$${numStr}`;
  }

  visitPercent(value: number, raw?: string): string {
    return raw !== undefined ? `#%${raw}` : `#%${value}`;
  }

  visitDate(_value: Date, raw: string): string {
    return raw;
  }

  visitTimestamp(_value: Date, raw: string): string {
    return raw;
  }

  visitTime(value: string): string {
    return value;
  }

  visitDuration(value: string): string {
    return value;
  }

  visitReference(path: string): string {
    return `@${path}`;
  }

  visitBinary(data: Uint8Array, algorithm?: string): string {
    const base64 = uint8ArrayToBase64(data);
    return algorithm ? `^${algorithm}:${base64}` : `^${base64}`;
  }

  visitVerb(verb: string, isCustom: boolean, args: readonly OdinValue[]): string {
    const prefix = isCustom ? '%&' : '%';
    let result = `${prefix}${verb}`;
    for (const arg of args) {
      result += ' ';
      result += visitValue(arg, this);
    }
    return result;
  }

  visitArray(): string {
    return '[]';
  }

  visitObject(): string {
    return '{}';
  }

  private formatString(value: string): string {
    return `"${this.escapeString(value)}"`;
  }

  private escapeString(value: string): string {
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
        case 92:
          escape = '\\\\';
          break;
        case 34:
          escape = '\\"';
          break;
        case 10:
          escape = '\\n';
          break;
        case 13:
          escape = '\\r';
          break;
        case 9:
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
}

/**
 * Convert to canonical string representation (for hashing/signatures).
 * Used by: serializer/canonicalize.ts (formatCanonicalValue)
 */
export class CanonicalStringVisitor implements ValueVisitor<string> {
  visitNull(): string {
    return '~';
  }

  visitBoolean(value: boolean): string {
    return value ? 'true' : 'false';
  }

  visitString(value: string): string {
    return this.formatCanonicalString(value);
  }

  visitInteger(value: number): string {
    return `##${value}`;
  }

  visitNumber(value: number, raw?: string): string {
    return raw !== undefined ? `#${raw}` : `#${this.formatCanonicalNumberValue(value)}`;
  }

  visitCurrency(
    value: number,
    decimalPlaces: number,
    raw?: string,
    _currencyCode?: string
  ): string {
    return raw !== undefined ? `#$${raw}` : `#$${value.toFixed(decimalPlaces)}`;
  }

  visitPercent(value: number, raw?: string): string {
    return raw !== undefined ? `#%${raw}` : `#%${value}`;
  }

  visitDate(_value: Date, raw: string): string {
    return raw;
  }

  visitTimestamp(_value: Date, raw: string): string {
    return raw;
  }

  visitTime(value: string): string {
    return value;
  }

  visitDuration(value: string): string {
    return value;
  }

  visitReference(path: string): string {
    return `@${path}`;
  }

  visitBinary(data: Uint8Array, algorithm?: string): string {
    const base64 = uint8ArrayToBase64(data);
    return algorithm ? `^${algorithm}:${base64}` : `^${base64}`;
  }

  visitVerb(verb: string, isCustom: boolean, args: readonly OdinValue[]): string {
    const prefix = isCustom ? '%&' : '%';
    let result = `${prefix}${verb}`;
    for (const arg of args) {
      result += ' ';
      result += visitValue(arg, this);
    }
    return result;
  }

  visitArray(): string {
    return '[]';
  }

  visitObject(): string {
    return '{}';
  }

  private formatCanonicalString(value: string): string {
    return `"${this.escapeCanonicalString(value)}"`;
  }

  private escapeCanonicalString(value: string): string {
    let result = '';
    for (const char of value) {
      switch (char) {
        case '\\':
          result += '\\\\';
          break;
        case '"':
          result += '\\"';
          break;
        case '\n':
          result += '\\n';
          break;
        case '\r':
          result += '\\r';
          break;
        case '\t':
          result += '\\t';
          break;
        default:
          result += char;
      }
    }
    return result;
  }

  private formatCanonicalNumberValue(value: number): string {
    if (!Number.isFinite(value)) {
      throw new Error('Non-finite numbers cannot be canonicalized');
    }

    const str = String(value);

    if (str.includes('.') && !str.includes('e') && !str.includes('E')) {
      return str.replace(/\.?0+$/, '');
    }

    return str;
  }
}

/**
 * Convert to plain string (no type prefixes).
 * Used by: types/values.ts (toString), transform/engine-value-utils.ts (transformValueToString)
 */
export class PlainStringVisitor implements ValueVisitor<string> {
  visitNull(): string {
    return '';
  }

  visitBoolean(value: boolean): string {
    return String(value);
  }

  visitString(value: string): string {
    return value;
  }

  visitInteger(value: number): string {
    return String(value);
  }

  visitNumber(value: number): string {
    return String(value);
  }

  visitCurrency(
    value: number,
    _decimalPlaces: number,
    _raw?: string,
    _currencyCode?: string
  ): string {
    return String(value);
  }

  visitPercent(value: number): string {
    return String(value);
  }

  visitDate(_value: Date, raw: string): string {
    return raw;
  }

  visitTimestamp(value: Date): string {
    return value.toISOString();
  }

  visitTime(value: string): string {
    return value;
  }

  visitDuration(value: string): string {
    return value;
  }

  visitReference(path: string): string {
    return `@${path}`;
  }

  visitBinary(data: Uint8Array, algorithm?: string): string {
    const b64 = uint8ArrayToBase64(data);
    return algorithm ? `^${algorithm}:${b64}` : `^${b64}`;
  }

  visitVerb(verb: string, isCustom: boolean, args: readonly OdinValue[]): string {
    const prefix = isCustom ? '%&' : '%';
    const argsStr = args.map((a) => visitValue(a, this)).join(' ');
    return `${prefix}${verb}${argsStr ? ' ' + argsStr : ''}`;
  }

  visitArray(items: readonly unknown[]): string {
    return JSON.stringify(items);
  }

  visitObject(value: Record<string, unknown>): string {
    return JSON.stringify(value);
  }
}

/**
 * Convert to JSON-compatible value (preserves types, not strings).
 * Used by: types/document-impl.ts (valueToJSON), odin.ts (odinValueToJsonValue)
 */
export class JsonValueVisitor implements ValueVisitor<unknown> {
  constructor(private readonly preservePrecision: boolean = false) {}

  visitNull(): unknown {
    return null;
  }

  visitBoolean(value: boolean): unknown {
    return value;
  }

  visitString(value: string): unknown {
    return value;
  }

  visitInteger(value: number): unknown {
    return value;
  }

  visitNumber(value: number, raw?: string): unknown {
    if (this.preservePrecision && raw !== undefined && this.isHighPrecision(raw)) {
      return raw;
    }
    return value;
  }

  visitCurrency(
    value: number,
    _decimalPlaces: number,
    raw?: string,
    _currencyCode?: string
  ): unknown {
    if (this.preservePrecision && raw !== undefined) {
      return raw;
    }
    return value;
  }

  visitPercent(value: number, raw?: string): unknown {
    if (this.preservePrecision && raw !== undefined) {
      return raw;
    }
    return value;
  }

  visitDate(_value: Date, raw: string): unknown {
    return raw;
  }

  visitTimestamp(_value: Date, raw: string): unknown {
    return raw;
  }

  visitTime(value: string): unknown {
    return value;
  }

  visitDuration(value: string): unknown {
    return value;
  }

  visitReference(path: string): unknown {
    return `@${path}`;
  }

  visitBinary(data: Uint8Array, algorithm?: string): unknown {
    const base64 = uint8ArrayToBase64(data);
    return algorithm ? `^${algorithm}:${base64}` : `^${base64}`;
  }

  visitVerb(verb: string): unknown {
    return `%${verb}`;
  }

  visitArray(items: readonly unknown[]): unknown {
    return items.map((item) => {
      if (item instanceof Map) {
        const obj: Record<string, unknown> = {};
        for (const [k, v] of item) {
          obj[k] = visitValue(v as OdinValue, this);
        }
        return obj;
      }
      return visitValue(item as OdinValue, this);
    });
  }

  visitObject(value: Record<string, unknown>): unknown {
    return value;
  }

  private isHighPrecision(numStr: string): boolean {
    const cleaned = numStr.replace(/^-/, '').replace(/^0+/, '');
    const significantDigits = cleaned.replace('.', '').length;
    return significantDigits > 15;
  }
}

/**
 * Convert to JavaScript primitive (for transforms and internal use).
 * Used by: transform/engine-odin-values.ts (odinValueToJs)
 */
export class JsValueVisitor implements ValueVisitor<unknown> {
  visitNull(): unknown {
    return null;
  }

  visitBoolean(value: boolean): unknown {
    return value;
  }

  visitString(value: string): unknown {
    return value;
  }

  visitInteger(value: number): unknown {
    return value;
  }

  visitNumber(value: number): unknown {
    return value;
  }

  visitCurrency(
    value: number,
    _decimalPlaces: number,
    _raw?: string,
    _currencyCode?: string
  ): unknown {
    return value;
  }

  visitPercent(value: number): unknown {
    return value;
  }

  visitDate(_value: Date, raw: string): unknown {
    return raw;
  }

  visitTimestamp(_value: Date, raw: string): unknown {
    return raw;
  }

  visitTime(value: string): unknown {
    return value;
  }

  visitDuration(value: string): unknown {
    return value;
  }

  visitReference(path: string): unknown {
    return `@${path}`;
  }

  visitBinary(data: Uint8Array, algorithm?: string): unknown {
    const b64 = uint8ArrayToBase64(data);
    return algorithm ? `^${algorithm}:${b64}` : `^${b64}`;
  }

  visitVerb(): unknown {
    return null;
  }

  visitArray(items: readonly unknown[]): unknown {
    return items;
  }

  visitObject(value: Record<string, unknown>): unknown {
    return value;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instances
// ─────────────────────────────────────────────────────────────────────────────

const odinStringVisitor = new OdinStringVisitor();
const canonicalStringVisitor = new CanonicalStringVisitor();
const plainStringVisitor = new PlainStringVisitor();
const jsonValueVisitor = new JsonValueVisitor(false);
const jsonValuePrecisionVisitor = new JsonValueVisitor(true);
const jsValueVisitor = new JsValueVisitor();

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert OdinValue to ODIN string format (with type prefixes).
 */
export function toOdinString(value: OdinValue): string {
  return visitValue(value, odinStringVisitor);
}

/**
 * Convert OdinValue to canonical string format (for hashing).
 */
export function toCanonicalString(value: OdinValue): string {
  return visitValue(value, canonicalStringVisitor);
}

/**
 * Convert OdinValue to plain string (no type prefixes).
 */
export function toPlainString(value: OdinValue): string {
  return visitValue(value, plainStringVisitor);
}

/**
 * Convert OdinValue to JSON-compatible value.
 */
export function toJsonValue(value: OdinValue, preservePrecision: boolean = false): unknown {
  return visitValue(value, preservePrecision ? jsonValuePrecisionVisitor : jsonValueVisitor);
}

/**
 * Convert OdinValue to JavaScript primitive.
 */
export function toJsValue(value: OdinValue): unknown {
  return visitValue(value, jsValueVisitor);
}

/**
 * Convert TransformValue to plain string.
 */
export function transformValueToPlainString(value: TransformValue): string {
  return visitTransformValue(value, plainStringVisitor);
}
