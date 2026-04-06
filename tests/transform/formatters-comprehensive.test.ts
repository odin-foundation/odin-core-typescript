/**
 * Comprehensive formatter tests for Rust parity.
 *
 * Covers JSON, CSV, XML, Fixed-Width, Flat, and ODIN formatters
 * with edge cases not covered by existing tests.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../src/index.js';
import {
  formatOutput,
  normalizeToOdin,
} from '../../src/transform/formatters.js';
import {
  escapeXml,
  csvEscape,
  isHighPrecision,
  odinValueToString,
  odinValueToJsonCompatible,
  transformValueToString,
} from '../../src/transform/formatters/value-converters.js';
import type { OdinTransform, TransformValue } from '../../src/types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createTransform(format: string, options: Record<string, unknown> = {}): OdinTransform {
  return {
    odin: '1.0.0',
    transform: '1.0.0',
    direction: 'json->json',
    source: { format: 'json' },
    target: { format, ...options },
    header: {},
    segments: [],
    mappings: [],
    verbs: new Map(),
  };
}

function str(value: string): TransformValue {
  return { type: 'string', value };
}
function int(value: number): TransformValue {
  return { type: 'integer', value };
}
function num(value: number, raw?: string): TransformValue {
  return { type: 'number', value, raw };
}
function bool(value: boolean): TransformValue {
  return { type: 'boolean', value };
}
function nil(): TransformValue {
  return { type: 'null' };
}
function currency(value: number, raw?: string): TransformValue {
  return { type: 'currency', value, raw };
}
function date(raw: string): TransformValue {
  return { type: 'date', value: raw, raw };
}
function timestamp(raw: string): TransformValue {
  return { type: 'timestamp', value: raw, raw };
}
function ref(path: string): TransformValue {
  return { type: 'reference', path, value: path };
}
function binary(data: Uint8Array): TransformValue {
  return { type: 'binary', data, value: data };
}

function fmt(output: Record<string, TransformValue>, format: string, opts: Record<string, unknown> = {}): string {
  const transform = createTransform(format, opts);
  return formatOutput(output, { transform, onWarning: () => {} });
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Formatter
// ─────────────────────────────────────────────────────────────────────────────

describe('JSON Formatter - Comprehensive', () => {
  it('formats compact JSON (indent 0)', () => {
    const result = fmt({ name: str('Alice') }, 'json', { indent: 0 });
    expect(result).not.toContain('\n');
    expect(JSON.parse(result)).toEqual({ name: 'Alice' });
  });

  it('formats pretty JSON with custom indent', () => {
    const result = fmt({ name: str('Alice') }, 'json', { indent: 4 });
    expect(result).toContain('    ');
    expect(JSON.parse(result)).toEqual({ name: 'Alice' });
  });

  it('handles all primitive types', () => {
    const output: Record<string, TransformValue> = {
      s: str('hello'),
      i: int(42),
      n: num(3.14),
      b: bool(true),
      nil: nil(),
    };
    const parsed = JSON.parse(fmt(output, 'json'));
    expect(parsed.s).toBe('hello');
    expect(parsed.i).toBe(42);
    expect(parsed.n).toBe(3.14);
    expect(parsed.b).toBe(true);
    expect(parsed.nil).toBeNull();
  });

  it('handles currency type', () => {
    const parsed = JSON.parse(fmt({ price: currency(99.99) }, 'json'));
    expect(parsed.price).toBe(99.99);
  });

  it('handles date type as ISO string', () => {
    const parsed = JSON.parse(fmt({ d: date('2024-01-15') }, 'json'));
    expect(parsed.d).toBe('2024-01-15');
  });

  it('handles timestamp type', () => {
    const parsed = JSON.parse(fmt({ ts: timestamp('2024-01-15T10:30:00Z') }, 'json'));
    expect(parsed.ts).toBe('2024-01-15T10:30:00Z');
  });

  it('handles reference type', () => {
    const parsed = JSON.parse(fmt({ r: ref('parties[0]') }, 'json'));
    expect(parsed.r).toBe('@parties[0]');
  });

  it('handles binary type', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const parsed = JSON.parse(fmt({ b: binary(data) }, 'json'));
    expect(parsed.b).toContain('^');
  });

  it('handles deeply nested objects', () => {
    const output: Record<string, TransformValue> = {
      'a.b.c.d.e': str('deep'),
    };
    const parsed = JSON.parse(fmt(output, 'json'));
    expect(parsed.a.b.c.d.e).toBe('deep');
  });

  it('handles special characters in strings', () => {
    const output: Record<string, TransformValue> = {
      msg: str('line1\nline2\ttab "quoted"'),
    };
    const parsed = JSON.parse(fmt(output, 'json'));
    expect(parsed.msg).toBe('line1\nline2\ttab "quoted"');
  });

  it('handles unicode characters', () => {
    const output: Record<string, TransformValue> = {
      emoji: str('\u{1F600}'),
      cjk: str('\u4e16\u754c'),
    };
    const parsed = JSON.parse(fmt(output, 'json'));
    expect(parsed.emoji).toBe('\u{1F600}');
    expect(parsed.cjk).toBe('\u4e16\u754c');
  });

  it('handles empty string value', () => {
    const parsed = JSON.parse(fmt({ empty: str('') }, 'json'));
    expect(parsed.empty).toBe('');
  });

  it('handles false boolean distinctly from null', () => {
    const parsed = JSON.parse(fmt({ active: bool(false), missing: nil() }, 'json'));
    expect(parsed.active).toBe(false);
    expect(parsed.missing).toBeNull();
  });

  it('handles zero integer', () => {
    const parsed = JSON.parse(fmt({ zero: int(0) }, 'json'));
    expect(parsed.zero).toBe(0);
  });

  it('handles negative numbers', () => {
    const parsed = JSON.parse(fmt({ neg: num(-42.5) }, 'json'));
    expect(parsed.neg).toBe(-42.5);
  });

  it('handles array paths', () => {
    const output: Record<string, TransformValue> = {
      'items[0]': str('first'),
      'items[1]': str('second'),
      'items[2]': str('third'),
    };
    const parsed = JSON.parse(fmt(output, 'json'));
    expect(parsed.items).toEqual(['first', 'second', 'third']);
  });

  it('handles mixed nested objects and arrays', () => {
    const output: Record<string, TransformValue> = {
      'users[0].name': str('Alice'),
      'users[0].age': int(30),
      'users[1].name': str('Bob'),
      'users[1].age': int(25),
    };
    const parsed = JSON.parse(fmt(output, 'json'));
    expect(parsed.users).toHaveLength(2);
    expect(parsed.users[0].name).toBe('Alice');
    expect(parsed.users[1].age).toBe(25);
  });

  it('handles empty output object', () => {
    const parsed = JSON.parse(fmt({}, 'json'));
    expect(parsed).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV Formatter
// ─────────────────────────────────────────────────────────────────────────────

describe('CSV Formatter - Comprehensive', () => {
  it('formats single row with header', () => {
    const result = fmt({ name: str('Alice'), age: int(30) }, 'csv');
    const lines = result.split('\n');
    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('age');
    expect(lines[1]).toContain('Alice');
    expect(lines[1]).toContain('30');
  });

  it('quotes values containing commas', () => {
    const result = fmt({ address: str('123 Main St, Apt 4') }, 'csv');
    expect(result).toContain('"123 Main St, Apt 4"');
  });

  it('escapes quotes within values', () => {
    const result = fmt({ msg: str('She said "hello"') }, 'csv');
    expect(result).toContain('""hello""');
  });

  it('handles null values as empty', () => {
    const result = fmt({ name: str('Alice'), missing: nil() }, 'csv');
    const lines = result.split('\n');
    expect(lines[1]).toContain('Alice');
    expect(lines[1]).toMatch(/Alice,$/);
  });

  it('handles pipe delimiter', () => {
    const result = fmt({ a: str('x'), b: str('y') }, 'csv', { delimiter: '|' });
    expect(result).toContain('|');
    expect(result).not.toMatch(/[^|],/);
  });

  it('handles semicolon delimiter', () => {
    const result = fmt({ a: str('x'), b: str('y') }, 'csv', { delimiter: ';' });
    expect(result).toContain(';');
  });

  it('handles tab delimiter', () => {
    const result = fmt({ a: str('x'), b: str('y') }, 'csv', { delimiter: '\t' });
    expect(result).toContain('\t');
  });

  it('formats without header', () => {
    const result = fmt({ name: str('Alice') }, 'csv', { header: false });
    const lines = result.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Alice');
  });

  it('handles boolean values', () => {
    const result = fmt({ active: bool(true), deleted: bool(false) }, 'csv');
    expect(result).toContain('true');
    expect(result).toContain('false');
  });

  it('handles values with newlines', () => {
    const result = fmt({ text: str('line1\nline2') }, 'csv');
    expect(result).toContain('"line1\nline2"');
  });

  it('handles custom line ending', () => {
    const result = fmt({ a: str('x') }, 'csv', { lineEnding: '\r\n' });
    expect(result).toContain('\r\n');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// XML Formatter
// ─────────────────────────────────────────────────────────────────────────────

describe('XML Formatter - Comprehensive', () => {
  it('produces valid XML with declaration', () => {
    const result = fmt({ name: str('Alice') }, 'xml');
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('produces XML without declaration', () => {
    const result = fmt({ name: str('Alice') }, 'xml', { declaration: false });
    expect(result).not.toContain('<?xml');
  });

  it('includes element with string value', () => {
    const result = fmt({ name: str('Alice') }, 'xml');
    expect(result).toContain('<name>Alice</name>');
  });

  it('includes type attribute for integer', () => {
    const result = fmt({ count: int(42) }, 'xml');
    expect(result).toContain('odin:type="integer"');
    expect(result).toContain('>42</count>');
  });

  it('includes type attribute for number', () => {
    const result = fmt({ rate: num(3.14) }, 'xml');
    expect(result).toContain('odin:type="number"');
  });

  it('includes type attribute for currency', () => {
    const result = fmt({ price: currency(99.99) }, 'xml');
    expect(result).toContain('odin:type="currency"');
  });

  it('includes type attribute for boolean', () => {
    const result = fmt({ active: bool(true) }, 'xml');
    expect(result).toContain('odin:type="boolean"');
    expect(result).toContain('>true</active>');
  });

  it('includes type attribute for date', () => {
    const result = fmt({ d: date('2024-01-15') }, 'xml');
    expect(result).toContain('odin:type="date"');
    expect(result).toContain('>2024-01-15</d>');
  });

  it('escapes special XML characters in values', () => {
    const result = fmt({ msg: str('a < b & c > d') }, 'xml');
    expect(result).toContain('&lt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&gt;');
  });

  it('escapes quotes in values', () => {
    const result = fmt({ msg: str('say "hello"') }, 'xml');
    expect(result).toContain('&quot;');
  });

  it('escapes apostrophes in values', () => {
    const result = fmt({ msg: str("it's") }, 'xml');
    expect(result).toContain('&apos;');
  });

  it('handles nested objects as nested elements', () => {
    const output: Record<string, TransformValue> = {
      'person.name': str('Alice'),
      'person.city': str('NYC'),
    };
    const result = fmt(output, 'xml');
    expect(result).toContain('<person>');
    expect(result).toContain('<name>Alice</name>');
    expect(result).toContain('<city>NYC</city>');
    expect(result).toContain('</person>');
  });

  it('handles deeply nested elements', () => {
    const output: Record<string, TransformValue> = {
      'a.b.c': str('deep'),
    };
    const result = fmt(output, 'xml');
    expect(result).toContain('<a>');
    expect(result).toContain('<b>');
    expect(result).toContain('<c>deep</c>');
  });

  it('includes ODIN namespace when typed values in nested container', () => {
    const result = fmt({ 'data.count': int(42) }, 'xml');
    expect(result).toContain('xmlns:odin="https://odin.foundation/ns"');
  });

  it('omits ODIN namespace for string-only values', () => {
    const result = fmt({ name: str('Alice') }, 'xml');
    expect(result).not.toContain('xmlns:odin');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixed-Width Formatter
// ─────────────────────────────────────────────────────────────────────────────

describe('Fixed-Width Formatter - Comprehensive', () => {
  it('pads string to field width (left-aligned)', () => {
    const doc = Odin.parse('code = "AB"');
    const fw = Odin.toFixedWidth(doc, {
      lineWidth: 10,
      fields: [{ path: 'code', pos: 0, len: 5 }],
    });
    expect(fw.slice(0, 5)).toBe('AB   ');
  });

  it('truncates long values', () => {
    const doc = Odin.parse('code = "ABCDEFGH"');
    const fw = Odin.toFixedWidth(doc, {
      lineWidth: 10,
      fields: [{ path: 'code', pos: 0, len: 3 }],
    });
    expect(fw.slice(0, 3)).toBe('ABC');
  });

  it('right-aligns with custom pad character', () => {
    const doc = Odin.parse('num = "42"');
    const fw = Odin.toFixedWidth(doc, {
      lineWidth: 10,
      fields: [{ path: 'num', pos: 0, len: 6, padChar: '0', align: 'right' }],
    });
    expect(fw.slice(0, 6)).toBe('000042');
  });

  it('handles multiple fields at different positions', () => {
    const doc = Odin.parse('a = "X"\nb = "Y"');
    const fw = Odin.toFixedWidth(doc, {
      lineWidth: 10,
      fields: [
        { path: 'a', pos: 0, len: 3 },
        { path: 'b', pos: 5, len: 3 },
      ],
    });
    expect(fw.slice(0, 1)).toBe('X');
    expect(fw.slice(5, 6)).toBe('Y');
  });

  it('handles missing field value as spaces', () => {
    const doc = Odin.parse('a = "X"');
    const fw = Odin.toFixedWidth(doc, {
      lineWidth: 10,
      fields: [
        { path: 'a', pos: 0, len: 3 },
        { path: 'missing', pos: 3, len: 3 },
      ],
    });
    expect(fw.slice(3, 6)).toBe('   ');
  });

  it('handles null value as spaces', () => {
    const doc = Odin.parse('value = ~');
    const fw = Odin.toFixedWidth(doc, {
      lineWidth: 10,
      fields: [{ path: 'value', pos: 0, len: 5 }],
    });
    expect(fw.slice(0, 5)).toBe('     ');
  });

  it('fills remaining line with pad character', () => {
    const doc = Odin.parse('a = "X"');
    const fw = Odin.toFixedWidth(doc, {
      lineWidth: 8,
      padChar: '*',
      fields: [{ path: 'a', pos: 0, len: 1 }],
    });
    expect(fw).toBe('X*******');
  });

  it('handles nested path for field', () => {
    const doc = Odin.parse('{rec}\ncode = "ABC"');
    const fw = Odin.toFixedWidth(doc, {
      lineWidth: 10,
      fields: [{ path: 'rec.code', pos: 0, len: 5 }],
    });
    expect(fw.slice(0, 3)).toBe('ABC');
  });

  it('handles integer values as strings', () => {
    const doc = Odin.parse('count = ##42');
    const fw = Odin.toFixedWidth(doc, {
      lineWidth: 10,
      fields: [{ path: 'count', pos: 0, len: 5, align: 'right', padChar: '0' }],
    });
    expect(fw.slice(0, 5)).toBe('00042');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flat (KVP) Formatter
// ─────────────────────────────────────────────────────────────────────────────

describe('Flat Formatter - Comprehensive', () => {
  it('formats simple key=value pairs', () => {
    const result = fmt({ name: str('Alice'), age: int(30) }, 'flat');
    expect(result).toContain('age=30');
    expect(result).toContain('name=Alice');
  });

  it('outputs paths sorted alphabetically', () => {
    const result = fmt({ c: str('3'), a: str('1'), b: str('2') }, 'flat');
    const lines = result.split('\n');
    expect(lines[0]).toBe('a=1');
    expect(lines[1]).toBe('b=2');
    expect(lines[2]).toBe('c=3');
  });

  it('formats nested paths with dot notation', () => {
    const output: Record<string, TransformValue> = {
      'person.name': str('Alice'),
      'person.age': int(30),
    };
    const result = fmt(output, 'flat');
    expect(result).toContain('person.age=30');
    expect(result).toContain('person.name=Alice');
  });

  it('formats array paths with bracket notation', () => {
    const output: Record<string, TransformValue> = {
      'items[0]': str('A'),
      'items[1]': str('B'),
    };
    const result = fmt(output, 'flat');
    expect(result).toContain('items[0]=A');
    expect(result).toContain('items[1]=B');
  });

  it('skips null values', () => {
    const result = fmt({ name: str('Alice'), empty: nil() }, 'flat');
    expect(result).not.toContain('empty');
    expect(result).toContain('name=Alice');
  });

  it('quotes values containing equals sign', () => {
    const result = fmt({ eq: str('a=b') }, 'flat');
    expect(result).toContain('"a=b"');
  });

  it('handles boolean values', () => {
    const result = fmt({ active: bool(true), deleted: bool(false) }, 'flat');
    expect(result).toContain('active=true');
    expect(result).toContain('deleted=false');
  });

  it('handles date values', () => {
    const result = fmt({ d: date('2024-01-15') }, 'flat');
    expect(result).toContain('d=2024-01-15');
  });

  it('uses properties alias', () => {
    const result = fmt({ name: str('Alice') }, 'properties');
    expect(result).toContain('name=Alice');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ODIN Formatter
// ─────────────────────────────────────────────────────────────────────────────

describe('ODIN Formatter - Comprehensive', () => {
  it('formats string with quotes', () => {
    const result = fmt({ name: str('Alice') }, 'odin');
    expect(result).toContain('name = "Alice"');
  });

  it('formats integer with ## prefix', () => {
    const result = fmt({ count: int(42) }, 'odin');
    expect(result).toContain('##42');
  });

  it('formats number with # prefix', () => {
    const result = fmt({ rate: num(3.14) }, 'odin');
    expect(result).toContain('#3.14');
  });

  it('formats currency with #$ prefix', () => {
    const result = fmt({ price: currency(99.99, '99.99') }, 'odin');
    expect(result).toContain('#$99.99');
  });

  it('formats boolean', () => {
    const result = fmt({ active: bool(true) }, 'odin');
    expect(result).toContain('true');
  });

  it('formats null as ~', () => {
    const result = fmt({ empty: nil() }, 'odin');
    expect(result).toContain('~');
  });

  it('formats date without prefix', () => {
    const result = fmt({ d: date('2024-01-15') }, 'odin');
    expect(result).toContain('2024-01-15');
  });

  it('output is valid parseable ODIN', () => {
    const output: Record<string, TransformValue> = {
      name: str('Alice'),
      age: int(30),
      active: bool(true),
    };
    const result = fmt(output, 'odin');
    expect(() => Odin.parse(result)).not.toThrow();
  });

  it('handles nested sections', () => {
    const output: Record<string, TransformValue> = {
      'person.name': str('Alice'),
      'person.age': int(30),
    };
    const result = fmt(output, 'odin');
    expect(result).toContain('person');
    expect(result).toContain('name');
    expect(result).toContain('Alice');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Value Converter Utilities
// ─────────────────────────────────────────────────────────────────────────────

describe('Value Converters - Comprehensive', () => {
  describe('escapeXml', () => {
    it('escapes ampersand', () => {
      expect(escapeXml('a & b')).toBe('a &amp; b');
    });
    it('escapes less than', () => {
      expect(escapeXml('a < b')).toBe('a &lt; b');
    });
    it('escapes greater than', () => {
      expect(escapeXml('a > b')).toBe('a &gt; b');
    });
    it('escapes double quotes', () => {
      expect(escapeXml('"hello"')).toBe('&quot;hello&quot;');
    });
    it('escapes apostrophes', () => {
      expect(escapeXml("it's")).toBe('it&apos;s');
    });
    it('handles string with no special chars', () => {
      expect(escapeXml('hello world')).toBe('hello world');
    });
    it('handles empty string', () => {
      expect(escapeXml('')).toBe('');
    });
    it('handles multiple special chars', () => {
      expect(escapeXml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
    });
  });

  describe('csvEscape', () => {
    it('returns value as-is when no special chars', () => {
      expect(csvEscape('hello', '"', ',')).toBe('hello');
    });
    it('quotes value containing delimiter', () => {
      expect(csvEscape('a,b', '"', ',')).toBe('"a,b"');
    });
    it('quotes and escapes value containing quote char', () => {
      expect(csvEscape('say "hi"', '"', ',')).toBe('"say ""hi"""');
    });
    it('quotes value containing newline', () => {
      expect(csvEscape('line1\nline2', '"', ',')).toBe('"line1\nline2"');
    });
    it('handles pipe delimiter', () => {
      expect(csvEscape('a|b', '"', '|')).toBe('"a|b"');
    });
    it('handles empty string', () => {
      expect(csvEscape('', '"', ',')).toBe('');
    });
  });

  describe('isHighPrecision', () => {
    it('returns false for normal precision', () => {
      expect(isHighPrecision('3.14')).toBe(false);
    });
    it('returns false for 15 digits', () => {
      expect(isHighPrecision('123456789012345')).toBe(false);
    });
    it('returns true for 16+ significant digits', () => {
      expect(isHighPrecision('1234567890123456')).toBe(true);
    });
    it('returns true for high-precision decimal', () => {
      expect(isHighPrecision('3.14159265358979323846')).toBe(true);
    });
    it('handles negative numbers', () => {
      expect(isHighPrecision('-1234567890123456')).toBe(true);
    });
  });

  describe('transformValueToString', () => {
    it('converts undefined to empty string', () => {
      expect(transformValueToString(undefined)).toBe('');
    });
    it('converts null type to empty string', () => {
      expect(transformValueToString(nil())).toBe('');
    });
    it('converts string', () => {
      expect(transformValueToString(str('hello'))).toBe('hello');
    });
    it('converts integer', () => {
      expect(transformValueToString(int(42))).toBe('42');
    });
    it('converts number', () => {
      expect(transformValueToString(num(3.14))).toBe('3.14');
    });
    it('converts boolean true', () => {
      expect(transformValueToString(bool(true))).toBe('true');
    });
    it('converts boolean false', () => {
      expect(transformValueToString(bool(false))).toBe('false');
    });
    it('converts date', () => {
      expect(transformValueToString(date('2024-01-15'))).toBe('2024-01-15');
    });
    it('converts reference', () => {
      expect(transformValueToString(ref('parties[0]'))).toBe('@parties[0]');
    });
  });

  describe('normalizeToOdin', () => {
    it('normalizes string value', () => {
      const doc = normalizeToOdin({ name: str('Alice') });
      expect(doc.get('name')?.type).toBe('string');
      expect(doc.get('name')?.value).toBe('Alice');
    });

    it('normalizes integer value', () => {
      const doc = normalizeToOdin({ count: int(42) });
      expect(doc.get('count')?.type).toBe('integer');
      expect(doc.get('count')?.value).toBe(42);
    });

    it('normalizes boolean value', () => {
      const doc = normalizeToOdin({ active: bool(true) });
      expect(doc.get('active')?.type).toBe('boolean');
      expect(doc.get('active')?.value).toBe(true);
    });

    it('normalizes nested path', () => {
      const doc = normalizeToOdin({ 'a.b.c': str('deep') });
      expect(doc.get('a.b.c')?.value).toBe('deep');
    });
  });
});
