/**
 * Tests for conditional operator support in ODIN Schema Parser.
 * Tests parsing and validation of: =, !=, >, <, >=, <=
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../src/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Happy Path Tests - Schema Parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('Conditional Operators - Parsing', () => {
  describe('Equality operator (=)', () => {
    it('parses equality conditional with string value', () => {
      const schema = Odin.parseSchema(`{payment}
method = !(card, bank, cash)
card_number = !:if method = card`);

      const field = schema.fields.get('payment.card_number');
      expect(field?.conditionals).toHaveLength(1);
      expect(field?.conditionals[0]?.operator).toBe('=');
      expect(field?.conditionals[0]?.field).toBe('method');
      expect(field?.conditionals[0]?.value).toBe('card');
    });

    it('parses equality conditional with boolean true', () => {
      const schema = Odin.parseSchema(`{feature}
enabled = ?
config = :if enabled = true`);

      const field = schema.fields.get('feature.config');
      expect(field?.conditionals).toHaveLength(1);
      expect(field?.conditionals[0]?.operator).toBe('=');
      expect(field?.conditionals[0]?.value).toBe(true);
    });

    it('parses equality conditional with boolean false', () => {
      const schema = Odin.parseSchema(`{feature}
disabled = ?
fallback = :if disabled = false`);

      const field = schema.fields.get('feature.fallback');
      expect(field?.conditionals).toHaveLength(1);
      expect(field?.conditionals[0]?.operator).toBe('=');
      expect(field?.conditionals[0]?.value).toBe(false);
    });
  });

  describe('Inequality operator (!=)', () => {
    it('parses inequality conditional with string value', () => {
      const schema = Odin.parseSchema(`{project}
project_type = !(new_construction, renovation, addition)
existing_value = #$:if project_type != new_construction`);

      const field = schema.fields.get('project.existing_value');
      expect(field?.conditionals).toHaveLength(1);
      expect(field?.conditionals[0]?.operator).toBe('!=');
      expect(field?.conditionals[0]?.field).toBe('project_type');
      expect(field?.conditionals[0]?.value).toBe('new_construction');
    });

    it('parses inequality with required modifier', () => {
      const schema = Odin.parseSchema(`{owner}
entity_type = !(individual, corporation, llc)
business_name = !:if entity_type != individual`);

      const field = schema.fields.get('owner.business_name');
      expect(field?.required).toBe(true);
      expect(field?.conditionals[0]?.operator).toBe('!=');
      expect(field?.conditionals[0]?.value).toBe('individual');
    });
  });

  describe('Greater than operator (>)', () => {
    it('parses greater than conditional with numeric value', () => {
      const schema = Odin.parseSchema(`{building}
square_feet = ##
addition_year = ##:if square_feet > 0`);

      const field = schema.fields.get('building.addition_year');
      expect(field?.conditionals).toHaveLength(1);
      expect(field?.conditionals[0]?.operator).toBe('>');
      expect(field?.conditionals[0]?.field).toBe('square_feet');
      expect(field?.conditionals[0]?.value).toBe(0);
    });

    it('parses greater than with positive threshold', () => {
      const schema = Odin.parseSchema(`{order}
item_count = ##
bulk_discount = #:if item_count > 10`);

      const field = schema.fields.get('order.bulk_discount');
      expect(field?.conditionals[0]?.operator).toBe('>');
      expect(field?.conditionals[0]?.value).toBe(10);
    });
  });

  describe('Less than operator (<)', () => {
    it('parses less than conditional with numeric value', () => {
      const schema = Odin.parseSchema(`{applicant}
age = ##
guardian_name = :if age < 18`);

      const field = schema.fields.get('applicant.guardian_name');
      expect(field?.conditionals).toHaveLength(1);
      expect(field?.conditionals[0]?.operator).toBe('<');
      expect(field?.conditionals[0]?.field).toBe('age');
      expect(field?.conditionals[0]?.value).toBe(18);
    });
  });

  describe('Greater than or equal operator (>=)', () => {
    it('parses greater than or equal conditional', () => {
      const schema = Odin.parseSchema(`{employee}
years_of_service = ##
retirement_eligible = ?:if years_of_service >= 20`);

      const field = schema.fields.get('employee.retirement_eligible');
      expect(field?.conditionals).toHaveLength(1);
      expect(field?.conditionals[0]?.operator).toBe('>=');
      expect(field?.conditionals[0]?.field).toBe('years_of_service');
      expect(field?.conditionals[0]?.value).toBe(20);
    });
  });

  describe('Less than or equal operator (<=)', () => {
    it('parses less than or equal conditional', () => {
      const schema = Odin.parseSchema(`{product}
inventory = ##
reorder_flag = ?:if inventory <= 5`);

      const field = schema.fields.get('product.reorder_flag');
      expect(field?.conditionals).toHaveLength(1);
      expect(field?.conditionals[0]?.operator).toBe('<=');
      expect(field?.conditionals[0]?.field).toBe('inventory');
      expect(field?.conditionals[0]?.value).toBe(5);
    });
  });

  describe('Shorthand syntax (:if field)', () => {
    it('parses shorthand as equality to true', () => {
      const schema = Odin.parseSchema(`{policy}
has_endorsement = ?
endorsement_details = :if has_endorsement`);

      const field = schema.fields.get('policy.endorsement_details');
      expect(field?.conditionals).toHaveLength(1);
      expect(field?.conditionals[0]?.operator).toBe('=');
      expect(field?.conditionals[0]?.field).toBe('has_endorsement');
      expect(field?.conditionals[0]?.value).toBe(true);
    });

    it('parses shorthand with required modifier', () => {
      const schema = Odin.parseSchema(`{form}
requires_signature = ?
signature = !:if requires_signature`);

      const field = schema.fields.get('form.signature');
      expect(field?.required).toBe(true);
      expect(field?.conditionals[0]?.operator).toBe('=');
      expect(field?.conditionals[0]?.value).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases - Schema Parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('Conditional Operators - Edge Cases', () => {
  it('parses multiple conditionals on same field', () => {
    const schema = Odin.parseSchema(`{vehicle}
type = !(auto, motorcycle, boat)
vin = !:if type = auto
vin = !:if type = motorcycle`);

    const field = schema.fields.get('vehicle.vin');
    expect(field?.conditionals).toHaveLength(2);
    expect(field?.conditionals[0]?.value).toBe('auto');
    expect(field?.conditionals[1]?.value).toBe('motorcycle');
  });

  it('parses conditional with simple field reference', () => {
    const schema = Odin.parseSchema(`{pricing}
customer_type = !(retail, wholesale)
wholesale_discount = #:if customer_type = wholesale`);

    const field = schema.fields.get('pricing.wholesale_discount');
    expect(field?.conditionals[0]?.field).toBe('customer_type');
    expect(field?.conditionals[0]?.value).toBe('wholesale');
  });

  it('parses conditional with zero value', () => {
    const schema = Odin.parseSchema(`{account}
balance = #$
overdraft_fee = #$:if balance < 0`);

    const field = schema.fields.get('account.overdraft_fee');
    expect(field?.conditionals[0]?.operator).toBe('<');
    expect(field?.conditionals[0]?.value).toBe(0);
  });

  it('parses conditional with negative threshold', () => {
    const schema = Odin.parseSchema(`{sensor}
temperature = #
freeze_warning = ?:if temperature < -10`);

    const field = schema.fields.get('sensor.freeze_warning');
    expect(field?.conditionals[0]?.operator).toBe('<');
    expect(field?.conditionals[0]?.value).toBe(-10);
  });

  it('parses conditional combined with bounds constraint', () => {
    const schema = Odin.parseSchema(`{employee}
role = !(staff, manager, executive)
bonus_percentage = ##:if role != staff`);

    const field = schema.fields.get('employee.bonus_percentage');
    expect(field?.type.kind).toBe('integer');
    expect(field?.conditionals[0]?.operator).toBe('!=');
    expect(field?.conditionals[0]?.value).toBe('staff');
  });

  it('parses conditional with pattern constraint separately', () => {
    const schema = Odin.parseSchema(`{contact}
country = !(US, UK, CA)
postal_code = :if country = CA`);

    const field = schema.fields.get('contact.postal_code');
    expect(field?.conditionals[0]?.operator).toBe('=');
    expect(field?.conditionals[0]?.value).toBe('CA');
  });

  it('preserves whitespace handling around operators', () => {
    const schema = Odin.parseSchema(`{test}
value = ##
a = :if value = 10
b = :if value= 10
c = :if value =10`);

    const fieldA = schema.fields.get('test.a');
    const fieldB = schema.fields.get('test.b');
    const fieldC = schema.fields.get('test.c');

    expect(fieldA?.conditionals[0]?.value).toBe(10);
    expect(fieldB?.conditionals[0]?.value).toBe(10);
    expect(fieldC?.conditionals[0]?.value).toBe(10);
  });

  it('handles type prefix after conditional', () => {
    const schema = Odin.parseSchema(`{order}
express = ?
delivery_time = ##:if express = true`);

    const field = schema.fields.get('order.delivery_time');
    expect(field?.type.kind).toBe('integer');
    expect(field?.conditionals[0]?.operator).toBe('=');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Conditional Operators - Validation', () => {
  describe('Equality validation', () => {
    it('validates required field when condition is met', () => {
      const schema = Odin.parseSchema(`{payment}
method = !(card, bank)
card_number = !:if method = card`);

      const doc = Odin.parse(`{payment}
method = "card"`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'payment.card_number')).toBe(true);
    });

    it('does not require field when condition is not met', () => {
      const schema = Odin.parseSchema(`{payment}
method = !(card, bank)
card_number = !:if method = card`);

      const doc = Odin.parse(`{payment}
method = "bank"`);

      const result = Odin.validate(doc, schema);
      expect(result.errors.filter((e) => e.path === 'payment.card_number')).toHaveLength(0);
    });
  });

  describe('Inequality validation', () => {
    it('validates required field when inequality condition is met', () => {
      const schema = Odin.parseSchema(`{owner}
type = !(individual, corporation)
business_name = !:if type != individual`);

      const doc = Odin.parse(`{owner}
type = "corporation"`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'owner.business_name')).toBe(true);
    });

    it('does not require field when inequality condition is not met', () => {
      const schema = Odin.parseSchema(`{owner}
type = !(individual, corporation)
business_name = !:if type != individual`);

      const doc = Odin.parse(`{owner}
type = "individual"`);

      const result = Odin.validate(doc, schema);
      expect(result.errors.filter((e) => e.path === 'owner.business_name')).toHaveLength(0);
    });
  });

  describe('Greater than validation', () => {
    it('validates when value is greater than threshold', () => {
      const schema = Odin.parseSchema(`{building}
square_feet = ##
addition_details = !:if square_feet > 0`);

      const doc = Odin.parse(`{building}
square_feet = ##100`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'building.addition_details')).toBe(true);
    });

    it('does not require when value equals threshold', () => {
      const schema = Odin.parseSchema(`{building}
square_feet = ##
addition_details = !:if square_feet > 0`);

      const doc = Odin.parse(`{building}
square_feet = ##0`);

      const result = Odin.validate(doc, schema);
      expect(result.errors.filter((e) => e.path === 'building.addition_details')).toHaveLength(0);
    });

    it('does not require when value is less than threshold', () => {
      const schema = Odin.parseSchema(`{order}
quantity = ##
bulk_note = !:if quantity > 100`);

      const doc = Odin.parse(`{order}
quantity = ##50`);

      const result = Odin.validate(doc, schema);
      expect(result.errors.filter((e) => e.path === 'order.bulk_note')).toHaveLength(0);
    });
  });

  describe('Less than validation', () => {
    it('validates when value is less than threshold', () => {
      const schema = Odin.parseSchema(`{person}
age = ##
guardian = !:if age < 18`);

      const doc = Odin.parse(`{person}
age = ##15`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'person.guardian')).toBe(true);
    });

    it('does not require when value equals threshold', () => {
      const schema = Odin.parseSchema(`{person}
age = ##
guardian = !:if age < 18`);

      const doc = Odin.parse(`{person}
age = ##18`);

      const result = Odin.validate(doc, schema);
      expect(result.errors.filter((e) => e.path === 'person.guardian')).toHaveLength(0);
    });
  });

  describe('Greater than or equal validation', () => {
    it('validates when value equals threshold', () => {
      const schema = Odin.parseSchema(`{employee}
years = ##
pension_info = !:if years >= 20`);

      const doc = Odin.parse(`{employee}
years = ##20`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'employee.pension_info')).toBe(true);
    });

    it('validates when value is greater than threshold', () => {
      const schema = Odin.parseSchema(`{employee}
years = ##
pension_info = !:if years >= 20`);

      const doc = Odin.parse(`{employee}
years = ##25`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });

    it('does not require when value is less than threshold', () => {
      const schema = Odin.parseSchema(`{employee}
years = ##
pension_info = !:if years >= 20`);

      const doc = Odin.parse(`{employee}
years = ##19`);

      const result = Odin.validate(doc, schema);
      expect(result.errors.filter((e) => e.path === 'employee.pension_info')).toHaveLength(0);
    });
  });

  describe('Less than or equal validation', () => {
    it('validates when value equals threshold', () => {
      const schema = Odin.parseSchema(`{inventory}
stock = ##
reorder_note = !:if stock <= 5`);

      const doc = Odin.parse(`{inventory}
stock = ##5`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'inventory.reorder_note')).toBe(true);
    });

    it('validates when value is less than threshold', () => {
      const schema = Odin.parseSchema(`{inventory}
stock = ##
reorder_note = !:if stock <= 5`);

      const doc = Odin.parse(`{inventory}
stock = ##3`);

      const result = Odin.validate(doc, schema);
      expect(result.valid).toBe(false);
    });

    it('does not require when value is greater than threshold', () => {
      const schema = Odin.parseSchema(`{inventory}
stock = ##
reorder_note = !:if stock <= 5`);

      const doc = Odin.parse(`{inventory}
stock = ##10`);

      const result = Odin.validate(doc, schema);
      expect(result.errors.filter((e) => e.path === 'inventory.reorder_note')).toHaveLength(0);
    });
  });

  describe('Type mismatch in comparison', () => {
    it('numeric operators return false for string values', () => {
      const schema = Odin.parseSchema(`{test}
name =
extra = !:if name > 0`);

      const doc = Odin.parse(`{test}
name = "hello"`);

      // Should not require extra because string > number comparison returns false
      const result = Odin.validate(doc, schema);
      expect(result.errors.filter((e) => e.path === 'test.extra')).toHaveLength(0);
    });

    it('numeric operators return false for boolean values', () => {
      const schema = Odin.parseSchema(`{test}
flag = ?
extra = !:if flag > 0`);

      const doc = Odin.parse(`{test}
flag = true`);

      // Should not require extra because boolean > number comparison returns false
      const result = Odin.validate(doc, schema);
      expect(result.errors.filter((e) => e.path === 'test.extra')).toHaveLength(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Cases - Invalid Syntax
// ─────────────────────────────────────────────────────────────────────────────

describe('Conditional Operators - Error Cases', () => {
  it('handles missing condition field gracefully', () => {
    // When condition field doesn't exist in document, condition evaluates to false
    const schema = Odin.parseSchema(`{test}
dependent = !:if missing_field = value`);

    const doc = Odin.parse(`{test}
other = "something"`);

    const result = Odin.validate(doc, schema);
    // Should not require dependent because condition field is missing
    expect(result.errors.filter((e) => e.path === 'test.dependent')).toHaveLength(0);
  });

  it('handles undefined value in condition', () => {
    const schema = Odin.parseSchema(`{config}
mode = !(on, off)
extra = !:if mode = on`);

    const doc = Odin.parse(`{config}
other = "test"`);

    const result = Odin.validate(doc, schema);
    // mode is undefined, so condition should be false
    expect(result.errors.filter((e) => e.path === 'config.extra')).toHaveLength(0);
  });
});
