/**
 * Tests for schema-flattener module.
 *
 * Covers schema flattening with import merging, tree shaking, and conflict resolution.
 */

import { describe, it, expect } from 'vitest';
import { SchemaFlattener, createSchemaFlattener } from '../../../src/resolver/schema-flattener.js';
import type { OdinSchema, SchemaType, SchemaField } from '../../../src/types/schema.js';
import type { ResolvedSchema } from '../../../src/resolver/import-resolver.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createField(name: string, kind: string = 'primitive'): SchemaField {
  return {
    name,
    type: { kind: kind as 'primitive' | 'reference' | 'typeRef' },
    path: name,
    required: false,
    deprecated: false,
    redacted: false,
    modifiers: [],
  };
}

function createTypeRefField(name: string, refName: string): SchemaField {
  return {
    name,
    type: { kind: 'typeRef', name: refName },
    path: name,
    required: false,
    deprecated: false,
    redacted: false,
    modifiers: [],
  };
}

function createType(name: string, fields: [string, SchemaField][]): SchemaType {
  return {
    name,
    fields: new Map(fields),
  };
}

function createSchema(
  types: [string, SchemaType][] = [],
  fields: [string, SchemaField][] = []
): OdinSchema {
  return {
    metadata: {
      odin: '1.0.0',
      schema: '1.0.0',
      title: 'Test Schema',
    },
    imports: [],
    types: new Map(types),
    fields: new Map(fields),
    arrays: new Map(),
    constraints: new Map(),
  };
}

