/**
 * Golden tests for ODIN diff operations.
 *
 * Runs all tests from the shared golden test suite for diff.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Odin } from '../../src/index.js';

// Path to golden test files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenDir = path.resolve(__dirname, '../../../golden');

interface ExpectedDiff {
  isEmpty: boolean;
  additions?: { path: string }[];
  deletions?: { path: string }[];
  modifications?: { path: string }[];
  moves?: { fromPath: string; toPath: string }[];
}

interface GoldenDiffTest {
  id: string;
  description: string;
  doc1: string;
  doc2: string;
  expected: ExpectedDiff;
}

interface GoldenSuite {
  $schema: string;
  suite: string;
  description: string;
  tests: GoldenDiffTest[];
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

// Load all diff tests
const diffDir = path.join(goldenDir, 'diff');
const diffSuites = loadGoldenTests(diffDir);

describe('Golden Diff Tests', () => {
  for (const suite of diffSuites) {
    describe(suite.description || suite.suite, () => {
      for (const test of suite.tests) {
        it(test.description || test.id, () => {
          const doc1 = Odin.parse(test.doc1);
          const doc2 = Odin.parse(test.doc2);

          const diff = Odin.diff(doc1, doc2);

          // Check isEmpty
          expect(diff.isEmpty).toBe(test.expected.isEmpty);

          // Check additions
          if (test.expected.additions) {
            expect(diff.additions).toHaveLength(test.expected.additions.length);
            for (const expectedAdd of test.expected.additions) {
              expect(diff.additions.some((a) => a.path === expectedAdd.path)).toBe(true);
            }
          }

          // Check deletions
          if (test.expected.deletions) {
            expect(diff.deletions).toHaveLength(test.expected.deletions.length);
            for (const expectedDel of test.expected.deletions) {
              expect(diff.deletions.some((d) => d.path === expectedDel.path)).toBe(true);
            }
          }

          // Check modifications
          if (test.expected.modifications) {
            expect(diff.modifications).toHaveLength(test.expected.modifications.length);
            for (const expectedMod of test.expected.modifications) {
              expect(diff.modifications.some((m) => m.path === expectedMod.path)).toBe(true);
            }
          }

          // Check moves
          if (test.expected.moves) {
            expect(diff.moves).toHaveLength(test.expected.moves.length);
            for (const expectedMove of test.expected.moves) {
              expect(
                diff.moves.some(
                  (m) => m.fromPath === expectedMove.fromPath && m.toPath === expectedMove.toPath
                )
              ).toBe(true);
            }
          }
        });
      }
    });
  }
});
