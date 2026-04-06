/**
 * Stringify Edge Case Tests
 *
 * Test serialization edge cases:
 * - String escaping (control characters, special chars)
 * - Number formatting (Infinity, NaN, precision)
 * - Roundtrip integrity
 * - Tabular output edge cases
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Stringify Edge Cases', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // String Escaping
  // ─────────────────────────────────────────────────────────────────────────────

  describe('String Escaping', () => {
    it('escapes backslash', () => {
      const doc = Odin.parse('path = "C:\\\\Users\\\\file"');
      const output = Odin.stringify(doc);
      expect(output).toContain('\\\\');
      // Roundtrip
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('path')).toBe('C:\\Users\\file');
    });

    it('escapes double quotes', () => {
      const doc = Odin.parse('text = "He said \\"Hello\\""');
      const output = Odin.stringify(doc);
      expect(output).toContain('\\"');
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('He said "Hello"');
    });

    it('escapes newlines', () => {
      const doc = Odin.parse('text = "line1\\nline2"');
      const output = Odin.stringify(doc);
      expect(output).toContain('\\n');
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('line1\nline2');
    });

    it('escapes carriage returns', () => {
      const doc = Odin.parse('text = "line1\\rline2"');
      const output = Odin.stringify(doc);
      expect(output).toContain('\\r');
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('line1\rline2');
    });

    it('escapes tabs', () => {
      const doc = Odin.parse('text = "col1\\tcol2"');
      const output = Odin.stringify(doc);
      expect(output).toContain('\\t');
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('col1\tcol2');
    });

    it('handles all escape sequences together', () => {
      const original = 'C:\\path\t"name"\n\r';
      const doc = Odin.parse(`text = "C:\\\\path\\t\\"name\\"\\n\\r"`);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe(original);
    });

    it('handles string with only special characters', () => {
      const doc = Odin.parse('text = "\\n\\r\\t\\\\\\""');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('\n\r\t\\"');
    });

    it('handles empty string', () => {
      const doc = Odin.parse('text = ""');
      const output = Odin.stringify(doc);
      expect(output).toContain('""');
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('');
    });

    it('handles very long string', () => {
      const longValue = 'a'.repeat(10000);
      const doc = Odin.parse(`text = "${longValue}"`);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe(longValue);
    });

    it('handles string with repeated escape sequences', () => {
      const doc = Odin.parse('text = "\\n\\n\\n\\n\\n"');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('\n\n\n\n\n');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Number Formatting
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Number Formatting', () => {
    it('formats integer', () => {
      const doc = Odin.parse('n = ##42');
      const output = Odin.stringify(doc);
      expect(output).toContain('##42');
    });

    it('formats negative integer', () => {
      const doc = Odin.parse('n = ##-123');
      const output = Odin.stringify(doc);
      expect(output).toContain('##-123');
    });

    it('formats decimal', () => {
      const doc = Odin.parse('n = #3.14');
      const output = Odin.stringify(doc);
      expect(output).toContain('#3.14');
    });

    it('formats currency', () => {
      const doc = Odin.parse('price = #$99.99');
      const output = Odin.stringify(doc);
      expect(output).toContain('#$99.99');
    });

    it('formats zero', () => {
      const doc = Odin.parse('n = ##0');
      const output = Odin.stringify(doc);
      expect(output).toContain('##0');
    });

    it('preserves decimal places in currency', () => {
      const doc = Odin.parse('price = #$100.00');
      const output = Odin.stringify(doc);
      expect(output).toContain('100');
    });

    it('formats scientific notation', () => {
      const doc = Odin.parse('n = #1.5e10');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getNumber('n')).toBe(1.5e10);
    });

    it('formats very small numbers', () => {
      const doc = Odin.parse('n = #0.000001');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getNumber('n')).toBeCloseTo(0.000001);
    });

    it('formats MAX_SAFE_INTEGER', () => {
      const doc = Odin.parse(`n = ##${Number.MAX_SAFE_INTEGER}`);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getInteger('n')).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Boolean and Null Formatting
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Boolean and Null Formatting', () => {
    it('formats true', () => {
      const doc = Odin.parse('flag = true');
      const output = Odin.stringify(doc);
      expect(output).toContain('true');
    });

    it('formats false', () => {
      const doc = Odin.parse('flag = false');
      const output = Odin.stringify(doc);
      expect(output).toContain('false');
    });

    it('formats null', () => {
      const doc = Odin.parse('value = ~');
      const output = Odin.stringify(doc);
      expect(output).toContain('~');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Temporal Formatting
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Temporal Formatting', () => {
    it('formats date', () => {
      const doc = Odin.parse('d = 2024-06-15');
      const output = Odin.stringify(doc);
      expect(output).toContain('2024-06-15');
    });

    it('formats timestamp with UTC', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00Z');
      const output = Odin.stringify(doc);
      expect(output).toContain('2024-06-15T10:30:00Z');
    });

    it('formats timestamp with offset', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00+05:30');
      const output = Odin.stringify(doc);
      expect(output).toContain('2024-06-15T10:30:00+05:30');
    });

    it('formats time', () => {
      const doc = Odin.parse('t = T14:30:00');
      const output = Odin.stringify(doc);
      expect(output).toContain('T14:30:00');
    });

    it('formats duration', () => {
      const doc = Odin.parse('d = P1Y2M3D');
      const output = Odin.stringify(doc);
      expect(output).toContain('P1Y2M3D');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Binary Formatting
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Binary Formatting', () => {
    it('formats base64 data', () => {
      const doc = Odin.parse('data = ^SGVsbG8=');
      const output = Odin.stringify(doc);
      expect(output).toContain('^SGVsbG8=');
    });

    it('formats empty binary', () => {
      const doc = Odin.parse('data = ^');
      const output = Odin.stringify(doc);
      expect(output).toContain('^');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Reference Formatting
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Reference Formatting', () => {
    it('formats reference', () => {
      const doc = Odin.parse(`
        source = "value"
        ref = @source
      `);
      const output = Odin.stringify(doc);
      expect(output).toContain('@source');
    });

    it('formats nested reference', () => {
      const doc = Odin.parse(`
        {nested}
        value = "test"
        {}
        ref = @nested.value
      `);
      const output = Odin.stringify(doc);
      expect(output).toContain('@nested.value');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Modifier Formatting
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Modifier Formatting', () => {
    it('formats critical modifier', () => {
      const doc = Odin.parse('field = !"critical"');
      const output = Odin.stringify(doc);
      expect(output).toContain('!');
    });

    it('formats redacted modifier', () => {
      const doc = Odin.parse('field = *"redacted"');
      const output = Odin.stringify(doc);
      expect(output).toContain('*');
    });

    it('formats multiple modifiers', () => {
      const doc = Odin.parse('field = !*"both"');
      const output = Odin.stringify(doc);
      expect(output).toMatch(/[!*].*[!*]/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Header Context
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Header Context', () => {
    it('uses headers for nested paths', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
        email = "john@example.com"
      `);
      const output = Odin.stringify(doc, { useHeaders: true });
      expect(output).toContain('{customer}');
    });

    it('can disable headers', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
      `);
      const output = Odin.stringify(doc, { useHeaders: false });
      expect(output).not.toContain('{customer}');
      expect(output).toContain('customer.name');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Tabular Output
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Tabular Output', () => {
    it('outputs arrays as tabular when eligible', () => {
      const doc = Odin.parse(`
        {items[] : id, name}
        ##1, "Alice"
        ##2, "Bob"
      `);
      const output = Odin.stringify(doc, { useTabular: true });
      // Should produce tabular format
      expect(output).toContain('items');
    });

    it('can disable tabular output', () => {
      const doc = Odin.parse(`
        {items[] : id, name}
        ##1, "Alice"
        ##2, "Bob"
      `);
      const output = Odin.stringify(doc, { useTabular: false });
      // Should produce non-tabular format
      expect(output).toContain('items[0]');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Roundtrip Integrity
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Roundtrip Integrity', () => {
    it('preserves all value types in roundtrip', () => {
      const original = `
        str = "hello"
        num = #3.14
        int = ##42
        bool = true
        nullVal = ~
        date = 2024-06-15
        ts = 2024-06-15T10:30:00Z
      `;
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);

      expect(reparsed.getString('str')).toBe('hello');
      expect(reparsed.getNumber('num')).toBe(3.14);
      expect(reparsed.getInteger('int')).toBe(42);
      expect(reparsed.getBoolean('bool')).toBe(true);
      expect(reparsed.get('nullVal')?.type).toBe('null');
    });

    it('preserves nested structure in roundtrip', () => {
      const original = `
        {customer}
        name = "John"
        address.city = "NYC"
        address.zip = "10001"
      `;
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);

      expect(reparsed.getString('customer.name')).toBe('John');
      expect(reparsed.getString('customer.address.city')).toBe('NYC');
      expect(reparsed.getString('customer.address.zip')).toBe('10001');
    });

    it('preserves arrays in roundtrip', () => {
      const original = `
        items[0].name = "First"
        items[1].name = "Second"
        items[2].name = "Third"
      `;
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);

      expect(reparsed.getString('items[0].name')).toBe('First');
      expect(reparsed.getString('items[1].name')).toBe('Second');
      expect(reparsed.getString('items[2].name')).toBe('Third');
    });

    it('preserves metadata in roundtrip', () => {
      const original = `
        {$}
        version = "1.0"
        author = "Test"
        {}
        data = "value"
      `;
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);

      expect(reparsed.getString('$.version')).toBe('1.0');
      expect(reparsed.getString('$.author')).toBe('Test');
      expect(reparsed.getString('data')).toBe('value');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Unicode Handling
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Unicode Handling', () => {
    it('preserves emoji in roundtrip', () => {
      const doc = Odin.parse('text = "Hello \uD83D\uDE00 World"');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('Hello \uD83D\uDE00 World');
    });

    it('preserves CJK characters in roundtrip', () => {
      const doc = Odin.parse('text = "\u4E2D\u6587"');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('\u4E2D\u6587');
    });

    it('preserves Arabic text in roundtrip', () => {
      const doc = Odin.parse('text = "\u0645\u0631\u062D\u0628\u0627"');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('\u0645\u0631\u062D\u0628\u0627');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Options
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Stringify Options', () => {
    it('respects sortPaths option', () => {
      const doc = Odin.parse(`
        zebra = "z"
        alpha = "a"
        middle = "m"
      `);
      const output = Odin.stringify(doc, { sortPaths: true, useHeaders: false });
      const lines = output.trim().split('\n');
      expect(lines[0]).toContain('alpha');
      expect(lines[1]).toContain('middle');
      expect(lines[2]).toContain('zebra');
    });

    it('respects lineEnding option', () => {
      const doc = Odin.parse('a = "1"\nb = "2"');
      const output = Odin.stringify(doc, { lineEnding: '\r\n' });
      expect(output).toContain('\r\n');
    });
  });
});
