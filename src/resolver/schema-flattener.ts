/**
 * Merge all imports into a single schema with no dependencies.
 */

import type {
  OdinSchema,
  SchemaMetadata,
  SchemaType,
  SchemaField,
  SchemaArray,
  SchemaObjectConstraint,
} from '../types/schema.js';
import path from 'path';
import { ImportResolver, type ResolverOptions, type ResolvedSchema } from './import-resolver.js';
import { serializeSchema, type SerializerOptions } from './schema-serializer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for flattening a schema.
 */
export interface FlattenerOptions extends ResolverOptions {
  /**
   * How to handle type name conflicts.
   * - 'namespace': Prefix imported types with their namespace (e.g., types_address)
   * - 'overwrite': Later types overwrite earlier ones
   * - 'error': Throw an error on conflict
   * @default 'namespace'
   */
  conflictResolution?: 'namespace' | 'overwrite' | 'error';

  /**
   * Whether to inline type references.
   * If true, @typename references are replaced with the type's fields.
   * @default false
   */
  inlineTypeReferences?: boolean;

  /**
   * Whether to tree-shake unused types from the output.
   * If true, only types that are actually referenced (directly or transitively)
   * will be included in the flattened schema.
   * @default true
   */
  treeShake?: boolean;

  /**
   * Custom metadata for the flattened schema.
   * If not provided, uses the primary schema's metadata.
   */
  metadata?: Partial<SchemaMetadata>;
}

/**
 * Result of flattening a schema.
 */
export interface FlattenedResult {
  /** The flattened schema with all imports merged */
  schema: OdinSchema;
  /** List of all source files that were merged */
  sourceFiles: string[];
  /** Any warnings generated during flattening */
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SchemaFlattener Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flattens ODIN schemas by resolving and merging all imports.
 */
export class SchemaFlattener {
  private readonly options: FlattenerOptions;
  private resolver: ImportResolver;
  private warnings: string[] = [];
  /** Maps type names to their source namespace (for reference rewriting) */
  private typeSourceMap: Map<string, string | undefined> = new Map();
  /** Set of referenced type names (qualified names) for tree shaking */
  private referencedTypes: Set<string> = new Set();

  /**
   * Build a qualified name for a type, avoiding duplication when namespace overlaps type name.
   *
   * @example
   * buildQualifiedName("agency", "agency") // "agency"
   * buildQualifiedName("carrier_program", "carrier") // "carrier_program"
   * buildQualifiedName("producer", "agency") // "agency_producer"
   * buildQualifiedName("address", "types") // "types_address"
   * buildQualifiedName("coverage") // "coverage"
   */
  private buildQualifiedName(typeName: string, namespace?: string): string {
    if (!namespace) {
      return typeName;
    }
    // Avoid duplication: if namespace equals type name, just use the name
    // e.g., namespace="claim", typeName="claim" -> "claim" (not "claim_claim")
    if (namespace === typeName) {
      return typeName;
    }
    // Avoid duplication: if type name starts with namespace. (dot), strip the prefix
    // e.g., namespace="policy", typeName="policy.named_insured" -> "policy.named_insured" (not "policy_policy.named_insured")
    if (typeName.startsWith(`${namespace}.`)) {
      return typeName;
    }
    // Avoid duplication: if type name already starts with namespace_, just use the type name
    // This handles cases like carrier.carrier_program -> carrier_program (not carrier_carrier_program)
    if (typeName.startsWith(`${namespace}_`)) {
      return typeName;
    }
    return `${namespace}_${typeName}`;
  }

  constructor(options: FlattenerOptions = {}) {
    this.options = {
      conflictResolution: options.conflictResolution ?? 'namespace',
      inlineTypeReferences: options.inlineTypeReferences ?? false,
      treeShake: options.treeShake ?? true,
      ...options,
    };
    this.resolver = new ImportResolver(options);
  }

  /**
   * Flatten a schema file by resolving all imports.
   *
   * @param filePath - Path to the schema file
   * @returns Flattened schema with all imports merged
   */
  async flattenFile(filePath: string): Promise<FlattenedResult> {
    this.warnings = [];

    // Resolve the schema with all imports
    const resolved = (await this.resolver.resolveFile(filePath)) as ResolvedSchema;

    return this.flattenResolved(resolved);
  }

