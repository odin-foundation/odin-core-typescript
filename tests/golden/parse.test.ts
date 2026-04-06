/**
 * Golden tests for ODIN parsing.
 *
 * Runs all tests from the shared golden test suite.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Odin, ParseError } from '../../src/index.js';
import type { OdinValue } from '../../src/index.js';

// Path to golden test files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenDir = path.resolve(__dirname, '../../../golden');

interface ExpectedDirective {
  type: 'import' | 'schema' | 'if';
  path?: string;
  alias?: string | null;
  url?: string;
  condition?: string;
}

interface GoldenTest {
  id: string;
  description: string;
  input: string;
  expected?: {
    metadata?: Record<string, ExpectedValue>;
    assignments?: Record<string, ExpectedValue>;
    modifiers?: Record<string, { critical?: boolean; redacted?: boolean; deprecated?: boolean }>;
    directives?: ExpectedDirective[];
  };
  expectError?: {
    code: string;
    message?: string;
    line?: number;
    column?: number;
  };
}

interface ExpectedValue {
  type: string;
  kind?: string;
  value?: unknown;
  raw?: string;
  path?: string;
  base64?: string;
  algorithm?: string;
  decimalPlaces?: number;
}

interface GoldenSuite {
  $schema: string;
  suite: string;
  description: string;
  tests: GoldenTest[];
}

/**
 * Load all golden test files from a directory.
 */
function loadGoldenTests(dir: string): GoldenSuite[] {
  const suites: GoldenSuite[] = [];

  if (!fs.existsSync(dir)) {
    return suites;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      suites.push(...loadGoldenTests(fullPath));
    } else if (entry.name.endsWith('.json')) {
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

/**
 * Compare an OdinValue to expected value structure.
 */
function compareValue(actual: OdinValue | undefined, expected: ExpectedValue): boolean {
  if (!actual) return false;
  if (actual.type !== expected.type) return false;

  switch (actual.type) {
    case 'null':
      return true;

    case 'boolean':
      return actual.value === expected.value;

    case 'string':
      return actual.value === expected.value;

    case 'number':
    case 'integer':
      // Check raw field if expected (for high-precision round-trip)
      if (expected.raw !== undefined) {
        const actualWithRaw = actual as { raw?: string };
        if (actualWithRaw.raw !== expected.raw) {
          return false;
        }
        return true;
      }
      if (actual.value !== expected.value) return false;
      if (expected.decimalPlaces !== undefined) {
        const actualWithDecimals = actual as { decimalPlaces?: number };
        if (actualWithDecimals.decimalPlaces !== expected.decimalPlaces) {
          return false;
        }
      }
      return true;

    case 'currency':
      // Check raw field if expected (for high-precision round-trip)
      if (expected.raw !== undefined) {
        if (actual.raw !== expected.raw) {
          return false;
        }
        return true;
      }
      if (actual.value !== expected.value) return false;
      if (expected.decimalPlaces !== undefined && actual.decimalPlaces !== expected.decimalPlaces) {
        return false;
      }
      // Check currency code if expected
      if (expected.currencyCode !== undefined) {
        const currencyActual = actual as { currencyCode?: string };
        if (currencyActual.currencyCode !== expected.currencyCode) {
          return false;
        }
      }
      return true;

    case 'percent':
      // Check raw field if expected (for high-precision round-trip)
      if (expected.raw !== undefined) {
        if (actual.raw !== expected.raw) {
          return false;
        }
        return true;
      }
      if (actual.value !== expected.value) return false;
      return true;

    case 'date':
    case 'timestamp':
      // Compare the raw string if available
      if (expected.raw) {
        if ('raw' in actual) {
          return actual.raw === expected.raw;
        }
      }
      return true;

    case 'time':
    case 'duration':
      return actual.value === expected.value;

    case 'reference':
      return actual.path === expected.path;

    case 'binary':
      if (expected.algorithm && actual.algorithm !== expected.algorithm) return false;
      // Compare base64 representation
      if (expected.base64) {
        const actualBase64 = btoa(String.fromCharCode(...actual.data));
        return actualBase64 === expected.base64;
      }
      return true;

    case 'verb':
      // Verb type check only — golden tests just verify the type is 'verb'
      return true;

    default:
      return false;
  }
}

// Load all parse tests
const parseDir = path.join(goldenDir, 'parse');
const parseSuites = loadGoldenTests(parseDir);

describe('Golden Parse Tests', () => {
  for (const suite of parseSuites) {
    describe(suite.description || suite.suite, () => {
      for (const test of suite.tests) {
        it(test.description || test.id, () => {
          if (test.expectError) {
            // Should throw an error
            expect(() => Odin.parse(test.input)).toThrow();

            try {
              Odin.parse(test.input);
            } catch (error) {
              if (error instanceof ParseError) {
                expect(error.code).toBe(test.expectError.code);
                if (test.expectError.line !== undefined) {
                  expect(error.line).toBe(test.expectError.line);
                }
                if (test.expectError.column !== undefined) {
                  expect(error.column).toBe(test.expectError.column);
                }
              }
            }
          } else if (test.expected) {
            // Should parse successfully
            const doc = Odin.parse(test.input);

            // Check assignments
            if (test.expected.assignments) {
              for (const [path, expectedValue] of Object.entries(test.expected.assignments)) {
                const actual = doc.get(path);
                expect(actual).toBeDefined();
                expect(compareValue(actual, expectedValue)).toBe(true);
              }
            }

            // Check metadata
            if (test.expected.metadata) {
              for (const [key, expectedValue] of Object.entries(test.expected.metadata)) {
                const actual = doc.get(`$.${key}`);
                expect(actual).toBeDefined();
                expect(compareValue(actual, expectedValue)).toBe(true);
              }
            }

            // Check modifiers
            if (test.expected.modifiers) {
              for (const [path, expectedMods] of Object.entries(test.expected.modifiers)) {
                const mods = doc.modifiers.get(path);
                if (expectedMods.required) {
                  expect(mods?.required).toBe(true);
                }
                if (expectedMods.confidential) {
                  expect(mods?.confidential).toBe(true);
                }
                if (expectedMods.deprecated) {
                  expect(mods?.deprecated).toBe(true);
                }
              }
            }

            // Check directives
            if (test.expected.directives) {
              const allDirectives: ExpectedDirective[] = [];

              // Collect imports as directives
              for (const imp of doc.imports) {
                allDirectives.push({
                  type: 'import',
                  path: imp.path,
                  alias: imp.alias ?? null,
                });
              }

              // Collect schemas as directives
              for (const schema of doc.schemas) {
                allDirectives.push({
                  type: 'schema',
                  url: schema.url,
                });
              }

              // Collect conditionals as directives
              for (const cond of doc.conditionals) {
                allDirectives.push({
                  type: 'if',
                  condition: cond.condition,
                });
              }

              expect(allDirectives.length).toBe(test.expected.directives.length);

              for (let i = 0; i < test.expected.directives.length; i++) {
                const expected = test.expected.directives[i]!;
                const actual = allDirectives[i]!;

                expect(actual.type).toBe(expected.type);

                if (expected.type === 'import') {
                  expect(actual.path).toBe(expected.path);
                  expect(actual.alias).toBe(expected.alias);
                } else if (expected.type === 'schema') {
                  expect(actual.url).toBe(expected.url);
                } else if (expected.type === 'if') {
                  expect(actual.condition).toBe(expected.condition);
                }
              }
            }
          }
        });
      }
    });
  }
});
