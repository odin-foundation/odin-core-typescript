/**
 * Golden tests for website "Try It" verb examples.
 *
 * Each test reads a triplet:
 *   {verb}.input.json  — JSON source data
 *   {verb}.transform.odin — Transform definition
 *   {verb}.expected.odin — Expected ODIN output
 *
 * Then executes the transform and compares the actual ODIN output
 * to the expected output.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseTransform, executeTransform } from '../../src/index.js';

const TRYIT_DIR = join(__dirname, '..', '..', '..', 'golden', 'transform', 'verbs', 'try-it');

// Discover all verb tests by finding *.expected.odin files
const expectedFiles = readdirSync(TRYIT_DIR).filter(f => f.endsWith('.expected.odin'));
const verbNames = expectedFiles.map(f => f.replace('.expected.odin', '')).sort();

describe('Golden: Try It Verb Examples', () => {
  for (const verb of verbNames) {
    it(`${verb}`, () => {
      const inputJson = readFileSync(join(TRYIT_DIR, `${verb}.input.json`), 'utf8');
      const transformText = readFileSync(join(TRYIT_DIR, `${verb}.transform.odin`), 'utf8');
      const expectedOdin = readFileSync(join(TRYIT_DIR, `${verb}.expected.odin`), 'utf8').replace(/\r\n/g, '\n').trim();

      const sourceData = JSON.parse(inputJson);
      const transform = parseTransform(transformText);
      if (transform.target) {
        transform.target.format = 'odin';
      }

      const result = executeTransform(transform, sourceData);

      expect(result.errors || []).toHaveLength(0);
      const actualOdin = (result.formatted || '').trim();
      expect(actualOdin).toBe(expectedOdin);
    });
  }
});
