/**
 * ODIN Validator - Invariant expression evaluation.
 *
 * Recursive-descent parser over the invariant grammar:
 *   expression     = logic_or
 *   logic_or       = logic_and , { "||" , logic_and }
 *   logic_and      = equality , { "&&" , equality }
 *   equality       = comparison , { ( "==" | "!=" | "=" ) , comparison }
 *   comparison     = additive , { ( ">" | "<" | ">=" | "<=" ) , additive }
 *   additive       = multiplicative , { ( "+" | "-" ) , multiplicative }
 *   multiplicative = unary , { ( "*" | "/" | "%" ) , unary }
 *   unary          = [ "!" ] , primary
 *   primary        = path | number | string | "(" , expression , ")"
 *
 * An expression is parsed to an AST once and cached by its source string; each
 * document validation evaluates the cached AST against that document's values.
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

// ─────────────────────────────────────────────────────────────────────────────
// AST
// ─────────────────────────────────────────────────────────────────────────────

type Node =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'field'; name: string }
  | { kind: 'not'; operand: Node }
  | { kind: 'logic'; op: '&&' | '||'; left: Node; right: Node }
  | { kind: 'equality'; op: '==' | '!=' | '='; left: Node; right: Node }
  | { kind: 'compare'; op: '>' | '<' | '>=' | '<='; left: Node; right: Node }
  | { kind: 'additive'; op: '+' | '-'; left: Node; right: Node }
  | { kind: 'multiplicative'; op: '*' | '/' | '%'; left: Node; right: Node };

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
      while (j < expr.length && isNumberChar(expr[j]!)) j++;
      tokens.push({ kind: 'number', text: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < expr.length && isIdentChar(expr[j]!)) j++;
      tokens.push({ kind: 'ident', text: expr.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character '${c}' in invariant expression`);
  }
  return tokens;
}

function isNumberChar(c: string): boolean {
  return (c >= '0' && c <= '9') || c === '.';
}

function isIdentStart(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
}

function isIdentChar(c: string): boolean {
  return isIdentStart(c) || (c >= '0' && c <= '9') || c === '.';
}

/** Reserved identifiers that resolve to boolean literals, not fields. */
const BOOLEAN_LITERALS: Record<string, boolean> = { true: true, false: false };

// ─────────────────────────────────────────────────────────────────────────────
// Parse (string -> AST), cached per expression source
// ─────────────────────────────────────────────────────────────────────────────

/** Compiled, document-independent invariant ASTs keyed by source string. */
const astCache = new Map<string, Node>();

/** Parse an invariant expression to an AST. Throws on malformed input. */
function parseToAst(expr: string): Node {
  const tokens = tokenize(expr);
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }
  function next(): Token | undefined {
    return tokens[pos++];
  }

  function parseExpression(): Node {
    return parseLogicOr();
  }

  function parseLogicOr(): Node {
    let left = parseLogicAnd();
    while (peek()?.text === '||') {
      next();
      const right = parseLogicAnd();
      left = { kind: 'logic', op: '||', left, right };
    }
    return left;
  }

  function parseLogicAnd(): Node {
    let left = parseEquality();
    while (peek()?.text === '&&') {
      next();
      const right = parseEquality();
      left = { kind: 'logic', op: '&&', left, right };
    }
    return left;
  }

  function parseEquality(): Node {
    let left = parseComparison();
    while (peek()?.text === '==' || peek()?.text === '!=' || peek()?.text === '=') {
      const op = next()!.text as '==' | '!=' | '=';
      const right = parseComparison();
      left = { kind: 'equality', op, left, right };
    }
    return left;
  }

  function parseComparison(): Node {
    let left = parseAdditive();
    while (['>', '<', '>=', '<='].includes(peek()?.text ?? '')) {
      const op = next()!.text as '>' | '<' | '>=' | '<=';
      const right = parseAdditive();
      left = { kind: 'compare', op, left, right };
    }
    return left;
  }

  function parseAdditive(): Node {
    let left = parseMultiplicative();
    while (peek()?.text === '+' || peek()?.text === '-') {
      const op = next()!.text as '+' | '-';
      const right = parseMultiplicative();
      left = { kind: 'additive', op, left, right };
    }
    return left;
  }

  function parseMultiplicative(): Node {
    let left = parseUnary();
    while (['*', '/', '%'].includes(peek()?.text ?? '')) {
      const op = next()!.text as '*' | '/' | '%';
      const right = parseUnary();
      left = { kind: 'multiplicative', op, left, right };
    }
    return left;
  }

  function parseUnary(): Node {
    if (peek()?.text === '!') {
      next();
      const operand = parseUnary();
      return { kind: 'not', operand };
    }
    return parsePrimary();
  }

  function parsePrimary(): Node {
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
      return { kind: 'number', value: n };
    }
    if (tok.kind === 'string') {
      return { kind: 'string', value: tok.text };
    }
    if (tok.kind === 'ident') {
      if (tok.text in BOOLEAN_LITERALS) {
        return { kind: 'bool', value: BOOLEAN_LITERALS[tok.text]! };
      }
      return { kind: 'field', name: tok.text };
    }
    throw new Error(`Unexpected token '${tok.text}'`);
  }

  const ast = parseExpression();
  if (peek() !== undefined) throw new Error('Unexpected trailing tokens in invariant expression');
  return ast;
}

