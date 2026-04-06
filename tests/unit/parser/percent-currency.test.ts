/**
 * Unit tests for percent type and currency code features.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Percent Type (#%)', () => {
  describe('happy path', () => {
    it('should parse basic percent value', () => {
      const doc = Odin.parse('rate = #%0.15');
      const value = doc.get('rate');
      expect(value?.type).toBe('percent');
      expect(value?.value).toBe(0.15);
    });

    it('should parse 100% as 1.0', () => {
      const doc = Odin.parse('complete = #%1.0');
      const value = doc.get('complete');
      expect(value?.type).toBe('percent');
      expect(value?.value).toBe(1.0);
    });

    it('should parse 0% as 0', () => {
      const doc = Odin.parse('zero = #%0');
      const value = doc.get('zero');
      expect(value?.type).toBe('percent');
      expect(value?.value).toBe(0);
    });

    it('should parse negative percent', () => {
      const doc = Odin.parse('loss = #%-0.05');
      const value = doc.get('loss');
      expect(value?.type).toBe('percent');
      expect(value?.value).toBe(-0.05);
    });

    it('should parse percent over 100% (e.g., 150%)', () => {
      const doc = Odin.parse('growth = #%1.5');
      const value = doc.get('growth');
      expect(value?.type).toBe('percent');
      expect(value?.value).toBe(1.5);
    });

    it('should preserve high-precision percent in raw', () => {
      const doc = Odin.parse('precise = #%0.123456789012345');
      const value = doc.get('precise');
      expect(value?.type).toBe('percent');
      expect(value?.raw).toBe('0.123456789012345');
    });

    it('should serialize percent value back to ODIN', () => {
      const doc = Odin.parse('rate = #%0.15');
      const text = Odin.stringify(doc);
      expect(text).toContain('#%0.15');
    });

    it('should round-trip percent value', () => {
      const original = 'rate = #%0.25';
      const doc = Odin.parse(original);
      const text = Odin.stringify(doc);
      expect(text.trim()).toBe(original);
    });
  });

  describe('edge cases', () => {
    it('should parse small percent (0.001 = 0.1%)', () => {
      const doc = Odin.parse('tiny = #%0.001');
      const value = doc.get('tiny');
      expect(value?.type).toBe('percent');
      expect(value?.value).toBe(0.001);
    });

    it('should parse percent with many decimal places', () => {
      const doc = Odin.parse('exact = #%0.333333');
      const value = doc.get('exact');
      expect(value?.type).toBe('percent');
      expect(value?.value).toBeCloseTo(0.333333);
    });

    it('should handle percent in header context', () => {
      const doc = Odin.parse(`
        {policy}
        discount = #%0.10
      `);
      const value = doc.get('policy.discount');
      expect(value?.type).toBe('percent');
      expect(value?.value).toBe(0.1);
    });

    it('should handle multiple percent values', () => {
      const doc = Odin.parse(`
        rate1 = #%0.05
        rate2 = #%0.10
        rate3 = #%0.15
      `);
      expect(doc.get('rate1')?.value).toBe(0.05);
      expect(doc.get('rate2')?.value).toBe(0.1);
      expect(doc.get('rate3')?.value).toBe(0.15);
    });
  });

  describe('error cases', () => {
    it('should reject #% without a number', () => {
      expect(() => Odin.parse('rate = #%')).toThrow();
    });

    it('should reject #% followed by non-numeric', () => {
      expect(() => Odin.parse('rate = #%abc')).toThrow();
    });
  });
});

describe('Currency Code (#$value:CODE)', () => {
  describe('happy path', () => {
    it('should parse currency with USD code', () => {
      const doc = Odin.parse('price = #$99.99:USD');
      const value = doc.get('price');
      expect(value?.type).toBe('currency');
      expect(value?.value).toBe(99.99);
      expect(value?.currencyCode).toBe('USD');
    });

    it('should parse currency with EUR code', () => {
      const doc = Odin.parse('cost = #$1234.56:EUR');
      const value = doc.get('cost');
      expect(value?.type).toBe('currency');
      expect(value?.value).toBe(1234.56);
      expect(value?.currencyCode).toBe('EUR');
    });

    it('should parse currency with GBP code', () => {
      const doc = Odin.parse('amount = #$50.00:GBP');
      const value = doc.get('amount');
      expect(value?.type).toBe('currency');
      expect(value?.value).toBe(50.0);
      expect(value?.currencyCode).toBe('GBP');
    });

    it('should parse currency without code (local currency)', () => {
      const doc = Odin.parse('local = #$100.00');
      const value = doc.get('local');
      expect(value?.type).toBe('currency');
      expect(value?.value).toBe(100.0);
      expect(value?.currencyCode).toBeUndefined();
    });

    it('should uppercase lowercase currency codes', () => {
      const doc = Odin.parse('price = #$99.99:usd');
      const value = doc.get('price');
      expect(value?.currencyCode).toBe('USD');
    });

    it('should serialize currency with code back to ODIN', () => {
      const doc = Odin.parse('price = #$99.99:USD');
      const text = Odin.stringify(doc);
      expect(text).toContain('#$99.99:USD');
    });

    it('should round-trip currency with code', () => {
      const original = 'price = #$99.99:USD';
      const doc = Odin.parse(original);
      const text = Odin.stringify(doc);
      expect(text.trim()).toBe(original);
    });

    it('should round-trip currency without code', () => {
      const original = 'price = #$99.99';
      const doc = Odin.parse(original);
      const text = Odin.stringify(doc);
      expect(text.trim()).toBe(original);
    });
  });

  describe('edge cases', () => {
    it('should parse negative currency with code', () => {
      const doc = Odin.parse('refund = #$-50.00:USD');
      const value = doc.get('refund');
      expect(value?.type).toBe('currency');
      expect(value?.value).toBe(-50.0);
      expect(value?.currencyCode).toBe('USD');
    });

    it('should parse currency with 4 decimal places (crypto)', () => {
      const doc = Odin.parse('crypto = #$0.0001:BTC');
      const value = doc.get('crypto');
      expect(value?.type).toBe('currency');
      expect(value?.value).toBe(0.0001);
      expect(value?.currencyCode).toBe('BTC');
    });

    it('should handle currency in header context', () => {
      const doc = Odin.parse(`
        {invoice}
        total = #$1500.00:USD
      `);
      const value = doc.get('invoice.total');
      expect(value?.type).toBe('currency');
      expect(value?.value).toBe(1500.0);
      expect(value?.currencyCode).toBe('USD');
    });

    it('should handle multiple currencies', () => {
      const doc = Odin.parse(`
        usd = #$100.00:USD
        eur = #$85.00:EUR
        local = #$200.00
      `);
      expect(doc.get('usd')?.currencyCode).toBe('USD');
      expect(doc.get('eur')?.currencyCode).toBe('EUR');
      expect(doc.get('local')?.currencyCode).toBeUndefined();
    });

    it('should preserve raw for high-precision currency', () => {
      const doc = Odin.parse('precise = #$0.123456789:USD');
      const value = doc.get('precise');
      expect(value?.raw).toBe('0.123456789');
      expect(value?.currencyCode).toBe('USD');
    });
  });

  describe('mixed scenarios', () => {
    it('should handle percent and currency together', () => {
      const doc = Odin.parse(`
        price = #$100.00:USD
        discount = #%0.15
        tax = #%0.08
      `);
      expect(doc.get('price')?.type).toBe('currency');
      expect(doc.get('price')?.currencyCode).toBe('USD');
      expect(doc.get('discount')?.type).toBe('percent');
      expect(doc.get('discount')?.value).toBe(0.15);
      expect(doc.get('tax')?.type).toBe('percent');
      expect(doc.get('tax')?.value).toBe(0.08);
    });
  });
});
