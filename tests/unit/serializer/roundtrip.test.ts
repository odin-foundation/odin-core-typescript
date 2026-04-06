/**
 * Roundtrip and complex document tests for ODIN SDK.
 *
 * Tests for:
 * - Parse -> Stringify -> Parse consistency
 * - Complex nested structures
 * - Large documents
 * - Mixed tabular and hierarchical data
 * - All type combinations
 * - Real-world document patterns
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Roundtrip Tests', () => {
  describe('Simple Value Roundtrip', () => {
    it('should roundtrip string value', () => {
      const original = 'name = "John Smith"';
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('name')).toBe('John Smith');
    });

    it('should roundtrip integer value', () => {
      const doc = Odin.parse('count = ##42');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getInteger('count')).toBe(42);
    });

    it('should roundtrip float value', () => {
      const doc = Odin.parse('rate = #3.14159');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getNumber('rate')).toBeCloseTo(3.14159, 5);
    });

    it('should roundtrip high-precision number (scientific constant)', () => {
      // Pi with 20 decimal places
      const original = 'pi = #3.14159265358979323846';
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);

      // Verify raw value is preserved exactly
      expect(output).toContain('#3.14159265358979323846');

      // Verify it parses back correctly
      const reparsed = Odin.parse(output);
      const value = reparsed.get('pi');
      expect(value?.type).toBe('number');
      if (value?.type === 'number') {
        expect(value.raw).toBe('3.14159265358979323846');
      }
    });

    it('should roundtrip currency value', () => {
      const doc = Odin.parse('price = #$99.99');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getNumber('price')).toBe(99.99);
    });

    it('should roundtrip high-precision currency (crypto 18 decimals)', () => {
      // Ethereum-style 18 decimal places
      const original = 'amount = #$123.450000000000000000';
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);

      // Verify raw value is preserved exactly
      expect(output).toContain('#$123.450000000000000000');

      // Verify it parses back correctly
      const reparsed = Odin.parse(output);
      const value = reparsed.get('amount');
      expect(value?.type).toBe('currency');
      if (value?.type === 'currency') {
        expect(value.raw).toBe('123.450000000000000000');
        expect(value.decimalPlaces).toBe(18);
      }
    });

    it('should roundtrip Bitcoin satoshi precision (8 decimals)', () => {
      const original = 'btc = #$0.00000001';
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);

      expect(output).toContain('#$0.00000001');

      const reparsed = Odin.parse(output);
      const value = reparsed.get('btc');
      expect(value?.type).toBe('currency');
      if (value?.type === 'currency') {
        expect(value.raw).toBe('0.00000001');
        expect(value.decimalPlaces).toBe(8);
      }
    });

    it('should roundtrip boolean values', () => {
      const doc = Odin.parse('active = true\ndisabled = false');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getBoolean('active')).toBe(true);
      expect(reparsed.getBoolean('disabled')).toBe(false);
    });

    it('should roundtrip null value', () => {
      const doc = Odin.parse('empty = ~');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.get('empty')?.type).toBe('null');
    });

    it('should roundtrip date value', () => {
      const doc = Odin.parse('date = 2024-06-15');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect((reparsed.get('date') as any).raw).toBe('2024-06-15');
    });

    it('should roundtrip timestamp value', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00Z');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect((reparsed.get('ts') as any).raw).toBe('2024-06-15T10:30:00Z');
    });

    it('should roundtrip time value', () => {
      const doc = Odin.parse('time = T14:30:00');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect((reparsed.get('time') as any).value).toBe('T14:30:00');
    });

    it('should roundtrip duration value', () => {
      const doc = Odin.parse('dur = P1Y2M3D');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect((reparsed.get('dur') as any).value).toBe('P1Y2M3D');
    });

    it('should roundtrip reference value', () => {
      const doc = Odin.parse('name = "John"\nalias = @name');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect((reparsed.get('alias') as any).path).toBe('name');
    });
  });

  describe('String Edge Cases Roundtrip', () => {
    it('should roundtrip empty string', () => {
      const doc = Odin.parse('text = ""');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('');
    });

    it('should roundtrip string with escape sequences', () => {
      const doc = Odin.parse('text = "line1\\nline2\\ttab"');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('line1\nline2\ttab');
    });

    it('should roundtrip string with quotes', () => {
      const doc = Odin.parse('text = "He said \\"Hello\\""');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('text')).toBe('He said "Hello"');
    });

    it('should roundtrip string with backslashes', () => {
      const doc = Odin.parse('path = "C:\\\\Users\\\\test"');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('path')).toBe('C:\\Users\\test');
    });
  });

  describe('Nested Structure Roundtrip', () => {
    it('should roundtrip simple nested object', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
        email = "john@example.com"
      `);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('customer.name')).toBe('John');
      expect(reparsed.getString('customer.email')).toBe('john@example.com');
    });

    it('should roundtrip deeply nested object', () => {
      const doc = Odin.parse(`
        {policy.insured.primary.address}
        street = "123 Main St"
        city = "Austin"
        state = "TX"
      `);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('policy.insured.primary.address.street')).toBe('123 Main St');
      expect(reparsed.getString('policy.insured.primary.address.city')).toBe('Austin');
    });

    it('should roundtrip multiple sections', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
        {vendor}
        name = "Acme"
        {carrier}
        name = "ABC Insurance"
      `);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('customer.name')).toBe('John');
      expect(reparsed.getString('vendor.name')).toBe('Acme');
      expect(reparsed.getString('carrier.name')).toBe('ABC Insurance');
    });
  });

  describe('Array Roundtrip', () => {
    it('should roundtrip simple array', () => {
      const doc = Odin.parse(`
        items[0] = "first"
        items[1] = "second"
        items[2] = "third"
      `);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('items[0]')).toBe('first');
      expect(reparsed.getString('items[1]')).toBe('second');
      expect(reparsed.getString('items[2]')).toBe('third');
    });

    it('should roundtrip array of objects', () => {
      const doc = Odin.parse(`
        {items[0]}
        name = "Widget"
        qty = ##10
        {items[1]}
        name = "Gadget"
        qty = ##5
      `);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('items[0].name')).toBe('Widget');
      expect(reparsed.getInteger('items[0].qty')).toBe(10);
      expect(reparsed.getString('items[1].name')).toBe('Gadget');
      expect(reparsed.getInteger('items[1].qty')).toBe(5);
    });

    it('should roundtrip tabular data', () => {
      const doc = Odin.parse(`
        {items[] : sku, name, qty}
        "SKU-001", "Widget", ##10
        "SKU-002", "Gadget", ##5
      `);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('items[0].sku')).toBe('SKU-001');
      expect(reparsed.getString('items[0].name')).toBe('Widget');
      expect(reparsed.getInteger('items[0].qty')).toBe(10);
      expect(reparsed.getString('items[1].sku')).toBe('SKU-002');
    });
  });

  describe('Metadata Roundtrip', () => {
    it('should roundtrip metadata section', () => {
      const doc = Odin.parse(`
        {$}
        odin = "1.0.0"
        schema = "policy.odin"
        {}
        name = "document"
      `);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('$.odin')).toBe('1.0.0');
      expect(reparsed.getString('$.schema')).toBe('policy.odin');
      expect(reparsed.getString('name')).toBe('document');
    });
  });

  describe('Modifiers Roundtrip', () => {
    it('should roundtrip critical modifier', () => {
      const doc = Odin.parse('field = !"important"');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.modifiers.get('field')?.required).toBe(true);
    });

    it('should roundtrip redacted modifier', () => {
      const doc = Odin.parse('password = *"secret"');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.modifiers.get('password')?.confidential).toBe(true);
    });

    it('should roundtrip negative number', () => {
      // Note: - before string is problematic, use with number instead
      const doc = Odin.parse('count = ##-42');
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);
      expect(reparsed.getInteger('count')).toBe(-42);
    });
  });
});

describe('Complex Document Tests', () => {
  describe('Insurance Policy Document', () => {
    it('should parse and roundtrip complex policy document', () => {
      const policyDoc = `
{$}
odin = "1.0.0"
schema = "policy.schema.odin"

{}
{policy}
number = "PAP-2024-001234"
type = "personal-auto"
effective = 2024-06-15
expiration = 2025-06-15
premium = #$747.50
status = "active"

{policy.insured}
name = "John Smith"
dob = 1985-03-20
license = "TX12345678"
email = "john.smith@example.com"

{policy.insured.address}
street = "123 Main Street"
city = "Austin"
state = "TX"
zip = "78701"

{policy.vehicles[] : vin, year, make, model, premium}
"1HGBH41JXMN109186", ##2021, "Honda", "Civic", #$325.00
"5XYZU3LB0DG012345", ##2020, "Toyota", "Camry", #$422.50

{policy.coverages[] : type, limit, deductible, premium}
"liability", #$100000, #$0, #$150.00
"collision", #$50000, #$500, #$275.00
"comprehensive", #$50000, #$250, #$125.00
"uninsured", #$100000, #$0, #$197.50
`;

      const doc = Odin.parse(policyDoc);

      // Verify parsed structure
      expect(doc.getString('$.odin')).toBe('1.0.0');
      expect(doc.getString('policy.number')).toBe('PAP-2024-001234');
      expect(doc.getNumber('policy.premium')).toBe(747.5);
      expect(doc.getString('policy.insured.name')).toBe('John Smith');
      expect(doc.getString('policy.insured.address.city')).toBe('Austin');
      expect(doc.getString('policy.vehicles[0].vin')).toBe('1HGBH41JXMN109186');
      expect(doc.getInteger('policy.vehicles[0].year')).toBe(2021);
      expect(doc.getString('policy.coverages[0].type')).toBe('liability');

      // Roundtrip
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);

      expect(reparsed.getString('$.odin')).toBe('1.0.0');
      expect(reparsed.getString('policy.number')).toBe('PAP-2024-001234');
      expect(reparsed.getNumber('policy.premium')).toBe(747.5);
      expect(reparsed.getString('policy.vehicles[0].make')).toBe('Honda');
      expect(reparsed.getString('policy.coverages[1].type')).toBe('collision');
    });
  });

  describe('Mixed Tabular and Hierarchical', () => {
    it('should handle mixed structures', () => {
      const doc = Odin.parse(`
{order}
id = "ORD-12345"
date = 2024-06-15
customer = "John Smith"

{order.items[] : sku, name, qty, price}
"WIDGET-001", "Standard Widget", ##5, #$9.99
"GADGET-002", "Deluxe Gadget", ##2, #$24.99

{order.shipping}
method = "express"
cost = #$12.50
eta = 2024-06-18

{order}
total = #$112.43
tax = #$8.96
`);

      expect(doc.getString('order.id')).toBe('ORD-12345');
      expect(doc.getString('order.items[0].sku')).toBe('WIDGET-001');
      expect(doc.getInteger('order.items[0].qty')).toBe(5);
      expect(doc.getString('order.shipping.method')).toBe('express');
      expect(doc.getNumber('order.total')).toBe(112.43);
    });
  });

  describe('Large Document Performance', () => {
    it('should handle document with many rows', () => {
      const lines = ['{items[] : id, value}'];
      for (let i = 0; i < 1000; i++) {
        lines.push(`##${i}, "item-${i}"`);
      }
      const doc = Odin.parse(lines.join('\n'));

      expect(doc.getInteger('items[0].id')).toBe(0);
      expect(doc.getString('items[0].value')).toBe('item-0');
      expect(doc.getInteger('items[500].id')).toBe(500);
      expect(doc.getInteger('items[999].id')).toBe(999);
    });

    it('should handle document with many fields', () => {
      const lines: string[] = [];
      for (let i = 0; i < 500; i++) {
        lines.push(`field${i} = "value${i}"`);
      }
      const doc = Odin.parse(lines.join('\n'));

      expect(doc.getString('field0')).toBe('value0');
      expect(doc.getString('field250')).toBe('value250');
      expect(doc.getString('field499')).toBe('value499');
    });

    it('should handle deeply nested paths', () => {
      const depth = 30;
      const segments = Array.from({ length: depth }, (_, i) => `level${i}`);
      const path = segments.join('.');
      const doc = Odin.parse(`${path} = "deep"`);

      expect(doc.getString(path)).toBe('deep');
    });
  });

  describe('All Types Combined', () => {
    it('should handle all value types in one document', () => {
      const doc = Odin.parse(`
string = "text"
integer = ##42
float = #3.14159
currency = #$99.99
boolean_true = true
boolean_false = false
null_value = ~
date_value = 2024-06-15
timestamp_value = 2024-06-15T10:30:00Z
time_value = T14:30:00
duration_value = P1Y2M3D
reference_value = @string
binary_value = ^SGVsbG8=
`);

      expect(doc.getString('string')).toBe('text');
      expect(doc.getInteger('integer')).toBe(42);
      expect(doc.getNumber('float')).toBeCloseTo(3.14159, 5);
      expect(doc.getNumber('currency')).toBe(99.99);
      expect(doc.getBoolean('boolean_true')).toBe(true);
      expect(doc.getBoolean('boolean_false')).toBe(false);
      expect(doc.get('null_value')?.type).toBe('null');
      expect(doc.get('date_value')?.type).toBe('date');
      expect(doc.get('timestamp_value')?.type).toBe('timestamp');
      expect(doc.get('time_value')?.type).toBe('time');
      expect(doc.get('duration_value')?.type).toBe('duration');
      expect(doc.get('reference_value')?.type).toBe('reference');
      expect(doc.get('binary_value')?.type).toBe('binary');

      // Roundtrip
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);

      expect(reparsed.getString('string')).toBe('text');
      expect(reparsed.getInteger('integer')).toBe(42);
      expect(reparsed.get('null_value')?.type).toBe('null');
      expect(reparsed.get('binary_value')?.type).toBe('binary');
    });
  });
});

describe('Document Methods', () => {
  describe('get and has', () => {
    it('should return undefined for non-existent path', () => {
      const doc = Odin.parse('name = "John"');
      expect(doc.get('nonexistent')).toBeUndefined();
    });

    it('should report false for non-existent path', () => {
      const doc = Odin.parse('name = "John"');
      expect(doc.has('nonexistent')).toBe(false);
    });

    it('should report true for existing path', () => {
      const doc = Odin.parse('name = "John"');
      expect(doc.has('name')).toBe(true);
    });
  });

  describe('resolve', () => {
    it('should resolve direct reference', () => {
      const doc = Odin.parse(`
        original = "value"
        ref = @original
      `);
      const resolved = doc.resolve('ref');
      expect(resolved?.type).toBe('string');
      expect((resolved as any).value).toBe('value');
    });

    it('should resolve chained references', () => {
      const doc = Odin.parse(`
        a = "root"
        b = @a
        c = @b
      `);
      const resolved = doc.resolve('c');
      expect((resolved as any).value).toBe('root');
    });

    it('should throw for circular reference', () => {
      const doc = Odin.parse(`
        a = @b
        b = @a
      `);
      expect(() => doc.resolve('a')).toThrow('Circular reference');
    });

    it('should throw for unresolved reference', () => {
      const doc = Odin.parse(`
        ref = @nonexistent
      `);
      expect(() => doc.resolve('ref')).toThrow('Unresolved reference');
    });
  });

  describe('paths', () => {
    it('should return all paths', () => {
      const doc = Odin.parse(`
        a = "1"
        b = "2"
        c.d = "3"
      `);
      const paths = doc.paths();
      expect(paths).toContain('a');
      expect(paths).toContain('b');
      expect(paths).toContain('c.d');
    });

    it('should include metadata paths', () => {
      const doc = Odin.parse(`
        {$}
        version = "1.0"
        {}
        name = "test"
      `);
      const paths = doc.paths();
      expect(paths).toContain('$.version');
      expect(paths).toContain('name');
    });
  });

  describe('toJSON', () => {
    it('should convert to JSON-like object', () => {
      const doc = Odin.parse(`
        name = "John"
        age = ##30
        active = true
      `);
      const json = doc.toJSON();
      expect(json.name).toBe('John');
      expect(json.age).toBe(30);
      expect(json.active).toBe(true);
    });

    it('should handle nested structures', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
        {customer.address}
        city = "Austin"
      `);
      const json = doc.toJSON();
      expect((json.customer as any).name).toBe('John');
      expect((json.customer as any).address.city).toBe('Austin');
    });

    it('should handle arrays', () => {
      const doc = Odin.parse(`
        items[0] = "a"
        items[1] = "b"
        items[2] = "c"
      `);
      const json = doc.toJSON();
      expect(Array.isArray(json.items)).toBe(true);
      expect((json.items as string[])[0]).toBe('a');
      expect((json.items as string[])[1]).toBe('b');
      expect((json.items as string[])[2]).toBe('c');
    });
  });

  describe('with and without', () => {
    it('should create new document with added value', () => {
      const doc = Odin.parse('a = "1"');
      const newDoc = doc.with('b', { type: 'string', value: '2' });
      expect(doc.has('b')).toBe(false);
      expect(newDoc.has('b')).toBe(true);
      expect(newDoc.getString('b')).toBe('2');
    });

    it('should create new document without value', () => {
      const doc = Odin.parse('a = "1"\nb = "2"');
      const newDoc = doc.without('a');
      expect(doc.has('a')).toBe(true);
      expect(newDoc.has('a')).toBe(false);
      expect(newDoc.has('b')).toBe(true);
    });
  });
});