/** Return the cached AST for an expression, parsing and caching it on first use. */
function getAst(expr: string): Node {
  let ast = astCache.get(expr);
  if (ast === undefined) {
    ast = parseToAst(expr);
    astCache.set(expr, ast);
  }
  return ast;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluate (AST + resolver -> result), per document
// ─────────────────────────────────────────────────────────────────────────────

/** Per-evaluation state tracking absent/null operands. */
interface EvalState {
  resolve: FieldResolver;
  absentOperand: boolean;
  nullOperand: boolean;
}

function evalNode(node: Node, state: EvalState): Operand {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'string':
      return node.value;
    case 'bool':
      return node.value;
    case 'field': {
      const value = state.resolve(node.name);
      if (value === undefined) {
        state.absentOperand = true;
        return NaN;
      }
      if (value.type === 'null') {
        state.nullOperand = true;
        return null;
      }
      return operandFromValue(value);
    }
    case 'not':
      return !toBool(evalNode(node.operand, state));
    case 'logic': {
      const left = evalNode(node.left, state);
      const right = evalNode(node.right, state);
      return node.op === '||' ? toBool(left) || toBool(right) : toBool(left) && toBool(right);
    }
    case 'equality': {
      const left = evalNode(node.left, state);
      const right = evalNode(node.right, state);
      const eq = looseEquals(left, right);
      return node.op === '!=' ? !eq : eq;
    }
    case 'compare': {
      const left = evalNode(node.left, state);
      const right = evalNode(node.right, state);
      return compare(left, node.op, right);
    }
    case 'additive': {
      const ln = toNum(evalNode(node.left, state));
      const rn = toNum(evalNode(node.right, state));
      if (ln === undefined || rn === undefined) return NaN;
      return node.op === '+' ? ln + rn : ln - rn;
    }
    case 'multiplicative': {
      const ln = toNum(evalNode(node.left, state));
      const rn = toNum(evalNode(node.right, state));
      if (ln === undefined || rn === undefined) return NaN;
      if (node.op === '*') return ln * rn;
      if (node.op === '/') return rn === 0 ? NaN : ln / rn;
      return rn === 0 ? NaN : ln % rn;
    }
  }
}

/**
 * Parse and evaluate an invariant expression against document field values.
 *
 * The parsed AST is cached by expression source, so re-validating documents
 * against the same schema reuses the compiled form.
 */
export function evaluateInvariant(expr: string, resolve: FieldResolver): InvariantResult {
  const ast = getAst(expr);

  const state: EvalState = { resolve, absentOperand: false, nullOperand: false };
  const final = evalNode(ast, state);

  let result: boolean | undefined;
  if (state.nullOperand) {
    result = false;
  } else if (state.absentOperand) {
    result = undefined;
  } else {
    result = toBool(final);
  }

  return { value: result, nullOperand: state.nullOperand };
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
