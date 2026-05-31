/**
 * Tests for nested :loop directives in transform segments.
 *
 * A segment may declare multiple `:loop path :as alias` lines to iterate a
 * cross-product. Each alias binds to the current item at its level; relative
 * inner paths (`.field`) resolve against the current outer item.
 */

import { describe, it, expect } from 'vitest';
import { parseTransform } from '../../src/index.js';
import { executeTransform } from '../../src/transform/engine.js';
import { extractValues } from './helpers.js';

const header = `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
target.format = "json"
`;

function run(transformText: string, source: unknown) {
  const transform = parseTransform(`${header}\n${transformText}`);
  return executeTransform(transform, source);
}

describe('Nested loops', () => {
  describe('parser', () => {
    it('preserves all :loop directives in order with aliases', () => {
      const transform = parseTransform(
        `${header}
{rows[]}
:loop vehicles :as veh
:loop .coverages :as cov
vin = "@veh.vin"
code = "@cov.code"
`
      );
      const loops = transform.segments[0]!.directives.filter((d) => d.type === 'loop');
      expect(loops).toHaveLength(2);
      expect(loops[0]).toMatchObject({ value: 'vehicles', alias: 'veh' });
      expect(loops[1]).toMatchObject({ value: '.coverages', alias: 'cov' });
    });

    it('preserves three :loop directives in order', () => {
      const transform = parseTransform(
        `${header}
{rows[]}
:loop a :as x
:loop .bs :as y
:loop .cs :as z
v = "@z.v"
`
      );
      const loops = transform.segments[0]!.directives.filter((d) => d.type === 'loop');
      expect(loops.map((l) => l.value)).toEqual(['a', '.bs', '.cs']);
      expect(loops.map((l) => l.alias)).toEqual(['x', 'y', 'z']);
    });
  });

  describe('happy path', () => {
    it('iterates a two-level cross-product', () => {
      const result = run(
        `{rows[]}
:loop vehicles :as veh
:loop .coverages :as cov
vin = "@veh.vin"
code = "@cov.code"
`,
        {
          vehicles: [
            { vin: 'V1', coverages: [{ code: 'A' }, { code: 'B' }] },
            { vin: 'V2', coverages: [{ code: 'C' }] },
          ],
        }
      );

      expect(result.success).toBe(true);
      const rows = extractValues(result.output).rows as unknown[];
      expect(rows).toEqual([
        { vin: 'V1', code: 'A' },
        { vin: 'V1', code: 'B' },
        { vin: 'V2', code: 'C' },
      ]);
    });

    it('iterates a three-level cross-product with the exact count', () => {
      const result = run(
        `{rows[]}
:loop a :as x
:loop .bs :as y
:loop .cs :as z
av = "@x.v"
bv = "@y.v"
cv = "@z.v"
`,
        {
          a: [
            { v: 'A1', bs: [{ v: 'B1', cs: [{ v: 'C1' }, { v: 'C2' }] }] },
            {
              v: 'A2',
              bs: [
                { v: 'B2', cs: [{ v: 'C3' }] },
                { v: 'B3', cs: [{ v: 'C4' }] },
              ],
            },
          ],
        }
      );

      expect(result.success).toBe(true);
      const rows = extractValues(result.output).rows as unknown[];
      expect(rows).toHaveLength(4);
      expect(rows).toEqual([
        { av: 'A1', bv: 'B1', cv: 'C1' },
        { av: 'A1', bv: 'B1', cv: 'C2' },
        { av: 'A2', bv: 'B2', cv: 'C3' },
        { av: 'A2', bv: 'B3', cv: 'C4' },
      ]);
    });
  });

  describe('edge cases', () => {
    it('produces no rows for an outer item whose inner array is empty', () => {
      const result = run(
        `{rows[]}
:loop vehicles :as veh
:loop .coverages :as cov
vin = "@veh.vin"
code = "@cov.code"
`,
        {
          vehicles: [
            { vin: 'V1', coverages: [{ code: 'A' }] },
            { vin: 'V2', coverages: [] },
            { vin: 'V3', coverages: [{ code: 'C' }] },
          ],
        }
      );

      expect(result.success).toBe(true);
      const rows = extractValues(result.output).rows as unknown[];
      expect(rows).toEqual([
        { vin: 'V1', code: 'A' },
        { vin: 'V3', code: 'C' },
      ]);
    });

    it('handles an inner array with a single item', () => {
      const result = run(
        `{rows[]}
:loop vehicles :as veh
:loop .coverages :as cov
vin = "@veh.vin"
code = "@cov.code"
`,
        { vehicles: [{ vin: 'V1', coverages: [{ code: 'ONLY' }] }] }
      );

      const rows = extractValues(result.output).rows as unknown[];
      expect(rows).toEqual([{ vin: 'V1', code: 'ONLY' }]);
    });

    it('binds :counter to the innermost loop index, resetting per outer item', () => {
      const result = run(
        `{rows[]}
:loop vehicles :as veh
:loop .coverages :as cov
:counter idx
vin = "@veh.vin"
n = "@idx"
`,
        {
          vehicles: [
            { vin: 'V1', coverages: [{}, {}, {}] },
            { vin: 'V2', coverages: [{}] },
          ],
        }
      );

      const rows = extractValues(result.output).rows as Array<{ vin: string; n: number }>;
      expect(rows.map((r) => [r.vin, r.n])).toEqual([
        ['V1', 0],
        ['V1', 1],
        ['V1', 2],
        ['V2', 0],
      ]);
    });

    it('still handles a single alias-less :loop without regression', () => {
      const result = run(
        `{rows[]}
:loop items
sku = "@.sku"
`,
        { items: [{ sku: 'A' }, { sku: 'B' }] }
      );

      const rows = extractValues(result.output).rows as unknown[];
      expect(rows).toEqual([{ sku: 'A' }, { sku: 'B' }]);
    });
  });

  describe('error / non-array sources', () => {
    it('skips an outer item whose inner loop path is not an array (no rows, no error)', () => {
      const result = run(
        `{rows[]}
:loop vehicles :as veh
:loop .coverages :as cov
vin = "@veh.vin"
code = "@cov.code"
`,
        { vehicles: [{ vin: 'V1', coverages: 'not-an-array' }] }
      );

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      const rows = extractValues(result.output).rows as unknown[];
      expect(rows).toEqual([]);
    });

    it('produces an empty result when the outer loop source is not an array', () => {
      const result = run(
        `{rows[]}
:loop vehicles :as veh
:loop .coverages :as cov
vin = "@veh.vin"
code = "@cov.code"
`,
        { vehicles: 'nope' }
      );

      expect(result.success).toBe(true);
      const rows = extractValues(result.output).rows as unknown[];
      expect(rows).toEqual([]);
    });
  });
});
