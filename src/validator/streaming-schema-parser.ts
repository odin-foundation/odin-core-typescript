/**
 * ODIN Streaming Schema Parser
 *
 * Parses schema files in streaming fashion with lazy type resolution.
 * Maintains a remainder buffer for efficient chunk boundary handling.
 *
 * Key design:
 * - Line-based parsing: accumulates partial lines, yields complete lines
 * - Lazy resolution: type references collected during parse, resolved after
 * - Memory efficient: processes chunks without loading entire file
 */

import type {
  OdinSchema,
  SchemaMetadata,
  SchemaType,
  SchemaField,
  SchemaFieldType,
  SchemaArray,
  SchemaObjectConstraint,
  SchemaImport,
} from '../types/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unresolved type reference collected during parsing.
 */
export interface UnresolvedTypeRef {
  /** Field path where reference occurs */
  fieldPath: string;
  /** Referenced type name (e.g., "address", "types.contact") */
  typeName: string;
  /** Line number for error reporting */
  line: number;
}

/**
 * Events emitted during streaming parse.
 */
export interface StreamingSchemaEvents {
  /** Called when a type definition header is encountered */
  onTypeStart?: (name: string, line: number) => void;
  /** Called when a field is parsed within a type */
  onField?: (typeName: string, field: SchemaField) => void;
  /** Called when a type definition ends */
  onTypeEnd?: (name: string) => void;
  /** Called when an unresolved type reference is found */
  onTypeRef?: (ref: UnresolvedTypeRef) => void;
  /** Called when metadata is parsed */
  onMetadata?: (metadata: SchemaMetadata) => void;
  /** Called when an import directive is parsed */
  onImport?: (imp: SchemaImport) => void;
  /** Called on parse errors */
  onError?: (error: Error, line: number) => void;
}

/**
 * Resolution result after linking type references.
 */
export interface ResolutionResult {
  /** Successfully resolved schema */
  schema: OdinSchema;
  /** Unresolved references (types not found) */
  unresolvedRefs: UnresolvedTypeRef[];
  /** Resolution warnings */
  warnings: string[];
}

/**
 * Parser state during streaming.
 */
interface ParserState {
  /** Current line number */
  line: number;
  /** Current type being parsed */
  currentType: string | null;
  /** Current type's namespace */
  currentNamespace: string | undefined;
  /** Current nested object path within type */
  currentPath: string;
  /** Whether in metadata section */
  inMetadata: boolean;
  /** Whether in array section */
  inArray: boolean;
  /** Current array path */
  arrayPath: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming Schema Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Streaming schema parser with lazy type resolution.
 *
 * Usage:
 * ```typescript
 * const parser = new StreamingSchemaParser();
 *
 * // Feed chunks as they arrive
 * parser.write(chunk1);
 * parser.write(chunk2);
 *
 * // Signal end of input and resolve references
 * const result = parser.end();
 * ```
 */
export class StreamingSchemaParser {
  /** Remainder buffer for partial lines */
  private remainder: string = '';

  /** Parser state */
  private state: ParserState;

  /** Event handlers */
  private events: StreamingSchemaEvents;

  /** Collected metadata */
  private metadata: SchemaMetadata = {};

  /** Collected imports */
  private imports: SchemaImport[] = [];

  /** Type definitions by name */
  private types: Map<string, SchemaType> = new Map();

  /** Current type's fields being accumulated */
  private currentTypeFields: Map<string, SchemaField> = new Map();

  /** Standalone fields (not in type definitions) */
  private fields: Map<string, SchemaField> = new Map();

  /** Array definitions */
  private arrays: Map<string, SchemaArray> = new Map();

  /** Object constraints */
  private constraints: Map<string, SchemaObjectConstraint[]> = new Map();

  /** Unresolved type references */
  private unresolvedRefs: UnresolvedTypeRef[] = [];

  /** All defined type names (for resolution) */
  private definedTypeNames: Set<string> = new Set();

  constructor(events?: StreamingSchemaEvents) {
    this.events = events ?? {};
    this.state = this.createInitialState();
  }

  private createInitialState(): ParserState {
    return {
      line: 1,
      currentType: null,
      currentNamespace: undefined,
      currentPath: '',
      inMetadata: false,
      inArray: false,
      arrayPath: '',
    };
  }

