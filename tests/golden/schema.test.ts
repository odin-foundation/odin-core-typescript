/**
 * Golden tests for ODIN schema parsing.
 *
 * Runs all tests from the shared golden test suite for schema composition,
 * type definitions, inheritance, and reusable types.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Odin, ParseError } from '../../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenDir = path.resolve(__dirname, '../../../golden');

/**
 * Field-level assertions checked against the parsed SchemaField.
 * Only the keys present are asserted.
 */
interface FieldAssertion {
  typeKind?: string;
  /** Expected typeRef name (e.g. "hasName&hasAge" for an intersection). */
  typeRefName?: string;
  required?: boolean;
  nullable?: boolean;
  immutable?: boolean;
  computed?: boolean;
  deprecated?: boolean;
  /** Expected union member kinds, order-insensitive. */
  union?: string[];
  /** Expected default value (subset match against the parsed OdinValue). */
  default?: Record<string, unknown>;
  /** Expected constraints (subset match; each listed constraint must be present). */
  constraints?: Record<string, unknown>[];
  /** Expected conditionals (subset match; each listed conditional must be present). */
  conditionals?: Record<string, unknown>[];
}

interface TypeAssertion {
  fields?: Record<string, FieldAssertion>;
}

interface GoldenSchemaTest {
  id: string;
  description: string;
  input?: string;
  schema?: string;
  expected?: Record<string, unknown>;
  /** When true, assert the parsed structure (types, type fields, root fields) against expected. */
  structural?: boolean;
  /** Value-level assertions on parsed fields/types (constraint values, unions, defaults). */
  assert?: {
    fields?: Record<string, FieldAssertion>;
    types?: Record<string, TypeAssertion>;
  };
  expectError?: {
    code: string;
    message?: string;
  };
}

interface GoldenSuite {
  $schema: string;
  suite: string;
  description: string;
  tests: GoldenSchemaTest[];
}

function loadGoldenTests(dir: string): GoldenSuite[] {
  const suites: GoldenSuite[] = [];

  if (!fs.existsSync(dir)) return suites;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      suites.push(...loadGoldenTests(fullPath));
    } else if (entry.name.endsWith('.json') && entry.name !== 'manifest.json') {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const suite = JSON.parse(content) as GoldenSuite;
        if (suite.tests && Array.isArray(suite.tests)) {
          suites.push(suite);
        }
      } catch {
        // Skip invalid files
      }
    }
  }

  return suites;
}

function runSchemaTest(test: GoldenSchemaTest) {
  const inputText = test.input ?? test.schema ?? '';

  if (test.expectError) {
    expect(() => Odin.parseSchema(inputText)).toThrow();

    try {
      Odin.parseSchema(inputText);
    } catch (error) {
      if (error instanceof ParseError && test.expectError.code) {
        expect(error.code).toBe(test.expectError.code);
      }
    }
  } else {
    const schema = Odin.parseSchema(inputText);
    expect(schema).toBeDefined();

    const expected = test.expected;
    if (!test.structural || !expected) return;

    // Expected types must exist; their declared fields must be present on the type.
    const expectedTypes = expected.types as Record<string, { fields?: Record<string, unknown> }> | undefined;
    if (expectedTypes) {
      for (const [typeName, typeDef] of Object.entries(expectedTypes)) {
        const type = schema.types.get(typeName);
        expect(type, `type '${typeName}' should be defined`).toBeDefined();
        if (typeDef?.fields) {
          for (const fieldKey of Object.keys(typeDef.fields)) {
            expect(type!.fields.has(fieldKey), `type '${typeName}' should have field '${fieldKey}'`).toBe(true);
          }
        }
      }
    }

    // Expected top-level fields must exist on the schema root.
    const expectedFields = expected.fields as Record<string, unknown> | undefined;
    if (expectedFields) {
      for (const fieldPath of Object.keys(expectedFields)) {
        expect(schema.fields.has(fieldPath), `schema should have root field '${fieldPath}'`).toBe(true);
      }
    }
  }
}

