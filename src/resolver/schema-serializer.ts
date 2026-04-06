/**
 * Convert OdinSchema objects to ODIN text format.
 */

import type {
  OdinSchema,
  SchemaMetadata,
  SchemaType,
  SchemaField,
  SchemaFieldType,
  SchemaConstraint,
  SchemaConditional,
  SchemaArray,
  SchemaObjectConstraint,
  SchemaCardinality,
  SchemaImport,
} from '../types/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for serializing a schema.
 */
export interface SerializerOptions {
  /**
   * Include comments for section separators.
   * @default true
   */
  includeSectionComments?: boolean;

  /**
   * Line separator (default is '\n').
   * @default '\n'
   */
  lineSeparator?: string;

  /**
   * Whether to include imports in output.
   * Set to false when outputting a flattened/bundled schema.
   * @default true
   */
  includeImports?: boolean;

  /**
   * Whether to include derivation metadata.
   * @default true
   */
  includeDerivation?: boolean;

  /**
   * Custom header comment to include at the top.
   */
  headerComment?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Serializer Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal options with required fields resolved.
 */
interface ResolvedSerializerOptions {
  includeSectionComments: boolean;
  lineSeparator: string;
  includeImports: boolean;
  includeDerivation: boolean;
  headerComment: string | undefined;
}

/**
 * Serializes OdinSchema objects to ODIN text format.
 */
export class SchemaSerializer {
  private readonly options: ResolvedSerializerOptions;
  private lines: string[] = [];

  constructor(options: SerializerOptions = {}) {
    this.options = {
      includeSectionComments: options.includeSectionComments ?? true,
      lineSeparator: options.lineSeparator ?? '\n',
      includeImports: options.includeImports ?? true,
      includeDerivation: options.includeDerivation ?? true,
      headerComment: options.headerComment,
    };
  }

  /**
   * Serialize an OdinSchema to ODIN text format.
   *
   * @param schema - The schema to serialize
   * @returns ODIN text representation
   */
  serialize(schema: OdinSchema): string {
    this.lines = [];

    // Header comment
    if (this.options.headerComment) {
      for (const line of this.options.headerComment.split('\n')) {
        this.lines.push(`; ${line}`);
      }
      this.lines.push('');
    }

    // Metadata section
    this.serializeMetadata(schema.metadata);

    // Imports (if enabled)
    if (this.options.includeImports && schema.imports.length > 0) {
      this.lines.push('');
      this.serializeImports(schema.imports);
    }

    // Type definitions
    if (schema.types.size > 0) {
      this.lines.push('');
      this.serializeTypes(schema.types);
    }

    // Field definitions
    if (schema.fields.size > 0) {
      this.lines.push('');
      this.serializeFields(schema.fields, schema.constraints);
    }

    // Array definitions
    if (schema.arrays.size > 0) {
      this.lines.push('');
      this.serializeArrays(schema.arrays);
    }

    return this.lines.join(this.options.lineSeparator);
  }

  /**
   * Serialize metadata section.
   */
  private serializeMetadata(metadata: SchemaMetadata): void {
    this.lines.push('{$}');

    if (metadata.odin !== undefined) {
      this.lines.push(`odin = "${metadata.odin}"`);
    }
    if (metadata.schema !== undefined) {
      this.lines.push(`schema = "${metadata.schema}"`);
    }
    if (metadata.id !== undefined) {
      this.lines.push(`id = "${metadata.id}"`);
    }
    if (metadata.version !== undefined) {
      this.lines.push(`version = "${metadata.version}"`);
    }
    if (metadata.title !== undefined) {
      this.lines.push(`title = "${metadata.title}"`);
    }
    if (metadata.description !== undefined) {
      this.lines.push(`description = "${metadata.description}"`);
    }
  }

  /**
   * Serialize import directives.
   */
  private serializeImports(imports: readonly SchemaImport[]): void {
    for (const imp of imports) {
      if (imp.alias) {
        this.lines.push(`@import "${imp.path}" as ${imp.alias}`);
      } else {
        this.lines.push(`@import "${imp.path}"`);
      }
    }
  }