  /**
   * Flatten an already-resolved schema.
   *
   * @param resolved - Resolved schema with imports
   * @returns Flattened schema
   */
  flattenResolved(resolved: ResolvedSchema): FlattenedResult {
    this.warnings = [];
    this.typeSourceMap.clear();
    this.referencedTypes.clear();

    // Build type source map first (maps type names to their source namespace)
    this.buildTypeSourceMap(resolved);

    // Merge all types from imports
    let mergedTypes = this.mergeTypes(resolved);

    // Expand type compositions (types with _composition fields that inherit from base types)
    mergedTypes = this.expandTypeInheritance(mergedTypes);

    // Merge all fields from imports
    let mergedFields = this.mergeFields(resolved);

    // Merge all arrays from imports
    let mergedArrays = this.mergeArrays(resolved);

    // Merge all constraints from imports
    let mergedConstraints = this.mergeConstraints(resolved);

    // Tree shake if enabled
    if (this.options.treeShake) {
      // Collect all referenced types starting from primary schema
      // Pass merged fields/arrays to follow inherited field sections
      this.collectReferencedTypes(resolved, mergedTypes, mergedFields, mergedArrays);

      // Filter to only include referenced types
      const originalTypeCount = mergedTypes.size;
      mergedTypes = this.filterReferencedTypes(mergedTypes);
      const removedCount = originalTypeCount - mergedTypes.size;
      if (removedCount > 0) {
        this.warnings.push(`Tree shaking removed ${removedCount} unused types`);
      }

      // Filter fields, arrays, and constraints to only those belonging to referenced types
      mergedFields = this.filterReferencedFields(mergedFields);
      mergedArrays = this.filterReferencedArrays(mergedArrays);
      mergedConstraints = this.filterReferencedConstraints(mergedConstraints);
    }

    // Build the flattened schema
    const flattenedSchema: OdinSchema = {
      metadata: this.buildMetadata(resolved.schema.metadata),
      imports: [], // No imports in flattened schema
      types: mergedTypes,
      fields: mergedFields,
      arrays: mergedArrays,
      constraints: mergedConstraints,
    };

    return {
      schema: flattenedSchema,
      sourceFiles: resolved.resolution.resolvedPaths,
      warnings: this.warnings,
    };
  }

  /**
   * Build a map of type names to their source namespace.
   * This is used to correctly rewrite type references.
   */
  private buildTypeSourceMap(resolved: ResolvedSchema): void {
    // Add types from imports with their namespace (Map keyed by path, alias in value)
    for (const [_path, imp] of resolved.resolution.imports) {
      if (imp.schema) {
        for (const [typeName] of imp.schema.types) {
          // Store both the simple name and any dotted variations
          this.typeSourceMap.set(typeName, imp.alias);
        }
      }
    }

    // Add types from primary schema (no namespace)
    for (const [typeName] of resolved.schema.types) {
      this.typeSourceMap.set(typeName, undefined);
    }
  }

  /**
   * Merge types from all imports.
   */
  private mergeTypes(resolved: ResolvedSchema): Map<string, SchemaType> {
    const mergedTypes = new Map<string, SchemaType>();

    // First, add all types from imports (in order)
    for (const [_path, imp] of resolved.resolution.imports) {
      if (imp.schema) {
        for (const [typeName, type] of imp.schema.types) {
          this.addType(mergedTypes, typeName, type, imp.alias);
        }
      }
    }

    // Then add types from the primary schema (may override imports)
    for (const [typeName, type] of resolved.schema.types) {
      this.addType(mergedTypes, typeName, type, undefined);
    }

    return mergedTypes;
  }

  /**
   * Add a type to the merged types map with conflict handling.
   */
  private addType(
    mergedTypes: Map<string, SchemaType>,
    typeName: string,
    type: SchemaType,
    namespace?: string
  ): void {
    const qualifiedName = this.buildQualifiedName(typeName, namespace);

    // Check for conflicts
    if (mergedTypes.has(qualifiedName)) {
      switch (this.options.conflictResolution) {
        case 'error':
          throw new Error(`Type name conflict: ${qualifiedName}`);
        case 'overwrite':
          // Allow overwrite, will be handled below
          this.warnings.push(`Type '${qualifiedName}' overwritten`);
          break;
        case 'namespace':
        default:
          // Already using qualified name, check if still conflicts
          if (namespace && mergedTypes.has(qualifiedName)) {
            this.warnings.push(
              `Type '${qualifiedName}' from namespace '${namespace}' conflicts with existing type`
            );
          }
          break;
      }
    }

    // Rewrite type references in fields if namespacing
    const updatedFields = new Map<string, SchemaField>();
    for (const [fieldName, field] of type.fields) {
      const updatedField = this.updateFieldReferences(field, namespace);
      updatedFields.set(fieldName, updatedField);
    }

    const finalName = this.options.conflictResolution === 'namespace' ? qualifiedName : typeName;
    const mergedType: SchemaType = {
      name: finalName,
      fields: updatedFields,
    };
    // Don't set namespace - omit it in flattened output
    mergedTypes.set(finalName, mergedType);
  }

