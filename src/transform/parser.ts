/**
 * ODIN Transform Parser
 *
 * Parses ODIN Transform documents into OdinTransform structures.
 * Transform documents are valid ODIN documents with specific headers and syntax.
 */

import { Odin } from '../odin.js';
import type { OdinDocument } from '../types/document.js';
import type { OdinValue } from '../types/values.js';
import type {
  OdinTransform,
  SourceConfig,
  LookupTable,
  TransformSegment,
  SegmentDirective,
  FieldMapping,
  ValueExpression,
  Modifier,
  TransformValue,
  Discriminator,
} from '../types/transform.js';
import { parseValueExpression } from './parser-expressions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Parser Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an ODIN Transform document
 */
export function parseTransform(input: string | OdinDocument): OdinTransform {
  const doc = typeof input === 'string' ? Odin.parse(input) : input;
  const parser = new TransformParser(doc);
  return parser.parse();
}

class TransformParser {
  private doc: OdinDocument;
  private transform: OdinTransform;

  constructor(doc: OdinDocument) {
    this.doc = doc;
    this.transform = {
      metadata: { odin: '1.0.0', transform: '1.0.0' },
      source: undefined,
      target: { format: 'json' },
      constants: new Map(),
      accumulators: new Map(),
      tables: new Map(),
      segments: [],
      imports: [],
      passes: [],
      enforceConfidential: undefined,
      strictTypes: undefined,
    };
  }

  parse(): OdinTransform {
    // Copy imports from ODIN document to transform structure
    this.parseImports();

    // Parse metadata from {$} header
    this.parseMetadata();

    // Parse source configuration from {$source}
    this.parseSource();

    // Parse target configuration from {$target}
    this.parseTarget();

    // Parse constants from {$const}
    this.parseConstants();

    // Parse accumulators from {$accumulator}
    this.parseAccumulators();

    // Parse lookup tables from {$table.NAME}
    this.parseTables();

    // Parse segments
    this.parseSegments();

    // Sort pass numbers for multi-pass execution order
    this.transform.passes.sort((a, b) => a - b);

    return this.transform;
  }

  /**
   * Parse import directives from the ODIN document.
   *
   * Imports allow transforms to reference external lookup tables or shared definitions.
   * The actual resolution of imports is the responsibility of the consumer.
   *
   * @example
   * @import ./lookup_tables/territory.odin
   * @import ./shared/state_codes.odin as states
   */
  private parseImports(): void {
    // Copy imports from underlying ODIN document
    this.transform.imports = this.doc.imports.map((imp) => {
      const importRef: import('../types/transform.js').ImportRef = {
        path: imp.path,
      };
      if (imp.alias !== undefined) importRef.alias = imp.alias;
      if (imp.line !== undefined) importRef.line = imp.line;
      return importRef;
    });
  }

  private parseMetadata(): void {
    const odin = this.getStringValue('$.odin');
    const transform = this.getStringValue('$.transform');
    const id = this.getStringValue('$.id');
    const name = this.getStringValue('$.name');

    this.transform.metadata = {
      odin: odin ?? '1.0.0',
      transform: transform ?? '1.0.0',
      id,
      name,
    };

    // Parse enforceConfidential directive
    const enforceConfidential = this.getStringValue('$.enforceConfidential');
    if (enforceConfidential === 'redact' || enforceConfidential === 'mask') {
      this.transform.enforceConfidential = enforceConfidential;
    }

    // Parse strictTypes directive
    const strictTypes = this.getBooleanValue('$.strictTypes');
    if (strictTypes !== undefined) {
      this.transform.strictTypes = strictTypes;
    }
  }

  private parseSource(): void {
    const format = this.getStringValue('$.source.format');
    if (!format) return;

    const source: SourceConfig = { format };

    const schema = this.getStringValue('$.source.schema');
    if (schema) source.schema = schema;

    // Parse discriminator
    const discStr = this.getStringValue('$.source.discriminator');
    if (discStr) {
      source.discriminator = this.parseDiscriminator(discStr);
    }

    // Parse namespaces
    const namespaces = this.parseNamespaces('$.source.namespace');
    if (namespaces.size > 0) source.namespaces = namespaces;

    this.transform.source = source;
  }

