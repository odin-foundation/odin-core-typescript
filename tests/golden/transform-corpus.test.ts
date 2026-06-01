/**
 * Golden tests for the verified transform example corpus.
 *
 * Each fixture under sdk/golden/transform-corpus/<family>/<id>.json stores a
 * mapping block (transform), an ODIN source (input), and the exact engine-produced
 * ODIN (expectedOutput). The standard odin->odin header is prepended here, the
 * transform is executed, and result.formatted is compared to expectedOutput.
 *
 * The `avoid` entries are teaching metadata and are not executed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Odin, parseTransform, executeTransform } from '../../src/index.js';
import { CORPUS_DIR, headerFor, loadFixtures } from './transform-corpus-shared.js';

const fixtures = loadFixtures(CORPUS_DIR);

describe('Golden: Transform Corpus', () => {
  for (const { fixture, file } of fixtures) {
    it(`${fixture.family}/${fixture.id}`, () => {
      const transformText = headerFor(fixture) + fixture.transform;
      const transform = parseTransform(transformText);

      const source = Odin.parse(fixture.input).toJSON();
      const result = executeTransform(transform, source);

      expect(result.errors || [], `errors in ${file}`).toHaveLength(0);

      const actual = (result.formatted || '').replace(/\r\n/g, '\n').trimEnd();
      const expected = fixture.expectedOutput.replace(/\r\n/g, '\n').trimEnd();
      expect(actual).toBe(expected);
    });
  }
});

// Sanity: manifest and on-disk fixtures agree.
describe('Golden: Transform Corpus manifest', () => {
  it('lists every fixture file', () => {
    const manifest = JSON.parse(readFileSync(join(CORPUS_DIR, 'manifest.json'), 'utf8'));
    const declared = [...manifest.fixtures, ...manifest.idioms].map((f: { id: string }) => f.id).sort();
    const found = fixtures.map((f) => f.fixture.id).sort();
    expect(found).toEqual(declared);
  });
});
