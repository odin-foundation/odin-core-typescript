/**
 * Bounds Checking Tests
 *
 * Tests for integer overflow and bounds checking protections.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/odin.js';
import { ParseError } from '../../../src/types/errors.js';

describe('Parser Bounds Checking', () => {
  describe('array index limits', () => {
    it('should parse valid array indices', () => {
      const doc = Odin.parse('items[0] = "first"\nitems[1] = "second"');
      expect(doc.getString('items[0]')).toBe('first');
      expect(doc.getString('items[1]')).toBe('second');
    });

    it('should handle contiguous array indices', () => {
      const doc = Odin.parse('items[0] = "first"\nitems[1] = "second"\nitems[2] = "third"');
      expect(doc.getString('items[0]')).toBe('first');
      expect(doc.getString('items[1]')).toBe('second');
      expect(doc.getString('items[2]')).toBe('third');
    });
  });

  describe('nesting depth limits', () => {
    it('should parse moderately nested structures', () => {
      const doc = Odin.parse('a.b.c.d.e.f = "deep"');
      expect(doc.getString('a.b.c.d.e.f')).toBe('deep');
    });

    it('should parse nested arrays', () => {
      const doc = Odin.parse('matrix[0][0] = ##1\nmatrix[0][1] = ##2');
      expect(doc.getInteger('matrix[0][0]')).toBe(1);
      expect(doc.getInteger('matrix[0][1]')).toBe(2);
    });
  });
});

describe('String Length Limits', () => {
  it('should parse normal strings', () => {
    const doc = Odin.parse('text = "Hello, World!"');
    expect(doc.getString('text')).toBe('Hello, World!');
  });

  it('should parse moderately long strings', () => {
    const longText = 'a'.repeat(10000);
    const doc = Odin.parse(`text = "${longText}"`);
    expect(doc.getString('text').length).toBe(10000);
  });
});

describe('Integer Parsing Safety', () => {
  it('should parse normal integers', () => {
    const doc = Odin.parse('num = ##42');
    expect(doc.getInteger('num')).toBe(42);
  });

  it('should parse negative integers', () => {
    const doc = Odin.parse('num = ##-100');
    expect(doc.getInteger('num')).toBe(-100);
  });

  it('should handle zero', () => {
    const doc = Odin.parse('num = ##0');
    expect(doc.getInteger('num')).toBe(0);
  });

  it('should handle large safe integers', () => {
    const doc = Odin.parse('num = ##9007199254740991');
    expect(doc.getInteger('num')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('Number Parsing Safety', () => {
  it('should parse decimal numbers', () => {
    const doc = Odin.parse('num = #3.14159');
    expect(doc.getNumber('num')).toBeCloseTo(3.14159);
  });

  it('should parse scientific notation', () => {
    const doc = Odin.parse('num = #1.5e10');
    expect(doc.getNumber('num')).toBe(1.5e10);
  });

  it('should parse currency values', () => {
    const doc = Odin.parse('price = #$99.99');
    expect(doc.getNumber('price')).toBeCloseTo(99.99);
  });
});

describe('Import Directive Validation', () => {
  it('should reject invalid import syntax', () => {
    expect(() => Odin.parse('@import')).toThrow(ParseError);
  });

  it('should reject empty import paths', () => {
    expect(() => Odin.parse('@import ""')).toThrow(ParseError);
    expect(() => Odin.parse("@import ''")).toThrow(ParseError);
  });

  it('should accept valid import directives', () => {
    const doc = Odin.parse('@import ./types.odin');
    expect(doc.imports.length).toBe(1);
    expect(doc.imports[0]?.path).toBe('./types.odin');
  });

  it('should accept import with alias', () => {
    const doc = Odin.parse('@import ./types.odin as types');
    expect(doc.imports.length).toBe(1);
    expect(doc.imports[0]?.alias).toBe('types');
  });
});
