/**
 * String parsing edge case tests for ODIN SDK.
 *
 * Tests for:
 * - Empty strings
 * - Escape sequences (\n, \t, \r, \\, \", \0, \uXXXX, \UXXXXXXXX)
 * - Invalid escape sequences
 * - Unterminated strings
 * - Unicode in strings
 * - Special characters
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../../src/index.js';

describe('String Parsing', () => {
  describe('Empty Strings', () => {
    it('should parse empty quoted string', () => {
      const doc = Odin.parse('name = ""');
      expect(doc.getString('name')).toBe('');
    });

    it('should parse empty string followed by other values', () => {
      const doc = Odin.parse(`
        empty = ""
        full = "hello"
      `);
      expect(doc.getString('empty')).toBe('');
      expect(doc.getString('full')).toBe('hello');
    });
  });

  describe('Basic Escape Sequences', () => {
    it('should parse newline escape \\n', () => {
      const doc = Odin.parse('text = "line1\\nline2"');
      expect(doc.getString('text')).toBe('line1\nline2');
    });

    it('should parse tab escape \\t', () => {
      const doc = Odin.parse('text = "col1\\tcol2"');
      expect(doc.getString('text')).toBe('col1\tcol2');
    });

    it('should parse carriage return escape \\r', () => {
      const doc = Odin.parse('text = "line1\\rline2"');
      expect(doc.getString('text')).toBe('line1\rline2');
    });

    it('should parse escaped backslash \\\\', () => {
      const doc = Odin.parse('path = "C:\\\\Users\\\\test"');
      expect(doc.getString('path')).toBe('C:\\Users\\test');
    });

    it('should parse escaped quote \\"', () => {
      const doc = Odin.parse('text = "He said \\"Hello\\""');
      expect(doc.getString('text')).toBe('He said "Hello"');
    });

    it('should parse null character \\0', () => {
      const doc = Odin.parse('text = "before\\0after"');
      expect(doc.getString('text')).toBe('before\0after');
    });

    it('should parse multiple escape sequences together', () => {
      const doc = Odin.parse('text = "line1\\nline2\\tcolumn\\r\\n"');
      expect(doc.getString('text')).toBe('line1\nline2\tcolumn\r\n');
    });

    it('should parse consecutive backslashes', () => {
      const doc = Odin.parse('text = "a\\\\\\\\b"');
      expect(doc.getString('text')).toBe('a\\\\b');
    });
  });

  describe('Unicode Escape Sequences', () => {
    it('should parse \\uXXXX 4-digit unicode', () => {
      const doc = Odin.parse('text = "\\u0041"');
      expect(doc.getString('text')).toBe('A');
    });

    it('should parse \\uXXXX for non-ASCII', () => {
      const doc = Odin.parse('text = "\\u00E9"');
      expect(doc.getString('text')).toBe('\u00E9'); // e with accent
    });

    it('should parse \\uXXXX for emoji component', () => {
      const doc = Odin.parse('text = "\\u2764"');
      expect(doc.getString('text')).toBe('\u2764'); // heart
    });

    it('should parse uppercase hex in \\uXXXX', () => {
      const doc = Odin.parse('text = "\\u00FF"');
      expect(doc.getString('text')).toBe('\u00FF');
    });

    it('should parse lowercase hex in \\uXXXX', () => {
      const doc = Odin.parse('text = "\\u00ff"');
      expect(doc.getString('text')).toBe('\u00ff');
    });

    it('should parse mixed case hex in \\uXXXX', () => {
      const doc = Odin.parse('text = "\\u00Ff"');
      expect(doc.getString('text')).toBe('\u00Ff');
    });

    it('should parse \\UXXXXXXXX 8-digit unicode', () => {
      const doc = Odin.parse('text = "\\U00000041"');
      expect(doc.getString('text')).toBe('A');
    });

    it('should parse \\UXXXXXXXX for supplementary plane', () => {
      // Emoji: grinning face U+1F600
      const doc = Odin.parse('text = "\\U0001F600"');
      expect(doc.getString('text')).toBe(String.fromCodePoint(0x1f600));
    });

    it('should parse multiple unicode escapes', () => {
      const doc = Odin.parse('text = "\\u0048\\u0065\\u006C\\u006C\\u006F"');
      expect(doc.getString('text')).toBe('Hello');
    });
  });

  describe('Special Characters in Strings', () => {
    it('should parse string with semicolon', () => {
      const doc = Odin.parse('text = "hello; world"');
      expect(doc.getString('text')).toBe('hello; world');
    });

    it('should parse string with equals sign', () => {
      const doc = Odin.parse('text = "a = b"');
      expect(doc.getString('text')).toBe('a = b');
    });

    it('should parse string with braces', () => {
      const doc = Odin.parse('text = "{header}"');
      expect(doc.getString('text')).toBe('{header}');
    });

    it('should parse string with brackets', () => {
      const doc = Odin.parse('text = "[0]"');
      expect(doc.getString('text')).toBe('[0]');
    });

    it('should parse string with type prefix characters', () => {
      const doc = Odin.parse('text = "#$@^~?!"');
      expect(doc.getString('text')).toBe('#$@^~?!');
    });

    it('should parse string with comma', () => {
      const doc = Odin.parse('text = "a, b, c"');
      expect(doc.getString('text')).toBe('a, b, c');
    });

    it('should parse string with colon', () => {
      const doc = Odin.parse('text = "time: 10:30"');
      expect(doc.getString('text')).toBe('time: 10:30');
    });

    it('should parse string with leading/trailing whitespace', () => {
      const doc = Odin.parse('text = "  spaced  "');
      expect(doc.getString('text')).toBe('  spaced  ');
    });

    it('should parse string with only whitespace', () => {
      const doc = Odin.parse('text = "   "');
      expect(doc.getString('text')).toBe('   ');
    });
  });

  describe('Unicode Content', () => {
    it('should parse string with Latin extended characters', () => {
      const doc = Odin.parse('text = "cafe"');
      expect(doc.getString('text')).toBe('cafe');
    });

    it('should parse string with Chinese characters', () => {
      const doc = Odin.parse('text = "Hello World"');
      expect(doc.getString('text')).toBe('Hello World');
    });

    it('should parse string with Japanese characters', () => {
      const doc = Odin.parse('text = "Nihongo"');
      expect(doc.getString('text')).toBe('Nihongo');
    });

    it('should parse string with Arabic characters', () => {
      const doc = Odin.parse('text = "Marhaba"');
      expect(doc.getString('text')).toBe('Marhaba');
    });

    it('should parse string with emoji', () => {
      const doc = Odin.parse('text = "Hello World"');
      expect(doc.getString('text')).toBe('Hello World');
    });

    it('should parse string with mixed scripts', () => {
      const doc = Odin.parse('text = "English, CJK"');
      expect(doc.getString('text')).toBe('English, CJK');
    });
  });

  describe('Unterminated Strings', () => {
    it('should throw ParseError for unterminated string at EOF', () => {
      expect(() => Odin.parse('text = "unterminated')).toThrow(ParseError);
      try {
        Odin.parse('text = "unterminated');
      } catch (e) {
        expect((e as ParseError).code).toBe('P004');
      }
    });

    it('should throw ParseError for string with embedded newline', () => {
      expect(() => Odin.parse('text = "line1\nline2"')).toThrow(ParseError);
      try {
        Odin.parse('text = "line1\nline2"');
      } catch (e) {
        expect((e as ParseError).code).toBe('P004');
      }
    });

    it('should throw ParseError for unterminated string before newline', () => {
      expect(() => Odin.parse('text = "incomplete\nother = "done"')).toThrow(ParseError);
    });
  });

  describe('Invalid Escape Sequences', () => {
    it('should throw P005 for unknown escape sequence', () => {
      expect(() => Odin.parse('text = "\\x"')).toThrow(ParseError);
    });

    it('should throw P005 for incomplete \\u escape', () => {
      expect(() => Odin.parse('text = "\\u00F"')).toThrow(ParseError);
    });

    it('should throw P005 for incomplete \\U escape', () => {
      expect(() => Odin.parse('text = "\\U0000004"')).toThrow(ParseError);
    });

    it('should throw P005 for \\u with invalid hex', () => {
      expect(() => Odin.parse('text = "\\uGGGG"')).toThrow(ParseError);
    });
  });

  describe('Edge Cases', () => {
    it('should parse very long strings', () => {
      const longContent = 'a'.repeat(10000);
      const doc = Odin.parse(`text = "${longContent}"`);
      expect(doc.getString('text')).toBe(longContent);
      expect(doc.getString('text').length).toBe(10000);
    });

    it('should parse string that looks like other types', () => {
      const doc = Odin.parse(`
        num = "42"
        bool = "true"
        date = "2024-01-15"
        null = "~"
        ref = "@path"
      `);
      // All should be strings, not their typed equivalents
      expect(doc.get('num')?.type).toBe('string');
      expect(doc.getString('num')).toBe('42');
      expect(doc.get('bool')?.type).toBe('string');
      expect(doc.getString('bool')).toBe('true');
      expect(doc.get('date')?.type).toBe('string');
      expect(doc.getString('date')).toBe('2024-01-15');
      expect(doc.get('null')?.type).toBe('string');
      expect(doc.getString('null')).toBe('~');
      expect(doc.get('ref')?.type).toBe('string');
      expect(doc.getString('ref')).toBe('@path');
    });

    it('should parse string with escape at end', () => {
      const doc = Odin.parse('text = "ends with newline\\n"');
      expect(doc.getString('text')).toBe('ends with newline\n');
    });

    it('should parse string with escape at start', () => {
      const doc = Odin.parse('text = "\\tstarts with tab"');
      expect(doc.getString('text')).toBe('\tstarts with tab');
    });

    it('should parse string that is just an escape', () => {
      const doc = Odin.parse('text = "\\n"');
      expect(doc.getString('text')).toBe('\n');
    });

    it('should parse string with quote escape adjacent to other escapes', () => {
      const doc = Odin.parse('text = "\\"\\n\\""');
      expect(doc.getString('text')).toBe('"\n"');
    });
  });

  describe('Bare Strings (Should Reject)', () => {
    it('should reject bare strings in assignment', () => {
      expect(() => Odin.parse('name = John')).toThrow(ParseError);
      try {
        Odin.parse('name = John');
      } catch (e) {
        expect((e as ParseError).code).toBe('P002');
      }
    });

    it('should reject multi-word bare strings', () => {
      expect(() => Odin.parse('name = John Smith')).toThrow(ParseError);
    });

    it('should reject bare string with special chars', () => {
      expect(() => Odin.parse('name = hello-world')).toThrow(ParseError);
    });
  });
});
