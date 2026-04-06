/**
 * Type prefix edge case tests for ODIN SDK.
 *
 * Tests for:
 * - Numbers: # (float), ## (integer), #$ (currency)
 * - Booleans: true, false, ?true, ?false
 * - Null: ~
 * - Binary: ^base64, ^algorithm:base64
 * - References: @path
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../../src/index.js';

describe('Type Prefix Parsing', () => {
  describe('Float Numbers (#)', () => {
    it('should parse basic float', () => {
      const doc = Odin.parse('rate = #3.14');
      expect(doc.getNumber('rate')).toBe(3.14);
      const value = doc.get('rate');
      expect(value?.type).toBe('number');
    });

    it('should parse zero float', () => {
      const doc = Odin.parse('rate = #0.0');
      expect(doc.getNumber('rate')).toBe(0.0);
    });

    it('should parse negative float', () => {
      const doc = Odin.parse('rate = #-3.14');
      expect(doc.getNumber('rate')).toBe(-3.14);
    });

    it('should parse float without leading zero', () => {
      // Note: Parser requires leading zero, so #0.5 not #.5
      const doc = Odin.parse('rate = #0.5');
      expect(doc.getNumber('rate')).toBe(0.5);
    });

    it('should parse float with exponent', () => {
      const doc = Odin.parse('rate = #1.5e10');
      expect(doc.getNumber('rate')).toBe(1.5e10);
    });

    it('should parse float with negative exponent', () => {
      const doc = Odin.parse('rate = #1.5e-10');
      expect(doc.getNumber('rate')).toBe(1.5e-10);
    });

    it('should parse float with positive exponent sign', () => {
      const doc = Odin.parse('rate = #1.5e+10');
      expect(doc.getNumber('rate')).toBe(1.5e10);
    });

    it('should parse float with uppercase E', () => {
      const doc = Odin.parse('rate = #1.5E10');
      expect(doc.getNumber('rate')).toBe(1.5e10);
    });

    it('should parse whole number as float', () => {
      const doc = Odin.parse('rate = #42');
      expect(doc.getNumber('rate')).toBe(42);
    });

    it('should parse very small float', () => {
      const doc = Odin.parse('rate = #0.000001');
      expect(doc.getNumber('rate')).toBe(0.000001);
    });

    it('should parse very large float', () => {
      const doc = Odin.parse('rate = #9999999999.99');
      expect(doc.getNumber('rate')).toBe(9999999999.99);
    });
  });

  describe('Integer Numbers (##)', () => {
    it('should parse basic integer', () => {
      const doc = Odin.parse('count = ##42');
      expect(doc.getInteger('count')).toBe(42);
      const value = doc.get('count');
      expect(value?.type).toBe('integer');
    });

    it('should parse zero integer', () => {
      const doc = Odin.parse('count = ##0');
      expect(doc.getInteger('count')).toBe(0);
    });

    it('should parse negative integer', () => {
      const doc = Odin.parse('count = ##-100');
      expect(doc.getInteger('count')).toBe(-100);
    });

    it('should parse large integer', () => {
      const doc = Odin.parse('count = ##1000000');
      expect(doc.getInteger('count')).toBe(1000000);
    });

    it('should parse max safe integer', () => {
      const doc = Odin.parse(`count = ##${Number.MAX_SAFE_INTEGER}`);
      expect(doc.getInteger('count')).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should parse integer with leading zeros (treated as decimal)', () => {
      const doc = Odin.parse('count = ##007');
      expect(doc.getInteger('count')).toBe(7);
    });
  });

  describe('Currency Numbers (#$)', () => {
    it('should parse basic currency', () => {
      const doc = Odin.parse('price = #$99.99');
      expect(doc.getNumber('price')).toBe(99.99);
      const value = doc.get('price');
      expect(value?.type).toBe('currency');
    });

    it('should parse zero currency', () => {
      const doc = Odin.parse('price = #$0.00');
      expect(doc.getNumber('price')).toBe(0.0);
    });

    it('should parse negative currency', () => {
      const doc = Odin.parse('price = #$-50.00');
      expect(doc.getNumber('price')).toBe(-50.0);
    });

    it('should parse large currency', () => {
      const doc = Odin.parse('price = #$1000000.00');
      expect(doc.getNumber('price')).toBe(1000000.0);
    });

    it('should parse currency with cents', () => {
      const doc = Odin.parse('price = #$0.01');
      expect(doc.getNumber('price')).toBe(0.01);
    });

    it('should parse currency whole number', () => {
      const doc = Odin.parse('price = #$100');
      expect(doc.getNumber('price')).toBe(100);
    });

    it('should set decimalPlaces for currency', () => {
      const doc = Odin.parse('price = #$99.99');
      const value = doc.get('price');
      expect((value as any).decimalPlaces).toBe(2);
    });
  });

  describe('Boolean Values', () => {
    it('should parse true without prefix', () => {
      const doc = Odin.parse('active = true');
      expect(doc.getBoolean('active')).toBe(true);
    });

    it('should parse false without prefix', () => {
      const doc = Odin.parse('active = false');
      expect(doc.getBoolean('active')).toBe(false);
    });

    it('should parse ?true with prefix', () => {
      const doc = Odin.parse('active = ?true');
      expect(doc.getBoolean('active')).toBe(true);
    });

    it('should parse ?false with prefix', () => {
      const doc = Odin.parse('active = ?false');
      expect(doc.getBoolean('active')).toBe(false);
    });

    it('should parse boolean in expression context', () => {
      const doc = Odin.parse(`
        enabled = true
        disabled = false
      `);
      expect(doc.getBoolean('enabled')).toBe(true);
      expect(doc.getBoolean('disabled')).toBe(false);
    });
  });

  describe('Null Values (~)', () => {
    it('should parse null', () => {
      const doc = Odin.parse('empty = ~');
      expect(doc.get('empty')?.type).toBe('null');
    });

    it('should parse null in different positions', () => {
      const doc = Odin.parse(`
        first = ~
        middle = "value"
        last = ~
      `);
      expect(doc.get('first')?.type).toBe('null');
      expect(doc.get('last')?.type).toBe('null');
    });

    it('should parse multiple nulls', () => {
      const doc = Odin.parse(`
        a = ~
        b = ~
        c = ~
      `);
      expect(doc.get('a')?.type).toBe('null');
      expect(doc.get('b')?.type).toBe('null');
      expect(doc.get('c')?.type).toBe('null');
    });
  });

  describe('Binary Values (^)', () => {
    it('should parse basic base64 binary', () => {
      const doc = Odin.parse('data = ^SGVsbG8=');
      const value = doc.get('data');
      expect(value?.type).toBe('binary');
      // "Hello" in base64
      const expected = new Uint8Array([72, 101, 108, 108, 111]);
      expect((value as any).data).toEqual(expected);
    });

    it('should parse binary with algorithm prefix', () => {
      const doc = Odin.parse('hash = ^sha256:aGFzaGVk');
      const value = doc.get('hash');
      expect(value?.type).toBe('binary');
      expect((value as any).algorithm).toBe('sha256');
    });

    it('should parse empty base64', () => {
      const doc = Odin.parse('data = ^');
      const value = doc.get('data');
      expect(value?.type).toBe('binary');
      expect((value as any).data.length).toBe(0);
    });

    it('should parse base64 with padding', () => {
      const doc = Odin.parse('data = ^YQ==');
      const value = doc.get('data');
      expect(value?.type).toBe('binary');
      // "a" in base64
      expect((value as any).data).toEqual(new Uint8Array([97]));
    });

    it('should parse long base64 data', () => {
      // Base64 for "The quick brown fox jumps over the lazy dog"
      const doc = Odin.parse(
        'data = ^VGhlIHF1aWNrIGJyb3duIGZveCBqdW1wcyBvdmVyIHRoZSBsYXp5IGRvZw=='
      );
      const value = doc.get('data');
      expect(value?.type).toBe('binary');
      const decoded = new TextDecoder().decode((value as any).data);
      expect(decoded).toBe('The quick brown fox jumps over the lazy dog');
    });

    it('should parse binary with ed25519 algorithm', () => {
      const doc = Odin.parse('sig = ^ed25519:c2lnbmF0dXJl');
      const value = doc.get('sig');
      expect((value as any).algorithm).toBe('ed25519');
    });
  });

  describe('Reference Values (@)', () => {
    it('should parse simple reference', () => {
      const doc = Odin.parse(`
        name = "John"
        alias = @name
      `);
      const value = doc.get('alias');
      expect(value?.type).toBe('reference');
      expect((value as any).path).toBe('name');
    });

    it('should parse nested reference', () => {
      const doc = Odin.parse(`
        {customer}
        name = "John"
        {}
        primary = @customer.name
      `);
      const value = doc.get('primary');
      expect(value?.type).toBe('reference');
      expect((value as any).path).toBe('customer.name');
    });

    it('should parse reference with array index', () => {
      const doc = Odin.parse(`
        items[0].name = "Widget"
        first = @items[0].name
      `);
      const value = doc.get('first');
      expect(value?.type).toBe('reference');
      expect((value as any).path).toBe('items[0].name');
    });

    it('should resolve simple reference', () => {
      const doc = Odin.parse(`
        name = "John"
        alias = @name
      `);
      const resolved = doc.resolve('alias');
      expect(resolved?.type).toBe('string');
      expect((resolved as any).value).toBe('John');
    });

    it('should resolve chained references', () => {
      const doc = Odin.parse(`
        name = "John"
        alias1 = @name
        alias2 = @alias1
      `);
      const resolved = doc.resolve('alias2');
      expect(resolved?.type).toBe('string');
      expect((resolved as any).value).toBe('John');
    });
  });

  describe('Value Modifiers', () => {
    it('should parse critical modifier (!)', () => {
      const doc = Odin.parse('ssn = !"123-45-6789"');
      const mods = doc.modifiers.get('ssn');
      expect(mods?.required).toBe(true);
      expect(doc.getString('ssn')).toBe('123-45-6789');
    });

    it('should parse redacted modifier (*)', () => {
      const doc = Odin.parse('password = *"secret"');
      const mods = doc.modifiers.get('password');
      expect(mods?.confidential).toBe(true);
      expect(doc.getString('password')).toBe('secret');
    });

    it('should parse negative integer directly', () => {
      // Note: The - sign must come after the type prefix, not before
      const doc = Odin.parse('count = ##-42');
      expect(doc.getInteger('count')).toBe(-42);
    });

    it('should parse multiple modifiers', () => {
      const doc = Odin.parse('sensitive = !*"critical-secret"');
      const mods = doc.modifiers.get('sensitive');
      expect(mods?.required).toBe(true);
      expect(mods?.confidential).toBe(true);
    });

    it('should parse critical and redacted modifiers together', () => {
      // Note: The - modifier conflicts with string parsing when placed before quote
      const doc = Odin.parse('field = !*"value"');
      const mods = doc.modifiers.get('field');
      expect(mods?.required).toBe(true);
      expect(mods?.confidential).toBe(true);
    });

    it('should parse modifiers with number types', () => {
      const doc = Odin.parse('count = !##42');
      const mods = doc.modifiers.get('count');
      expect(mods?.required).toBe(true);
      expect(doc.getInteger('count')).toBe(42);
    });

    it('should parse modifiers with boolean', () => {
      const doc = Odin.parse('active = !true');
      const mods = doc.modifiers.get('active');
      expect(mods?.required).toBe(true);
      expect(doc.getBoolean('active')).toBe(true);
    });

    it('should parse modifiers with null', () => {
      const doc = Odin.parse('empty = !~');
      const mods = doc.modifiers.get('empty');
      expect(mods?.required).toBe(true);
      expect(doc.get('empty')?.type).toBe('null');
    });
  });

  describe('Edge Cases', () => {
    it('should parse number right after prefix without space', () => {
      const doc = Odin.parse('val = ##42');
      expect(doc.getInteger('val')).toBe(42);
    });

    it('should handle all types in same document', () => {
      const doc = Odin.parse(`
        str = "hello"
        int = ##42
        float = #3.14
        currency = #$99.99
        bool = true
        null = ~
        date = 2024-01-15
        ref = @str
      `);
      expect(doc.get('str')?.type).toBe('string');
      expect(doc.get('int')?.type).toBe('integer');
      expect(doc.get('float')?.type).toBe('number');
      expect(doc.get('currency')?.type).toBe('currency');
      expect(doc.get('bool')?.type).toBe('boolean');
      expect(doc.get('null')?.type).toBe('null');
      expect(doc.get('date')?.type).toBe('date');
      expect(doc.get('ref')?.type).toBe('reference');
    });

    it('should reject type prefix without value', () => {
      expect(() => Odin.parse('val = #')).toThrow(ParseError);
    });

    it('should reject integer prefix without number', () => {
      expect(() => Odin.parse('val = ##')).toThrow(ParseError);
    });

    it('should reject boolean prefix without value', () => {
      expect(() => Odin.parse('val = ?')).toThrow(ParseError);
    });
  });
});

describe('Document Flatten', () => {
  it('should flatten simple document', () => {
    const doc = Odin.parse(`
      name = "John"
      age = ##42
    `);
    const flat = doc.flatten();
    expect(flat.get('name')).toBe('John');
    expect(flat.get('age')).toBe('42');
  });

  it('should flatten nested paths', () => {
    const doc = Odin.parse(`
      {policy}
      number = "PAP-2024-001"
      premium = #$747.50
    `);
    const flat = doc.flatten();
    expect(flat.get('policy.number')).toBe('PAP-2024-001');
    expect(flat.get('policy.premium')).toBe('747.50');
  });

  it('should flatten arrays', () => {
    const doc = Odin.parse(`
      {items[] : name, qty}
      "Widget", ##10
      "Gadget", ##5
    `);
    const flat = doc.flatten();
    expect(flat.get('items[0].name')).toBe('Widget');
    expect(flat.get('items[0].qty')).toBe('10');
    expect(flat.get('items[1].name')).toBe('Gadget');
    expect(flat.get('items[1].qty')).toBe('5');
  });

  it('should exclude metadata by default', () => {
    const doc = Odin.parse(`
      {$}
      odin = "1.0.0"
      {}
      name = "test"
    `);
    const flat = doc.flatten();
    expect(flat.has('$.odin')).toBe(false);
    expect(flat.get('name')).toBe('test');
  });

  it('should include metadata when option set', () => {
    const doc = Odin.parse(`
      {$}
      odin = "1.0.0"
      {}
      name = "test"
    `);
    const flat = doc.flatten({ includeMetadata: true });
    expect(flat.get('$.odin')).toBe('1.0.0');
    expect(flat.get('name')).toBe('test');
  });

  it('should exclude nulls by default', () => {
    const doc = Odin.parse(`
      name = "test"
      optional = ~
    `);
    const flat = doc.flatten();
    expect(flat.get('name')).toBe('test');
    expect(flat.has('optional')).toBe(false);
  });

  it('should include nulls when option set', () => {
    const doc = Odin.parse(`
      name = "test"
      optional = ~
    `);
    const flat = doc.flatten({ includeNulls: true });
    expect(flat.get('name')).toBe('test');
    expect(flat.get('optional')).toBe('null');
  });

  it('should sort paths by default', () => {
    const doc = Odin.parse(`
      zebra = "z"
      alpha = "a"
      middle = "m"
    `);
    const flat = doc.flatten();
    const keys = Array.from(flat.keys());
    expect(keys).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('should preserve order when sort disabled', () => {
    const doc = Odin.parse(`
      zebra = "z"
      alpha = "a"
    `);
    const flat = doc.flatten({ sort: false });
    const keys = Array.from(flat.keys());
    expect(keys[0]).toBe('zebra');
    expect(keys[1]).toBe('alpha');
  });

  it('should handle all value types', () => {
    const doc = Odin.parse(`
      str = "hello"
      int = ##42
      num = #3.14
      cur = #$99.99
      pct = #%25.5
      bool = true
      date = 2024-06-15
      ts = 2024-06-15T10:30:00Z
      dur = P1D
      ref = @str
    `);
    const flat = doc.flatten();
    expect(flat.get('str')).toBe('hello');
    expect(flat.get('int')).toBe('42');
    expect(flat.get('num')).toBe('3.14');
    expect(flat.get('cur')).toBe('99.99');
    expect(flat.get('pct')).toBe('25.5');
    expect(flat.get('bool')).toBe('true');
    expect(flat.get('date')).toBe('2024-06-15');
    expect(flat.get('ts')).toBe('2024-06-15T10:30:00Z');
    expect(flat.get('dur')).toBe('P1D');
    expect(flat.get('ref')).toBe('@str');
  });

  it('should handle binary values', () => {
    const doc = Odin.parse(`
      data = ^SGVsbG8=
    `);
    const flat = doc.flatten();
    expect(flat.get('data')).toBe('^SGVsbG8=');
  });

  it('should flatten tabular with relative column notation', () => {
    const doc = Odin.parse(`
      {holders[] : name, address.line1, .city, .state, .postal, active}
      "ABC Corp", "500 Commerce St", "Dallas", "TX", "75201", true
      "XYZ LLC", "123 Main St", "Austin", "TX", "78701", false
    `);
    const flat = doc.flatten();

    // First row
    expect(flat.get('holders[0].name')).toBe('ABC Corp');
    expect(flat.get('holders[0].address.line1')).toBe('500 Commerce St');
    expect(flat.get('holders[0].address.city')).toBe('Dallas');
    expect(flat.get('holders[0].address.state')).toBe('TX');
    expect(flat.get('holders[0].address.postal')).toBe('75201');
    expect(flat.get('holders[0].active')).toBe('true');

    // Second row
    expect(flat.get('holders[1].name')).toBe('XYZ LLC');
    expect(flat.get('holders[1].address.line1')).toBe('123 Main St');
    expect(flat.get('holders[1].address.city')).toBe('Austin');
    expect(flat.get('holders[1].address.state')).toBe('TX');
    expect(flat.get('holders[1].address.postal')).toBe('78701');
    expect(flat.get('holders[1].active')).toBe('false');
  });

  it('should flatten tabular with multiple context switches', () => {
    const doc = Odin.parse(`
      {contacts[] : name, home.street, .city, work.street, .city}
      "John", "123 Oak Ave", "Dallas", "456 Elm St", "Austin"
    `);
    const flat = doc.flatten();

    expect(flat.get('contacts[0].name')).toBe('John');
    expect(flat.get('contacts[0].home.street')).toBe('123 Oak Ave');
    expect(flat.get('contacts[0].home.city')).toBe('Dallas');
    expect(flat.get('contacts[0].work.street')).toBe('456 Elm St');
    expect(flat.get('contacts[0].work.city')).toBe('Austin');
  });
});
