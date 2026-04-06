/**
 * Edge case and unhappy path tests for ODIN Validator.
 * Tests error conditions, circular references, type mismatches, and constraint violations.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Validator Edge Cases', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Reference Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Reference Validation', () => {
    it('detects unresolved references', () => {
      const doc = Odin.parse('ref = @nonexistent');
      const schema = Odin.parseSchema(`{}
ref = @`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V013')).toBe(true);
    });

    it('detects circular references', () => {
      const doc = Odin.parse(`
a = @b
b = @c
c = @a
      `);
      const schema = Odin.parseSchema(`{}
a = @
b = @
c = @`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V012')).toBe(true);
    });

    it('detects self-referencing circular reference', () => {
      const doc = Odin.parse(`
a = @b
b = @b
      `);
      const schema = Odin.parseSchema(`{}
a = @
b = @`);

      const result = Odin.validate(doc, schema);
      expect(result.errors.some((e) => e.code === 'V012')).toBe(true);
    });

    it('valid reference passes validation', () => {
      const doc = Odin.parse(`
target = "value"
ref = @target
      `);
      const schema = Odin.parseSchema(`{}
target =
ref = @`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Required Field Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Required Field Validation', () => {
    it('fails when required field is missing', () => {
      const doc = Odin.parse('optional = "present"');
      const schema = Odin.parseSchema(`{}
required_field = !
optional =`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V001')).toBe(true);
    });

    it('passes when required field is present', () => {
      const doc = Odin.parse('required_field = "present"');
      const schema = Odin.parseSchema(`{}
required_field = !`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('passes when optional field is missing', () => {
      const doc = Odin.parse('present = "here"');
      const schema = Odin.parseSchema(`{}
present =
missing =`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Nullable Field Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Nullable Field Validation', () => {
    it('fails when non-nullable field has null value', () => {
      const doc = Odin.parse('field = ~');
      const schema = Odin.parseSchema(`{}
field = !`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V002')).toBe(true);
    });

    it('passes when nullable field has null value', () => {
      const doc = Odin.parse('field = ~');
      const schema = Odin.parseSchema(`{}
field = ~`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Type Mismatch Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Type Mismatch Validation', () => {
    it('fails on boolean expected, string provided', () => {
      const doc = Odin.parse('field = "true"');
      const schema = Odin.parseSchema(`{}
field = ?`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });

    it('fails on integer expected, decimal provided', () => {
      const doc = Odin.parse('field = #3.14');
      const schema = Odin.parseSchema(`{}
field = ##`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });

    it('fails on currency expected, integer provided', () => {
      const doc = Odin.parse('field = ##100');
      const schema = Odin.parseSchema(`{}
field = #$`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });

    it('fails on reference expected, string provided', () => {
      const doc = Odin.parse('field = "not a reference"');
      const schema = Odin.parseSchema(`{}
field = @`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });

    it('fails on binary expected, string provided', () => {
      const doc = Odin.parse('field = "not binary"');
      const schema = Odin.parseSchema(`{}
field = ^`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });

    it('passes with correct types', () => {
      const doc = Odin.parse(`
str_field = "hello"
bool_field = ?true
int_field = ##42
num_field = #3.14
      `);
      const schema = Odin.parseSchema(`{}
str_field =
bool_field = ?
int_field = ##
num_field = #`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Bounds Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Bounds Validation', () => {
    it('fails when number below minimum', () => {
      const doc = Odin.parse('count = ##5');
      const schema = Odin.parseSchema(`{}
count = ##:(10..100)`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
    });

    it('fails when number above maximum', () => {
      const doc = Odin.parse('count = ##150');
      const schema = Odin.parseSchema(`{}
count = ##:(10..100)`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
    });

    it('passes when value exactly at minimum', () => {
      const doc = Odin.parse('count = ##10');
      const schema = Odin.parseSchema(`{}
count = ##:(10..100)`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('passes when value exactly at maximum', () => {
      const doc = Odin.parse('count = ##100');
      const schema = Odin.parseSchema(`{}
count = ##:(10..100)`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('passes when value within bounds', () => {
      const doc = Odin.parse('count = ##50');
      const schema = Odin.parseSchema(`{}
count = ##:(10..100)`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // String Length Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('String Length Validation', () => {
    it('fails when string length below minimum', () => {
      const doc = Odin.parse('name = "ab"');
      const schema = Odin.parseSchema(`{}
name = :(5..100)`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
    });

    it('fails when string length above maximum', () => {
      const doc = Odin.parse('name = "this is a very long string"');
      const schema = Odin.parseSchema(`{}
name = :(1..10)`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
    });

    it('passes when string length within bounds', () => {
      const doc = Odin.parse('name = "hello"');
      const schema = Odin.parseSchema(`{}
name = :(1..10)`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Pattern Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Pattern Validation', () => {
    it('fails when string does not match pattern', () => {
      const doc = Odin.parse('code = "abc"');
      const schema = Odin.parseSchema(`{}
code = :/^[0-9]+$/`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V004')).toBe(true);
    });

    it('passes when string matches pattern', () => {
      const doc = Odin.parse('code = "12345"');
      const schema = Odin.parseSchema(`{}
code = :/^[0-9]+$/`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ReDoS Protection Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('ReDoS Protection', () => {
    it('rejects nested quantifier pattern (a+)+', () => {
      const doc = Odin.parse('field = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"');
      const schema = Odin.parseSchema(`{}
field = :/(a+)+$/`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V014')).toBe(true);
    });

    it('rejects nested quantifier pattern (a*)*', () => {
      const doc = Odin.parse('field = "test"');
      const schema = Odin.parseSchema(`{}
field = :/(a*)*$/`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V014')).toBe(true);
    });

    it('rejects overlapping alternation with quantifier (a|a)+', () => {
      const doc = Odin.parse('field = "aaaaaa"');
      const schema = Odin.parseSchema(`{}
field = :/(a|a)+$/`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V014')).toBe(true);
    });

    it('rejects pattern exceeding max length (1MB)', () => {
      const doc = Odin.parse('field = "test"');
      const longPattern = 'a'.repeat(1_048_577);
      const schema = Odin.parseSchema(`{}
field = :/${longPattern}/`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V014')).toBe(true);
    });

    it('allows safe patterns', () => {
      const doc = Odin.parse('email = "test@example.com"');
      const schema = Odin.parseSchema(`{}
email = :/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/`);

      const result = Odin.validate(doc, schema);

      // Pattern is safe, validation depends on match
      expect(result.errors.every((e) => e.code !== 'V014')).toBe(true);
    });

    it('handles invalid regex pattern gracefully', () => {
      const doc = Odin.parse('field = "test"');
      const schema = Odin.parseSchema(`{}
field = :/[invalid(/`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V015')).toBe(true);
    });

    it('rejects string exceeding max pattern string length (V016)', () => {
      // Create a string longer than MAX_PATTERN_STRING_LENGTH (10000 chars)
      const longString = 'a'.repeat(10001);
      const doc = Odin.parse(`field = "${longString}"`);
      const schema = Odin.parseSchema(`{}
field = :/^a+$/`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V016')).toBe(true);
    });

    it('allows string at max pattern string length', () => {
      // Create a string at exactly MAX_PATTERN_STRING_LENGTH (10000 chars)
      const maxString = 'a'.repeat(10000);
      const doc = Odin.parse(`field = "${maxString}"`);
      const schema = Odin.parseSchema(`{}
field = :/^a+$/`);

      const result = Odin.validate(doc, schema);

      // Should not trigger V016 - string is within limit
      expect(result.errors.every((e) => e.code !== 'V016')).toBe(true);
      // Pattern should match
      expect(result.valid).toBe(true);
    });

    it('allows normal strings with pattern validation', () => {
      const doc = Odin.parse('field = "hello world"');
      const schema = Odin.parseSchema(`{}
field = :/^hello/`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Enum Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Enum Validation', () => {
    it('fails when value not in enum', () => {
      const doc = Odin.parse('status = "unknown"');
      const schema = Odin.parseSchema(`{}
status = (active, inactive, pending)`);

      const result = Odin.validate(doc, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V005')).toBe(true);
    });

    it('passes when value in enum', () => {
      const doc = Odin.parse('status = "active"');
      const schema = Odin.parseSchema(`{}
status = (active, inactive, pending)`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('enum is case-sensitive', () => {
      const doc = Odin.parse('status = "Active"');
      const schema = Odin.parseSchema(`{}
status = (active, inactive)`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Validation Options
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Validation Options', () => {
    it('failFast stops at first error', () => {
      const doc = Odin.parse(`
field1 = ##500
field2 = ##500
      `);
      const schema = Odin.parseSchema(`{}
field1 = ##:(1..100)
field2 = ##:(1..100)`);

      const result = Odin.validate(doc, schema, { failFast: true });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
    });

    it('without failFast collects all errors', () => {
      const doc = Odin.parse(`
field1 = ##500
field2 = ##500
      `);
      const schema = Odin.parseSchema(`{}
field1 = ##:(1..100)
field2 = ##:(1..100)`);

      const result = Odin.validate(doc, schema, { failFast: false });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('strict mode detects unknown fields', () => {
      const doc = Odin.parse(`
known = "value"
unknown = "extra"
      `);
      const schema = Odin.parseSchema(`{}
known =`);

      const result = Odin.validate(doc, schema, { strict: true });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V011')).toBe(true);
    });

    it('non-strict mode allows unknown fields', () => {
      const doc = Odin.parse(`
known = "value"
unknown = "extra"
      `);
      const schema = Odin.parseSchema(`{}
known =`);

      const result = Odin.validate(doc, schema, { strict: false });

      expect(result.valid).toBe(true);
    });

    it('includeWarnings false suppresses warnings', () => {
      const doc = Odin.parse('old_field = "value"');
      const schema = Odin.parseSchema(`{}
old_field = -`);

      const result = Odin.validate(doc, schema, { includeWarnings: false });

      expect(result.warnings).toHaveLength(0);
    });

    it('includeWarnings true includes deprecation warnings', () => {
      const doc = Odin.parse('old_field = "value"');
      const schema = Odin.parseSchema(`{}
old_field = -`);

      const result = Odin.validate(doc, schema, { includeWarnings: true });

      expect(result.warnings.some((w) => w.code === 'W001')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Union Type Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Union Type Validation', () => {
    it('passes when value matches one union type (string)', () => {
      const doc = Odin.parse('field = "string value"');
      const schema = Odin.parseSchema(`{}
field = ##|""`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('passes when value matches other union type (integer)', () => {
      const doc = Odin.parse('field = ##42');
      const schema = Odin.parseSchema(`{}
field = ##|""`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('fails when value matches no union types', () => {
      const doc = Odin.parse('field = ?true');
      const schema = Odin.parseSchema(`{}
field = ##|""`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Array Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Array Validation', () => {
    it('validates array item types', () => {
      const doc = Odin.parse(`
items[0].value = "valid"
items[1].value = "also valid"
      `);
      const schema = Odin.parseSchema(`{items[]}
value =`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('fails when array length below minimum', () => {
      const doc = Odin.parse(`
items[0].name = "only one"
      `);
      // Schema parser now correctly extracts minItems/maxItems from array bounds syntax
      const schema = Odin.parseSchema(`{items[]}
:(3..10)
name =`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V006')).toBe(true);
    });

    it('fails when array length above maximum', () => {
      const doc = Odin.parse(`
items[0].name = "a"
items[1].name = "b"
items[2].name = "c"
items[3].name = "d"
      `);
      // Schema parser now correctly extracts minItems/maxItems from array bounds syntax
      const schema = Odin.parseSchema(`{items[]}
:(1..2)
name =`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V006')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Nested Structure Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Nested Structure Validation', () => {
    it('validates deeply nested structure', () => {
      const doc = Odin.parse(`
{policy}
number = "POL-001"

{policy.holder}
name = "John Doe"
age = ##30
      `);
      const schema = Odin.parseSchema(`{policy}
number = !

{policy.holder}
name = !
age = !##`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('collects errors from nested structure', () => {
      const doc = Odin.parse(`
{policy}
number = "X"

{policy.holder}
name = ""
age = ##150
      `);
      const schema = Odin.parseSchema(`{policy}
number = !:(5..20)

{policy.holder}
name = !:(1..100)
age = !##:(18..120)`);

      const result = Odin.validate(doc, schema, { failFast: false });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Cardinality Constraint Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Cardinality Constraints', () => {
    it('fails one_of when no fields present', () => {
      const doc = Odin.parse(`
{contact}
other = "value"
      `);
      const schema = Odin.parseSchema(`{contact}
email =
phone =
other =
:one_of email, phone`);

      const result = Odin.validate(doc, schema);
      // one_of requires at least one of email or phone
      expect(result.valid).toBe(false);
    });

    it('passes one_of when one field present', () => {
      const doc = Odin.parse(`
{contact}
email = "test@example.com"
      `);
      const schema = Odin.parseSchema(`{contact}
email =
phone =
:one_of email, phone`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('fails exactly_one when both fields present', () => {
      const doc = Odin.parse(`
{payment}
credit_card = "4111111111111111"
bank_account = "123456789"
      `);
      const schema = Odin.parseSchema(`{payment}
credit_card =
bank_account =
:exactly_one credit_card, bank_account`);

      const result = Odin.validate(doc, schema);
      // exactly_one requires exactly one, not both
      expect(result.valid).toBe(false);
    });

    it('passes exactly_one when one field present', () => {
      const doc = Odin.parse(`
{payment}
credit_card = "4111111111111111"
      `);
      const schema = Odin.parseSchema(`{payment}
credit_card =
bank_account =
:exactly_one credit_card, bank_account`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('passes at_most_one when no fields present', () => {
      const doc = Odin.parse(`
{settings}
other = "value"
      `);
      const schema = Odin.parseSchema(`{settings}
override =
default_value =
other =
:at_most_one override, default_value`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Type Reference Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Type Reference Validation', () => {
    it('validates fields against referenced type', () => {
      const doc = Odin.parse(`
{order}
id = "ORD-001"

{billing}
line1 = "123 Main St"
city = "Springfield"
state = "IL"
zip = "62701"
      `);
      const schema = Odin.parseSchema(`{@address}
line1 = !
city = !
state = !
zip = !

{order}
id = !

{billing}
= @address`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('fails when required field from type reference missing', () => {
      const doc = Odin.parse(`
{order}
id = "ORD-001"

{billing}
line1 = "123 Main St"
city = "Springfield"
      `);
      const schema = Odin.parseSchema(`{@address}
line1 = !
city = !
state = !
zip = !

{order}
id = !

{billing}
= @address`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Conditional Field Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Conditional Field Validation', () => {
    it('requires conditional field when condition met', () => {
      const doc = Odin.parse(`
{payment}
method = "card"
      `);
      const schema = Odin.parseSchema(`{payment}
method = !
card_number = !:if method = card`);

      const result = Odin.validate(doc, schema);
      // card_number is required when method = card, but it's missing
      expect(result.valid).toBe(false);
    });

    it('passes when conditional field present and condition met', () => {
      const doc = Odin.parse(`
{payment}
method = "card"
card_number = "4111111111111111"
      `);
      const schema = Odin.parseSchema(`{payment}
method = !
card_number = !:if method = card`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('does not require conditional field when condition not met', () => {
      const doc = Odin.parse(`
{payment}
method = "cash"
      `);
      const schema = Odin.parseSchema(`{payment}
method = !
card_number = !:if method = card`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Date/Time Type Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Date/Time Type Validation', () => {
    it('passes with valid date', () => {
      const doc = Odin.parse('effective = 2024-06-15');
      const schema = Odin.parseSchema(`{}
effective = date`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('fails when date expected but string provided', () => {
      const doc = Odin.parse('effective = "2024-06-15"');
      const schema = Odin.parseSchema(`{}
effective = date`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });

    it('passes with valid timestamp', () => {
      const doc = Odin.parse('created = 2024-06-15T10:30:00Z');
      const schema = Odin.parseSchema(`{}
created = timestamp`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('fails when timestamp expected but date provided', () => {
      const doc = Odin.parse('created = 2024-06-15');
      const schema = Odin.parseSchema(`{}
created = timestamp`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Decimal Precision Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Decimal Precision Validation', () => {
    it('passes when decimal has correct precision', () => {
      const doc = Odin.parse('rate = #3.1415');
      const schema = Odin.parseSchema(`{}
rate = #.4`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('validates currency decimal places', () => {
      const doc = Odin.parse('price = #$99.99');
      const schema = Odin.parseSchema(`{}
price = #$`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Binary Field Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Binary Field Validation', () => {
    it('passes with valid binary data', () => {
      const doc = Odin.parse('data = ^SGVsbG8gV29ybGQ=');
      const schema = Odin.parseSchema(`{}
data = ^`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('validates binary with algorithm constraint', () => {
      const doc = Odin.parse('hash = ^sha256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
      const schema = Odin.parseSchema(`{}
hash = ^sha256`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('fails binary with wrong algorithm', () => {
      const doc = Odin.parse('hash = ^md5:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
      const schema = Odin.parseSchema(`{}
hash = ^sha256`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Invariant Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Invariant Validation', () => {
    it('passes when simple comparison invariant holds', () => {
      const doc = Odin.parse(`
{discount}
percentage = #25
      `);
      const schema = Odin.parseSchema(`{discount}
percentage = !#
:invariant percentage <= 100`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(true);
    });

    it('fails when simple comparison invariant violated', () => {
      const doc = Odin.parse(`
{discount}
percentage = #150
      `);
      const schema = Odin.parseSchema(`{discount}
percentage = !#
:invariant percentage <= 100`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'V008')).toBe(true);
    });
  });
});
