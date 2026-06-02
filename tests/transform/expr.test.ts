/**
 * Unit tests for the %expr formula macro: precedence, associativity, unary
 * handling, functions, auto-bound variables, and compile errors.
 */
import { describe, it, expect } from 'vitest';
import { Odin } from '../../src/odin.js';
import { parseTransform, executeTransform } from '../../src/transform/index.js';
import { compileExpr, ExprSyntaxError } from '../../src/transform/expr.js';

const HEADER = '{$}\nodin = "1.0.0"\ntransform = "1.0.0"\ndirection = "json->json"\n\n';

// Evaluate a formula end-to-end and return the raw output value (or null).
// When vars are supplied they are exposed as the bindings object @.v.
function evalExpr(formula: string, vars?: Record<string, unknown>): unknown {
  const body = vars ? '{out}\nr = %expr "' + formula + '" @.v' : '{out}\nr = %expr "' + formula + '"';
  const source = vars ? { v: vars } : {};
  const transform = parseTransform(HEADER + body);
  const result = executeTransform(transform, source) as { output: Record<string, any> };
  const r = result.output.out?.r ?? result.output.r;
  if (r && typeof r === 'object' && 'type' in r) {
    return r.type === 'null' ? null : r.value;
  }
  return r;
}

describe('%expr precedence and associativity', () => {
  it('multiplication binds tighter than addition', () => {
    expect(evalExpr('2 + 3 * 4')).toBe(14);
  });
  it('power is right-associative', () => {
    expect(evalExpr('2^3^2')).toBe(512);
  });
  it('power binds tighter than unary minus', () => {
    expect(evalExpr('-2^2')).toBe(-4);
  });
  it('parentheses override unary/power binding', () => {
    expect(evalExpr('(-2)^2')).toBe(4);
  });
  it('nested parentheses', () => {
    expect(evalExpr('((1 + 2) * 3)')).toBe(9);
  });
  it('stacked unary minus', () => {
    expect(evalExpr('--2')).toBe(2);
  });
});

describe('%expr operators', () => {
  it('integer division yields a fraction', () => {
    expect(evalExpr('1 / 2')).toBe(0.5);
  });
  it('modulo follows the mod verb', () => {
    expect(evalExpr('5 % 2')).toBe(1);
    expect(evalExpr('-5 % 2')).toBe(-1);
  });
  it('division by zero yields null', () => {
    expect(evalExpr('1 / 0')).toBeNull();
  });
});

describe('%expr functions', () => {
  it('abs, min, max', () => {
    expect(evalExpr('abs(-7)')).toBe(7);
    expect(evalExpr('min(3, 5, 1)')).toBe(1);
    expect(evalExpr('max(3, 5, 1)')).toBe(5);
  });
  it('round defaults to scale 0 and accepts an explicit scale', () => {
    expect(evalExpr('round(3.7)')).toBe(4);
    expect(evalExpr('round(3.14159, 2)')).toBe(3.14);
  });
  it('pow and sqrt', () => {
    expect(evalExpr('pow(2, 10)')).toBe(1024);
    expect(evalExpr('sqrt(x^2 + y^2)', { x: 3, y: 4 })).toBe(5);
  });
});

describe('%expr explicit bindings', () => {
  it('variables resolve under the bindings object', () => {
    expect(evalExpr('a*x^2 + b*x + c', { a: 2, b: 3, c: 4, x: 5 })).toBe(69);
  });
  it('a variable without a bindings object is a compile error', () => {
    expect(() => compileExpr('a + b')).toThrow(ExprSyntaxError);
  });
});

describe('%expr compile errors', () => {
  it('rejects unknown functions', () => {
    expect(() => compileExpr('sin(x)')).toThrow(ExprSyntaxError);
  });
  it('rejects an incomplete expression', () => {
    expect(() => compileExpr('2 +')).toThrow(ExprSyntaxError);
  });
  it('rejects an unbalanced parenthesis', () => {
    expect(() => compileExpr('(1 + 2')).toThrow(ExprSyntaxError);
  });
  it('rejects the wrong number of function arguments', () => {
    expect(() => compileExpr('pow(2)')).toThrow(ExprSyntaxError);
  });
  it('carries the T015 code', () => {
    try {
      compileExpr('sin(x)');
      expect.unreachable();
    } catch (e) {
      expect((e as { code?: string }).code).toBe('T015');
    }
  });
});

describe('%expr compiles to a verb tree', () => {
  it('a + b compiles to %add', () => {
    const tree = compileExpr('a + b', '.v') as { type: string; verb: string };
    expect(tree.type).toBe('transform');
    expect(tree.verb).toBe('add');
  });
  it('Odin.parse keeps %expr usable in a transform document', () => {
    expect(() => parseTransform(HEADER + '{out}\nr = %expr "1 + 1"')).not.toThrow();
    expect(Odin).toBeDefined();
  });
});
