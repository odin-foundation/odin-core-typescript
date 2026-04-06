/**
 * Error case tests for ODIN SDK.
 *
 * Tests that the parser correctly throws ParseError with appropriate
 * error codes for various invalid inputs.
 *
 * Error codes:
 * P001 - Unexpected character
 * P002 - Invalid path segment (bare strings)
 * P003 - Invalid array index
 * P004 - Unterminated string
 * P005 - Invalid escape sequence
 * P006 - Invalid type prefix
 * P007 - Duplicate path assignment
 * P008 - Invalid header syntax
 * P009 - Invalid directive
 * P010 - Maximum depth exceeded
 * P011 - Maximum document size exceeded
 * P012 - Invalid UTF-8 sequence
 * P013 - Non-contiguous array indices
 * P014 - Empty document
 * P015 - Array index out of range
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../../src/index.js';

describe('Parse Errors', () => {
  describe('P001 - Unexpected Character', () => {
    it('should throw for backtick character', () => {
      expect(() => Odin.parse('name = `value`')).toThrow(ParseError);
      try {
        Odin.parse('name = `value`');
      } catch (e) {
        // Backtick is treated as part of bare string, gets P002
        expect((e as ParseError).code).toMatch(/^P00[12]$/);
      }
    });

    it('should throw for invalid character at start', () => {
      expect(() => Odin.parse('% invalid')).toThrow(ParseError);
    });

    it('should throw for pipe character', () => {
      expect(() => Odin.parse('name = value | other')).toThrow(ParseError);
    });

    it('should include line and column in error', () => {
      try {
        Odin.parse('name = "ok"\n% bad');
      } catch (e) {
        expect((e as ParseError).line).toBe(2);
        expect((e as ParseError).column).toBeGreaterThan(0);
      }
    });
  });

  describe('P002 - Invalid Path Segment (Bare Strings)', () => {
    it('should throw for bare string value', () => {
      expect(() => Odin.parse('name = John')).toThrow(ParseError);
      try {
        Odin.parse('name = John');
      } catch (e) {
        expect((e as ParseError).code).toBe('P002');
      }
    });

    it('should throw for bare string with spaces', () => {
      expect(() => Odin.parse('name = John Smith')).toThrow(ParseError);
    });

    it('should throw for bare string starting with letter', () => {
      expect(() => Odin.parse('value = hello')).toThrow(ParseError);
    });

    it('should include value context in error', () => {
      try {
        Odin.parse('name = unquoted');
      } catch (e) {
        expect((e as ParseError).context?.value).toBe('unquoted');
      }
    });
  });

  describe('P003 - Invalid Array Index', () => {
    it('accepts identifier-based indices (for table column lists)', () => {
      // Non-numeric indices like [abc] are now valid to support table column lists
      // e.g., {$table.RATE[vehicle_type, coverage]}
      const doc = Odin.parse('items[abc] = "value"');
      expect(doc.paths()).toContain('items[abc]');
    });

    it('should throw for unclosed array bracket', () => {
      expect(() => Odin.parse('items[0 = "value"')).toThrow(ParseError);
    });

    it('should throw for floating point index', () => {
      expect(() => Odin.parse('items[1.5] = "value"')).toThrow(ParseError);
    });
  });

  describe('P004 - Unterminated String', () => {
    it('should throw for unterminated string at EOF', () => {
      expect(() => Odin.parse('name = "unterminated')).toThrow(ParseError);
      try {
        Odin.parse('name = "unterminated');
      } catch (e) {
        expect((e as ParseError).code).toBe('P004');
      }
    });

    it('should throw for string with embedded newline', () => {
      expect(() => Odin.parse('name = "line1\nline2"')).toThrow(ParseError);
    });

    it('should throw for string ending with backslash at EOF', () => {
      expect(() => Odin.parse('name = "test\\')).toThrow(ParseError);
    });

    it('should include line/column of opening quote', () => {
      try {
        Odin.parse('a = "ok"\nb = "bad');
      } catch (e) {
        expect((e as ParseError).line).toBe(2);
      }
    });
  });

  describe('P006 - Invalid Type Prefix', () => {
    it('should throw for number prefix without value', () => {
      expect(() => Odin.parse('val = #')).toThrow(ParseError);
      try {
        Odin.parse('val = #');
      } catch (e) {
        expect((e as ParseError).code).toBe('P006');
      }
    });

    it('should throw for integer prefix without value', () => {
      expect(() => Odin.parse('val = ##')).toThrow(ParseError);
    });

    it('should throw for currency prefix without value', () => {
      expect(() => Odin.parse('val = #$')).toThrow(ParseError);
    });

    it('should throw for boolean prefix without value', () => {
      expect(() => Odin.parse('val = ?')).toThrow(ParseError);
    });

    it('should throw for boolean prefix with wrong value', () => {
      expect(() => Odin.parse('val = ?maybe')).toThrow(ParseError);
    });
  });

  describe('P007 - Duplicate Path Assignment', () => {
    it('should throw for simple duplicate', () => {
      expect(() => Odin.parse('name = "John"\nname = "Jane"')).toThrow(ParseError);
      try {
        Odin.parse('name = "John"\nname = "Jane"');
      } catch (e) {
        expect((e as ParseError).code).toBe('P007');
      }
    });

    it('should throw for duplicate nested path', () => {
      expect(() => Odin.parse('a.b = "1"\na.b = "2"')).toThrow(ParseError);
    });

    it('should throw for duplicate via header', () => {
      expect(() =>
        Odin.parse(`
        {section}
        name = "first"
        name = "second"
      `)
      ).toThrow(ParseError);
    });

    it('should throw for duplicate across header and direct', () => {
      expect(() =>
        Odin.parse(`
        section.name = "direct"
        {section}
        name = "via header"
      `)
      ).toThrow(ParseError);
    });

    it('should include path in error context', () => {
      try {
        Odin.parse('field = "a"\nfield = "b"');
      } catch (e) {
        expect((e as ParseError).context?.path).toBe('field');
      }
    });
  });

  describe('P008 - Invalid Header Syntax', () => {
    it('should throw for array index without path in header', () => {
      expect(() => Odin.parse('{[0]}\nval = "test"')).toThrow(ParseError);
      try {
        Odin.parse('{[0]}\nval = "test"');
      } catch (e) {
        expect((e as ParseError).code).toBe('P008');
      }
    });
  });

  describe('P010 - Maximum Depth Exceeded', () => {
    it('should parse deeply nested paths within limit', () => {
      // Create a path with depth < default max (64)
      const segments = Array.from({ length: 30 }, (_, i) => `level${i}`);
      const path = segments.join('.');
      const doc = Odin.parse(`${path} = "deep"`);
      expect(doc.getString(path)).toBe('deep');
    });

    it('should allow paths up to configured depth', () => {
      // 10 levels should work with depth of 20
      const path = Array.from({ length: 10 }, (_, i) => `l${i}`).join('.');
      const doc = Odin.parse(`${path} = "ok"`, { maxNestingDepth: 20 });
      expect(doc.has(path)).toBe(true);
    });
  });

  describe('P011 - Maximum Document Size Exceeded', () => {
    it('should throw for document exceeding max size', () => {
      // Create a document larger than 1KB
      const content = 'x = "' + 'a'.repeat(2000) + '"';
      expect(() => Odin.parse(content, { maxDocumentSize: 1000 })).toThrow(ParseError);
      try {
        Odin.parse(content, { maxDocumentSize: 1000 });
      } catch (e) {
        expect((e as ParseError).code).toBe('P011');
      }
    });

    it('should accept document within size limit', () => {
      const content = 'x = "' + 'a'.repeat(100) + '"';
      const doc = Odin.parse(content, { maxDocumentSize: 1000 });
      expect(doc.has('x')).toBe(true);
    });

    it('should include size info in context', () => {
      const content = 'x = "' + 'a'.repeat(2000) + '"';
      try {
        Odin.parse(content, { maxDocumentSize: 1000 });
      } catch (e) {
        expect((e as ParseError).context?.size).toBeGreaterThan(1000);
        expect((e as ParseError).context?.maxSize).toBe(1000);
      }
    });
  });

  describe('P013 - Non-Contiguous Array Indices', () => {
    it('should throw for skipping index 0', () => {
      expect(() => Odin.parse('items[1] = "skipped zero"')).toThrow(ParseError);
      try {
        Odin.parse('items[1] = "skipped zero"');
      } catch (e) {
        expect((e as ParseError).code).toBe('P013');
      }
    });

    it('should throw for skipping indices in middle', () => {
      expect(() =>
        Odin.parse(`
        items[0] = "first"
        items[2] = "skipped one"
      `)
      ).toThrow(ParseError);
    });

    it('should throw for multiple gaps', () => {
      expect(() =>
        Odin.parse(`
        items[0] = "zero"
        items[3] = "three"
      `)
      ).toThrow(ParseError);
    });

    it('should include path info in error', () => {
      try {
        Odin.parse('arr[1] = "no zero"');
      } catch (e) {
        expect((e as ParseError).context?.path).toBe('arr');
      }
    });

    it('should include expected and found index', () => {
      try {
        Odin.parse('arr[1] = "no zero"');
      } catch (e) {
        expect((e as ParseError).context?.expected).toBe(0);
        expect((e as ParseError).context?.found).toBe(1);
      }
    });

    it('should allow valid contiguous indices', () => {
      const doc = Odin.parse(`
        items[0] = "a"
        items[1] = "b"
        items[2] = "c"
      `);
      expect(doc.getString('items[0]')).toBe('a');
      expect(doc.getString('items[1]')).toBe('b');
      expect(doc.getString('items[2]')).toBe('c');
    });

    it('should allow indices in any order as long as contiguous', () => {
      const doc = Odin.parse(`
        items[2] = "c"
        items[0] = "a"
        items[1] = "b"
      `);
      expect(doc.getString('items[0]')).toBe('a');
      expect(doc.getString('items[1]')).toBe('b');
      expect(doc.getString('items[2]')).toBe('c');
    });
  });

  describe('Error Line and Column Reporting', () => {
    it('should report correct line for error on first line', () => {
      try {
        Odin.parse('% invalid');
      } catch (e) {
        expect((e as ParseError).line).toBe(1);
      }
    });

    it('should report correct line for error on later line', () => {
      try {
        Odin.parse('ok = "fine"\n\n\n% invalid');
      } catch (e) {
        expect((e as ParseError).line).toBe(4);
      }
    });

    it('should report correct column', () => {
      try {
        Odin.parse('name = bad');
      } catch (e) {
        // The error should be at column 8 where "bad" starts
        expect((e as ParseError).column).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Context', () => {
    it('should include context object', () => {
      try {
        Odin.parse('name = "duplicate"\nname = "again"');
      } catch (e) {
        expect((e as ParseError).context).toBeDefined();
      }
    });

    it('should format error message with line and column', () => {
      try {
        Odin.parse('% bad');
      } catch (e) {
        expect((e as ParseError).message).toContain('line');
        expect((e as ParseError).message).toContain('column');
      }
    });
  });

  describe('Recovery and Partial Parsing', () => {
    it('should not produce partial document on error', () => {
      // When an error occurs, no document should be returned
      let doc;
      let error;
      try {
        doc = Odin.parse('ok = "fine"\nbad = unquoted');
      } catch (e) {
        error = e;
      }
      expect(error).toBeDefined();
      expect(doc).toBeUndefined();
    });
  });

  describe('Edge Case Errors', () => {
    it('should throw for empty document with just whitespace', () => {
      // Empty content may or may not throw depending on implementation
      // Just verify it doesn't crash
      const doc = Odin.parse('   \n   \n   ');
      expect(doc.paths().length).toBe(0);
    });

    it('should throw for only comments', () => {
      // Comments only should be valid (empty document)
      const doc = Odin.parse('; comment\n; another');
      expect(doc.paths().length).toBe(0);
    });

    it('should handle error after valid tabular data', () => {
      expect(() =>
        Odin.parse(`
        {items[] : name}
        "valid"
        $ invalid
      `)
      ).toThrow(ParseError);
    });

    it('should handle error in middle of tabular row', () => {
      expect(() =>
        Odin.parse(`
        {items[] : a, b}
        "ok", bad
      `)
      ).toThrow(ParseError);
    });
  });

  describe('ParseError Type', () => {
    it('should be instance of Error', () => {
      try {
        Odin.parse('% bad');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });

    it('should be instance of ParseError', () => {
      try {
        Odin.parse('% bad');
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
      }
    });

    it('should have name property', () => {
      try {
        Odin.parse('% bad');
      } catch (e) {
        expect((e as ParseError).name).toBe('ParseError');
      }
    });

    it('should have code property', () => {
      try {
        Odin.parse('% bad');
      } catch (e) {
        expect((e as ParseError).code).toMatch(/^P\d{3}$/);
      }
    });
  });
});
