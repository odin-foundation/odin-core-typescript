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

interface GoldenSchemaTest {
  id: string;
  description: string;
  input?: string;
  schema?: string;
  expected?: Record<string, unknown>;
  /** When true, assert the parsed structure (types, type fields, root fields) against expected. */
  structural?: boolean;
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

const schemaDir = path.join(goldenDir, 'schema');
const schemaSuites = loadGoldenTests(schemaDir);

describe('Golden Schema Tests', () => {
  for (const suite of schemaSuites) {
    describe(suite.description || suite.suite, () => {
      for (const test of suite.tests) {
        it(test.description || test.id, () => {
          runSchemaTest(test);
        });
      }
    });
  }
});
