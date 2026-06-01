/**
 * Tests for schema-validation enforcement: invariant evaluation, currency and
 * percent bounds, override restrictiveness, intersection conflicts, tabular
 * columns, and default-value rules.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';
import type { ValidationResult } from '../../../src/types/schema.js';

const H = '{$}\nodin = "1.0.0"\nschema = "1.0.0"\n\n';

function run(schemaText: string, inputText: string): ValidationResult {
  const schema = Odin.parseSchema(H + schemaText);
  const doc = inputText === '' ? Odin.empty() : Odin.parse(inputText);
  return Odin.validate(doc, schema);
}

function codesAt(result: ValidationResult, path: string): string[] {
  return result.errors.filter((e) => e.path === path).map((e) => e.code);
}

describe('Invariant expression evaluation', () => {
  it('passes a three-term additive invariant', () => {
    const r = run(
      '{order}\nsubtotal = #$\ntax = #$\nshipping = #$\ntotal = #$\n:invariant total = subtotal + tax + shipping',
      '{order}\nsubtotal = #$10.00\ntax = #$1.00\nshipping = #$2.00\ntotal = #$13.00'
    );
    expect(r.valid).toBe(true);
  });

  it('fails a three-term additive invariant when inconsistent', () => {
    const r = run(
      '{order}\nsubtotal = #$\ntax = #$\nshipping = #$\ntotal = #$\n:invariant total = subtotal + tax + shipping',
      '{order}\nsubtotal = #$10.00\ntax = #$1.00\nshipping = #$2.00\ntotal = #$99.00'
    );
    expect(r.valid).toBe(false);
    expect(codesAt(r, 'order')).toContain('V008');
  });

  it('evaluates parentheses and precedence (discount example)', () => {
    const schema =
      '{discount}\nsubtotal = #$\npercentage = #\nfixed_amount = #$\ntotal = #$\n:invariant total = subtotal - (subtotal * percentage / 100) - fixed_amount';
    expect(
      run(schema, '{discount}\nsubtotal = #$100.00\npercentage = #10\nfixed_amount = #$5.00\ntotal = #$85.00').valid
    ).toBe(true);
    expect(
      run(schema, '{discount}\nsubtotal = #$100.00\npercentage = #10\nfixed_amount = #$5.00\ntotal = #$80.00').valid
    ).toBe(false);
  });

  it('evaluates logical OR', () => {
    const schema = '{discount}\npercentage = #\nfixed_amount = #$\n:invariant percentage == 0 || fixed_amount == 0';
    expect(run(schema, '{discount}\npercentage = #0\nfixed_amount = #$5.00').valid).toBe(true);
    expect(run(schema, '{discount}\npercentage = #10\nfixed_amount = #$5.00').valid).toBe(false);
  });

  it('evaluates logical AND and negation', () => {
    const schema = '{f}\na = #\nb = #\n:invariant !(a > 10) && b < 5';
    expect(run(schema, '{f}\na = #3\nb = #2').valid).toBe(true);
    expect(run(schema, '{f}\na = #20\nb = #2').valid).toBe(false);
  });

  it('evaluates modulo', () => {
    const schema = '{n}\nx = ##\n:invariant x % 2 == 0';
    expect(run(schema, '{n}\nx = ##4').valid).toBe(true);
    expect(run(schema, '{n}\nx = ##5').valid).toBe(false);
  });

  it('compares temporal operands', () => {
    const schema = '{r}\nstart = date\nend = date\n:invariant end >= start';
    expect(run(schema, '{r}\nstart = 2020-01-01\nend = 2020-02-01').valid).toBe(true);
    expect(run(schema, '{r}\nstart = 2020-03-01\nend = 2020-02-01').valid).toBe(false);
  });

  it('treats a null operand as false (V008)', () => {
    const r = run(
      '{o}\ntotal = #$\nsubtotal = #$\ntax = ~#$\n:invariant total = subtotal + tax',
      '{o}\ntotal = #$10.00\nsubtotal = #$10.00\ntax = ~'
    );
    expect(r.valid).toBe(false);
    expect(codesAt(r, 'o')).toContain('V008');
  });

  it('does not apply when an operand field is absent', () => {
    const r = run(
      '{o}\ntotal = #$\nsubtotal = #$\ntax = #$\n:invariant total = subtotal + tax',
      '{o}\ntotal = #$10.00'
    );
    expect(r.valid).toBe(true);
  });

  it('reports a malformed invariant expression as V008', () => {
    const r = run('{o}\nx = #\n:invariant x + + ', '{o}\nx = #1');
    expect(r.valid).toBe(false);
    expect(codesAt(r, 'o')).toContain('V008');
  });
});

describe('Currency decimal-place enforcement', () => {
  it('accepts a value with the declared places', () => {
    expect(run('{w}\nbtc = #$.8', '{w}\nbtc = #$1.00000000').valid).toBe(true);
  });

  it('rejects a value with too few places (V003)', () => {
    const r = run('{w}\nbtc = #$.8', '{w}\nbtc = #$1.00');
    expect(r.valid).toBe(false);
    expect(codesAt(r, 'w.btc')).toContain('V003');
  });

  it('defaults currency to two places', () => {
    expect(run('{w}\nprice = #$', '{w}\nprice = #$9.99').valid).toBe(true);
    expect(run('{w}\nprice = #$', '{w}\nprice = #$9.999').valid).toBe(false);
  });
});

describe('Percent bounds enforcement', () => {
  it('accepts an in-range percent', () => {
    expect(run('{r}\nrate = #%:(0..1)', '{r}\nrate = #%0.5').valid).toBe(true);
  });

  it('rejects an out-of-range percent (V003)', () => {
    const r = run('{r}\nrate = #%:(0..1)', '{r}\nrate = #%1.5');
    expect(r.valid).toBe(false);
    expect(codesAt(r, 'r.rate')).toContain('V003');
  });

  it('rejects a percent below the minimum', () => {
    expect(run('{r}\nrate = #%:(0.1..1)', '{r}\nrate = #%0.05').valid).toBe(false);
  });
});

describe('Override restrictiveness', () => {
  it('accepts an override that narrows bounds', () => {
    expect(run('{@base}\namount = #$:(0..1000)\n\n{@narrow}\n= @base :override\namount = #$:(0..100)', '').valid).toBe(true);
  });

  it('rejects an override that widens bounds (V017)', () => {
    const r = run('{@base}\namount = #$:(0..100)\n\n{@wide}\n= @base :override\namount = #$:(0..1000)', '');
    expect(r.valid).toBe(false);
    expect(codesAt(r, '@wide.amount')).toContain('V017');
  });

  it('allows optional to required but not the reverse', () => {
    expect(run('{@base}\nname =\n\n{@d}\n= @base :override\nname = !', '').valid).toBe(true);
    const r = run('{@base}\nname = !\n\n{@d}\n= @base :override\nname =', '');
    expect(r.valid).toBe(false);
    expect(codesAt(r, '@d.name')).toContain('V017');
  });

  it('allows removing nullability but not adding it', () => {
    expect(run('{@base}\nx = ~#\n\n{@d}\n= @base :override\nx = #', '').valid).toBe(true);
    const r = run('{@base}\nx = #\n\n{@d}\n= @base :override\nx = ~#', '');
    expect(r.valid).toBe(false);
    expect(codesAt(r, '@d.x')).toContain('V017');
  });

  it('rejects changing the base type (V017)', () => {
    const r = run('{@base}\nx = #\n\n{@d}\n= @base :override\nx =', '');
    expect(r.valid).toBe(false);
    expect(codesAt(r, '@d.x')).toContain('V017');
  });

  it('enforces override rules on path-level compositions', () => {
    const r = run('{@base}\namount = #$:(0..100)\n\n{order}\n= @base :override\namount = #$:(0..1000)', '');
    expect(r.valid).toBe(false);
    expect(codesAt(r, 'order.amount')).toContain('V017');
  });

  it('does not flag fields the override does not touch', () => {
    expect(run('{@base}\na = #$:(0..100)\nb = !\n\n{@d}\n= @base :override\na = #$:(0..50)', '').valid).toBe(true);
  });
});

describe('Intersection field conflicts', () => {
  it('rejects same-name fields with differing definitions (V017)', () => {
    const r = run('{@a}\nx = !\n\n{@b}\nx = !##\n\n{cust}\n= @a & @b', '{cust}\nx = ##5');
    expect(r.valid).toBe(false);
    expect(codesAt(r, '@cust.x')).toContain('V017');
  });

  it('accepts disjoint or identical member fields', () => {
    expect(
      run('{@a}\nx = !\nname = !\n\n{@b}\nx = !\nage = !##\n\n{cust}\n= @a & @b', '{cust}\nx = "hi"\nname = "n"\nage = ##5').valid
    ).toBe(true);
  });

  it('reports conflict for a three-way intersection', () => {
    const r = run('{@a}\nx = !\n\n{@b}\ny = !\n\n{@c}\nx = !##\n\n{cust}\n= @a & @b & @c', '{cust}\nx = "hi"\ny = "z"');
    expect(r.valid).toBe(false);
    expect(codesAt(r, '@cust.x')).toContain('V017');
  });
});

describe('Tabular column rules', () => {
  it('accepts primitive columns', () => {
    expect(run('{contacts[] : name, email}\nname = !\nemail = !', '{contacts[0]}\nname = "a"\nemail = "b"').valid).toBe(true);
  });

  it('rejects a column referencing a defined type (V017)', () => {
    const r = run('{@addr}\nline1 = !\n\n{customers[] : name, address}\nname = !\naddress = @addr', '{customers[0]}\nname = "a"');
    expect(r.valid).toBe(false);
    expect(codesAt(r, 'customers[].address')).toContain('V017');
  });

  it('accepts a single-level dotted column', () => {
    expect(run('{rows[] : id, label}\nid = !##\nlabel = !', '{rows[0]}\nid = ##1\nlabel = "x"').valid).toBe(true);
  });
});

describe('Default value rules', () => {
  it('accepts a default within constraints on an optional field', () => {
    expect(run('{root}\npriority = ##:(1..5) ##3', '').valid).toBe(true);
  });

  it('rejects a default on a required field (V017)', () => {
    const r = run('{root}\nstatus = !("a", "b") "a"', '{root}\nstatus = "a"');
    expect(r.valid).toBe(false);
    expect(codesAt(r, 'root.status')).toContain('V017');
  });

  it('rejects a default that violates bounds (V017)', () => {
    const r = run('{root}\npriority = ##:(1..5) ##9', '');
    expect(r.valid).toBe(false);
    expect(codesAt(r, 'root.priority')).toContain('V017');
  });

  it('rejects a default outside the enum (V017)', () => {
    const r = run('{root}\nstatus = ("a", "b") "c"', '');
    expect(r.valid).toBe(false);
    expect(codesAt(r, 'root.status')).toContain('V017');
  });

  it('accepts a default that matches the enum', () => {
    expect(run('{root}\nstatus = ("a", "b") "a"', '').valid).toBe(true);
  });
});