  /**
   * Expand type inheritance for types with _composition fields.
   * Merges fields from base type with child type's local fields.
   *
   * @param types - Map of all merged types
   * @returns Updated map with expanded type fields
   */
  private expandTypeInheritance(types: Map<string, SchemaType>): Map<string, SchemaType> {
    const expanded = new Map<string, SchemaType>();
    const visited = new Set<string>(); // Prevent infinite recursion

    const expandType = (typeName: string, type: SchemaType): SchemaType => {
      // Check for _composition field
      const compositionField = type.fields.get('_composition');
      if (!compositionField || compositionField.type.kind !== 'typeRef') {
        // No composition, return type as-is
        return type;
      }

      // Prevent infinite recursion
      if (visited.has(typeName)) {
        this.warnings.push(`Circular type inheritance detected for '${typeName}'`);
        return type;
      }
      visited.add(typeName);

      const baseTypeNames = compositionField.type.name.split('&').map((n) => n.trim());
      const allowOverride = compositionField.type.override === true;

      // Collect fields from all base types
      const mergedFields = new Map<string, SchemaField>();

      for (const baseTypeName of baseTypeNames) {
        // Look up the base type (may be namespaced)
        const qualifiedBaseName = this.resolveTypeName(baseTypeName);
        const baseType = types.get(qualifiedBaseName);
        if (baseType) {
          // Recursively expand the base type
          const expandedBase = expandType(qualifiedBaseName, baseType);
          // Add all fields from base type
          for (const [fieldName, field] of expandedBase.fields) {
            if (fieldName !== '_composition') {
              mergedFields.set(fieldName, field);
            }
          }
        }
      }

      // Add/override with local fields from this type
      for (const [fieldName, field] of type.fields) {
        if (fieldName === '_composition') {
          // Preserve _composition for tree shaking to follow inheritance chain
          mergedFields.set(fieldName, field);
          continue;
        }

        const existingField = mergedFields.get(fieldName);
        if (existingField && !allowOverride) {
          this.warnings.push(
            `Field '${fieldName}' in type '${typeName}' overrides base type field without :override modifier`
          );
        }
        // Set the field (override if exists)
        mergedFields.set(fieldName, field);
      }

      visited.delete(typeName);

      // Return a new type with merged fields
      return {
        name: type.name,
        fields: mergedFields,
      };
    };

    // Expand all types
    for (const [typeName, type] of types) {
      expanded.set(typeName, expandType(typeName, type));
    }

    return expanded;
  }

  /**
   * Resolve a type name to its qualified name using the type source map.
   */
  private resolveTypeName(typeName: string): string {
    if (typeName.includes('.')) {
      // Already namespaced - convert dots to underscores for flattened format
      const parts = typeName.split('.');
      const namespace = parts.slice(0, -1).join('_');
      const name = parts[parts.length - 1]!;
      return this.buildQualifiedName(name, namespace);
    }
    // Simple name - look up in type source map
    const namespace = this.typeSourceMap.get(typeName);
    return this.buildQualifiedName(typeName, namespace);
  }

