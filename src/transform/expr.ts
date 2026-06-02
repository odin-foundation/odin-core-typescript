/**
 * ODIN Transform - %expr formula macro.
 *
 * Compiles an infix arithmetic formula string into a tree of existing transform
 * verbs at parse time. No runtime evaluator: the result is an ordinary verb
 * expression, so the arithmetic is performed by the deterministic, golden-tested
 * verbs (add, subtract, multiply, divide, mod, negate, pow, and a whitelist of
 * numeric functions). Variables resolve under an explicit bindings object passed
 * as the second argument: in %expr "a + b" @.vars, the name a reads @.vars.a.
 *
 * Precedence, high to low:
 *   1. parentheses, function call
 *   2. ^ power (right-associative)
 *   3. unary - / +   (binds looser than ^, so -2^2 = -(2^2) = -4; (-2)^2 = 4)
 *   4. * / %  (left-associative)
 *   5. + -    (left-associative)
 */

import type { ValueExpression } from '../types/transform.js';

/** Thrown when a %expr formula cannot be compiled. Carries the T015 code. */
export class ExprSyntaxError extends Error {
  readonly code = 'T015';
  constructor(message: string) {
    super(`Invalid %expr formula: ${message}`);
    this.name = 'ExprSyntaxError';
  }
}

// Infix operator -> verb.
const BINARY_OP: Record<string, string> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  '%': 'mod',
};

// Whitelisted functions -> verb plus arg-count bounds. Only fully deterministic
// numeric verbs are admitted; round(x) supplies a default scale of 0.
const FUNCTIONS: Record<string, { verb: string; min: number; max: number }> = {
  abs: { verb: 'abs', min: 1, max: 1 },
  floor: { verb: 'floor', min: 1, max: 1 },
  ceil: { verb: 'ceil', min: 1, max: 1 },
  trunc: { verb: 'trunc', min: 1, max: 1 },
  sqrt: { verb: 'sqrt', min: 1, max: 1 },
  round: { verb: 'round', min: 1, max: 2 },
  pow: { verb: 'pow', min: 2, max: 2 },
  min: { verb: 'minOf', min: 1, max: Infinity },
  max: { verb: 'maxOf', min: 1, max: Infinity },
};

interface Token {
  kind: 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma';
  value: string;
  isFloat?: boolean;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      let isFloat = false;
      while (j < src.length && /[0-9]/.test(src[j]!)) j++;
      if (src[j] === '.') {
        isFloat = true;
        j++;
        while (j < src.length && /[0-9]/.test(src[j]!)) j++;
      }
      if (src[j] === 'e' || src[j] === 'E') {
        isFloat = true;
        j++;
        if (src[j] === '+' || src[j] === '-') j++;
        while (j < src.length && /[0-9]/.test(src[j]!)) j++;
      }
      tokens.push({ kind: 'num', value: src.slice(i, j), isFloat });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j]!)) j++;
      tokens.push({ kind: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen', value: c });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', value: c });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ kind: 'comma', value: c });
      i++;
      continue;
    }
    if ('+-*/%^'.includes(c)) {
      tokens.push({ kind: 'op', value: c });
      i++;
      continue;
    }
    throw new ExprSyntaxError(`unexpected character '${c}'`);
  }
  return tokens;
}

const literal = (text: string, isFloat: boolean): ValueExpression => ({
  type: 'literal',
  value: isFloat
    ? { type: 'number', value: parseFloat(text) }
    : { type: 'integer', value: parseInt(text, 10) },
});