function createResolvedSchema(
  primarySchema: OdinSchema,
  imports: Map<string, { alias: string; schema: OdinSchema | null }> = new Map()
): ResolvedSchema {
  return {
    schema: primarySchema,
    resolution: {
      resolvedPaths: ['/primary.odin', ...Array.from(imports.keys())],
      imports,
      errors: [],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SchemaFlattener Constructor Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SchemaFlattener', () => {
  describe('constructor', () => {
    it('creates flattener with default options', () => {
      const flattener = new SchemaFlattener();
      expect(flattener).toBeInstanceOf(SchemaFlattener);
    });

    it('creates flattener with custom conflict resolution', () => {
      const flattener = new SchemaFlattener({ conflictResolution: 'error' });
      expect(flattener).toBeInstanceOf(SchemaFlattener);
    });

    it('creates flattener with tree shaking disabled', () => {
      const flattener = new SchemaFlattener({ treeShake: false });
      expect(flattener).toBeInstanceOf(SchemaFlattener);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// flattenResolved Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('flattenResolved', () => {
  describe('basic flattening', () => {
    it('flattens schema with no imports', () => {
      const flattener = new SchemaFlattener({ treeShake: false });
      const schema = createSchema([
        ['policy', createType('policy', [['number', createField('number')]])],
      ]);
      const resolved = createResolvedSchema(schema);

      const result = flattener.flattenResolved(resolved);

      expect(result.schema.types.size).toBe(1);
      expect(result.schema.types.has('policy')).toBe(true);
      expect(result.schema.imports).toEqual([]);
    });

    it('returns empty imports in flattened schema', () => {
      const flattener = new SchemaFlattener({ treeShake: false });
      const schema = createSchema();
      const resolved = createResolvedSchema(schema);

      const result = flattener.flattenResolved(resolved);

      expect(result.schema.imports).toEqual([]);
    });

    it('includes source files in result', () => {
      const flattener = new SchemaFlattener({ treeShake: false });
      const schema = createSchema();
      const resolved = createResolvedSchema(schema);

      const result = flattener.flattenResolved(resolved);

      expect(result.sourceFiles).toContain('/primary.odin');
    });
  });

  describe('import merging', () => {
    it('merges types from imports with namespace prefix', () => {
      const flattener = new SchemaFlattener({ treeShake: false });

      const primarySchema = createSchema([
        ['policy', createType('policy', [['number', createField('number')]])],
      ]);

      const importedSchema = createSchema([
        ['address', createType('address', [['line1', createField('line1')]])],
      ]);

      const imports = new Map([['/types.odin', { alias: 'types', schema: importedSchema }]]);

      const resolved = createResolvedSchema(primarySchema, imports);
      const result = flattener.flattenResolved(resolved);

      // Both types should be present
      expect(result.schema.types.has('policy')).toBe(true);
      expect(result.schema.types.has('types_address')).toBe(true);
    });

    it('avoids double namespace prefix when type already prefixed', () => {
      const flattener = new SchemaFlattener({ treeShake: false });

      const primarySchema = createSchema();

      // Type name already starts with namespace
      const importedSchema = createSchema([
        ['carrier_program', createType('carrier_program', [['id', createField('id')]])],
      ]);

      const imports = new Map([['/carrier.odin', { alias: 'carrier', schema: importedSchema }]]);

      const resolved = createResolvedSchema(primarySchema, imports);
      const result = flattener.flattenResolved(resolved);

      // Should be carrier_program, not carrier_carrier_program
      expect(result.schema.types.has('carrier_program')).toBe(true);
      expect(result.schema.types.has('carrier_carrier_program')).toBe(false);
    });

    it('uses type name when namespace equals type name', () => {
      const flattener = new SchemaFlattener({ treeShake: false });

      const primarySchema = createSchema();

      // Type name equals namespace
      const importedSchema = createSchema([
        ['agency', createType('agency', [['name', createField('name')]])],
      ]);

      const imports = new Map([['/agency.odin', { alias: 'agency', schema: importedSchema }]]);

      const resolved = createResolvedSchema(primarySchema, imports);
      const result = flattener.flattenResolved(resolved);

      // Should be agency, not agency_agency
      expect(result.schema.types.has('agency')).toBe(true);
      expect(result.schema.types.has('agency_agency')).toBe(false);
    });
  });

  describe('conflict resolution', () => {
    it('uses namespace mode by default', () => {
      const flattener = new SchemaFlattener({ treeShake: false });

      const primarySchema = createSchema([
        ['address', createType('address', [['line1', createField('line1')]])],
      ]);

      const importedSchema = createSchema([
        ['address', createType('address', [['city', createField('city')]])],
      ]);

      const imports = new Map([['/types.odin', { alias: 'types', schema: importedSchema }]]);

      const resolved = createResolvedSchema(primarySchema, imports);
      const result = flattener.flattenResolved(resolved);

      // Both should exist with different names
      expect(result.schema.types.has('address')).toBe(true);
      expect(result.schema.types.has('types_address')).toBe(true);
    });

    it('throws error in error mode on conflict', () => {
      const flattener = new SchemaFlattener({ conflictResolution: 'error', treeShake: false });

      const primarySchema = createSchema([
        ['address', createType('address', [['line1', createField('line1')]])],
      ]);

      const importedSchema = createSchema([
        ['address', createType('address', [['city', createField('city')]])],
      ]);

      const imports = new Map([['/types.odin', { alias: 'address', schema: importedSchema }]]);

      const resolved = createResolvedSchema(primarySchema, imports);

      expect(() => flattener.flattenResolved(resolved)).toThrow('Type name conflict');
    });

    it('overwrites in overwrite mode', () => {
      const flattener = new SchemaFlattener({ conflictResolution: 'overwrite', treeShake: false });

      const primarySchema = createSchema([
        ['address', createType('address', [['line1', createField('line1')]])],
      ]);

      const importedSchema = createSchema([
        ['address', createType('address', [['city', createField('city')]])],
      ]);

      const imports = new Map([['/types.odin', { alias: 'types', schema: importedSchema }]]);

      const resolved = createResolvedSchema(primarySchema, imports);
      const result = flattener.flattenResolved(resolved);

      // Primary schema type should override
      expect(result.schema.types.has('address')).toBe(true);
      const addressType = result.schema.types.get('address');
      expect(addressType?.fields.has('line1')).toBe(true);
    });
  });

  describe('type inheritance', () => {
    it('expands type with _composition', () => {
      const flattener = new SchemaFlattener({ treeShake: false });

      const baseType = createType('base', [
        ['name', createField('name')],
        ['id', createField('id')],
      ]);

      const childType = createType('child', [
        ['_composition', createTypeRefField('_composition', 'base')],
        ['extra', createField('extra')],
      ]);

      const schema = createSchema([
        ['base', baseType],
        ['child', childType],
      ]);

      const resolved = createResolvedSchema(schema);
      const result = flattener.flattenResolved(resolved);

      const child = result.schema.types.get('child');
      expect(child).toBeDefined();
      // Child should have inherited fields
      expect(child?.fields.has('name')).toBe(true);
      expect(child?.fields.has('id')).toBe(true);
      expect(child?.fields.has('extra')).toBe(true);
    });

    it('warns on circular type inheritance', () => {
      const flattener = new SchemaFlattener({ treeShake: false });

      // Create circular inheritance
      const typeA = createType('typeA', [
        ['_composition', createTypeRefField('_composition', 'typeB')],
        ['fieldA', createField('fieldA')],
      ]);

      const typeB = createType('typeB', [
        ['_composition', createTypeRefField('_composition', 'typeA')],
        ['fieldB', createField('fieldB')],
      ]);

      const schema = createSchema([
        ['typeA', typeA],
        ['typeB', typeB],
      ]);

      const resolved = createResolvedSchema(schema);
      const result = flattener.flattenResolved(resolved);

      expect(result.warnings.some((w) => w.includes('Circular'))).toBe(true);
    });
  });

  describe('tree shaking', () => {
    it('removes unused types when enabled', () => {
      const flattener = new SchemaFlattener({ treeShake: true });

      const primarySchema = createSchema([
        ['used', createType('used', [['name', createField('name')]])],
      ]);

      const importedSchema = createSchema([
        ['unused', createType('unused', [['data', createField('data')]])],
      ]);

      const imports = new Map([['/types.odin', { alias: 'types', schema: importedSchema }]]);

      const resolved = createResolvedSchema(primarySchema, imports);
      const result = flattener.flattenResolved(resolved);

      expect(result.schema.types.has('used')).toBe(true);
      expect(result.schema.types.has('types_unused')).toBe(false);
      expect(result.warnings.some((w) => w.includes('Tree shaking'))).toBe(true);
    });

    it('preserves types referenced through type refs', () => {
      const flattener = new SchemaFlattener({ treeShake: true });

      const primarySchema = createSchema([
        [
          'policy',
          createType('policy', [['address', createTypeRefField('address', 'types_address')]]),
        ],
      ]);

      const importedSchema = createSchema([
        ['address', createType('address', [['line1', createField('line1')]])],
      ]);

      const imports = new Map([['/types.odin', { alias: 'types', schema: importedSchema }]]);

      const resolved = createResolvedSchema(primarySchema, imports);
      const result = flattener.flattenResolved(resolved);

      // Both types should be preserved
      expect(result.schema.types.has('policy')).toBe(true);
      expect(result.schema.types.has('types_address')).toBe(true);
    });

    it('keeps all types when tree shaking disabled', () => {
      const flattener = new SchemaFlattener({ treeShake: false });

      const primarySchema = createSchema([
        ['used', createType('used', [['name', createField('name')]])],
      ]);

      const importedSchema = createSchema([
        ['unused', createType('unused', [['data', createField('data')]])],
      ]);

      const imports = new Map([['/types.odin', { alias: 'types', schema: importedSchema }]]);

      const resolved = createResolvedSchema(primarySchema, imports);
      const result = flattener.flattenResolved(resolved);

      expect(result.schema.types.has('used')).toBe(true);
      expect(result.schema.types.has('types_unused')).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createSchemaFlattener Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('createSchemaFlattener', () => {
  it('creates SchemaFlattener instance', () => {
    const flattener = createSchemaFlattener();
    expect(flattener).toBeInstanceOf(SchemaFlattener);
  });

  it('passes options to SchemaFlattener', () => {
    const flattener = createSchemaFlattener({
      conflictResolution: 'error',
      treeShake: false,
    });
    expect(flattener).toBeInstanceOf(SchemaFlattener);
  });
});
