/**
 * Comprehensive Integration Tests for ODIN TypeScript SDK
 *
 * End-to-end integration scenarios covering:
 * - Verb expression chains
 * - Source parser integration (JSON, CSV, XML)
 * - Output formatter integration (JSON, CSV, XML, ODIN)
 * - Builder advanced usage
 * - Diff/patch roundtrips
 * - Large document handling
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../src/index.js';
import { parseTransform, executeTransform } from '../../src/transform/index.js';
import {
  parseJson,
  parseXml,
  parseCsv,
} from '../../src/transform/source-parsers.js';
import {
  formatOutput,
  normalizeToOdin,
} from '../../src/transform/formatters.js';
import type { OdinTransform, TransformValue } from '../../src/types/transform.js';
import { extractValues } from '../transform/helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getValues(result: ReturnType<typeof executeTransform>) {
  return extractValues(result.output);
}

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

function num(value: number): TransformValue {
  return { type: 'number', value };
}

function bool(value: boolean): TransformValue {
  return { type: 'boolean', value };
}

function nil(): TransformValue {
  return { type: 'null' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: VERB EXPRESSION CHAINS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Verb Expression Chains', () => {
  it('chains upper + trim', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
name = "%upper %trim @.raw"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { raw: '  hello world  ' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { name: string } };
    expect(output.output.name).toBe('HELLO WORLD');
  });

  it('chains lower + trim', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
name = "%trim %lower @.raw"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { raw: '  HELLO WORLD  ' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { name: string } };
    expect(output.output.name).toBe('hello world');
  });

  it('chains concat with multiple arguments', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
fullName = "%concat @.first @.last"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { first: 'John ', last: 'Doe' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { fullName: string } };
    expect(output.output.fullName).toBe('John Doe');
  });

  it('chains replace on a string', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
cleaned = "%replace @.text \\"-\\" \\" \\""
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { text: 'hello-world' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { cleaned: string } };
    expect(output.output.cleaned).toBe('hello world');
  });

  it('chains add for numeric values', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
total = "%add @.price @.tax"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { price: 100, tax: 15 });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { total: number } };
    expect(output.output.total).toBe(115);
  });

  it('chains subtract for numeric values', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
net = "%subtract @.gross @.deductions"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { gross: 1000, deductions: 250 });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { net: number } };
    expect(output.output.net).toBe(750);
  });

  it('chains multiply for numeric values', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
total = "%multiply @.qty @.price"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { qty: 5, price: 20 });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { total: number } };
    expect(output.output.total).toBe(100);
  });

  it('chains divide for numeric values', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
avg = "%divide @.total @.count"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { total: 100, count: 4 });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { avg: number } };
    expect(output.output.avg).toBe(25);
  });

  it('chains round for precision', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
rounded = "%round @.value ##2"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { value: 3.14159 });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { rounded: number } };
    expect(output.output.rounded).toBeCloseTo(3.14, 2);
  });

  it('chains length on a string', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
len = "%length @.text"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { text: 'hello' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { len: number } };
    expect(output.output.len).toBe(5);
  });

  it('chains substring for extracting part of string', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
prefix = "%substring @.text ##0 ##3"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { text: 'hello world' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { prefix: string } };
    expect(output.output.prefix).toBe('hel');
  });

  it('chains padLeft on a string', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
padded = "%padLeft @.code ##5 \\"0\\""
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { code: '42' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { padded: string } };
    expect(output.output.padded).toBe('00042');
  });

  it('chains padRight on a string', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
padded = "%padRight @.code ##5 \\"0\\""
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { code: '42' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { padded: string } };
    expect(output.output.padded).toBe('42000');
  });

  it('chains ifElse conditional', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
status = "%ifElse @.active \\"Active\\" \\"Inactive\\""
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { active: true });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { status: string } };
    expect(output.output.status).toBe('Active');
  });

  it('chains ifElse with false condition', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
status = "%ifElse @.active \\"Active\\" \\"Inactive\\""
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { active: false });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { status: string } };
    expect(output.output.status).toBe('Inactive');
  });

  it('chains coalesce to pick first non-null', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
name = "%coalesce @.preferred @.given @.legal"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { preferred: null, given: 'Johnny', legal: 'John' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { name: string } };
    expect(output.output.name).toBe('Johnny');
  });

  it('chains coerceString for type conversion', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
ageStr = "%coerceString @.age"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { age: 30 });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { ageStr: string } };
    expect(output.output.ageStr).toBe('30');
  });

  it('chains coerceNumber for type conversion', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
amount = "%coerceNumber @.amountStr"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { amountStr: '42.5' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { amount: number } };
    expect(output.output.amount).toBe(42.5);
  });

  it('chains coerceInteger for type conversion', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
count = "%coerceInteger @.countStr"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { countStr: '42' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { count: number } };
    expect(output.output.count).toBe(42);
  });

  it('chains coerceBoolean for type conversion', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
flag = "%coerceBoolean @.flagStr"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { flagStr: 'true' });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { flag: boolean } };
    expect(output.output.flag).toBe(true);
  });

  it('applies literal values', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
version = "1.0"
count = ##0
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, {});
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { version: string; count: number } };
    expect(output.output.version).toBe('1.0');
    expect(output.output.count).toBe(0);
  });

  it('handles nested path copy', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
city = @.address.city
state = @.address.state
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, {
      address: { city: 'Austin', state: 'TX' },
    });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { city: string; state: string } };
    expect(output.output.city).toBe('Austin');
    expect(output.output.state).toBe('TX');
  });

  it('handles minOf verb', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
smallest = "%minOf @.a @.b"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { a: 10, b: 5 });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { smallest: number } };
    expect(output.output.smallest).toBe(5);
  });

  it('handles maxOf verb', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
largest = "%maxOf @.a @.b"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { a: 10, b: 5 });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { largest: number } };
    expect(output.output.largest).toBe(10);
  });

  it('handles abs verb', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
positive = "%abs @.value"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { value: -42 });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { positive: number } };
    expect(output.output.positive).toBe(42);
  });

  it('handles mod verb', () => {
    const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
remainder = "%mod @.value ##3"
`;
    const transform = parseTransform(transformDoc);
    const result = executeTransform(transform, { value: 10 });
    expect(result.success).toBe(true);
    const output = getValues(result) as { output: { remainder: number } };
    expect(output.output.remainder).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: SOURCE PARSER INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Source Parser Integration', () => {
  describe('JSON parser', () => {
    it('parses deeply nested JSON', () => {
      const json = '{"a":{"b":{"c":{"d":{"e":"deep"}}}}}';
      const result = parseJson(json);
      expect((result as any).a.b.c.d.e).toBe('deep');
    });

    it('parses JSON with arrays of objects', () => {
      const json = '{"items":[{"name":"a"},{"name":"b"},{"name":"c"}]}';
      const result = parseJson(json);
      expect((result as any).items).toHaveLength(3);
      expect((result as any).items[0].name).toBe('a');
      expect((result as any).items[2].name).toBe('c');
    });

    it('parses JSON with escaped strings', () => {
      const json = '{"msg":"hello \\"world\\"","path":"c:\\\\temp"}';
      const result = parseJson(json);
      expect((result as any).msg).toBe('hello "world"');
      expect((result as any).path).toBe('c:\\temp');
    });

    it('parses JSON with unicode escapes', () => {
      const json = '{"emoji":"\\u2764","text":"caf\\u00e9"}';
      const result = parseJson(json);
      expect((result as any).emoji).toBe('\u2764');
      expect((result as any).text).toBe('cafe\u0301'.normalize('NFC') === 'caf\u00e9' ? 'caf\u00e9' : (result as any).text);
    });

    it('parses JSON with mixed types in arrays', () => {
      const json = '{"mixed":[1,"two",true,null,3.14]}';
      const result = parseJson(json);
      const mixed = (result as any).mixed;
      expect(mixed[0]).toBe(1);
      expect(mixed[1]).toBe('two');
      expect(mixed[2]).toBe(true);
      expect(mixed[3]).toBeNull();
      expect(mixed[4]).toBe(3.14);
    });

    it('parses empty JSON objects and arrays', () => {
      expect(parseJson('{}')).toEqual({});
      expect(parseJson('{"items":[]}')).toEqual({ items: [] });
    });

    it('parses JSON with large numbers', () => {
      const json = '{"big":999999999999,"small":-999999999999,"decimal":1.23456789012345}';
      const result = parseJson(json);
      expect((result as any).big).toBe(999999999999);
      expect((result as any).small).toBe(-999999999999);
      expect((result as any).decimal).toBeCloseTo(1.23456789012345);
    });

    it('throws on malformed JSON', () => {
      expect(() => parseJson('{')).toThrow();
      expect(() => parseJson('{"key":')).toThrow();
      expect(() => parseJson('{key: "value"}')).toThrow();
    });
  });

  describe('CSV parser', () => {
    it('parses basic CSV', () => {
      const csv = 'name,age\nJohn,30\nJane,25';
      const result = parseCsv(csv);
      expect(result).toHaveLength(2);
      expect((result as any)[0].name).toBe('John');
      expect((result as any)[0].age).toBe(30);
      expect((result as any)[1].name).toBe('Jane');
    });

    it('parses CSV with quoted fields', () => {
      const csv = 'name,description\n"Doe, John","Has a ""nickname"""';
      const result = parseCsv(csv);
      expect((result as any)[0].name).toBe('Doe, John');
      expect((result as any)[0].description).toBe('Has a "nickname"');
    });

    it('parses CSV with custom delimiter', () => {
      const csv = 'name|age\nJohn|30\nJane|25';
      const result = parseCsv(csv, { delimiter: '|' });
      expect(result).toHaveLength(2);
      expect((result as any)[0].name).toBe('John');
      expect((result as any)[0].age).toBe(30);
    });

    it('parses CSV with tab delimiter', () => {
      const csv = 'name\tage\nJohn\t30';
      const result = parseCsv(csv, { delimiter: '\t' });
      expect(result).toHaveLength(1);
      expect((result as any)[0].name).toBe('John');
    });

    it('parses CSV with empty fields', () => {
      const csv = 'a,b,c\n1,,3';
      const result = parseCsv(csv);
      expect((result as any)[0].a).toBe(1);
      expect((result as any)[0].b).toBeNull();
      expect((result as any)[0].c).toBe(3);
    });

    it('parses CSV with single row', () => {
      const csv = 'name,age\nSolo,1';
      const result = parseCsv(csv);
      expect(result).toHaveLength(1);
      expect((result as any)[0].name).toBe('Solo');
    });

    it('handles CSV header-only (no data rows)', () => {
      const csv = 'name,age';
      const result = parseCsv(csv);
      expect(result).toHaveLength(0);
    });
  });

  describe('XML parser', () => {
    it('parses XML with attributes', () => {
      const xml = '<person id="123"><name>John</name></person>';
      const result = parseXml(xml);
      expect((result as any).person['@id']).toBe('123');
      expect((result as any).person.name).toBe('John');
    });

    it('parses nested XML', () => {
      const xml = '<root><level1><level2><level3>deep</level3></level2></level1></root>';
      const result = parseXml(xml);
      expect((result as any).root.level1.level2.level3).toBe('deep');
    });

    it('parses XML with repeated elements as arrays', () => {
      const xml = '<list><item>one</item><item>two</item><item>three</item></list>';
      const result = parseXml(xml);
      expect(Array.isArray((result as any).list.item)).toBe(true);
      expect((result as any).list.item).toHaveLength(3);
    });

    it('parses XML with self-closing tags', () => {
      const xml = '<root><empty/><name>test</name></root>';
      const result = parseXml(xml);
      expect((result as any).root.name).toBe('test');
    });

    it('parses XML with multiple attributes', () => {
      const xml = '<item sku="ABC" qty="10" active="true">Widget</item>';
      const result = parseXml(xml);
      expect((result as any).item['@sku']).toBe('ABC');
      expect((result as any).item['@qty']).toBe('10');
      expect((result as any).item['@active']).toBe('true');
    });

    it('parses XML with CDATA', () => {
      const xml = '<root><data><![CDATA[Some <special> content]]></data></root>';
      const result = parseXml(xml);
      expect((result as any).root.data).toContain('Some <special> content');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: OUTPUT FORMATTER INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Output Formatter Integration', () => {
  describe('JSON output', () => {
    it('formats simple values to JSON', () => {
      const output: Record<string, TransformValue> = {
        name: str('John'),
        age: int(30),
        active: bool(true),
      };
      const transform = createTransform('json');
      const result = formatOutput(output, { transform });
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('John');
      expect(parsed.age).toBe(30);
      expect(parsed.active).toBe(true);
    });

    it('formats nested objects to JSON', () => {
      const output: Record<string, TransformValue> = {
        'person.name': str('John'),
        'person.age': int(30),
      };
      const transform = createTransform('json');
      const result = formatOutput(output, { transform });
      const parsed = JSON.parse(result);
      expect(parsed.person.name).toBe('John');
      expect(parsed.person.age).toBe(30);
    });

    it('formats null values to JSON', () => {
      const output: Record<string, TransformValue> = {
        value: nil(),
      };
      const transform = createTransform('json');
      const result = formatOutput(output, { transform });
      const parsed = JSON.parse(result);
      expect(parsed.value).toBeNull();
    });

    it('formats number values to JSON', () => {
      const output: Record<string, TransformValue> = {
        pi: num(3.14159),
        count: int(42),
      };
      const transform = createTransform('json');
      const result = formatOutput(output, { transform });
      const parsed = JSON.parse(result);
      expect(parsed.pi).toBeCloseTo(3.14159);
      expect(parsed.count).toBe(42);
    });
  });

  describe('CSV output', () => {
    it('formats records to CSV output', () => {
      const output: Record<string, TransformValue> = {
        name: str('John'),
        age: int(30),
      };
      const transform = createTransform('csv');
      const result = formatOutput(output, { transform });
      // CSV formatter should produce some output
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('ODIN output', () => {
    it('formats simple values to ODIN text via transform', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->odin"
target.format = "odin"

{output}
name = @.name
age = @.age
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { name: 'John', age: 30 });
      expect(result.success).toBe(true);
      if (result.formatted) {
        expect(result.formatted).toContain('name');
        expect(result.formatted).toContain('John');
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: BUILDER ADVANCED USAGE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Builder Advanced Usage', () => {
  it('builds document with all value types', () => {
    const doc = Odin.builder()
      .set('str', 'hello')
      .set('int', { type: 'integer', value: 42 })
      .set('num', { type: 'number', value: 3.14 })
      .set('bool', { type: 'boolean', value: true })
      .set('currency', { type: 'currency', value: 99.99 })
      .set('nil', null)
      .build();

    expect(doc.getString('str')).toBe('hello');
    expect(doc.getInteger('int')).toBe(42);
    expect(doc.getNumber('num')).toBeCloseTo(3.14);
    expect(doc.getBoolean('bool')).toBe(true);
    expect(doc.getNumber('currency')).toBeCloseTo(99.99);
    expect(doc.get('nil')?.type).toBe('null');
  });

  it('builds document with metadata', () => {
    const doc = Odin.builder()
      .metadata('odin', '1.0.0')
      .metadata('id', 'test-123')
      .set('name', 'Test')
      .build();

    expect(doc.getString('$.odin')).toBe('1.0.0');
    expect(doc.getString('$.id')).toBe('test-123');
    expect(doc.getString('name')).toBe('Test');
  });

  it('builds document with modifiers', () => {
    const doc = Odin.builder()
      .setWithModifiers('name', 'John', { required: true })
      .setWithModifiers('ssn', '123-45-6789', { confidential: true })
      .setWithModifiers('oldField', 'legacy', { deprecated: true })
      .build();

    expect(doc.getString('name')).toBe('John');
    expect(doc.getString('ssn')).toBe('123-45-6789');
    expect(doc.getString('oldField')).toBe('legacy');

    const nameModifiers = doc.modifiers.get('name');
    expect(nameModifiers?.required).toBe(true);

    const ssnModifiers = doc.modifiers.get('ssn');
    expect(ssnModifiers?.confidential).toBe(true);

    const oldModifiers = doc.modifiers.get('oldField');
    expect(oldModifiers?.deprecated).toBe(true);
  });

  it('builds document with combined modifiers', () => {
    const doc = Odin.builder()
      .setWithModifiers('critical', 'value', {
        required: true,
        confidential: true,
        deprecated: true,
      })
      .build();

    const mods = doc.modifiers.get('critical');
    expect(mods?.required).toBe(true);
    expect(mods?.confidential).toBe(true);
    expect(mods?.deprecated).toBe(true);
  });

  it('builds document with nested paths', () => {
    const doc = Odin.builder()
      .set('person.name', 'John')
      .set('person.address.city', 'Austin')
      .set('person.address.state', 'TX')
      .build();

    expect(doc.getString('person.name')).toBe('John');
    expect(doc.getString('person.address.city')).toBe('Austin');
    expect(doc.getString('person.address.state')).toBe('TX');
  });

  it('builds and stringifies a document', () => {
    const doc = Odin.builder()
      .set('name', 'John')
      .set('age', { type: 'integer', value: 30 })
      .build();

    const text = Odin.stringify(doc);
    expect(text).toContain('name = "John"');
    expect(text).toContain('age = ##30');
  });

  it('builds, stringifies, and re-parses a document', () => {
    const original = Odin.builder()
      .set('name', 'Jane')
      .set('count', { type: 'integer', value: 5 })
      .set('active', { type: 'boolean', value: false })
      .build();

    const text = Odin.stringify(original);
    const reparsed = Odin.parse(text);

    expect(reparsed.getString('name')).toBe('Jane');
    expect(reparsed.getInteger('count')).toBe(5);
    expect(reparsed.getBoolean('active')).toBe(false);
  });

  it('builds document with multiple sections via paths', () => {
    const doc = Odin.builder()
      .set('customer.name', 'John')
      .set('customer.email', 'john@example.com')
      .set('order.id', 'ORD-001')
      .set('order.total', { type: 'currency', value: 99.99 })
      .build();

    expect(doc.getString('customer.name')).toBe('John');
    expect(doc.getString('customer.email')).toBe('john@example.com');
    expect(doc.getString('order.id')).toBe('ORD-001');
    expect(doc.getNumber('order.total')).toBeCloseTo(99.99);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: DIFF/PATCH ROUNDTRIPS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Diff/Patch Roundtrips', () => {
  it('roundtrips additions', () => {
    const doc1 = Odin.parse('name = "John"');
    const doc2 = Odin.parse('name = "John"\nage = ##30');

    const diff = Odin.diff(doc1, doc2);
    expect(diff.additions).toHaveLength(1);

    const patched = Odin.patch(doc1, diff);
    expect(patched.getString('name')).toBe('John');
    expect(patched.getInteger('age')).toBe(30);
  });

  it('roundtrips deletions', () => {
    const doc1 = Odin.parse('name = "John"\nage = ##30');
    const doc2 = Odin.parse('name = "John"');

    const diff = Odin.diff(doc1, doc2);
    expect(diff.deletions).toHaveLength(1);

    const patched = Odin.patch(doc1, diff);
    expect(patched.getString('name')).toBe('John');
    expect(patched.get('age')).toBeUndefined();
  });

  it('roundtrips modifications', () => {
    const doc1 = Odin.parse('name = "John"');
    const doc2 = Odin.parse('name = "Jane"');

    const diff = Odin.diff(doc1, doc2);
    expect(diff.modifications).toHaveLength(1);

    const patched = Odin.patch(doc1, diff);
    expect(patched.getString('name')).toBe('Jane');
  });

  it('roundtrips type changes (string to integer)', () => {
    const doc1 = Odin.parse('value = "42"');
    const doc2 = Odin.parse('value = ##42');

    const diff = Odin.diff(doc1, doc2);
    expect(diff.modifications).toHaveLength(1);

    const patched = Odin.patch(doc1, diff);
    expect(patched.get('value')?.type).toBe('integer');
    expect(patched.getInteger('value')).toBe(42);
  });

  it('roundtrips type changes (number to boolean)', () => {
    const doc1 = Odin.parse('flag = #1');
    const doc2 = Odin.parse('flag = ?true');

    const diff = Odin.diff(doc1, doc2);
    const patched = Odin.patch(doc1, diff);
    expect(patched.get('flag')?.type).toBe('boolean');
    expect(patched.getBoolean('flag')).toBe(true);
  });

  it('roundtrips section changes', () => {
    const doc1 = Odin.parse(`
{customer}
name = "John"
email = "john@example.com"
`);
    const doc2 = Odin.parse(`
{customer}
name = "Jane"
email = "jane@example.com"
phone = "555-1234"
`);

    const diff = Odin.diff(doc1, doc2);
    const patched = Odin.patch(doc1, diff);
    expect(patched.getString('customer.name')).toBe('Jane');
    expect(patched.getString('customer.email')).toBe('jane@example.com');
    expect(patched.getString('customer.phone')).toBe('555-1234');
  });

  it('roundtrips multiple changes', () => {
    const doc1 = Odin.parse(`
name = "John"
age = ##30
city = "Austin"
`);
    const doc2 = Odin.parse(`
name = "Jane"
age = ##31
state = "TX"
`);

    const diff = Odin.diff(doc1, doc2);
    const patched = Odin.patch(doc1, diff);
    expect(patched.getString('name')).toBe('Jane');
    expect(patched.getInteger('age')).toBe(31);
    expect(patched.get('city')).toBeUndefined();
    expect(patched.getString('state')).toBe('TX');
  });

  it('roundtrips empty diff (no changes)', () => {
    const doc1 = Odin.parse('name = "John"\nage = ##30');
    const doc2 = Odin.parse('name = "John"\nage = ##30');

    const diff = Odin.diff(doc1, doc2);
    expect(diff.isEmpty).toBe(true);

    const patched = Odin.patch(doc1, diff);
    expect(patched.getString('name')).toBe('John');
    expect(patched.getInteger('age')).toBe(30);
  });

  it('roundtrips null value changes', () => {
    const doc1 = Odin.parse('value = "something"');
    const doc2 = Odin.parse('value = ~');

    const diff = Odin.diff(doc1, doc2);
    const patched = Odin.patch(doc1, diff);
    expect(patched.get('value')?.type).toBe('null');
  });

  it('roundtrips boolean value changes', () => {
    const doc1 = Odin.parse('active = ?true');
    const doc2 = Odin.parse('active = ?false');

    const diff = Odin.diff(doc1, doc2);
    const patched = Odin.patch(doc1, diff);
    expect(patched.getBoolean('active')).toBe(false);
  });

  it('roundtrips currency value changes', () => {
    const doc1 = Odin.parse('price = #$99.99');
    const doc2 = Odin.parse('price = #$149.99');

    const diff = Odin.diff(doc1, doc2);
    const patched = Odin.patch(doc1, diff);
    expect(patched.getNumber('price')).toBeCloseTo(149.99);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: LARGE DOCUMENT HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Large Document Handling', () => {
  it('handles document with 100+ fields', () => {
    const lines: string[] = [];
    for (let i = 0; i < 150; i++) {
      lines.push(`field${i} = "value${i}"`);
    }
    const text = lines.join('\n');
    const doc = Odin.parse(text);

    expect(doc.getString('field0')).toBe('value0');
    expect(doc.getString('field99')).toBe('value99');
    expect(doc.getString('field149')).toBe('value149');
  });

  it('handles document with deep nesting (10 levels)', () => {
    const segments = Array.from({ length: 10 }, (_, i) => `level${i}`);
    const path = segments.join('.');
    const doc = Odin.parse(`${path} = "deep"`);
    expect(doc.getString(path)).toBe('deep');
  });

  it('handles document with large arrays', () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(`items[${i}] = "item${i}"`);
    }
    const text = lines.join('\n');
    const doc = Odin.parse(text);

    expect(doc.getString('items[0]')).toBe('item0');
    expect(doc.getString('items[49]')).toBe('item49');
  });

  it('handles document with multiple sections', () => {
    const text = `
{section1}
name = "one"
value = ##1

{section2}
name = "two"
value = ##2

{section3}
name = "three"
value = ##3
`;
    const doc = Odin.parse(text);
    expect(doc.getString('section1.name')).toBe('one');
    expect(doc.getString('section2.name')).toBe('two');
    expect(doc.getString('section3.name')).toBe('three');
  });

  it('stringify handles large documents', () => {
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`field${i} = "value${i}"`);
    }
    const text = lines.join('\n');
    const doc = Odin.parse(text);
    const output = Odin.stringify(doc);

    expect(output).toContain('field0 = "value0"');
    expect(output).toContain('field99 = "value99"');
  });

  it('diff handles large documents efficiently', () => {
    const lines1: string[] = [];
    const lines2: string[] = [];
    for (let i = 0; i < 100; i++) {
      lines1.push(`field${i} = "value${i}"`);
      lines2.push(`field${i} = "${i < 50 ? 'value' + i : 'changed' + i}"`);
    }
    const doc1 = Odin.parse(lines1.join('\n'));
    const doc2 = Odin.parse(lines2.join('\n'));

    const diff = Odin.diff(doc1, doc2);
    expect(diff.modifications.length).toBe(50);
  });

  it('handles mixed type fields in a large document', () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(`str${i} = "text${i}"`);
      lines.push(`num${i} = #${i}.5`);
      lines.push(`int${i} = ##${i}`);
      lines.push(`bool${i} = ?${i % 2 === 0 ? 'true' : 'false'}`);
    }
    const text = lines.join('\n');
    const doc = Odin.parse(text);

    expect(doc.getString('str0')).toBe('text0');
    expect(doc.getNumber('num0')).toBeCloseTo(0.5);
    expect(doc.getInteger('int0')).toBe(0);
    expect(doc.getBoolean('bool0')).toBe(true);
    expect(doc.getBoolean('bool1')).toBe(false);
  });

  it('build and parse large document roundtrip', () => {
    const builder = Odin.builder();
    for (let i = 0; i < 100; i++) {
      builder.set(`field${i}`, `value${i}`);
    }
    const doc = builder.build();
    const text = Odin.stringify(doc);
    const reparsed = Odin.parse(text);

    for (let i = 0; i < 100; i++) {
      expect(reparsed.getString(`field${i}`)).toBe(`value${i}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: PARSE + STRINGIFY ROUNDTRIPS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Parse + Stringify Roundtrips', () => {
  it('roundtrips strings', () => {
    const text = 'name = "John Doe"';
    const doc = Odin.parse(text);
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.getString('name')).toBe('John Doe');
  });

  it('roundtrips integers', () => {
    const doc = Odin.parse('count = ##42');
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.getInteger('count')).toBe(42);
  });

  it('roundtrips numbers', () => {
    const doc = Odin.parse('pi = #3.14');
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.getNumber('pi')).toBeCloseTo(3.14);
  });

  it('roundtrips booleans', () => {
    const doc = Odin.parse('active = ?true\ndeleted = ?false');
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.getBoolean('active')).toBe(true);
    expect(reparsed.getBoolean('deleted')).toBe(false);
  });

  it('roundtrips null', () => {
    const doc = Odin.parse('nothing = ~');
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.get('nothing')?.type).toBe('null');
  });

  it('roundtrips currency', () => {
    const doc = Odin.parse('price = #$99.99');
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.getNumber('price')).toBeCloseTo(99.99);
  });

  it('roundtrips dates', () => {
    const doc = Odin.parse('effective = 2024-06-15');
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.get('effective')?.type).toBe('date');
  });

  it('roundtrips timestamps', () => {
    const doc = Odin.parse('created = 2024-06-15T10:30:00Z');
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.get('created')?.type).toBe('timestamp');
  });

  it('roundtrips references', () => {
    const doc = Odin.parse('ref = @other.path');
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.get('ref')?.type).toBe('reference');
  });

  it('roundtrips binary values', () => {
    const doc = Odin.parse('data = ^SGVsbG8=');
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.get('data')?.type).toBe('binary');
  });

  it('roundtrips sections', () => {
    const text = `
{customer}
name = "John"
email = "john@example.com"
`;
    const doc = Odin.parse(text);
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.getString('customer.name')).toBe('John');
    expect(reparsed.getString('customer.email')).toBe('john@example.com');
  });

  it('roundtrips arrays', () => {
    const text = `
items[0] = "first"
items[1] = "second"
items[2] = "third"
`;
    const doc = Odin.parse(text);
    const output = Odin.stringify(doc);
    const reparsed = Odin.parse(output);
    expect(reparsed.getString('items[0]')).toBe('first');
    expect(reparsed.getString('items[1]')).toBe('second');
    expect(reparsed.getString('items[2]')).toBe('third');
  });
});