  /**
   * Update type references in a field to use flattened names.
   * Uses the type source map to find where the referenced type is actually defined.
   */
  private updateFieldReferences(field: SchemaField, _sourceNamespace?: string): SchemaField {
    // Clone the field
    const updated: SchemaField = { ...field };

    // Update type reference if present
    if (field.type.kind === 'reference' && field.type.targetPath) {
      const targetPath = field.type.targetPath;

      if (targetPath.includes('.')) {
        // Namespaced reference like types.address or agency.agency
        // Split into namespace and type name parts
        const parts = targetPath.split('.');
        const namespace = parts.slice(0, -1).join('_');
        const typeName = parts[parts.length - 1]!;
        const newPath = this.buildQualifiedName(typeName, namespace);
        updated.type = {
          kind: 'reference',
          targetPath: newPath,
        };
      } else if (this.options.conflictResolution === 'namespace') {
        // Simple reference - look up where the type is actually defined
        const typeNamespace = this.typeSourceMap.get(targetPath);
        if (typeNamespace) {
          updated.type = {
            kind: 'reference',
            targetPath: this.buildQualifiedName(targetPath, typeNamespace),
          };
        }
        // If not found in map, leave as-is (might be a local type)
      }
    }

    // Update typeRef if present
    if (field.type.kind === 'typeRef') {
      const typeName = field.type.name;

      if (typeName.includes('.')) {
        // Namespaced reference like types.address or agency.agency
        const parts = typeName.split('.');
        const namespace = parts.slice(0, -1).join('_');
        const typeNamePart = parts[parts.length - 1]!;
        updated.type = {
          kind: 'typeRef',
          name: this.buildQualifiedName(typeNamePart, namespace),
        };
      } else if (this.options.conflictResolution === 'namespace') {
        // Simple reference - look up where the type is actually defined
        const typeNamespace = this.typeSourceMap.get(typeName);
        if (typeNamespace) {
          updated.type = {
            kind: 'typeRef',
            name: this.buildQualifiedName(typeName, typeNamespace),
          };
        }
        // If not found in map, leave as-is (might be a local type)
      }
    }

    return updated;
  }

  /**
   * Merge fields from all imports.
   */
  private mergeFields(resolved: ResolvedSchema): Map<string, SchemaField> {
    const mergedFields = new Map<string, SchemaField>();

    // Add fields from imports (Map keyed by path, alias in value)
    for (const [_filePath, imp] of resolved.resolution.imports) {
      if (imp.schema) {
        for (const [path, field] of imp.schema.fields) {
          const qualifiedPath =
            this.options.conflictResolution === 'namespace' ? `${imp.alias}_${path}` : path;

          const updatedField = this.updateFieldReferences(field, imp.alias);
          mergedFields.set(qualifiedPath, { ...updatedField, path: qualifiedPath });
        }
      }
    }

    // Add fields from primary schema (also update references)
    for (const [path, field] of resolved.schema.fields) {
      const updatedField = this.updateFieldReferences(field, undefined);
      mergedFields.set(path, updatedField);
    }

    return mergedFields;
  }

  /**
   * Merge arrays from all imports.
   */
  private mergeArrays(resolved: ResolvedSchema): Map<string, SchemaArray> {
    const mergedArrays = new Map<string, SchemaArray>();

    // Add arrays from imports (Map keyed by path, alias in value)
    for (const [_filePath, imp] of resolved.resolution.imports) {
      if (imp.schema) {
        for (const [path, array] of imp.schema.arrays) {
          const qualifiedPath =
            this.options.conflictResolution === 'namespace' ? `${imp.alias}_${path}` : path;

          // Update field references in item fields
          const updatedItemFields = new Map<string, SchemaField>();
          for (const [fieldName, field] of array.itemFields) {
            const updatedField = this.updateFieldReferences(field, imp.alias);
            updatedItemFields.set(fieldName, updatedField);
          }

          mergedArrays.set(qualifiedPath, {
            ...array,
            path: qualifiedPath,
            itemFields: updatedItemFields,
          });
        }
      }
    }

    // Add arrays from primary schema (also update references)
    for (const [path, array] of resolved.schema.arrays) {
      const updatedItemFields = new Map<string, SchemaField>();
      for (const [fieldName, field] of array.itemFields) {
        const updatedField = this.updateFieldReferences(field, undefined);
        updatedItemFields.set(fieldName, updatedField);
      }
      mergedArrays.set(path, {
        ...array,
        itemFields: updatedItemFields,
      });
    }

    return mergedArrays;
  }

