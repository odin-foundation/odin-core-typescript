/**
 * Concrete implementation of OdinDocument.
 */

import type {
  OdinDocument,
  OdinDocumentBuilder,
  OdinImport,
  OdinSchema,
  OdinConditional,
  FlattenOptions,
} from './document.js';
import type { OdinValue, OdinModifiers } from './values.js';
import { isOdinReference } from './values.js';
import { parsePathCached } from '../parser/tokens.js';
import { uint8ArrayToBase64 } from '../utils/security-limits.js';

/**
 * Immutable OdinDocument implementation.
 */
export class OdinDocumentImpl implements OdinDocument {
  readonly metadata: ReadonlyMap<string, OdinValue>;
  readonly assignments: ReadonlyMap<string, OdinValue>;
  readonly modifiers: ReadonlyMap<string, OdinModifiers>;
  readonly imports: readonly OdinImport[];
  readonly schemas: readonly OdinSchema[];
  readonly conditionals: readonly OdinConditional[];

  constructor(
    metadata: Map<string, OdinValue>,
    assignments: Map<string, OdinValue>,
    modifiers: Map<string, OdinModifiers>,
    imports: OdinImport[] = [],
    schemas: OdinSchema[] = [],
    conditionals: OdinConditional[] = []
  ) {
    this.metadata = metadata;
    this.assignments = assignments;
    this.modifiers = modifiers;
    this.imports = imports;
    this.schemas = schemas;
    this.conditionals = conditionals;
  }

  get(path: string): OdinValue | undefined {
    // Check metadata first
    if (path.startsWith('$.')) {
      return this.metadata.get(path.slice(2));
    }
    return this.assignments.get(path);
  }

  getString(path: string): string {
    const value = this.get(path);
    if (value === undefined) {
      throw new Error(`Path not found: ${path}`);
    }
    if (value.type !== 'string') {
      throw new Error(`Expected string at ${path}, got ${value.type}`);
    }
    return value.value;
  }

  getNumber(path: string): number {
    const value = this.get(path);
    if (value === undefined) {
      throw new Error(`Path not found: ${path}`);
    }
    if (value.type !== 'number' && value.type !== 'currency') {
      throw new Error(`Expected number at ${path}, got ${value.type}`);
    }
    return value.value;
  }

  getInteger(path: string): number {
    const value = this.get(path);
    if (value === undefined) {
      throw new Error(`Path not found: ${path}`);
    }
    if (value.type !== 'integer') {
      throw new Error(`Expected integer at ${path}`);
    }
    return value.value;
  }

  getBoolean(path: string): boolean {
    const value = this.get(path);
    if (value === undefined) {
      throw new Error(`Path not found: ${path}`);
    }
    if (value.type !== 'boolean') {
      throw new Error(`Expected boolean at ${path}, got ${value.type}`);
    }
    return value.value;
  }

  has(path: string): boolean {
    if (path.startsWith('$.')) {
      return this.metadata.has(path.slice(2));
    }
    return this.assignments.has(path);
  }

  resolve(path: string): OdinValue | undefined {
    const value = this.get(path);
    if (value === undefined) {
      return undefined;
    }

    if (isOdinReference(value)) {
      // Follow reference
      const seen = new Set<string>([path]);
      let current = value;
      let currentPath = value.path;

      while (isOdinReference(current)) {
        if (seen.has(currentPath)) {
          throw new Error(`Circular reference detected: ${path}`);
        }
        seen.add(currentPath);

        const resolved = this.get(currentPath);
        if (resolved === undefined) {
          throw new Error(`Unresolved reference: ${currentPath}`);
        }

        if (isOdinReference(resolved)) {
          current = resolved;
          currentPath = resolved.path;
        } else {
          return resolved;
        }
      }

      return current;
    }

    return value;
  }

  with(path: string, value: OdinValue): OdinDocument {
    const newAssignments = new Map(this.assignments);
    const newMetadata = new Map(this.metadata);

    if (path.startsWith('$.')) {
      newMetadata.set(path.slice(2), value);
    } else {
      newAssignments.set(path, value);
    }

    return new OdinDocumentImpl(
      newMetadata,
      newAssignments,
      new Map(this.modifiers),
      [...this.imports],
      [...this.schemas],
      [...this.conditionals]
    );
  }

  without(path: string): OdinDocument {
    const newAssignments = new Map(this.assignments);
    const newMetadata = new Map(this.metadata);
    const newModifiers = new Map(this.modifiers);

    if (path.startsWith('$.')) {
      newMetadata.delete(path.slice(2));
    } else {
      newAssignments.delete(path);
    }
    newModifiers.delete(path);

    return new OdinDocumentImpl(
      newMetadata,
      newAssignments,
      newModifiers,
      [...this.imports],
      [...this.schemas],
      [...this.conditionals]
    );
  }

