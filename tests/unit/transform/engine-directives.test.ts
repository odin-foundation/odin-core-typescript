/**
 * Tests for engine-directives module.
 *
 * Covers extraction directive application (:pos, :len, :trim).
 */

import { describe, it, expect } from 'vitest';
import { applyDirectives } from '../../../src/transform/engine-directives.js';
import type { TransformValue } from '../../../src/types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

const str = (value: string): TransformValue => ({ type: 'string', value });
const int = (value: number): TransformValue => ({ type: 'integer', value });
const nil = (): TransformValue => ({ type: 'null' });

// ─────────────────────────────────────────────────────────────────────────────
// applyDirectives Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('applyDirectives', () => {
  describe('null handling', () => {
    it('returns null unchanged', () => {
      const result = applyDirectives(nil(), [{ name: 'pos', value: 0 }]);
      expect(result.type).toBe('null');
    });
  });

  describe(':pos directive', () => {
    it('extracts from position to end', () => {
      const result = applyDirectives(str('HELLO WORLD'), [{ name: 'pos', value: 6 }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('WORLD');
      }
    });

    it('handles position at start', () => {
      const result = applyDirectives(str('HELLO'), [{ name: 'pos', value: 0 }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO');
      }
    });

    it('handles position beyond string length', () => {
      const result = applyDirectives(str('HELLO'), [{ name: 'pos', value: 100 }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('');
      }
    });

    it('accepts string value for position', () => {
      const result = applyDirectives(str('HELLO WORLD'), [{ name: 'pos', value: '6' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('WORLD');
      }
    });
  });

  describe(':len directive', () => {
    it('limits length without position', () => {
      // Without :pos, :len alone doesn't apply
      const result = applyDirectives(str('HELLO WORLD'), [{ name: 'len', value: 5 }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO WORLD');
      }
    });
  });

  describe(':pos + :len combination', () => {
    it('extracts substring with position and length', () => {
      const result = applyDirectives(str('HELLO WORLD'), [
        { name: 'pos', value: 0 },
        { name: 'len', value: 5 },
      ]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO');
      }
    });

    it('extracts from middle with length', () => {
      const result = applyDirectives(str('HELLO WORLD'), [
        { name: 'pos', value: 6 },
        { name: 'len', value: 5 },
      ]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('WORLD');
      }
    });

    it('handles length exceeding remaining string', () => {
      const result = applyDirectives(str('HELLO'), [
        { name: 'pos', value: 2 },
        { name: 'len', value: 100 },
      ]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('LLO');
      }
    });

    it('accepts string values for both', () => {
      const result = applyDirectives(str('HELLO WORLD'), [
        { name: 'pos', value: '0' },
        { name: 'len', value: '5' },
      ]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO');
      }
    });
  });

  describe(':trim directive', () => {
    it('trims leading whitespace', () => {
      const result = applyDirectives(str('  HELLO'), [{ name: 'trim' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO');
      }
    });

    it('trims trailing whitespace', () => {
      const result = applyDirectives(str('HELLO  '), [{ name: 'trim' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO');
      }
    });

    it('trims both leading and trailing', () => {
      const result = applyDirectives(str('  HELLO  '), [{ name: 'trim' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO');
      }
    });

    it('handles already-trimmed string', () => {
      const result = applyDirectives(str('HELLO'), [{ name: 'trim' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO');
      }
    });
  });

  describe('combined directives', () => {
    it('applies :pos, :len, then :trim in order', () => {
      const result = applyDirectives(str('HELLO   WORLD   '), [
        { name: 'pos', value: 6 },
        { name: 'len', value: 9 },
        { name: 'trim' },
      ]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('WORLD');
      }
    });

    it('applies :pos and :trim', () => {
      const result = applyDirectives(str('  HELLO  WORLD'), [
        { name: 'pos', value: 9 },
        { name: 'trim' },
      ]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('WORLD');
      }
    });
  });

  describe('non-string values', () => {
    it('converts integer to string', () => {
      const result = applyDirectives(int(12345), [
        { name: 'pos', value: 0 },
        { name: 'len', value: 2 },
      ]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('12');
      }
    });
  });

  describe('empty directives', () => {
    it('returns string unchanged with no directives', () => {
      const result = applyDirectives(str('HELLO'), []);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('HELLO');
      }
    });
  });
});
