/**
 * Namespaced type registry for import resolution.
 */

import type { SchemaType, SchemaField } from '../types/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A registered type with its source information.
 */
export interface RegisteredType {
  /** The type definition */
  type: SchemaType;
  /** The namespace/alias this type belongs to (undefined for local types) */
  namespace?: string;
  /** The source file path where this type was defined */
  sourcePath?: string;
}

/**
 * Options for type lookup.
 */
export interface LookupOptions {
  /**
   * Default namespace to use for unqualified type references.
   * If set, @typeName will first look in this namespace.
   */
  defaultNamespace?: string;

  /**
   * Whether to search all namespaces for unqualified references.
   *
   * When true and multiple namespaces contain a type with the same name,
   * the first match wins (based on namespace registration order). To ensure
   * deterministic resolution, use qualified references (e.g., `types.address`)
   * or set `defaultNamespace` explicitly.
   *
   * @default false
   */
  searchAllNamespaces?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeRegistry Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry for type definitions from schemas and imports.
 * Supports local types, namespaced types, and composite type references.
 */
export class TypeRegistry {
  /** Types indexed by namespace -> name -> type */
  private namespaces: Map<string, Map<string, RegisteredType>> = new Map();

  /** Local types (no namespace) */
  private localTypes: Map<string, RegisteredType> = new Map();

  /** All registered source paths */
  private sourcePaths: Set<string> = new Set();

  /**
   * Register a type in the registry.
   *
   * @param name - Type name (e.g., "address")
   * @param type - The type definition
   * @param namespace - Optional namespace/alias (e.g., "types")
   * @param sourcePath - Optional source file path
   */
  register(name: string, type: SchemaType, namespace?: string, sourcePath?: string): void {
    const registered: RegisteredType = { type };
    if (namespace !== undefined) {
      registered.namespace = namespace;
    }
    if (sourcePath !== undefined) {
      registered.sourcePath = sourcePath;
      this.sourcePaths.add(sourcePath);
    }

    if (namespace) {
      let nsMap = this.namespaces.get(namespace);
      if (!nsMap) {
        nsMap = new Map();
        this.namespaces.set(namespace, nsMap);
      }
      nsMap.set(name, registered);
    } else {
      this.localTypes.set(name, registered);
    }
  }

  /**
   * Register all types from a schema with a namespace.
   *
   * @param types - Map of type definitions from schema
   * @param namespace - Namespace to register under
   * @param sourcePath - Source file path
   */
  registerAll(
    types: ReadonlyMap<string, SchemaType>,
    namespace?: string,
    sourcePath?: string
  ): void {
    for (const [name, type] of types) {
      this.register(name, type, namespace, sourcePath);
    }
  }

  /**
   * Look up a type by reference.
   *
   * Supports multiple formats:
   * - "address" - Local type
   * - "types.address" - Namespaced type (alias.name)
   * - "address&contact" - Composite type (intersection)
   *
   * @param reference - Type reference string
   * @param options - Lookup options
   * @returns The type definition, or undefined if not found
   */
  lookup(reference: string, options?: LookupOptions): SchemaType | undefined {
    // Handle composite types (intersection): @type1&type2
    if (reference.includes('&')) {
      return this.lookupComposite(reference, options);
    }

    // Handle namespaced reference: @namespace.typeName
    if (reference.includes('.')) {
      const dotIndex = reference.indexOf('.');
      const namespace = reference.substring(0, dotIndex);
      const typeName = reference.substring(dotIndex + 1);

      const nsMap = this.namespaces.get(namespace);
      if (nsMap) {
        const registered = nsMap.get(typeName);
        if (registered) {
          return registered.type;
        }
      }
      return undefined;
    }

    // Look up unqualified type name

    // First try default namespace if specified
    if (options?.defaultNamespace) {
      const nsMap = this.namespaces.get(options.defaultNamespace);
      if (nsMap) {
        const registered = nsMap.get(reference);
        if (registered) {
          return registered.type;
        }
      }
    }

    // Try local types
    const localType = this.localTypes.get(reference);
    if (localType) {
      return localType.type;
    }

    // Optionally search all namespaces
    if (options?.searchAllNamespaces) {
      for (const nsMap of this.namespaces.values()) {
        const registered = nsMap.get(reference);
        if (registered) {
          return registered.type;
        }
      }
    }

    return undefined;
  }