  /**
   * Serialize type definitions.
   */
  private serializeTypes(types: ReadonlyMap<string, SchemaType>): void {
    const typeNames = [...types.keys()].sort();

    for (const typeName of typeNames) {
      const type = types.get(typeName);
      if (!type) continue;

      if (this.options.includeSectionComments && this.lines.length > 0) {
        this.lines.push('');
      }

      // Type header
      if (type.namespace) {
        this.lines.push(`{@&${type.namespace}.${typeName}}`);
      } else {
        this.lines.push(`{@${typeName}}`);
      }

      // Check for type composition
      const compositionField = type.fields.get('_composition');
      if (compositionField && compositionField.type.kind === 'typeRef') {
        const typeRefs = compositionField.type.name.split('&');
        this.lines.push(`= ${typeRefs.map((t) => `@${t}`).join(' & ')}`);
      }

      // Type fields
      for (const [fieldName, field] of type.fields) {
        if (fieldName === '_composition') continue;
        this.lines.push(this.serializeField(fieldName, field));
      }
    }
  }

  /**
   * Serialize field definitions.
   */
  private serializeFields(
    fields: ReadonlyMap<string, SchemaField>,
    constraints: ReadonlyMap<string, SchemaObjectConstraint[]>
  ): void {
    // Group fields by their object path prefix
    const fieldsByPath = new Map<string, SchemaField[]>();

    for (const [path, field] of fields) {
      const dotIndex = path.lastIndexOf('.');
      const prefix = dotIndex > 0 ? path.substring(0, dotIndex) : '';
      const existing = fieldsByPath.get(prefix) ?? [];
      existing.push(field);
      fieldsByPath.set(prefix, existing);
    }

    // Sort paths for consistent output
    const paths = [...fieldsByPath.keys()].sort();

    for (const path of paths) {
      const pathFields = fieldsByPath.get(path);
      if (!pathFields) continue;

      // Object header
      if (path) {
        this.lines.push('');
        this.lines.push(`{${path}}`);

        // Object-level constraints
        const pathConstraints = constraints.get(path);
        if (pathConstraints) {
          for (const constraint of pathConstraints) {
            this.lines.push(this.serializeObjectConstraint(constraint));
          }
        }
      }

      // Fields
      for (const field of pathFields) {
        const fieldName = path ? field.path.substring(path.length + 1) : field.path;
        this.lines.push(this.serializeField(fieldName, field));
      }
    }
  }

  /**
   * Serialize array definitions.
   */
  private serializeArrays(arrays: ReadonlyMap<string, SchemaArray>): void {
    const arrayPaths = [...arrays.keys()].sort();

    for (const path of arrayPaths) {
      const array = arrays.get(path);
      if (!array) continue;

      this.lines.push('');

      // Array header with optional columns
      let header = `{${path}[]`;
      if (array.columns && array.columns.length > 0) {
        header += ` : ${array.columns.join(', ')}`;
      }
      header += '}';
      this.lines.push(header);

      // Array constraints
      const arrayConstraints: string[] = [];
      if (array.minItems !== undefined || array.maxItems !== undefined) {
        const min = array.minItems ?? '';
        const max = array.maxItems ?? '';
        arrayConstraints.push(`(${min}..${max})`);
      }
      if (array.unique) {
        arrayConstraints.push('unique');
      }
      if (arrayConstraints.length > 0) {
        this.lines.push(`:${arrayConstraints.join(':')}`);
      }

      // Check for type composition (array inherits from type)
      const compositionField = array.itemFields.get('_composition');
      if (compositionField) {
        // Output as: = @typename
        this.lines.push(this.serializeField('', compositionField));
      }

      // Item fields (skip _composition as it's handled above)
      for (const [fieldName, field] of array.itemFields) {
        if (fieldName !== '_composition') {
          this.lines.push(this.serializeField(fieldName, field));
        }
      }
    }
  }

  /**
   * Serialize a single field definition.
   */
  private serializeField(name: string, field: SchemaField): string {
    const parts: string[] = [];

    // Field name
    parts.push(`${name} = `);

    // Modifiers
    if (field.required) parts.push('!');
    if (field.nullable) parts.push('~');
    if (field.redacted) parts.push('*');
    if (field.deprecated) parts.push('-');

    // Type - for strings with constraints, the constraint includes the colon
    const hasStringConstraints = field.type.kind === 'string' && field.constraints.length > 0;
    if (!hasStringConstraints) {
      parts.push(this.serializeFieldType(field.type));
    }

    // Constraints
    for (const constraint of field.constraints) {
      parts.push(this.serializeConstraint(constraint));
    }

    // Conditionals
    for (const conditional of field.conditionals) {
      parts.push(this.serializeConditional(conditional));
    }

    // Default value
    if (field.defaultValue !== undefined) {
      parts.push(` ${this.serializeDefaultValue(field.defaultValue)}`);
    }

    return parts.join('');
  }

