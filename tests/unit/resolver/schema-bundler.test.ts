/**
 * Tests for ODIN schema bundling (serializer + flattener)
 */

import { describe, it, expect } from 'vitest';
import {
  serializeSchema,
  createSchemaSerializer,
  createSchemaFlattener,
} from '../../../src/resolver/index.js';
import { parseSchema } from '../../../src/validator/schema-parser.js';
import type { OdinSchema, SchemaField } from '../../../src/types/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// SchemaSerializer Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SchemaSerializer', () => {
  describe('serializeSchema', () => {
    it('serializes basic metadata', () => {
      const schema: OdinSchema = {
        metadata: {
          odin: '1.0.0',
          schema: '1.0.0',
          id: 'test.schema',
          title: 'Test Schema',
        },
        imports: [],
        types: new Map(),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain('{$}');
      expect(result).toContain('odin = "1.0.0"');
      expect(result).toContain('schema = "1.0.0"');
      expect(result).toContain('id = "test.schema"');
      expect(result).toContain('title = "Test Schema"');
    });

    it('serializes imports when enabled', () => {
      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [
          { path: './types.odin', alias: 'types', line: 1 },
          { path: './common.odin', line: 2 },
        ],
        types: new Map(),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema, { includeImports: true });

      expect(result).toContain('@import "./types.odin" as types');
      expect(result).toContain('@import "./common.odin"');
    });

    it('omits imports when disabled', () => {
      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [{ path: './types.odin', alias: 'types', line: 1 }],
        types: new Map(),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema, { includeImports: false });

      expect(result).not.toContain('@import');
    });

    it('serializes type definitions', () => {
      const addressFields = new Map<string, SchemaField>();
      addressFields.set('line1', {
        path: 'line1',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [{ kind: 'bounds', min: 1, max: 100 }],
        conditionals: [],
      });
      addressFields.set('city', {
        path: 'city',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['address', { name: 'address', fields: addressFields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain('{@address}');
      expect(result).toContain('line1 = !:');
      expect(result).toContain('city = !:');
    });

    it('serializes field modifiers correctly', () => {
      const fields = new Map<string, SchemaField>();
      fields.set('ssn', {
        path: 'ssn',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: true,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['person', { name: 'person', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain('ssn = !*:');
    });

    it('serializes enum types', () => {
      const fields = new Map<string, SchemaField>();
      fields.set('status', {
        path: 'status',
        type: { kind: 'enum', values: ['active', 'pending', 'closed'] },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['policy', { name: 'policy', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain('status = !(active, pending, closed)');
    });

    it('serializes reference types', () => {
      const fields = new Map<string, SchemaField>();
      fields.set('billing', {
        path: 'billing',
        type: { kind: 'reference', targetPath: 'address' },
        required: false,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['customer', { name: 'customer', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain('billing = @address');
    });

    it('serializes conditionals', () => {
      const fields = new Map<string, SchemaField>();
      fields.set('spouse_name', {
        path: 'spouse_name',
        type: { kind: 'string' },
        required: false,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [{ field: 'marital_status', value: 'M' }],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['person', { name: 'person', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain(':if marital_status = M');
    });

    it('serializes pattern constraints', () => {
      const fields = new Map<string, SchemaField>();
      fields.set('email', {
        path: 'email',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [{ kind: 'pattern', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' }],
        conditionals: [],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['contact', { name: 'contact', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain(':/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/');
    });

    it('includes header comment when provided', () => {
      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map(),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema, {
        headerComment: 'Auto-generated schema\nDO NOT EDIT',
      });

      expect(result).toContain('; Auto-generated schema');
      expect(result).toContain('; DO NOT EDIT');
    });

    it('serializes numeric types', () => {
      const fields = new Map<string, SchemaField>();
      fields.set('age', {
        path: 'age',
        type: { kind: 'integer' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [{ kind: 'bounds', min: 0, max: 150 }],
        conditionals: [],
      });
      fields.set('score', {
        path: 'score',
        type: { kind: 'number' },
        required: false,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });
      fields.set('premium', {
        path: 'premium',
        type: { kind: 'currency', places: 2 },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['data', { name: 'data', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain('age = !##');
      expect(result).toContain('score = #');
      expect(result).toContain('premium = !#$');
    });

    it('serializes temporal types', () => {
      const fields = new Map<string, SchemaField>();
      fields.set('birth_date', {
        path: 'birth_date',
        type: { kind: 'date' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });
      fields.set('created', {
        path: 'created',
        type: { kind: 'timestamp' },
        required: false,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['record', { name: 'record', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain('birth_date = !date');
      expect(result).toContain('created = timestamp');
    });

    it('serializes boolean types', () => {
      const fields = new Map<string, SchemaField>();
      fields.set('active', {
        path: 'active',
        type: { kind: 'boolean' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['status', { name: 'status', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain('active = !?');
    });

    it('serializes arrays with item fields', () => {
      const itemFields = new Map<string, SchemaField>();
      itemFields.set('code', {
        path: 'code',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [{ kind: 'bounds', min: 2, max: 10 }],
        conditionals: [],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map(),
        fields: new Map(),
        arrays: new Map([
          [
            'codes',
            {
              path: 'codes',
              unique: true,
              itemFields,
              minItems: 1,
              maxItems: 10,
            },
          ],
        ]),
        constraints: new Map(),
      };

      const result = serializeSchema(schema);

      expect(result).toContain('{codes[]}');
      expect(result).toContain(':unique');
    });
  });

  describe('createSchemaSerializer', () => {
    it('creates a reusable serializer instance', () => {
      const serializer = createSchemaSerializer({ includeImports: false });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [{ path: './test.odin', line: 1 }],
        types: new Map(),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = serializer.serialize(schema);
      expect(result).not.toContain('@import');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SchemaFlattener Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SchemaFlattener', () => {
  describe('flattenResolved', () => {
    it('flattens a schema with no imports', () => {
      const fields = new Map<string, SchemaField>();
      fields.set('name', {
        path: 'name',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const schema: OdinSchema = {
        metadata: { odin: '1.0.0', id: 'test' },
        imports: [],
        types: new Map([['person', { name: 'person', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const flattener = createSchemaFlattener();
      const result = flattener.flattenResolved({
        schema,
        resolution: {
          imports: new Map(),
          typeRegistry: {} as any,
          resolvedPaths: ['test.odin'],
        },
      });

      expect(result.schema.metadata.id).toBe('test');
      expect(result.schema.types.size).toBe(1);
      expect(result.schema.types.has('person')).toBe(true);
      expect(result.sourceFiles).toContain('test.odin');
    });

    it('merges types from imports with namespacing', () => {
      // Primary schema
      const primaryFields = new Map<string, SchemaField>();
      primaryFields.set('id', {
        path: 'id',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const primarySchema: OdinSchema = {
        metadata: { odin: '1.0.0', id: 'primary' },
        imports: [],
        types: new Map([['entity', { name: 'entity', fields: primaryFields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      // Imported schema
      const importedFields = new Map<string, SchemaField>();
      importedFields.set('city', {
        path: 'city',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const importedSchema: OdinSchema = {
        metadata: { odin: '1.0.0', id: 'imported' },
        imports: [],
        types: new Map([['address', { name: 'address', fields: importedFields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const flattener = createSchemaFlattener({
        conflictResolution: 'namespace',
        treeShake: false,
      });
      const result = flattener.flattenResolved({
        schema: primarySchema,
        resolution: {
          imports: new Map([
            [
              'types',
              {
                alias: 'types',
                path: '/imported.odin',
                originalPath: './imported.odin',
                schema: importedSchema,
                line: 1,
              },
            ],
          ]),
          typeRegistry: {} as any,
          resolvedPaths: ['primary.odin', 'imported.odin'],
        },
      });

      // Should have both types (tree-shaking disabled to test namespacing)
      expect(result.schema.types.size).toBe(2);
      expect(result.schema.types.has('entity')).toBe(true);
      expect(result.schema.types.has('types_address')).toBe(true); // Namespaced
    });

    it('handles type conflicts with overwrite mode', () => {
      // Both schemas have 'entity' type
      const primaryFields = new Map<string, SchemaField>();
      primaryFields.set('id', {
        path: 'id',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const primarySchema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['entity', { name: 'entity', fields: primaryFields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const importedFields = new Map<string, SchemaField>();
      importedFields.set('name', {
        path: 'name',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const importedSchema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['entity', { name: 'entity', fields: importedFields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const flattener = createSchemaFlattener({ conflictResolution: 'overwrite' });
      const result = flattener.flattenResolved({
        schema: primarySchema,
        resolution: {
          imports: new Map([
            [
              'imported',
              {
                alias: 'imported',
                path: '/imported.odin',
                originalPath: './imported.odin',
                schema: importedSchema,
                line: 1,
              },
            ],
          ]),
          typeRegistry: {} as any,
          resolvedPaths: ['primary.odin', 'imported.odin'],
        },
      });

      // Primary schema type should override
      expect(result.schema.types.size).toBe(1);
      expect(result.schema.types.has('entity')).toBe(true);
      const entityType = result.schema.types.get('entity')!;
      expect(entityType.fields.has('id')).toBe(true); // Primary's field
    });

    it('throws error on conflict with error mode', () => {
      const fields = new Map<string, SchemaField>();

      const primarySchema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['entity', { name: 'entity', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const importedSchema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['entity', { name: 'entity', fields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const flattener = createSchemaFlattener({ conflictResolution: 'error' });

      expect(() =>
        flattener.flattenResolved({
          schema: primarySchema,
          resolution: {
            imports: new Map([
              [
                'imported',
                {
                  alias: 'imported',
                  path: '/imported.odin',
                  originalPath: './imported.odin',
                  schema: importedSchema,
                  line: 1,
                },
              ],
            ]),
            typeRegistry: {} as any,
            resolvedPaths: ['primary.odin', 'imported.odin'],
          },
        })
      ).toThrow(/conflict/i);
    });

    it('updates type references when flattening', () => {
      // Primary schema references imported type
      const primaryFields = new Map<string, SchemaField>();
      primaryFields.set('billing', {
        path: 'billing',
        type: { kind: 'reference', targetPath: 'types.address' },
        required: false,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const primarySchema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['customer', { name: 'customer', fields: primaryFields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      // Imported schema
      const importedFields = new Map<string, SchemaField>();
      importedFields.set('city', {
        path: 'city',
        type: { kind: 'string' },
        required: true,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      });

      const importedSchema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [],
        types: new Map([['address', { name: 'address', fields: importedFields }]]),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const flattener = createSchemaFlattener({ conflictResolution: 'namespace' });
      const result = flattener.flattenResolved({
        schema: primarySchema,
        resolution: {
          imports: new Map([
            [
              'types',
              {
                alias: 'types',
                path: '/types.odin',
                originalPath: './types.odin',
                schema: importedSchema,
                line: 1,
              },
            ],
          ]),
          typeRegistry: {} as any,
          resolvedPaths: ['primary.odin', 'types.odin'],
        },
      });

      // Check that type reference was updated
      const customerType = result.schema.types.get('customer')!;
      const billingField = customerType.fields.get('billing')!;
      expect(billingField.type).toEqual({ kind: 'reference', targetPath: 'types_address' });
    });

    it('produces schema with no imports', () => {
      const schema: OdinSchema = {
        metadata: { odin: '1.0.0' },
        imports: [{ path: './test.odin', line: 1 }],
        types: new Map(),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const flattener = createSchemaFlattener();
      const result = flattener.flattenResolved({
        schema,
        resolution: {
          imports: new Map(),
          typeRegistry: {} as any,
          resolvedPaths: ['test.odin'],
        },
      });

      expect(result.schema.imports.length).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Roundtrip Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema Roundtrip', () => {
  it('can parse serialized output back to equivalent schema', () => {
    const fields = new Map<string, SchemaField>();
    fields.set('name', {
      path: 'name',
      type: { kind: 'string' },
      required: true,
      nullable: false,
      redacted: false,
      deprecated: false,
      constraints: [{ kind: 'bounds', min: 1, max: 100 }],
      conditionals: [],
    });
    fields.set('age', {
      path: 'age',
      type: { kind: 'integer' },
      required: false,
      nullable: false,
      redacted: false,
      deprecated: false,
      constraints: [{ kind: 'bounds', min: 0, max: 150 }],
      conditionals: [],
    });
    fields.set('active', {
      path: 'active',
      type: { kind: 'boolean' },
      required: false,
      nullable: false,
      redacted: false,
      deprecated: false,
      constraints: [],
      conditionals: [],
    });

    const originalSchema: OdinSchema = {
      metadata: {
        odin: '1.0.0',
        schema: '1.0.0',
        id: 'test.roundtrip',
        title: 'Roundtrip Test',
      },
      imports: [],
      types: new Map([['person', { name: 'person', fields }]]),
      fields: new Map(),
      arrays: new Map(),
      constraints: new Map(),
    };

    // Serialize
    const serialized = serializeSchema(originalSchema);

    // Parse back
    const parsed = parseSchema(serialized);

    // Verify metadata
    expect(parsed.metadata.odin).toBe('1.0.0');
    expect(parsed.metadata.schema).toBe('1.0.0');
    expect(parsed.metadata.id).toBe('test.roundtrip');

    // Verify type exists
    expect(parsed.types.has('person')).toBe(true);
    const personType = parsed.types.get('person')!;

    // Verify fields
    expect(personType.fields.has('name')).toBe(true);
    expect(personType.fields.has('age')).toBe(true);
    expect(personType.fields.has('active')).toBe(true);

    // Verify field properties
    const nameField = personType.fields.get('name')!;
    expect(nameField.required).toBe(true);

    const ageField = personType.fields.get('age')!;
    expect(ageField.type.kind).toBe('integer');
  });
});
