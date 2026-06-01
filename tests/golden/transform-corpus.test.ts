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
      const source = Odin.parse(fixture.input).toJSON();

      // Error fixtures: assert the declared T-code surfaces (thrown, or in
      // result.errors/warnings). Fixtures marked enforced:false are documented
      // gaps the engine does not yet emit — rendered in the catalog, not asserted.
      if (fixture.family === 'error') {
        if (fixture.enforced === false) return;
        const code = fixture.code!;
        const fmt = (xs?: Array<{ code?: string; message?: string }>) =>
          (xs || []).map((e) => `${e.code} ${e.message}`).join('\n');
        let surfaced = '';
        try {
          const result = executeTransform(parseTransform(transformText), source);
          surfaced = fmt(result.errors as never) + '\n' + fmt((result as { warnings?: never }).warnings);
        } catch (e) {
          const err = e as { message?: string; code?: string };
          surfaced = `${err.code ?? ''} ${err.message ?? ''}`;
        }
        expect(surfaced, `${code} not surfaced in ${file}`).toContain(code);
        return;
      }

      const result = executeTransform(parseTransform(transformText), source);
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
    const declared = [...manifest.fixtures, ...manifest.idioms, ...(manifest.errors || [])]
      .map((f: { id: string }) => f.id)
      .sort();
    const found = fixtures.map((f) => f.fixture.id).sort();
    expect(found).toEqual(declared);
  });
});
