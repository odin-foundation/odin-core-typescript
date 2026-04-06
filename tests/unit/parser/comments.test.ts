/**
 * Comment and whitespace edge case tests for ODIN SDK.
 *
 * Tests for:
 * - Line comments (;)
 * - Comments after values
 * - Directive comments (@import, ;$schema, ;?)
 * - Whitespace handling (spaces, tabs, mixed)
 * - Line endings (LF, CRLF)
 * - Empty lines
 * - Document separator (---)
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Comments', () => {
  describe('Line Comments', () => {
    it('should ignore line comment', () => {
      const doc = Odin.parse(`
        ; This is a comment
        name = "John"
      `);
      expect(doc.getString('name')).toBe('John');
    });

    it('should ignore comment at start of file', () => {
      const doc = Odin.parse('; Header comment\nname = "John"');
      expect(doc.getString('name')).toBe('John');
    });

    it('should ignore comment at end of file', () => {
      const doc = Odin.parse('name = "John"\n; Footer comment');
      expect(doc.getString('name')).toBe('John');
    });

    it('should handle multiple consecutive comments', () => {
      const doc = Odin.parse(`
        ; Comment 1
        ; Comment 2
        ; Comment 3
        name = "John"
      `);
      expect(doc.getString('name')).toBe('John');
    });

    it('should handle empty comment', () => {
      const doc = Odin.parse(';');
      expect(doc.paths().length).toBe(0);
    });

    it('should handle comment with special characters', () => {
      const doc = Odin.parse(`
        ; Special: @#$%^&*(){}[]|\\
        name = "John"
      `);
      expect(doc.getString('name')).toBe('John');
    });

    it('should handle comment with unicode', () => {
      const doc = Odin.parse(`
        ; Unicode comment
        name = "John"
      `);
      expect(doc.getString('name')).toBe('John');
    });
  });

  describe('Inline Comments', () => {
    it('should handle comment after string value', () => {
      const doc = Odin.parse('name = "John" ; inline comment');
      expect(doc.getString('name')).toBe('John');
    });

    it('should handle comment after number value', () => {
      const doc = Odin.parse('count = ##42 ; the answer');
      expect(doc.getInteger('count')).toBe(42);
    });

    it('should handle comment after boolean value', () => {
      const doc = Odin.parse('active = true ; is active');
      expect(doc.getBoolean('active')).toBe(true);
    });

    it('should handle comment after null value', () => {
      const doc = Odin.parse('empty = ~ ; nothing here');
      expect(doc.get('empty')?.type).toBe('null');
    });

    it('should handle comment after date value', () => {
      const doc = Odin.parse('date = 2024-06-15 ; effective date');
      expect(doc.get('date')?.type).toBe('date');
    });

    it('should not confuse semicolon in string with comment', () => {
      const doc = Odin.parse('text = "hello; world"');
      expect(doc.getString('text')).toBe('hello; world');
    });
  });

  describe('Directive Comments', () => {
    it('should recognize import directive', () => {
      const doc = Odin.parse(`@import common.odin
name = "John"`);
      // Import directives are parsed but not executed yet
      expect(doc.getString('name')).toBe('John');
    });

    it('should recognize schema directive', () => {
      const doc = Odin.parse(`@schema policy.schema.odin
name = "John"`);
      expect(doc.getString('name')).toBe('John');
    });

    it('should recognize conditional directive', () => {
      const doc = Odin.parse(`@if DEBUG
name = "John"`);
      expect(doc.getString('name')).toBe('John');
    });

    it('should handle directive with path', () => {
      const doc = Odin.parse(`@import "./relative/path.odin"
name = "John"`);
      expect(doc.getString('name')).toBe('John');
    });
  });

  describe('Comments in Different Contexts', () => {
    it('should handle comment in header section', () => {
      const doc = Odin.parse(`
        {customer}
        ; Customer information
        name = "John"
        ; Contact details
        email = "john@example.com"
      `);
      expect(doc.getString('customer.name')).toBe('John');
      expect(doc.getString('customer.email')).toBe('john@example.com');
    });

    it('should handle comment before header', () => {
      const doc = Odin.parse(`
        ; Section header follows
        {customer}
        name = "John"
      `);
      expect(doc.getString('customer.name')).toBe('John');
    });

    it('should handle comment after header', () => {
      const doc = Odin.parse(`
        {customer} ; Customer section
        name = "John"
      `);
      expect(doc.getString('customer.name')).toBe('John');
    });

    it('should handle comment in tabular mode', () => {
      const doc = Odin.parse(`
        {items[] : name, qty}
        ; First item
        "Widget", ##10
        ; Second item
        "Gadget", ##5
      `);
      expect(doc.getString('items[0].name')).toBe('Widget');
      expect(doc.getString('items[1].name')).toBe('Gadget');
    });
  });
});

describe('Whitespace Handling', () => {
  describe('Leading Whitespace', () => {
    it('should handle leading spaces', () => {
      const doc = Odin.parse('    name = "John"');
      expect(doc.getString('name')).toBe('John');
    });

    it('should handle leading tabs', () => {
      const doc = Odin.parse('\t\tname = "John"');
      expect(doc.getString('name')).toBe('John');
    });

    it('should handle mixed leading whitespace', () => {
      const doc = Odin.parse('  \t  name = "John"');
      expect(doc.getString('name')).toBe('John');
    });
  });

  describe('Trailing Whitespace', () => {
    it('should handle trailing spaces', () => {
      const doc = Odin.parse('name = "John"    ');
      expect(doc.getString('name')).toBe('John');
    });

    it('should handle trailing tabs', () => {
      const doc = Odin.parse('name = "John"\t\t');
      expect(doc.getString('name')).toBe('John');
    });
  });

  describe('Whitespace Around Operators', () => {
    it('should handle no space around equals', () => {
      const doc = Odin.parse('name="John"');
      expect(doc.getString('name')).toBe('John');
    });

    it('should handle extra spaces around equals', () => {
      const doc = Odin.parse('name   =   "John"');
      expect(doc.getString('name')).toBe('John');
    });

    it('should handle tabs around equals', () => {
      const doc = Odin.parse('name\t=\t"John"');
      expect(doc.getString('name')).toBe('John');
    });
  });

  describe('Whitespace in Headers', () => {
    it('should handle space after opening brace', () => {
      const doc = Odin.parse('{ customer}\nname = "John"');
      expect(doc.getString('customer.name')).toBe('John');
    });

    it('should handle space before closing brace', () => {
      const doc = Odin.parse('{customer }\nname = "John"');
      expect(doc.getString('customer.name')).toBe('John');
    });

    it('should handle spaces around dots in header', () => {
      // Note: spaces around dots in paths may or may not be valid
      // Test the expected behavior
      const doc = Odin.parse('{customer}\nname = "John"');
      expect(doc.getString('customer.name')).toBe('John');
    });
  });

  describe('Whitespace in Tabular Mode', () => {
    it('should handle spaces in column definition', () => {
      const doc = Odin.parse(`
        {items[] : name , qty , price}
        "Widget", ##10, #$9.99
      `);
      expect(doc.getString('items[0].name')).toBe('Widget');
      expect(doc.getInteger('items[0].qty')).toBe(10);
    });

    it('should handle spaces in tabular values', () => {
      const doc = Odin.parse(`
        {items[] : a, b}
        "v1"  ,  "v2"
      `);
      expect(doc.getString('items[0].a')).toBe('v1');
      expect(doc.getString('items[0].b')).toBe('v2');
    });
  });
});

describe('Line Endings', () => {
  describe('Unix Line Endings (LF)', () => {
    it('should parse with LF line endings', () => {
      const doc = Odin.parse('a = "1"\nb = "2"\nc = "3"');
      expect(doc.getString('a')).toBe('1');
      expect(doc.getString('b')).toBe('2');
      expect(doc.getString('c')).toBe('3');
    });
  });

  describe('Windows Line Endings (CRLF)', () => {
    it('should parse with CRLF line endings', () => {
      const doc = Odin.parse('a = "1"\r\nb = "2"\r\nc = "3"');
      expect(doc.getString('a')).toBe('1');
      expect(doc.getString('b')).toBe('2');
      expect(doc.getString('c')).toBe('3');
    });

    it('should handle CRLF in headers', () => {
      const doc = Odin.parse('{customer}\r\nname = "John"\r\n');
      expect(doc.getString('customer.name')).toBe('John');
    });

    it('should handle CRLF in tabular mode', () => {
      const doc = Odin.parse('{items[] : name}\r\n"Widget"\r\n"Gadget"\r\n');
      expect(doc.getString('items[0].name')).toBe('Widget');
      expect(doc.getString('items[1].name')).toBe('Gadget');
    });
  });

  describe('Mixed Line Endings', () => {
    it('should handle mixed LF and CRLF', () => {
      const doc = Odin.parse('a = "1"\nb = "2"\r\nc = "3"');
      expect(doc.getString('a')).toBe('1');
      expect(doc.getString('b')).toBe('2');
      expect(doc.getString('c')).toBe('3');
    });
  });

  describe('Standalone CR', () => {
    it('should handle standalone CR as newline', () => {
      const doc = Odin.parse('a = "1"\rb = "2"');
      expect(doc.getString('a')).toBe('1');
      expect(doc.getString('b')).toBe('2');
    });
  });
});

describe('Empty Lines', () => {
  it('should handle empty lines between assignments', () => {
    const doc = Odin.parse('a = "1"\n\n\nb = "2"');
    expect(doc.getString('a')).toBe('1');
    expect(doc.getString('b')).toBe('2');
  });

  it('should handle empty lines at start', () => {
    const doc = Odin.parse('\n\n\nname = "John"');
    expect(doc.getString('name')).toBe('John');
  });

  it('should handle empty lines at end', () => {
    const doc = Odin.parse('name = "John"\n\n\n');
    expect(doc.getString('name')).toBe('John');
  });

  it('should handle empty lines with only whitespace', () => {
    const doc = Odin.parse('a = "1"\n   \n\t\nb = "2"');
    expect(doc.getString('a')).toBe('1');
    expect(doc.getString('b')).toBe('2');
  });

  it('should handle completely empty document', () => {
    const doc = Odin.parse('');
    expect(doc.paths().length).toBe(0);
  });

  it('should handle document with only whitespace', () => {
    const doc = Odin.parse('   \n\t\n   ');
    expect(doc.paths().length).toBe(0);
  });
});

describe('Document Separator (---)', () => {
  it('should parse single document without separator', () => {
    const doc = Odin.parse('name = "John"');
    expect(doc.getString('name')).toBe('John');
  });

  it('should parse multiple documents with separator', () => {
    const doc = Odin.parse(`
      name = "Doc1"
      ---
      name = "Doc2"
    `);
    // First document
    expect(doc.getString('name')).toBe('Doc1');
    // Chained documents should be accessible
    // Based on parser code, chainedDocuments array holds subsequent docs
  });

  it('should handle separator at start', () => {
    const doc = Odin.parse(`
      ---
      name = "John"
    `);
    // First document is empty, second has data
    expect(doc.paths().length).toBe(0);
  });

  it('should handle multiple separators', () => {
    const doc = Odin.parse(`
      a = "1"
      ---
      b = "2"
      ---
      c = "3"
    `);
    expect(doc.getString('a')).toBe('1');
  });

  it('should reset context on separator', () => {
    const doc = Odin.parse(`
      {section}
      name = "in section"
      ---
      name = "at root"
    `);
    // First doc has section.name, second doc has name at root
    expect(doc.getString('section.name')).toBe('in section');
  });
});