  /**
   * Write a chunk of data to the parser.
   * Can be string or Uint8Array.
   */
  write(chunk: string | Uint8Array): void {
    const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    this.remainder += text;
    this.processAvailableLines();
  }

  /**
   * Signal end of input and resolve type references.
   * Returns the complete schema with resolution results.
   */
  end(): ResolutionResult {
    // Process any remaining content
    if (this.remainder.length > 0) {
      this.processLine(this.remainder);
      this.remainder = '';
    }

    // Finalize current type if any
    this.finalizeCurrentType();

    // Resolve type references
    return this.resolve();
  }

  /**
   * Get current parse progress.
   */
  getProgress(): { line: number; typesFound: number; unresolvedCount: number } {
    return {
      line: this.state.line,
      typesFound: this.definedTypeNames.size,
      unresolvedCount: this.unresolvedRefs.length,
    };
  }

  /**
   * Process complete lines from the buffer.
   * Leaves partial lines in remainder for next chunk.
   */
  private processAvailableLines(): void {
    let newlineIndex: number;

    while ((newlineIndex = this.remainder.indexOf('\n')) !== -1) {
      // Extract complete line (excluding newline)
      const line = this.remainder.slice(0, newlineIndex);
      // Keep remainder after newline
      this.remainder = this.remainder.slice(newlineIndex + 1);

      // Handle CRLF
      const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line;

      this.processLine(cleanLine);
      this.state.line++;
    }
  }

  /**
   * Process a single complete line.
   */
  private processLine(line: string): void {
    // Skip empty lines
    const trimmed = line.trim();
    if (trimmed === '') return;

    // Skip comments
    if (trimmed.startsWith(';')) return;

    try {
      // Check for header
      if (trimmed.startsWith('{') && trimmed.includes('}')) {
        this.processHeader(trimmed);
        return;
      }

      // Check for import directive
      if (trimmed.startsWith('@import')) {
        this.processImport(trimmed);
        return;
      }

      // Check for assignment
      if (trimmed.includes('=')) {
        this.processAssignment(trimmed);
        return;
      }
    } catch (error) {
      this.events.onError?.(error as Error, this.state.line);
    }
  }

  /**
   * Process a header line.
   */
  private processHeader(line: string): void {
    // Extract header content between { and }
    const match = line.match(/^\{(.+?)\}/);
    if (!match) return;

    const content = match[1]!.trim();

    // Finalize previous type if switching contexts
    this.finalizeCurrentType();

    // Metadata header {$}
    if (content === '$') {
      this.state.inMetadata = true;
      this.state.currentType = null;
      this.state.currentPath = '';
      return;
    }

    // Type definition header {@typename} or {@namespace.typename}
    if (content.startsWith('@')) {
      this.state.inMetadata = false;
      const typePath = content.slice(1); // Remove @

      // Check for namespace
      const dotIndex = typePath.lastIndexOf('.');
      if (dotIndex > 0) {
        this.state.currentNamespace = typePath.slice(0, dotIndex);
        this.state.currentType = typePath.slice(dotIndex + 1);
      } else {
        this.state.currentNamespace = undefined;
        this.state.currentType = typePath;
      }

      this.state.currentPath = '';
      this.currentTypeFields = new Map();
      this.definedTypeNames.add(typePath);

      this.events.onTypeStart?.(typePath, this.state.line);
      return;
    }

    // Nested object header {.path}
    if (content.startsWith('.')) {
      this.state.inMetadata = false;
      this.state.currentPath = content.slice(1); // Remove leading .
      return;
    }

    // Array header {path[]}
    if (content.endsWith('[]')) {
      this.state.inMetadata = false;
      this.state.inArray = true;
      this.state.arrayPath = content.slice(0, -2);
      return;
    }
  }

  /**
   * Process an import directive.
   */
  private processImport(line: string): void {
    // Parse: @import path [as alias]
    const match = line.match(/^@import\s+(.+?)(?:\s+as\s+(\w+))?\s*$/);
    if (!match) return;

    let path = match[1]!.trim();
    const alias = match[2]?.trim();

    // Remove quotes if present
    if (
      (path.startsWith('"') && path.endsWith('"')) ||
      (path.startsWith("'") && path.endsWith("'"))
    ) {
      path = path.slice(1, -1);
    }

    const imp: SchemaImport = alias
      ? { path, alias, line: this.state.line }
      : { path, line: this.state.line };

    this.imports.push(imp);
    this.events.onImport?.(imp);
  }

