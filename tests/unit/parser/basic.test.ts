/**
 * Basic unit tests for ODIN SDK.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Odin', () => {
  describe('parse', () => {
    it('should parse a simple assignment', () => {
      const doc = Odin.parse('name = "John Smith"');
      expect(doc.getString('name')).toBe('John Smith');
    });

    it('should parse multiple assignments', () => {
      const doc = Odin.parse(`
        first = "John"
        last = "Smith"
        age = ##30
      `);
      expect(doc.getString('first')).toBe('John');
      expect(doc.getString('last')).toBe('Smith');
      expect(doc.getInteger('age')).toBe(30);
    });

    it('should parse with headers', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John Smith"
        email = "john@example.com"
      `);
      expect(doc.getString('customer.name')).toBe('John Smith');
      expect(doc.getString('customer.email')).toBe('john@example.com');
    });

    it('should parse typed values', () => {
      const doc = Odin.parse(`
        active = true
        count = ##42
        price = #$99.99
        rate = #3.14
        empty = ~
      `);
      expect(doc.getBoolean('active')).toBe(true);
      expect(doc.getInteger('count')).toBe(42);
      expect(doc.getNumber('price')).toBe(99.99);
      expect(doc.getNumber('rate')).toBe(3.14);
      expect(doc.get('empty')?.type).toBe('null');
    });

    it('should parse references', () => {
      const doc = Odin.parse(`
        name = "John"
        primary = @name
      `);
      const resolved = doc.resolve('primary');
      expect(resolved?.type).toBe('string');
      expect((resolved as any).value).toBe('John');
    });

    it('should parse dates and timestamps', () => {
      const doc = Odin.parse(`
        effective = 2024-06-15
        created = 2024-06-15T10:30:00Z
      `);
      const effective = doc.get('effective');
      expect(effective?.type).toBe('date');

      const created = doc.get('created');
      expect(created?.type).toBe('timestamp');
    });

    it('should reject bare strings', () => {
      expect(() => Odin.parse('name = John Smith')).toThrow();
    });
  });

  describe('builder', () => {
    it('should build a document', () => {
      const doc = Odin.builder()
        .set('name', 'John')
        .set('age', { type: 'integer', value: 30 })
        .set('active', { type: 'boolean', value: true })
        .build();

      expect(doc.getString('name')).toBe('John');
      expect(doc.getInteger('age')).toBe(30);
      expect(doc.getBoolean('active')).toBe(true);
    });

    it('should build with metadata', () => {
      const doc = Odin.builder().metadata('odin', '1.0.0').set('name', 'Test').build();

      expect(doc.getString('$.odin')).toBe('1.0.0');
    });
  });

  describe('stringify', () => {
    it('should round-trip a document', () => {
      const original = `name = "John"
age = ##30
active = true
`;
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc, { sortPaths: true });

      expect(output).toContain('name = "John"');
      expect(output).toContain('age = ##30');
      expect(output).toContain('active = ?true');
    });

    it('should output arrays in tabular format by default', () => {
      const doc = Odin.parse(`
        {items[] : sku, description, qty}
        "ABC-001", "Widget", ##10
        "ABC-002", "Gadget", ##5
      `);

      const output = Odin.stringify(doc);

      // Should use tabular format (column order may vary based on internal iteration)
      expect(output).toMatch(/\{items\[\] : \w+(, \w+)*\}/);
      // Verify it's in tabular format (CSV rows without assignment syntax)
      expect(output).not.toContain('items[0].sku =');
      // Parse the output to verify the data is correct
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('items[0].sku')).toBe('ABC-001');
      expect(reparsed.getString('items[0].description')).toBe('Widget');
      expect(reparsed.getInteger('items[0].qty')).toBe(10);
    });

    it('should disable tabular output when useTabular is false', () => {
      const doc = Odin.parse(`
        {items[] : sku, description, qty}
        "ABC-001", "Widget", ##10
        "ABC-002", "Gadget", ##5
      `);

      const output = Odin.stringify(doc, { useTabular: false });

      // Should NOT use tabular format - individual assignments
      expect(output).not.toContain('{items[] :');
      // With headers enabled, array items get their own headers like {items[0]}
      // and paths are relative: sku = "ABC-001" instead of items[0].sku = "ABC-001"
      expect(output).toContain('{items[0]}');
      expect(output).toContain('sku = "ABC-001"');
      expect(output).toContain('description = "Widget"');
      expect(output).toContain('qty = ##10');
      expect(output).toContain('{items[1]}');
      expect(output).toContain('sku = "ABC-002"');
    });

    it('should round-trip tabular data', () => {
      const original = `{items[] : sku, description, qty}
"ABC-001", "Widget", ##10
"ABC-002", "Gadget", ##5
`;
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);

      // Parse the output and verify values
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('items[0].sku')).toBe('ABC-001');
      expect(reparsed.getString('items[0].description')).toBe('Widget');
      expect(reparsed.getInteger('items[0].qty')).toBe(10);
      expect(reparsed.getString('items[1].sku')).toBe('ABC-002');
      expect(reparsed.getString('items[1].description')).toBe('Gadget');
      expect(reparsed.getInteger('items[1].qty')).toBe(5);
    });
  });

  describe('diff and patch', () => {
    it('should diff two documents', () => {
      const a = Odin.parse('name = "John"\nage = ##30');
      const b = Odin.parse('name = "Jane"\nage = ##30\ncity = "Austin"');

      const diff = Odin.diff(a, b);

      expect(diff.modifications.length).toBe(1);
      expect(diff.modifications[0]?.path).toBe('name');
      expect(diff.additions.length).toBe(1);
      expect(diff.additions[0]?.path).toBe('city');
    });

    it('should patch a document', () => {
      const a = Odin.parse('name = "John"');
      const b = Odin.parse('name = "Jane"');

      const diff = Odin.diff(a, b);
      const patched = Odin.patch(a, diff);

      expect(patched.getString('name')).toBe('Jane');
    });
  });

  describe('path utility', () => {
    it('should build simple paths', () => {
      expect(Odin.path('name')).toBe('name');
      expect(Odin.path('customer', 'name')).toBe('customer.name');
    });

    it('should build paths with array indices', () => {
      expect(Odin.path('vehicles', 0, 'vin')).toBe('vehicles[0].vin');
      expect(Odin.path('items', 2)).toBe('items[2]');
    });
  });

  describe('validate', () => {
    it('should detect unresolved references', () => {
      const doc = Odin.parse(`
        name = "John"
        ref = @nonexistent
      `);

      // Create a minimal schema
      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]?.code).toBe('V013');
      expect(result.errors[0]?.message).toContain('Unresolved reference');
    });

    it('should detect circular references', () => {
      const doc = Odin.parse(`
        a = @b
        b = @c
        c = @a
      `);

      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      // Should have at least one circular reference error
      const circularErrors = result.errors.filter((e) => e.code === 'V012');
      expect(circularErrors.length).toBeGreaterThan(0);
    });

    it('should pass validation for valid references', () => {
      const doc = Odin.parse(`
        name = "John"
        alias = @name
      `);

      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map(),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should validate required fields', () => {
      const doc = Odin.parse(`
        name = "John"
      `);

      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'name',
            {
              path: 'name',
              type: { kind: 'string' },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
          [
            'age',
            {
              path: 'age',
              type: { kind: 'integer' },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]?.code).toBe('V001');
      expect(result.errors[0]?.path).toBe('age');
    });

    it('should validate type mismatches', () => {
      const doc = Odin.parse(`
        name = ##42
      `);

      const schema = {
        metadata: {},
        types: new Map(),
        fields: new Map([
          [
            'name',
            {
              path: 'name',
              type: { kind: 'string' },
              required: true,
              nullable: false,
              confidential: false,
              deprecated: false,
              constraints: [],
              conditionals: [],
            },
          ],
        ]),
        arrays: new Map(),
        constraints: new Map(),
      };

      const result = Odin.validate(doc, schema as any);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.code).toBe('V002');
    });
  });
});