  private parseDiscriminator(value: string): Discriminator {
    // Parse discriminator syntax: :pos N :len M or :field N or @path
    const posMatch = value.match(/:pos\s+(\d+)/);
    const lenMatch = value.match(/:len\s+(\d+)/);
    const fieldMatch = value.match(/:field\s+(\d+)/);

    if (posMatch) {
      return {
        type: 'position',
        pos: parseInt(posMatch[1]!, 10),
        len: lenMatch ? parseInt(lenMatch[1]!, 10) : 1,
      };
    }

    if (fieldMatch) {
      return {
        type: 'field',
        field: parseInt(fieldMatch[1]!, 10),
      };
    }

    if (value.startsWith('@')) {
      return {
        type: 'path',
        path: value.slice(1),
      };
    }

    return { type: 'path', path: value };
  }

  private parseTarget(): void {
    const format = this.getStringValue('$.target.format') ?? 'json';

    this.transform.target = {
      format,
      encoding: this.getStringValue('$.target.encoding'),
      indent: this.getNumberValue('$.target.indent'),
      lineEnding: this.getStringValue('$.target.lineEnding'),
      lineWidth: this.getNumberValue('$.target.lineWidth'),
      padChar: this.getStringValue('$.target.padChar'),
      truncate: this.getBooleanValue('$.target.truncate'),
      declaration: this.getBooleanValue('$.target.declaration'),
      omitEmpty: this.getBooleanValue('$.target.omitEmpty'),
      delimiter: this.getStringValue('$.target.delimiter'),
      quote: this.getStringValue('$.target.quote'),
      header: this.getBooleanValue('$.target.header'),
      style: this.getStringValue('$.target.style') as 'kvp' | 'yaml' | undefined,
      nulls: this.getStringValue('$.target.nulls') as 'omit' | 'include' | undefined,
      emptyArrays: this.getStringValue('$.target.emptyArrays') as 'omit' | 'include' | undefined,
      onError: this.getStringValue('$.target.onError') as 'fail' | 'warn' | 'skip' | undefined,
      onMissing: this.getStringValue('$.target.onMissing') as
        | 'fail'
        | 'warn'
        | 'skip'
        | 'default'
        | undefined,
      onValidation: this.getStringValue('$.target.onValidation') as
        | 'fail'
        | 'warn'
        | 'skip'
        | undefined,
    };

    // Parse namespaces
    const namespaces = this.parseNamespaces('$.target.namespace');
    if (namespaces.size > 0) this.transform.target.namespaces = namespaces;
  }

  private parseNamespaces(prefix: string): Map<string, string> {
    const result = new Map<string, string>();
    for (const path of this.doc.paths()) {
      if (path.startsWith(prefix + '.')) {
        const key = path.slice(prefix.length + 1);
        const value = this.getStringValue(path);
        if (value) result.set(key, value);
      }
    }
    return result;
  }

  private parseConstants(): void {
    for (const path of this.doc.paths()) {
      if (path.startsWith('$.const.')) {
        const name = path.slice('$.const.'.length);
        const value = this.doc.get(path);
        if (value) {
          this.transform.constants.set(name, this.odinToTransformValue(value));
        }
      }
    }
  }

  private parseAccumulators(): void {
    // Track which accumulators have explicit persist flags
    const persistFlags = new Map<string, boolean>();

    // First pass: collect persist flags from name._persist = ?true paths
    for (const path of this.doc.paths()) {
      if (path.startsWith('$.accumulator.') && path.endsWith('._persist')) {
        const name = path.slice('$.accumulator.'.length, -'._persist'.length);
        const value = this.doc.get(path);
        if (value && value.type === 'boolean') {
          persistFlags.set(name, value.value);
        }
      }
    }

    // Second pass: create accumulators (skip _persist paths)
    for (const path of this.doc.paths()) {
      if (!path.startsWith('$.accumulator.')) continue;
      if (path.endsWith('._persist')) continue;
      if (path.includes(':')) continue; // Skip directive-style paths

      const name = path.slice('$.accumulator.'.length);
      // Skip nested paths (e.g., name.something)
      if (name.includes('.')) continue;

      const value = this.doc.get(path);
      if (value) {
        this.transform.accumulators.set(name, {
          name,
          initialValue: this.odinToTransformValue(value),
          persist: persistFlags.get(name) ?? false,
        });
      }
    }
  }