  /**
   * Process an assignment line.
   */
  private processAssignment(line: string): void {
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) return;

    const path = line.slice(0, eqIndex).trim();
    const valueSpec = line.slice(eqIndex + 1).trim();

    // Handle metadata assignments
    if (this.state.inMetadata) {
      this.processMetadataAssignment(path, valueSpec);
      return;
    }

    // Parse field specification
    const field = this.parseFieldSpec(path, valueSpec);

    // Check for type reference
    if (field.type.kind === 'typeRef') {
      const ref: UnresolvedTypeRef = {
        fieldPath: this.getFullPath(path),
        typeName: field.type.name,
        line: this.state.line,
      };
      this.unresolvedRefs.push(ref);
      this.events.onTypeRef?.(ref);
    }

    // Store field
    if (this.state.currentType) {
      const fullPath = this.state.currentPath ? `${this.state.currentPath}.${path}` : path;
      field.path = fullPath;
      this.currentTypeFields.set(fullPath, field);
      this.events.onField?.(this.state.currentType, field);
    } else {
      const fullPath = this.getFullPath(path);
      field.path = fullPath;
      this.fields.set(fullPath, field);
    }
  }

  /**
   * Process a metadata assignment.
   */
  private processMetadataAssignment(key: string, value: string): void {
    // Remove quotes from string values
    let cleanValue = value;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      cleanValue = value.slice(1, -1);
    }

    switch (key) {
      case 'odin':
        this.metadata.odin = cleanValue;
        break;
      case 'schema':
        this.metadata.schema = cleanValue;
        break;
      case 'id':
        this.metadata.id = cleanValue;
        break;
      case 'version':
        this.metadata.version = cleanValue;
        break;
      case 'title':
        this.metadata.title = cleanValue;
        break;
      case 'description':
        this.metadata.description = cleanValue;
        break;
    }

