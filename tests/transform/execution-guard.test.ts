/**
 * Transform execution guard: fuel budget (T016), wall-clock timeout (T017),
 * and expression-depth enforcement (T018). Guards charge only when their limit
 * is set (> 0); depth uses its standing default. Aborts are not downgraded by
 * onError and surface as a failed TransformResult, never thrown past execute.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseTransform, executeTransform } from '../../src/transform/index.js';
import type { TransformOptions } from '../../src/transform/index.js';
import { SECURITY_LIMITS } from '../../src/utils/security-limits.js';

const HEADER = '{$}\nodin = "1.0.0"\ntransform = "1.0.0"\ndirection = "json->json"\n\n';

function headerWith(onError: string): string {
  return (
    '{$}\nodin = "1.0.0"\ntransform = "1.0.0"\ndirection = "json->json"\n\n' +
    `{$target}\nformat = "json"\nonError = "${onError}"\n\n`
  );
}

function run(
  body: string,
  source: Record<string, unknown> = {},
  head = HEADER,
  opts?: TransformOptions
) {
  return executeTransform(parseTransform(head + body), source, opts);
}

// Chain of n nested unary verbs, evaluated one level per node.
function nestAbs(n: number): string {
  return '{out}\nr = ' + '%abs '.repeat(n) + '##1';
}

const saved = {
  fuel: SECURITY_LIMITS.MAX_TRANSFORM_FUEL,
  timeout: SECURITY_LIMITS.TRANSFORM_TIMEOUT_MS,
  depth: SECURITY_LIMITS.MAX_EXPRESSION_DEPTH,
};

afterEach(() => {
  SECURITY_LIMITS.MAX_TRANSFORM_FUEL = saved.fuel;
  SECURITY_LIMITS.TRANSFORM_TIMEOUT_MS = saved.timeout;
  SECURITY_LIMITS.MAX_EXPRESSION_DEPTH = saved.depth;
  vi.restoreAllMocks();
});

describe('unbounded when unset', () => {
  it('runs a normal transform to completion with all limits off', () => {
    const r = run('{out}\nr = %upper "hi"');
    expect(r.success).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('does not charge fuel when the cap is 0', () => {
    SECURITY_LIMITS.MAX_TRANSFORM_FUEL = 0;
    const big = Array.from({ length: 500 }, (_, i) => 500 - i);
    const r = run('{out}\nr = %sort @big', { big });
    expect(r.success).toBe(true);
  });
});

describe('fuel budget (T016)', () => {
  it('aborts an over-computing transform with a failed result', () => {
    SECURITY_LIMITS.MAX_TRANSFORM_FUEL = 50;
    const big = Array.from({ length: 200 }, (_, i) => 200 - i);
    const r = run('{out}\nr = %sort @big', { big });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T016')).toBe(true);
  });

  it('charges array verbs proportional to width, so a large array cannot escape', () => {
    SECURITY_LIMITS.MAX_TRANSFORM_FUEL = 50;
    const small = run('{out}\nr = %sort @big', { big: [3, 1, 2] });
    expect(small.success).toBe(true);
    const large = run('{out}\nr = %sort @big', {
      big: Array.from({ length: 200 }, (_, i) => 200 - i),
    });
    expect(large.success).toBe(false);
    expect(large.errors.some((e) => e.code === 'T016')).toBe(true);
  });
});

describe('wall-clock timeout (T017)', () => {
  it('aborts when elapsed exceeds the timeout', () => {
    SECURITY_LIMITS.TRANSFORM_TIMEOUT_MS = 100;
    // Each read advances well past the bound, so any read after the engine's
    // start time reports elapsed > timeout regardless of call ordering.
    let clock = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 10_000));
    const big = Array.from({ length: 300 }, (_, i) => 300 - i);
    const r = run('{out}\nr = %sort @big', { big });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T017')).toBe(true);
  });
});

describe('expression depth (T018)', () => {
  it('yields a clean depth error under a low cap', () => {
    SECURITY_LIMITS.MAX_EXPRESSION_DEPTH = 8;
    const r = run(nestAbs(30));
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T018')).toBe(true);
  });

  it('converts deep nesting into a typed error, not a stack overflow', () => {
    // Standing default (32); deep nesting must not throw a RangeError.
    expect(() => run(nestAbs(200))).not.toThrow();
    const r = run(nestAbs(200));
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T018')).toBe(true);
  });
});

describe('non-swallowable abort', () => {
  it('is not downgraded to a warning by onError', () => {
    SECURITY_LIMITS.MAX_TRANSFORM_FUEL = 50;
    const big = Array.from({ length: 200 }, (_, i) => 200 - i);
    const r = run('{out}\nr = %sort @big', { big }, headerWith('warn'));
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T016')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'T016')).toBe(false);
  });
});

describe('per-call overrides', () => {
  const big = () => Array.from({ length: 200 }, (_, i) => 200 - i);

  it('applies a per-call fuel budget when no global limit is set', () => {
    const r = run('{out}\nr = %sort @big', { big: big() }, HEADER, { maxTransformFuel: 50 });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T016')).toBe(true);
  });

  it('overrides the global fuel limit for this call', () => {
    SECURITY_LIMITS.MAX_TRANSFORM_FUEL = 50;
    const r = run('{out}\nr = %sort @big', { big: big() }, HEADER, { maxTransformFuel: 1_000_000 });
    expect(r.success).toBe(true);
  });

  it('a per-call 0 opts a single call out of a global fuel cap', () => {
    SECURITY_LIMITS.MAX_TRANSFORM_FUEL = 50;
    const r = run('{out}\nr = %sort @big', { big: big() }, HEADER, { maxTransformFuel: 0 });
    expect(r.success).toBe(true);
  });

  it('applies a per-call expression-depth cap', () => {
    const r = run(nestAbs(30), {}, HEADER, { maxExpressionDepth: 8 });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T018')).toBe(true);
  });

  it('applies a per-call timeout', () => {
    let clock = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 10_000));
    const r = run('{out}\nr = %sort @big', { big: big() }, HEADER, { transformTimeoutMs: 100 });
    expect(r.success).toBe(false);
    expect(r.errors.some((e) => e.code === 'T017')).toBe(true);
  });
});