/**
 * Assert a single parsed field against a value-level FieldAssertion.
 */
function assertField(field: unknown, a: FieldAssertion, label: string): void {
  expect(field, `${label} should be defined`).toBeDefined();
  const f = field as Record<string, any>;

  if (a.typeKind !== undefined) {
    expect(f.type?.kind, `${label} type kind`).toBe(a.typeKind);
  }
  if (a.typeRefName !== undefined) {
    expect(f.type?.name, `${label} typeRef name`).toBe(a.typeRefName);
  }
  if (a.required !== undefined) expect(f.required, `${label} required`).toBe(a.required);
  if (a.nullable !== undefined) expect(f.nullable, `${label} nullable`).toBe(a.nullable);
  if (a.immutable !== undefined) expect(f.immutable, `${label} immutable`).toBe(a.immutable);
  if (a.computed !== undefined) expect(f.computed, `${label} computed`).toBe(a.computed);
  if (a.deprecated !== undefined) expect(f.deprecated, `${label} deprecated`).toBe(a.deprecated);

  if (a.union !== undefined) {
    expect(f.type?.kind, `${label} should be a union`).toBe('union');
    const kinds = (f.type.types as { kind: string }[]).map((t) => t.kind).sort();
    expect(kinds, `${label} union members`).toEqual([...a.union].sort());
  }

  if (a.default !== undefined) {
    expect(f.defaultValue, `${label} default value`).toBeDefined();
    for (const [k, v] of Object.entries(a.default)) {
      expect(f.defaultValue[k], `${label} default.${k}`).toEqual(v);
    }
  }

  if (a.constraints !== undefined) {
    for (const expectedC of a.constraints) {
      const found = (f.constraints as Record<string, unknown>[]).some((c) =>
        Object.entries(expectedC).every(([k, v]) => JSON.stringify(c[k]) === JSON.stringify(v))
      );
      expect(found, `${label} should have constraint ${JSON.stringify(expectedC)} (got ${JSON.stringify(f.constraints)})`).toBe(true);
    }
  }

  if (a.conditionals !== undefined) {
    for (const expectedCond of a.conditionals) {
      const found = (f.conditionals as Record<string, unknown>[]).some((c) =>
        Object.entries(expectedCond).every(([k, v]) => JSON.stringify(c[k]) === JSON.stringify(v))
      );
      expect(found, `${label} should have conditional ${JSON.stringify(expectedCond)} (got ${JSON.stringify(f.conditionals)})`).toBe(true);
    }
  }
}

/**
 * Run value-level assertions declared under test.assert.
 */
function runAssertions(test: GoldenSchemaTest): void {
  if (!test.assert) return;
  const inputText = test.input ?? test.schema ?? '';
  const schema = Odin.parseSchema(inputText);

  if (test.assert.fields) {
    for (const [fieldPath, a] of Object.entries(test.assert.fields)) {
      assertField(schema.fields.get(fieldPath), a, `field '${fieldPath}'`);
    }
  }

  if (test.assert.types) {
    for (const [typeName, ta] of Object.entries(test.assert.types)) {
      const type = schema.types.get(typeName);
      expect(type, `type '${typeName}' should be defined`).toBeDefined();
      if (ta.fields) {
        for (const [fieldKey, a] of Object.entries(ta.fields)) {
          assertField(type!.fields.get(fieldKey), a, `type '${typeName}' field '${fieldKey}'`);
        }
      }
    }
  }
}

const schemaDir = path.join(goldenDir, 'schema');
const schemaSuites = loadGoldenTests(schemaDir);

describe('Golden Schema Tests', () => {
  for (const suite of schemaSuites) {
    describe(suite.description || suite.suite, () => {
      for (const test of suite.tests) {
        it(test.description || test.id, () => {
          runSchemaTest(test);
          runAssertions(test);
        });
      }
    });
  }
});