  /**
   * Serialize a field type.
   */
  private serializeFieldType(type: SchemaFieldType): string {
    switch (type.kind) {
      case 'string':
        return ':';
      case 'boolean':
        return '?';
      case 'number':
        return '#';
      case 'integer':
        return '##';
      case 'decimal':
        return `#.${type.places}`;
      case 'currency':
        return `#$`;
      case 'percent':
        return `#%`;
      case 'date':
        return 'date';
      case 'timestamp':
        return 'timestamp';
      case 'time':
        return 'time';
      case 'duration':
        return 'duration';
      case 'reference':
        return type.targetPath ? `@${type.targetPath}` : '@';
      case 'binary':
        return type.algorithm ? `^${type.algorithm}` : '^';
      case 'null':
        return '~';
      case 'enum':
        return `(${type.values.join(', ')})`;
      case 'union':
        return type.types.map((t) => this.serializeFieldType(t)).join('|');
      case 'typeRef':
        return `@${type.name}`;
      default:
        return ':';
    }
  }

  /**
   * Serialize a field constraint.
   */
  private serializeConstraint(constraint: SchemaConstraint): string {
    switch (constraint.kind) {
      case 'bounds': {
        const min = constraint.min ?? '';
        const max = constraint.max ?? '';
        if (min === max && min !== '') {
          return `:(${min})`;
        }
        return `:(${min}..${max})`;
      }
      case 'pattern':
        return `:/${constraint.pattern}/`;
      case 'enum':
        return `:(${constraint.values.join(', ')})`;
      case 'unique':
        return ':unique';
      case 'size': {
        const min = constraint.min ?? '';
        const max = constraint.max ?? '';
        return `:(${min}..${max})`;
      }
      default:
        return '';
    }
  }

  /**
   * Serialize a conditional.
   */
  private serializeConditional(conditional: SchemaConditional): string {
    const value =
      typeof conditional.value === 'string'
        ? conditional.value
        : typeof conditional.value === 'boolean'
          ? conditional.value
            ? 'true'
            : 'false'
          : String(conditional.value);
    return `:if ${conditional.field} = ${value}`;
  }

  /**
   * Serialize an object-level constraint.
   */
  private serializeObjectConstraint(constraint: SchemaObjectConstraint): string {
    if (constraint.kind === 'invariant') {
      return `:invariant ${constraint.expression}`;
    }

    // Cardinality constraint
    const cardinality = constraint as SchemaCardinality;
    const fields = cardinality.fields.join(', ');

    switch (cardinality.type) {
      case 'of': {
        const min = cardinality.min ?? '';
        const max = cardinality.max ?? '';
        return `:of (${min}..${max}) ${fields}`;
      }
      case 'one_of':
        return `:one_of ${fields}`;
      case 'exactly_one':
        return `:exactly_one ${fields}`;
      case 'at_most_one':
        return `:at_most_one ${fields}`;
      default:
        return '';
    }
  }

  /**
   * Serialize a default value.
   */
  private serializeDefaultValue(value: unknown): string {
    if (value === null || value === undefined) return '';

    // Check if it's an OdinValue object
    if (typeof value === 'object' && 'type' in value && 'value' in value) {
      const odinValue = value as { type: string; value: unknown };
      switch (odinValue.type) {
        case 'string':
          return `"${odinValue.value}"`;
        case 'number':
        case 'integer':
          return String(odinValue.value);
        case 'currency':
          return `#$${odinValue.value}`;
        case 'percent':
          return `#%${odinValue.value}`;
        case 'boolean':
          return odinValue.value ? '?true' : '?false';
        default:
          return `"${odinValue.value}"`;
      }
    }

    // Raw value
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? '?true' : '?false';
    return String(value);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize an OdinSchema to ODIN text format.
 *
 * @param schema - The schema to serialize
 * @param options - Serialization options
 * @returns ODIN text representation
 *
 * @example
 * ```typescript
 * import { serializeSchema } from '@odin/sdk/resolver';
 *
 * const odinText = serializeSchema(schema, {
 *   includeImports: false, // For bundled output
 *   headerComment: 'Auto-generated bundled schema',
 * });
 * ```
 */
export function serializeSchema(schema: OdinSchema, options?: SerializerOptions): string {
  const serializer = new SchemaSerializer(options);
  return serializer.serialize(schema);
}

/**
 * Create a schema serializer instance.
 *
 * @param options - Serialization options
 * @returns A new SchemaSerializer instance
 */
export function createSchemaSerializer(options?: SerializerOptions): SchemaSerializer {
  return new SchemaSerializer(options);
}