  /**
   * Look up a composite type by intersecting multiple types.
   */
  private lookupComposite(reference: string, options?: LookupOptions): SchemaType | undefined {
    const typeNames = reference.split('&').map((t) => t.trim());
    const types: SchemaType[] = [];

    for (const typeName of typeNames) {
      const type = this.lookup(typeName, options);
      if (!type) {
        return undefined; // All types must exist for composite
      }
      types.push(type);
    }

    // Merge all types into a composite
    return this.mergeTypes(types, reference);
  }

  /**
   * Merge multiple types into a composite type.
   */
  private mergeTypes(types: SchemaType[], name: string): SchemaType {
    const mergedFields = new Map<string, SchemaField>();

    for (const type of types) {
      for (const [fieldName, field] of type.fields) {
        // Later types override earlier ones (last wins)
        mergedFields.set(fieldName, field);
      }
    }

    return {
      name,
      fields: mergedFields,
    };
  }

  /**
   * Get all types from a specific namespace.
   *
   * @param namespace - The namespace to get types from
   * @returns Map of type names to types, or empty map if namespace doesn't exist
   */
  getNamespace(namespace: string): ReadonlyMap<string, SchemaType> {
    const nsMap = this.namespaces.get(namespace);
    if (!nsMap) {
      return new Map();
    }

    const result = new Map<string, SchemaType>();
    for (const [name, registered] of nsMap) {
      result.set(name, registered.type);
    }
    return result;
  }

  /**
   * Get all local types (not in any namespace).
   */
  getLocalTypes(): ReadonlyMap<string, SchemaType> {
    const result = new Map<string, SchemaType>();
    for (const [name, registered] of this.localTypes) {
      result.set(name, registered.type);
    }
    return result;
  }

  /**
   * Get all registered namespaces.
   */
  getNamespaces(): readonly string[] {
    return [...this.namespaces.keys()];
  }

  /**
   * Check if a namespace exists.
   */
  hasNamespace(namespace: string): boolean {
    return this.namespaces.has(namespace);
  }

  /**
   * Check if a type exists.
   */
  has(reference: string): boolean {
    return this.lookup(reference) !== undefined;
  }

  /**
   * Get all source paths that contributed types.
   */
  getSourcePaths(): readonly string[] {
    return [...this.sourcePaths];
  }

  /**
   * Get the total number of registered types.
   */
  get size(): number {
    let count = this.localTypes.size;
    for (const nsMap of this.namespaces.values()) {
      count += nsMap.size;
    }
    return count;
  }

  /**
   * Create a copy of this registry.
   */
  clone(): TypeRegistry {
    const copy = new TypeRegistry();

    // Copy local types
    for (const [name, registered] of this.localTypes) {
      copy.localTypes.set(name, { ...registered });
    }

    // Copy namespaced types
    for (const [ns, nsMap] of this.namespaces) {
      const newNsMap = new Map<string, RegisteredType>();
      for (const [name, registered] of nsMap) {
        newNsMap.set(name, { ...registered });
      }
      copy.namespaces.set(ns, newNsMap);
    }

    // Copy source paths
    for (const path of this.sourcePaths) {
      copy.sourcePaths.add(path);
    }

    return copy;
  }

  /**
   * Merge another registry into this one.
   * Types from the other registry override existing types with the same name.
   */
  merge(other: TypeRegistry): void {
    // Merge local types
    for (const [name, registered] of other.localTypes) {
      this.localTypes.set(name, { ...registered });
    }

    // Merge namespaced types
    for (const [ns, nsMap] of other.namespaces) {
      let targetNsMap = this.namespaces.get(ns);
      if (!targetNsMap) {
        targetNsMap = new Map();
        this.namespaces.set(ns, targetNsMap);
      }
      for (const [name, registered] of nsMap) {
        targetNsMap.set(name, { ...registered });
      }
    }

    // Merge source paths
    for (const path of other.sourcePaths) {
      this.sourcePaths.add(path);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new type registry.
 */
export function createTypeRegistry(): TypeRegistry {
  return new TypeRegistry();
}
