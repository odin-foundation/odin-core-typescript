/**
 * Tests for parser-expressions module.
 *
 * Covers parsing of value expressions (@path, %verb, literals).
 */

import { describe, it, expect } from 'vitest';
import {
  parseValueExpression,
  parseTransformExpression,
  parseTransformExpressionWithLength,
  parseTransformArgs,
} from '../../../src/transform/parser-expressions.js';

// ─────────────────────────────────────────────────────────────────────────────
// parseValueExpression Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseValueExpression', () => {
  describe('copy expressions', () => {
    it('parses simple path', () => {
      const result = parseValueExpression('@.name');
      expect(result).toEqual({ type: 'copy', path: '.name' });
    });

    it('parses nested path', () => {
      const result = parseValueExpression('@customer.address.city');
      expect(result).toEqual({ type: 'copy', path: 'customer.address.city' });
    });

    it('parses path with array index', () => {
      const result = parseValueExpression('@items[0].name');
      expect(result).toEqual({ type: 'copy', path: 'items[0].name' });
    });

    it('parses path with modifiers (stops before :)', () => {
      const result = parseValueExpression('@.name :upper');
      expect(result).toEqual({ type: 'copy', path: '.name' });
    });

    it('trims whitespace', () => {
      const result = parseValueExpression('  @.name  ');
      expect(result).toEqual({ type: 'copy', path: '.name' });
    });
  });

  describe('transform expressions', () => {
    it('parses simple verb', () => {
      const result = parseValueExpression('%upper');
      expect(result.type).toBe('transform');
      if (result.type === 'transform') {
        expect(result.verb).toBe('upper');
        expect(result.isCustom).toBe(false);
      }
    });

    it('parses custom verb', () => {
      const result = parseValueExpression('%&myverb');
      expect(result.type).toBe('transform');
      if (result.type === 'transform') {
        expect(result.verb).toBe('myverb');
        expect(result.isCustom).toBe(true);
      }
    });

    it('parses verb with namespace', () => {
      const result = parseValueExpression('%&org.custom.fn');
      expect(result.type).toBe('transform');
      if (result.type === 'transform') {
        expect(result.verb).toBe('org.custom.fn');
        expect(result.isCustom).toBe(true);
      }
    });
  });

  describe('literal expressions', () => {
    it('parses string literal', () => {
      const result = parseValueExpression('"hello"');
      expect(result).toEqual({
        type: 'literal',
        value: { type: 'string', value: 'hello' },
      });
    });

    it('parses empty string literal', () => {
      const result = parseValueExpression('""');
      expect(result).toEqual({
        type: 'literal',
        value: { type: 'string', value: '' },
      });
    });

    it('parses currency literal', () => {
      const result = parseValueExpression('#$99.99');
      expect(result).toEqual({
        type: 'literal',
        value: { type: 'currency', value: 99.99, decimalPlaces: 2 },
      });
    });

    it('parses integer literal', () => {
      const result = parseValueExpression('##42');
      expect(result).toEqual({
        type: 'literal',
        value: { type: 'integer', value: 42 },
      });
    });

    it('parses negative integer literal', () => {
      const result = parseValueExpression('##-100');
      expect(result).toEqual({
        type: 'literal',
        value: { type: 'integer', value: -100 },
      });
    });

    it('parses number literal', () => {
      const result = parseValueExpression('#3.14');
      expect(result).toEqual({
        type: 'literal',
        value: { type: 'number', value: 3.14 },
      });
    });

    it('parses negative number literal', () => {
      const result = parseValueExpression('#-1.5');
      expect(result).toEqual({
        type: 'literal',
        value: { type: 'number', value: -1.5 },
      });
    });

    it('parses null literal', () => {
      const result = parseValueExpression('~');
      expect(result).toEqual({
        type: 'literal',
        value: { type: 'null' },
      });
    });

    it('treats bare text as string literal', () => {
      const result = parseValueExpression('baretext');
      expect(result).toEqual({
        type: 'literal',
        value: { type: 'string', value: 'baretext' },
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTransformExpression Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseTransformExpression', () => {
  it('parses simple verb without args', () => {
    const result = parseTransformExpression('%upper');
    expect(result).toEqual({
      type: 'transform',
      verb: 'upper',
      isCustom: false,
      args: [],
    });
  });

  it('parses custom verb without args', () => {
    const result = parseTransformExpression('%&myverb');
    expect(result).toEqual({
      type: 'transform',
      verb: 'myverb',
      isCustom: true,
      args: [],
    });
  });

  it('parses verb with copy arg', () => {
    const result = parseTransformExpression('%upper @.name');
    expect(result.type).toBe('transform');
    if (result.type === 'transform') {
      expect(result.verb).toBe('upper');
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({ type: 'copy', path: '.name' });
    }
  });

  it('parses verb with string literal arg', () => {
    const result = parseTransformExpression('%concat "hello"');
    expect(result.type).toBe('transform');
    if (result.type === 'transform') {
      expect(result.verb).toBe('concat');
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'string', value: 'hello' },
      });
    }
  });

  it('parses verb with multiple args', () => {
    const result = parseTransformExpression('%concat @.first " " @.last');
    expect(result.type).toBe('transform');
    if (result.type === 'transform') {
      expect(result.verb).toBe('concat');
      expect(result.args).toHaveLength(3);
    }
  });

  it('parses verb with integer arg', () => {
    const result = parseTransformExpression('%add ##10');
    expect(result.type).toBe('transform');
    if (result.type === 'transform') {
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'integer', value: 10 },
      });
    }
  });

  it('parses verb with number arg', () => {
    const result = parseTransformExpression('%multiply #1.5');
    expect(result.type).toBe('transform');
    if (result.type === 'transform') {
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'number', value: 1.5 },
      });
    }
  });

  it('parses verb with currency arg', () => {
    const result = parseTransformExpression('%format #$99.99');
    expect(result.type).toBe('transform');
    if (result.type === 'transform') {
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'currency', value: 99.99, decimalPlaces: 2 },
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTransformExpressionWithLength Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseTransformExpressionWithLength', () => {
  it('returns consumed count for simple verb', () => {
    const result = parseTransformExpressionWithLength('%upper');
    expect(result.consumed).toBe(6);
    expect(result.expr.type).toBe('transform');
  });

  it('returns consumed count with args', () => {
    const result = parseTransformExpressionWithLength('%upper @.name');
    expect(result.consumed).toBe(13);
  });

  it('returns consumed count for custom verb', () => {
    const result = parseTransformExpressionWithLength('%&custom');
    expect(result.consumed).toBe(8);
  });

  it('tracks consumption with nested transforms', () => {
    // The concat verb is variadic (-1), so it consumes all args
    const input = '%concat @.a @.b';
    const result = parseTransformExpressionWithLength(input);
    expect(result.consumed).toBe(input.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTransformArgs Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseTransformArgs', () => {
  describe('basic parsing', () => {
    it('parses empty args string', () => {
      const result = parseTransformArgs('', 10);
      expect(result.args).toEqual([]);
      expect(result.consumed).toBe(0);
    });

    it('parses whitespace-only string', () => {
      const result = parseTransformArgs('   ', 10);
      expect(result.args).toEqual([]);
      expect(result.consumed).toBe(3);
    });

    it('parses copy expression', () => {
      const result = parseTransformArgs(' @.name', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({ type: 'copy', path: '.name' });
    });

    it('parses multiple copy expressions', () => {
      const result = parseTransformArgs(' @.first @.last', 10);
      expect(result.args).toHaveLength(2);
      expect(result.args[0]).toEqual({ type: 'copy', path: '.first' });
      expect(result.args[1]).toEqual({ type: 'copy', path: '.last' });
    });
  });

  describe('limit enforcement', () => {
    it('stops at limit', () => {
      const result = parseTransformArgs(' @.a @.b @.c', 2);
      expect(result.args).toHaveLength(2);
      expect(result.args[0]).toEqual({ type: 'copy', path: '.a' });
      expect(result.args[1]).toEqual({ type: 'copy', path: '.b' });
    });

    it('unlimited (-1) parses all args', () => {
      const result = parseTransformArgs(' @.a @.b @.c @.d @.e', -1);
      expect(result.args).toHaveLength(5);
    });

    it('zero limit returns no args', () => {
      const result = parseTransformArgs(' @.a @.b', 0);
      expect(result.args).toHaveLength(0);
    });
  });

  describe('modifier handling', () => {
    it('stops at modifier', () => {
      const result = parseTransformArgs(' @.name :upper', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({ type: 'copy', path: '.name' });
    });

    it('stops at multiple modifiers', () => {
      const result = parseTransformArgs(' @.name :upper :trim', 10);
      expect(result.args).toHaveLength(1);
    });
  });

  describe('string literals', () => {
    it('parses quoted string', () => {
      const result = parseTransformArgs(' "hello"', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'string', value: 'hello' },
      });
    });

    it('handles escaped quotes', () => {
      const result = parseTransformArgs(' "say \\"hello\\""', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'string', value: 'say "hello"' },
      });
    });

    it('handles escaped backslash', () => {
      const result = parseTransformArgs(' "C:\\\\path"', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'string', value: 'C:\\path' },
      });
    });

    it('handles empty quoted string', () => {
      const result = parseTransformArgs(' ""', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'string', value: '' },
      });
    });
  });

  describe('numeric literals', () => {
    it('parses integer literal', () => {
      const result = parseTransformArgs(' ##42', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'integer', value: 42 },
      });
    });

    it('parses negative integer', () => {
      const result = parseTransformArgs(' ##-100', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'integer', value: -100 },
      });
    });

    it('parses number literal', () => {
      const result = parseTransformArgs(' #3.14', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'number', value: 3.14 },
      });
    });

    it('parses negative number', () => {
      const result = parseTransformArgs(' #-1.5', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'number', value: -1.5 },
      });
    });

    it('parses currency literal', () => {
      const result = parseTransformArgs(' #$99.99', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'currency', value: 99.99, decimalPlaces: 2 },
      });
    });
  });

  describe('nested transforms', () => {
    it('parses nested transform', () => {
      const result = parseTransformArgs(' %upper @.name', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0].type).toBe('transform');
      if (result.args[0].type === 'transform') {
        expect(result.args[0].verb).toBe('upper');
        expect(result.args[0].args).toHaveLength(1);
      }
    });

    it('parses custom nested transform', () => {
      const result = parseTransformArgs(' %&custom.fn @.value', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0].type).toBe('transform');
      if (result.args[0].type === 'transform') {
        expect(result.args[0].verb).toBe('custom.fn');
        expect(result.args[0].isCustom).toBe(true);
      }
    });
  });

  describe('unquoted strings', () => {
    it('parses unquoted string (table name)', () => {
      const result = parseTransformArgs(' stateCodes', 10);
      expect(result.args).toHaveLength(1);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'string', value: 'stateCodes' },
      });
    });

    it('parses mixed args with unquoted string', () => {
      const result = parseTransformArgs(' stateCodes @.code', 10);
      expect(result.args).toHaveLength(2);
      expect(result.args[0]).toEqual({
        type: 'literal',
        value: { type: 'string', value: 'stateCodes' },
      });
      expect(result.args[1]).toEqual({ type: 'copy', path: '.code' });
    });
  });

  describe('consumption tracking', () => {
    it('returns correct consumed count', () => {
      const result = parseTransformArgs(' @.name', 10);
      expect(result.consumed).toBe(7);
    });

    it('returns consumed count including trailing whitespace', () => {
      const result = parseTransformArgs(' @.a @.b  ', 10);
      expect(result.consumed).toBe(10);
    });

    it('returns consumed count stopping at modifier', () => {
      const input = ' @.name :upper';
      const result = parseTransformArgs(input, 10);
      // Should stop before :upper
      expect(result.consumed).toBeLessThan(input.length);
    });
  });

  describe('edge cases', () => {
    it('handles multiple whitespace between args', () => {
      const result = parseTransformArgs('  @.a    @.b  ', 10);
      expect(result.args).toHaveLength(2);
    });

    it('handles unclosed quote gracefully', () => {
      const result = parseTransformArgs(' "unclosed', 10);
      expect(result.args).toHaveLength(0);
    });

    it('handles invalid currency gracefully', () => {
      const result = parseTransformArgs(' #$abc', 10);
      expect(result.args).toHaveLength(0);
    });

    it('handles invalid integer gracefully', () => {
      const result = parseTransformArgs(' ##abc', 10);
      expect(result.args).toHaveLength(0);
    });

    it('handles invalid number gracefully', () => {
      const result = parseTransformArgs(' #abc', 10);
      expect(result.args).toHaveLength(0);
    });
  });
});
