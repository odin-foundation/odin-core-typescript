/**
 * Tests for ODIN Diff and Patch operations.
 * Covers diff computation and patch application for document versioning.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';
import { PatchError } from '../../../src/types/errors.js';

describe('Diff and Patch', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Basic Diff Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Basic Diff', () => {
    it('detects no changes between identical documents', () => {
      const doc1 = Odin.parse('name = "John"\nage = ##30');
      const doc2 = Odin.parse('name = "John"\nage = ##30');

      const diff = Odin.diff(doc1, doc2);

      expect(diff.isEmpty).toBe(true);
      expect(diff.additions).toHaveLength(0);
      expect(diff.deletions).toHaveLength(0);
      expect(diff.modifications).toHaveLength(0);
      expect(diff.moves).toHaveLength(0);
    });

    it('detects additions', () => {
      const doc1 = Odin.parse('name = "John"');
      const doc2 = Odin.parse('name = "John"\nage = ##30');

      const diff = Odin.diff(doc1, doc2);

      expect(diff.isEmpty).toBe(false);
      expect(diff.additions).toHaveLength(1);
      expect(diff.additions[0]?.path).toBe('age');
      expect(diff.additions[0]?.value).toEqual({ type: 'integer', value: 30 });
    });

    it('detects deletions', () => {
      const doc1 = Odin.parse('name = "John"\nage = ##30');
      const doc2 = Odin.parse('name = "John"');

      const diff = Odin.diff(doc1, doc2);

      expect(diff.isEmpty).toBe(false);
      expect(diff.deletions).toHaveLength(1);
      expect(diff.deletions[0]?.path).toBe('age');
    });

    it('detects modifications', () => {
      const doc1 = Odin.parse('name = "John"\nage = ##30');
      const doc2 = Odin.parse('name = "Jane"\nage = ##30');

      const diff = Odin.diff(doc1, doc2);

      expect(diff.isEmpty).toBe(false);
      expect(diff.modifications).toHaveLength(1);
      expect(diff.modifications[0]?.path).toBe('name');
      expect(diff.modifications[0]?.oldValue).toEqual({ type: 'string', value: 'John' });
      expect(diff.modifications[0]?.newValue).toEqual({ type: 'string', value: 'Jane' });
    });

    it('detects moves (value at different path)', () => {
      const doc1 = Odin.parse('oldPath = "value"');
      const doc2 = Odin.parse('newPath = "value"');

      const diff = Odin.diff(doc1, doc2);

      expect(diff.isEmpty).toBe(false);
      expect(diff.moves).toHaveLength(1);
      expect(diff.moves[0]?.fromPath).toBe('oldPath');
      expect(diff.moves[0]?.toPath).toBe('newPath');
      // Moves should NOT appear in additions/deletions
      expect(diff.additions).toHaveLength(0);
      expect(diff.deletions).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Value Type Equality Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Value Type Equality', () => {
    it('compares null values correctly', () => {
      const doc1 = Odin.parse('value = ~');
      const doc2 = Odin.parse('value = ~');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('compares boolean values correctly', () => {
      const doc1 = Odin.parse('flag = ?true');
      const doc2 = Odin.parse('flag = ?false');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares string values correctly', () => {
      const doc1 = Odin.parse('text = "hello"');
      const doc2 = Odin.parse('text = "world"');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares number values correctly (same value)', () => {
      const doc1 = Odin.parse('num = #3.14');
      const doc2 = Odin.parse('num = #3.14');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('compares number values correctly (different value)', () => {
      const doc1 = Odin.parse('num = #3.14');
      const doc2 = Odin.parse('num = #2.71');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares number kinds (integer vs number)', () => {
      const doc1 = Odin.parse('num = ##42');
      const doc2 = Odin.parse('num = #42');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares date values correctly', () => {
      const doc1 = Odin.parse('date = 2024-06-15');
      const doc2 = Odin.parse('date = 2024-06-15');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('detects date value changes', () => {
      const doc1 = Odin.parse('date = 2024-06-15');
      const doc2 = Odin.parse('date = 2024-06-16');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares timestamp values correctly', () => {
      const doc1 = Odin.parse('ts = 2024-06-15T10:30:00Z');
      const doc2 = Odin.parse('ts = 2024-06-15T10:30:00Z');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('detects timestamp value changes', () => {
      const doc1 = Odin.parse('ts = 2024-06-15T10:30:00Z');
      const doc2 = Odin.parse('ts = 2024-06-15T11:30:00Z');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares time values correctly', () => {
      const doc1 = Odin.parse('time = T10:30:00');
      const doc2 = Odin.parse('time = T10:30:00');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('compares duration values correctly', () => {
      const doc1 = Odin.parse('dur = P1Y2M3D');
      const doc2 = Odin.parse('dur = P1Y2M3D');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('compares reference values correctly', () => {
      const doc1 = Odin.parse('ref = @other.path');
      const doc2 = Odin.parse('ref = @other.path');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('detects reference path changes', () => {
      const doc1 = Odin.parse('ref = @path1');
      const doc2 = Odin.parse('ref = @path2');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares binary values correctly (same data)', () => {
      const doc1 = Odin.parse('data = ^SGVsbG8=');
      const doc2 = Odin.parse('data = ^SGVsbG8=');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('detects binary data changes', () => {
      const doc1 = Odin.parse('data = ^SGVsbG8=');
      const doc2 = Odin.parse('data = ^V29ybGQ=');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares binary with different algorithms', () => {
      const doc1 = Odin.parse('data = ^sha256:SGVsbG8=');
      const doc2 = Odin.parse('data = ^md5:SGVsbG8=');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares currency values correctly (same value)', () => {
      const doc1 = Odin.parse('price = #$99.99');
      const doc2 = Odin.parse('price = #$99.99');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('compares currency values correctly (different value)', () => {
      const doc1 = Odin.parse('price = #$99.99');
      const doc2 = Odin.parse('price = #$149.99');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares currency values with same value but different currency code', () => {
      const doc1 = Odin.parse('price = #$100.00:USD');
      const doc2 = Odin.parse('price = #$100.00:EUR');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares currency values with currency code (same)', () => {
      const doc1 = Odin.parse('price = #$100.00:USD');
      const doc2 = Odin.parse('price = #$100.00:USD');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('compares percent values correctly (same value)', () => {
      const doc1 = Odin.parse('rate = #%0.15');
      const doc2 = Odin.parse('rate = #%0.15');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('compares percent values correctly (different value)', () => {
      const doc1 = Odin.parse('rate = #%0.15');
      const doc2 = Odin.parse('rate = #%0.25');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });

    it('compares different value types', () => {
      const doc1 = Odin.parse('value = "42"');
      const doc2 = Odin.parse('value = ##42');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Complex Diff Scenarios
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Complex Diff Scenarios', () => {
    it('handles multiple additions, deletions, and modifications', () => {
      const doc1 = Odin.parse(`
        keep = "unchanged"
        remove = "deleted"
        change = "old"
      `);
      const doc2 = Odin.parse(`
        keep = "unchanged"
        change = "new"
        add = "added"
      `);

      const diff = Odin.diff(doc1, doc2);

      expect(diff.isEmpty).toBe(false);
      expect(diff.additions).toHaveLength(1);
      expect(diff.deletions).toHaveLength(1);
      expect(diff.modifications).toHaveLength(1);
    });

    it('handles nested path changes', () => {
      const doc1 = Odin.parse(`
        {user}
        name = "John"
        age = ##30
      `);
      const doc2 = Odin.parse(`
        {user}
        name = "Jane"
        age = ##30
        email = "jane@example.com"
      `);

      const diff = Odin.diff(doc1, doc2);

      expect(diff.additions.some((a) => a.path === 'user.email')).toBe(true);
      expect(diff.modifications.some((m) => m.path === 'user.name')).toBe(true);
    });

    it('handles metadata changes', () => {
      const doc1 = Odin.parse(`
        {$}
        version = "1.0.0"
      `);
      const doc2 = Odin.parse(`
        {$}
        version = "2.0.0"
      `);

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications.some((m) => m.path === '$.version')).toBe(true);
    });

    it('handles empty document to populated', () => {
      const doc1 = Odin.empty();
      const doc2 = Odin.parse('field = "value"');

      const diff = Odin.diff(doc1, doc2);
      expect(diff.additions).toHaveLength(1);
    });

    it('handles populated to empty document', () => {
      const doc1 = Odin.parse('field = "value"');
      const doc2 = Odin.empty();

      const diff = Odin.diff(doc1, doc2);
      expect(diff.deletions).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Patch Application Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Patch Application', () => {
    it('applies empty diff (returns copy)', () => {
      const doc = Odin.parse('name = "John"');
      const emptyDiff = Odin.diff(doc, doc);

      const patched = Odin.patch(doc, emptyDiff);

      expect(patched.getString('name')).toBe('John');
    });

    it('applies additions', () => {
      const doc1 = Odin.parse('name = "John"');
      const doc2 = Odin.parse('name = "John"\nage = ##30');
      const diff = Odin.diff(doc1, doc2);

      const patched = Odin.patch(doc1, diff);

      expect(patched.getString('name')).toBe('John');
      expect(patched.getInteger('age')).toBe(30);
    });

    it('applies deletions', () => {
      const doc1 = Odin.parse('name = "John"\nage = ##30');
      const doc2 = Odin.parse('name = "John"');
      const diff = Odin.diff(doc1, doc2);

      const patched = Odin.patch(doc1, diff);

      expect(patched.getString('name')).toBe('John');
      expect(patched.has('age')).toBe(false);
    });

    it('applies modifications', () => {
      const doc1 = Odin.parse('name = "John"');
      const doc2 = Odin.parse('name = "Jane"');
      const diff = Odin.diff(doc1, doc2);

      const patched = Odin.patch(doc1, diff);

      expect(patched.getString('name')).toBe('Jane');
    });

    it('applies moves', () => {
      const doc1 = Odin.parse('oldField = "value"');
      const doc2 = Odin.parse('newField = "value"');
      const diff = Odin.diff(doc1, doc2);

      const patched = Odin.patch(doc1, diff);

      expect(patched.has('oldField')).toBe(false);
      expect(patched.getString('newField')).toBe('value');
    });

    it('applies metadata additions', () => {
      const doc1 = Odin.parse('field = "value"');
      const doc2 = Odin.parse(`
        {$}
        version = "1.0.0"

        field = "value"
      `);
      const diff = Odin.diff(doc1, doc2);

      const patched = Odin.patch(doc1, diff);

      expect(patched.get('$.version')).toEqual({ type: 'string', value: '1.0.0' });
    });

    it('applies metadata deletions', () => {
      const doc1 = Odin.parse(`
        {$}
        version = "1.0.0"

        field = "value"
      `);
      const doc2 = Odin.parse('field = "value"');
      const diff = Odin.diff(doc1, doc2);

      const patched = Odin.patch(doc1, diff);

      expect(patched.has('$.version')).toBe(false);
    });

    it('applies metadata modifications', () => {
      const doc1 = Odin.parse(`
        {$}
        version = "1.0.0"
      `);
      const doc2 = Odin.parse(`
        {$}
        version = "2.0.0"
      `);
      const diff = Odin.diff(doc1, doc2);

      const patched = Odin.patch(doc1, diff);

      expect(patched.get('$.version')).toEqual({ type: 'string', value: '2.0.0' });
    });

    it('applies metadata moves', () => {
      const doc1 = Odin.parse(`
        {$}
        oldMeta = "value"
      `);
      const doc2 = Odin.parse(`
        {$}
        newMeta = "value"
      `);
      const diff = Odin.diff(doc1, doc2);

      const patched = Odin.patch(doc1, diff);

      expect(patched.has('$.oldMeta')).toBe(false);
      expect(patched.get('$.newMeta')).toEqual({ type: 'string', value: 'value' });
    });

    it('throws PatchError for modification on non-existent path', () => {
      const doc = Odin.parse('name = "John"');
      const fakeDiff = {
        additions: [],
        deletions: [],
        modifications: [
          {
            path: 'nonexistent',
            oldValue: { type: 'string' as const, value: 'old' },
            newValue: { type: 'string' as const, value: 'new' },
          },
        ],
        moves: [],
        isEmpty: false,
      };

      expect(() => Odin.patch(doc, fakeDiff)).toThrow(PatchError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Roundtrip Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Diff/Patch Roundtrip', () => {
    it('diff + patch produces equivalent document', () => {
      const original = Odin.parse(`
        {$}
        version = "1.0.0"

        {user}
        name = "John"
        age = ##30
        active = ?true
      `);
      const modified = Odin.parse(`
        {$}
        version = "2.0.0"

        {user}
        name = "Jane"
        age = ##31
        email = "jane@test.com"
      `);

      const diff = Odin.diff(original, modified);
      const patched = Odin.patch(original, diff);

      // Verify patched equals modified
      expect(patched.get('$.version')).toEqual(modified.get('$.version'));
      expect(patched.get('user.name')).toEqual(modified.get('user.name'));
      expect(patched.get('user.age')).toEqual(modified.get('user.age'));
      expect(patched.get('user.email')).toEqual(modified.get('user.email'));
      expect(patched.has('user.active')).toBe(false);
    });

    it('multiple sequential patches accumulate correctly', () => {
      const v1 = Odin.parse('count = ##1');
      const v2 = Odin.parse('count = ##2');
      const v3 = Odin.parse('count = ##3');

      const diff1 = Odin.diff(v1, v2);
      const diff2 = Odin.diff(v2, v3);

      const patched1 = Odin.patch(v1, diff1);
      const patched2 = Odin.patch(patched1, diff2);

      expect(patched2.getInteger('count')).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Array Comparison Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Array Comparison', () => {
    it('compares equal arrays', () => {
      const doc1 = Odin.parse(`
        {items[0]}
        name = "Item1"
        {items[1]}
        name = "Item2"
      `);
      const doc2 = Odin.parse(`
        {items[0]}
        name = "Item1"
        {items[1]}
        name = "Item2"
      `);

      const diff = Odin.diff(doc1, doc2);
      expect(diff.isEmpty).toBe(true);
    });

    it('detects array item changes', () => {
      const doc1 = Odin.parse(`
        {items[0]}
        name = "Item1"
      `);
      const doc2 = Odin.parse(`
        {items[0]}
        name = "Item1-Modified"
      `);

      const diff = Odin.diff(doc1, doc2);
      expect(diff.modifications.some((m) => m.path === 'items[0].name')).toBe(true);
    });
  });
});