  paths(): string[] {
    const result: string[] = [];

    // Metadata paths
    for (const key of this.metadata.keys()) {
      result.push(`$.${key}`);
    }

    // Assignment paths
    for (const key of this.assignments.keys()) {
      result.push(key);
    }

    return result;
  }

  flatten(options?: FlattenOptions): Map<string, string> {
    const result = new Map<string, string>();
    const includeMetadata = options?.includeMetadata ?? false;
    const includeNulls = options?.includeNulls ?? false;
    const shouldSort = options?.sort ?? true;

    // Collect paths
    let paths: string[] = [];

    if (includeMetadata) {
      for (const key of this.metadata.keys()) {
        paths.push(`$.${key}`);
      }
    }

    for (const key of this.assignments.keys()) {
      paths.push(key);
    }

    if (shouldSort) {
      paths = paths.sort();
    }

    // Format each path
    for (const path of paths) {
      const value = this.get(path);
      if (value === undefined) continue;

      if (value.type === 'null') {
        if (includeNulls) {
          result.set(path, 'null');
        }
        continue;
      }

      const formatted = this.formatValueForFlatten(value);
      if (formatted !== null) {
        result.set(path, formatted);
      }
    }

    return result;
  }

  /**
   * Format a value as a string for flatten output.
   * Returns null for complex types that can't be represented.
   */
  private formatValueForFlatten(value: OdinValue): string | null {
    switch (value.type) {
      case 'null':
        return 'null';
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
      case 'binary':
        return value.algorithm
          ? `^${value.algorithm}:${uint8ArrayToBase64(value.data)}`
          : `^${uint8ArrayToBase64(value.data)}`;
      case 'verb':
        return `%${value.verb}`;
      case 'array':
      case 'object':
        // Complex types handled via path enumeration
        return null;
      default:
        return null;
    }
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Convert flat paths to nested object
    const allPaths = [...this.assignments.entries()];

    for (const [path, value] of allPaths) {
      this.setNestedValue(result, path, this.valueToJSON(value));
    }

    // Add metadata
    if (this.metadata.size > 0) {
      const meta: Record<string, unknown> = {};
      for (const [key, value] of this.metadata.entries()) {
        meta[key] = this.valueToJSON(value);
      }
      result['$'] = meta;
    }

    return result;
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = this.parsePath(path);
    // Use 'unknown' and cast as needed to avoid strict index errors
    let current: unknown = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;

      if (part.type === 'field') {
        const rec = current as Record<string, unknown>;
        if (!(part.name in rec)) {
          // Look ahead to see if next is array
          const next = parts[i + 1];
          if (next && next.type === 'index') {
            rec[part.name] = [];
          } else {
            rec[part.name] = {};
          }
        }
        current = rec[part.name];
      } else if (part.type === 'index') {
        if (!Array.isArray(current)) {
          throw new Error(`Expected array at path`);
        }
        const arr = current as unknown[];
        if (arr[part.index] === undefined) {
          // Look ahead
          const next = parts[i + 1];
          if (next && next.type === 'index') {
            arr[part.index] = [];
          } else {
            arr[part.index] = {};
          }
        }
        current = arr[part.index];
      }
    }

