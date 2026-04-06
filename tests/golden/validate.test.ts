/**
 * Golden tests for ODIN schema validation.
 *
 * Runs all tests from the shared golden test suite for validation rules (V001-V013)
 * and format validators (email, URL, UUID, etc.).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Odin } from '../../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenDir = path.resolve(__dirname, '../../../golden');

interface ExpectedValidationError {
  code?: string;
  path?: string;
  message?: string;
}

interface GoldenValidateTest {
  id: string;
  description: string;
  input?: string;
  schema?: string;
  schemaFile?: string;
  options?: { strict?: boolean };
  expected?: {
    valid?: boolean;
    errors?: ExpectedValidationError[];
    error?: string;
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
  tests: GoldenValidateTest[];
}

function loadGoldenTests(dir: string): { suite: GoldenSuite; filePath: string }[] {
  const suites: { suite: GoldenSuite; filePath: string }[] = [];

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
          suites.push({ suite, filePath: fullPath });
        }
      } catch {
        // Skip invalid files
      }
    }
  }

  return suites;
}

function runValidateTest(test: GoldenValidateTest, filePath: string) {
  const inputText = test.input ?? '';
  const doc = inputText === '' ? Odin.empty() : Odin.parse(inputText);

  let schemaText: string;
  if (test.schemaFile) {
    const schemaPath = path.join(path.dirname(filePath), test.schemaFile);
    schemaText = fs.readFileSync(schemaPath, 'utf-8');
  } else if (test.schema) {
    schemaText = test.schema;
  } else {
    throw new Error(`[${test.id}] No schema or schemaFile`);
  }

  const schema = Odin.parseSchema(schemaText);
  const options = test.options?.strict ? { strict: true } : undefined;
  const result = Odin.validate(doc, schema, options);

  if (test.expected) {
    if (test.expected.valid !== undefined) {
      expect(result.valid).toBe(test.expected.valid);
    }

    if (test.expected.errors) {
      for (const expectedError of test.expected.errors) {
        if (expectedError.code) {
          expect(
            result.errors.some((e) => e.code === expectedError.code)
          ).toBe(true);
        }
        if (expectedError.path) {
          expect(
            result.errors.some((e) => e.path === expectedError.path)
          ).toBe(true);
        }
      }
    }
  }

  if (test.expectError) {
    expect(result.valid).toBe(false);
    if (test.expectError.code) {
      expect(
        result.errors.some((e) => e.code === test.expectError!.code)
      ).toBe(true);
    }
  }
}

const validateDir = path.join(goldenDir, 'validate');
const validateSuites = loadGoldenTests(validateDir);

describe('Golden Validate Tests', () => {
  for (const { suite, filePath } of validateSuites) {
    describe(suite.description || suite.suite, () => {
      for (const test of suite.tests) {
        it(test.description || test.id, () => {
          runValidateTest(test, filePath);
        });
      }
    });
  }
});
