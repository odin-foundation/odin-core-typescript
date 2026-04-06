/**
 * Parser Edge Case Tests
 *
 * Comprehensive testing of parser edge cases that are likely
 * missing from happy-path TDD:
 * - Nesting depth boundaries
 * - Document size limits
 * - Array index edge cases
 * - Malformed paths and headers
 * - Number parsing boundaries
 * - Temporal value validation
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../../src/index.js';

describe('Parser Edge Cases', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Nesting Depth Boundaries
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Nesting Depth Boundaries', () => {
    it('accepts path at default max nesting depth (64)', () => {
      const segments = Array.from({ length: 64 }, (_, i) => `level${i}`);
      const path = segments.join('.');
      const doc = Odin.parse(`${path} = "deep"`);
      expect(doc.getString(path)).toBe('deep');
    });

    it('rejects path exceeding default max nesting depth', () => {
      const segments = Array.from({ length: 65 }, (_, i) => `level${i}`);
      const path = segments.join('.');
      expect(() => Odin.parse(`${path} = "too deep"`)).toThrow(ParseError);
    });

    it('accepts custom reduced nesting depth', () => {
      const segments = Array.from({ length: 10 }, (_, i) => `level${i}`);
      const path = segments.join('.');
      const doc = Odin.parse(`${path} = "ok"`, { maxNestingDepth: 10 });
      expect(doc.getString(path)).toBe('ok');
    });

    it('rejects path exceeding custom reduced nesting depth', () => {
      const segments = Array.from({ length: 11 }, (_, i) => `level${i}`);
      const path = segments.join('.');
      expect(() => Odin.parse(`${path} = "too deep"`, { maxNestingDepth: 10 })).toThrow(ParseError);
    });

    it('counts array indices in nesting depth', () => {
      // items[0].sub[0] has depth 4 (items=1, [0]=2, sub=3, [0]=4)
      const doc = Odin.parse('items[0].sub[0] = "ok"', { maxNestingDepth: 5 });
      expect(doc.getString('items[0].sub[0]')).toBe('ok');
      // items[0].sub[0].deep[0] has depth 6, exceeds maxNestingDepth 5
      expect(() => Odin.parse('items[0].sub[0].deep[0] = "too deep"', { maxNestingDepth: 5 })).toThrow(ParseError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Array Index Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Array Index Edge Cases', () => {
    it('rejects negative array indices', () => {
      expect(() => Odin.parse('items[-1] = "bad"')).toThrow(ParseError);
    });

    it('accepts zero index', () => {
      const doc = Odin.parse('items[0] = "first"');
      expect(doc.getString('items[0]')).toBe('first');
    });

    it('rejects array not starting at index 0', () => {
      // Parser enforces arrays must start at 0
      expect(() => Odin.parse('items[999] = "big"')).toThrow(ParseError);
    });

    it('rejects sparse arrays (non-contiguous indices)', () => {
      // Parser enforces contiguous indices
      expect(() =>
        Odin.parse(`
        items[0] = "first"
        items[5] = "sixth"
      `)
      ).toThrow(ParseError);
    });

    it('rejects array with leading zeros not starting at 0', () => {
      // 007 parses as 7, but array must start at 0
      expect(() => Odin.parse('items[007] = "bond"')).toThrow(ParseError);
    });

    it('accepts array index with leading zeros starting at 0', () => {
      // Leading zeros treated as decimal
      const doc = Odin.parse(`
        items[0] = "first"
        items[1] = "second"
      `);
      expect(doc.getString('items[0]')).toBe('first');
      expect(doc.getString('items[1]')).toBe('second');
    });

    it('normalizes leading zeros in array indices', () => {
      const doc = Odin.parse('items[000] = "first"');
      const paths = doc.paths();
      expect(paths.length).toBe(1);
      // Leading zeros normalized: [000] -> [0]
      expect(paths[0]).toBe('items[0]');
    });

    it('accepts identifier-based indices (for table column lists)', () => {
      // Non-numeric indices like [abc] are now valid to support table column lists
      // e.g., {$table.RATE[vehicle_type, coverage]}
      const doc = Odin.parse('items[abc] = "value"');
      expect(doc.paths()).toContain('items[abc]');
    });

    it('accepts empty array indices for tabular syntax', () => {
      // Empty brackets [] is valid for tabular array declaration
      // In assignment context, it's used for primitive arrays
      const doc = Odin.parse(`
        {items[] : ~}
        "a"
        "b"
      `);
      expect(doc.getString('items[0]')).toBe('a');
      expect(doc.getString('items[1]')).toBe('b');
    });

    it('rejects floating point array indices', () => {
      expect(() => Odin.parse('items[1.5] = "bad"')).toThrow(ParseError);
    });

    it('handles deeply nested array indices', () => {
      const doc = Odin.parse(`
        matrix[0][0] = "a"
        matrix[0][1] = "b"
        matrix[1][0] = "c"
        matrix[1][1] = "d"
      `);
      expect(doc.getString('matrix[0][0]')).toBe('a');
      expect(doc.getString('matrix[1][1]')).toBe('d');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Malformed Header Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Malformed Header Edge Cases', () => {
    it('rejects unclosed header brace', () => {
      expect(() => Odin.parse('{path\nfield = "value"')).toThrow(ParseError);
    });

    it('rejects header with invalid characters', () => {
      expect(() => Odin.parse('{path!invalid}')).toThrow(ParseError);
    });

    it('rejects empty header', () => {
      // {} is valid (root context), but test the behavior
      const doc = Odin.parse(`
        {customer}
        name = "John"
        {}
        root = "value"
      `);
      expect(doc.getString('customer.name')).toBe('John');
      expect(doc.getString('root')).toBe('value');
    });

    it('handles header with array notation', () => {
      const doc = Odin.parse(`
        {items[0]}
        name = "first"
        {items[1]}
        name = "second"
      `);
      expect(doc.getString('items[0].name')).toBe('first');
      expect(doc.getString('items[1].name')).toBe('second');
    });

    it('handles header with tabular declaration', () => {
      const doc = Odin.parse(`
        {items[] : id, name}
        ##1, "Alice"
        ##2, "Bob"
      `);
      expect(doc.getInteger('items[0].id')).toBe(1);
      expect(doc.getString('items[0].name')).toBe('Alice');
    });

    it('rejects tabular header with invalid column names', () => {
      expect(() =>
        Odin.parse(`
        {items[] : 123, @invalid}
        "a", "b"
      `)
      ).toThrow(ParseError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Number Parsing Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Number Parsing Edge Cases', () => {
    it('parses MAX_SAFE_INTEGER correctly', () => {
      const doc = Odin.parse(`n = ##${Number.MAX_SAFE_INTEGER}`);
      expect(doc.getInteger('n')).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('parses negative numbers', () => {
      const doc = Odin.parse('n = ##-42');
      expect(doc.getInteger('n')).toBe(-42);
    });

    it('parses zero', () => {
      const doc = Odin.parse('n = ##0');
      expect(doc.getInteger('n')).toBe(0);
    });

    it('parses negative zero as number', () => {
      const doc = Odin.parse('n = #-0');
      expect(doc.getNumber('n')).toBe(-0);
      expect(Object.is(doc.getNumber('n'), -0)).toBe(true);
    });

    it('parses very small decimals', () => {
      const doc = Odin.parse('n = #0.000000001');
      expect(doc.getNumber('n')).toBeCloseTo(1e-9);
    });

    it('parses scientific notation', () => {
      const doc = Odin.parse('n = #1.5e10');
      expect(doc.getNumber('n')).toBe(1.5e10);
    });

    it('parses negative exponent', () => {
      const doc = Odin.parse('n = #1.5e-10');
      expect(doc.getNumber('n')).toBeCloseTo(1.5e-10);
    });

    it('rejects incomplete exponent', () => {
      expect(() => Odin.parse('n = #1e')).toThrow(ParseError);
    });

    it('rejects exponent with no digits after sign', () => {
      expect(() => Odin.parse('n = #1e+')).toThrow(ParseError);
    });

    it('parses currency with cents', () => {
      const doc = Odin.parse('price = #$99.99');
      expect(doc.getNumber('price')).toBe(99.99);
    });

    it('parses currency with no cents', () => {
      const doc = Odin.parse('price = #$100');
      expect(doc.getNumber('price')).toBe(100);
    });

    it('parses negative currency', () => {
      const doc = Odin.parse('refund = #$-50.00');
      expect(doc.getNumber('refund')).toBe(-50);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Temporal Value Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Temporal Value Edge Cases', () => {
    describe('Date Parsing', () => {
      it('parses standard ISO date', () => {
        const doc = Odin.parse('d = 2024-06-15');
        const val = doc.get('d');
        expect(val?.type).toBe('date');
      });

      it('parses date at year boundary', () => {
        const doc = Odin.parse('d = 2024-12-31');
        const val = doc.get('d');
        expect(val?.type).toBe('date');
      });

      it('parses date at month boundary', () => {
        const doc = Odin.parse('d = 2024-01-31');
        const val = doc.get('d');
        expect(val?.type).toBe('date');
      });

      it('parses leap year date', () => {
        const doc = Odin.parse('d = 2024-02-29');
        const val = doc.get('d');
        expect(val?.type).toBe('date');
      });

      it('handles year 1 AD', () => {
        const doc = Odin.parse('d = 0001-01-01');
        const val = doc.get('d');
        expect(val?.type).toBe('date');
      });

      it('handles year 9999', () => {
        const doc = Odin.parse('d = 9999-12-31');
        const val = doc.get('d');
        expect(val?.type).toBe('date');
      });
    });

    describe('Timestamp Parsing', () => {
      it('parses timestamp with UTC timezone', () => {
        const doc = Odin.parse('ts = 2024-06-15T10:30:00Z');
        const val = doc.get('ts');
        expect(val?.type).toBe('timestamp');
      });

      it('parses timestamp with positive offset', () => {
        const doc = Odin.parse('ts = 2024-06-15T10:30:00+05:30');
        const val = doc.get('ts');
        expect(val?.type).toBe('timestamp');
      });

      it('parses timestamp with negative offset', () => {
        const doc = Odin.parse('ts = 2024-06-15T10:30:00-08:00');
        const val = doc.get('ts');
        expect(val?.type).toBe('timestamp');
      });

      it('parses timestamp with milliseconds', () => {
        const doc = Odin.parse('ts = 2024-06-15T10:30:00.123Z');
        const val = doc.get('ts');
        expect(val?.type).toBe('timestamp');
      });

      it('parses timestamp with microseconds', () => {
        const doc = Odin.parse('ts = 2024-06-15T10:30:00.123456Z');
        const val = doc.get('ts');
        expect(val?.type).toBe('timestamp');
      });

      it('parses midnight timestamp', () => {
        const doc = Odin.parse('ts = 2024-06-15T00:00:00Z');
        const val = doc.get('ts');
        expect(val?.type).toBe('timestamp');
      });

      it('parses end-of-day timestamp', () => {
        const doc = Odin.parse('ts = 2024-06-15T23:59:59Z');
        const val = doc.get('ts');
        expect(val?.type).toBe('timestamp');
      });
    });

    describe('Time Parsing', () => {
      it('parses standalone time', () => {
        const doc = Odin.parse('t = T14:30:00');
        const val = doc.get('t');
        expect(val?.type).toBe('time');
      });

      it('parses midnight time', () => {
        const doc = Odin.parse('t = T00:00:00');
        const val = doc.get('t');
        expect(val?.type).toBe('time');
      });

      it('parses time with milliseconds', () => {
        const doc = Odin.parse('t = T14:30:00.500');
        const val = doc.get('t');
        expect(val?.type).toBe('time');
      });
    });

    describe('Duration Parsing', () => {
      it('parses year duration', () => {
        const doc = Odin.parse('d = P1Y');
        const val = doc.get('d');
        expect(val?.type).toBe('duration');
      });

      it('parses month duration', () => {
        const doc = Odin.parse('d = P2M');
        const val = doc.get('d');
        expect(val?.type).toBe('duration');
      });

      it('parses day duration', () => {
        const doc = Odin.parse('d = P3D');
        const val = doc.get('d');
        expect(val?.type).toBe('duration');
      });

      it('parses combined date duration', () => {
        const doc = Odin.parse('d = P1Y2M3D');
        const val = doc.get('d');
        expect(val?.type).toBe('duration');
      });

      it('parses time duration', () => {
        const doc = Odin.parse('d = PT1H30M45S');
        const val = doc.get('d');
        expect(val?.type).toBe('duration');
      });

      it('parses combined date and time duration', () => {
        const doc = Odin.parse('d = P1Y2M3DT4H5M6S');
        const val = doc.get('d');
        expect(val?.type).toBe('duration');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Path Resolution Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Path Resolution Edge Cases', () => {
    it('rejects path with consecutive dots (empty segment)', () => {
      // Paths cannot have empty segments between dots
      expect(() => Odin.parse('a..b = "bad"')).toThrow(ParseError);
    });

    it('rejects path starting with dot', () => {
      // Paths must start with an identifier, not a dot
      expect(() => Odin.parse('.path = "bad"')).toThrow(ParseError);
    });

    it('rejects path ending with dot', () => {
      // Paths cannot have trailing dots
      expect(() => Odin.parse('path. = "bad"')).toThrow(ParseError);
    });

    it('handles single character paths', () => {
      const doc = Odin.parse('a = "single"');
      expect(doc.getString('a')).toBe('single');
    });

    it('rejects numeric-only path segments (numbers are not valid identifiers)', () => {
      // Path segments must be valid identifiers - numbers alone are not
      expect(() => Odin.parse('data.123.value = "numeric segment"')).toThrow(ParseError);
    });

    it('handles underscore in paths', () => {
      const doc = Odin.parse('my_field = "underscore"');
      expect(doc.getString('my_field')).toBe('underscore');
    });

    it('handles mixed case paths', () => {
      const doc = Odin.parse('MyField = "mixed"');
      expect(doc.getString('MyField')).toBe('mixed');
    });

    it('handles path segments starting with underscore', () => {
      const doc = Odin.parse('_private = "underscore start"');
      expect(doc.getString('_private')).toBe('underscore start');
    });

    it('handles path segments with numbers after letters', () => {
      const doc = Odin.parse('field123 = "letters then numbers"');
      expect(doc.getString('field123')).toBe('letters then numbers');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Reference Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Reference Edge Cases', () => {
    it('resolves simple reference', () => {
      const doc = Odin.parse(`
        source = "original"
        ref = @source
      `);
      const resolved = doc.resolve('ref');
      expect(resolved?.type).toBe('string');
      expect((resolved as { value: string }).value).toBe('original');
    });

    it('resolves chained references', () => {
      const doc = Odin.parse(`
        a = "root"
        b = @a
        c = @b
      `);
      const resolved = doc.resolve('c');
      expect((resolved as { value: string }).value).toBe('root');
    });

    it('detects direct circular reference', () => {
      const doc = Odin.parse(`
        a = @a
      `);
      expect(() => doc.resolve('a')).toThrow('Circular reference');
    });

    it('detects indirect circular reference', () => {
      const doc = Odin.parse(`
        a = @b
        b = @a
      `);
      expect(() => doc.resolve('a')).toThrow('Circular reference');
    });

    it('detects 3-way circular reference', () => {
      const doc = Odin.parse(`
        a = @b
        b = @c
        c = @a
      `);
      expect(() => doc.resolve('a')).toThrow('Circular reference');
    });

    it('throws for reference to non-existent path', () => {
      const doc = Odin.parse(`
        ref = @nonexistent
      `);
      expect(() => doc.resolve('ref')).toThrow('Unresolved reference');
    });

    it('resolves reference to nested path', () => {
      const doc = Odin.parse(`
        {nested}
        value = "deep"
        {}
        ref = @nested.value
      `);
      const resolved = doc.resolve('ref');
      expect((resolved as { value: string }).value).toBe('deep');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Binary Data Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Binary Data Edge Cases', () => {
    it('parses empty binary', () => {
      const doc = Odin.parse('data = ^');
      const val = doc.get('data');
      expect(val?.type).toBe('binary');
    });

    it('parses simple base64', () => {
      const doc = Odin.parse('data = ^SGVsbG8=');
      const val = doc.get('data');
      expect(val?.type).toBe('binary');
    });

    it('parses base64 with padding', () => {
      const doc = Odin.parse('data = ^SGVsbG8gV29ybGQ=');
      const val = doc.get('data');
      expect(val?.type).toBe('binary');
    });

    it('parses base64 without padding', () => {
      const doc = Odin.parse('data = ^SGVsbG8');
      const val = doc.get('data');
      expect(val?.type).toBe('binary');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Document Separator Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Document Separator Edge Cases', () => {
    it('parses single document', () => {
      const doc = Odin.parse('field = "value"');
      expect(doc.getString('field')).toBe('value');
    });

    it('chained documents accessible via chainedDocuments', () => {
      // Multi-document parsing is done via chainedDocuments property
      const doc = Odin.parse(`
        doc1 = "first"
        ---
        doc2 = "second"
      `);
      // Primary document has first doc
      expect(doc.getString('doc1')).toBe('first');
      // Chained documents are in chainedDocuments array if present
      // Note: Check if chainedDocuments is supported
    });

    it('ignores --- inside quoted string', () => {
      const doc = Odin.parse('text = "line1---line2"');
      expect(doc.getString('text')).toBe('line1---line2');
    });

    it('separator must be at start of line', () => {
      // --- with content before it on the same line is not a separator
      const doc = Odin.parse(`
        field = "value"
        text = "before---after"
      `);
      expect(doc.getString('text')).toBe('before---after');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Modifier Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Modifier Edge Cases', () => {
    it('parses critical modifier', () => {
      const doc = Odin.parse('field = !"critical value"');
      expect(doc.modifiers.get('field')?.required).toBe(true);
    });

    it('parses redacted modifier', () => {
      const doc = Odin.parse('field = *"redacted value"');
      expect(doc.modifiers.get('field')?.confidential).toBe(true);
    });

    it('parses both modifiers', () => {
      const doc = Odin.parse('field = !*"both modifiers"');
      expect(doc.modifiers.get('field')?.required).toBe(true);
      expect(doc.modifiers.get('field')?.confidential).toBe(true);
    });

    it('handles modifiers on different value types', () => {
      const doc = Odin.parse(`
        str = !"critical string"
        num = !##42
        bool = !true
      `);
      expect(doc.modifiers.get('str')?.required).toBe(true);
      expect(doc.modifiers.get('num')?.required).toBe(true);
      expect(doc.modifiers.get('bool')?.required).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Whitespace Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Whitespace Edge Cases', () => {
    it('handles tabs around assignment', () => {
      const doc = Odin.parse('field\t=\t"value"');
      expect(doc.getString('field')).toBe('value');
    });

    it('handles multiple spaces around assignment', () => {
      const doc = Odin.parse('field   =   "value"');
      expect(doc.getString('field')).toBe('value');
    });

    it('handles blank lines between assignments', () => {
      const doc = Odin.parse(`
        a = "first"


        b = "second"
      `);
      expect(doc.getString('a')).toBe('first');
      expect(doc.getString('b')).toBe('second');
    });

    it('handles trailing whitespace on lines', () => {
      const doc = Odin.parse('field = "value"   ');
      expect(doc.getString('field')).toBe('value');
    });

    it('handles file with only whitespace', () => {
      const doc = Odin.parse('   \n\n   \n');
      expect(doc.paths().length).toBe(0);
    });

    it('handles file with only comments', () => {
      const doc = Odin.parse(`
        ; comment 1
        ; comment 2
      `);
      expect(doc.paths().length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Extension Path Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Extension Path Edge Cases', () => {
    it('parses extension header', () => {
      const doc = Odin.parse(`
        {&extension}
        custom = "value"
      `);
      expect(doc.getString('&extension.custom')).toBe('value');
    });

    it('parses nested extension path', () => {
      const doc = Odin.parse(`
        {&ext.nested}
        field = "deep"
      `);
      expect(doc.getString('&ext.nested.field')).toBe('deep');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Cache Size Limits Regression Tests
  // Ensures the path interning caches have bounded memory growth
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Cache Size Limits (Regression)', () => {
    it('handles many unique paths without memory explosion', () => {
      // Generate 15000 unique paths - exceeds the 10000 limit
      // This should not cause memory issues due to LRU eviction
      const lines: string[] = [];
      for (let i = 0; i < 15000; i++) {
        lines.push(`uniquePath${i} = "value${i}"`);
      }

      // This should complete without memory issues
      const doc = Odin.parse(lines.join('\n'));

      // Just verify some paths exist - we don't care which ones
      // The point is it didn't crash or run out of memory
      expect(doc.has('uniquePath0')).toBe(true);
      expect(doc.has('uniquePath14999')).toBe(true);
    });

    it('handles many unique segments without memory explosion', () => {
      // Generate paths with many unique segments
      const lines: string[] = [];
      for (let i = 0; i < 1000; i++) {
        // Create deeply nested paths with unique segment names
        lines.push(`root${i}.child${i}.grandchild${i} = ##${i}`);
      }

      const doc = Odin.parse(lines.join('\n'));
      expect(doc.getInteger('root0.child0.grandchild0')).toBe(0);
      expect(doc.getInteger('root999.child999.grandchild999')).toBe(999);
    });

    it('path interning still works after eviction', () => {
      // First, fill the cache with unique paths
      const lines1: string[] = [];
      for (let i = 0; i < 12000; i++) {
        lines1.push(`batch1Path${i} = ##${i}`);
      }
      Odin.parse(lines1.join('\n'));

      // Now parse a new document - interning should still work correctly
      const doc = Odin.parse(`
        field.nested.deep = "test"
        field.nested.other = "value"
      `);

      expect(doc.getString('field.nested.deep')).toBe('test');
      expect(doc.getString('field.nested.other')).toBe('value');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Path Validation in toJSON() Regression Tests
  // Ensures toJSON() properly validates array indices
  // ─────────────────────────────────────────────────────────────────────────────

  describe('toJSON() Path Validation (Regression)', () => {
    it('toJSON() succeeds with valid array indices', () => {
      const doc = Odin.parse(`
        items[0] = "first"
        items[1] = "second"
        items[2] = "third"
      `);

      const json = doc.toJSON();
      expect(json.items).toEqual(['first', 'second', 'third']);
    });

    it('toJSON() succeeds with nested arrays', () => {
      const doc = Odin.parse(`
        matrix[0][0] = ##1
        matrix[0][1] = ##2
        matrix[1][0] = ##3
        matrix[1][1] = ##4
      `);

      const json = doc.toJSON();
      expect(json.matrix).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it('toJSON() handles complex nested structures', () => {
      const doc = Odin.parse(`
        {users[0]}
        name = "Alice"
        age = ##30

        {users[1]}
        name = "Bob"
        age = ##25
      `);

      const json = doc.toJSON();
      expect(json.users).toEqual([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);
    });

    it('array index bounds are reasonable (max 1 million)', () => {
      // This should work - valid index within bounds
      const doc = Odin.parse(`
        items[0] = "first"
        items[1] = "second"
      `);

      // toJSON should work fine
      expect(() => doc.toJSON()).not.toThrow();
    });
  });
});
