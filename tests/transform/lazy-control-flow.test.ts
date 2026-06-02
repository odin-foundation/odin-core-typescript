/**
 * Control-flow verbs (ifElse, ifNull, ifEmpty, coalesce, and, or, cond, switch)
 * evaluate their branches lazily: only the selected branch runs, so unselected
 * side effects do not fire and and/or/coalesce short-circuit.
 */
import { describe, it, expect } from 'vitest';
import { parseTransform, executeTransform } from '../../src/transform/index.js';

const HEADER = '{$}\nodin = "1.0.0"\ntransform = "1.0.0"\ndirection = "json->json"\n\n';

function val(body: string, field: string): unknown {
  const out = (executeTransform(parseTransform(HEADER + body), {}) as { output: Record<string, any> })
    .output.out;
  const r = out?.[field];
  return r && typeof r === 'object' && 'type' in r ? (r.type === 'null' ? null : r.value) : r;
}

// Run a verb in a sink and read back an accumulator it may or may not have touched.
function accumAfter(decl: string, sink: string, name: string): number {
  const body = `{$accumulator}\n${decl}\n${name}._persist = true\n\n{_s}\n${sink}\n\n{out}\nx = "@$accumulator.${name}"`;
  return val(body, 'x') as number;
}

describe('lazy control-flow: no unselected side effects', () => {
  it('ifElse runs only the selected branch', () => {
    const body =
      '{$accumulator}\nhit = ##0\nhit._persist = true\nmiss = ##0\nmiss._persist = true\n\n' +
      '{_s}\n_ = %ifElse ?true %accumulate hit ##1 %accumulate miss ##1\n\n' +
      '{out}\nhit = "@$accumulator.hit"\nmiss = "@$accumulator.miss"';
    expect(val(body, 'hit')).toBe(1);
    expect(val(body, 'miss')).toBe(0);
  });
  it('and short-circuits a false left operand', () => {
    expect(accumAfter('x = ##0', '_ = %and ?false %accumulate x ##1', 'x')).toBe(0);
  });
  it('or short-circuits a true left operand', () => {
    expect(accumAfter('x = ##0', '_ = %or ?true %accumulate x ##1', 'x')).toBe(0);
  });
  it('coalesce stops at the first non-null', () => {
    expect(accumAfter('x = ##0', '_ = %coalesce "first" %accumulate x ##1', 'x')).toBe(0);
  });
});

describe('lazy control-flow: values unchanged', () => {
  it('ifElse selects', () => {
    expect(val('{out}\nr = %ifElse %gt ##5 ##3 "big" "small"', 'r')).toBe('big');
    expect(val('{out}\nr = %ifElse %gt ##1 ##3 "big" "small"', 'r')).toBe('small');
  });
  it('ifNull and ifEmpty fall back', () => {
    expect(val('{out}\nr = %ifNull ~ "fallback"', 'r')).toBe('fallback');
    expect(val('{out}\nr = %ifEmpty "" "fallback"', 'r')).toBe('fallback');
    expect(val('{out}\nr = %ifNull "present" "fallback"', 'r')).toBe('present');
  });
  it('coalesce returns the first present value', () => {
    expect(val('{out}\nr = %coalesce ~ ~ "third"', 'r')).toBe('third');
  });
  it('and / or compute booleans', () => {
    expect(val('{out}\nr = %and ?true ?false', 'r')).toBe(false);
    expect(val('{out}\nr = %or ?false ?true', 'r')).toBe(true);
  });
  it('cond and switch select', () => {
    expect(val('{out}\nr = %cond %eq ##2 ##1 "one" %eq ##2 ##2 "two" "default"', 'r')).toBe('two');
    expect(val('{out}\nr = %cond %eq ##9 ##1 "one" %eq ##9 ##2 "two" "default"', 'r')).toBe('default');
    expect(val('{out}\nr = %switch "b" "a" ##1 "b" ##2 ##99', 'r')).toBe(2);
    expect(val('{out}\nr = %switch "z" "a" ##1 "b" ##2 ##99', 'r')).toBe(99);
  });
});
