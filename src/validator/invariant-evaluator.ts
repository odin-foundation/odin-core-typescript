/**
 * ODIN Validator - Invariant expression evaluation.
 *
 * Recursive-descent evaluator over the invariant grammar:
 *   expression     = logic_or
 *   logic_or       = logic_and , { "||" , logic_and }
 *   logic_and      = equality , { "&&" , equality }
 *   equality       = comparison , { ( "==" | "!=" | "=" ) , comparison }
 *   comparison     = additive , { ( ">" | "<" | ">=" | "<=" ) , additive }
 *   additive       = multiplicative , { ( "+" | "-" ) , multiplicative }
 *   multiplicative = unary , { ( "*" | "/" | "%" ) , unary }
 *   unary          = [ "!" ] , primary
 *   primary        = path | number | string | "(" , expression , ")"
 */

import type { OdinValue } from '../types/values.js';

/** Resolved operand value: number, string, boolean, or null. */
type Operand = number | string | boolean | null;

/** Token kinds produced by the lexer. */
interface Token {
  kind: 'op' | 'number' | 'string' | 'ident' | 'lparen' | 'rparen';
  text: string;
}

/** Field resolver: returns the document value at a path, or undefined if absent. */
export type FieldResolver = (name: string) => OdinValue | undefined;

/** Outcome of evaluating an invariant expression. */
export interface InvariantResult {
  /** True/false when fully evaluable; undefined when an operand field is absent. */
  value: boolean | undefined;
  /** True if any referenced field is present but null. */
  nullOperand: boolean;
}

const MULTI_CHAR_OPS = ['==', '!=', '>=', '<=', '&&', '||'];
const SINGLE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '>', '<', '=', '!']);

const EPSILON = 1e-9;