const verbNode = (verb: string, args: ValueExpression[]): ValueExpression => ({
  type: 'transform',
  verb,
  isCustom: false,
  args,
});

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly bindingPath: string | null
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parse(): ValueExpression {
    if (this.tokens.length === 0) throw new ExprSyntaxError('empty formula');
    const expr = this.parseAdditive();
    if (this.pos < this.tokens.length) {
      throw new ExprSyntaxError(`unexpected token '${this.peek()!.value}'`);
    }
    return expr;
  }

  private parseAdditive(): ValueExpression {
    let left = this.parseMultiplicative();
    while (this.peek()?.kind === 'op' && (this.peek()!.value === '+' || this.peek()!.value === '-')) {
      const op = this.next()!.value;
      const right = this.parseMultiplicative();
      left = verbNode(BINARY_OP[op]!, [left, right]);
    }
    return left;
  }

  private parseMultiplicative(): ValueExpression {
    let left = this.parseUnary();
    while (
      this.peek()?.kind === 'op' &&
      (this.peek()!.value === '*' || this.peek()!.value === '/' || this.peek()!.value === '%')
    ) {
      const op = this.next()!.value;
      const right = this.parseUnary();
      left = verbNode(BINARY_OP[op]!, [left, right]);
    }
    return left;
  }

  private parseUnary(): ValueExpression {
    const t = this.peek();
    if (t?.kind === 'op' && (t.value === '-' || t.value === '+')) {
      this.next();
      const operand = this.parseUnary();
      return t.value === '-' ? verbNode('negate', [operand]) : operand;
    }
    return this.parsePower();
  }

  private parsePower(): ValueExpression {
    const base = this.parsePrimary();
    if (this.peek()?.kind === 'op' && this.peek()!.value === '^') {
      this.next();
      const exponent = this.parseUnary();
      return verbNode('pow', [base, exponent]);
    }
    return base;
  }

  private parsePrimary(): ValueExpression {
    const t = this.next();
    if (!t) throw new ExprSyntaxError('unexpected end of formula');
    if (t.kind === 'num') return literal(t.value, t.isFloat === true);
    if (t.kind === 'lparen') {
      const inner = this.parseAdditive();
      const close = this.next();
      if (!close || close.kind !== 'rparen') throw new ExprSyntaxError('missing closing parenthesis');
      return inner;
    }
    if (t.kind === 'ident') {
      if (this.peek()?.kind === 'lparen') return this.parseCall(t.value);
      // Bare identifier -> a field under the explicit bindings object.
      if (this.bindingPath === null) {
        throw new ExprSyntaxError(
          `variable '${t.value}' requires a bindings object, e.g. %expr "..." @.vars`
        );
      }
      return { type: 'copy', path: this.bindingPath + '.' + t.value };
    }
    throw new ExprSyntaxError(`unexpected token '${t.value}'`);
  }

  private parseCall(name: string): ValueExpression {
    const fn = FUNCTIONS[name];
    if (!fn) throw new ExprSyntaxError(`unknown function '${name}'`);
    this.next(); // consume '('
    const args: ValueExpression[] = [];
    if (this.peek()?.kind !== 'rparen') {
      args.push(this.parseAdditive());
      while (this.peek()?.kind === 'comma') {
        this.next();
        args.push(this.parseAdditive());
      }
    }
    const close = this.next();
    if (!close || close.kind !== 'rparen') throw new ExprSyntaxError(`missing ) after ${name}(`);
    if (args.length < fn.min || args.length > fn.max) {
      throw new ExprSyntaxError(`${name}() takes ${fn.min === fn.max ? fn.min : fn.min + '-' + fn.max} arguments, got ${args.length}`);
    }
    if (name === 'round' && args.length === 1) {
      args.push({ type: 'literal', value: { type: 'integer', value: 0 } });
    }
    return verbNode(fn.verb, args);
  }
}

/**
 * Compile an infix arithmetic formula into a verb-tree expression.
 * Variables resolve under bindingPath (the path of the bindings object, e.g.
 * ".vars"); a formula that uses a variable without a bindings object is an error.
 */
export function compileExpr(formula: string, bindingPath: string | null = null): ValueExpression {
  return new Parser(tokenize(formula), bindingPath).parse();
}
