/**
 * Conformance regression tests for schema parser and validator fixes.
 * Each block targets a specific spec-conformance gap.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

const META = `{$}\nodin = "1.0.0"\nschema = "1.0.0"\n\n`;

function parseSchema(body: string) {
  return Odin.parseSchema(META + body);
}

function validateDoc(schemaBody: string, docText: string) {
  const schema = parseSchema(schemaBody);
  return Odin.validate(Odin.parse(docText), schema);
}

describe('Conformance: type intersection (= @a & @b)', () => {
  const schemaBody = `{@hasName}\nname = !\n\n{@hasAge}\nage = !##\n\n{customer}\n= @hasName & @hasAge`;

  it('stores both intersection members in the composition typeRef', () => {
    const schema = parseSchema(schemaBody);
    const comp = schema.fields.get('customer._composition');
    expect(comp?.type.kind).toBe('typeRef');
    expect((comp?.type as { name: string }).name).toBe('hasName&hasAge');
  });

  it('passes when all members\' required fields are present', () => {
    const result = validateDoc(schemaBody, `{customer}\nname = "Bob"\nage = ##5`);
    expect(result.valid).toBe(true);
  });

  it('reports V001 when a member required field is missing', () => {
    const result = validateDoc(schemaBody, `{customer}\nname = "Bob"`);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'V001' && e.path === 'customer.age')).toBe(true);
  });

  it('reports V013 for an unresolved member', () => {
    const result = validateDoc(
      `{@hasName}\nname = !\n\n{customer}\n= @hasName & @doesNotExist`,
      `{customer}\nname = "Bob"`
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'V013')).toBe(true);
  });
});

describe('Conformance: temporal range bounds', () => {
  const schemaBody = `{root}\nd = date:(2020-06-15..2020-06-20)`;

  it('preserves temporal bounds as strings', () => {
    const field = parseSchema(schemaBody).fields.get('root.d');
    const bounds = field?.constraints.find((c) => c.kind === 'bounds') as
      | { min: string; max: string }
      | undefined;
    expect(bounds?.min).toBe('2020-06-15');
    expect(bounds?.max).toBe('2020-06-20');
  });

  it('accepts an in-range date', () => {
    expect(validateDoc(schemaBody, `{root}\nd = 2020-06-17`).valid).toBe(true);
  });

  it('rejects a date below the minimum', () => {
    const result = validateDoc(schemaBody, `{root}\nd = 2020-06-10`);
    expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
  });

  it('rejects a date above the maximum', () => {
    const result = validateDoc(schemaBody, `{root}\nd = 2020-06-25`);
    expect(result.errors.some((e) => e.code === 'V003')).toBe(true);
  });
});

describe('Conformance: percent type (#%)', () => {
  const schemaBody = `{root}\ntax = #%`;

  it('parses #% as a percent type', () => {
    expect(parseSchema(schemaBody).fields.get('root.tax')?.type.kind).toBe('percent');
  });

  it('accepts a percent value', () => {
    expect(validateDoc(schemaBody, `{root}\ntax = #%0.15`).valid).toBe(true);
  });

  it('rejects a non-percent value', () => {
    const result = validateDoc(schemaBody, `{root}\ntax = "fifteen"`);
    expect(result.errors.some((e) => e.code === 'V002')).toBe(true);
  });
});

describe('Conformance: typed default values', () => {
  it('captures a bare integer default', () => {
    const field = parseSchema(`{root}\na = ##3`).fields.get('root.a');
    expect(field?.defaultValue).toEqual({ type: 'integer', value: 3 });
  });

  it('captures a bare number default', () => {
    const field = parseSchema(`{root}\nb = #0.05`).fields.get('root.b');
    expect(field?.defaultValue).toEqual({ type: 'number', value: 0.05 });
  });

  it('captures a bare currency default', () => {
    const field = parseSchema(`{root}\nc = #$5.00`).fields.get('root.c');
    expect(field?.defaultValue?.type).toBe('currency');
    expect((field?.defaultValue as { value: number }).value).toBe(5);
  });

  it('captures a bare percent default', () => {
    const field = parseSchema(`{root}\np = #%0.15`).fields.get('root.p');
    expect(field?.defaultValue).toEqual({ type: 'percent', value: 0.15 });
  });

  it('captures a default trailing a bounds constraint', () => {
    const field = parseSchema(`{root}\nq = ##:(1..5) ##3`).fields.get('root.q');
    expect(field?.defaultValue).toEqual({ type: 'integer', value: 3 });
  });
});

describe('Conformance: union edge cases', () => {
  it('keeps both members of date|timestamp', () => {
    const field = parseSchema(`{root}\nu = date|timestamp`).fields.get('root.u');
    expect(field?.type.kind).toBe('union');
    const kinds = (field?.type as { types: { kind: string }[] }).types.map((t) => t.kind);
    expect(kinds).toEqual(['date', 'timestamp']);
  });

  it('accepts null for a #|~ union', () => {
    expect(validateDoc(`{root}\nn = #|~`, `{root}\nn = ~`).valid).toBe(true);
  });

  it('accepts a timestamp for a date|timestamp union', () => {
    expect(validateDoc(`{root}\nu = date|timestamp`, `{root}\nu = 2020-06-17T10:00:00Z`).valid).toBe(true);
  });
});

describe('Conformance: :if after a pattern constraint', () => {
  const schemaBody = `{root}\nfield = !:/^[a-z]+$/:if method = paypal\nmethod = `;

  it('captures both the pattern and the conditional', () => {
    const field = parseSchema(schemaBody).fields.get('root.field');
    expect(field?.constraints.some((c) => c.kind === 'pattern')).toBe(true);
    expect(field?.conditionals).toEqual([{ field: 'method', operator: '=', value: 'paypal' }]);
  });

  it('requires the field (V010) when the condition holds', () => {
    const result = validateDoc(schemaBody, `{root}\nmethod = "paypal"`);
    expect(result.errors.some((e) => e.code === 'V010' && e.path === 'root.field')).toBe(true);
  });

  it('does not require the field when the condition fails', () => {
    expect(validateDoc(schemaBody, `{root}\nmethod = "stripe"`).valid).toBe(true);
  });

  it('still enforces the pattern on present values', () => {
    const result = validateDoc(schemaBody, `{root}\nfield = "ABC123"\nmethod = "paypal"`);
    expect(result.errors.some((e) => e.code === 'V004')).toBe(true);
  });
});

describe('Conformance: glued directive after a temporal type', () => {
  it('keeps the timestamp type and immutable flag', () => {
    const field = parseSchema(`{root}\ncreated_at = !timestamp:immutable`).fields.get('root.created_at');
    expect(field?.type.kind).toBe('timestamp');
    expect(field?.immutable).toBe(true);
    expect(field?.required).toBe(true);
  });

  it('keeps the date type and computed flag', () => {
    const field = parseSchema(`{root}\nstamp = date:computed`).fields.get('root.stamp');
    expect(field?.type.kind).toBe('date');
    expect(field?.computed).toBe(true);
  });
});

describe('Conformance: field-level typeRef recursive validation', () => {
  const schemaBody = `{@address}\nstreet = !\ncity = !\n\n{customer}\nname = !\nbilling = @address`;

  it('enforces the referenced type\'s required fields when present', () => {
    const result = validateDoc(schemaBody, `{customer}\nname = "X"\nbilling.street = "Main"`);
    expect(result.errors.some((e) => e.code === 'V001' && e.path === 'customer.billing.city')).toBe(true);
  });

  it('does not require nested fields when the optional object is absent', () => {
    expect(validateDoc(schemaBody, `{customer}\nname = "X"`).valid).toBe(true);
  });

  it('passes when all nested required fields are present', () => {
    const result = validateDoc(schemaBody, `{customer}\nname = "X"\nbilling.street = "Main"\nbilling.city = "NYC"`);
    expect(result.valid).toBe(true);
  });
});

describe('Conformance: invariant null operand', () => {
  it('fails an arithmetic invariant with a null operand', () => {
    const schemaBody = `{order}\ntotal = #$\nsubtotal = #$\ntax = ~#$\n:invariant total = subtotal + tax`;
    const result = validateDoc(schemaBody, `{order}\ntotal = #$10.00\nsubtotal = #$10.00\ntax = ~`);
    expect(result.errors.some((e) => e.code === 'V008' && e.path === 'order')).toBe(true);
  });

  it('fails a comparison invariant with a null operand', () => {
    const schemaBody = `{range}\nstart = ~#\nend = ~#\n:invariant end >= start`;
    const result = validateDoc(schemaBody, `{range}\nend = #5\nstart = ~`);
    expect(result.errors.some((e) => e.code === 'V008')).toBe(true);
  });

  it('passes a consistent invariant with all operands present', () => {
    const schemaBody = `{order}\ntotal = #$\nsubtotal = #$\ntax = #$\n:invariant total = subtotal + tax`;
    const result = validateDoc(schemaBody, `{order}\ntotal = #$12.00\nsubtotal = #$10.00\ntax = #$2.00`);
    expect(result.valid).toBe(true);
  });
});
