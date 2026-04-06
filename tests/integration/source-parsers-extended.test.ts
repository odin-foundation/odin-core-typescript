/**
 * Extended integration tests for source parsers.
 *
 * Covers edge cases for XML, CSV, Fixed-Width, and YAML parsing.
 */

import { describe, it, expect } from 'vitest';
import {
  parseJson,
  parseXml,
  parseCsv,
  parseFixedWidthRecord,
  parseFlat,
  parseYaml,
} from '../../src/transform/source-parsers.js';

// ─────────────────────────────────────────────────────────────────────────────
// XML Parser Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('XML parser edge cases', () => {
  it('parses simple XML element', () => {
    const xml = '<root><name>John</name><age>30</age></root>';
    const result = parseXml(xml);

    expect(result.root).toBeDefined();
    expect((result.root as Record<string, unknown>).name).toBe('John');
    expect((result.root as Record<string, unknown>).age).toBe('30');
  });

  it('handles XML with attributes', () => {
    const xml = '<person id="123" active="true"><name>John</name></person>';
    const result = parseXml(xml);

    expect(result.person).toBeDefined();
    const person = result.person as Record<string, unknown>;
    expect(person['@id']).toBe('123');
    expect(person['@active']).toBe('true');
    expect(person.name).toBe('John');
  });

  it('handles nested XML elements', () => {
    const xml = `
      <policy>
        <number>POL123</number>
        <holder>
          <name>John</name>
          <address>
            <city>NYC</city>
          </address>
        </holder>
      </policy>
    `;
    const result = parseXml(xml);

    expect(result.policy).toBeDefined();
    const policy = result.policy as Record<string, unknown>;
    const holder = policy.holder as Record<string, unknown>;
    expect(holder.name).toBe('John');
    expect((holder.address as Record<string, unknown>).city).toBe('NYC');
  });

  it('handles XML with repeated elements as array', () => {
    const xml = `
      <items>
        <item>one</item>
        <item>two</item>
        <item>three</item>
      </items>
    `;
    const result = parseXml(xml);

    const items = result.items as Record<string, unknown>;
    expect(Array.isArray(items.item)).toBe(true);
    expect(items.item).toHaveLength(3);
  });

  it('handles XML with mixed content (text and elements)', () => {
    const xml = '<message>Hello <b>world</b>!</message>';
    const result = parseXml(xml);

    expect(result.message).toBeDefined();
  });

  it('handles empty XML elements', () => {
    const xml = '<root><empty/><also-empty></also-empty></root>';
    const result = parseXml(xml);

    expect(result.root).toBeDefined();
  });

  it('handles XML with namespaces', () => {
    const xml = '<ns:root xmlns:ns="http://example.com"><ns:item>value</ns:item></ns:root>';
    const result = parseXml(xml);

    // Namespace handling depends on implementation
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parser Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('CSV parser edge cases', () => {
  it('parses simple CSV with header', () => {
    const csv = 'name,age,city\nJohn,30,NYC\nJane,25,LA';
    const result = parseCsv(csv);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'John', age: 30, city: 'NYC' });
    expect(result[1]).toEqual({ name: 'Jane', age: 25, city: 'LA' });
  });

  it('handles quoted fields with commas', () => {
    const csv = 'name,address\nJohn,"123 Main St, Apt 4"\nJane,"456 Oak Ave"';
    const result = parseCsv(csv);

    expect(result[0]).toEqual({ name: 'John', address: '123 Main St, Apt 4' });
  });

  it('handles escaped quotes in quoted fields', () => {
    const csv = 'name,quote\nJohn,"He said ""Hello"""\nJane,"OK"';
    const result = parseCsv(csv);

    expect(result[0]).toEqual({ name: 'John', quote: 'He said "Hello"' });
  });

  it('handles empty fields', () => {
    const csv = 'a,b,c\n1,,3\n,2,';
    const result = parseCsv(csv);

    // Empty fields are converted to null
    expect(result[0]).toEqual({ a: 1, b: null, c: 3 });
    expect(result[1]).toEqual({ a: null, b: 2, c: null });
  });

  it('handles custom delimiter (pipe)', () => {
    const csv = 'name|age|city\nJohn|30|NYC';
    const result = parseCsv(csv, { delimiter: '|' });

    expect(result[0]).toEqual({ name: 'John', age: 30, city: 'NYC' });
  });

  it('handles tab delimiter', () => {
    const csv = 'name\tage\tcity\nJohn\t30\tNYC';
    const result = parseCsv(csv, { delimiter: '\t' });

    expect(result[0]).toEqual({ name: 'John', age: 30, city: 'NYC' });
  });

  it('handles CSV without header row', () => {
    const csv = 'John,30,NYC\nJane,25,LA';
    const result = parseCsv(csv, { hasHeader: false });

    expect(result[0]).toEqual({ col0: 'John', col1: 30, col2: 'NYC' });
  });

  it('handles single column CSV', () => {
    const csv = 'name\nJohn\nJane';
    const result = parseCsv(csv);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'John' });
  });

  it('handles numeric values correctly', () => {
    const csv = 'int,float,string\n42,3.14,abc';
    const result = parseCsv(csv);

    expect(result[0]).toEqual({ int: 42, float: 3.14, string: 'abc' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixed-Width Parser Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Fixed-width parser edge cases', () => {
  it('parses basic fixed-width record', () => {
    const record = 'John      30NYC       ';
    const fields = [
      { name: 'name', pos: 0, len: 10 },
      { name: 'age', pos: 10, len: 2 },
      { name: 'city', pos: 12, len: 10 },
    ];
    const result = parseFixedWidthRecord(record, fields);

    expect(result.name).toBe('John');
    expect(result.age).toBe('30');
    expect(result.city).toBe('NYC');
  });

  it('handles fields at record boundaries', () => {
    const record = 'ABC';
    const fields = [
      { name: 'first', pos: 0, len: 1 },
      { name: 'middle', pos: 1, len: 1 },
      { name: 'last', pos: 2, len: 1 },
    ];
    const result = parseFixedWidthRecord(record, fields);

    expect(result.first).toBe('A');
    expect(result.middle).toBe('B');
    expect(result.last).toBe('C');
  });

  it('handles field extending beyond record length', () => {
    const record = 'SHORT';
    const fields = [{ name: 'field', pos: 0, len: 20 }];
    const result = parseFixedWidthRecord(record, fields);

    // Should return what's available
    expect(result.field).toBe('SHORT');
  });

  it('handles field starting beyond record length', () => {
    const record = 'SHORT';
    const fields = [{ name: 'field', pos: 100, len: 5 }];
    const result = parseFixedWidthRecord(record, fields);

    // Should return null for empty
    expect(result.field).toBe(null);
  });

  it('trims whitespace from fields', () => {
    const record = '   padded   ';
    const fields = [{ name: 'value', pos: 0, len: 12 }];
    const result = parseFixedWidthRecord(record, fields);

    expect(result.value).toBe('padded');
  });

  it('handles multiple records', () => {
    const input = 'REC1data1     \nREC2data2     ';
    const lines = input.split('\n');
    const fields = [
      { name: 'type', pos: 0, len: 4 },
      { name: 'data', pos: 4, len: 10 },
    ];

    const results = lines.map((line) => parseFixedWidthRecord(line, fields));

    expect(results[0]?.type).toBe('REC1');
    expect(results[0]?.data).toBe('data1');
    expect(results[1]?.type).toBe('REC2');
    expect(results[1]?.data).toBe('data2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// YAML Parser Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('YAML parser edge cases', () => {
  it('parses simple YAML', () => {
    const yaml = 'name: John\nage: 30';
    const result = parseYaml(yaml);

    expect(result.name).toBe('John');
    expect(result.age).toBe(30);
  });

  it('parses nested YAML', () => {
    const yaml = `
person:
  name: John
  address:
    city: NYC
    zip: 10001
`;
    const result = parseYaml(yaml);

    const person = result.person as Record<string, unknown>;
    expect(person.name).toBe('John');
    expect((person.address as Record<string, unknown>).city).toBe('NYC');
  });

  it('parses YAML arrays', () => {
    const yaml = `
items:
  - one
  - two
  - three
`;
    const result = parseYaml(yaml);

    expect(result.items).toEqual(['one', 'two', 'three']);
  });

  it('parses YAML with different value types', () => {
    const yaml = `
string: hello
number: 42
float: 3.14
boolean: true
null_value: null
`;
    const result = parseYaml(yaml);

    expect(result.string).toBe('hello');
    expect(result.number).toBe(42);
    expect(result.float).toBe(3.14);
    expect(result.boolean).toBe(true);
    expect(result.null_value).toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flat Parser Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Flat parser', () => {
  it('parses key=value pairs', () => {
    const input = 'name=John\nage=30';
    const result = parseFlat(input);

    expect(result.name).toBe('John');
    // Numbers are parsed as numbers
    expect(result.age).toBe(30);
  });

  it('handles dotted paths', () => {
    const input = 'person.name=John\nperson.age=30';
    const result = parseFlat(input);

    const person = result.person as Record<string, unknown>;
    expect(person.name).toBe('John');
    // Numbers are parsed as numbers
    expect(person.age).toBe(30);
  });

  it('handles array indices', () => {
    const input = 'items[0]=one\nitems[1]=two';
    const result = parseFlat(input);

    expect((result.items as string[])[0]).toBe('one');
    expect((result.items as string[])[1]).toBe('two');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JSON Parser Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('JSON parser', () => {
  it('parses simple JSON object', () => {
    const json = '{"name": "John", "age": 30}';
    const result = parseJson(json);

    expect(result.name).toBe('John');
    expect(result.age).toBe(30);
  });

  it('parses nested JSON', () => {
    const json = '{"person": {"name": "John", "address": {"city": "NYC"}}}';
    const result = parseJson(json);

    const person = result.person as Record<string, unknown>;
    expect(person.name).toBe('John');
    expect((person.address as Record<string, unknown>).city).toBe('NYC');
  });

  it('parses JSON arrays', () => {
    const json = '{"items": [1, 2, 3]}';
    const result = parseJson(json);

    expect(result.items).toEqual([1, 2, 3]);
  });

  it('handles JSON with special characters in strings', () => {
    const json = '{"message": "Hello\\nWorld", "path": "C:\\\\temp"}';
    const result = parseJson(json);

    expect(result.message).toBe('Hello\nWorld');
    expect(result.path).toBe('C:\\temp');
  });
});
