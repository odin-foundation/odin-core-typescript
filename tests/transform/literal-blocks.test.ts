/**
 * Tests for `:literal` segment blocks with `${...}` interpolation.
 *
 * A segment carrying `:literal` emits its `"""..."""` body as text. Inside the
 * body `${@path}`, `${@.field}`, `${%verb ...}`, and `${@$accumulator.name}`
 * interpolate; `\${`, `\$`, and `\\` escape. Nesting is rejected (T014).
 */

import { describe, it, expect } from 'vitest';
import { parseTransform } from '../../src/index.js';
import { executeTransform } from '../../src/transform/engine.js';

const header = `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "odin->fixed-width"
target.format = "fixed-width"
`;

function run(body: string, source: unknown) {
  const transform = parseTransform(`${header}\n${body}`);
  return executeTransform(transform, source);
}

describe('Literal block transforms', () => {
  describe('parsing', () => {
    it('captures the literal body and the literal directive on the segment', () => {
      const transform = parseTransform(
        `${header}\n{HDR}\n:literal\n"""\nHDR|\${@policy.number}\n"""\n`
      );
      const seg = transform.segments[0]!;
      expect(seg.directives.some((d) => d.type === 'literal')).toBe(true);
      const bodyDir = seg.directives.find((d) => d.type === 'literalBody');
      expect(bodyDir?.value).toBe('\nHDR|${@policy.number}\n');
    });
  });

  describe('happy path', () => {
    it('interpolates a source path and a verb result on one line', () => {
      const r = run('{HDR}\n:literal\n"""\nHDR|${@policy.number}|${%upper @policy.code}\n"""\n', {
        policy: { number: 'P-100', code: 'abc' },
      });
      expect(r.success).toBe(true);
      expect(r.formatted).toBe('HDR|P-100|ABC');
    });

    it('emits one line per item under a :loop using ${@.field}', () => {
      const r = run('{DET[]}\n:loop @items\n:literal\n"""\nDET|${@.sku}|${@.qty}\n"""\n', {
        items: [
          { sku: 'A1', qty: '2' },
          { sku: 'B2', qty: '5' },
        ],
      });
      expect(r.success).toBe(true);
      expect(r.formatted).toBe('DET|A1|2\nDET|B2|5');
    });

    it('resolves ${@$accumulator.name}', () => {
      const body = `{$accumulator}
total = ##0
total._persist = true

{items[]}
_loop = "@items"
_ = %accumulate total @.amount

{TRL}
:literal
"""
TRL|\${@$accumulator.total}
"""
`;
      const transform = parseTransform(`${header}\n${body}`);
      const r = executeTransform(transform, { items: [{ amount: 10 }, { amount: 32 }] });
      expect(r.success).toBe(true);
      expect((r.formatted ?? '').trim().endsWith('TRL|42')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('honors the escape rules \\${, \\$, and \\\\', () => {
      const r = run('{X}\n:literal\n"""\nlit:\\${@a} dollar:\\$ slash:\\\\ real:${@a}\n"""\n', {
        a: 'V',
      });
      expect(r.success).toBe(true);
      expect(r.formatted).toBe('lit:${@a} dollar:$ slash:\\ real:V');
    });

    it('emits an interpolation-free literal verbatim', () => {
      const r = run('{X}\n:literal\n"""\nJUST TEXT NO INTERP\n"""\n', {});
      expect(r.success).toBe(true);
      expect(r.formatted).toBe('JUST TEXT NO INTERP');
    });

    it('emits a multi-line block as multiple output lines', () => {
      const r = run('{X}\n:literal\n"""\nLINE1 ${@a}\nLINE2\nLINE3 ${@b}\n"""\n', {
        a: '1',
        b: '3',
      });
      expect(r.success).toBe(true);
      expect(r.formatted).toBe('LINE1 1\nLINE2\nLINE3 3');
    });

    it('strips only the delimiter newlines, preserving interior blank lines', () => {
      const r = run('{X}\n:literal\n"""\nA\n\nB\n"""\n', {});
      expect(r.success).toBe(true);
      expect(r.formatted).toBe('A\n\nB');
    });
  });

  describe('errors', () => {
    it('rejects nested interpolation with T014', () => {
      const r = run('{X}\n:literal\n"""\n${@a.${@b}}\n"""\n', { a: { b: 'x' }, b: 'k' });
      expect(r.success).toBe(false);
      expect(r.errors.some((e) => e.code === 'T014')).toBe(true);
    });

    it('reports an unknown verb inside ${%...} as a transform error', () => {
      const r = run('{X}\n:literal\n"""\n${%nope @a}\n"""\n', { a: 'z' });
      expect(r.success).toBe(false);
      expect(r.errors.some((e) => /Unknown verb/.test(e.message))).toBe(true);
    });
  });
});