    const lastPart = parts[parts.length - 1]!;
    if (lastPart.type === 'field') {
      (current as Record<string, unknown>)[lastPart.name] = value;
    } else {
      (current as unknown[])[lastPart.index] = value;
    }
  }

  private parsePath(
    path: string
  ): Array<{ type: 'field'; name: string } | { type: 'index'; index: number }> {
    // Use cached path parsing for efficiency
    const segments = parsePathCached(path);
    const result: Array<{ type: 'field'; name: string } | { type: 'index'; index: number }> = [];

    for (const seg of segments) {
      if (seg.charCodeAt(0) === 91) {
        // '[' - array index segment like [0], [12], or [] for iteration
        const inner = seg.slice(1, -1);

        // Allow empty brackets [] for array iteration in transforms
        if (inner.length === 0) {
          continue;
        }

        // Validate all characters are digits
        let idx = 0;
        for (let j = 0; j < inner.length; j++) {
          const code = inner.charCodeAt(j);
          if (code < 48 || code > 57) {
            // Not a digit (0-9)
            throw new Error(`Invalid path: non-numeric array index "${inner}" in "${path}"`);
          }
          idx = idx * 10 + (code - 48);
        }

        // Check for integer overflow and reasonable bounds
        // Max index of 1 million prevents DoS via sparse array creation
        const MAX_ARRAY_INDEX = 1_000_000;
        if (!Number.isSafeInteger(idx) || idx < 0 || idx > MAX_ARRAY_INDEX) {
          throw new Error(
            `Invalid path: array index ${idx} out of range (max ${MAX_ARRAY_INDEX}) in "${path}"`
          );
        }

        result.push({ type: 'index', index: idx });
      } else {
        result.push({ type: 'field', name: seg });
      }
    }

    return result;
  }

  private valueToJSON(value: OdinValue): unknown {
    switch (value.type) {
      case 'null':
        return null;
      case 'boolean':
        return value.value;
      case 'string':
        return value.value;
      case 'number':
        return value.value;
      case 'reference':
        return `@${value.path}`;
      case 'binary':
        return value.algorithm
          ? `^${value.algorithm}:${uint8ArrayToBase64(value.data)}`
          : `^${uint8ArrayToBase64(value.data)}`;
      case 'integer':
      case 'currency':
      case 'percent':
        return value.value;
      case 'date':
      case 'timestamp':
        return value.raw;
      case 'time':
      case 'duration':
        return value.value;
      case 'object':
        return value.value;
      case 'array':
        // Handle both flat arrays (OdinTypedValue[]) and object arrays (Map[])
        return value.items.map((item) => {
          // Check if item is a Map (object array from ODIN syntax)
          if (item instanceof Map) {
            const obj: Record<string, unknown> = {};
            for (const [key, val] of item.entries()) {
              obj[key] = this.valueToJSON(val);
            }
            return obj;
          }
          // Flat array: item is an OdinTypedValue directly
          return this.valueToJSON(item as OdinValue);
        });
      default:
        return null;
    }
  }
}

/**
 * Builder for constructing OdinDocument instances.
 */
export class OdinDocumentBuilderImpl implements OdinDocumentBuilder {
  private _metadata: Map<string, OdinValue> = new Map();
  private _assignments: Map<string, OdinValue> = new Map();
  private _modifiers: Map<string, OdinModifiers> = new Map();

  metadata(key: string, value: OdinValue | string | number | boolean): this {
    this._metadata.set(key, this.normalizeValue(value));
    return this;
  }

  set(path: string, value: OdinValue | string | number | boolean | null): this {
    if (value === null) {
      this._assignments.set(path, { type: 'null' });
    } else {
      this._assignments.set(path, this.normalizeValue(value));
    }
    return this;
  }

  setWithModifiers(
    path: string,
    value: OdinValue | string | number | boolean | null,
    modifiers: Partial<OdinModifiers>
  ): this {
    this.set(path, value);
    this._modifiers.set(path, {
      required: modifiers.required ?? false,
      confidential: modifiers.confidential ?? false,
      deprecated: modifiers.deprecated ?? false,
    });
    return this;
  }

  build(): OdinDocument {
    // Validate array contiguity
    this.validateArrays();

    return new OdinDocumentImpl(
      new Map(this._metadata),
      new Map(this._assignments),
      new Map(this._modifiers)
    );
  }

  private normalizeValue(value: OdinValue | string | number | boolean): OdinValue {
    if (typeof value === 'string') {
      return { type: 'string', value };
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { type: 'integer', value };
      }
      return { type: 'number', value };
    }
    if (typeof value === 'boolean') {
      return { type: 'boolean', value };
    }
    return value as OdinValue;
  }

  private validateArrays(): void {
    const arrayIndices = new Map<string, number[]>();

    for (const path of this._assignments.keys()) {
      const match = path.match(/^(.+)\[(\d+)\]/);
      if (match) {
        const arrayPath = match[1]!;
        const index = parseInt(match[2]!, 10);

        if (!arrayIndices.has(arrayPath)) {
          arrayIndices.set(arrayPath, []);
        }
        const indices = arrayIndices.get(arrayPath)!;
        if (!indices.includes(index)) {
          indices.push(index);
        }
      }
    }

    for (const [arrayPath, indices] of arrayIndices) {
      indices.sort((a, b) => a - b);

      if (indices[0] !== 0) {
        throw new Error(`Array ${arrayPath} must start at index 0`);
      }

      for (let i = 1; i < indices.length; i++) {
        if (indices[i] !== indices[i - 1]! + 1) {
          throw new Error(`Non-contiguous array indices in ${arrayPath}`);
        }
      }
    }
  }
}

/**
 * Create a new document builder.
 */
export function createDocumentBuilder(): OdinDocumentBuilder {
  return new OdinDocumentBuilderImpl();
}

/**
 * Create an empty document.
 */
export function createEmptyDocument(): OdinDocument {
  return new OdinDocumentImpl(new Map(), new Map(), new Map(), [], [], []);
}
