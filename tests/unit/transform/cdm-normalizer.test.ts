/**
 * Tests for cdm-normalizer module.
 *
 * Covers normalization of transform output to OdinDocument.
 */

import { describe, it, expect } from 'vitest';
import { normalizeToOdin } from '../../../src/transform/cdm-normalizer.js';
import type { TransformValue } from '../../../src/types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

const str = (value: string, modifiers?: TransformValue['modifiers']): TransformValue => ({
  type: 'string',
  value,
  modifiers,
});

const int = (value: number, modifiers?: TransformValue['modifiers']): TransformValue => ({
  type: 'integer',
  value,
  modifiers,
});

const num = (value: number, modifiers?: TransformValue['modifiers']): TransformValue => ({
  type: 'number',
  value,
  modifiers,
});

const bool = (value: boolean, modifiers?: TransformValue['modifiers']): TransformValue => ({
  type: 'boolean',
  value,
  modifiers,
});

const nil = (modifiers?: TransformValue['modifiers']): TransformValue => ({
  type: 'null',
  modifiers,
});

const currency = (
  value: number,
  decimalPlaces: number,
  modifiers?: TransformValue['modifiers']
): TransformValue => ({
  type: 'currency',
  value,
  decimalPlaces,
  modifiers,
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeToOdin Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeToOdin', () => {
  describe('metadata', () => {
    it('does not add forced metadata', () => {
      const doc = normalizeToOdin({});
      const json = doc.toJSON();
      expect(json.$).toBeUndefined();
    });
  });

  describe('simple values', () => {
    it('normalizes empty output', () => {
      const doc = normalizeToOdin({});
      const json = doc.toJSON();
      expect(Object.keys(json)).toHaveLength(0);
    });

    it('normalizes single string field', () => {
      const doc = normalizeToOdin({ Name: str('John') });
      const json = doc.toJSON();
      expect(json.Name).toBe('John');
    });

    it('normalizes single integer field', () => {
      const doc = normalizeToOdin({ Count: int(42) });
      const json = doc.toJSON();
      expect(json.Count).toBe(42);
    });

    it('normalizes single number field', () => {
      const doc = normalizeToOdin({ Rate: num(3.14) });
      const json = doc.toJSON();
      expect(json.Rate).toBe(3.14);
    });

    it('normalizes single boolean field', () => {
      const doc = normalizeToOdin({ Active: bool(true) });
      const json = doc.toJSON();
      expect(json.Active).toBe(true);
    });

    it('normalizes single null field', () => {
      const doc = normalizeToOdin({ Empty: nil() });
      const json = doc.toJSON();
      expect(json.Empty).toBe(null);
    });

    it('normalizes single currency field', () => {
      const doc = normalizeToOdin({ Price: currency(99.99, 2) });
      const json = doc.toJSON();
      expect(json.Price).toBe(99.99);
    });
  });

  describe('nested objects', () => {
    it('normalizes nested object', () => {
      const output = {
        Customer: {
          Name: str('John'),
          Age: int(30),
        },
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      expect(json.Customer).toBeDefined();
      expect(json.Customer.Name).toBe('John');
      expect(json.Customer.Age).toBe(30);
    });

    it('normalizes deeply nested object', () => {
      const output = {
        Level1: {
          Level2: {
            Level3: {
              Value: str('deep'),
            },
          },
        },
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      expect(json.Level1.Level2.Level3.Value).toBe('deep');
    });

    it('normalizes multiple top-level fields', () => {
      const output = {
        Name: str('John'),
        Age: int(30),
        Active: bool(true),
      };
      const doc = normalizeToOdin(output);
      const json = doc.toJSON();
      expect(json.Name).toBe('John');
      expect(json.Age).toBe(30);
      expect(json.Active).toBe(true);
    });
  });

  describe('arrays', () => {
    it('normalizes array of primitives', () => {
      const output = {
        Items: [str('a'), str('b'), str('c')],
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      expect(json.Items).toEqual(['a', 'b', 'c']);
    });

    it('normalizes array with nested objects', () => {
      const output = {
        People: [
          { Name: str('John'), Age: int(30) },
          { Name: str('Jane'), Age: int(25) },
        ],
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      expect(json.People).toHaveLength(2);
      expect(json.People[0].Name).toBe('John');
      expect(json.People[1].Name).toBe('Jane');
    });

    it('normalizes empty array (omits in output)', () => {
      const output = {
        Items: [],
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      // Empty arrays have no items to add, so the field is omitted
      expect(json.Items).toBeUndefined();
    });

    it('normalizes array with mixed types', () => {
      const output = {
        Mixed: [str('text'), int(42), bool(true)],
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      expect(json.Mixed).toEqual(['text', 42, true]);
    });
  });

  describe('null handling', () => {
    it('normalizes null TransformValue', () => {
      const output = {
        Empty: nil(),
      };
      const doc = normalizeToOdin(output);
      const json = doc.toJSON();
      expect(json.Empty).toBe(null);
    });

    it('normalizes raw null value', () => {
      const output = {
        Empty: null,
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      expect(json.Empty).toBe(null);
    });

    it('normalizes undefined value', () => {
      const output = {
        Empty: undefined,
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      expect(json.Empty).toBe(null);
    });
  });

  describe('modifiers', () => {
    it('normalizes confidential modifier', () => {
      const output = {
        SSN: str('123-45-6789', { confidential: true }),
      };
      const doc = normalizeToOdin(output);
      // The document should have the value
      const json = doc.toJSON();
      expect(json.SSN).toBe('123-45-6789');
    });

    it('normalizes required modifier', () => {
      const output = {
        Name: str('John', { required: true }),
      };
      const doc = normalizeToOdin(output);
      const json = doc.toJSON();
      expect(json.Name).toBe('John');
    });

    it('normalizes deprecated modifier', () => {
      const output = {
        LegacyField: str('old value', { deprecated: true }),
      };
      const doc = normalizeToOdin(output);
      const json = doc.toJSON();
      expect(json.LegacyField).toBe('old value');
    });

    it('normalizes combined modifiers', () => {
      const output = {
        SecretField: str('secret', { confidential: true, required: true, deprecated: true }),
      };
      const doc = normalizeToOdin(output);
      const json = doc.toJSON();
      expect(json.SecretField).toBe('secret');
    });

    it('handles empty modifiers object', () => {
      const output = {
        Field: str('value', {}),
      };
      const doc = normalizeToOdin(output);
      const json = doc.toJSON();
      expect(json.Field).toBe('value');
    });

    it('handles false modifiers', () => {
      const output = {
        Field: str('value', { confidential: false, required: false, deprecated: false }),
      };
      const doc = normalizeToOdin(output);
      const json = doc.toJSON();
      expect(json.Field).toBe('value');
    });
  });

  describe('complex structures', () => {
    it('normalizes policy-like structure', () => {
      const output = {
        Policy: {
          Number: str('POL-001'),
          Premium: currency(1500.0, 2),
          Vehicles: [
            {
              VIN: str('1HGBH41JXMN109186'),
              Make: str('Honda'),
              Model: str('Accord'),
            },
          ],
        },
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      expect(json.Policy.Number).toBe('POL-001');
      expect(json.Policy.Premium).toBe(1500.0);
      expect(json.Policy.Vehicles[0].VIN).toBe('1HGBH41JXMN109186');
    });

    it('normalizes nested arrays', () => {
      const output = {
        Matrix: [
          [int(1), int(2)],
          [int(3), int(4)],
        ],
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      expect(json.Matrix).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });

  describe('edge cases', () => {
    it('handles primitive fallback for unexpected types', () => {
      // Simulate a value that isn't a TransformValue but is a primitive
      const output = {
        RawString: 'raw string',
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      // Should convert to string
      expect(json.RawString).toBe('raw string');
    });

    it('handles numeric primitive fallback', () => {
      const output = {
        RawNumber: 42,
      };
      const doc = normalizeToOdin(output as unknown as Record<string, TransformValue>);
      const json = doc.toJSON();
      expect(json.RawNumber).toBe(42);
    });
  });
});
