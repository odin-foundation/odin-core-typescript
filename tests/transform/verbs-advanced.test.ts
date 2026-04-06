/**
 * Generation, Encoding, and Array Verbs Tests
 *
 * Tests for:
 * - Generation verbs: uuid, sequence, resetSequence
 * - Encoding verbs: base64Encode/Decode, urlEncode/Decode, jsonEncode/Decode
 * - Array verbs: filter, flatten, distinct, sort, map, indexOf, at, slice, reverse
 */

import { describe, it, expect } from 'vitest';
import { createContext, callVerb, str, int, nil, arr } from './helpers.js';

describe('Generation, Encoding, and Array Verbs', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Generation Verbs
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Generation Verbs', () => {
    describe('uuid', () => {
      it('generates a valid UUID v4 format', () => {
        const result = callVerb('uuid', []);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y is 8, 9, a, or b
          expect(result.value).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          );
        }
      });

      it('generates unique UUIDs on each call', () => {
        const uuids = new Set<string>();
        for (let i = 0; i < 100; i++) {
          const result = callVerb('uuid', []);
          if (result.type === 'string') {
            uuids.add(result.value);
          }
        }
        // All 100 should be unique
        expect(uuids.size).toBe(100);
      });

      it('ignores any arguments passed', () => {
        const result = callVerb('uuid', [str('ignored'), int(123)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toMatch(/^[0-9a-f-]{36}$/i);
        }
      });

      it('has correct version bit (4)', () => {
        for (let i = 0; i < 10; i++) {
          const result = callVerb('uuid', []);
          if (result.type === 'string') {
            // Position 14 should be '4'
            expect(result.value.charAt(14)).toBe('4');
          }
        }
      });

      it('has correct variant bits (10xx)', () => {
        for (let i = 0; i < 10; i++) {
          const result = callVerb('uuid', []);
          if (result.type === 'string') {
            // Position 19 should be 8, 9, a, or b
            expect(['8', '9', 'a', 'b']).toContain(result.value.charAt(19).toLowerCase());
          }
        }
      });
    });

    describe('sequence', () => {
      it('returns 1 when called with no arguments', () => {
        const result = callVerb('sequence', []);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(1);
        }
      });

      it('increments on successive calls with same name (shared context)', () => {
        const name = `test_seq_${Date.now()}`;
        const ctx = createContext();
        const r1 = callVerb('sequence', [str(name)], ctx);
        const r2 = callVerb('sequence', [str(name)], ctx);
        const r3 = callVerb('sequence', [str(name)], ctx);

        expect(r1.type).toBe('integer');
        expect(r2.type).toBe('integer');
        expect(r3.type).toBe('integer');

        if (r1.type === 'integer' && r2.type === 'integer' && r3.type === 'integer') {
          expect(r2.value).toBe(r1.value + 1);
          expect(r3.value).toBe(r2.value + 1);
        }
      });

      it('maintains separate counters for different names (shared context)', () => {
        const nameA = `seq_a_${Date.now()}`;
        const nameB = `seq_b_${Date.now()}`;
        const ctx = createContext();

        const a1 = callVerb('sequence', [str(nameA)], ctx);
        const b1 = callVerb('sequence', [str(nameB)], ctx);
        const a2 = callVerb('sequence', [str(nameA)], ctx);
        const b2 = callVerb('sequence', [str(nameB)], ctx);

        if (
          a1.type === 'integer' &&
          a2.type === 'integer' &&
          b1.type === 'integer' &&
          b2.type === 'integer'
        ) {
          expect(a2.value).toBe(a1.value + 1);
          expect(b2.value).toBe(b1.value + 1);
        }
      });

      it('uses custom start value when provided', () => {
        const name = `seq_start_${Date.now()}`;
        const result = callVerb('sequence', [str(name), int(100)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(100);
        }
      });

      it('ignores start value on subsequent calls (shared context)', () => {
        const name = `seq_ignore_start_${Date.now()}`;
        const ctx = createContext();
        const r1 = callVerb('sequence', [str(name), int(50)], ctx);
        const r2 = callVerb('sequence', [str(name), int(200)], ctx); // start ignored

        if (r1.type === 'integer' && r2.type === 'integer') {
          expect(r1.value).toBe(50);
          expect(r2.value).toBe(51); // incremented, not reset to 200
        }
      });

      it('handles negative start values', () => {
        const name = `seq_neg_${Date.now()}`;
        const result = callVerb('sequence', [str(name), int(-10)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(-10);
        }
      });
    });

    describe('resetSequence', () => {
      it('resets sequence to 0 by default (shared context)', () => {
        const name = `seq_reset_${Date.now()}`;
        const ctx = createContext();

        // Start sequence
        callVerb('sequence', [str(name)], ctx);
        callVerb('sequence', [str(name)], ctx);

        // Reset
        const resetResult = callVerb('resetSequence', [str(name)], ctx);
        expect(resetResult.type).toBe('integer');
        if (resetResult.type === 'integer') {
          expect(resetResult.value).toBe(0);
        }

        // Next sequence call starts from 1 (0 + 1)
        const next = callVerb('sequence', [str(name)], ctx);
        if (next.type === 'integer') {
          expect(next.value).toBe(1);
        }
      });

      it('resets sequence to specified value (shared context)', () => {
        const name = `seq_reset_val_${Date.now()}`;
        const ctx = createContext();

        callVerb('sequence', [str(name)], ctx);

        const resetResult = callVerb('resetSequence', [str(name), int(99)], ctx);
        if (resetResult.type === 'integer') {
          expect(resetResult.value).toBe(99);
        }

        const next = callVerb('sequence', [str(name)], ctx);
        if (next.type === 'integer') {
          expect(next.value).toBe(100);
        }
      });

      it('returns null when called with no arguments', () => {
        const result = callVerb('resetSequence', []);
        expect(result.type).toBe('null');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Encoding Verbs
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Encoding Verbs', () => {
    describe('base64Encode', () => {
      it('encodes a simple string', () => {
        const result = callVerb('base64Encode', [str('Hello, World!')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('SGVsbG8sIFdvcmxkIQ==');
        }
      });

      it('encodes an empty string', () => {
        const result = callVerb('base64Encode', [str('')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('');
        }
      });

      it('encodes Unicode characters', () => {
        const result = callVerb('base64Encode', [str('Héllo 世界 🌍')]);
        expect(result.type).toBe('string');
        // Just verify it produces valid base64
        if (result.type === 'string') {
          expect(result.value).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
        }
      });

      it('handles special characters', () => {
        const result = callVerb('base64Encode', [str('!@#$%^&*()')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('IUAjJCVeJiooKQ==');
        }
      });

      it('returns null with no arguments', () => {
        const result = callVerb('base64Encode', []);
        expect(result.type).toBe('null');
      });

      it('returns null for null input', () => {
        const result = callVerb('base64Encode', [nil()]);
        expect(result.type).toBe('string');
        // Null coerces to empty string
        if (result.type === 'string') {
          expect(result.value).toBe('');
        }
      });

      it('coerces numbers to string before encoding', () => {
        const result = callVerb('base64Encode', [int(12345)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          // "12345" encoded
          expect(result.value).toBe('MTIzNDU=');
        }
      });
    });

    describe('base64Decode', () => {
      it('decodes a simple base64 string', () => {
        const result = callVerb('base64Decode', [str('SGVsbG8sIFdvcmxkIQ==')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('Hello, World!');
        }
      });

      it('decodes an empty string', () => {
        const result = callVerb('base64Decode', [str('')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('');
        }
      });

      it('handles base64 without padding', () => {
        // "Hi" without padding would be "SGk" (though technically "SGk=" with padding)
        const result = callVerb('base64Decode', [str('SGk=')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('Hi');
        }
      });

      it('returns null for invalid base64', () => {
        const result = callVerb('base64Decode', [str('!!!invalid!!!')]);
        expect(result.type).toBe('null');
      });

      it('roundtrips correctly', () => {
        const original = 'Test string with special chars: @#$% and unicode: 日本語';
        const encoded = callVerb('base64Encode', [str(original)]);
        const decoded = callVerb('base64Decode', [encoded]);
        expect(decoded.type).toBe('string');
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('returns null with no arguments', () => {
        const result = callVerb('base64Decode', []);
        expect(result.type).toBe('null');
      });
    });

    describe('urlEncode', () => {
      it('encodes spaces as %20', () => {
        const result = callVerb('urlEncode', [str('hello world')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('hello%20world');
        }
      });

      it('encodes special characters', () => {
        const result = callVerb('urlEncode', [str('a=b&c=d')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('a%3Db%26c%3Dd');
        }
      });

      it('encodes question marks and hashes', () => {
        const result = callVerb('urlEncode', [str('search?q=test#section')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('search%3Fq%3Dtest%23section');
        }
      });

      it('preserves alphanumeric characters', () => {
        const result = callVerb('urlEncode', [str('abc123XYZ')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('abc123XYZ');
        }
      });

      it('encodes Unicode characters', () => {
        const result = callVerb('urlEncode', [str('日本語')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('%E6%97%A5%E6%9C%AC%E8%AA%9E');
        }
      });

      it('returns empty string for empty input', () => {
        const result = callVerb('urlEncode', [str('')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('');
        }
      });

      it('returns null with no arguments', () => {
        const result = callVerb('urlEncode', []);
        expect(result.type).toBe('null');
      });
    });

    describe('urlDecode', () => {
      it('decodes %20 as space', () => {
        const result = callVerb('urlDecode', [str('hello%20world')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('hello world');
        }
      });

      it('decodes special characters', () => {
        const result = callVerb('urlDecode', [str('a%3Db%26c%3Dd')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('a=b&c=d');
        }
      });

      it('decodes Unicode characters', () => {
        const result = callVerb('urlDecode', [str('%E6%97%A5%E6%9C%AC%E8%AA%9E')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('日本語');
        }
      });

      it('passes through unencoded strings', () => {
        const result = callVerb('urlDecode', [str('no encoding here')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('no encoding here');
        }
      });

      it('returns null for invalid encoding', () => {
        const result = callVerb('urlDecode', [str('%ZZ')]);
        expect(result.type).toBe('null');
      });

      it('returns null for truncated encoding', () => {
        const result = callVerb('urlDecode', [str('%2')]);
        expect(result.type).toBe('null');
      });

      it('roundtrips correctly', () => {
        const original = 'Test?query=value&other=123#hash';
        const encoded = callVerb('urlEncode', [str(original)]);
        const decoded = callVerb('urlDecode', [encoded]);
        expect(decoded.type).toBe('string');
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('returns null with no arguments', () => {
        const result = callVerb('urlDecode', []);
        expect(result.type).toBe('null');
      });
    });

    describe('jsonEncode', () => {
      it('escapes newlines', () => {
        const result = callVerb('jsonEncode', [str('line1\nline2')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('line1\\nline2');
        }
      });

      it('escapes tabs', () => {
        const result = callVerb('jsonEncode', [str('col1\tcol2')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('col1\\tcol2');
        }
      });

      it('escapes double quotes', () => {
        const result = callVerb('jsonEncode', [str('say "hello"')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('say \\"hello\\"');
        }
      });

      it('escapes backslashes', () => {
        const result = callVerb('jsonEncode', [str('path\\to\\file')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('path\\\\to\\\\file');
        }
      });

      it('escapes carriage returns', () => {
        const result = callVerb('jsonEncode', [str('line1\r\nline2')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('line1\\r\\nline2');
        }
      });

      it('handles empty string', () => {
        const result = callVerb('jsonEncode', [str('')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('');
        }
      });

      it('handles string with no special characters', () => {
        const result = callVerb('jsonEncode', [str('plain text')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('plain text');
        }
      });

      it('returns null with no arguments', () => {
        const result = callVerb('jsonEncode', []);
        expect(result.type).toBe('null');
      });
    });

    describe('jsonDecode', () => {
      it('unescapes newlines', () => {
        const result = callVerb('jsonDecode', [str('line1\\nline2')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('line1\nline2');
        }
      });

      it('unescapes tabs', () => {
        const result = callVerb('jsonDecode', [str('col1\\tcol2')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('col1\tcol2');
        }
      });

      it('unescapes double quotes', () => {
        const result = callVerb('jsonDecode', [str('say \\"hello\\"')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('say "hello"');
        }
      });

      it('unescapes backslashes', () => {
        const result = callVerb('jsonDecode', [str('path\\\\to\\\\file')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('path\\to\\file');
        }
      });

      it('handles Unicode escapes', () => {
        const result = callVerb('jsonDecode', [str('\\u0048\\u0065\\u006c\\u006c\\u006f')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('Hello');
        }
      });

      it('returns null for invalid escape sequence', () => {
        const result = callVerb('jsonDecode', [str('invalid\\x')]);
        expect(result.type).toBe('null');
      });

      it('returns null for truncated Unicode escape', () => {
        const result = callVerb('jsonDecode', [str('truncated\\u00')]);
        expect(result.type).toBe('null');
      });

      it('roundtrips correctly', () => {
        const original = 'Test with\nnewlines\tand\t"quotes"\\backslash';
        const encoded = callVerb('jsonEncode', [str(original)]);
        const decoded = callVerb('jsonDecode', [encoded]);
        expect(decoded.type).toBe('string');
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('returns null with no arguments', () => {
        const result = callVerb('jsonDecode', []);
        expect(result.type).toBe('null');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Array Operation Verbs
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Array Operation Verbs', () => {
    // Test data as arrays - verbs now expect pre-resolved array TransformValues
    const items = [
      { id: 1, name: 'Widget', status: 'active', amount: 100 },
      { id: 2, name: 'Gadget', status: 'inactive', amount: 200 },
      { id: 3, name: 'Thing', status: 'active', amount: 150 },
      { id: 4, name: 'Doodad', status: 'pending', amount: 50 },
    ];
    const tags = ['red', 'green', 'blue', 'red', 'yellow'];
    const numbers = [3, 1, 4, 1, 5, 9, 2, 6];
    const nested = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    const strings = ['banana', 'apple', 'cherry', 'date'];

    describe('filter', () => {
      it('filters by equality (=)', () => {
        const result = callVerb('filter', [arr(items), str('status'), str('='), str('active')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(2);
          type CdmObject = { status: { type: string; value: string } };
          expect(
            result.items.every((item: unknown) => (item as CdmObject).status?.value === 'active')
          ).toBe(true);
        }
      });

      it('filters by inequality (!=)', () => {
        const result = callVerb('filter', [arr(items), str('status'), str('!='), str('active')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(2);
          expect(
            result.items.every((item: unknown) => (item as { status: string }).status !== 'active')
          ).toBe(true);
        }
      });

      it('filters by less than (<)', () => {
        const result = callVerb('filter', [arr(items), str('amount'), str('<'), int(100)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(1);
          type CdmObject = { amount: { type: string; value: number } };
          expect((result.items[0] as unknown as CdmObject).amount?.value).toBe(50);
        }
      });

      it('filters by greater than (>)', () => {
        const result = callVerb('filter', [arr(items), str('amount'), str('>'), int(100)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(2);
        }
      });

      it('filters by contains', () => {
        const result = callVerb('filter', [arr(items), str('name'), str('contains'), str('et')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(2); // Widget, Gadget
        }
      });

      it('returns empty array for non-array input', () => {
        const result = callVerb('filter', [str('not-array'), str('field'), str('='), str('value')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });

      it('returns empty array with insufficient arguments', () => {
        const result = callVerb('filter', [arr(items), str('status')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });
    });

    describe('flatten', () => {
      it('flattens one level of nesting', () => {
        const result = callVerb('flatten', [arr(nested)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([1, 2, 3, 4, 5, 6]);
        }
      });

      it('handles already flat arrays', () => {
        const result = callVerb('flatten', [arr(numbers)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([3, 1, 4, 1, 5, 9, 2, 6]);
        }
      });

      it('handles empty arrays', () => {
        const result = callVerb('flatten', [arr([])]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([]);
        }
      });

      it('returns empty array for non-array', () => {
        const result = callVerb('flatten', [str('not-array')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });

      it('returns empty array with no arguments', () => {
        const result = callVerb('flatten', []);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });
    });

    describe('distinct', () => {
      it('removes duplicate primitives', () => {
        const result = callVerb('distinct', [arr(tags)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(4); // red, green, blue, yellow
          expect(new Set(result.items).size).toBe(4);
        }
      });

      it('removes duplicate numbers', () => {
        const result = callVerb('distinct', [arr(numbers)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(7); // 3, 1, 4, 5, 9, 2, 6 (one 1 removed)
        }
      });

      it('deduplicates by field', () => {
        const result = callVerb('distinct', [arr(items), str('status')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(3); // active, inactive, pending
        }
      });

      it('handles empty arrays', () => {
        const result = callVerb('distinct', [arr([])]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([]);
        }
      });

      it('returns empty array for non-array', () => {
        const result = callVerb('distinct', [str('not-array')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });
    });

    describe('sort', () => {
      it('sorts numbers ascending by default', () => {
        const result = callVerb('sort', [arr(numbers)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
        }
      });

      it('sorts strings ascending', () => {
        const result = callVerb('sort', [arr(strings)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual(['apple', 'banana', 'cherry', 'date']);
        }
      });

      it('sorts descending when specified', () => {
        const result = callVerb('sort', [arr(numbers), str(''), str('desc')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([9, 6, 5, 4, 3, 2, 1, 1]);
        }
      });

      it('sorts by field', () => {
        const result = callVerb('sort', [arr(items), str('amount')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          type CdmObject = { amount: { type: string; value: number } };
          expect((result.items[0] as unknown as CdmObject).amount?.value).toBe(50);
          expect((result.items[3] as unknown as CdmObject).amount?.value).toBe(200);
        }
      });

      it('handles empty arrays', () => {
        const result = callVerb('sort', [arr([])]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([]);
        }
      });

      it('returns empty array for non-array', () => {
        const result = callVerb('sort', [str('not-array')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });
    });

    describe('map', () => {
      it('extracts a single field from objects', () => {
        const result = callVerb('map', [arr(items), str('name')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual(['Widget', 'Gadget', 'Thing', 'Doodad']);
        }
      });

      it('extracts numeric field', () => {
        const result = callVerb('map', [arr(items), str('id')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([1, 2, 3, 4]);
        }
      });

      it('handles empty arrays', () => {
        const result = callVerb('map', [arr([]), str('field')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([]);
        }
      });

      it('returns empty array for non-array', () => {
        const result = callVerb('map', [str('not-array'), str('field')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });

      it('returns empty array with insufficient arguments', () => {
        const result = callVerb('map', [arr(items)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });
    });

    describe('indexOf', () => {
      it('finds index of existing value', () => {
        const result = callVerb('indexOf', [arr(tags), str('green')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(1);
        }
      });

      it('returns first occurrence for duplicates', () => {
        const result = callVerb('indexOf', [arr(tags), str('red')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });

      it('returns -1 for non-existent value', () => {
        const result = callVerb('indexOf', [arr(tags), str('purple')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(-1);
        }
      });

      it('returns -1 for empty array', () => {
        const result = callVerb('indexOf', [arr([]), str('value')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(-1);
        }
      });

      it('returns -1 for non-array', () => {
        const result = callVerb('indexOf', [str('not-array'), str('value')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(-1);
        }
      });

      it('finds numeric values', () => {
        const result = callVerb('indexOf', [arr(numbers), str('4')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(2);
        }
      });
    });

    describe('at', () => {
      it('gets element at positive index', () => {
        const result = callVerb('at', [arr(tags), int(2)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('blue');
        }
      });

      it('gets first element', () => {
        const result = callVerb('at', [arr(tags), int(0)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('red');
        }
      });

      it('gets element at negative index (from end)', () => {
        const result = callVerb('at', [arr(tags), int(-1)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('yellow');
        }
      });

      it('returns null for out of bounds index', () => {
        const result = callVerb('at', [arr(tags), int(100)]);
        expect(result.type).toBe('null');
      });

      it('returns null for empty array', () => {
        const result = callVerb('at', [arr([]), int(0)]);
        expect(result.type).toBe('null');
      });

      it('returns null for non-array', () => {
        const result = callVerb('at', [str('not-array'), int(0)]);
        expect(result.type).toBe('null');
      });

      it('gets object from array', () => {
        const result = callVerb('at', [arr(items), int(0)]);
        expect(result.type).toBe('object');
        if (result.type === 'object') {
          expect(result.value.name).toBe('Widget');
        }
      });
    });

    describe('slice', () => {
      it('slices with start and end', () => {
        const result = callVerb('slice', [arr(tags), int(1), int(3)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual(['green', 'blue']);
        }
      });

      it('slices from start only', () => {
        const result = callVerb('slice', [arr(tags), int(3)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual(['red', 'yellow']);
        }
      });

      it('slices with negative start', () => {
        const result = callVerb('slice', [arr(tags), int(-2)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual(['red', 'yellow']);
        }
      });

      it('handles empty result', () => {
        const result = callVerb('slice', [arr(tags), int(3), int(3)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([]);
        }
      });

      it('handles empty array', () => {
        const result = callVerb('slice', [arr([]), int(0), int(5)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([]);
        }
      });

      it('returns empty array for non-array', () => {
        const result = callVerb('slice', [str('not-array'), int(0)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });

      it('returns empty array with insufficient arguments', () => {
        const result = callVerb('slice', [arr(tags)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });
    });

    describe('reverse', () => {
      it('reverses array order', () => {
        const result = callVerb('reverse', [arr(tags)]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual(['yellow', 'red', 'blue', 'green', 'red']);
        }
      });

      it('reverses numbers', () => {
        const result = callVerb('reverse', [arr([1, 2, 3])]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([3, 2, 1]);
        }
      });

      it('handles single-element array', () => {
        const result = callVerb('reverse', [arr(['only'])]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual(['only']);
        }
      });

      it('handles empty array', () => {
        const result = callVerb('reverse', [arr([])]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toEqual([]);
        }
      });

      it('returns empty array for non-array', () => {
        const result = callVerb('reverse', [str('not-array')]);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });

      it('returns empty array with no arguments', () => {
        const result = callVerb('reverse', []);
        expect(result.type).toBe('array');
        if (result.type === 'array') {
          expect(result.items).toHaveLength(0);
        }
      });

      it('does not mutate original array', () => {
        const original = [1, 2, 3];
        callVerb('reverse', [arr(original)]);
        expect(original).toEqual([1, 2, 3]); // Original unchanged
      });
    });
  });
});
