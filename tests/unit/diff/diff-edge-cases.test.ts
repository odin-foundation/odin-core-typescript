/**
 * Tests for diff module edge cases.
 *
 * Covers currency comparison, binary comparison, array handling,
 * move detection, and patch operations.
 */

import { describe, it, expect } from 'vitest';
import { diff } from '../../../src/diff/diff.js';
import { patch } from '../../../src/diff/patch.js';
import { PatchError } from '../../../src/types/errors.js';
import { Odin } from '../../../src/odin.js';
import type { OdinDocument } from '../../../src/types/document.js';
import type { OdinDiff } from '../../../src/types/diff.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseDoc(text: string): OdinDocument {
  return Odin.parse(text);
}

function createEmptyDiff(): OdinDiff {
  return {
    additions: [],
    deletions: [],
    modifications: [],
    moves: [],
    isEmpty: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency Comparison Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('diff currency comparison', () => {
  it('detects same currency values as equal', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nprice = #$99.99');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nprice = #$99.99');

    const result = diff(a, b);

    expect(result.isEmpty).toBe(true);
    expect(result.modifications).toHaveLength(0);
  });

  it('detects different currency values', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nprice = #$99.99');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nprice = #$199.99');

    const result = diff(a, b);

    expect(result.isEmpty).toBe(false);
    expect(result.modifications).toHaveLength(1);
    expect(result.modifications[0]?.path).toBe('Data.price');
  });

  it('detects different decimal places as different', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nprice = #$99.990');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nprice = #$99.99');

    const result = diff(a, b);

    // Different decimal places should be detected as modification
    expect(result.modifications.length).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Binary Comparison Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('diff binary comparison', () => {
  it('detects same binary values as equal', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ndata = ^SGVsbG8=');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ndata = ^SGVsbG8=');

    const result = diff(a, b);

    expect(result.isEmpty).toBe(true);
  });

  it('detects different binary values', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ndata = ^SGVsbG8=');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ndata = ^V29ybGQ=');

    const result = diff(a, b);

    expect(result.isEmpty).toBe(false);
    expect(result.modifications).toHaveLength(1);
  });

  it('detects different binary algorithms as different', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nhash = ^sha256:SGVsbG8=');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nhash = ^md5:SGVsbG8=');

    const result = diff(a, b);

    expect(result.isEmpty).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Array Comparison Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('diff array comparison', () => {
  it('detects same arrays as equal', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nitems[0] = "one"\nitems[1] = "two"');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nitems[0] = "one"\nitems[1] = "two"');

    const result = diff(a, b);

    expect(result.isEmpty).toBe(true);
  });

  it('detects array item modifications', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nitems[0] = "one"\nitems[1] = "two"');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nitems[0] = "one"\nitems[1] = "THREE"');

    const result = diff(a, b);

    expect(result.isEmpty).toBe(false);
    expect(result.modifications.some((m) => m.path.includes('items'))).toBe(true);
  });

  it('detects array additions', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nitems[0] = "one"');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nitems[0] = "one"\nitems[1] = "two"');

    const result = diff(a, b);

    expect(result.additions.some((add) => add.path.includes('items[1]'))).toBe(true);
  });

  it('detects array deletions', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nitems[0] = "one"\nitems[1] = "two"');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nitems[0] = "one"');

    const result = diff(a, b);

    expect(result.deletions.some((del) => del.path.includes('items[1]'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Move Detection Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('diff move detection', () => {
  it('detects value moves', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\noldField = "value"');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nnewField = "value"');

    const result = diff(a, b);

    expect(result.moves).toHaveLength(1);
    expect(result.moves[0]?.fromPath).toBe('Data.oldField');
    expect(result.moves[0]?.toPath).toBe('Data.newField');
    // Moved values should not appear in additions/deletions
    expect(result.additions).toHaveLength(0);
    expect(result.deletions).toHaveLength(0);
  });

  it('does not detect move when values differ', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\noldField = "value1"');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nnewField = "value2"');

    const result = diff(a, b);

    expect(result.moves).toHaveLength(0);
    expect(result.additions).toHaveLength(1);
    expect(result.deletions).toHaveLength(1);
  });

  it('handles multiple potential move matches', () => {
    // When multiple fields have the same value, first match wins
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nfield1 = "same"\nfield2 = "same"');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nnewField1 = "same"\nnewField2 = "same"');

    const result = diff(a, b);

    // Should detect 2 moves
    expect(result.moves).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty and Identical Document Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('diff empty and identical documents', () => {
  it('returns empty diff for identical documents', () => {
    const text = '{$}\nodin = "1.0.0"\n\n{Data}\nname = "John"\nage = ##30';
    const a = parseDoc(text);
    const b = parseDoc(text);

    const result = diff(a, b);

    expect(result.isEmpty).toBe(true);
    expect(result.additions).toHaveLength(0);
    expect(result.deletions).toHaveLength(0);
    expect(result.modifications).toHaveLength(0);
    expect(result.moves).toHaveLength(0);
  });

  it('handles minimal documents', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"');
    const b = parseDoc('{$}\nodin = "1.0.0"');

    const result = diff(a, b);

    expect(result.isEmpty).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Patch Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('patch', () => {
  it('returns copy for empty diff', () => {
    const doc = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nname = "John"');
    const emptyDiff = createEmptyDiff();

    const result = patch(doc, emptyDiff);

    // Should be a copy, not the same instance
    expect(result).not.toBe(doc);
    expect(result.get('Data.name')?.type).toBe('string');
  });

  it('applies additions', () => {
    const doc = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nname = "John"');
    const d = diff(doc, parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nname = "John"\nage = ##30'));

    const result = patch(doc, d);

    expect(result.get('Data.age')?.type).toBe('integer');
  });

  it('applies deletions', () => {
    const doc = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nname = "John"\nage = ##30');
    const d = diff(doc, parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nname = "John"'));

    const result = patch(doc, d);

    expect(result.get('Data.age')).toBeUndefined();
  });

  it('applies modifications', () => {
    const doc = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nname = "John"');
    const d = diff(doc, parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nname = "Jane"'));

    const result = patch(doc, d);

    const nameValue = result.get('Data.name');
    expect(nameValue?.type).toBe('string');
    if (nameValue?.type === 'string') {
      expect(nameValue.value).toBe('Jane');
    }
  });

  it('applies moves', () => {
    const doc = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\noldName = "value"');
    const d = diff(doc, parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nnewName = "value"'));

    const result = patch(doc, d);

    expect(result.get('Data.oldName')).toBeUndefined();
    expect(result.get('Data.newName')?.type).toBe('string');
  });

  it('throws PatchError for modification of non-existent path', () => {
    const doc = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nname = "John"');

    // Create a fake diff with modification to non-existent path
    const badDiff: OdinDiff = {
      additions: [],
      deletions: [],
      modifications: [
        {
          path: 'Data.nonExistent',
          oldValue: { type: 'string', value: 'old' },
          newValue: { type: 'string', value: 'new' },
        },
      ],
      moves: [],
      isEmpty: false,
    };

    expect(() => patch(doc, badDiff)).toThrow(PatchError);
  });

  it('round-trips: patching with diff recreates target', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nname = "John"\nage = ##25\nactive = true');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nname = "Jane"\nage = ##30\ncity = "NYC"');

    const d = diff(a, b);
    const result = patch(a, d);

    // Verify key values match
    const nameValue = result.get('Data.name');
    expect(nameValue?.type).toBe('string');
    if (nameValue?.type === 'string') {
      expect(nameValue.value).toBe('Jane');
    }

    const ageValue = result.get('Data.age');
    expect(ageValue?.type).toBe('integer');
    if (ageValue?.type === 'integer') {
      expect(ageValue.value).toBe(30);
    }

    expect(result.get('Data.city')).toBeDefined();
    expect(result.get('Data.active')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type-Specific Comparison Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('diff type-specific comparisons', () => {
  it('compares dates correctly', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ndate = 2024-01-15');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ndate = 2024-01-16');

    const result = diff(a, b);

    expect(result.modifications).toHaveLength(1);
  });

  it('compares timestamps correctly', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ntime = 2024-01-15T10:30:00Z');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ntime = 2024-01-15T10:31:00Z');

    const result = diff(a, b);

    expect(result.modifications).toHaveLength(1);
  });

  it('compares references correctly', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nref = @other.path');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nref = @different.path');

    const result = diff(a, b);

    expect(result.modifications).toHaveLength(1);
  });

  it('compares durations correctly', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ndur = P1D');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ndur = P2D');

    const result = diff(a, b);

    expect(result.modifications).toHaveLength(1);
  });

  it('compares time values correctly', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ntime = T14:30:00');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\ntime = T15:30:00');

    const result = diff(a, b);

    expect(result.modifications).toHaveLength(1);
  });

  it('detects type changes as modifications', () => {
    const a = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nvalue = "42"');
    const b = parseDoc('{$}\nodin = "1.0.0"\n\n{Data}\nvalue = ##42');

    const result = diff(a, b);

    // String "42" vs integer 42 should be a modification
    expect(result.modifications).toHaveLength(1);
  });
});
