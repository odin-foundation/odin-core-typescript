/**
 * Tests for ODIN Transform Source Parsers
 */

import { describe, it, expect } from 'vitest';
import {
  parseSource,
  parseJson,
  parseXml,
  parseCsv,
  parseFixedWidth,
  parseFlat,
  parseFixedWidthRecord,
  extractFixedWidthDiscriminator,
  extractDiscriminator,
} from '../../src/transform/source-parsers.js';

// ─────────────────────────────────────────────────────────────────────────────
// JSON Parser Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('JSON Source Parser', () => {
  it('parses simple JSON object', () => {
    const input = '{"name": "John", "age": 30}';
    const result = parseJson(input);
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('parses JSON array', () => {
    const input = '[1, 2, 3]';
    const result = parseJson(input);
    expect(result).toEqual([1, 2, 3]);
  });

  it('parses nested JSON', () => {
    const input = '{"person": {"name": "John", "address": {"city": "NYC"}}}';
    const result = parseJson(input);
    expect(result).toEqual({
      person: { name: 'John', address: { city: 'NYC' } },
    });
  });

  it('handles JSON with various types', () => {
    const input = '{"str": "hello", "num": 42, "bool": true, "null": null}';
    const result = parseJson(input);
    expect(result).toEqual({
      str: 'hello',
      num: 42,
      bool: true,
      null: null,
    });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseJson('not valid json')).toThrow('JSON parse error');
  });

  it('works through parseSource interface', () => {
    const input = '{"test": "value"}';
    const result = parseSource(input, 'json');
    expect(result.data).toEqual({ test: 'value' });
    expect(result.raw).toBe(input);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// XML Parser Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('XML Source Parser', () => {
  it('parses simple XML element', () => {
    const input = '<root><name>John</name></root>';
    const result = parseXml(input);
    expect(result).toEqual({ root: { name: 'John' } });
  });

  it('parses XML with attributes', () => {
    const input = '<person id="123" active="true"><name>John</name></person>';
    const result = parseXml(input);
    expect(result).toEqual({
      person: {
        '@id': '123',
        '@active': 'true',
        name: 'John',
      },
    });
  });

  it('parses nested XML', () => {
    const input = '<root><person><name>John</name><age>30</age></person></root>';
    const result = parseXml(input);
    expect(result).toEqual({
      root: {
        person: { name: 'John', age: '30' },
      },
    });
  });

  it('handles repeated elements as arrays', () => {
    const input = '<root><item>A</item><item>B</item><item>C</item></root>';
    const result = parseXml(input);
    expect(result).toEqual({
      root: {
        item: ['A', 'B', 'C'],
      },
    });
  });

  it('handles XML declaration', () => {
    const input = '<?xml version="1.0" encoding="UTF-8"?><root><name>Test</name></root>';
    const result = parseXml(input);
    expect(result).toEqual({ root: { name: 'Test' } });
  });

  it('handles self-closing elements', () => {
    const input = '<root><empty/><name>Test</name></root>';
    const result = parseXml(input);
    expect(result).toEqual({ root: { empty: null, name: 'Test' } });
  });

  it('decodes XML entities', () => {
    const input = '<root><text>&lt;hello&gt; &amp; &quot;world&quot;</text></root>';
    const result = parseXml(input);
    expect(result).toEqual({ root: { text: '<hello> & "world"' } });
  });

  it('handles CDATA sections', () => {
    const input = '<root><code><![CDATA[function test() { return x < 5; }]]></code></root>';
    const result = parseXml(input);
    expect(result).toEqual({ root: { code: 'function test() { return x < 5; }' } });
  });

  it('works through parseSource interface', () => {
    const input = '<root><test>value</test></root>';
    const result = parseSource(input, 'xml');
    expect(result.data).toEqual({ root: { test: 'value' } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parser Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CSV Source Parser', () => {
  it('parses simple CSV with header', () => {
    const input = 'name,age\nJohn,30\nJane,25';
    const result = parseCsv(input);
    expect(result).toEqual([
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 },
    ]);
  });

  it('handles quoted fields', () => {
    const input = 'name,description\nJohn,"Hello, World"\nJane,"Line1\\nLine2"';
    const result = parseCsv(input);
    expect(result[0]).toEqual({ name: 'John', description: 'Hello, World' });
  });

  it('handles escaped quotes', () => {
    const input = 'name,quote\nTest,"He said ""Hello"""';
    const result = parseCsv(input);
    expect(result[0]).toEqual({ name: 'Test', quote: 'He said "Hello"' });
  });

  it('infers types from values', () => {
    const input = 'str,int,float,bool\nhello,42,3.14,true';
    const result = parseCsv(input);
    expect(result[0]).toEqual({
      str: 'hello',
      int: 42,
      float: 3.14,
      bool: true,
    });
  });

  it('handles custom delimiter', () => {
    const input = 'name;age\nJohn;30';
    const result = parseCsv(input, { delimiter: ';' });
    expect(result).toEqual([{ name: 'John', age: 30 }]);
  });

  it('handles CSV without header', () => {
    const input = 'John,30\nJane,25';
    const result = parseCsv(input, { hasHeader: false });
    expect(result).toEqual([
      { col0: 'John', col1: 30 },
      { col0: 'Jane', col1: 25 },
    ]);
  });

  it('handles empty values', () => {
    const input = 'a,b,c\n1,,3\n,,';
    const result = parseCsv(input);
    expect(result[0]).toEqual({ a: 1, b: null, c: 3 });
    expect(result[1]).toEqual({ a: null, b: null, c: null });
  });

  it('works through parseSource interface', () => {
    const input = 'name,value\ntest,123';
    const result = parseSource(input, 'csv');
    expect(result.data).toEqual([{ name: 'test', value: 123 }]);
  });

  it('works through parseSource with delimited alias', () => {
    const input = 'name,value\ntest,123';
    const result = parseSource(input, 'delimited');
    expect(result.data).toEqual([{ name: 'test', value: 123 }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixed-Width Parser Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Fixed-Width Source Parser', () => {
  it('returns lines for multi-record processing', () => {
    const input = 'HDR20241215\nEMP001234\nEMP005678';
    const result = parseFixedWidth(input);
    expect(result).toEqual(['HDR20241215', 'EMP001234', 'EMP005678']);
  });

  it('parses single record with field definitions', () => {
    const fields = [
      { name: 'type', pos: 0, len: 3 },
      { name: 'date', pos: 3, len: 8, type: 'date' as const },
      { name: 'name', pos: 11, len: 10 },
    ];
    const line = 'HDR20241215ACME CORP ';
    const result = parseFixedWidthRecord(line, fields);
    expect(result).toEqual({
      type: 'HDR',
      date: '2024-12-15',
      name: 'ACME CORP',
    });
  });

  it('handles implied decimals', () => {
    const fields = [
      { name: 'amount', pos: 0, len: 10, type: 'number' as const, impliedDecimals: 2 },
    ];
    const line = '0000050000';
    const result = parseFixedWidthRecord(line, fields);
    expect(result.amount).toBe(500);
  });

  it('handles integer fields', () => {
    const fields = [{ name: 'count', pos: 0, len: 6, type: 'integer' as const }];
    const line = '000042';
    const result = parseFixedWidthRecord(line, fields);
    expect(result.count).toBe(42);
  });

  it('extracts discriminator by position', () => {
    const line = 'HDR20241215ACME';
    const disc = extractFixedWidthDiscriminator(line, { type: 'position', pos: 0, len: 3 });
    expect(disc).toBe('HDR');
  });

  it('extracts discriminator with default length', () => {
    const line = 'EMP001234SMITH';
    const disc = extractFixedWidthDiscriminator(line, { type: 'position', pos: 0 });
    expect(disc).toBe('EM');
  });

  it('works through parseSource interface', () => {
    const input = 'Line1\nLine2\nLine3';
    const result = parseSource(input, 'fixed-width');
    expect(result.data).toEqual(['Line1', 'Line2', 'Line3']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flat (Properties) Parser Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Flat Source Parser', () => {
  it('parses simple key-value pairs', () => {
    const input = 'name=John\nage=30';
    const result = parseFlat(input);
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('parses dot notation for nesting', () => {
    const input = 'person.name=John\nperson.age=30';
    const result = parseFlat(input);
    expect(result).toEqual({
      person: { name: 'John', age: 30 },
    });
  });

  it('parses bracket notation for arrays', () => {
    const input = 'items[0]=A\nitems[1]=B\nitems[2]=C';
    const result = parseFlat(input);
    expect(result).toEqual({
      items: ['A', 'B', 'C'],
    });
  });

  it('parses mixed dot and bracket notation', () => {
    const input = `employees[0].name=John
employees[0].age=30
employees[1].name=Jane
employees[1].age=25`;
    const result = parseFlat(input);
    expect(result).toEqual({
      employees: [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ],
    });
  });

  it('skips comments', () => {
    const input = '# Comment\nname=John\n; Another comment\nage=30';
    const result = parseFlat(input);
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('skips empty lines', () => {
    const input = 'name=John\n\n\nage=30';
    const result = parseFlat(input);
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('infers types', () => {
    const input = `str=hello
int=42
float=3.14
bool1=true
bool2=false
null=~
date=2024-12-15`;
    const result = parseFlat(input);
    expect(result).toEqual({
      str: 'hello',
      int: 42,
      float: 3.14,
      bool1: true,
      bool2: false,
      null: null,
      date: '2024-12-15',
    });
  });

  it('handles quoted strings', () => {
    const input = `message="Hello, World!"
path='C:\\Users\\test'`;
    const result = parseFlat(input);
    expect(result).toEqual({
      message: 'Hello, World!',
      path: 'C:\\Users\\test',
    });
  });

  it('handles equals sign in value', () => {
    const input = 'equation="a=b+c"';
    const result = parseFlat(input);
    expect(result).toEqual({ equation: 'a=b+c' });
  });

  it('works through parseSource interface', () => {
    const input = 'test.value=123';
    const result = parseSource(input, 'flat');
    expect(result.data).toEqual({ test: { value: 123 } });
  });

  it('works through parseSource with properties alias', () => {
    const input = 'test.value=123';
    const result = parseSource(input, 'properties');
    expect(result.data).toEqual({ test: { value: 123 } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Discriminator Extraction Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Discriminator Extraction', () => {
  it('extracts position-based discriminator from string', () => {
    const result = extractDiscriminator('HDR20241215', { type: 'position', pos: 0, len: 3 });
    expect(result).toBe('HDR');
  });

  it('extracts field-based discriminator from array', () => {
    const result = extractDiscriminator(['HDR', '20241215', 'Data'], { type: 'field', field: 0 });
    expect(result).toBe('HDR');
  });

  it('extracts path-based discriminator from object', () => {
    const result = extractDiscriminator(
      { record: { type: 'EMP' }, data: 'test' },
      { type: 'path', path: 'record.type' }
    );
    expect(result).toBe('EMP');
  });

  it('returns empty string for invalid discriminator', () => {
    const result = extractDiscriminator('test', { type: 'path', path: 'missing' });
    expect(result).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseSource Generic Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseSource Generic', () => {
  it('returns input as-is for unknown format', () => {
    const input = 'some data';
    const result = parseSource(input, 'unknown-format');
    expect(result.data).toBe('some data');
    expect(result.raw).toBe(input);
  });

  it('preserves raw input in result', () => {
    const input = '{"test": true}';
    const result = parseSource(input, 'json');
    expect(result.raw).toBe(input);
  });
});
