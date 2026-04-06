/**
 * Main entry point for ODIN operations.
 *
 * All methods are static - do not instantiate this class.
 *
 * @example
 * ```typescript
 * import { Odin } from '@odin-foundation/core';
 *
 * // Parse ODIN text
 * const doc = Odin.parse(`
 *   {policy}
 *   number = PAP-2024-001
 *   premium = #$747.50
 * `);
 *
 * // Access values
 * const premium = doc.get('policy.premium');
 *
 * // Serialize back to ODIN
 * const text = Odin.stringify(doc);
 *
 * // Canonical form (deterministic bytes)
 * const canonical = Odin.canonicalize(doc);
 * ```
 */

import type { OdinDocument, OdinDocumentBuilder } from './types/document.js';
import type { OdinValue } from './types/values.js';
import type { OdinSchema, ValidationResult } from './types/schema.js';
import type { OdinDiff } from './types/diff.js';
import type { OdinTransform, TransformResult } from './types/transform.js';
import type {
  ParseOptions,
  StringifyOptions,
  ValidateOptions,
  ParseHandler,
} from './types/options.js';
import { Parser } from './parser/parser.js';
import { parseStream as runParseStream } from './parser/streaming-parser.js';
import {
  OdinDocumentImpl,
  createDocumentBuilder,
  createEmptyDocument,
} from './types/document-impl.js';
import { stringify } from './serializer/stringify.js';
import { canonicalize } from './serializer/canonicalize.js';
import { validate as runValidation } from './validator/validate.js';
import { formatModifierAttributes } from './utils/format-utils.js';
import { parseSchema as runParseSchema } from './validator/schema-parser.js';
import { diff as computeDiff } from './diff/diff.js';
import { patch as applyPatch } from './diff/patch.js';
import { parseTransform as runParseTransform } from './transform/parser.js';
import {
  executeTransform as runExecuteTransform,
  transformDocument as runTransformDocument,
  executeMultiRecordTransform as runMultiRecordTransform,
  type TransformOptions,
  type MultiRecordInput,
} from './transform/engine.js';

