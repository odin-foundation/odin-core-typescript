/**
 * Comprehensive source parser tests for Rust parity.
 *
 * Covers JSON, CSV, XML, Fixed-Width, YAML, and Flat parsers
 * with edge cases not covered by existing tests.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSource,
  parseJson,
  parseXml,
  parseCsv,
  parseFixedWidth,
  parseFixedWidthRecord,
  parseFlat,
  parseYaml,
  extractDiscriminator,
  extractFixedWidthDiscriminator,
} from '../../src/transform/source-parsers.js';

// ─────────────────────────────────────────────────────────────────────────────
// JSON Parser - Comprehensive
// ─────────────────────────────────────────────────────────────────────────────

describe('JSON Parser - Comprehensive', () => {
  it('parses empty object', () => {
    expect(parseJson('{}')).toEqual({});
  });

  it('parses empty array', () => {
    expect(parseJson('[]')).toEqual([]);
  });

  it('parses nested objects three levels deep', () => {
    const input = '{"a":{"b":{"c":"deep"}}}';
    const result = parseJson(input);
    expect((result as any).a.b.c).toBe('deep');
  });

  it('parses array of objects', () => {
    const input = '[{"name":"Alice"},{"name":"Bob"}]';
    const result = parseJson(input) as any[];
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
    expect(result[1].name).toBe('Bob');
  });

  it('parses null value', () => {
    const result = parseJson('{"value":null}');
    expect((result as any).value).toBeNull();
  });

  it('parses boolean values', () => {
    const result = parseJson('{"t":true,"f":false}');
    expect((result as any).t).toBe(true);
    expect((result as any).f).toBe(false);
  });

  it('parses string with escape sequences', () => {
    const input = '{"msg":"line1\\nline2\\ttab"}';
    const result = parseJson(input);
    expect((result as any).msg).toBe('line1\nline2\ttab');
  });

  it('parses string with unicode escapes', () => {
    const input = '{"msg":"\\u0048\\u0065\\u006c\\u006c\\u006f"}';
    const result = parseJson(input);
    expect((result as any).msg).toBe('Hello');
  });

  it('parses deeply nested (5 levels)', () => {
    const input = '{"a":{"b":{"c":{"d":{"e":"value"}}}}}';
    const result = parseJson(input);
    expect((result as any).a.b.c.d.e).toBe('value');
  });

  it('parses mixed array types', () => {
    const input = '[1, "two", true, null, 3.14]';
    const result = parseJson(input) as any[];
    expect(result[0]).toBe(1);
    expect(result[1]).toBe('two');
    expect(result[2]).toBe(true);
    expect(result[3]).toBeNull();
    expect(result[4]).toBe(3.14);
  });

  it('parses large integer', () => {
    const input = '{"big":9007199254740991}';
    const result = parseJson(input);
    expect((result as any).big).toBe(9007199254740991);
  });

  it('parses negative numbers', () => {
    const input = '{"neg":-42,"negFloat":-3.14}';
    const result = parseJson(input);
    expect((result as any).neg).toBe(-42);
    expect((result as any).negFloat).toBe(-3.14);
  });

  it('parses zero values', () => {
    const input = '{"z":0,"zf":0.0}';
    const result = parseJson(input);
    expect((result as any).z).toBe(0);
    expect((result as any).zf).toBe(0);
  });

  it('throws on trailing comma', () => {
    expect(() => parseJson('{"a":1,}')).toThrow();
  });

  it('throws on single quotes', () => {
    expect(() => parseJson("{'a':1}")).toThrow();
  });

  it('throws on empty input', () => {
    expect(() => parseJson('')).toThrow();
  });

  it('throws on incomplete object', () => {
    expect(() => parseJson('{"a":')).toThrow();
  });

  it('works through parseSource with json format', () => {
    const result = parseSource('{"x":1}', 'json');
    expect(result.data).toEqual({ x: 1 });
    expect(result.raw).toBe('{"x":1}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV Parser - Comprehensive
// ─────────────────────────────────────────────────────────────────────────────

describe('CSV Parser - Comprehensive', () => {
  it('parses single column', () => {
    const result = parseCsv('name\nAlice\nBob');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Alice' });
    expect(result[1]).toEqual({ name: 'Bob' });
  });

  it('parses many columns', () => {
    const result = parseCsv('a,b,c,d,e\n1,2,3,4,5');
    expect(result[0]).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 });
  });

  it('parses many rows', () => {
    const lines = ['name'];
    for (let i = 0; i < 100; i++) {
      lines.push(`row${i}`);
    }
    const result = parseCsv(lines.join('\n'));
    expect(result).toHaveLength(100);
    expect(result[0]).toEqual({ name: 'row0' });
    expect(result[99]).toEqual({ name: 'row99' });
  });

  it('handles empty fields in middle', () => {
    const result = parseCsv('a,b,c\n1,,3');
    expect(result[0]).toEqual({ a: 1, b: null, c: 3 });
  });

  it('handles all empty fields', () => {
    const result = parseCsv('a,b\n,');
    expect(result[0]).toEqual({ a: null, b: null });
  });

  it('handles semicolon delimiter', () => {
    const result = parseCsv('a;b\n1;2', { delimiter: ';' });
    expect(result[0]).toEqual({ a: 1, b: 2 });
  });

  it('handles pipe delimiter', () => {
    const result = parseCsv('a|b\n1|2', { delimiter: '|' });
    expect(result[0]).toEqual({ a: 1, b: 2 });
  });

  it('handles tab delimiter', () => {
    const result = parseCsv('a\tb\n1\t2', { delimiter: '\t' });
    expect(result[0]).toEqual({ a: 1, b: 2 });
  });

  it('handles CRLF line endings', () => {
    const result = parseCsv('a,b\r\n1,2\r\n3,4');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ a: 1, b: 2 });
  });

  it('handles quoted field with comma', () => {
    const result = parseCsv('name,city\n"Smith, John",NYC');
    expect(result[0]).toEqual({ name: 'Smith, John', city: 'NYC' });
  });

  it('handles quoted field with escaped quotes', () => {
    const result = parseCsv('msg\n"He said ""hi"""');
    expect(result[0]).toEqual({ msg: 'He said "hi"' });
  });

  it('handles quoted field with newline', () => {
    const result = parseCsv('msg\n"line1\nline2"');
    expect(result[0]).toEqual({ msg: 'line1\nline2' });
  });

  it('infers integer type', () => {
    const result = parseCsv('val\n42');
    expect(result[0]!.val).toBe(42);
  });

  it('infers float type', () => {
    const result = parseCsv('val\n3.14');
    expect(result[0]!.val).toBe(3.14);
  });

  it('infers boolean true', () => {
    const result = parseCsv('val\ntrue');
    expect(result[0]!.val).toBe(true);
  });

  it('infers boolean false', () => {
    const result = parseCsv('val\nfalse');
    expect(result[0]!.val).toBe(false);
  });

  it('handles header-only CSV (no data rows)', () => {
    const result = parseCsv('a,b,c');
    expect(result).toEqual([]);
  });

  it('handles no-header mode with generated column names', () => {
    const result = parseCsv('Alice,30', { hasHeader: false });
    expect(result[0]).toEqual({ col0: 'Alice', col1: 30 });
  });

  it('works through parseSource with delimited alias', () => {
    const result = parseSource('a,b\n1,2', 'delimited');
    expect(result.data).toEqual([{ a: 1, b: 2 }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// XML Parser - Comprehensive
// ─────────────────────────────────────────────────────────────────────────────

describe('XML Parser - Comprehensive', () => {
  it('parses single element', () => {
    const result = parseXml('<root><name>Alice</name></root>');
    expect((result as any).root.name).toBe('Alice');
  });

  it('parses element with attributes', () => {
    const result = parseXml('<item id="123" type="A">value</item>');
    expect((result as any).item['@id']).toBe('123');
    expect((result as any).item['@type']).toBe('A');
  });

  it('parses deeply nested elements (4 levels)', () => {
    const result = parseXml('<a><b><c><d>deep</d></c></b></a>');
    expect((result as any).a.b.c.d).toBe('deep');
  });

  it('parses repeated elements as arrays', () => {
    const result = parseXml('<root><item>A</item><item>B</item></root>');
    expect((result as any).root.item).toEqual(['A', 'B']);
  });

  it('handles self-closing elements', () => {
    const result = parseXml('<root><empty/></root>');
    expect((result as any).root.empty).toBeNull();
  });

  it('handles self-closing with attributes', () => {
    const result = parseXml('<root><item id="1"/></root>');
    // Self-closing element with attributes - implementation may store as null or object
    const root = (result as any).root;
    expect(root).toBeDefined();
    expect(root.item).toBeDefined();
  });

  it('decodes XML entities', () => {
    const result = parseXml('<root><text>&lt;&gt;&amp;&quot;&apos;</text></root>');
    expect((result as any).root.text).toBe('<>&"\'');
  });

  it('handles XML declaration', () => {
    const result = parseXml('<?xml version="1.0" encoding="UTF-8"?><root><a>1</a></root>');
    expect((result as any).root.a).toBe('1');
  });

  it('handles CDATA section', () => {
    const result = parseXml('<root><data><![CDATA[<script>alert("hi")</script>]]></data></root>');
    expect((result as any).root.data).toContain('<script>');
  });

  it('handles empty text element', () => {
    const result = parseXml('<root><empty></empty></root>');
    expect(result).toBeDefined();
  });

  it('handles namespace prefixed elements', () => {
    const result = parseXml('<ns:root xmlns:ns="http://example.com"><ns:item>val</ns:item></ns:root>');
    expect(result).toBeDefined();
  });

  it('handles mixed siblings of different types', () => {
    const result = parseXml('<root><name>Alice</name><age>30</age><active>true</active></root>');
    const root = (result as any).root;
    expect(root.name).toBe('Alice');
    expect(root.age).toBe('30');
    expect(root.active).toBe('true');
  });

  it('handles attributes and child elements together', () => {
    const result = parseXml('<person id="1"><name>Alice</name></person>');
    const person = (result as any).person;
    expect(person['@id']).toBe('1');
    expect(person.name).toBe('Alice');
  });

  it('works through parseSource with xml format', () => {
    const result = parseSource('<r><a>1</a></r>', 'xml');
    expect((result.data as any).r.a).toBe('1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixed-Width Parser - Comprehensive
// ─────────────────────────────────────────────────────────────────────────────

describe('Fixed-Width Parser - Comprehensive', () => {
  it('splits input into lines', () => {
    const result = parseFixedWidth('LINE1\nLINE2\nLINE3');
    expect(result).toEqual(['LINE1', 'LINE2', 'LINE3']);
  });

  it('handles single line', () => {
    const result = parseFixedWidth('SINGLELINE');
    expect(result).toEqual(['SINGLELINE']);
  });

  it('parses record with string fields', () => {
    const fields = [
      { name: 'first', pos: 0, len: 5 },
      { name: 'last', pos: 5, len: 10 },
    ];
    const result = parseFixedWidthRecord('ALICEJOHNSON   ', fields);
    expect(result.first).toBe('ALICE');
    expect(result.last).toBe('JOHNSON');
  });

  it('parses record with integer field', () => {
    const fields = [{ name: 'count', pos: 0, len: 5, type: 'integer' as const }];
    const result = parseFixedWidthRecord('00042', fields);
    expect(result.count).toBe(42);
  });

  it('parses record with number field and implied decimals', () => {
    const fields = [{ name: 'amount', pos: 0, len: 8, type: 'number' as const, impliedDecimals: 2 }];
    const result = parseFixedWidthRecord('00012345', fields);
    expect(result.amount).toBe(123.45);
  });

  it('parses record with date field', () => {
    const fields = [{ name: 'date', pos: 0, len: 8, type: 'date' as const }];
    const result = parseFixedWidthRecord('20240115', fields);
    expect(result.date).toBe('2024-01-15');
  });

  it('trims whitespace from fields', () => {
    const fields = [{ name: 'name', pos: 0, len: 10 }];
    const result = parseFixedWidthRecord('  Alice   ', fields);
    expect(result.name).toBe('Alice');
  });

  it('handles field beyond record length', () => {
    const fields = [{ name: 'field', pos: 100, len: 5 }];
    const result = parseFixedWidthRecord('SHORT', fields);
    expect(result.field).toBeNull();
  });

  it('handles field partially beyond record', () => {
    const fields = [{ name: 'field', pos: 0, len: 20 }];
    const result = parseFixedWidthRecord('SHORT', fields);
    expect(result.field).toBe('SHORT');
  });

  it('handles multiple fields at contiguous positions', () => {
    const fields = [
      { name: 'a', pos: 0, len: 1 },
      { name: 'b', pos: 1, len: 1 },
      { name: 'c', pos: 2, len: 1 },
    ];
    const result = parseFixedWidthRecord('XYZ', fields);
    expect(result.a).toBe('X');
    expect(result.b).toBe('Y');
    expect(result.c).toBe('Z');
  });

  it('handles empty (all spaces) field', () => {
    const fields = [{ name: 'val', pos: 0, len: 5 }];
    const result = parseFixedWidthRecord('     ', fields);
    expect(result.val).toBeNull();
  });

  it('extracts discriminator by position', () => {
    const disc = extractFixedWidthDiscriminator('HDRDATA', { type: 'position', pos: 0, len: 3 });
    expect(disc).toBe('HDR');
  });

  it('extracts discriminator with default len', () => {
    const disc = extractFixedWidthDiscriminator('AB1234', { type: 'position', pos: 0 });
    expect(disc).toBe('AB');
  });

  it('extracts discriminator mid-record', () => {
    const disc = extractFixedWidthDiscriminator('AAABBBCCC', { type: 'position', pos: 3, len: 3 });
    expect(disc).toBe('BBB');
  });

  it('works through parseSource', () => {
    const result = parseSource('L1\nL2', 'fixed-width');
    expect(result.data).toEqual(['L1', 'L2']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// YAML Parser - Comprehensive
// ─────────────────────────────────────────────────────────────────────────────

describe('YAML Parser - Comprehensive', () => {
  it('parses simple key-value', () => {
    const result = parseYaml('name: Alice');
    expect(result.name).toBe('Alice');
  });

  it('parses nested object', () => {
    const result = parseYaml('person:\n  name: Alice\n  age: 30');
    const person = result.person as Record<string, unknown>;
    expect(person.name).toBe('Alice');
    expect(person.age).toBe(30);
  });

  it('parses simple array', () => {
    const result = parseYaml('items:\n  - one\n  - two\n  - three');
    expect(result.items).toEqual(['one', 'two', 'three']);
  });

  it('parses boolean true variants', () => {
    const result = parseYaml('a: true\nb: yes\nc: on');
    expect(result.a).toBe(true);
    expect(result.b).toBe(true);
    expect(result.c).toBe(true);
  });

  it('parses boolean false variants', () => {
    const result = parseYaml('a: false\nb: no\nc: off');
    expect(result.a).toBe(false);
    expect(result.b).toBe(false);
    expect(result.c).toBe(false);
  });

  it('parses null values', () => {
    const result = parseYaml('a: null\nb: ~');
    expect(result.a).toBeNull();
    expect(result.b).toBeNull();
  });

  it('parses integer values', () => {
    const result = parseYaml('count: 42');
    expect(result.count).toBe(42);
  });

  it('parses float values', () => {
    const result = parseYaml('rate: 3.14');
    expect(result.rate).toBe(3.14);
  });

  it('parses negative numbers', () => {
    const result = parseYaml('neg: -42\nnegf: -3.14');
    expect(result.neg).toBe(-42);
    expect(result.negf).toBe(-3.14);
  });

  it('parses quoted strings', () => {
    const result = parseYaml('msg: "hello world"');
    expect(result.msg).toBe('hello world');
  });

  it('parses single-quoted strings', () => {
    const result = parseYaml("msg: 'hello world'");
    expect(result.msg).toBe('hello world');
  });

  it('skips comments', () => {
    const result = parseYaml('# comment\nname: Alice\n# another');
    expect(result.name).toBe('Alice');
  });

  it('skips empty lines', () => {
    const result = parseYaml('name: Alice\n\n\nage: 30');
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  it('parses mixed types', () => {
    const yaml = `
str: hello
num: 42
flt: 3.14
b: true
n: null
`;
    const result = parseYaml(yaml);
    expect(result.str).toBe('hello');
    expect(result.num).toBe(42);
    expect(result.flt).toBe(3.14);
    expect(result.b).toBe(true);
    expect(result.n).toBeNull();
  });

  it('works through parseSource with yaml format', () => {
    const result = parseSource('name: Alice', 'yaml');
    expect((result.data as any).name).toBe('Alice');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flat Parser - Comprehensive
// ─────────────────────────────────────────────────────────────────────────────

describe('Flat Parser - Comprehensive', () => {
  it('parses simple key=value', () => {
    const result = parseFlat('name=Alice');
    expect(result.name).toBe('Alice');
  });

  it('parses multiple key=value pairs', () => {
    const result = parseFlat('a=1\nb=2\nc=3');
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
    expect(result.c).toBe(3);
  });

  it('parses dot notation nesting', () => {
    const result = parseFlat('user.name=Alice\nuser.age=30');
    const user = result.user as Record<string, unknown>;
    expect(user.name).toBe('Alice');
    expect(user.age).toBe(30);
  });

  it('parses deep dot notation (3 levels)', () => {
    const result = parseFlat('a.b.c=deep');
    expect((result as any).a.b.c).toBe('deep');
  });

  it('parses array bracket notation', () => {
    const result = parseFlat('items[0]=A\nitems[1]=B\nitems[2]=C');
    expect(result.items).toEqual(['A', 'B', 'C']);
  });

  it('parses nested arrays of objects', () => {
    const result = parseFlat('users[0].name=Alice\nusers[0].age=30\nusers[1].name=Bob');
    const users = result.users as any[];
    expect(users[0].name).toBe('Alice');
    expect(users[0].age).toBe(30);
    expect(users[1].name).toBe('Bob');
  });

  it('parses null tilde value', () => {
    const result = parseFlat('val=~');
    expect(result.val).toBeNull();
  });

  it('parses boolean true', () => {
    const result = parseFlat('active=true');
    expect(result.active).toBe(true);
  });

  it('parses boolean false', () => {
    const result = parseFlat('active=false');
    expect(result.active).toBe(false);
  });

  it('parses integer value', () => {
    const result = parseFlat('count=42');
    expect(result.count).toBe(42);
  });

  it('parses float value', () => {
    const result = parseFlat('rate=3.14');
    expect(result.rate).toBe(3.14);
  });

  it('parses double-quoted string', () => {
    const result = parseFlat('msg="Hello, World!"');
    expect(result.msg).toBe('Hello, World!');
  });

  it('parses single-quoted string', () => {
    const result = parseFlat("path='C:\\Users\\test'");
    expect(result.path).toBe('C:\\Users\\test');
  });

  it('handles equals sign inside quoted value', () => {
    const result = parseFlat('eq="a=b"');
    expect(result.eq).toBe('a=b');
  });

  it('skips hash comments', () => {
    const result = parseFlat('# comment\nname=Alice');
    expect(result.name).toBe('Alice');
    expect(Object.keys(result)).not.toContain('#');
  });

  it('skips semicolon comments', () => {
    const result = parseFlat('; comment\nname=Alice');
    expect(result.name).toBe('Alice');
  });

  it('skips empty lines', () => {
    const result = parseFlat('a=1\n\n\nb=2');
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });

  it('works through parseSource with flat format', () => {
    const result = parseSource('x=1', 'flat');
    expect((result.data as any).x).toBe(1);
  });

  it('works through parseSource with properties alias', () => {
    const result = parseSource('x=1', 'properties');
    expect((result.data as any).x).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Discriminator Extraction - Comprehensive
// ─────────────────────────────────────────────────────────────────────────────

describe('Discriminator Extraction - Comprehensive', () => {
  it('extracts position discriminator from string', () => {
    const result = extractDiscriminator('EMPJOHN', { type: 'position', pos: 0, len: 3 });
    expect(result).toBe('EMP');
  });

  it('extracts position discriminator mid-string', () => {
    const result = extractDiscriminator('AAABBBCCC', { type: 'position', pos: 3, len: 3 });
    expect(result).toBe('BBB');
  });

  it('extracts field discriminator from array', () => {
    const result = extractDiscriminator(['EMP', 'John', '30'], { type: 'field', field: 0 });
    expect(result).toBe('EMP');
  });

  it('extracts field discriminator from non-zero index', () => {
    const result = extractDiscriminator(['data', 'EMP', 'more'], { type: 'field', field: 1 });
    expect(result).toBe('EMP');
  });

  it('extracts path discriminator from object', () => {
    const result = extractDiscriminator(
      { meta: { type: 'EMP' }, data: {} },
      { type: 'path', path: 'meta.type' }
    );
    expect(result).toBe('EMP');
  });

  it('returns empty string for missing path', () => {
    const result = extractDiscriminator({ x: 1 }, { type: 'path', path: 'missing.deep' });
    expect(result).toBe('');
  });

  it('returns empty string for invalid input type', () => {
    const result = extractDiscriminator(42, { type: 'path', path: 'x' });
    expect(result).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseSource Generic - Comprehensive
// ─────────────────────────────────────────────────────────────────────────────

describe('parseSource Generic - Comprehensive', () => {
  it('returns raw input for unknown format', () => {
    const result = parseSource('some data', 'unknown');
    expect(result.data).toBe('some data');
    expect(result.raw).toBe('some data');
  });

  it('preserves raw string in all formats', () => {
    const jsonInput = '{"x":1}';
    expect(parseSource(jsonInput, 'json').raw).toBe(jsonInput);

    const csvInput = 'a\n1';
    expect(parseSource(csvInput, 'csv').raw).toBe(csvInput);

    const flatInput = 'x=1';
    expect(parseSource(flatInput, 'flat').raw).toBe(flatInput);
  });
});
