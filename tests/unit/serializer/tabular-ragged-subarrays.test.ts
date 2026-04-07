/**
 * Tests for the tabular serializer's ragged sub-array rule.
 * Records with variable-length indexed sub-arrays must fall through to the
 * nested record-block form instead of padding to the union column width.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Tabular ragged sub-arrays', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Ragged Sub-Arrays
  // ─────────────────────────────────────────────────────────────────────────────

  describe('rejects tabular when sub-arrays have variable length', () => {
    it('emits nested form for ragged string sub-arrays', () => {
      // First record has 3 tags, second has 1 — tabular would pad with empties.
      const builder = Odin.builder();
      builder.set('records[0].name', 'Alice');
      builder.set('records[0].tags[0]', 'red');
      builder.set('records[0].tags[1]', 'green');
      builder.set('records[0].tags[2]', 'blue');
      builder.set('records[1].name', 'Bob');
      builder.set('records[1].tags[0]', 'yellow');

      const text = Odin.stringify(builder.build());

      expect(text).not.toMatch(/\{records\[\][^}]*tags\[2\]/);
      expect(text).toContain('{records[0]}');
      expect(text).toContain('{records[1]}');
      expect(text).toMatch(/\{\.tags\[\]\s*:\s*~\}/);
    });

    it('emits nested form for ragged numeric sub-arrays', () => {
      const builder = Odin.builder();
      builder.set('points[0].label', 'A');
      builder.set('points[0].coords[0]', 1);
      builder.set('points[0].coords[1]', 2);
      builder.set('points[1].label', 'B');
      builder.set('points[1].coords[0]', 3);
      builder.set('points[1].coords[1]', 4);
      builder.set('points[1].coords[2]', 5);
      builder.set('points[1].coords[3]', 6);

      const text = Odin.stringify(builder.build());

      expect(text).not.toMatch(/\{points\[\][^}]*coords\[3\]/);
      expect(text).toContain('{points[0]}');
      expect(text).toContain('{points[1]}');
      expect(text).toMatch(/\{\.coords\[\]\s*:\s*~\}/);
    });

    it('round-trips ragged sub-arrays without data loss', () => {
      const builder = Odin.builder();
      builder.set('entries[0].slug', 'a/one');
      builder.set('entries[0].title', 'One');
      builder.set('entries[0].types[0]', 'alpha');
      builder.set('entries[0].types[1]', 'beta');
      builder.set('entries[0].fields[0]', 'id');
      builder.set('entries[0].fields[1]', 'name');
      builder.set('entries[0].fields[2]', 'desc');
      builder.set('entries[1].slug', 'b/two');
      builder.set('entries[1].title', 'Two');
      builder.set('entries[1].types[0]', 'gamma');
      builder.set('entries[1].fields[0]', 'id');

      const original = builder.build();
      const text = Odin.stringify(original);
      const reparsed = Odin.parse(text);
      const json = reparsed.toJSON() as {
        entries: Array<{ slug: string; title: string; types: string[]; fields: string[] }>;
      };

      expect(json.entries).toHaveLength(2);
      expect(json.entries[0].slug).toBe('a/one');
      expect(json.entries[0].types).toEqual(['alpha', 'beta']);
      expect(json.entries[0].fields).toEqual(['id', 'name', 'desc']);
      expect(json.entries[1].slug).toBe('b/two');
      expect(json.entries[1].types).toEqual(['gamma']);
      expect(json.entries[1].fields).toEqual(['id']);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Dense Uniform Shapes
  // ─────────────────────────────────────────────────────────────────────────────

  describe('preserves tabular for dense uniform shapes', () => {
    it('emits tabular for records with only scalar columns', () => {
      const builder = Odin.builder();
      builder.set('rows[0].name', 'Alice');
      builder.set('rows[0].age', 30);
      builder.set('rows[1].name', 'Bob');
      builder.set('rows[1].age', 25);

      const text = Odin.stringify(builder.build());

      expect(text).toMatch(/\{rows\[\]\s*:\s*[^}]*name[^}]*age/);
      expect(text).not.toContain('{rows[0]}');
    });

    it('emits tabular for records with uniform-width sub-arrays', () => {
      // Both records have exactly two coords; columns are fully populated.
      const builder = Odin.builder();
      builder.set('points[0].label', 'A');
      builder.set('points[0].coords[0]', 1);
      builder.set('points[0].coords[1]', 2);
      builder.set('points[1].label', 'B');
      builder.set('points[1].coords[0]', 3);
      builder.set('points[1].coords[1]', 4);

      const text = Odin.stringify(builder.build());

      expect(text).toMatch(/\{points\[\]\s*:[^}]*coords\[0\][^}]*coords\[1\]/);
      expect(text).not.toContain('{points[0]}');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Size Guarantee
  // ─────────────────────────────────────────────────────────────────────────────

  describe('size guarantee', () => {
    it('produces output smaller than the equivalent padded-tabular form', () => {
      // 20 records, tag count grows from 1 to 39 — worst case for padding.
      const builder = Odin.builder();
      for (let r = 0; r < 20; r++) {
        builder.set(`entries[${r}].slug`, `record/${r}`);
        builder.set(`entries[${r}].title`, `Record ${r}`);
        const tagCount = 1 + r * 2;
        for (let t = 0; t < tagCount; t++) {
          builder.set(`entries[${r}].tags[${t}]`, `tag-${r}-${t}`);
        }
      }

      const text = Odin.stringify(builder.build());

      expect(text).not.toMatch(/tags\[39\]/);
      expect(text).toContain('{entries[0]}');
      expect(text).toContain('{entries[19]}');
      expect(text).toMatch(/\{\.tags\[\]\s*:\s*~\}/);
    });
  });
});