/**
 * Static class providing all ODIN operations.
 *
 * Method order follows the specification:
 * parse → stringify → validate → canonicalize → diff → patch
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Static utility class pattern for namespacing ODIN operations
export class Odin {
  /**
   * ODIN specification version supported by this implementation.
   */
  static readonly version: string = '1.0.0';

  /**
   * Private constructor - this class should not be instantiated.
   */
  private constructor() {
    throw new Error('Odin is a static class and should not be instantiated');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Parse
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Parse ODIN text into a document.
   *
   * @param input - ODIN text as string or UTF-8 bytes
   * @param options - Parse options
   * @returns Parsed document
   * @throws {ParseError} If input is invalid ODIN
   *
   * @example
   * ```typescript
   * const doc = Odin.parse('name = John\nage = ##42');
   * ```
   */
  static parse(input: string | Uint8Array, options?: ParseOptions): OdinDocument {
    // Convert Uint8Array to string if needed
    const source = typeof input === 'string' ? input : new TextDecoder('utf-8').decode(input);

    const parser = new Parser(options);
    const parsed = parser.parse(source);

    // Convert ParsedDocument to OdinDocument
    return new OdinDocumentImpl(
      parsed.metadata,
      parsed.assignments,
      parsed.modifiers,
      parsed.imports,
      parsed.schemas,
      parsed.conditionals
    );
  }

  /**
   * Parse ODIN text using streaming (for large documents).
   *
   * @param reader - Readable stream of UTF-8 bytes
   * @param handler - Callbacks for parse events
   * @returns Promise that resolves when parsing is complete
   *
   * @example
   * ```typescript
   * await Odin.parseStream(reader, {
   *   onHeader: (path) => console.log('Header:', path),
   *   onAssignment: (path, value) => console.log(path, '=', value),
   * });
   * ```
   */
  static parseStream(reader: ReadableStream<Uint8Array>, handler: ParseHandler): Promise<void> {
    return runParseStream(reader, handler);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Stringify
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Convert a document to ODIN text.
   *
   * @param doc - Document to serialize
   * @param options - Stringify options
   * @returns ODIN text
   *
   * @example
   * ```typescript
   * const text = Odin.stringify(doc, { pretty: true });
   * ```
   */
  static stringify(doc: OdinDocument, options?: StringifyOptions): string {
    return stringify(doc, options);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Schema
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Parse ODIN schema text into a schema object.
   *
   * @param input - Schema text as string or UTF-8 bytes
   * @param options - Parse options
   * @returns Parsed schema
   * @throws {ParseError} If input is invalid ODIN schema
   *
   * @example
   * ```typescript
   * const schema = Odin.parseSchema(`
   *   {$}
   *   odin = "1.0.0"
   *   schema = "1.0.0"
   *
   *   {@address}
   *   line1 = !:(1..100)
   *   city = !
   *   state = !:(2)
   *
   *   {customer}
   *   name = !
   *   billing = @address
   * `);
   * ```
   */
  static parseSchema(input: string | Uint8Array, options?: ParseOptions): OdinSchema {
    return runParseSchema(input, options);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Validate
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Validate a document against a schema.
   *
   * @param doc - Document to validate
   * @param schema - Schema to validate against
   * @param options - Validation options
   * @returns Validation result with errors and warnings
   *
   * @example
   * ```typescript
   * const result = Odin.validate(doc, schema);
   * if (!result.valid) {
   *   console.error('Validation errors:', result.errors);
   * }
   * ```
   */
  static validate(
    doc: OdinDocument,
    schema: OdinSchema,
    options?: ValidateOptions
  ): ValidationResult {
    return runValidation(doc, schema, options);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Canonicalize
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Produce deterministic canonical form of a document.
   *
   * Canonical form guarantees:
   * - Identical documents produce identical bytes
   * - Paths sorted lexicographically
   * - No comments or blank lines
   * - LF line endings
   * - Bare strings where possible
   *
   * @param doc - Document to canonicalize
   * @returns Canonical UTF-8 bytes
   *
   * @example
   * ```typescript
   * const bytes = Odin.canonicalize(doc);
   * const hash = crypto.subtle.digest('SHA-256', bytes);
   * ```
   */
  static canonicalize(doc: OdinDocument): Uint8Array {
    return canonicalize(doc);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Diff
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Compute the difference between two documents.
   *
   * @param a - Original document
   * @param b - Modified document
   * @returns Diff describing changes from a to b
   *
   * @example
   * ```typescript
   * const diff = Odin.diff(original, modified);
   * console.log('Added:', diff.additions);
   * console.log('Removed:', diff.deletions);
   * console.log('Changed:', diff.modifications);
   * ```
   */
  static diff(a: OdinDocument, b: OdinDocument): OdinDiff {
    return computeDiff(a, b);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Patch
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Apply a diff to a document, producing a new document.
   *
   * @param doc - Document to patch
   * @param diff - Diff to apply
   * @returns New document with diff applied
   * @throws {PatchError} If diff references non-existent paths
   *
   * @example
   * ```typescript
   * const patched = Odin.patch(original, diff);
   * // patched is equivalent to modified
   * ```
   */
  static patch(doc: OdinDocument, diff: OdinDiff): OdinDocument {
    return applyPatch(doc, diff);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Transform
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Parse ODIN Transform text into a transform object.
   *
   * @param input - Transform text as string or UTF-8 bytes
   * @param options - Parse options
   * @returns Parsed transform
   * @throws {ParseError} If input is invalid ODIN transform
   *
   * @example
   * ```typescript
   * const transform = Odin.parseTransform(`
   *   {$}
   *   odin = "1.0.0"
   *   transform = "1.0.0"
   *   direction = "json->odin"
   *
   *   {policy}
   *   number = @.policyNumber
   *   premium = @.totalPremium
   * `);
   * ```
   */
  static parseTransform(input: string | Uint8Array, _options?: ParseOptions): OdinTransform {
    const source = typeof input === 'string' ? input : new TextDecoder('utf-8').decode(input);
    return runParseTransform(source);
  }

  /**
   * Execute a transform on source data.
   *
   * @param transform - Transform object or transform text
   * @param source - Source data to transform
   * @param options - Transform options
   * @returns Transform result with output and any errors/warnings
   *
   * @example
   * ```typescript
   * const result = Odin.transform(transform, sourceData);
   * if (result.success) {
   *   console.log('Output:', result.output);
   *   console.log('Formatted:', result.formatted);
   * }
   * ```
   */
  static transform(
    transform: OdinTransform | string,
    source: unknown,
    options?: TransformOptions
  ): TransformResult {
    const transformObj = typeof transform === 'string' ? runParseTransform(transform) : transform;
    return runExecuteTransform(transformObj, source, options);
  }

  /**
   * Execute a transform on an ODIN document.
   *
   * @param transform - Transform object or transform text
   * @param doc - ODIN document to transform
   * @param options - Transform options
   * @returns Transform result
   *
   * @example
   * ```typescript
   * const result = Odin.transformDocument(transform, doc);
   * ```
   */
  static transformDocument(
    transform: OdinTransform | string,
    doc: OdinDocument,
    options?: TransformOptions
  ): TransformResult {
    const transformObj = typeof transform === 'string' ? runParseTransform(transform) : transform;
    return runTransformDocument(transformObj, doc, options);
  }

  /**
   * Execute a transform on multi-record input with discriminator-based routing.
   *
   * This processes input with multiple record types (e.g., fixed-width files
   * with different record type codes) by extracting discriminator values and
   * routing to matching segments.
   *
   * @param transform - Transform object or transform text
   * @param input - Multi-record input with records array
   * @param options - Transform options
   * @returns Transform result
   *
   * @example
   * ```typescript
   * const result = Odin.transformMultiRecord(transform, {
   *   records: [
   *     '01POL123456789   06152024A',
   *     '2017HGCM82633A004352024TOYOTA',
   *     '99000001000002'
   *   ]
   * });
   * ```
   */
  static transformMultiRecord(
    transform: OdinTransform | string,
    input: MultiRecordInput,
    options?: TransformOptions
  ): TransformResult {
    const transformObj = typeof transform === 'string' ? runParseTransform(transform) : transform;
    return runMultiRecordTransform(transformObj, input, options);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Factory Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a document builder for constructing documents programmatically.
   *
   * @returns New document builder
   *
   * @example
   * ```typescript
   * const doc = Odin.builder()
   *   .metadata('odin', '1.0.0')
   *   .set('name', 'John')
   *   .set('age', { type: 'integer', value: 30 })
   *   .build();
   * ```
   */
  static builder(): OdinDocumentBuilder {
    return createDocumentBuilder();
  }

  /**
   * Create an empty document.
   *
   * @returns Empty document
   */
  static empty(): OdinDocument {
    return createEmptyDocument();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build a path string from segments.
   *
   * @param segments - Path segments (strings for fields, numbers for array indices)
   * @returns Formatted path string
   *
   * @example
   * ```typescript
   * Odin.path('policy', 'vehicles', 0, 'vin')
   * // Returns: 'policy.vehicles[0].vin'
   *
   * Odin.path('&com.acme', 'custom_field')
   * // Returns: '&com.acme.custom_field'
   * ```
   */
  static path(...segments: (string | number)[]): string {
    if (segments.length === 0) {
      return '';
    }

    let result = '';
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      if (typeof segment === 'number') {
        result += `[${segment}]`;
      } else if (i === 0) {
        result = segment;
      } else {
        result += `.${segment}`;
      }
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Output Formatters
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Convert a document to JSON string.
   *
   * @param doc - Document to convert
   * @param options - Formatting options
   * @returns JSON string
   *
   * @example
   * ```typescript
   * const json = Odin.toJSON(doc);
   * const pretty = Odin.toJSON(doc, { indent: 2 });
   * ```
   */
  static toJSON(doc: OdinDocument, options?: { indent?: number; omitNulls?: boolean }): string {
    // Convert with type fidelity (preserves raw values for high-precision numbers/currency)
    const obj = docToJsonWithFidelity(doc);
    const filtered = options?.omitNulls ? filterNulls(obj) : obj;
    return JSON.stringify(filtered, null, options?.indent);
  }

  /**
   * Convert a document to XML string.
   *
   * @param doc - Document to convert
   * @param options - Formatting options
   * @returns XML string
   *
   * @example
   * ```typescript
   * const xml = Odin.toXML(doc, { rootElement: 'policy' });
   * ```
   */
  static toXML(
    doc: OdinDocument,
    options?: {
      rootElement?: string;
      indent?: number;
      declaration?: boolean;
      /** Include ODIN type and modifier attributes. Defaults to true. */
      includeOdinAttributes?: boolean;
    }
  ): string {
    const indent = options?.indent ?? 2;
    const rootElement = options?.rootElement ?? 'root';
    const includeOdinAttrs = options?.includeOdinAttributes !== false;
    const needsNamespace = includeOdinAttrs && docNeedsOdinNamespace(doc);

    let xml = '';
    if (options?.declaration !== false) {
      xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
    }

    // Add ODIN namespace if needed (for types or modifiers)
    const nsAttr = needsNamespace ? ' xmlns:odin="https://odin.foundation/ns"' : '';
    xml += `<${rootElement}${nsAttr}>\n`;
    xml += docToXmlWithFidelity(doc, 1, indent, includeOdinAttrs);
    xml += `</${rootElement}>\n`;

    return xml;
  }

  /**
   * Convert a document to CSV string.
   *
   * This works best for documents with array data.
   *
   * @param doc - Document to convert
   * @param options - Formatting options
   * @returns CSV string
   *
   * @example
   * ```typescript
   * const csv = Odin.toCSV(doc, { arrayPath: 'vehicles', delimiter: ',' });
   * ```
   */
  static toCSV(
    doc: OdinDocument,
    options?: { arrayPath?: string; delimiter?: string; header?: boolean }
  ): string {
    const obj = doc.toJSON() as Record<string, unknown>;
    const delimiter = options?.delimiter ?? ',';
    const includeHeader = options?.header !== false;

    // Find array data
    let rows: Record<string, unknown>[] = [];
    if (options?.arrayPath) {
      const pathValue = getNestedValue(obj, options.arrayPath);
      if (Array.isArray(pathValue)) {
        rows = pathValue as Record<string, unknown>[];
      }
    } else {
      // Find first array in the document
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          rows = value as Record<string, unknown>[];
          break;
        }
      }
    }

    if (rows.length === 0) {
      rows = [obj];
    }

    // Get columns from first row
    const columns = Object.keys(rows[0] ?? {});
    const lines: string[] = [];

    if (includeHeader) {
      lines.push(columns.map((c) => csvEscape(c, delimiter)).join(delimiter));
    }

    for (const row of rows) {
      const values = columns.map((col) => {
        const val = row[col];
        return csvEscape(val === null || val === undefined ? '' : String(val), delimiter);
      });
      lines.push(values.join(delimiter));
    }

    return lines.join('\n');
  }

  /**
   * Convert a document to fixed-width string.
   *
   * Requires field specifications with position and length.
   *
   * @param doc - Document to convert
   * @param options - Field specifications and formatting options
   * @returns Fixed-width string
   *
   * @example
   * ```typescript
   * const fw = Odin.toFixedWidth(doc, {
   *   lineWidth: 80,
   *   fields: [
   *     { path: 'policy.number', pos: 0, len: 15 },
   *     { path: 'policy.status', pos: 15, len: 1 }
   *   ]
   * });
   * ```
   */
  static toFixedWidth(
    doc: OdinDocument,
    options: {
      lineWidth: number;
      fields: Array<{
        path: string;
        pos: number;
        len: number;
        padChar?: string;
        align?: 'left' | 'right';
      }>;
      padChar?: string;
    }
  ): string {
    const obj = doc.toJSON() as Record<string, unknown>;
    const lineWidth = options.lineWidth;
    const defaultPad = options.padChar ?? ' ';

    // Initialize line with pad characters
    const lineChars = Array(lineWidth).fill(defaultPad);

    for (const field of options.fields) {
      const value = getNestedValue(obj, field.path);
      let str = value === null || value === undefined ? '' : String(value);
      const padChar = field.padChar ?? defaultPad;
      const align = field.align ?? 'left';

      // Truncate if necessary
      if (str.length > field.len) {
        str = str.slice(0, field.len);
      }

      // Pad the value
      if (align === 'right') {
        str = str.padStart(field.len, padChar);
      } else {
        str = str.padEnd(field.len, padChar);
      }

      // Write to line
      for (let i = 0; i < field.len && field.pos + i < lineWidth; i++) {
        lineChars[field.pos + i] = str.charAt(i);
      }
    }

    return lineChars.join('');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function filterNulls(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  if (Array.isArray(obj)) {
    return obj.map(filterNulls).filter((v) => v !== undefined);
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const filtered = filterNulls(value);
      if (filtered !== undefined) {
        result[key] = filtered;
      }
    }
    return result;
  }
  return obj;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function csvEscape(value: string, delimiter: string): string {
  if (value.includes('"') || value.includes(delimiter) || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Fidelity Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert OdinDocument to JSON object with type fidelity.
 * Uses `raw` values for currency/number to preserve precision.
 */
function docToJsonWithFidelity(doc: OdinDocument): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const path of doc.paths()) {
    // Skip metadata paths
    if (path.startsWith('$.')) continue;

    const value = doc.get(path);
    if (value === undefined) continue;

    setNestedValueFromPath(result, path, odinValueToJsonValue(value));
  }

  return result;
}

/**
 * Convert an OdinValue to a JSON-compatible value with precision preservation.
 */
function odinValueToJsonValue(value: OdinValue): unknown {
  switch (value.type) {
    case 'null':
      return null;
    case 'boolean':
      return value.value;
    case 'string':
      return value.value;
    case 'integer':
      return value.value;
    case 'number':
      // Use raw string if available and high-precision
      if (value.raw !== undefined && isHighPrecision(value.raw)) {
        return value.raw;
      }
      return value.value;
    case 'currency':
      // Currency: use raw string only for high-precision values
      if (value.raw !== undefined && isHighPrecision(value.raw)) {
        return value.raw;
      }
      return value.value;
    case 'percent':
      // Percent: use raw string only for high-precision values
      if (value.raw !== undefined && isHighPrecision(value.raw)) {
        return value.raw;
      }
      return value.value;
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
    case 'binary': {
      const b64 = btoa(String.fromCharCode(...value.data));
      return value.algorithm ? `^${value.algorithm}:${b64}` : `^${b64}`;
    }
    case 'array':
      return value.items.map((item) => {
        if (item instanceof Map) {
          const obj: Record<string, unknown> = {};
          for (const [k, v] of item) {
            obj[k] = odinValueToJsonValue(v as OdinValue);
          }
          return obj;
        }
        return odinValueToJsonValue(item as OdinValue);
      });
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value.value)) {
        obj[k] = odinValueToJsonValue(v as OdinValue);
      }
      return obj;
    }
    case 'verb':
      return `%${value.verb}`;
    default:
      return null;
  }
}

/**
 * Check if a numeric string has more precision than JavaScript can represent.
 */
function isHighPrecision(numStr: string): boolean {
  const cleaned = numStr.replace(/^-/, '').replace(/^0+/, '');
  const significantDigits = cleaned.replace('.', '').length;
  return significantDigits > 15;
}

/**
 * Set a value at a nested path in an object.
 */
function setNestedValueFromPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = parsePathToSegments(path);
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const nextPart = parts[i + 1]!;

    if (typeof part === 'number') {
      if (!Array.isArray(current)) continue;
      if (current[part] === undefined) {
        current[part] = typeof nextPart === 'number' ? [] : {};
      }
      current = current[part] as Record<string, unknown>;
    } else {
      if (current[part] === undefined) {
        current[part] = typeof nextPart === 'number' ? [] : {};
      }
      current = current[part] as Record<string, unknown>;
    }
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart !== undefined) {
    if (typeof lastPart === 'number' && Array.isArray(current)) {
      current[lastPart] = value;
    } else if (typeof lastPart === 'string') {
      current[lastPart] = value;
    }
  }
}

/**
 * Parse a path string into segments.
 */
function parsePathToSegments(path: string): (string | number)[] {
  const parts: (string | number)[] = [];
  let current = '';

  for (let i = 0; i < path.length; i++) {
    const char = path[i]!;

    if (char === '.') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else if (char === '[') {
      if (current) {
        parts.push(current);
        current = '';
      }
      i++;
      let indexStr = '';
      while (i < path.length && path[i] !== ']') {
        indexStr += path[i];
        i++;
      }
      parts.push(parseInt(indexStr, 10));
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Check if document needs ODIN namespace (has typed values or modifiers).
 */
function docNeedsOdinNamespace(doc: OdinDocument): boolean {
  // Check for modifiers
  for (const mods of doc.modifiers.values()) {
    if (mods.required || mods.confidential || mods.deprecated) {
      return true;
    }
  }

  // Check for non-string types (which need odin:type attribute)
  for (const path of doc.paths()) {
    if (path.startsWith('$.')) continue;
    const value = doc.get(path);
    if (value && value.type !== 'string' && value.type !== 'null') {
      return true;
    }
  }

  return false;
}

/**
 * Convert OdinDocument to XML with type fidelity and modifier attributes.
 */
function docToXmlWithFidelity(
  doc: OdinDocument,
  depth: number,
  indent: number,
  includeOdinAttrs: boolean
): string {
  // Build a tree structure from flat paths
  const tree = buildXmlTreeFromDoc(doc);

  // Render the tree to XML
  return renderXmlTreeNode(tree, doc, depth, indent, includeOdinAttrs);
}

interface XmlTreeNode {
  value?: OdinValue;
  path?: string;
  children: Map<string, XmlTreeNode>;
}

function buildXmlTreeFromDoc(doc: OdinDocument): XmlTreeNode {
  const root: XmlTreeNode = { children: new Map() };

  for (const path of doc.paths()) {
    if (path.startsWith('$.')) continue;

    const value = doc.get(path);
    if (value === undefined) continue;

    // Skip null values in XML output
    if (value.type === 'null') continue;

    const parts = parsePathToSegments(path);
    let node = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      const key = String(part);

      if (!node.children.has(key)) {
        node.children.set(key, { children: new Map() });
      }
      node = node.children.get(key)!;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart !== undefined) {
      const key = String(lastPart);
      if (!node.children.has(key)) {
        node.children.set(key, { children: new Map() });
      }
      const leafNode = node.children.get(key)!;
      leafNode.value = value;
      leafNode.path = path;
    }
  }

  return root;
}

function renderXmlTreeNode(
  node: XmlTreeNode,
  doc: OdinDocument,
  depth: number,
  indent: number,
  includeOdinAttrs: boolean
): string {
  const parts: string[] = [];
  const pad = ' '.repeat(depth * indent);

  for (const [key, child] of node.children) {
    // Skip numeric keys at root level (handled by parent as array items)
    if (/^\d+$/.test(key)) continue;

    // Check if children are array items
    const childKeys = Array.from(child.children.keys());
    const isArrayContainer = childKeys.length > 0 && childKeys.every((k) => /^\d+$/.test(k));

    if (isArrayContainer) {
      // Render array items
      for (const [, arrayItem] of child.children) {
        const attrs = includeOdinAttrs
          ? buildXmlAttributes(arrayItem.path, arrayItem.value, doc)
          : '';
        if (arrayItem.value) {
          const valueStr = odinValueToXmlString(arrayItem.value);
          parts.push(`${pad}<${key}${attrs}>${escapeXml(valueStr)}</${key}>\n`);
        } else {
          parts.push(`${pad}<${key}${attrs}>\n`);
          parts.push(renderXmlTreeNode(arrayItem, doc, depth + 1, indent, includeOdinAttrs));
          parts.push(`${pad}</${key}>\n`);
        }
      }
    } else if (child.children.size > 0 && !child.value) {
      // Container element
      parts.push(`${pad}<${key}>\n`);
      parts.push(renderXmlTreeNode(child, doc, depth + 1, indent, includeOdinAttrs));
      parts.push(`${pad}</${key}>\n`);
    } else if (child.value) {
      // Leaf element with value
      const attrs = includeOdinAttrs ? buildXmlAttributes(child.path, child.value, doc) : '';
      const valueStr = odinValueToXmlString(child.value);
      parts.push(`${pad}<${key}${attrs}>${escapeXml(valueStr)}</${key}>\n`);
    }
  }

  return parts.join('');
}

function buildXmlAttributes(
  path: string | undefined,
  value: OdinValue | undefined,
  doc: OdinDocument
): string {
  const attrs: string[] = [];

  // Add type attribute (skip for string as it's the default)
  if (value && value.type !== 'string') {
    attrs.push(`odin:type="${value.type}"`);
  }

  // Add currency code attribute for currency values
  if (value && value.type === 'currency' && 'currencyCode' in value && value.currencyCode) {
    attrs.push(`odin:currencyCode="${value.currencyCode}"`);
  }

  // Add modifier attributes
  if (path) {
    const modifiers = doc.modifiers.get(path);
    attrs.push(...formatModifierAttributes(modifiers));
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

function odinValueToXmlString(value: OdinValue): string {
  switch (value.type) {
    case 'null':
      return '';
    case 'boolean':
      return String(value.value);
    case 'string':
      return value.value;
    case 'integer':
      return String(value.value);
    case 'number':
      return value.raw !== undefined ? value.raw : String(value.value);
    case 'currency':
      return value.raw !== undefined ? value.raw : String(value.value);
    case 'percent':
      return value.raw !== undefined ? value.raw : String(value.value);
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
    case 'binary': {
      const b64 = btoa(String.fromCharCode(...value.data));
      return value.algorithm ? `^${value.algorithm}:${b64}` : `^${b64}`;
    }
    case 'array':
    case 'object':
      return JSON.stringify(value);
    case 'verb':
      return `%${value.verb}`;
    default:
      return '';
  }
}
