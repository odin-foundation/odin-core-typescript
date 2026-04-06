/**
 * Tests for engine-interpolation module.
 *
 * Covers string interpolation with ${...} expressions.
 */

import { describe, it, expect } from 'vitest';
import {
  parseInlineArgs,
  parseInlineTransformExpression,
  interpolateString,
} from '../../../src/transform/engine-interpolation.js';
import type {
  TransformValue,
  TransformContext,
  ValueExpression,
} from '../../../src/types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

const str = (value: string): TransformValue => ({ type: 'string', value });
const int = (value: number): TransformValue => ({ type: 'integer', value });
const nil = (): TransformValue => ({ type: 'null' });

function createContext(source: unknown = {}): TransformContext {
  return {
    source,
    current: undefined,
    aliases: new Map(),
    counters: new Map(),
    accumulators: new Map(),
    tables: new Map(),
    constants: new Map(),
    sequenceCounters: new Map(),
  };
}

function createResolver(data: Record<string, TransformValue>) {
  return (path: string): TransformValue => {
    const cleanPath = path.startsWith('.') ? path.slice(1) : path;
    return data[cleanPath] ?? nil();
  };
}

function createEvaluator(results: Record<string, TransformValue>) {
  return (expr: ValueExpression): TransformValue => {
    if (expr.type === 'transform') {
      return results[expr.verb] ?? nil();
    }
    if (expr.type === 'copy') {
      return results[expr.path] ?? nil();
    }
    if (expr.type === 'literal') {
      return expr.value as TransformValue;
    }
    return nil();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// parseInlineArgs Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseInlineArgs', () => {
  it('parses empty string', () => {
    expect(parseInlineArgs('')).toEqual([]);
  });

  it('parses single path expression', () => {
    const result = parseInlineArgs('@.name');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'copy', path: '.name' });
  });

  it('parses multiple path expressions', () => {
    const result = parseInlineArgs('@.first @.last');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'copy', path: '.first' });
    expect(result[1]).toEqual({ type: 'copy', path: '.last' });
  });

  it('parses quoted string', () => {
    const result = parseInlineArgs('"hello"');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'literal',
      value: { type: 'string', value: 'hello' },
    });
  });

  it('handles escaped quotes in string', () => {
    const result = parseInlineArgs('"say \\"hello\\""');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'literal',
      value: { type: 'string', value: 'say "hello"' },
    });
  });

  it('parses unquoted token', () => {
    const result = parseInlineArgs('myTable');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'literal',
      value: { type: 'string', value: 'myTable' },
    });
  });

  it('parses mixed args', () => {
    const result = parseInlineArgs('@.field "literal" token');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'copy', path: '.field' });
    expect(result[1]).toEqual({
      type: 'literal',
      value: { type: 'string', value: 'literal' },
    });
    expect(result[2]).toEqual({
      type: 'literal',
      value: { type: 'string', value: 'token' },
    });
  });

  it('handles extra whitespace', () => {
    const result = parseInlineArgs('  @.a    @.b  ');
    expect(result).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseInlineTransformExpression Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseInlineTransformExpression', () => {
  it('parses simple verb', () => {
    const result = parseInlineTransformExpression('%upper');
    expect(result).toEqual({
      type: 'transform',
      verb: 'upper',
      isCustom: false,
      args: [],
    });
  });

  it('parses custom verb', () => {
    const result = parseInlineTransformExpression('%&myverb');
    expect(result).toEqual({
      type: 'transform',
      verb: 'myverb',
      isCustom: true,
      args: [],
    });
  });

  it('parses verb with args', () => {
    const result = parseInlineTransformExpression('%concat @.first " " @.last');
    expect(result).not.toBeNull();
    if (result && result.type === 'transform') {
      expect(result.verb).toBe('concat');
      expect(result.args).toHaveLength(3);
    }
  });

  it('parses custom verb with namespace', () => {
    const result = parseInlineTransformExpression('%&org.custom.fn');
    expect(result).toEqual({
      type: 'transform',
      verb: 'org.custom.fn',
      isCustom: true,
      args: [],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// interpolateString Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('interpolateString', () => {
  describe('path expressions', () => {
    it('interpolates simple path', () => {
      const context = createContext();
      const resolver = createResolver({ name: str('John') });
      const evaluator = createEvaluator({});

      const result = interpolateString('Hello ${@.name}', context, resolver, evaluator);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Hello John');
      }
    });

    it('interpolates nested path', () => {
      const context = createContext();
      const resolver = createResolver({ 'customer.name': str('Jane') });
      const evaluator = createEvaluator({});

      const result = interpolateString(
        'Customer: ${@.customer.name}',
        context,
        resolver,
        evaluator
      );
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Customer: Jane');
      }
    });

    it('interpolates multiple paths', () => {
      const context = createContext();
      const resolver = createResolver({ first: str('John'), last: str('Doe') });
      const evaluator = createEvaluator({});

      const result = interpolateString('${@.first} ${@.last}', context, resolver, evaluator);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('John Doe');
      }
    });
  });

  describe('verb expressions', () => {
    it('interpolates verb expression', () => {
      const context = createContext();
      const resolver = createResolver({});
      const evaluator = createEvaluator({ upper: str('HELLO') });

      const result = interpolateString('Say ${%upper @.name}', context, resolver, evaluator);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Say HELLO');
      }
    });

    it('interpolates custom verb', () => {
      const context = createContext();
      const resolver = createResolver({});
      const evaluator = createEvaluator({ 'custom.fn': str('result') });

      const result = interpolateString(
        'Value: ${%&custom.fn @.input}',
        context,
        resolver,
        evaluator
      );
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Value: result');
      }
    });
  });

  describe('escaped expressions', () => {
    it('handles escaped interpolation', () => {
      const context = createContext();
      const resolver = createResolver({});
      const evaluator = createEvaluator({});

      const result = interpolateString('Use \\${variable} syntax', context, resolver, evaluator);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Use ${variable} syntax');
      }
    });
  });

  describe('mixed content', () => {
    it('handles text with multiple interpolations', () => {
      const context = createContext();
      const resolver = createResolver({ name: str('John'), age: int(30) });
      const evaluator = createEvaluator({});

      const result = interpolateString(
        'Name: ${@.name}, Age: ${@.age}',
        context,
        resolver,
        evaluator
      );
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Name: John, Age: 30');
      }
    });
  });

  describe('edge cases', () => {
    it('returns unchanged for empty template', () => {
      const context = createContext();
      const resolver = createResolver({});
      const evaluator = createEvaluator({});

      const result = interpolateString('', context, resolver, evaluator);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('');
      }
    });

    it('returns unchanged for template without interpolation', () => {
      const context = createContext();
      const resolver = createResolver({});
      const evaluator = createEvaluator({});

      const result = interpolateString('Hello World', context, resolver, evaluator);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Hello World');
      }
    });

    it('handles null value in interpolation', () => {
      const context = createContext();
      const resolver = createResolver({ missing: nil() });
      const evaluator = createEvaluator({});

      const result = interpolateString('Value: ${@.missing}', context, resolver, evaluator);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Value: ');
      }
    });
  });
});
