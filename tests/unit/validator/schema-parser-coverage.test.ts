/**
 * Additional Schema Parser Tests for Coverage Gaps
 *
 * Tests targeting specific uncovered code paths:
 * - maxDocumentSize option (lines 1938-1943)
 * - peekAhead for dot notation in column headers (lines 1876-1879)
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Schema Parser - Coverage Gaps', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // maxDocumentSize Option
  // ─────────────────────────────────────────────────────────────────────────────

  describe('maxDocumentSize option', () => {
    it('accepts schema within size limit', () => {
      const schema = `{test}
name = !`;

      // Schema is ~20 chars, limit is 100
      const result = Odin.parseSchema(schema, { maxDocumentSize: 100 });
      expect(result.fields.get('test.name')).toBeDefined();
    });

    it('throws error when schema exceeds size limit', () => {
      const schema = `{test}
name = !`;

      // Schema is ~20 chars, limit is 10
      expect(() => {
        Odin.parseSchema(schema, { maxDocumentSize: 10 });
      }).toThrow('Maximum document size exceeded');
    });

    it('includes size info in error context', () => {
      const schema = `{test}
name = !`;

      try {
        Odin.parseSchema(schema, { maxDocumentSize: 10 });
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        // ParseError extends OdinError which has context property
        const error = e as { code?: string; context?: { size?: number; maxSize?: number } };
        expect(error.code).toBe('P011');
        expect(error.context?.maxSize).toBe(10);
        expect(error.context?.size).toBeGreaterThan(10);
      }
    });

    it('handles Uint8Array input with size limit', () => {
      const schema = `{test}
name = !`;
      const bytes = new TextEncoder().encode(schema);

      expect(() => {
        Odin.parseSchema(bytes, { maxDocumentSize: 10 });
      }).toThrow('Maximum document size exceeded');
    });

    it('allows exactly at limit', () => {
      const schema = `{}
a=`;
      // This schema should pass - limit equals length
      const result = Odin.parseSchema(schema, { maxDocumentSize: schema.length });
      expect(result.fields.get('a')).toBeDefined();
    });

    it('rejects one byte over limit', () => {
      const schema = `{}
a=`;
      // One byte under the schema length
      expect(() => {
        Odin.parseSchema(schema, { maxDocumentSize: schema.length - 1 });
      }).toThrow('Maximum document size exceeded');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Tabular Column Headers with Dot Notation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Column headers with dot notation (peekAhead)', () => {
    it('parses array header with dot notation column', () => {
      const schema = Odin.parseSchema(`{items[]: product.name}
| Blue Widget |`);

      const arr = schema.arrays.get('items');
      expect(arr).toBeDefined();
      // The column should be "product.name"
      expect(arr?.columns).toContain('product.name');
    });

    it('parses array header with multiple dot notation columns', () => {
      const schema = Odin.parseSchema(`{items[]: product.name, product.price}
| Widget | ##19.99 |`);

      const arr = schema.arrays.get('items');
      expect(arr).toBeDefined();
      expect(arr?.columns).toContain('product.name');
      expect(arr?.columns).toContain('product.price');
    });

    it('parses mixed columns - regular and dot notation', () => {
      const schema = Odin.parseSchema(`{orders[]: id, customer.name, total}
| ##1 | John | ##100 |`);

      const arr = schema.arrays.get('orders');
      expect(arr).toBeDefined();
      expect(arr?.columns).toContain('id');
      expect(arr?.columns).toContain('customer.name');
      expect(arr?.columns).toContain('total');
    });

    it('parses deeply nested object path in array items', () => {
      const schema = Odin.parseSchema(`{cart.items[]: sku}
| ABC123 |`);

      const arr = schema.arrays.get('cart.items');
      expect(arr).toBeDefined();
      expect(arr?.columns).toContain('sku');
    });

    it('parses array header with array index notation in column', () => {
      const schema = Odin.parseSchema(`{records[]: tags[0]}
| first_tag |`);

      const arr = schema.arrays.get('records');
      expect(arr).toBeDefined();
      expect(arr?.columns).toContain('tags[0]');
    });

    it('handles whitespace around columns in header', () => {
      const schema = Odin.parseSchema(`{data[]:  name ,  price , product.category }
| Widget | ##10 | Electronics |`);

      const arr = schema.arrays.get('data');
      expect(arr).toBeDefined();
      expect(arr?.columns).toContain('name');
      expect(arr?.columns).toContain('price');
      expect(arr?.columns).toContain('product.category');
    });

    it('preserves column order', () => {
      const schema = Odin.parseSchema(`{items[]: z_field, a_field, m_field}
| z | a | m |`);

      const arr = schema.arrays.get('items');
      expect(arr).toBeDefined();
      expect(arr?.columns).toEqual(['z_field', 'a_field', 'm_field']);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Additional Edge Cases for Parser Options
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Parser options edge cases', () => {
    it('works without any options', () => {
      const schema = Odin.parseSchema(`{test}
value = !`);
      expect(schema.fields.get('test.value')).toBeDefined();
    });

    it('works with empty options object', () => {
      const schema = Odin.parseSchema(
        `{test}
value = !`,
        {}
      );
      expect(schema.fields.get('test.value')).toBeDefined();
    });

    it('handles very large maxDocumentSize', () => {
      const result = Odin.parseSchema(
        `{test}
x = !`,
        { maxDocumentSize: Number.MAX_SAFE_INTEGER }
      );
      expect(result.fields.get('test.x')).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Error Paths and Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Parser error paths', () => {
    it('throws on invalid schema header syntax', () => {
      expect(() => {
        // Missing closing brace
        Odin.parseSchema(`{test
name = !`);
      }).toThrow();
    });

    it('throws on invalid type definition syntax', () => {
      expect(() => {
        // Invalid type definition
        Odin.parseSchema(`{#invalid syntax}`);
      }).toThrow();
    });

    it('handles schema ending without newline', () => {
      // Schema without trailing newline should still parse
      const schema = Odin.parseSchema(`{test}
name = !`);
      expect(schema.fields.get('test.name')).toBeDefined();
    });

    it('handles schema with only metadata', () => {
      const schema = Odin.parseSchema(`{$}
odin = "1.0.0"
schema = "1.0.0"
`);
      expect(schema.metadata.odin).toBe('1.0.0');
      expect(schema.metadata.schema).toBe('1.0.0');
    });

    it('handles empty schema', () => {
      const schema = Odin.parseSchema('');
      expect(schema.types.size).toBe(0);
      expect(schema.fields.size).toBe(0);
    });

    it('handles schema with comments only', () => {
      const schema = Odin.parseSchema(`; Just a comment
; Another comment
`);
      expect(schema.types.size).toBe(0);
    });

    it('handles consecutive newlines', () => {
      const schema = Odin.parseSchema(`{test}


name = !


`);
      expect(schema.fields.get('test.name')).toBeDefined();
    });

    it('handles field with multiple constraints', () => {
      const schema = Odin.parseSchema(`{test}
value = string :min 1 :max 100
`);
      const field = schema.fields.get('test.value');
      expect(field).toBeDefined();
      expect(field?.constraints).toBeDefined();
    });

    it('handles optional fields', () => {
      const schema = Odin.parseSchema(`{test}
optionalValue = string?
`);
      const field = schema.fields.get('test.optionalValue');
      expect(field).toBeDefined();
    });

    it('handles nested object paths', () => {
      const schema = Odin.parseSchema(`{test.nested}
deepField = !
`);
      const field = schema.fields.get('test.nested.deepField');
      expect(field).toBeDefined();
    });

    it('handles whitespace in field definitions', () => {
      const schema = Odin.parseSchema(`{test}
  name    =    !
`);
      const field = schema.fields.get('test.name');
      expect(field).toBeDefined();
    });
  });
});
