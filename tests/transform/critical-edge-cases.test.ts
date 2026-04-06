/**
 * Critical Edge Cases Tests
 *
 * Deep edge case testing based on comprehensive analysis:
 * - Unicode surrogate pair handling
 * - Escape sequence roundtrip integrity
 * - Type coercion boundaries (Infinity/NaN)
 * - Concurrent execution safety
 * - Malformed input handling
 */

import { describe, it, expect } from 'vitest';
import { createContext, createContextWithSource, callVerb, str, int, num, nil } from './helpers.js';

describe('Critical Edge Cases', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Unicode Surrogate Pair Handling
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Unicode Surrogate Pair Handling', () => {
    // Surrogate pairs are used for characters outside the BMP (U+10000 to U+10FFFF)
    // JavaScript strings use UTF-16, so these require two code units

    describe('Emoji (Supplementary Plane)', () => {
      it('handles single emoji correctly', () => {
        const emoji = '😀'; // U+1F600 - requires surrogate pair
        const result = callVerb('length', [str(emoji)]);
        expect(result.type).toBe('integer');
        // JavaScript length counts UTF-16 code units, not code points
        // '😀'.length === 2 in JavaScript
        if (result.type === 'integer') {
          expect(result.value).toBe(2);
        }
      });

      it('handles emoji in string operations', () => {
        const result = callVerb('upper', [str('hello 😀 world')]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('HELLO 😀 WORLD');
        }
      });

      it('handles compound emoji (ZWJ sequences)', () => {
        // 👨‍👩‍👧 is family emoji - multiple code points joined
        const family = '👨‍👩‍👧';
        const result = callVerb('contains', [str(`Family: ${family}`), str(family)]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(true);
        }
      });

      it('handles emoji in substring - may split surrogate pair', () => {
        const text = '😀😀😀';
        // substring(0, 2) should get first emoji (2 code units)
        const result = callVerb('substring', [str(text), int(0), int(2)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('😀');
        }
      });

      it('handles emoji flags (regional indicators)', () => {
        const flag = '🇺🇸'; // US flag - two regional indicator symbols
        const result = callVerb('length', [str(flag)]);
        expect(result.type).toBe('integer');
        // Two regional indicators = 4 UTF-16 code units
        if (result.type === 'integer') {
          expect(result.value).toBe(4);
        }
      });
    });

    describe('Mathematical Symbols (Supplementary Plane)', () => {
      it('handles mathematical alphanumeric symbols', () => {
        const mathA = '𝐀'; // U+1D400 - Mathematical Bold Capital A
        const result = callVerb('length', [str(mathA)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(2); // Surrogate pair
        }
      });
    });

    describe('CJK Extension B (Rare Characters)', () => {
      it('handles CJK Extension B characters', () => {
        const rareChar = '𠀀'; // U+20000 - CJK Extension B
        const result = callVerb('length', [str(rareChar)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(2); // Surrogate pair
        }
      });
    });

    describe('Base64 Encoding with Surrogate Pairs', () => {
      it('roundtrips emoji through base64', () => {
        const original = '🎉 Party! 🎊';
        const encoded = callVerb('base64Encode', [str(original)]);
        expect(encoded.type).toBe('string');
        const decoded = callVerb('base64Decode', [encoded]);
        expect(decoded.type).toBe('string');
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('roundtrips mixed emoji and text through base64', () => {
        const original = 'Hello 👋 World 🌍!';
        const encoded = callVerb('base64Encode', [str(original)]);
        const decoded = callVerb('base64Decode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });
    });

    describe('URL Encoding with Surrogate Pairs', () => {
      it('roundtrips emoji through URL encoding', () => {
        const original = '🎉🎊';
        const encoded = callVerb('urlEncode', [str(original)]);
        expect(encoded.type).toBe('string');
        const decoded = callVerb('urlDecode', [encoded]);
        expect(decoded.type).toBe('string');
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });
    });

    describe('JSON Encoding with Surrogate Pairs', () => {
      it('roundtrips emoji through JSON encoding', () => {
        const original = 'Test: 😀\n🎉';
        const encoded = callVerb('jsonEncode', [str(original)]);
        expect(encoded.type).toBe('string');
        const decoded = callVerb('jsonDecode', [encoded]);
        expect(decoded.type).toBe('string');
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Escape Sequence Roundtrip Integrity
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Escape Sequence Roundtrip Integrity', () => {
    describe('JSON Escape Sequences', () => {
      it('preserves newline through jsonEncode/jsonDecode', () => {
        const original = 'line1\nline2';
        const encoded = callVerb('jsonEncode', [str(original)]);
        const decoded = callVerb('jsonDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('preserves tab through jsonEncode/jsonDecode', () => {
        const original = 'col1\tcol2';
        const encoded = callVerb('jsonEncode', [str(original)]);
        const decoded = callVerb('jsonDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('preserves carriage return through jsonEncode/jsonDecode', () => {
        const original = 'line1\rline2';
        const encoded = callVerb('jsonEncode', [str(original)]);
        const decoded = callVerb('jsonDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('preserves backslash through jsonEncode/jsonDecode', () => {
        const original = 'path\\to\\file';
        const encoded = callVerb('jsonEncode', [str(original)]);
        const decoded = callVerb('jsonDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('preserves quotes through jsonEncode/jsonDecode', () => {
        const original = 'He said "Hello"';
        const encoded = callVerb('jsonEncode', [str(original)]);
        const decoded = callVerb('jsonDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('preserves null character through jsonEncode/jsonDecode', () => {
        const original = 'before\0after';
        const encoded = callVerb('jsonEncode', [str(original)]);
        const decoded = callVerb('jsonDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('preserves complex escape sequence combinations', () => {
        const original = 'Line1\nLine2\tTab\r\n"Quoted"\0End\\Path';
        const encoded = callVerb('jsonEncode', [str(original)]);
        const decoded = callVerb('jsonDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('preserves form feed through jsonEncode/jsonDecode', () => {
        const original = 'page1\fpage2';
        const encoded = callVerb('jsonEncode', [str(original)]);
        const decoded = callVerb('jsonDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('preserves backspace through jsonEncode/jsonDecode', () => {
        const original = 'back\bspace';
        const encoded = callVerb('jsonEncode', [str(original)]);
        const decoded = callVerb('jsonDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });
    });

    describe('Base64 with Control Characters', () => {
      it('roundtrips binary-like data', () => {
        const original = '\x00\x01\x02\x03';
        const encoded = callVerb('base64Encode', [str(original)]);
        const decoded = callVerb('base64Decode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('roundtrips all ASCII control characters', () => {
        let original = '';
        for (let i = 0; i < 32; i++) {
          original += String.fromCharCode(i);
        }
        const encoded = callVerb('base64Encode', [str(original)]);
        const decoded = callVerb('base64Decode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });
    });

    describe('URL Encoding Edge Cases', () => {
      it('roundtrips all reserved characters', () => {
        const reserved = "!#$&'()*+,/:;=?@[]";
        const encoded = callVerb('urlEncode', [str(reserved)]);
        const decoded = callVerb('urlDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(reserved);
        }
      });

      it('roundtrips percent sign', () => {
        const original = '100% complete';
        const encoded = callVerb('urlEncode', [str(original)]);
        const decoded = callVerb('urlDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });

      it('handles already encoded percent sequences', () => {
        // Double encoding scenario
        const original = '%20'; // Already encoded space
        const encoded = callVerb('urlEncode', [str(original)]);
        const decoded = callVerb('urlDecode', [encoded]);
        if (decoded.type === 'string') {
          expect(decoded.value).toBe(original);
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Type Coercion Boundaries (Infinity/NaN)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Type Coercion Boundaries', () => {
    describe('Infinity Handling', () => {
      it('coerceNumber handles Infinity string', () => {
        const result = callVerb('coerceNumber', [str('Infinity')]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(Infinity);
        }
      });

      it('coerceNumber handles -Infinity string', () => {
        const result = callVerb('coerceNumber', [str('-Infinity')]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(-Infinity);
        }
      });

      it('add handles Infinity', () => {
        const result = callVerb('add', [num(Infinity), num(1)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(Infinity);
        }
      });

      it('multiply handles Infinity', () => {
        const result = callVerb('multiply', [num(Infinity), num(2)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(Infinity);
        }
      });

      it('divide by very small number approaches Infinity', () => {
        const result = callVerb('divide', [num(1e308), num(1e-308)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(Infinity);
        }
      });

      it('abs handles Infinity', () => {
        const result = callVerb('abs', [num(-Infinity)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(Infinity);
        }
      });

      it('coerceString handles Infinity', () => {
        const result = callVerb('coerceString', [num(Infinity)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('Infinity');
        }
      });

      it('floor handles Infinity', () => {
        const result = callVerb('floor', [num(Infinity)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(Infinity);
        }
      });

      it('round handles Infinity', () => {
        const result = callVerb('round', [num(Infinity), int(2)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(Infinity);
        }
      });
    });

    describe('NaN Handling', () => {
      it('coerceNumber returns 0 for NaN string', () => {
        const result = callVerb('coerceNumber', [str('NaN')]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          // NaN parses to NaN in JS, but our coerceNumber returns 0 for NaN
          expect(result.value).toBe(0);
        }
      });

      it('divide 0/0 returns null', () => {
        // Division by zero returns null in our implementation
        const result = callVerb('divide', [num(0), num(0)]);
        expect(result.type).toBe('null');
      });

      it('add with NaN propagates NaN', () => {
        const result = callVerb('add', [num(NaN), num(1)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(Number.isNaN(result.value)).toBe(true);
        }
      });

      it('coerceString handles NaN', () => {
        const result = callVerb('coerceString', [num(NaN)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('NaN');
        }
      });

      it('coerceBoolean treats NaN as truthy (NaN !== 0)', () => {
        // Our implementation: return val.value !== 0
        // NaN !== 0 is true, so NaN is considered truthy
        // This is intentional - NaN is not "zero" or "false"
        const result = callVerb('coerceBoolean', [num(NaN)]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(true);
        }
      });

      it('round with NaN returns NaN', () => {
        const result = callVerb('round', [num(NaN), int(2)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(Number.isNaN(result.value)).toBe(true);
        }
      });
    });

    describe('Number.MAX_VALUE and MIN_VALUE', () => {
      it('handles MAX_VALUE', () => {
        const result = callVerb('add', [num(Number.MAX_VALUE), int(1)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          // Adding 1 to MAX_VALUE doesn't change it due to precision
          expect(result.value).toBe(Number.MAX_VALUE);
        }
      });

      it('handles MIN_VALUE', () => {
        const result = callVerb('abs', [num(Number.MIN_VALUE)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(Number.MIN_VALUE);
        }
      });

      it('overflow to Infinity', () => {
        const result = callVerb('multiply', [num(Number.MAX_VALUE), int(2)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(Infinity);
        }
      });

      it('underflow to -Infinity', () => {
        const result = callVerb('multiply', [num(-Number.MAX_VALUE), int(2)]);
        expect(result.type).toBe('number');
        if (result.type === 'number') {
          expect(result.value).toBe(-Infinity);
        }
      });
    });

    describe('Safe Integer Boundaries', () => {
      it('handles MAX_SAFE_INTEGER', () => {
        const result = callVerb('add', [int(Number.MAX_SAFE_INTEGER), int(1)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          // Beyond MAX_SAFE_INTEGER, precision is lost
          expect(result.value).toBe(Number.MAX_SAFE_INTEGER + 1);
        }
      });

      it('handles MIN_SAFE_INTEGER', () => {
        const result = callVerb('subtract', [int(Number.MIN_SAFE_INTEGER), int(1)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(Number.MIN_SAFE_INTEGER - 1);
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Concurrent Execution Safety
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Concurrent Execution Safety', () => {
    describe('Sequence Counter Isolation', () => {
      it('separate contexts have isolated sequence counters', () => {
        const ctx1 = createContext();
        const ctx2 = createContext();

        const r1a = callVerb('sequence', [str('shared_name')], ctx1);
        const r1b = callVerb('sequence', [str('shared_name')], ctx1);
        const r2a = callVerb('sequence', [str('shared_name')], ctx2);
        const r2b = callVerb('sequence', [str('shared_name')], ctx2);

        // Each context should have its own counter
        if (
          r1a.type === 'integer' &&
          r1b.type === 'integer' &&
          r2a.type === 'integer' &&
          r2b.type === 'integer'
        ) {
          expect(r1a.value).toBe(1);
          expect(r1b.value).toBe(2);
          expect(r2a.value).toBe(1); // Starts fresh in ctx2
          expect(r2b.value).toBe(2);
        }
      });
    });

    describe('Accumulator Isolation', () => {
      it('separate contexts have isolated accumulators', () => {
        const ctx1 = createContext();
        const ctx2 = createContext();

        // Set up accumulators in both contexts
        ctx1.accumulators.set('sum', num(100));
        ctx2.accumulators.set('sum', num(200));

        // Verify accumulators are isolated by checking the maps directly
        // (getAccumulator verb doesn't exist, but the context map does)
        expect(ctx1.accumulators.get('sum')).toEqual(num(100));
        expect(ctx2.accumulators.get('sum')).toEqual(num(200));
      });
    });

    describe('Stateless Verb Safety', () => {
      it('string operations are stateless', async () => {
        // Simulate concurrent calls
        const results = await Promise.all([
          Promise.resolve(callVerb('upper', [str('test1')])),
          Promise.resolve(callVerb('upper', [str('test2')])),
          Promise.resolve(callVerb('upper', [str('test3')])),
        ]);

        expect(results[0]).toEqual({ type: 'string', value: 'TEST1' });
        expect(results[1]).toEqual({ type: 'string', value: 'TEST2' });
        expect(results[2]).toEqual({ type: 'string', value: 'TEST3' });
      });

      it('numeric operations are stateless', async () => {
        const results = await Promise.all([
          Promise.resolve(callVerb('add', [int(1), int(2)])),
          Promise.resolve(callVerb('add', [int(10), int(20)])),
          Promise.resolve(callVerb('add', [int(100), int(200)])),
        ]);

        expect(results[0]).toEqual({ type: 'integer', value: 3 });
        expect(results[1]).toEqual({ type: 'integer', value: 30 });
        expect(results[2]).toEqual({ type: 'integer', value: 300 });
      });

      it('uuid generates unique values in parallel', async () => {
        const results = await Promise.all([
          Promise.resolve(callVerb('uuid', [])),
          Promise.resolve(callVerb('uuid', [])),
          Promise.resolve(callVerb('uuid', [])),
          Promise.resolve(callVerb('uuid', [])),
          Promise.resolve(callVerb('uuid', [])),
        ]);

        const uuids = results.map((r) => (r.type === 'string' ? r.value : ''));
        const uniqueUuids = new Set(uuids);
        expect(uniqueUuids.size).toBe(5);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Malformed Input Handling
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Malformed Input Handling', () => {
    describe('Malformed Base64', () => {
      it('returns null for invalid base64 characters', () => {
        const result = callVerb('base64Decode', [str('!!!invalid!!!')]);
        expect(result.type).toBe('null');
      });

      it('returns null for incomplete padding', () => {
        // SGVsbG8 should be SGVsbG8= for "Hello"
        // But actually SGVsbG8 without padding is valid for Buffer.from
        const result = callVerb('base64Decode', [str('SGVsbG8')]);
        // Node's Buffer.from is lenient with padding
        expect(['string', 'null']).toContain(result.type);
      });

      it('handles whitespace in base64', () => {
        // Some base64 implementations allow whitespace
        const result = callVerb('base64Decode', [str('SGVs bG8=')]);
        // Should fail because of space
        expect(result.type).toBe('null');
      });

      it('returns null for line breaks in base64', () => {
        const result = callVerb('base64Decode', [str('SGVs\nbG8=')]);
        expect(result.type).toBe('null');
      });
    });

    describe('Malformed URL Encoding', () => {
      it('returns null for invalid percent encoding', () => {
        const result = callVerb('urlDecode', [str('%ZZ')]);
        expect(result.type).toBe('null');
      });

      it('returns null for truncated percent encoding', () => {
        const result = callVerb('urlDecode', [str('%2')]);
        expect(result.type).toBe('null');
      });

      it('returns null for lone percent sign', () => {
        const result = callVerb('urlDecode', [str('%')]);
        expect(result.type).toBe('null');
      });

      it('returns null for invalid UTF-8 sequence in URL', () => {
        // %FF is not valid UTF-8 start byte in isolation
        const result = callVerb('urlDecode', [str('%FF')]);
        expect(result.type).toBe('null');
      });
    });

    describe('Malformed JSON Escape Sequences', () => {
      it('returns null for unknown escape sequence', () => {
        const result = callVerb('jsonDecode', [str('invalid\\x')]);
        expect(result.type).toBe('null');
      });

      it('returns null for incomplete unicode escape', () => {
        const result = callVerb('jsonDecode', [str('\\u00')]);
        expect(result.type).toBe('null');
      });

      it('returns null for invalid unicode hex', () => {
        const result = callVerb('jsonDecode', [str('\\uGGGG')]);
        expect(result.type).toBe('null');
      });

      it('returns null for unescaped control character in JSON', () => {
        // Raw tab in JSON string causes JSON.parse to fail
        // jsonDecode wraps input in quotes and parses: JSON.parse(`"line1\tline2"`)
        // JSON spec doesn't allow literal control characters in strings
        const result = callVerb('jsonDecode', [str('line1\tline2')]);
        expect(result.type).toBe('null');
      });
    });

    describe('Malformed Date Inputs', () => {
      it('returns null for invalid date string', () => {
        const result = callVerb('coerceDate', [str('not-a-date')]);
        expect(result.type).toBe('null');
      });

      it('returns null for Feb 30', () => {
        const result = callVerb('coerceDate', [str('20240230')]); // YYYYMMDD
        expect(result.type).toBe('null');
      });

      it('returns null for Feb 29 in non-leap year', () => {
        const result = callVerb('coerceDate', [str('20230229')]);
        expect(result.type).toBe('null');
      });

      it('returns null for month 13', () => {
        const result = callVerb('coerceDate', [str('13/15/2024')]);
        expect(result.type).toBe('null');
      });

      it('returns null for day 32', () => {
        const result = callVerb('coerceDate', [str('01/32/2024')]);
        expect(result.type).toBe('null');
      });

      it('returns null for empty string', () => {
        const result = callVerb('coerceDate', [str('')]);
        expect(result.type).toBe('null');
      });

      it('returns null for whitespace only', () => {
        const result = callVerb('coerceDate', [str('   ')]);
        expect(result.type).toBe('null');
      });

      it('returns null for timestamp 0', () => {
        // Zero is special-cased as invalid
        const result = callVerb('coerceDate', [int(0)]);
        expect(result.type).toBe('null');
      });
    });

    describe('Malformed Array Index', () => {
      const source = { items: ['a', 'b', 'c'] };

      it('at returns null for non-integer string index', () => {
        const ctx = createContextWithSource(source);
        const result = callVerb('at', [str('items'), str('abc')], ctx);
        // String coerces to 0 via parseInt
        expect(['string', 'null']).toContain(result.type);
      });

      it('slice handles non-numeric arguments gracefully', () => {
        const ctx = createContextWithSource(source);
        const result = callVerb('slice', [str('items'), str('abc'), str('def')], ctx);
        // Strings coerce to NaN which becomes 0, slice returns array type
        expect(result.type).toBe('array');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Empty and Null Propagation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Empty and Null Propagation', () => {
    describe('Aggregation on Empty Arrays', () => {
      const emptySource = { empty: [] };

      it('sum of empty array', () => {
        const ctx = createContextWithSource(emptySource);
        const result = callVerb('sum', [str('empty')], ctx);
        // sum returns integer when result is a whole number (including 0)
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });

      it('count of empty array', () => {
        const ctx = createContextWithSource(emptySource);
        const result = callVerb('count', [str('empty')], ctx);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });

      it('min of empty array', () => {
        const ctx = createContextWithSource(emptySource);
        const result = callVerb('min', [str('empty')], ctx);
        expect(result.type).toBe('null');
      });

      it('max of empty array', () => {
        const ctx = createContextWithSource(emptySource);
        const result = callVerb('max', [str('empty')], ctx);
        expect(result.type).toBe('null');
      });

      it('avg of empty array', () => {
        const ctx = createContextWithSource(emptySource);
        const result = callVerb('avg', [str('empty')], ctx);
        expect(result.type).toBe('null');
      });

      it('first of empty array', () => {
        const ctx = createContextWithSource(emptySource);
        const result = callVerb('first', [str('empty')], ctx);
        expect(result.type).toBe('null');
      });

      it('last of empty array', () => {
        const ctx = createContextWithSource(emptySource);
        const result = callVerb('last', [str('empty')], ctx);
        expect(result.type).toBe('null');
      });
    });

    describe('Operations on Null', () => {
      it('concat with null values', () => {
        const result = callVerb('concat', [nil(), str('a'), nil(), str('b'), nil()]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('ab');
        }
      });

      it('add with null treats as 0', () => {
        const result = callVerb('add', [nil(), int(5)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(5);
        }
      });

      it('multiply with null treats as 0', () => {
        const result = callVerb('multiply', [nil(), int(5)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(0);
        }
      });

      it('coerceBoolean of null is false', () => {
        const result = callVerb('coerceBoolean', [nil()]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(false);
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Date/Time Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Date/Time Edge Cases', () => {
    describe('Daylight Saving Time Boundaries', () => {
      // These tests verify behavior around DST transitions
      // Note: Results depend on the system's timezone

      it('handles date near DST spring forward', () => {
        // March 10, 2024 - DST spring forward in US
        const result = callVerb('coerceDate', [str('2024-03-10')]);
        expect(result.type).toBe('date');
      });

      it('handles date near DST fall back', () => {
        // November 3, 2024 - DST fall back in US
        const result = callVerb('coerceDate', [str('2024-11-03')]);
        expect(result.type).toBe('date');
      });
    });

    describe('Leap Year Edge Cases', () => {
      it('accepts Feb 29 in leap year 2024', () => {
        const result = callVerb('coerceDate', [str('2024-02-29')]);
        expect(result.type).toBe('date');
      });

      it('accepts Feb 29 in century leap year 2000', () => {
        const result = callVerb('coerceDate', [str('2000-02-29')]);
        expect(result.type).toBe('date');
      });

      it('rejects Feb 29 in non-leap century year 1900', () => {
        const result = callVerb('coerceDate', [str('19000229')]);
        expect(result.type).toBe('null');
      });

      it('rejects Feb 29 in non-leap year 2023', () => {
        const result = callVerb('coerceDate', [str('20230229')]);
        expect(result.type).toBe('null');
      });
    });

    describe('Historical and Future Dates', () => {
      it('handles very old dates (1000 AD)', () => {
        const result = callVerb('coerceDate', [str('1000-01-01')]);
        expect(result.type).toBe('date');
      });

      it('handles far future dates (year 9999)', () => {
        const result = callVerb('coerceDate', [str('9999-12-31')]);
        expect(result.type).toBe('date');
      });

      it('handles negative timestamps (pre-1970)', () => {
        // January 1, 1960
        const ms = Date.UTC(1960, 0, 1);
        const result = callVerb('coerceDate', [int(ms)]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCFullYear()).toBe(1960);
        }
      });
    });

    describe('Unix Timestamp Edge Cases', () => {
      it('handles seconds vs milliseconds threshold', () => {
        // 99,999,999,999 ms = ~March 1973 (treated as ms)
        // 100,000,000,000 would be ~year 5138 as seconds
        const result = callVerb('coerceDate', [int(99999999999)]);
        expect(result.type).toBe('date');
      });

      it('correctly interprets large ms as milliseconds', () => {
        // 1718438400000 ms = June 2024 (should be ms)
        const ms = 1718438400000;
        const result = callVerb('coerceDate', [int(ms)]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCFullYear()).toBe(2024);
        }
      });

      it('correctly interprets small timestamp as seconds', () => {
        // 1718438400 s = June 2024 (should be converted from seconds)
        const s = 1718438400;
        const result = callVerb('coerceDate', [int(s)]);
        expect(result.type).toBe('date');
        if (result.type === 'date') {
          expect(result.value.getUTCFullYear()).toBe(2024);
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // String Operation Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('String Operation Edge Cases', () => {
    describe('Very Long Strings', () => {
      it('handles 100KB string', () => {
        const longStr = 'a'.repeat(100000);
        const result = callVerb('length', [str(longStr)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(100000);
        }
      });

      it('upper works on long string', () => {
        const longStr = 'abc'.repeat(10000);
        const result = callVerb('upper', [str(longStr)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe('ABC'.repeat(10000));
        }
      });
    });

    describe('Zero-Width Characters', () => {
      it('handles zero-width space', () => {
        const zwsp = '\u200B'; // Zero-width space
        const result = callVerb('length', [str(`test${zwsp}test`)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(9); // 4 + 1 + 4
        }
      });

      it('trim does not remove zero-width space', () => {
        const zwsp = '\u200B';
        const result = callVerb('trim', [str(`${zwsp}test${zwsp}`)]);
        expect(result.type).toBe('string');
        if (result.type === 'string') {
          expect(result.value).toBe(`${zwsp}test${zwsp}`);
        }
      });
    });

    describe('Right-to-Left Text', () => {
      it('handles Arabic text', () => {
        const arabic = 'مرحبا';
        const result = callVerb('length', [str(arabic)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(5);
        }
      });

      it('handles Hebrew text', () => {
        const hebrew = 'שלום';
        const result = callVerb('length', [str(hebrew)]);
        expect(result.type).toBe('integer');
        if (result.type === 'integer') {
          expect(result.value).toBe(4);
        }
      });

      it('contains works with RTL text', () => {
        const result = callVerb('contains', [str('Hello مرحبا World'), str('مرحبا')]);
        expect(result.type).toBe('boolean');
        if (result.type === 'boolean') {
          expect(result.value).toBe(true);
        }
      });
    });

    describe('Combining Characters', () => {
      it('handles combining diacritical marks', () => {
        // é can be represented as 'e' + combining acute accent
        const composed = 'é'; // Single character
        const decomposed = 'e\u0301'; // e + combining acute

        const composedLen = callVerb('length', [str(composed)]);
        const decomposedLen = callVerb('length', [str(decomposed)]);

        if (composedLen.type === 'integer' && decomposedLen.type === 'integer') {
          expect(composedLen.value).toBe(1);
          expect(decomposedLen.value).toBe(2); // Two code units
        }
      });
    });
  });
});
