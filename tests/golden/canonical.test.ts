/**
 * Golden tests for ODIN canonicalization.
 *
 * Runs all tests from the shared golden test suite for canonical form.
 * Supports two expected formats:
 *   - string: compare decoded canonical text
 *   - object { hex, sha256, byteLength }: compare raw binary output
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Odin } from '../../src/index.js';

// Path to golden test files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenDir = path.resolve(__dirname, '../../../golden');

interface BinaryExpected {
  hex: string;
  sha256: string;
  byteLength: number;
}

interface GoldenCanonicalTest {
  id: string;
  description: string;
  input: string;
  expected: string | BinaryExpected;
}

interface GoldenSuite {
  $schema: string;
  suite: string;
  description: string;
  tests: GoldenCanonicalTest[];
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

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Load all canonical tests
const canonicalDir = path.join(goldenDir, 'canonical');
const canonicalSuites = loadGoldenTests(canonicalDir);

describe('Golden Canonical Tests', () => {
  for (const suite of canonicalSuites) {
    describe(suite.description || suite.suite, () => {
      for (const test of suite.tests) {
        it(test.description || test.id, () => {
          const doc =
            test.input === '' ? Odin.empty() : Odin.parse(test.input);
          const canonical = Odin.canonicalize(doc);

          if (typeof test.expected === 'string') {
            // Text comparison (existing all-types.json format)
            const canonicalStr = new TextDecoder().decode(canonical);
            expect(canonicalStr).toBe(test.expected);
          } else {
            // Binary comparison (binary-output.json format)
            const expected = test.expected as BinaryExpected;

            expect(canonical.byteLength).toBe(expected.byteLength);
            expect(toHex(canonical)).toBe(expected.hex);

            const sha256 = createHash('sha256').update(canonical).digest('hex');
            expect(sha256).toBe(expected.sha256);
          }
        });
      }
    });
  }
});