/** Tokenize an invariant expression. Throws on unrecognized input. */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i]!;
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ kind: 'lparen', text: '(' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', text: ')' });
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let text = '';
      while (j < expr.length && expr[j] !== quote) {
        text += expr[j];
        j++;
      }
      if (j >= expr.length) throw new Error('Unterminated string literal');
      tokens.push({ kind: 'string', text });
      i = j + 1;
      continue;
    }
    const two = expr.slice(i, i + 2);
    if (MULTI_CHAR_OPS.includes(two)) {
      tokens.push({ kind: 'op', text: two });
      i += 2;
      continue;
    }
    if (SINGLE_CHAR_OPS.has(c)) {
      tokens.push({ kind: 'op', text: c });
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j]!)) j++;
      tokens.push({ kind: 'number', text: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_.]/.test(expr[j]!)) j++;
      tokens.push({ kind: 'ident', text: expr.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character '${c}' in invariant expression`);
  }
  return tokens;
}

/** Reserved identifiers that resolve to boolean literals, not fields. */
const BOOLEAN_LITERALS: Record<string, boolean> = { true: true, false: false };

/**
 * Parse and evaluate an invariant expression against document field values.
 */
export function evaluateInvariant(expr: string, resolve: FieldResolver): InvariantResult {
  const tokens = tokenize(expr);
  let pos = 0;

  let absentOperand = false;
  let nullOperand = false;

  function peek(): Token | undefined {
    return tokens[pos];
  }
  function next(): Token | undefined {
    return tokens[pos++];
  }

  function parseExpression(): Operand {
    return parseLogicOr();
  }

  function parseLogicOr(): Operand {
    let left = parseLogicAnd();
    while (peek()?.text === '||') {
      next();
      const right = parseLogicAnd();
      left = toBool(left) || toBool(right);
    }
    return left;
  }

  function parseLogicAnd(): Operand {
    let left = parseEquality();
    while (peek()?.text === '&&') {
      next();
      const right = parseEquality();
      left = toBool(left) && toBool(right);
    }
    return left;
  }

  function parseEquality(): Operand {
    let left = parseComparison();
    while (peek()?.text === '==' || peek()?.text === '!=' || peek()?.text === '=') {
      const op = next()!.text;
      const right = parseComparison();
      const eq = looseEquals(left, right);
      left = op === '!=' ? !eq : eq;
    }
    return left;
  }

  function parseComparison(): Operand {
    let left = parseAdditive();
    while (['>', '<', '>=', '<='].includes(peek()?.text ?? '')) {
      const op = next()!.text;
      const right = parseAdditive();
      left = compare(left, op, right);
    }
    return left;
  }

  function parseAdditive(): Operand {
    let left = parseMultiplicative();
    while (peek()?.text === '+' || peek()?.text === '-') {
      const op = next()!.text;
      const right = parseMultiplicative();
      const ln = toNum(left);
      const rn = toNum(right);
      if (ln === undefined || rn === undefined) {
        left = NaN;
      } else {
        left = op === '+' ? ln + rn : ln - rn;
      }
    }
    return left;
  }

  function parseMultiplicative(): Operand {
    let left = parseUnary();
    while (['*', '/', '%'].includes(peek()?.text ?? '')) {
      const op = next()!.text;
      const right = parseUnary();
      const ln = toNum(left);
      const rn = toNum(right);
      if (ln === undefined || rn === undefined) {
        left = NaN;
      } else if (op === '*') {
        left = ln * rn;
      } else if (op === '/') {
        left = rn === 0 ? NaN : ln / rn;
      } else {
        left = rn === 0 ? NaN : ln % rn;
      }
    }
    return left;
  }

  function parseUnary(): Operand {
    if (peek()?.text === '!') {
      next();
      const operand = parseUnary();
      return !toBool(operand);
    }
    return parsePrimary();
  }

  function parsePrimary(): Operand {
    const tok = next();
    if (!tok) throw new Error('Unexpected end of invariant expression');

    if (tok.kind === 'lparen') {
      const inner = parseExpression();
      const close = next();
      if (!close || close.kind !== 'rparen') throw new Error('Expected closing parenthesis');
      return inner;
    }
    if (tok.kind === 'number') {
      const n = parseFloat(tok.text);
      if (isNaN(n)) throw new Error(`Invalid number '${tok.text}'`);
      return n;
    }
    if (tok.kind === 'string') {
      return tok.text;
    }
    if (tok.kind === 'ident') {
      if (tok.text in BOOLEAN_LITERALS) {
        return BOOLEAN_LITERALS[tok.text]!;
      }
      const value = resolve(tok.text);
      if (value === undefined) {
        absentOperand = true;
        return NaN;
      }
      if (value.type === 'null') {
        nullOperand = true;
        return null;
      }
      return operandFromValue(value);
    }
    throw new Error(`Unexpected token '${tok.text}'`);
  }

  let result: boolean | undefined;
  const final = parseExpression();
  if (peek() !== undefined) throw new Error('Unexpected trailing tokens in invariant expression');

  if (nullOperand) {
    result = false;
  } else if (absentOperand) {
    result = undefined;
  } else {
    result = toBool(final);
  }

  return { value: result, nullOperand };
}

/** Extract a comparable operand from an OdinValue. */
function operandFromValue(value: OdinValue): Operand {
  switch (value.type) {
    case 'number':
    case 'integer':
    case 'currency':
    case 'percent':
      return value.value;
    case 'string':
      return value.value;
    case 'boolean':
      return value.value;
    case 'date':
    case 'timestamp':
      return value.value.getTime();
    default:
      return NaN;
  }
}

function toNum(v: Operand): number | undefined {
  if (typeof v === 'number') return isNaN(v) ? undefined : v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return undefined;
}

function toBool(v: Operand): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return !isNaN(v) && v !== 0;
  if (typeof v === 'string') return v.length > 0;
  return false;
}

function looseEquals(a: Operand, b: Operand): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < EPSILON;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b;
  }
  const an = toNum(a);
  const bn = toNum(b);
  if (an !== undefined && bn !== undefined) {
    return Math.abs(an - bn) < EPSILON;
  }
  return a === b;
}

function compare(a: Operand, op: string, b: Operand): boolean {
  const an = toNum(a);
  const bn = toNum(b);
  if (an !== undefined && bn !== undefined) {
    switch (op) {
      case '>': return an > bn;
      case '<': return an < bn;
      case '>=': return an >= bn;
      case '<=': return an <= bn;
    }
  }
  if (typeof a === 'string' && typeof b === 'string') {
    switch (op) {
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      case '<=': return a <= b;
    }
  }
  return false;
}
