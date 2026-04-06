/**
 * TDD Tests for ODIN Schema Parser
 * These tests define the EXPECTED behavior according to the ODIN Schema 1.0 Specification.
 * The parser should be fixed to pass these tests.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Schema Parser - Types', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // String Type (Default)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('String Type', () => {
    it('parses field with no type as string', () => {
      const schema = Odin.parseSchema(`{}
name =`);

      const field = schema.fields.get('name');
      expect(field).toBeDefined();
      expect(field?.type.kind).toBe('string');
    });

    it('parses required string field', () => {
      const schema = Odin.parseSchema(`{}
name = !`);

      const field = schema.fields.get('name');
      expect(field?.required).toBe(true);
      expect(field?.type.kind).toBe('string');
    });

    it('parses nullable string field', () => {
      const schema = Odin.parseSchema(`{}
nickname = ~`);

      const field = schema.fields.get('nickname');
      expect(field?.nullable).toBe(true);
      expect(field?.type.kind).toBe('string');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Boolean Type
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Boolean Type', () => {
    it('parses boolean field', () => {
      const schema = Odin.parseSchema(`{}
active = ?`);

      const field = schema.fields.get('active');
      expect(field?.type.kind).toBe('boolean');
    });

    it('parses required boolean field', () => {
      const schema = Odin.parseSchema(`{}
enabled = !?`);

      const field = schema.fields.get('enabled');
      expect(field?.required).toBe(true);
      expect(field?.type.kind).toBe('boolean');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Numeric Types
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Numeric Types', () => {
    it('parses generic number field', () => {
      const schema = Odin.parseSchema(`{}
amount = #`);

      const field = schema.fields.get('amount');
      expect(field?.type.kind).toBe('number');
    });

    it('parses integer field', () => {
      const schema = Odin.parseSchema(`{}
count = ##`);

      const field = schema.fields.get('count');
      expect(field?.type.kind).toBe('integer');
    });

    it('parses required integer field', () => {
      const schema = Odin.parseSchema(`{}
quantity = !##`);

      const field = schema.fields.get('quantity');
      expect(field?.required).toBe(true);
      expect(field?.type.kind).toBe('integer');
    });

    it('parses currency field', () => {
      const schema = Odin.parseSchema(`{}
price = #$`);

      const field = schema.fields.get('price');
      expect(field?.type.kind).toBe('currency');
    });

    it('parses required currency field', () => {
      const schema = Odin.parseSchema(`{}
total = !#$`);

      const field = schema.fields.get('total');
      expect(field?.required).toBe(true);
      expect(field?.type.kind).toBe('currency');
    });

    it('parses decimal field with precision', () => {
      const schema = Odin.parseSchema(`{}
rate = #.4`);

      const field = schema.fields.get('rate');
      expect(field?.type.kind).toBe('decimal');
      if (field?.type.kind === 'decimal') {
        expect(field.type.places).toBe(4);
      }
    });

    it('parses currency field with custom precision', () => {
      const schema = Odin.parseSchema(`{}
btc_amount = #$.8`);

      const field = schema.fields.get('btc_amount');
      expect(field?.type.kind).toBe('currency');
      if (field?.type.kind === 'currency') {
        expect(field.type.places).toBe(8);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Temporal Types
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Temporal Types', () => {
    it('parses date field', () => {
      const schema = Odin.parseSchema(`{}
effective = date`);

      const field = schema.fields.get('effective');
      expect(field?.type.kind).toBe('date');
    });

    it('parses required date field', () => {
      const schema = Odin.parseSchema(`{}
expires = !date`);

      const field = schema.fields.get('expires');
      expect(field?.required).toBe(true);
      expect(field?.type.kind).toBe('date');
    });

    it('parses timestamp field', () => {
      const schema = Odin.parseSchema(`{}
created = timestamp`);

      const field = schema.fields.get('created');
      expect(field?.type.kind).toBe('timestamp');
    });

    it('parses time field', () => {
      const schema = Odin.parseSchema(`{}
start_time = time`);

      const field = schema.fields.get('start_time');
      expect(field?.type.kind).toBe('time');
    });

    it('parses duration field', () => {
      const schema = Odin.parseSchema(`{}
duration = duration`);

      const field = schema.fields.get('duration');
      expect(field?.type.kind).toBe('duration');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Reference Type
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Reference Type', () => {
    it('parses reference field', () => {
      const schema = Odin.parseSchema(`{}
parent = @`);

      const field = schema.fields.get('parent');
      expect(field?.type.kind).toBe('reference');
    });

    it('parses required reference field', () => {
      const schema = Odin.parseSchema(`{}
manager = !@`);

      const field = schema.fields.get('manager');
      expect(field?.required).toBe(true);
      expect(field?.type.kind).toBe('reference');
    });

    it('parses reference with target path', () => {
      const schema = Odin.parseSchema(`{}
billing = @addresses`);

      const field = schema.fields.get('billing');
      expect(field?.type.kind).toBe('reference');
      if (field?.type.kind === 'reference') {
        expect(field.type.targetPath).toBe('addresses');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Binary Type
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Binary Type', () => {
    it('parses binary field', () => {
      const schema = Odin.parseSchema(`{}
data = ^`);

      const field = schema.fields.get('data');
      expect(field?.type.kind).toBe('binary');
    });

    it('parses required binary field', () => {
      const schema = Odin.parseSchema(`{}
signature = !^`);

      const field = schema.fields.get('signature');
      expect(field?.required).toBe(true);
      expect(field?.type.kind).toBe('binary');
    });

    it('parses binary with algorithm', () => {
      const schema = Odin.parseSchema(`{}
hash = ^sha256`);

      const field = schema.fields.get('hash');
      expect(field?.type.kind).toBe('binary');
      if (field?.type.kind === 'binary') {
        expect(field.type.algorithm).toBe('sha256');
      }
    });
  });
});

describe('Schema Parser - Constraints', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // String Length Constraints
  // ─────────────────────────────────────────────────────────────────────────────

  describe('String Length Constraints', () => {
    it('parses exact length constraint', () => {
      const schema = Odin.parseSchema(`{}
code = :(3)`);

      const field = schema.fields.get('code');
      expect(field?.constraints.length).toBeGreaterThan(0);
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
      if (bounds?.kind === 'bounds') {
        expect(bounds.min).toBe(3);
        expect(bounds.max).toBe(3);
      }
    });

    it('parses minimum length constraint', () => {
      const schema = Odin.parseSchema(`{}
code = :(3..)`);

      const field = schema.fields.get('code');
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
      if (bounds?.kind === 'bounds') {
        expect(bounds.min).toBe(3);
        expect(bounds.max).toBeUndefined();
      }
    });

    it('parses maximum length constraint', () => {
      const schema = Odin.parseSchema(`{}
code = :(..10)`);

      const field = schema.fields.get('code');
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
      if (bounds?.kind === 'bounds') {
        expect(bounds.min).toBeUndefined();
        expect(bounds.max).toBe(10);
      }
    });

    it('parses min-max length constraint', () => {
      const schema = Odin.parseSchema(`{}
code = :(3..10)`);

      const field = schema.fields.get('code');
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
      if (bounds?.kind === 'bounds') {
        expect(bounds.min).toBe(3);
        expect(bounds.max).toBe(10);
      }
    });

    it('parses required field with length constraint', () => {
      const schema = Odin.parseSchema(`{}
code = !:(3..10)`);

      const field = schema.fields.get('code');
      expect(field?.required).toBe(true);
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Numeric Bounds Constraints
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Numeric Bounds Constraints', () => {
    it('parses integer with min-max bounds', () => {
      const schema = Odin.parseSchema(`{}
age = ##:(0..150)`);

      const field = schema.fields.get('age');
      expect(field?.type.kind).toBe('integer');
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
      if (bounds?.kind === 'bounds') {
        expect(bounds.min).toBe(0);
        expect(bounds.max).toBe(150);
      }
    });

    it('parses integer with minimum only', () => {
      const schema = Odin.parseSchema(`{}
quantity = ##:(1..)`);

      const field = schema.fields.get('quantity');
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
      if (bounds?.kind === 'bounds') {
        expect(bounds.min).toBe(1);
        expect(bounds.max).toBeUndefined();
      }
    });

    it('parses integer with maximum only', () => {
      const schema = Odin.parseSchema(`{}
score = ##:(..100)`);

      const field = schema.fields.get('score');
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
      if (bounds?.kind === 'bounds') {
        expect(bounds.min).toBeUndefined();
        expect(bounds.max).toBe(100);
      }
    });

    it('parses decimal with bounds', () => {
      const schema = Odin.parseSchema(`{}
discount = #:(0..1)`);

      const field = schema.fields.get('discount');
      expect(field?.type.kind).toBe('number');
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
      if (bounds?.kind === 'bounds') {
        expect(bounds.min).toBe(0);
        expect(bounds.max).toBe(1);
      }
    });

    it('parses currency with bounds', () => {
      const schema = Odin.parseSchema(`{}
price = #$:(0..999999.99)`);

      const field = schema.fields.get('price');
      expect(field?.type.kind).toBe('currency');
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
      if (bounds?.kind === 'bounds') {
        expect(bounds.min).toBe(0);
        expect(bounds.max).toBe(999999.99);
      }
    });

    it('parses required integer with bounds', () => {
      const schema = Odin.parseSchema(`{}
year = !##:(1900..2100)`);

      const field = schema.fields.get('year');
      expect(field?.required).toBe(true);
      expect(field?.type.kind).toBe('integer');
      const bounds = field?.constraints.find((c) => c.kind === 'bounds');
      expect(bounds).toBeDefined();
      if (bounds?.kind === 'bounds') {
        expect(bounds.min).toBe(1900);
        expect(bounds.max).toBe(2100);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Pattern Constraints
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Pattern Constraints', () => {
    it('parses pattern with slash delimiter', () => {
      const schema = Odin.parseSchema(`{}
email = :/^[^@]+@[^@]+\\.[^@]+$/`);

      const field = schema.fields.get('email');
      const pattern = field?.constraints.find((c) => c.kind === 'pattern');
      expect(pattern).toBeDefined();
      if (pattern?.kind === 'pattern') {
        expect(pattern.pattern).toBe('^[^@]+@[^@]+\\.[^@]+$');
      }
    });

    it('parses pattern with pipe delimiter', () => {
      const schema = Odin.parseSchema(`{}
url = :|^https?://[^\\s]+|`);

      const field = schema.fields.get('url');
      const pattern = field?.constraints.find((c) => c.kind === 'pattern');
      expect(pattern).toBeDefined();
      if (pattern?.kind === 'pattern') {
        expect(pattern.pattern).toBe('^https?://[^\\s]+');
      }
    });

    it('parses required field with pattern', () => {
      const schema = Odin.parseSchema(`{}
vin = !:/^[A-HJ-NPR-Z0-9]{17}$/`);

      const field = schema.fields.get('vin');
      expect(field?.required).toBe(true);
      const pattern = field?.constraints.find((c) => c.kind === 'pattern');
      expect(pattern).toBeDefined();
    });

    it('parses redacted field with pattern', () => {
      const schema = Odin.parseSchema(`{}
ssn = *:/^\\d{3}-\\d{2}-\\d{4}$/`);

      const field = schema.fields.get('ssn');
      expect(field?.redacted).toBe(true);
      const pattern = field?.constraints.find((c) => c.kind === 'pattern');
      expect(pattern).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Enum Constraints
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Enum Constraints', () => {
    it('parses enum type', () => {
      const schema = Odin.parseSchema(`{}
status = (pending, active, closed)`);

      const field = schema.fields.get('status');
      expect(field?.type.kind).toBe('enum');
      if (field?.type.kind === 'enum') {
        expect(field.type.values).toEqual(['pending', 'active', 'closed']);
      }
    });

    it('parses required enum', () => {
      const schema = Odin.parseSchema(`{}
priority = !(low, medium, high)`);

      const field = schema.fields.get('priority');
      expect(field?.required).toBe(true);
      expect(field?.type.kind).toBe('enum');
      if (field?.type.kind === 'enum') {
        expect(field.type.values).toEqual(['low', 'medium', 'high']);
      }
    });

    it('parses enum with many values', () => {
      const schema = Odin.parseSchema(`{}
body_type = (sedan, coupe, suv, truck, van, wagon, convertible, hatchback, other)`);

      const field = schema.fields.get('body_type');
      expect(field?.type.kind).toBe('enum');
      if (field?.type.kind === 'enum') {
        expect(field.type.values).toHaveLength(9);
        expect(field.type.values).toContain('sedan');
        expect(field.type.values).toContain('other');
      }
    });
  });
});

describe('Schema Parser - Arrays', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Array Definition
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Array Definition', () => {
    it('parses basic array definition', () => {
      const schema = Odin.parseSchema(`{items[]}
sku = !
name = !`);

      const arr = schema.arrays.get('items');
      expect(arr).toBeDefined();
      expect(arr?.path).toBe('items');
      expect(arr?.itemFields.has('sku')).toBe(true);
      expect(arr?.itemFields.has('name')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Array Bounds
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Array Bounds', () => {
    it('parses array with min-max bounds (same line)', () => {
      const schema = Odin.parseSchema(`{items[]} :(1..100)
sku = !`);

      const arr = schema.arrays.get('items');
      expect(arr?.minItems).toBe(1);
      expect(arr?.maxItems).toBe(100);
    });

    it('parses array with min-max bounds (next line)', () => {
      const schema = Odin.parseSchema(`{items[]}
:(1..100)
sku = !`);

      const arr = schema.arrays.get('items');
      expect(arr?.minItems).toBe(1);
      expect(arr?.maxItems).toBe(100);
    });

    it('parses array with minimum only', () => {
      const schema = Odin.parseSchema(`{required_fields[]}
:(1..)
name = !`);

      const arr = schema.arrays.get('required_fields');
      expect(arr?.minItems).toBe(1);
      expect(arr?.maxItems).toBeUndefined();
    });

    it('parses array with maximum only', () => {
      const schema = Odin.parseSchema(`{tags[]}
:(..10)
value = !`);

      const arr = schema.arrays.get('tags');
      expect(arr?.minItems).toBeUndefined();
      expect(arr?.maxItems).toBe(10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Array Unique Constraint
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Array Unique Constraint', () => {
    it('parses array with unique constraint', () => {
      const schema = Odin.parseSchema(`{emails[]}
:unique
value = !`);

      const arr = schema.arrays.get('emails');
      expect(arr?.unique).toBe(true);
    });

    it('parses array with bounds and unique', () => {
      const schema = Odin.parseSchema(`{codes[]}
:(1..10):unique
value = !`);

      const arr = schema.arrays.get('codes');
      expect(arr?.minItems).toBe(1);
      expect(arr?.maxItems).toBe(10);
      expect(arr?.unique).toBe(true);
    });
  });
});

describe('Schema Parser - Union Types', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Basic Unions (trailing | adds string)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Basic Unions', () => {
    it('parses number or string union', () => {
      const schema = Odin.parseSchema(`{}
value = #|""`);

      const field = schema.fields.get('value');
      expect(field?.type.kind).toBe('union');
      if (field?.type.kind === 'union') {
        expect(field.type.types).toHaveLength(2);
        expect(field.type.types[0]?.kind).toBe('number');
        expect(field.type.types[1]?.kind).toBe('string');
      }
    });

    it('parses integer or string union', () => {
      const schema = Odin.parseSchema(`{}
id = ##|""`);

      const field = schema.fields.get('id');
      expect(field?.type.kind).toBe('union');
      if (field?.type.kind === 'union') {
        expect(field.type.types).toHaveLength(2);
        expect(field.type.types[0]?.kind).toBe('integer');
        expect(field.type.types[1]?.kind).toBe('string');
      }
    });

    it('parses boolean or string union', () => {
      const schema = Odin.parseSchema(`{}
flag = ?|""`);

      const field = schema.fields.get('flag');
      expect(field?.type.kind).toBe('union');
      if (field?.type.kind === 'union') {
        expect(field.type.types).toHaveLength(2);
        expect(field.type.types[0]?.kind).toBe('boolean');
        expect(field.type.types[1]?.kind).toBe('string');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Multi-Type Unions
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Multi-Type Unions', () => {
    it('parses number or boolean union', () => {
      const schema = Odin.parseSchema(`{}
flexible = #|?`);

      const field = schema.fields.get('flexible');
      expect(field?.type.kind).toBe('union');
      if (field?.type.kind === 'union') {
        expect(field.type.types).toHaveLength(2);
        expect(field.type.types[0]?.kind).toBe('number');
        expect(field.type.types[1]?.kind).toBe('boolean');
      }
    });

    it('parses number or boolean or string union', () => {
      const schema = Odin.parseSchema(`{}
choice = #|?|""`);

      const field = schema.fields.get('choice');
      expect(field?.type.kind).toBe('union');
      if (field?.type.kind === 'union') {
        expect(field.type.types).toHaveLength(3);
        expect(field.type.types[0]?.kind).toBe('number');
        expect(field.type.types[1]?.kind).toBe('boolean');
        expect(field.type.types[2]?.kind).toBe('string');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Nullable Unions
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Nullable Unions', () => {
    it('parses number or null union', () => {
      const schema = Odin.parseSchema(`{}
num_or_null = #|~`);

      const field = schema.fields.get('num_or_null');
      expect(field?.type.kind).toBe('union');
      if (field?.type.kind === 'union') {
        expect(field.type.types).toHaveLength(2);
        expect(field.type.types[0]?.kind).toBe('number');
        expect(field.type.types[1]?.kind).toBe('null');
      }
    });

    it('parses boolean or null union (tri-state)', () => {
      const schema = Odin.parseSchema(`{}
tri_state = ?|~`);

      const field = schema.fields.get('tri_state');
      expect(field?.type.kind).toBe('union');
      if (field?.type.kind === 'union') {
        expect(field.type.types).toHaveLength(2);
        expect(field.type.types[0]?.kind).toBe('boolean');
        expect(field.type.types[1]?.kind).toBe('null');
      }
    });
  });
});

describe('Schema Parser - Modifiers', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // All Modifier Combinations
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Modifier Combinations', () => {
    it('parses deprecated field', () => {
      const schema = Odin.parseSchema(`{}
legacy_id = -`);

      const field = schema.fields.get('legacy_id');
      expect(field?.deprecated).toBe(true);
    });

    it('parses redacted field', () => {
      const schema = Odin.parseSchema(`{}
password = *`);

      const field = schema.fields.get('password');
      expect(field?.redacted).toBe(true);
    });

    it('parses required + redacted field', () => {
      const schema = Odin.parseSchema(`{}
password = !*`);

      const field = schema.fields.get('password');
      expect(field?.required).toBe(true);
      expect(field?.redacted).toBe(true);
    });

    it('parses nullable + redacted field', () => {
      const schema = Odin.parseSchema(`{}
tax_id = ~*`);

      const field = schema.fields.get('tax_id');
      expect(field?.nullable).toBe(true);
      expect(field?.redacted).toBe(true);
    });

    it('parses deprecated + required field', () => {
      const schema = Odin.parseSchema(`{}
old_code = -!`);

      const field = schema.fields.get('old_code');
      expect(field?.deprecated).toBe(true);
      expect(field?.required).toBe(true);
    });

    it('parses required + redacted + pattern', () => {
      const schema = Odin.parseSchema(`{}
ssn = !*:/^\\d{3}-\\d{2}-\\d{4}$/`);

      const field = schema.fields.get('ssn');
      expect(field?.required).toBe(true);
      expect(field?.redacted).toBe(true);
      const pattern = field?.constraints.find((c) => c.kind === 'pattern');
      expect(pattern).toBeDefined();
    });
  });
});

describe('Schema Parser - Headers and Nesting', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Nested Objects
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Nested Objects', () => {
    it('parses nested object headers', () => {
      const schema = Odin.parseSchema(`{customer}
name = !

{customer.billing}
line1 = !
city = !`);

      expect(schema.fields.has('customer.name')).toBe(true);
      expect(schema.fields.has('customer.billing.line1')).toBe(true);
      expect(schema.fields.has('customer.billing.city')).toBe(true);
    });

    it('parses deeply nested objects', () => {
      const schema = Odin.parseSchema(`{order}
id = !

{order.customer}
name = !

{order.customer.address}
city = !`);

      expect(schema.fields.has('order.id')).toBe(true);
      expect(schema.fields.has('order.customer.name')).toBe(true);
      expect(schema.fields.has('order.customer.address.city')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Type Definitions
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Type Definitions', () => {
    it('parses reusable type definition', () => {
      const schema = Odin.parseSchema(`{@address}
line1 = !:(1..100)
city = !:(1..50)
state = !:(2)
zip = !:/^\\d{5}$/`);

      expect(schema.types.has('address')).toBe(true);
      const addrType = schema.types.get('address');
      expect(addrType?.fields.has('line1')).toBe(true);
      expect(addrType?.fields.has('city')).toBe(true);
    });

    it('parses type reference in field', () => {
      const schema = Odin.parseSchema(`{@address}
line1 = !

{customer}
billing = @address`);

      const field = schema.fields.get('customer.billing');
      // At parse time, @address is treated as a reference with targetPath
      // Semantic resolution to typeRef (when {@ address} exists) would be done at validation time
      expect(field?.type.kind).toBe('reference');
      if (field?.type.kind === 'reference') {
        expect(field.type.targetPath).toBe('address');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Metadata', () => {
    it('parses schema metadata', () => {
      const schema = Odin.parseSchema(`{$}
odin = "1.0.0"
schema = "1.0.0"
id = "com.example.order"
version = "2.1.0"`);

      expect(schema.metadata.odin).toBe('1.0.0');
      expect(schema.metadata.schema).toBe('1.0.0');
      expect(schema.metadata.id).toBe('com.example.order');
      expect(schema.metadata.version).toBe('2.1.0');
    });
  });
});

describe('Schema Parser - Conditional Fields', () => {
  it('parses conditional required field', () => {
    const schema = Odin.parseSchema(`{payment}
method = !(card, bank)
card_number = !:if method = card`);

    const field = schema.fields.get('payment.card_number');
    expect(field?.required).toBe(true);
    expect(field?.conditionals.length).toBeGreaterThan(0);
    expect(field?.conditionals[0]?.field).toBe('method');
    expect(field?.conditionals[0]?.value).toBe('card');
  });

  it('parses conditional optional field', () => {
    const schema = Odin.parseSchema(`{payment}
method = !(card, bank)
card_cvv = *:(3..4):if method = card`);

    const field = schema.fields.get('payment.card_cvv');
    expect(field?.required).toBe(false);
    expect(field?.redacted).toBe(true);
    expect(field?.conditionals.length).toBeGreaterThan(0);
  });

  it('parses multiple conditions on same field (OR)', () => {
    const schema = Odin.parseSchema(`{vehicle}
type = !(auto, motorcycle, boat)
vin = !:if type = auto
vin = !:if type = motorcycle`);

    const field = schema.fields.get('vehicle.vin');
    expect(field?.conditionals.length).toBe(2);
  });
});

describe('Schema Parser - Cardinality Constraints', () => {
  it('parses one_of constraint', () => {
    const schema = Odin.parseSchema(`{contact}
email =
phone =
:one_of email, phone`);

    const constraints = schema.constraints.get('contact');
    expect(constraints).toBeDefined();
    const oneOf = constraints?.find((c) => c.kind === 'cardinality' && c.type === 'one_of');
    expect(oneOf).toBeDefined();
    if (oneOf?.kind === 'cardinality') {
      expect(oneOf.fields).toContain('email');
      expect(oneOf.fields).toContain('phone');
    }
  });

  it('parses exactly_one constraint', () => {
    const schema = Odin.parseSchema(`{payment}
credit_card =
bank_account =
:exactly_one credit_card, bank_account`);

    const constraints = schema.constraints.get('payment');
    const exactlyOne = constraints?.find(
      (c) => c.kind === 'cardinality' && c.type === 'exactly_one'
    );
    expect(exactlyOne).toBeDefined();
  });

  it('parses at_most_one constraint', () => {
    const schema = Odin.parseSchema(`{override}
system_default = ?
manual_value = #
:at_most_one system_default, manual_value`);

    const constraints = schema.constraints.get('override');
    const atMostOne = constraints?.find(
      (c) => c.kind === 'cardinality' && c.type === 'at_most_one'
    );
    expect(atMostOne).toBeDefined();
  });

  it('parses of constraint with bounds', () => {
    const schema = Odin.parseSchema(`{verification}
photo_id = ^
utility_bill = ^
bank_statement = ^
:of (2..3) photo_id, utility_bill, bank_statement`);

    const constraints = schema.constraints.get('verification');
    const ofConstraint = constraints?.find((c) => c.kind === 'cardinality' && c.type === 'of');
    expect(ofConstraint).toBeDefined();
    if (ofConstraint?.kind === 'cardinality') {
      expect(ofConstraint.min).toBe(2);
      expect(ofConstraint.max).toBe(3);
    }
  });
});

describe('Schema Parser - Invariants', () => {
  it('parses simple equality invariant', () => {
    const schema = Odin.parseSchema(`{order}
subtotal = !#$
tax = !#$
total = !#$
:invariant total = subtotal + tax`);

    const constraints = schema.constraints.get('order');
    const invariant = constraints?.find((c) => c.kind === 'invariant');
    expect(invariant).toBeDefined();
    if (invariant?.kind === 'invariant') {
      expect(invariant.expression).toBe('total = subtotal + tax');
    }
  });

  it('parses comparison invariant', () => {
    const schema = Odin.parseSchema(`{date_range}
start = !date
end = !date
:invariant end >= start`);

    const constraints = schema.constraints.get('date_range');
    const invariant = constraints?.find((c) => c.kind === 'invariant');
    expect(invariant).toBeDefined();
    if (invariant?.kind === 'invariant') {
      expect(invariant.expression).toBe('end >= start');
    }
  });

  it('parses multiple invariants', () => {
    const schema = Odin.parseSchema(`{discount}
total = !#$
percentage = #
:invariant total >= 0
:invariant percentage == 0 || percentage <= 100`);

    const constraints = schema.constraints.get('discount');
    const invariants = constraints?.filter((c) => c.kind === 'invariant');
    expect(invariants?.length).toBe(2);
  });
});
