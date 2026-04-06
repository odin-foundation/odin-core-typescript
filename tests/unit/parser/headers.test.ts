/**
 * Header and path edge case tests for ODIN SDK.
 *
 * Tests for:
 * - Empty header {}
 * - Metadata header {$}
 * - Simple section {section}
 * - Nested paths {parent.child}
 * - Array headers {items[]}
 * - Relative headers {.child}
 * - Hyphenated identifiers
 * - Path assignments
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../../src/index.js';

describe('Header Parsing', () => {
  describe('Empty Header ({})', () => {
    it('should reset context to root with empty header', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
        {}
        root_field = "at root"
      `);
      expect(doc.getString('customer.name')).toBe('John');
      expect(doc.getString('root_field')).toBe('at root');
    });

    it('should allow multiple empty header resets', () => {
      const doc = Odin.parse(`
        {a}
        val = "a"
        {}
        {b}
        val = "b"
        {}
        root = "root"
      `);
      expect(doc.getString('a.val')).toBe('a');
      expect(doc.getString('b.val')).toBe('b');
      expect(doc.getString('root')).toBe('root');
    });
  });

  describe('Metadata Header ({$})', () => {
    it('should parse metadata section', () => {
      const doc = Odin.parse(`
        {$}
        odin = "1.0.0"
        schema = "policy.odin"
      `);
      expect(doc.getString('$.odin')).toBe('1.0.0');
      expect(doc.getString('$.schema')).toBe('policy.odin');
    });

    it('should allow metadata at beginning', () => {
      const doc = Odin.parse(`
        {$}
        version = "1.0"
        {}
        name = "document"
      `);
      expect(doc.getString('$.version')).toBe('1.0');
      expect(doc.getString('name')).toBe('document');
    });

    it('should allow metadata anywhere', () => {
      const doc = Odin.parse(`
        name = "test"
        {$}
        meta = "value"
        {}
        other = "data"
      `);
      expect(doc.getString('$.meta')).toBe('value');
    });
  });

  describe('Simple Section Headers', () => {
    it('should parse single-word header', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
      `);
      expect(doc.getString('customer.name')).toBe('John');
    });

    it('should parse header with underscore', () => {
      const doc = Odin.parse(`
        {customer_info}
        name = "John"
      `);
      expect(doc.getString('customer_info.name')).toBe('John');
    });

    it('should parse header with hyphen', () => {
      const doc = Odin.parse(`
        {customer-info}
        name = "John"
      `);
      expect(doc.getString('customer-info.name')).toBe('John');
    });

    it('should parse header starting with underscore', () => {
      const doc = Odin.parse(`
        {_private}
        data = "secret"
      `);
      expect(doc.getString('_private.data')).toBe('secret');
    });

    it('should parse multiple sections', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
        {vendor}
        name = "Acme"
        {carrier}
        name = "ABC Insurance"
      `);
      expect(doc.getString('customer.name')).toBe('John');
      expect(doc.getString('vendor.name')).toBe('Acme');
      expect(doc.getString('carrier.name')).toBe('ABC Insurance');
    });
  });

  describe('Nested Path Headers', () => {
    it('should parse two-level nested header', () => {
      const doc = Odin.parse(`
        {customer.address}
        street = "123 Main St"
        city = "Austin"
      `);
      expect(doc.getString('customer.address.street')).toBe('123 Main St');
      expect(doc.getString('customer.address.city')).toBe('Austin');
    });

    it('should parse three-level nested header', () => {
      const doc = Odin.parse(`
        {policy.insured.primary}
        name = "John"
      `);
      expect(doc.getString('policy.insured.primary.name')).toBe('John');
    });

    it('should parse deeply nested header', () => {
      const doc = Odin.parse(`
        {a.b.c.d.e}
        value = "deep"
      `);
      expect(doc.getString('a.b.c.d.e.value')).toBe('deep');
    });

    it('should allow changing to different nested sections', () => {
      const doc = Odin.parse(`
        {customer.billing}
        address = "billing addr"
        {customer.shipping}
        address = "shipping addr"
      `);
      expect(doc.getString('customer.billing.address')).toBe('billing addr');
      expect(doc.getString('customer.shipping.address')).toBe('shipping addr');
    });
  });

  describe('Relative Headers', () => {
    it('should parse relative header with dot prefix', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
        {.address}
        street = "123 Main St"
      `);
      expect(doc.getString('customer.name')).toBe('John');
      expect(doc.getString('customer.address.street')).toBe('123 Main St');
    });

    it('should handle nested relative headers', () => {
      const doc = Odin.parse(`
        {policy}
        number = "POL-001"
        {.insured}
        name = "John"
        {.contact}
        phone = "555-1234"
      `);
      expect(doc.getString('policy.number')).toBe('POL-001');
      expect(doc.getString('policy.insured.name')).toBe('John');
      // Per spec: relative headers resolve against last absolute header, so {.contact} is sibling of {.insured}
      expect(doc.getString('policy.contact.phone')).toBe('555-1234');
    });
  });

  describe('Array Headers', () => {
    it('should parse array header with index', () => {
      const doc = Odin.parse(`
        {items[0]}
        name = "Widget"
        qty = ##10
      `);
      expect(doc.getString('items[0].name')).toBe('Widget');
      expect(doc.getInteger('items[0].qty')).toBe(10);
    });

    it('should parse multiple array indices', () => {
      const doc = Odin.parse(`
        {items[0]}
        name = "Widget"
        {items[1]}
        name = "Gadget"
        {items[2]}
        name = "Gizmo"
      `);
      expect(doc.getString('items[0].name')).toBe('Widget');
      expect(doc.getString('items[1].name')).toBe('Gadget');
      expect(doc.getString('items[2].name')).toBe('Gizmo');
    });

    it('should parse nested array header', () => {
      const doc = Odin.parse(`
        {policy.vehicles[0]}
        vin = "ABC123"
        make = "Toyota"
      `);
      expect(doc.getString('policy.vehicles[0].vin')).toBe('ABC123');
    });

    it('should parse array of arrays', () => {
      const doc = Odin.parse(`
        matrix[0][0] = ##1
        matrix[0][1] = ##2
        matrix[1][0] = ##3
        matrix[1][1] = ##4
      `);
      expect(doc.getInteger('matrix[0][0]')).toBe(1);
      expect(doc.getInteger('matrix[0][1]')).toBe(2);
      expect(doc.getInteger('matrix[1][0]')).toBe(3);
      expect(doc.getInteger('matrix[1][1]')).toBe(4);
    });
  });

  describe('Path Assignments', () => {
    it('should parse simple path assignment', () => {
      const doc = Odin.parse('customer.name = "John"');
      expect(doc.getString('customer.name')).toBe('John');
    });

    it('should parse nested path assignment', () => {
      const doc = Odin.parse('customer.address.city = "Austin"');
      expect(doc.getString('customer.address.city')).toBe('Austin');
    });

    it('should parse array index assignment', () => {
      const doc = Odin.parse('items[0] = "first"');
      expect(doc.getString('items[0]')).toBe('first');
    });

    it('should parse complex path with array', () => {
      const doc = Odin.parse('policy.vehicles[0].vin = "ABC123"');
      expect(doc.getString('policy.vehicles[0].vin')).toBe('ABC123');
    });

    it('should parse path with hyphenated identifiers', () => {
      const doc = Odin.parse('end-type = "coverage"');
      expect(doc.getString('end-type')).toBe('coverage');
    });

    it('should parse nested path with hyphens', () => {
      const doc = Odin.parse('loss-info.accident-type = "collision"');
      expect(doc.getString('loss-info.accident-type')).toBe('collision');
    });
  });

  describe('Identifier Edge Cases', () => {
    it('should parse identifier with numbers', () => {
      const doc = Odin.parse('field1 = "value"');
      expect(doc.getString('field1')).toBe('value');
    });

    it('should parse identifier with mixed case', () => {
      const doc = Odin.parse('MyField = "value"');
      expect(doc.getString('MyField')).toBe('value');
    });

    it('should parse identifier with multiple underscores', () => {
      const doc = Odin.parse('my__field = "value"');
      expect(doc.getString('my__field')).toBe('value');
    });

    it('should parse identifier with trailing numbers', () => {
      const doc = Odin.parse('field123 = "value"');
      expect(doc.getString('field123')).toBe('value');
    });

    it('should parse identifier similar to keyword', () => {
      const doc = Odin.parse(`
        trueval = "not boolean"
        falseval = "also not boolean"
      `);
      expect(doc.getString('trueval')).toBe('not boolean');
      expect(doc.getString('falseval')).toBe('also not boolean');
    });
  });

  describe('Array Index Edge Cases', () => {
    it('should parse zero index', () => {
      const doc = Odin.parse('items[0] = "first"');
      expect(doc.getString('items[0]')).toBe('first');
    });

    it('should parse large index when contiguous', () => {
      // Array must be contiguous starting at 0
      // So we can't just have items[999] alone
      const lines = [];
      for (let i = 0; i <= 10; i++) {
        lines.push(`items[${i}] = "item${i}"`);
      }
      const doc = Odin.parse(lines.join('\n'));
      expect(doc.getString('items[10]')).toBe('item10');
    });

    it('should reject negative index', () => {
      // Negative indices are invalid - [ followed by - followed by digit
      // The tokenizer should fail or parser should reject
      expect(() => Odin.parse('items[-1] = "invalid"')).toThrow();
    });

    it('should require contiguous indices starting at 0', () => {
      expect(() =>
        Odin.parse(`
        items[1] = "skipped zero"
      `)
      ).toThrow(ParseError);
    });

    it('should reject non-contiguous indices', () => {
      expect(() =>
        Odin.parse(`
        items[0] = "first"
        items[2] = "skipped one"
      `)
      ).toThrow(ParseError);
    });
  });

  describe('Duplicate Path Detection', () => {
    it('should reject duplicate path assignment', () => {
      expect(() =>
        Odin.parse(`
        name = "John"
        name = "Jane"
      `)
      ).toThrow(ParseError);
      try {
        Odin.parse('name = "John"\nname = "Jane"');
      } catch (e) {
        expect((e as ParseError).code).toBe('P007');
      }
    });

    it('should reject duplicate nested path', () => {
      expect(() =>
        Odin.parse(`
        customer.name = "John"
        customer.name = "Jane"
      `)
      ).toThrow(ParseError);
    });

    it('should reject duplicate via header', () => {
      expect(() =>
        Odin.parse(`
        {customer}
        name = "John"
        name = "Jane"
      `)
      ).toThrow(ParseError);
    });

    it('should reject duplicate across header and direct', () => {
      expect(() =>
        Odin.parse(`
        customer.name = "John"
        {customer}
        name = "Jane"
      `)
      ).toThrow(ParseError);
    });
  });

  describe('Meta Headers ({$identifier})', () => {
    it('should parse {$target} meta header', () => {
      const doc = Odin.parse(`
        {$target}
        format = "json"
        indent = ##2
      `);
      expect(doc.getString('$.target.format')).toBe('json');
      expect(doc.getInteger('$.target.indent')).toBe(2);
    });

    it('should parse {$source} meta header', () => {
      const doc = Odin.parse(`
        {$source}
        format = "odin"
        schema = "policy.odin"
      `);
      expect(doc.getString('$.source.format')).toBe('odin');
      expect(doc.getString('$.source.schema')).toBe('policy.odin');
    });

    it('should parse nested meta header {$target.options}', () => {
      const doc = Odin.parse(`
        {$target.options}
        nulls = "omit"
        emptyArrays = "include"
      `);
      expect(doc.getString('$.target.options.nulls')).toBe('omit');
      expect(doc.getString('$.target.options.emptyArrays')).toBe('include');
    });

    it('should parse meta header with array {$const}', () => {
      const doc = Odin.parse(`
        {$const}
        defaultCurrency = "USD"
        maxRetries = ##3
      `);
      expect(doc.getString('$.const.defaultCurrency')).toBe('USD');
      expect(doc.getInteger('$.const.maxRetries')).toBe(3);
    });

    it('should parse dotted meta header like {$table.codes}', () => {
      const doc = Odin.parse(`
        {$table.codes}
        A = "Active"
        I = "Inactive"
        P = "Pending"
      `);
      expect(doc.getString('$.table.codes.A')).toBe('Active');
      expect(doc.getString('$.table.codes.I')).toBe('Inactive');
      expect(doc.getString('$.table.codes.P')).toBe('Pending');
    });

    it('should allow multiple different meta headers', () => {
      const doc = Odin.parse(`
        {$}
        odin = "1.0"
        transform = "1.0"

        {$source}
        format = "csv"

        {$target}
        format = "json"

        {$const}
        version = "2.0"
      `);
      expect(doc.getString('$.odin')).toBe('1.0');
      expect(doc.getString('$.source.format')).toBe('csv');
      expect(doc.getString('$.target.format')).toBe('json');
      expect(doc.getString('$.const.version')).toBe('2.0');
    });

    it('should allow mixing meta headers with regular content', () => {
      const doc = Odin.parse(`
        {$target}
        format = "json"

        {policy}
        number = "POL-001"

        {$const}
        maxItems = ##100
      `);
      expect(doc.getString('$.target.format')).toBe('json');
      expect(doc.getString('policy.number')).toBe('POL-001');
      expect(doc.getInteger('$.const.maxItems')).toBe(100);
    });
  });

  describe('Extension Paths', () => {
    it('should parse extension path prefix', () => {
      const doc = Odin.parse('&com.acme.custom = "value"');
      expect(doc.getString('&com.acme.custom')).toBe('value');
    });

    it('should parse extension in header', () => {
      const doc = Odin.parse(`
        {&com.acme}
        field = "value"
      `);
      expect(doc.getString('&com.acme.field')).toBe('value');
    });

    it('should parse extension nested in regular path', () => {
      const doc = Odin.parse('policy.&com.acme.extension = "data"');
      expect(doc.getString('policy.&com.acme.extension')).toBe('data');
    });
  });

  describe('Complex Path Combinations', () => {
    it('should handle header with assignment inside', () => {
      const doc = Odin.parse(`
        {policy}
        number = "POL-001"
        effective = 2024-06-15
        {.insured}
        name = "John Smith"
        {.address}
        street = "123 Main"
        city = "Austin"
      `);
      expect(doc.getString('policy.number')).toBe('POL-001');
      expect(doc.getString('policy.insured.name')).toBe('John Smith');
      // Per spec: {.address} resolves against last absolute {policy}, sibling of {.insured}
      expect(doc.getString('policy.address.street')).toBe('123 Main');
    });

    it('should handle mix of direct and header assignments', () => {
      const doc = Odin.parse(`
        root = "value"
        {section}
        nested = "inner"
        section.direct = "also works"
      `);
      expect(doc.getString('root')).toBe('value');
      expect(doc.getString('section.nested')).toBe('inner');
      // This direct assignment should be relative to section header context
      expect(doc.getString('section.section.direct')).toBe('also works');
    });
  });
});
