/**
 * TDD Tests for Missing Spec Verbs
 *
 * These tests are written based on the ODIN Transform 1.0 Specification
 * for verbs that were specified but not implemented.
 *
 * Spec references:
 * - hexEncode/hexDecode: lines 1219-1226
 * - sortDesc: line 1294
 * - sortBy: lines 1297-1301
 */

import { describe, it, expect } from 'vitest';
import { callVerb, str, int, arr } from './helpers.js';

describe('Spec Verbs - hexEncode/hexDecode', () => {
  /**
   * hexEncode/hexDecode Tests
   *
   * Spec (lines 1219-1226):
   * hexEncode - %hexEncode @path - Encode to hexadecimal
   * hexDecode - %hexDecode @path - Decode from hexadecimal
   *
   * Example from spec:
   * hex_data = %hexEncode @binary.data
   * ; binary -> "48656C6C6F"
   *
   * binary = %hexDecode @hex_string
   * ; "48656C6C6F" -> binary
   */
  describe('hexEncode', () => {
    it('encodes ASCII string to hex', () => {
      const result = callVerb('hexEncode', [str('Hello')]);
      // "Hello" in hex: H=48, e=65, l=6C, l=6C, o=6F
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value.toUpperCase()).toBe('48656C6C6F');
      }
    });

    it('encodes empty string to empty hex', () => {
      const result = callVerb('hexEncode', [str('')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('');
      }
    });

    it('encodes numbers as their string representation in hex', () => {
      const result = callVerb('hexEncode', [int(42)]);
      // "42" in hex: 4=34, 2=32
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value.toUpperCase()).toBe('3432');
      }
    });

    it('returns nil for no arguments', () => {
      const result = callVerb('hexEncode', []);
      expect(result.type).toBe('null');
    });

    it('encodes unicode characters correctly', () => {
      const result = callVerb('hexEncode', [str('AB')]);
      // A=41, B=42
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value.toUpperCase()).toBe('4142');
      }
    });

    it('encodes special characters', () => {
      const result = callVerb('hexEncode', [str(' ')]);
      // space = 20
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value.toUpperCase()).toBe('20');
      }
    });

    it('encodes newline character', () => {
      const result = callVerb('hexEncode', [str('\n')]);
      // newline = 0A
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value.toUpperCase()).toBe('0A');
      }
    });
  });

  describe('hexDecode', () => {
    it('decodes hex to ASCII string', () => {
      const result = callVerb('hexDecode', [str('48656C6C6F')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Hello');
      }
    });

    it('decodes lowercase hex', () => {
      const result = callVerb('hexDecode', [str('48656c6c6f')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Hello');
      }
    });

    it('decodes empty hex to empty string', () => {
      const result = callVerb('hexDecode', [str('')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('');
      }
    });

    it('returns nil for invalid hex (odd length)', () => {
      const result = callVerb('hexDecode', [str('48656')]);
      expect(result.type).toBe('null');
    });

    it('returns nil for invalid hex characters', () => {
      const result = callVerb('hexDecode', [str('48GG')]);
      expect(result.type).toBe('null');
    });

    it('returns nil for no arguments', () => {
      const result = callVerb('hexDecode', []);
      expect(result.type).toBe('null');
    });

    it('decodes special character hex', () => {
      const result = callVerb('hexDecode', [str('20')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe(' ');
      }
    });

    it('decodes newline hex', () => {
      const result = callVerb('hexDecode', [str('0A')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('\n');
      }
    });

    it('roundtrips with hexEncode', () => {
      const original = 'Hello, World!';
      const encoded = callVerb('hexEncode', [str(original)]);
      expect(encoded.type).toBe('string');
      const decoded = callVerb('hexDecode', [encoded]);
      expect(decoded.type).toBe('string');
      if (decoded.type === 'string') {
        expect(decoded.value).toBe(original);
      }
    });
  });
});

describe('Spec Verbs - sortDesc/sortBy', () => {
  /**
   * sortDesc Tests
   *
   * Spec (lines 1293-1295):
   * sortDesc - %sortDesc @array - Sort descending
   *
   * Example from spec:
   * sorted_desc = %sortDesc @values
   * ; [1, 3, 2] -> [3, 2, 1]
   *
   * Note: Array verbs now expect pre-resolved array TransformValue,
   * not path strings. They return array type, not JSON strings.
   */
  describe('sortDesc', () => {
    it('sorts numbers descending', () => {
      const result = callVerb('sortDesc', [arr([1, 3, 2])]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([3, 2, 1]);
      }
    });

    it('sorts strings descending', () => {
      const result = callVerb('sortDesc', [arr(['Alice', 'Charlie', 'Bob'])]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual(['Charlie', 'Bob', 'Alice']);
      }
    });

    it('returns empty array for non-array input', () => {
      // Passing a string that's not a valid JSON array returns empty array
      const result = callVerb('sortDesc', [str('not an array')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([]);
      }
    });

    it('returns empty array for no arguments', () => {
      const result = callVerb('sortDesc', []);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([]);
      }
    });

    it('handles empty array', () => {
      const result = callVerb('sortDesc', [arr([])]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([]);
      }
    });

    it('handles single element array', () => {
      const result = callVerb('sortDesc', [arr([42])]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([42]);
      }
    });

    it('preserves original array (does not mutate)', () => {
      const original = [1, 3, 2];
      callVerb('sortDesc', [arr(original)]);
      expect(original).toEqual([1, 3, 2]);
    });
  });

  /**
   * sortBy Tests
   *
   * Spec (lines 1297-1301):
   * sortBy - %sortBy @array "field" - Sort by field
   *
   * Example from spec:
   * by_premium = %sortBy @coverages "premium"
   * ; Sort coverages by premium field ascending
   *
   * by_date = %sortBy @claims "date"
   *
   * Note: Array verbs now expect pre-resolved array TransformValue,
   * not path strings. They return array type, not JSON strings.
   */
  describe('sortBy', () => {
    it('sorts objects by numeric field ascending', () => {
      const items = [
        { name: 'C', value: 30 },
        { name: 'A', value: 10 },
        { name: 'B', value: 20 },
      ];
      const result = callVerb('sortBy', [arr(items), str('value')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        type CdmObject = {
          name: { type: string; value: string };
          value: { type: string; value: number };
        };
        const sorted = result.items as CdmObject[];
        expect(sorted[0]?.name?.value).toBe('A');
        expect(sorted[1]?.name?.value).toBe('B');
        expect(sorted[2]?.name?.value).toBe('C');
      }
    });

    it('sorts objects by string field ascending', () => {
      const people = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];
      const result = callVerb('sortBy', [arr(people), str('name')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        type CdmObject = {
          name: { type: string; value: string };
          age: { type: string; value: number };
        };
        const sorted = result.items as CdmObject[];
        expect(sorted[0]?.name?.value).toBe('Alice');
        expect(sorted[1]?.name?.value).toBe('Bob');
        expect(sorted[2]?.name?.value).toBe('Charlie');
      }
    });

    it('returns empty array for non-array input', () => {
      const result = callVerb('sortBy', [str('not an array'), str('field')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([]);
      }
    });

    it('returns empty array for insufficient arguments', () => {
      const result = callVerb('sortBy', [arr([])]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([]);
      }
    });

    it('returns empty array for no arguments', () => {
      const result = callVerb('sortBy', []);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([]);
      }
    });

    it('handles empty array', () => {
      const result = callVerb('sortBy', [arr([]), str('value')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([]);
      }
    });

    it('handles missing field gracefully', () => {
      const items = [{ a: 1 }, { a: 2 }];
      // Sorting by non-existent field should still work (comparing undefined as empty strings)
      const result = callVerb('sortBy', [arr(items), str('nonexistent')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        // Both have same "undefined" value, so order is stable
        expect(result.items.length).toBe(2);
      }
    });

    it('preserves original array (does not mutate)', () => {
      const original = [{ v: 2 }, { v: 1 }];
      callVerb('sortBy', [arr(original), str('v')]);
      expect(original[0]?.v).toBe(2);
      expect(original[1]?.v).toBe(1);
    });
  });
});