    this.events.onMetadata?.(this.metadata);
  }

  /**
   * Parse a field specification into a SchemaField.
   */
  private parseFieldSpec(path: string, spec: string): SchemaField {
    const field: SchemaField = {
      path,
      type: { kind: 'string' },
      required: false,
      nullable: false,
      redacted: false,
      deprecated: false,
      constraints: [],
      conditionals: [],
    };

    let remaining = spec;

    // Parse modifiers at start: !, -, *, ~
    while (remaining.length > 0) {
      const char = remaining[0];
      if (char === '!') {
        field.required = true;
        remaining = remaining.slice(1);
      } else if (char === '-') {
        field.deprecated = true;
        remaining = remaining.slice(1);
      } else if (char === '*') {
        field.redacted = true;
        remaining = remaining.slice(1);
      } else if (char === '~') {
        field.nullable = true;
        remaining = remaining.slice(1);
      } else {
        break;
      }
    }

    remaining = remaining.trim();

    // Parse type
    field.type = this.parseFieldType(remaining);

    return field;
  }

  /**
   * Parse field type from specification.
   */
  private parseFieldType(spec: string): SchemaFieldType {
    // Empty or just constraints means string
    if (!spec || spec.startsWith(':')) {
      return { kind: 'string' };
    }

    // Type reference @typename or @namespace.typename
    if (spec.startsWith('@')) {
      const typeMatch = spec.match(/^@([\w.&]+)/);
      if (typeMatch) {
        return { kind: 'typeRef', name: typeMatch[1]! };
      }
    }

    // Boolean
    if (spec === '?' || spec.startsWith('?:') || spec === 'boolean') {
      return { kind: 'boolean' };
    }

    // Integer
    if (spec.startsWith('##') || spec === 'integer') {
      return { kind: 'integer' };
    }

    // Currency (default 2 decimal places)
    if (spec.startsWith('#$') || spec === 'currency') {
      return { kind: 'currency', places: 2 };
    }

    // Number
    if (spec.startsWith('#') || spec === 'number') {
      return { kind: 'number' };
    }

    // Timestamp
    if (spec === 'timestamp' || spec.startsWith('timestamp:')) {
      return { kind: 'timestamp' };
    }

    // Date
    if (spec === 'date' || spec.startsWith('date:')) {
      return { kind: 'date' };
    }

    // Time
    if (spec === 'time' || spec.startsWith('time:')) {
      return { kind: 'time' };
    }

    // Duration
    if (spec === 'duration' || spec.startsWith('duration:')) {
      return { kind: 'duration' };
    }

    // Binary
    if (spec === '^' || spec.startsWith('^:') || spec === 'binary') {
      return { kind: 'binary' };
    }

    // Array type - for streaming, we represent arrays via the element type
    // Full array handling is done by the SchemaArray structure
    if (spec.endsWith('[]')) {
      const elementSpec = spec.slice(0, -2);
      // Return the element type - array semantics handled elsewhere
      return this.parseFieldType(elementSpec);
    }

    // Default to string
    return { kind: 'string' };
  }

  /**
   * Get full path including current context.
   */
  private getFullPath(path: string): string {
    if (this.state.currentPath) {
      return `${this.state.currentPath}.${path}`;
    }
    return path;
  }

  /**
   * Finalize current type definition.
   */
  private finalizeCurrentType(): void {
    if (this.state.currentType && this.currentTypeFields.size > 0) {
      const typeName = this.state.currentNamespace
        ? `${this.state.currentNamespace}.${this.state.currentType}`
        : this.state.currentType;

      const schemaType: SchemaType = this.state.currentNamespace
        ? {
            name: this.state.currentType,
            namespace: this.state.currentNamespace,
            fields: new Map(this.currentTypeFields),
          }
        : {
            name: this.state.currentType,
            fields: new Map(this.currentTypeFields),
          };

      this.types.set(typeName, schemaType);
      this.events.onTypeEnd?.(typeName);
    }

    this.currentTypeFields = new Map();
  }

  /**
   * Resolve type references after parsing completes.
   */
  private resolve(): ResolutionResult {
    const warnings: string[] = [];
    const stillUnresolved: UnresolvedTypeRef[] = [];

    // Attempt to resolve each reference
    for (const ref of this.unresolvedRefs) {
      const resolved = this.resolveTypeRef(ref.typeName);

      if (!resolved) {
        stillUnresolved.push(ref);
        warnings.push(`Unresolved type reference: @${ref.typeName} at line ${ref.line}`);
      }
    }

    const schema: OdinSchema = {
      metadata: this.metadata,
      imports: this.imports,
      types: this.types,
      fields: this.fields,
      arrays: this.arrays,
      constraints: this.constraints,
    };

    return {
      schema,
      unresolvedRefs: stillUnresolved,
      warnings,
    };
  }

  /**
   * Resolve a type reference name.
   */
  private resolveTypeRef(typeName: string): SchemaType | undefined {
    // Direct lookup
    if (this.types.has(typeName)) {
      return this.types.get(typeName);
    }

    // Check without namespace prefix for local references
    for (const [name, type] of this.types) {
      if (name.endsWith(`.${typeName}`) || name === typeName) {
        return type;
      }
    }

    // Check if it's a composite type (type1&type2)
    if (typeName.includes('&')) {
      // Composite types are resolved by the resolver module
      // For streaming purposes, we just verify component types exist
      const components = typeName.split('&').map((t) => t.trim());
      const allExist = components.every(
        (comp) => this.definedTypeNames.has(comp) || this.types.has(comp)
      );
      if (allExist) {
        // Return a synthetic type to indicate resolution succeeded
        return { name: typeName, fields: new Map() };
      }
    }

    return undefined;
  }

  /**
   * Reset parser for reuse.
   */
  reset(): void {
    this.remainder = '';
    this.state = this.createInitialState();
    this.metadata = {};
    this.imports = [];
    this.types = new Map();
    this.currentTypeFields = new Map();
    this.fields = new Map();
    this.arrays = new Map();
    this.constraints = new Map();
    this.unresolvedRefs = [];
    this.definedTypeNames = new Set();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a schema string with streaming parser.
 * Convenience wrapper for simple use cases.
 */
export function parseSchemaStreaming(source: string): ResolutionResult {
  const parser = new StreamingSchemaParser();
  parser.write(source);
  return parser.end();
}

/**
 * Parse schema from chunks (simulates streaming).
 */
export async function parseSchemaFromChunks(
  chunks: AsyncIterable<string | Uint8Array>,
  events?: StreamingSchemaEvents
): Promise<ResolutionResult> {
  const parser = new StreamingSchemaParser(events);

  for await (const chunk of chunks) {
    parser.write(chunk);
  }

  return parser.end();
}