  private parseTables(): void {
    // New format: tables are stored as $.table.NAME[rowIndex].columnName = value
    // Example paths:
    //   $.table.RATE[0].vehicle_type = "sedan"
    //   $.table.RATE[0].coverage = "liability"
    //   $.table.RATE[0].base = ##250
    //   $.table.RATE[1].vehicle_type = "sedan"
    //   etc.
    //
    // Steps: discover tables/columns, group by row index, build rows

    // Map: tableName -> { columns: Set<string>, rowData: Map<rowIndex, Map<colName, value>> }
    const tableData = new Map<
      string,
      {
        columns: Set<string>;
        rowData: Map<number, Map<string, TransformValue>>;
      }
    >();

    for (const path of this.doc.paths()) {
      // Match: $.table.NAME[rowIndex].columnName
      const match = path.match(/^\$\.table\.([^[]+)\[(\d+)\]\.(.+)$/);
      if (!match) continue;

      const tableName = match[1]!;
      const rowIndex = parseInt(match[2]!, 10);
      const columnName = match[3]!;

      // Initialize table data if needed
      if (!tableData.has(tableName)) {
        tableData.set(tableName, {
          columns: new Set(),
          rowData: new Map(),
        });
      }

      const table = tableData.get(tableName)!;
      table.columns.add(columnName);

      // Initialize row if needed
      if (!table.rowData.has(rowIndex)) {
        table.rowData.set(rowIndex, new Map());
      }

      // Store value - use assignments.get() since doc.get() doesn't support array index paths
      const value = this.doc.assignments.get(path);
      if (value) {
        table.rowData.get(rowIndex)!.set(columnName, this.odinToTransformValue(value));
      }
    }

    // Convert to LookupTable format
    for (const [tableName, data] of tableData) {
      // Determine column order from first row (or alphabetically if no rows)
      const columns: string[] = [];
      const firstRow = data.rowData.get(0);
      if (firstRow) {
        // Use the order columns appear in the first row
        for (const col of data.columns) {
          columns.push(col);
        }
      } else {
        columns.push(...Array.from(data.columns).sort());
      }

      // Build rows array
      const rows: TransformValue[][] = [];
      const sortedRowIndices = Array.from(data.rowData.keys()).sort((a, b) => a - b);

      for (const rowIndex of sortedRowIndices) {
        const rowDataMap = data.rowData.get(rowIndex)!;
        const row: TransformValue[] = [];

        for (const col of columns) {
          row.push(rowDataMap.get(col) ?? { type: 'null' });
        }

        rows.push(row);
      }

      const table: LookupTable = {
        name: tableName,
        columns,
        rows,
      };

      this.transform.tables.set(tableName, table);
    }
  }

  private parseSegments(): void {
    // Find all segment-like headers (not metadata paths that start with $.)
    const segmentPaths = new Set<string>();

    for (const path of this.doc.paths()) {
      // Skip all metadata paths (anything starting with $.)
      if (path.startsWith('$.')) {
        continue;
      }

      // Handle segment.* paths (legacy syntax)
      if (path.startsWith('segment.')) {
        const segMatch = path.match(/^segment\.([^.[]+)(\[\])?/);
        if (segMatch) {
          segmentPaths.add('segment.' + segMatch[1] + (segMatch[2] ?? ''));
        }
        continue;
      }

      // Extract the segment header from the path.
      // A segment header is either:
      // 1. A simple name: "Order", "Policy"
      // 2. A simple array: "Items[]", "Vehicles[]"
      // 3. A nested path: "Order.Customer", "Policy.Insured"
      // 4. A nested array: "Order.Items[]", "Policy.Vehicles[]"
      //
      // The segment header ends at the first dot AFTER any array notation,
      // or at the start of a field path (directive or property).
      //
      // Examples:
      // - "Order.Id" -> segment "Order", field "Id"
      // - "Order.Customer.Name" -> segment "Order.Customer", field "Name"
      // - "Items[].Sku" -> segment "Items[]", field "Sku"
      // - "Order.Items[].Sku" -> segment "Order.Items[]", field "Sku"
      // - "Order.Items[]._loop" -> segment "Order.Items[]", directive "_loop"

      const segmentHeader = this.extractSegmentHeader(path);
      if (segmentHeader !== null) {
        segmentPaths.add(segmentHeader);
      }
    }

    for (const segmentPath of segmentPaths) {
      const segment = this.parseSegment(segmentPath);
      if (segment) {
        this.transform.segments.push(segment);
      }
    }
  }

  /**
   * Extract the segment header from a full path.
   * The segment header includes all parts up to and including any array notation ([]),
   * or up to the last dot before the field name.
   */
  private extractSegmentHeader(path: string): string | null {
    // If path contains [], the segment header goes up to and including []
    const arrayIdx = path.indexOf('[]');
    if (arrayIdx >= 0) {
      // Segment header is everything up to and including []
      return path.slice(0, arrayIdx + 2);
    }

    // No array notation - find the segment header (all but the last segment)
    // For "Order.Customer.Name" -> "Order.Customer"
    // For "Order.Id" -> "Order"
    // For "Policy" -> "Policy"
    const lastDot = path.lastIndexOf('.');
    if (lastDot > 0) {
      return path.slice(0, lastDot);
    }

    // No dots and no arrays - this is a root-level field (from {} header)
    // Return empty string to indicate root segment
    return '';
  }

  private parseSegment(headerPath: string): TransformSegment | null {
    const isArray = headerPath.endsWith('[]');
    const basePath = isArray ? headerPath.slice(0, -2) : headerPath;

    const segment: TransformSegment = {
      path: basePath,
      isArray,
      directives: [],
      mappings: [],
    };

    // Parse directives and mappings
    for (const path of this.doc.paths()) {
      if (!path.startsWith(basePath)) continue;

      // For root-level segment (basePath=''), only match truly root-level paths
      if (basePath === '') {
        if (path.startsWith('$') || path.startsWith('segment.') || path.includes('.') || path.includes('[')) {
          continue;
        }
      }

      let relativePath = path.slice(basePath.length);

      // Handle array notation: segment.VEH[]._type -> relativePath starts with [].
      // Strip leading [] if present
      if (relativePath.startsWith('[]')) {
        relativePath = relativePath.slice(2);
      }

      if (relativePath.startsWith('.') || relativePath === '' || basePath === '') {
        // This is a field under this segment
        const fieldPath = relativePath.startsWith('.') ? relativePath.slice(1) : relativePath;

        // Skip empty field paths
        if (!fieldPath) continue;

        // Directives: :name or _name syntax (bare `_` is discard target)
        if ((fieldPath.startsWith(':') || fieldPath.startsWith('_')) && fieldPath !== '_') {
          // Handle _pass directive specially - sets segment.pass property
          if (fieldPath === '_pass' || fieldPath === ':pass') {
            const value = this.doc.get(path);
            // Accept number, integer, and currency types for pass numbers
            if (
              value &&
              (value.type === 'number' || value.type === 'integer' || value.type === 'currency')
            ) {
              const passNum = Math.floor(value.value);
              if (passNum > 0) {
                segment.pass = passNum;
                // Track pass numbers for multi-pass execution
                if (!this.transform.passes.includes(passNum)) {
                  this.transform.passes.push(passNum);
                }
              }
            }
            continue;
          }
          // Other directives
          const directive = this.parseDirective(fieldPath, path);
          if (directive) segment.directives.push(directive);
        } else if (!fieldPath.includes('[')) {
          // Mapping
          const value = this.doc.get(path);
          if (value) {
            const mapping = this.parseMapping(fieldPath, value);
            if (mapping) segment.mappings.push(mapping);
          }
        }
      }
    }

    return segment.mappings.length > 0 || segment.directives.length > 0 ? segment : null;
  }

  private parseDirective(name: string, fullPath: string): SegmentDirective | null {
    // Parse directive from path like ":loop", ":type", "_loop", "_type", etc.
    // Strip leading : or _ prefix
    const directiveName = name.slice(1).split('.')[0]!;

    switch (directiveName) {
      case 'type':
      case 'loop':
      case 'counter':
      case 'from':
      case 'if':
      case 'literal': {
        // Get the directive value from the document
        const value = this.doc.get(fullPath);
        let valueStr = '';
        let alias: string | undefined;

        if (value) {
          if (value.type === 'string') {
            valueStr = value.value;
          } else if (value.type === 'number') {
            valueStr = String(value.value);
          }
        }

        // Parse alias for :loop :as syntax (e.g., "path :as item")
        if (directiveName === 'loop' && valueStr.includes(':as')) {
          const parts = valueStr.split(':as').map((s) => s.trim());
          valueStr = parts[0] ?? '';
          alias = parts[1];
        }

        const directive: SegmentDirective = {
          type: directiveName as SegmentDirective['type'],
          value: valueStr,
        };
        if (alias) {
          directive.alias = alias;
        }
        return directive;
      }
      default:
        return null;
    }
  }

  /**
   * Collect formatting and type directives from a value.
   * Handles:
   * - :pos, :len, :leftPad, :rightPad - for fixed-width output formatting
   * - :type - for type coercion on the result
   * - :trim, :upper, :lower - for string manipulation
   * - :decimals - for currency decimal places
   */
  private collectFormattingDirectives(value: OdinValue): Modifier[] {
    const modifiers: Modifier[] = [];
    const modifierDirectives = new Set([
      'pos',
      'len',
      'leftPad',
      'rightPad',
      'type',
      'decimals',
      'trim',
      'upper',
      'lower',
      'default',
    ]);

    if (value.directives) {
      for (const directive of value.directives) {
        if (modifierDirectives.has(directive.name)) {
          modifiers.push({ name: directive.name, value: directive.value });
        }
      }
    }

    // Recursively collect directives from nested verb arguments
    if (value.type === 'verb' && value.args.length > 0) {
      const findDirectivesInArgs = (args: readonly OdinValue[]): void => {
        for (const arg of args) {
          if (arg.directives) {
            for (const directive of arg.directives) {
              if (modifierDirectives.has(directive.name)) {
                if (!modifiers.some((m) => m.name === directive.name)) {
                  modifiers.push({ name: directive.name, value: directive.value });
                }
              }
            }
          }
          if (arg.type === 'verb' && arg.args.length > 0) {
            findDirectivesInArgs(arg.args);
          }
        }
      };
      findDirectivesInArgs(value.args);
    }

    return modifiers;
  }

  private parseMapping(targetField: string, value: OdinValue): FieldMapping | null {
    const formattingModifiers = this.collectFormattingDirectives(value);

    // Handle first-class verb expressions (parsed by ODIN parser)
    if (value.type === 'verb') {
      const expr = this.odinVerbToValueExpression(value);
      const mapping: FieldMapping = {
        target: targetField,
        value: expr,
        modifiers: [...formattingModifiers],
      };
      // Handle modifiers from the verb value if present
      if (value.modifiers?.confidential) {
        mapping.confidential = true;
        mapping.modifiers.push({ name: 'confidential' });
      }
      if (value.modifiers?.required) {
        mapping.modifiers.push({ name: 'required' });
      }
      if (value.modifiers?.deprecated) {
        mapping.modifiers.push({ name: 'deprecated' });
      }
      return mapping;
    }

    if (value.type === 'reference') {
      const copyExpr: ValueExpression = { type: 'copy', path: value.path };
      if (value.directives && value.directives.length > 0) {
        (copyExpr as { directives?: typeof value.directives }).directives = value.directives;
      }
      const modifiers: Modifier[] = [...formattingModifiers];
      let isConfidential = false;
      if (value.directives) {
        for (const directive of value.directives) {
          if (!modifiers.some((m) => m.name === directive.name)) {
            modifiers.push({ name: directive.name, value: directive.value });
          }
          if (directive.name === 'confidential') {
            isConfidential = true;
          }
        }
      }
      const mapping: FieldMapping = {
        target: targetField,
        value: copyExpr,
        modifiers,
      };
      if (isConfidential) {
        mapping.confidential = true;
      }
      return mapping;
    }

    // Literal types with directives
    if (value.type !== 'string' || value.directives) {
      const modifiers: Modifier[] = [...formattingModifiers];
      return {
        target: targetField,
        value: { type: 'literal', value: this.odinToTransformValue(value) },
        modifiers,
      };
    }

    // Parse the value as a transform expression (string-based - for backward compatibility)
    if (value.type !== 'string') {
      return {
        target: targetField,
        value: { type: 'literal', value: this.odinToTransformValue(value) },
        modifiers: [],
      };
    }

    const expr = parseValueExpression(value.value);
    const modifiers = this.parseModifiersFromString(value.value);

    // Check for :confidential modifier and set flag
    const confidentialModifier = modifiers.find((m) => m.name === 'confidential');
    const mapping: FieldMapping = {
      target: targetField,
      value: expr,
      modifiers,
    };
    if (confidentialModifier) {
      mapping.confidential = true;
    }
    return mapping;
  }

  /**
   * Convert an OdinVerbExpression to a ValueExpression.
   */
  private odinVerbToValueExpression(value: OdinValue & { type: 'verb' }): ValueExpression {
    const args: ValueExpression[] = value.args.map((arg) => this.odinValueToValueExpression(arg));
    return {
      type: 'transform',
      verb: value.verb,
      isCustom: value.isCustom,
      args,
    };
  }

  /**
   * Convert an OdinValue to a ValueExpression.
   */
  private odinValueToValueExpression(value: OdinValue): ValueExpression {
    switch (value.type) {
      case 'reference': {
        const expr: ValueExpression = { type: 'copy', path: value.path };
        if (value.directives && value.directives.length > 0) {
          (expr as { directives?: typeof value.directives }).directives = value.directives;
        }
        return expr;
      }
      case 'verb':
        return this.odinVerbToValueExpression(value);
      case 'string':
        return { type: 'literal', value: { type: 'string', value: value.value } };
      case 'number':
        return { type: 'literal', value: { type: 'number', value: value.value } };
      case 'integer':
        return { type: 'literal', value: { type: 'integer', value: value.value } };
      case 'currency':
        return {
          type: 'literal',
          value: { type: 'currency', value: value.value, decimalPlaces: value.decimalPlaces },
        };
      case 'percent':
        return { type: 'literal', value: { type: 'percent', value: value.value } };
      case 'boolean':
        return { type: 'literal', value: { type: 'boolean', value: value.value } };
      case 'null':
        return { type: 'literal', value: { type: 'null' } };
      default:
        return { type: 'literal', value: this.odinToTransformValue(value) };
    }
  }

  private parseModifiersFromString(raw: string): Modifier[] {
    const modifiers: Modifier[] = [];
    const modMatch = raw.matchAll(/:(\w+)(?:\s+([^\s:]+))?/g);

    for (const match of modMatch) {
      const name = match[1]!;
      const valueStr = match[2];

      let value: string | number | boolean | undefined;
      if (valueStr !== undefined) {
        // Try to parse as number
        const numVal = parseFloat(valueStr);
        if (!isNaN(numVal) && valueStr === String(numVal)) {
          value = numVal;
        } else if (valueStr === 'true') {
          value = true;
        } else if (valueStr === 'false') {
          value = false;
        } else {
          // Remove quotes if present
          value = valueStr.replace(/^"|"$/g, '');
        }
      }

      modifiers.push({ name, value });
    }

    return modifiers;
  }

  private odinToTransformValue(value: OdinValue): TransformValue {
    switch (value.type) {
      case 'null':
        return { type: 'null' };
      case 'string':
        return { type: 'string', value: value.value };
      case 'boolean':
        return { type: 'boolean', value: value.value };
      case 'number':
        if (value.decimalPlaces !== undefined) {
          return { type: 'number', value: value.value, decimalPlaces: value.decimalPlaces };
        }
        return { type: 'number', value: value.value };
      case 'integer':
        return { type: 'integer', value: value.value };
      case 'currency':
        return { type: 'currency', value: value.value, decimalPlaces: value.decimalPlaces };
      case 'percent':
        return { type: 'percent', value: value.value };
      case 'date':
        return { type: 'date', value: value.value, raw: value.raw };
      case 'timestamp':
        return { type: 'timestamp', value: value.value, raw: value.raw };
      case 'time':
        return { type: 'time', value: value.value };
      case 'duration':
        return { type: 'duration', value: value.value };
      case 'reference':
        return { type: 'reference', path: value.path };
      case 'binary':
        return value;
      case 'array':
        return value;
      case 'object':
        return value;
      default:
        return { type: 'null' };
    }
  }

  private getStringValue(path: string): string | undefined {
    const value = this.doc.get(path);
    if (!value || value.type !== 'string') return undefined;
    return value.value;
  }

  private getNumberValue(path: string): number | undefined {
    const value = this.doc.get(path);
    if (!value) return undefined;
    // Accept number, integer, and currency types
    if (value.type === 'number' || value.type === 'integer' || value.type === 'currency') {
      return value.value;
    }
    return undefined;
  }

  private getBooleanValue(path: string): boolean | undefined {
    const value = this.doc.get(path);
    if (!value || value.type !== 'boolean') return undefined;
    return value.value;
  }
}