  /**
   * Merge constraints from all imports.
   */
  private mergeConstraints(resolved: ResolvedSchema): Map<string, SchemaObjectConstraint[]> {
    const mergedConstraints = new Map<string, SchemaObjectConstraint[]>();

    // Add constraints from imports (Map keyed by path, alias in value)
    for (const [_filePath, imp] of resolved.resolution.imports) {
      if (imp.schema) {
        for (const [path, constraints] of imp.schema.constraints) {
          const qualifiedPath =
            this.options.conflictResolution === 'namespace' ? `${imp.alias}_${path}` : path;

          const existing = mergedConstraints.get(qualifiedPath) ?? [];
          existing.push(...constraints);
          mergedConstraints.set(qualifiedPath, existing);
        }
      }
    }

    // Add constraints from primary schema
    for (const [path, constraints] of resolved.schema.constraints) {
      const existing = mergedConstraints.get(path) ?? [];
      existing.push(...constraints);
      mergedConstraints.set(path, existing);
    }

    return mergedConstraints;
  }

  /**
   * Build metadata for the flattened schema.
   */
  private buildMetadata(primaryMetadata: SchemaMetadata): SchemaMetadata {
    return {
      ...primaryMetadata,
      ...this.options.metadata,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tree Shaking Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Collect all types referenced from the primary schema by walking the type reference graph.
   */
  private collectReferencedTypes(
    resolved: ResolvedSchema,
    allTypes: Map<string, SchemaType>,
    mergedFields: Map<string, SchemaField>,
    mergedArrays: Map<string, SchemaArray>
  ): void {
    // Track which type paths we've processed for field sections
    const processedTypePaths = new Set<string>();

    // Start with all types defined in the primary schema (they're always included)
    for (const [typeName] of resolved.schema.types) {
      this.markTypeReferenced(
        typeName,
        undefined,
        allTypes,
        mergedFields,
        mergedArrays,
        processedTypePaths
      );
    }

    // Also include types referenced from primary schema fields
    for (const [, field] of resolved.schema.fields) {
      this.collectTypeReferencesFromField(
        field,
        allTypes,
        mergedFields,
        mergedArrays,
        processedTypePaths
      );
    }

    // And from primary schema arrays
    for (const [, array] of resolved.schema.arrays) {
      for (const [, field] of array.itemFields) {
        this.collectTypeReferencesFromField(
          field,
          allTypes,
          mergedFields,
          mergedArrays,
          processedTypePaths
        );
      }
    }
  }

  /**
   * Mark a type as referenced and recursively mark all types it references.
   */
  private markTypeReferenced(
    typeName: string,
    namespace: string | undefined,
    allTypes: Map<string, SchemaType>,
    mergedFields: Map<string, SchemaField>,
    mergedArrays: Map<string, SchemaArray>,
    processedTypePaths: Set<string>
  ): void {
    // Build the qualified name using smart naming
    const qualifiedName = this.buildQualifiedName(typeName, namespace);

    // Skip if already processed
    if (this.referencedTypes.has(qualifiedName)) {
      return;
    }

    // Mark as referenced
    this.referencedTypes.add(qualifiedName);

    // Find the type and recursively mark types it references
    const type = allTypes.get(qualifiedName);
    if (type) {
      for (const [, field] of type.fields) {
        this.collectTypeReferencesFromField(
          field,
          allTypes,
          mergedFields,
          mergedArrays,
          processedTypePaths
        );
      }

      // If this type inherits from a base type (has _composition), also process
      // all field sections belonging to that base type
      const compositionField = type.fields.get('_composition');
      if (compositionField && compositionField.type.kind === 'typeRef') {
        const baseTypeName = compositionField.type.name;
        this.processInheritedFieldSections(
          baseTypeName,
          allTypes,
          mergedFields,
          mergedArrays,
          processedTypePaths
        );
      }
    }

    // Also process field sections belonging to this type path
    this.processFieldSectionsForType(
      qualifiedName,
      allTypes,
      mergedFields,
      mergedArrays,
      processedTypePaths
    );
  }

  /**
   * Process field sections that belong to an inherited base type.
   */
  private processInheritedFieldSections(
    baseTypeName: string,
    allTypes: Map<string, SchemaType>,
    mergedFields: Map<string, SchemaField>,
    mergedArrays: Map<string, SchemaArray>,
    processedTypePaths: Set<string>
  ): void {
    // Resolve the base type name to its qualified form
    let qualifiedBaseName: string;
    if (baseTypeName.includes('.')) {
      const parts = baseTypeName.split('.');
      const namespace = parts.slice(0, -1).join('_');
      const typeNamePart = parts[parts.length - 1]!;
      qualifiedBaseName = this.buildQualifiedName(typeNamePart, namespace);
    } else {
      qualifiedBaseName = this.resolveTypeReference(baseTypeName);
    }

    // Try multiple name formats to find the base type
    if (!allTypes.has(qualifiedBaseName)) {
      // Try underscore format
      if (baseTypeName.includes('_')) {
        qualifiedBaseName = baseTypeName;
      }
      // Try original name as-is (for types from primary schema or already qualified)
      if (!allTypes.has(qualifiedBaseName)) {
        qualifiedBaseName = baseTypeName;
      }
    }

    // Mark the base type as referenced
    if (!this.referencedTypes.has(qualifiedBaseName)) {
      this.referencedTypes.add(qualifiedBaseName);
      const baseType = allTypes.get(qualifiedBaseName);
      if (baseType) {
        for (const [, field] of baseType.fields) {
          this.collectTypeReferencesFromField(
            field,
            allTypes,
            mergedFields,
            mergedArrays,
            processedTypePaths
          );
        }
        // Recursively check if base type also inherits
        const baseComposition = baseType.fields.get('_composition');
        if (baseComposition && baseComposition.type.kind === 'typeRef') {
          this.processInheritedFieldSections(
            baseComposition.type.name,
            allTypes,
            mergedFields,
            mergedArrays,
            processedTypePaths
          );
        }
      }
    }

    // Process field sections for the base type
    this.processFieldSectionsForType(
      qualifiedBaseName,
      allTypes,
      mergedFields,
      mergedArrays,
      processedTypePaths
    );
  }

  /**
   * Process all field sections and nested types that belong to a given type path.
   */
  private processFieldSectionsForType(
    typePath: string,
    allTypes: Map<string, SchemaType>,
    mergedFields: Map<string, SchemaField>,
    mergedArrays: Map<string, SchemaArray>,
    processedTypePaths: Set<string>
  ): void {
    // Skip if already processed this type path
    if (processedTypePaths.has(typePath)) {
      return;
    }
    processedTypePaths.add(typePath);

    // Find all TYPES that start with this type path (nested type sections like @policy.named_insured)
    const typePathPrefix = typePath + '.';
    for (const [nestedTypeName, nestedType] of allTypes) {
      if (nestedTypeName.startsWith(typePathPrefix)) {
        // Mark this nested type as referenced
        if (!this.referencedTypes.has(nestedTypeName)) {
          this.referencedTypes.add(nestedTypeName);
          // Process its fields
          for (const [, field] of nestedType.fields) {
            this.collectTypeReferencesFromField(
              field,
              allTypes,
              mergedFields,
              mergedArrays,
              processedTypePaths
            );
          }
          // Check for inheritance in nested type
          const composition = nestedType.fields.get('_composition');
          if (composition && composition.type.kind === 'typeRef') {
            this.processInheritedFieldSections(
              composition.type.name,
              allTypes,
              mergedFields,
              mergedArrays,
              processedTypePaths
            );
          }
          // Recursively process nested types of this nested type
          this.processFieldSectionsForType(
            nestedTypeName,
            allTypes,
            mergedFields,
            mergedArrays,
            processedTypePaths
          );
        }
      }
    }

    // Find all field paths that start with this type path
    for (const [fieldPath, field] of mergedFields) {
      if (fieldPath.startsWith(typePathPrefix) || fieldPath === typePath) {
        this.collectTypeReferencesFromField(
          field,
          allTypes,
          mergedFields,
          mergedArrays,
          processedTypePaths
        );
      }
    }

    // Also check arrays
    for (const [arrayPath, array] of mergedArrays) {
      if (arrayPath.startsWith(typePathPrefix) || arrayPath === typePath) {
        for (const [, field] of array.itemFields) {
          this.collectTypeReferencesFromField(
            field,
            allTypes,
            mergedFields,
            mergedArrays,
            processedTypePaths
          );
        }
      }
    }
  }

  /**
   * Extract type references from a field and mark them as referenced.
   */
  private collectTypeReferencesFromField(
    field: SchemaField,
    allTypes: Map<string, SchemaType>,
    mergedFields: Map<string, SchemaField>,
    mergedArrays: Map<string, SchemaArray>,
    processedTypePaths: Set<string>
  ): void {
    // Check for type reference (@typename)
    if (field.type.kind === 'reference' && field.type.targetPath) {
      const targetPath = field.type.targetPath;
      // Build qualified name using smart naming
      let qualifiedName: string;
      if (targetPath.includes('.')) {
        const parts = targetPath.split('.');
        const namespace = parts.slice(0, -1).join('_');
        const typeNamePart = parts[parts.length - 1]!;
        qualifiedName = this.buildQualifiedName(typeNamePart, namespace);
      } else {
        qualifiedName = this.resolveTypeReference(targetPath);
      }

      // Also check if already in underscore format
      if (!allTypes.has(qualifiedName) && targetPath.includes('_')) {
        qualifiedName = targetPath;
      }

      if (qualifiedName && !this.referencedTypes.has(qualifiedName)) {
        this.referencedTypes.add(qualifiedName);
        // Recursively mark types referenced by this type
        const type = allTypes.get(qualifiedName);
        if (type) {
          for (const [, f] of type.fields) {
            this.collectTypeReferencesFromField(
              f,
              allTypes,
              mergedFields,
              mergedArrays,
              processedTypePaths
            );
          }
          // Check for inheritance
          const composition = type.fields.get('_composition');
          if (composition && composition.type.kind === 'typeRef') {
            this.processInheritedFieldSections(
              composition.type.name,
              allTypes,
              mergedFields,
              mergedArrays,
              processedTypePaths
            );
          }
        }
        // Process field sections for this type
        this.processFieldSectionsForType(
          qualifiedName,
          allTypes,
          mergedFields,
          mergedArrays,
          processedTypePaths
        );
      }
    }

    // Check for typeRef
    if (field.type.kind === 'typeRef') {
      const typeName = field.type.name;
      let qualifiedName: string;
      if (typeName.includes('.')) {
        const parts = typeName.split('.');
        const namespace = parts.slice(0, -1).join('_');
        const typeNamePart = parts[parts.length - 1]!;
        qualifiedName = this.buildQualifiedName(typeNamePart, namespace);
      } else {
        qualifiedName = this.resolveTypeReference(typeName);
      }

      // Also check if already in underscore format
      if (!allTypes.has(qualifiedName) && typeName.includes('_')) {
        qualifiedName = typeName;
      }

      if (qualifiedName && !this.referencedTypes.has(qualifiedName)) {
        this.referencedTypes.add(qualifiedName);
        const type = allTypes.get(qualifiedName);
        if (type) {
          for (const [, f] of type.fields) {
            this.collectTypeReferencesFromField(
              f,
              allTypes,
              mergedFields,
              mergedArrays,
              processedTypePaths
            );
          }
          // Check for inheritance
          const composition = type.fields.get('_composition');
          if (composition && composition.type.kind === 'typeRef') {
            this.processInheritedFieldSections(
              composition.type.name,
              allTypes,
              mergedFields,
              mergedArrays,
              processedTypePaths
            );
          }
        }
        // Process field sections for this type
        this.processFieldSectionsForType(
          qualifiedName,
          allTypes,
          mergedFields,
          mergedArrays,
          processedTypePaths
        );
      }
    }
  }

  /**
   * Resolve a simple type name to its qualified name using the type source map.
   */
  private resolveTypeReference(typeName: string): string {
    const namespace = this.typeSourceMap.get(typeName);
    return this.buildQualifiedName(typeName, namespace);
  }

  /**
   * Filter merged types to only include those that are referenced.
   */
  private filterReferencedTypes(mergedTypes: Map<string, SchemaType>): Map<string, SchemaType> {
    const filtered = new Map<string, SchemaType>();
    for (const [name, type] of mergedTypes) {
      if (this.referencedTypes.has(name)) {
        filtered.set(name, type);
      }
    }
    return filtered;
  }

  /**
   * Filter fields to only include those in referenced type paths.
   */
  private filterReferencedFields(mergedFields: Map<string, SchemaField>): Map<string, SchemaField> {
    const filtered = new Map<string, SchemaField>();
    for (const [path, field] of mergedFields) {
      // Check if the field's type path (first segment) is referenced
      const typePath = this.getTypePathFromFieldPath(path);
      if (this.isTypePathReferenced(typePath)) {
        filtered.set(path, field);
      }
    }
    return filtered;
  }

  /**
   * Filter arrays to only include those in referenced type paths.
   */
  private filterReferencedArrays(mergedArrays: Map<string, SchemaArray>): Map<string, SchemaArray> {
    const filtered = new Map<string, SchemaArray>();
    for (const [path, array] of mergedArrays) {
      const typePath = this.getTypePathFromFieldPath(path);
      if (this.isTypePathReferenced(typePath)) {
        filtered.set(path, array);
      }
    }
    return filtered;
  }

  /**
   * Filter constraints to only include those in referenced type paths.
   */
  private filterReferencedConstraints(
    mergedConstraints: Map<string, SchemaObjectConstraint[]>
  ): Map<string, SchemaObjectConstraint[]> {
    const filtered = new Map<string, SchemaObjectConstraint[]>();
    for (const [path, constraints] of mergedConstraints) {
      const typePath = this.getTypePathFromFieldPath(path);
      if (this.isTypePathReferenced(typePath)) {
        filtered.set(path, constraints);
      }
    }
    return filtered;
  }

  /**
   * Extract the type path from a field path.
   *
   * @example
   * getTypePathFromFieldPath("types_address.line1") // "types_address"
   * getTypePathFromFieldPath("policy.term.effective_date") // "policy"
   */
  private getTypePathFromFieldPath(fieldPath: string): string {
    // The type is the first segment before any dot
    const dotIndex = fieldPath.indexOf('.');
    return dotIndex >= 0 ? fieldPath.substring(0, dotIndex) : fieldPath;
  }

  /**
   * Check if a type path or any parent path is referenced.
   */
  private isTypePathReferenced(typePath: string): boolean {
    // Direct match
    if (this.referencedTypes.has(typePath)) {
      return true;
    }
    // Check if this is a field of the primary schema (no prefix)
    // Primary schema fields don't have a type prefix
    if (!typePath.includes('_')) {
      return true;
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flatten a schema file by resolving and merging all imports.
 *
 * @param filePath - Path to the schema file
 * @param options - Flattening options
 * @returns Flattened schema result
 *
 * @example
 * ```typescript
 * import { flattenSchemaFile } from '@odin/sdk/resolver';
 *
 * const result = await flattenSchemaFile('./policy.schema.odin');
 * console.log(result.sourceFiles); // All files that were merged
 * ```
 */
export async function flattenSchemaFile(
  filePath: string,
  options?: FlattenerOptions
): Promise<FlattenedResult> {
  const flattener = new SchemaFlattener(options);
  return flattener.flattenFile(filePath);
}

/**
 * Bundle a schema file into a single ODIN text output with no imports.
 *
 * This is a convenience function that flattens a schema and serializes it.
 *
 * @param filePath - Path to the schema file
 * @param options - Options for flattening and serialization
 * @returns ODIN text with all imports merged
 *
 * @example
 * ```typescript
 * import { bundleSchema } from '@odin/sdk/resolver';
 *
 * // Bundle auto.schema.odin with all its imports into a single file
 * const bundled = await bundleSchema('./auto.schema.odin', {
 *   headerComment: 'Auto-generated bundled schema - DO NOT EDIT',
 * });
 *
 * // Write to file
 * fs.writeFileSync('./auto.bundled.odin', bundled);
 * ```
 */
export async function bundleSchema(
  filePath: string,
  options?: FlattenerOptions & SerializerOptions
): Promise<string> {
  const flattener = new SchemaFlattener(options);
  const result = await flattener.flattenFile(filePath);

  // Add source files to header comment
  const headerLines: string[] = [];
  if (options?.headerComment) {
    headerLines.push(options.headerComment);
    headerLines.push('');
  }
  // Make source paths relative to sandboxRoot or the schema file's directory
  const baseDir = options?.sandboxRoot ?? path.dirname(filePath);
  const normalizedBase = path.normalize(baseDir);
  headerLines.push('Bundled from:');
  for (const source of result.sourceFiles) {
    const normalizedSource = path.normalize(source);
    const relative = normalizedSource.startsWith(normalizedBase)
      ? normalizedSource.slice(normalizedBase.length).replace(/^[/\\]+/, '')
      : normalizedSource;
    headerLines.push(`  - ${relative}`);
  }

  return serializeSchema(result.schema, {
    ...options,
    includeImports: false,
    headerComment: headerLines.join('\n'),
  });
}

/**
 * Create a schema flattener instance.
 *
 * @param options - Flattening options
 * @returns A new SchemaFlattener instance
 */
export function createSchemaFlattener(options?: FlattenerOptions): SchemaFlattener {
  return new SchemaFlattener(options);
}
