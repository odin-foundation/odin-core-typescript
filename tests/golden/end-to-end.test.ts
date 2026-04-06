/**
 * End-to-End Golden Tests
 *
 * Tests format transformations through ODIN as the canonical data model.
 * Reads test definitions from manifest.json files in sdk/golden/end-to-end/
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Odin } from '../../src/index.js';
import { parseTransform, executeTransform } from '../../src/transform/index.js';
import { parseSource } from '../../src/transform/source-parsers.js';

// Path to golden test files
const GOLDEN_DIR = path.resolve(__dirname, '../../../golden/end-to-end');

interface TestDefinition {
  id: string;
  description: string;
  direction?: string;
  input: string;
  transform?: string;
  expected: string;
  importTransform?: string;
  exportTransform?: string;
  intermediate?: string; // Expected intermediate ODIN representation
  method?: string;
  options?: Record<string, unknown>;
  notes?: string;
}

interface CategoryManifest {
  category: string;
  name: string;
  description: string;
  tests: TestDefinition[];
}

interface MainManifest {
  suite: string;
  version: string;
  description: string;
  categories: Array<{
    id: string;
    name: string;
    description: string;
    path: string;
  }>;
}

/**
 * Read and parse a file, normalizing line endings
 */
function readFile(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Normalize line endings to \n
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Check if golden tests exist
 */
function goldenTestsExist(): boolean {
  const mainManifestPath = path.join(GOLDEN_DIR, 'manifest.json');
  return fs.existsSync(mainManifestPath);
}

/**
 * Load the main manifest
 */
function loadMainManifest(): MainManifest {
  const manifestPath = path.join(GOLDEN_DIR, 'manifest.json');
  return JSON.parse(readFile(manifestPath));
}

/**
 * Load a category manifest
 */
function loadCategoryManifest(categoryPath: string): CategoryManifest {
  const manifestPath = path.join(GOLDEN_DIR, categoryPath, 'manifest.json');
  return JSON.parse(readFile(manifestPath));
}

/**
 * Determine source format from direction string
 */
function getSourceFormat(direction: string): string {
  const match = direction.match(/^(\w+(?:-\w+)?)->/);
  return match ? match[1] : 'odin';
}

/**
 * Parse input data based on source format
 */
function parseInput(input: string, format: string): unknown {
  switch (format) {
    case 'json':
      return JSON.parse(input);
    case 'odin':
      return Odin.parse(input).toJSON();
    default:
      // Use parseSource for XML, CSV, flat, fixed-width, etc.
      return parseSource(input, format).data;
  }
}

/**
 * Run import/export tests (single transform)
 */
function runTransformTest(test: TestDefinition, categoryPath: string): void {
  const testDir = path.join(GOLDEN_DIR, categoryPath);

  // Read input file
  const inputPath = path.join(testDir, test.input);
  const inputRaw = readFile(inputPath);

  // Read transform file
  const transformPath = path.join(testDir, test.transform!);
  const transformText = readFile(transformPath);

  // Read expected output
  const expectedPath = path.join(testDir, test.expected);
  const expected = readFile(expectedPath);

  // Parse and execute transform
  const transform = parseTransform(transformText);
  const sourceFormat = getSourceFormat(test.direction || 'odin->odin');

  // For multi-record formats with discriminators, pass raw input so the engine can split by line
  // The engine handles the discriminator-based routing internally
  const hasDiscriminator = transform.source?.discriminator !== undefined;
  const isLineBasedFormat = ['csv', 'delimited', 'fixed-width', 'flat'].includes(sourceFormat);

  let input: unknown;
  if (hasDiscriminator && isLineBasedFormat) {
    // Pass raw string for multi-record processing
    input = inputRaw;
  } else {
    // Parse input based on source format
    input = parseInput(inputRaw, sourceFormat);
  }

  const result = executeTransform(transform, input);

  expect(result.success).toBe(true);

  // Compare formatted output
  // Normalize whitespace for comparison
  const normalizedExpected = expected.trim();
  const normalizedActual = (result.formatted || '').trim();

  expect(normalizedActual).toBe(normalizedExpected);
}

/**
 * Run roundtrip tests (import + export)
 */
function runRoundtripTest(test: TestDefinition, categoryPath: string): void {
  const testDir = path.join(GOLDEN_DIR, categoryPath);

  // Read input file
  const inputPath = path.join(testDir, test.input);
  const input = readFile(inputPath);

  // Read import transform
  const importTransformPath = path.join(testDir, test.importTransform!);
  const importTransformText = readFile(importTransformPath);

  // Read export transform
  const exportTransformPath = path.join(testDir, test.exportTransform!);
  const exportTransformText = readFile(exportTransformPath);

  // Read expected output
  const expectedPath = path.join(testDir, test.expected);
  const expected = readFile(expectedPath);

  // Step 1: Import (format -> ODIN)
  const importTransform = parseTransform(importTransformText);
  const importDirection = test.direction?.split('->')[0] || 'fixed-width';

  const importResult = executeTransform(importTransform, input, {
    sourceFormat: importDirection,
  });

  expect(importResult.success).toBe(true);

  // Check intermediate ODIN representation if specified
  if (test.intermediate) {
    const intermediatePath = path.join(testDir, test.intermediate);
    const expectedIntermediate = readFile(intermediatePath);
    const normalize = (s: string) => s.replace(/\r\n/g, '\n').trim();

    // The import result should have formatted ODIN output
    expect(importResult.formatted).toBeDefined();
    expect(normalize(importResult.formatted || '')).toBe(normalize(expectedIntermediate));
  }

  // Step 2: Export (ODIN -> format)
  const exportTransform = parseTransform(exportTransformText);

  const exportResult = executeTransform(exportTransform, importResult.output, {
    sourceFormat: 'object', // Already parsed
  });

  expect(exportResult.success).toBe(true);

  // Normalize line endings (CRLF -> LF) and trim overall whitespace
  const normalize = (s: string) => s.replace(/\r\n/g, '\n').trim();
  const normalizedExpected = normalize(expected);
  const normalizedActual = normalize(exportResult.formatted || '');

  expect(normalizedActual).toBe(normalizedExpected);
}

/**
 * Run ODIN direct export tests (toJSON, toXML)
 */
function runDirectExportTest(test: TestDefinition, categoryPath: string): void {
  const testDir = path.join(GOLDEN_DIR, categoryPath);

  // Read input ODIN file
  const inputPath = path.join(testDir, test.input);
  const input = readFile(inputPath);

  // Read expected output
  const expectedPath = path.join(testDir, test.expected);
  const expected = readFile(expectedPath);

  // Parse ODIN document
  const doc = Odin.parse(input);

  let result: string;

  if (test.method === 'toJSON') {
    const jsonResult = doc.toJSON(
      test.options as { preserveTypes?: boolean; preserveModifiers?: boolean }
    );
    result = JSON.stringify(jsonResult, null, 2);
  } else if (test.method === 'toXML') {
    const xmlOptions = test.options as { preserveTypes?: boolean; preserveModifiers?: boolean };
    result = Odin.toXML(doc, {
      includeOdinAttributes: xmlOptions?.preserveTypes || xmlOptions?.preserveModifiers,
    });
  } else {
    throw new Error(`Unknown method: ${test.method}`);
  }

  // Compare
  const normalizedExpected = expected.trim();
  const normalizedActual = result.trim();

  expect(normalizedActual).toBe(normalizedExpected);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('End-to-End Golden Tests', () => {
  // Skip if golden tests don't exist yet
  if (!goldenTestsExist()) {
    it.skip('Golden tests not found', () => {});
    return;
  }

  const mainManifest = loadMainManifest();

  describe(`${mainManifest.suite} v${mainManifest.version}`, () => {
    for (const category of mainManifest.categories) {
      const categoryManifestPath = path.join(GOLDEN_DIR, category.path, 'manifest.json');

      // Skip if category manifest doesn't exist
      if (!fs.existsSync(categoryManifestPath)) {
        describe.skip(category.name, () => {
          it.skip('Category manifest not found', () => {});
        });
        continue;
      }

      const categoryManifest = loadCategoryManifest(category.path);

      // Skip categories with no tests
      if (categoryManifest.tests.length === 0) {
        describe.skip(category.name, () => {
          it.skip('No tests defined', () => {});
        });
        continue;
      }

      describe(category.name, () => {
        for (const test of categoryManifest.tests) {
          it(test.description, () => {
            if (category.id === 'roundtrip') {
              runRoundtripTest(test, category.path);
            } else if (category.id === 'odin-export') {
              runDirectExportTest(test, category.path);
            } else {
              runTransformTest(test, category.path);
            }
          });
        }
      });
    }
  });
});
