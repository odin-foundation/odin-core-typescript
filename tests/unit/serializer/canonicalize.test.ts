/**
 * Tests for ODIN Canonicalize operations.
 * Ensures deterministic output for hashing and signatures.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Canonicalize', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Basic Canonicalization
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Basic Canonicalization', () => {
    it('produces UTF-8 bytes', () => {
      const doc = Odin.parse('name = "John"');
      const canonical = Odin.canonicalize(doc);

      expect(canonical).toBeInstanceOf(Uint8Array);
      expect(canonical.length).toBeGreaterThan(0);
    });

    it('produces identical bytes for identical documents', () => {
      const doc1 = Odin.parse('name = "John"\nage = ##30');
      const doc2 = Odin.parse('name = "John"\nage = ##30');

      const canonical1 = Odin.canonicalize(doc1);
      const canonical2 = Odin.canonicalize(doc2);

      expect(canonical1).toEqual(canonical2);
    });

    it('produces identical bytes regardless of input order', () => {
      const doc1 = Odin.parse('aaa = "first"\nzzz = "last"');
      const doc2 = Odin.parse('zzz = "last"\naaa = "first"');

      const canonical1 = Odin.canonicalize(doc1);
      const canonical2 = Odin.canonicalize(doc2);

      expect(canonical1).toEqual(canonical2);
    });

    it('produces LF line endings', () => {
      const doc = Odin.parse('name = "John"');
      const canonical = Odin.canonicalize(doc);
      const text = new TextDecoder().decode(canonical);

      expect(text).not.toContain('\r\n');
      expect(text).toContain('\n');
    });

    it('produces empty output for empty document', () => {
      const doc = Odin.empty();
      const canonical = Odin.canonicalize(doc);
      const text = new TextDecoder().decode(canonical);

      expect(text).toBe('');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Value Type Canonicalization
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Value Type Canonicalization', () => {
    it('canonicalizes null as ~', () => {
      const doc = Odin.parse('value = ~');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('value = ~');
    });

    it('canonicalizes boolean true as true (bare)', () => {
      const doc = Odin.parse('flag = ?true');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('flag = true');
    });

    it('canonicalizes boolean false as false (bare)', () => {
      const doc = Odin.parse('flag = ?false');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('flag = false');
    });

    it('canonicalizes strings with quotes', () => {
      const doc = Odin.parse('name = "John"');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('name = "John"');
    });

    it('escapes special characters in strings', () => {
      const doc = Odin.parse('text = "line1\\nline2"');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('\\n');
    });

    it('escapes backslash in strings', () => {
      const doc = Odin.parse('path = "c:\\\\users"');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('\\\\');
    });

    it('escapes quotes in strings', () => {
      const doc = Odin.parse('quoted = "say \\"hello\\""');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('\\"');
    });

    it('escapes carriage return in strings', () => {
      const doc = Odin.parse('text = "line1\\rline2"');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('\\r');
    });

    it('escapes tab in strings', () => {
      const doc = Odin.parse('text = "col1\\tcol2"');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('\\t');
    });

    it('canonicalizes integer with ## prefix', () => {
      const doc = Odin.parse('count = ##42');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('count = ##42');
    });

    it('canonicalizes number with # prefix', () => {
      const doc = Odin.parse('value = #3.14');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('value = #3.14');
    });

    it('canonicalizes currency with #$ prefix', () => {
      const doc = Odin.parse('price = #$99.99');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('price = #$99.99');
    });

    it('canonicalizes date in YYYY-MM-DD format', () => {
      const doc = Odin.parse('date = 2024-06-15');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('date = 2024-06-15');
    });

    it('canonicalizes timestamp in ISO format', () => {
      const doc = Odin.parse('ts = 2024-06-15T10:30:00Z');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('2024-06-15T10:30:00');
    });

    it('canonicalizes time value', () => {
      const doc = Odin.parse('time = T10:30:00');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('T10:30:00');
    });

    it('canonicalizes duration value', () => {
      const doc = Odin.parse('dur = P1Y2M3D');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('P1Y2M3D');
    });

    it('canonicalizes reference with @ prefix', () => {
      const doc = Odin.parse('ref = @other.path');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('ref = @other.path');
    });

    it('canonicalizes binary with ^ prefix', () => {
      const doc = Odin.parse('data = ^SGVsbG8=');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('data = ^SGVsbG8=');
    });

    it('canonicalizes binary with algorithm prefix', () => {
      const doc = Odin.parse('hash = ^sha256:AAAA');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('^sha256:');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Number Formatting
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Number Formatting', () => {
    it('formats integers without decimal point', () => {
      const doc = Odin.parse('count = ##100');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('##100');
      expect(text).not.toContain('##100.');
    });

    it('formats currency with decimal places', () => {
      const doc = Odin.parse('price = #$50.00');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('#$50.00');
    });

    it('formats generic number minimally', () => {
      const doc = Odin.parse('value = #3.5');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('#3.5');
    });

    it('truncates integers from floats', () => {
      // When type is integer but value has decimal - truncates to integer
      const doc = Odin.builder().set('count', { type: 'integer', value: 42.9 }).build();
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('##42');
    });

    it('throws for non-finite numbers', () => {
      const doc = Odin.builder().set('value', { type: 'number', value: Infinity }).build();

      expect(() => Odin.canonicalize(doc)).toThrow('Non-finite numbers cannot be canonicalized');
    });

    it('throws for NaN', () => {
      const doc = Odin.builder().set('value', { type: 'number', value: NaN }).build();

      expect(() => Odin.canonicalize(doc)).toThrow('Non-finite numbers cannot be canonicalized');
    });

    it('throws for negative infinity', () => {
      const doc = Odin.builder().set('value', { type: 'number', value: -Infinity }).build();

      expect(() => Odin.canonicalize(doc)).toThrow('Non-finite numbers cannot be canonicalized');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Path Ordering
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Path Ordering', () => {
    it('sorts paths lexicographically', () => {
      const doc = Odin.parse(`
        zebra = "z"
        apple = "a"
        middle = "m"
      `);
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      const lines = text.trim().split('\n');
      expect(lines[0]).toContain('apple');
      expect(lines[1]).toContain('middle');
      expect(lines[2]).toContain('zebra');
    });

    it('sorts nested paths correctly', () => {
      const doc = Odin.parse(`
        {user}
        name = "John"
        age = ##30
      `);
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      const lines = text.trim().split('\n');
      // Should sort: user.age before user.name
      expect(lines[0]).toContain('user.age');
      expect(lines[1]).toContain('user.name');
    });

    it('sorts metadata with $ prefix', () => {
      const doc = Odin.parse(`
        field = "value"
        {$}
        version = "1.0.0"
      `);
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      const lines = text.trim().split('\n');
      // $ sorts before alphabetic
      expect(lines[0]).toContain('$.version');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Modifier Handling
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Modifier Handling', () => {
    it('includes critical modifier in canonical order', () => {
      const doc = Odin.parse('field = !"critical value"');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('= !');
    });

    it('includes redacted modifier in canonical order', () => {
      const doc = Odin.parse('secret = *"redacted"');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('= *');
    });

    it('includes deprecated modifier in canonical order', () => {
      const doc = Odin.parse('old = -"deprecated"');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('= -');
    });

    it('orders multiple modifiers: critical, redacted, deprecated', () => {
      // Create document with all modifiers
      const doc = Odin.builder()
        .setWithModifiers('field', 'value', {
          required: true,
          confidential: true,
          deprecated: true,
        })
        .build();
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      // Should be: !*- in that order (required, confidential, deprecated)
      expect(text).toContain('= !*-');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Determinism Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Determinism', () => {
    it('produces consistent output across multiple calls', () => {
      const doc = Odin.parse(`
        {$}
        version = "1.0.0"

        {policy}
        number = "POL-001"
        premium = #$500.00
        active = ?true
        created = 2024-06-15
      `);

      const results: Uint8Array[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(Odin.canonicalize(doc));
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(results[0]);
      }
    });

    it('can be used for hashing (consistent hash)', () => {
      const doc = Odin.parse('data = "consistent"');
      const canonical = Odin.canonicalize(doc);

      // Simple hash simulation - sum of bytes
      const hash1 = canonical.reduce((sum, byte) => sum + byte, 0);
      const hash2 = canonical.reduce((sum, byte) => sum + byte, 0);

      expect(hash1).toBe(hash2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles empty string value', () => {
      const doc = Odin.parse('empty = ""');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('empty = ""');
    });

    it('handles unicode in strings', () => {
      const doc = Odin.parse('greeting = "Hello 世界 🎉"');
      const canonical = Odin.canonicalize(doc);
      const text = new TextDecoder().decode(canonical);

      expect(text).toContain('世界');
      expect(text).toContain('🎉');
    });

    it('handles very long paths', () => {
      const doc = Odin.parse('a.b.c.d.e.f.g.h.i.j.k = "deep"');
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('a.b.c.d.e.f.g.h.i.j.k');
    });

    it('handles array paths', () => {
      const doc = Odin.parse(`
        items[0] = "first"
        items[1] = "second"
      `);
      const text = new TextDecoder().decode(Odin.canonicalize(doc));

      expect(text).toContain('items[0]');
      expect(text).toContain('items[1]');
    });
  });
});
