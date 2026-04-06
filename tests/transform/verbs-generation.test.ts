/**
 * Tests for ODIN Transform Generation Verbs.
 * Covers uuid, sequence, resetSequence with edge cases and unhappy paths.
 */

import { describe, it, expect } from 'vitest';
import { createContext, callVerb, str, int, nil, num } from './helpers.js';

describe('Generation Verbs', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // UUID Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('uuid', () => {
    it('generates a valid UUID v4 format', () => {
      const result = callVerb('uuid', []);

      expect(result.type).toBe('string');
      if (result.type === 'string') {
        // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        expect(result.value).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      }
    });

    it('generates unique UUIDs', () => {
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

    it('generates UUID with correct version bit (4)', () => {
      const result = callVerb('uuid', []);
      if (result.type === 'string') {
        // Character at position 14 should be '4' (version 4)
        expect(result.value.charAt(14)).toBe('4');
      }
    });

    it('generates UUID with correct variant bits', () => {
      const result = callVerb('uuid', []);
      if (result.type === 'string') {
        // Character at position 19 should be 8, 9, a, or b (variant bits)
        expect(['8', '9', 'a', 'b']).toContain(result.value.charAt(19).toLowerCase());
      }
    });

    it('generates deterministic UUID from seed', () => {
      const result1 = callVerb('uuid', [str('test-seed')]);
      const result2 = callVerb('uuid', [str('test-seed')]);
      const result3 = callVerb('uuid', [str('different-seed')]);

      expect(result1.type).toBe('string');
      expect(result2.type).toBe('string');
      expect(result3.type).toBe('string');

      if (result1.type === 'string' && result2.type === 'string' && result3.type === 'string') {
        // Same seed produces same UUID
        expect(result1.value).toBe(result2.value);
        // Different seed produces different UUID
        expect(result1.value).not.toBe(result3.value);
        // Version 5 for seeded UUID
        expect(result1.value.charAt(14)).toBe('5');
        // Proper format
        expect(result1.value).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      }
    });

    it('generates random UUID when seed is empty', () => {
      const result = callVerb('uuid', [str('')]);

      expect(result.type).toBe('string');
      if (result.type === 'string') {
        // Version 4 for random UUID
        expect(result.value).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      }
    });

    it('generates lowercase hex', () => {
      const result = callVerb('uuid', []);
      if (result.type === 'string') {
        expect(result.value).toBe(result.value.toLowerCase());
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Sequence Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('sequence', () => {
    it('returns 1 with no arguments', () => {
      const result = callVerb('sequence', []);
      expect(result).toEqual(int(1));
    });

    it('creates named sequence starting at 1', () => {
      const ctx = createContext();
      const r1 = callVerb('sequence', [str('myseq')], ctx);
      const r2 = callVerb('sequence', [str('myseq')], ctx);
      const r3 = callVerb('sequence', [str('myseq')], ctx);

      expect(r1).toEqual(int(1));
      expect(r2).toEqual(int(2));
      expect(r3).toEqual(int(3));
    });

    it('creates named sequence with custom start value', () => {
      const ctx = createContext();
      const r1 = callVerb('sequence', [str('custom'), int(100)], ctx);
      const r2 = callVerb('sequence', [str('custom')], ctx);
      const r3 = callVerb('sequence', [str('custom')], ctx);

      expect(r1).toEqual(int(100));
      expect(r2).toEqual(int(101));
      expect(r3).toEqual(int(102));
    });

    it('maintains separate sequences by name', () => {
      const ctx = createContext();

      callVerb('sequence', [str('seq1')], ctx);
      callVerb('sequence', [str('seq1')], ctx);
      const seq1 = callVerb('sequence', [str('seq1')], ctx);

      const seq2 = callVerb('sequence', [str('seq2')], ctx);

      expect(seq1).toEqual(int(3));
      expect(seq2).toEqual(int(1));
    });

    it('handles empty string as sequence name', () => {
      const ctx = createContext();
      const r1 = callVerb('sequence', [str('')], ctx);
      const r2 = callVerb('sequence', [str('')], ctx);

      expect(r1).toEqual(int(1));
      expect(r2).toEqual(int(2));
    });

    it('handles very long sequence names', () => {
      const ctx = createContext();
      const longName = 'x'.repeat(1000);
      const result = callVerb('sequence', [str(longName)], ctx);

      expect(result).toEqual(int(1));
    });

    it('handles unicode sequence names', () => {
      const ctx = createContext();
      const r1 = callVerb('sequence', [str('序列')], ctx);
      const r2 = callVerb('sequence', [str('序列')], ctx);

      expect(r1).toEqual(int(1));
      expect(r2).toEqual(int(2));
    });

    it('handles negative start value', () => {
      const ctx = createContext();
      const r1 = callVerb('sequence', [str('neg'), int(-10)], ctx);
      const r2 = callVerb('sequence', [str('neg')], ctx);

      expect(r1).toEqual(int(-10));
      expect(r2).toEqual(int(-9));
    });

    it('handles zero start value', () => {
      const ctx = createContext();
      const r1 = callVerb('sequence', [str('zero'), int(0)], ctx);
      const r2 = callVerb('sequence', [str('zero')], ctx);

      expect(r1).toEqual(int(0));
      expect(r2).toEqual(int(1));
    });

    it('truncates float start value', () => {
      const ctx = createContext();
      const r1 = callVerb('sequence', [str('float'), num(5.9)], ctx);

      expect(r1).toEqual(int(5));
    });

    it('coerces non-string name to string', () => {
      const ctx = createContext();
      const r1 = callVerb('sequence', [int(42)], ctx);
      const r2 = callVerb('sequence', [int(42)], ctx);

      expect(r1).toEqual(int(1));
      expect(r2).toEqual(int(2));
    });

    it('handles very large start value', () => {
      const ctx = createContext();
      const result = callVerb('sequence', [str('big'), int(999999999)], ctx);

      expect(result).toEqual(int(999999999));
    });

    it('increments past initial value on subsequent calls', () => {
      const ctx = createContext();

      // Initialize with 100
      callVerb('sequence', [str('test'), int(100)], ctx);

      // Call without start value - should increment
      const r2 = callVerb('sequence', [str('test')], ctx);

      expect(r2).toEqual(int(101));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Reset Sequence Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('resetSequence', () => {
    it('returns nil with no arguments', () => {
      const result = callVerb('resetSequence', []);
      expect(result).toEqual(nil());
    });

    it('resets sequence to 0 by default', () => {
      const ctx = createContext();

      // Create and advance a sequence
      callVerb('sequence', [str('reset')], ctx);
      callVerb('sequence', [str('reset')], ctx);
      callVerb('sequence', [str('reset')], ctx);

      // Reset
      const resetResult = callVerb('resetSequence', [str('reset')], ctx);
      expect(resetResult).toEqual(int(0));

      // Next value should be 1 (increments from 0)
      const nextResult = callVerb('sequence', [str('reset')], ctx);
      expect(nextResult).toEqual(int(1));
    });

    it('resets sequence to specified value', () => {
      const ctx = createContext();

      // Create and advance
      callVerb('sequence', [str('custom')], ctx);
      callVerb('sequence', [str('custom')], ctx);

      // Reset to 50
      const resetResult = callVerb('resetSequence', [str('custom'), int(50)], ctx);
      expect(resetResult).toEqual(int(50));

      // Next value should be 51
      const nextResult = callVerb('sequence', [str('custom')], ctx);
      expect(nextResult).toEqual(int(51));
    });

    it('can reset non-existent sequence (creates it)', () => {
      const ctx = createContext();

      const resetResult = callVerb('resetSequence', [str('new'), int(100)], ctx);
      expect(resetResult).toEqual(int(100));

      // Now use it
      const nextResult = callVerb('sequence', [str('new')], ctx);
      expect(nextResult).toEqual(int(101));
    });

    it('truncates float reset value', () => {
      const ctx = createContext();
      const result = callVerb('resetSequence', [str('float'), num(7.8)], ctx);

      expect(result).toEqual(int(7));
    });

    it('handles negative reset value', () => {
      const ctx = createContext();
      const result = callVerb('resetSequence', [str('neg'), int(-5)], ctx);

      expect(result).toEqual(int(-5));

      const next = callVerb('sequence', [str('neg')], ctx);
      expect(next).toEqual(int(-4));
    });

    it('resets multiple sequences independently', () => {
      const ctx = createContext();

      // Create two sequences
      callVerb('sequence', [str('a')], ctx);
      callVerb('sequence', [str('a')], ctx);
      callVerb('sequence', [str('b')], ctx);
      callVerb('sequence', [str('b')], ctx);
      callVerb('sequence', [str('b')], ctx);

      // Reset only 'a'
      callVerb('resetSequence', [str('a')], ctx);

      // 'a' should be reset, 'b' should be unchanged
      const nextA = callVerb('sequence', [str('a')], ctx);
      const nextB = callVerb('sequence', [str('b')], ctx);

      expect(nextA).toEqual(int(1));
      expect(nextB).toEqual(int(4));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Context Isolation Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Context Isolation', () => {
    it('sequences are isolated between contexts', () => {
      const ctx1 = createContext();
      const ctx2 = createContext();

      callVerb('sequence', [str('shared')], ctx1);
      callVerb('sequence', [str('shared')], ctx1);
      callVerb('sequence', [str('shared')], ctx1);

      const r1 = callVerb('sequence', [str('shared')], ctx1);
      const r2 = callVerb('sequence', [str('shared')], ctx2);

      expect(r1).toEqual(int(4)); // ctx1 is at 4
      expect(r2).toEqual(int(1)); // ctx2 starts fresh
    });

    it('reset in one context does not affect another', () => {
      const ctx1 = createContext();
      const ctx2 = createContext();

      // Advance both
      callVerb('sequence', [str('seq')], ctx1);
      callVerb('sequence', [str('seq')], ctx1);
      callVerb('sequence', [str('seq')], ctx2);
      callVerb('sequence', [str('seq')], ctx2);
      callVerb('sequence', [str('seq')], ctx2);

      // Reset ctx1
      callVerb('resetSequence', [str('seq')], ctx1);

      // Check both
      const r1 = callVerb('sequence', [str('seq')], ctx1);
      const r2 = callVerb('sequence', [str('seq')], ctx2);

      expect(r1).toEqual(int(1)); // ctx1 was reset
      expect(r2).toEqual(int(4)); // ctx2 continues
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Cases and Error Handling
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('uuid works without context', () => {
      // uuid doesn't need context
      const result = callVerb('uuid', []);
      expect(result.type).toBe('string');
    });

    it('sequence with null name', () => {
      const ctx = createContext();
      const result = callVerb('sequence', [nil()], ctx);
      // nil coerces to empty string, returns integer kind
      expect(result).toEqual(int(1));
    });

    it('sequence with boolean name', () => {
      const ctx = createContext();
      const result = callVerb('sequence', [{ type: 'boolean' as const, value: true }], ctx);
      // boolean coerces to "true", returns integer kind
      expect(result).toEqual(int(1));
    });

    it('resetSequence with null name', () => {
      const result = callVerb('resetSequence', [nil()]);
      // nil coerces to empty string, creates sequence, returns integer kind
      expect(result).toEqual(int(0));
    });

    it('many sequences in same context', () => {
      const ctx = createContext();

      for (let i = 0; i < 100; i++) {
        callVerb('sequence', [str(`seq_${i}`)], ctx);
      }

      // Verify a few
      const r50 = callVerb('sequence', [str('seq_50')], ctx);
      const r99 = callVerb('sequence', [str('seq_99')], ctx);

      expect(r50).toEqual(int(2)); // Second call
      expect(r99).toEqual(int(2)); // Second call
    });

    it('sequence counter survives many increments', () => {
      const ctx = createContext();

      for (let i = 0; i < 1000; i++) {
        callVerb('sequence', [str('counter')], ctx);
      }

      const result = callVerb('sequence', [str('counter')], ctx);
      expect(result).toEqual(int(1001));
    });
  });
});
