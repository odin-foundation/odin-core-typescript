/**
 * New Verbs Tests
 *
 * Tests for newly added verbs:
 * - Geo/Spatial: distance, inBoundingBox, bearing, midpoint, toRadians, toDegrees
 * - Text Processing: tokenize, wordCount
 * - Fuzzy String Matching: levenshtein, soundex
 * - Window/Ranking: rowNumber, rank, lag, lead
 * - Sampling: sample, limit, fillMissing
 * - Validation: assert
 * - Collection: toArray, toObject
 * - JSON Query: jsonPath
 */

import { describe, it, expect } from 'vitest';
import {
  callVerb,
  callVerbNumber,
  callVerbString,
  callVerbBoolean,
  str,
  int,
  num,
  bool,
  nil,
  arr,
  obj,
} from './helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Geo/Spatial Verbs
// ─────────────────────────────────────────────────────────────────────────────

describe('Geo/Spatial Verbs', () => {
  describe('distance', () => {
    it('calculates distance in kilometers (default)', () => {
      // New York to Los Angeles approximately 3935 km
      const result = callVerbNumber('distance', [
        num(40.7128),
        num(-74.006), // NYC
        num(34.0522),
        num(-118.2437), // LA
      ]);
      expect(result).toBeGreaterThan(3900);
      expect(result).toBeLessThan(4000);
    });

    it('calculates distance in miles', () => {
      const result = callVerbNumber('distance', [
        num(40.7128),
        num(-74.006),
        num(34.0522),
        num(-118.2437),
        str('miles'),
      ]);
      expect(result).toBeGreaterThan(2400);
      expect(result).toBeLessThan(2500);
    });

    it('returns 0 for same point', () => {
      const result = callVerbNumber('distance', [
        num(40.7128),
        num(-74.006),
        num(40.7128),
        num(-74.006),
      ]);
      expect(result).toBe(0);
    });

    it('returns null with insufficient args', () => {
      const result = callVerb('distance', [num(40), num(-74)]);
      expect(result.type).toBe('null');
    });
  });

  describe('inBoundingBox', () => {
    it('returns true when point is inside box', () => {
      const result = callVerbBoolean('inBoundingBox', [
        num(40.0),
        num(-75.0), // point
        num(39.0),
        num(-76.0), // min lat/lon
        num(41.0),
        num(-74.0), // max lat/lon
      ]);
      expect(result).toBe(true);
    });

    it('returns false when point is outside box', () => {
      const result = callVerbBoolean('inBoundingBox', [
        num(50.0),
        num(-75.0), // point outside
        num(39.0),
        num(-76.0),
        num(41.0),
        num(-74.0),
      ]);
      expect(result).toBe(false);
    });

    it('returns true on boundary', () => {
      const result = callVerbBoolean('inBoundingBox', [
        num(39.0),
        num(-76.0), // exactly on corner
        num(39.0),
        num(-76.0),
        num(41.0),
        num(-74.0),
      ]);
      expect(result).toBe(true);
    });
  });

  describe('toRadians / toDegrees', () => {
    it('converts degrees to radians', () => {
      const result = callVerbNumber('toRadians', [num(180)]);
      expect(result).toBeCloseTo(Math.PI, 10);
    });

    it('converts radians to degrees', () => {
      const result = callVerbNumber('toDegrees', [num(Math.PI)]);
      expect(result).toBeCloseTo(180, 10);
    });

    it('round-trips correctly', () => {
      const deg = 45;
      const rad = callVerbNumber('toRadians', [num(deg)]);
      const back = callVerbNumber('toDegrees', [num(rad)]);
      expect(back).toBeCloseTo(deg, 10);
    });
  });

  describe('bearing', () => {
    it('calculates bearing between points', () => {
      // Bearing from equator going north should be ~0
      const result = callVerbNumber('bearing', [num(0), num(0), num(10), num(0)]);
      expect(result).toBeCloseTo(0, 1);
    });

    it('calculates eastward bearing', () => {
      const result = callVerbNumber('bearing', [num(0), num(0), num(0), num(10)]);
      expect(result).toBeCloseTo(90, 1);
    });
  });

  describe('midpoint', () => {
    it('calculates midpoint between two points', () => {
      const result = callVerb('midpoint', [num(0), num(0), num(0), num(10)]);
      expect(result.type).toBe('object');
      if (result.type === 'object') {
        expect((result.value as any).lat).toBeCloseTo(0, 5);
        expect((result.value as any).lon).toBeCloseTo(5, 1);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Text Processing Verbs
// ─────────────────────────────────────────────────────────────────────────────

describe('Text Processing Verbs', () => {
  describe('tokenize', () => {
    it('splits by whitespace by default', () => {
      const result = callVerb('tokenize', [str('hello world foo')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(3);
      }
    });

    it('splits by custom delimiter', () => {
      const result = callVerb('tokenize', [str('a,b,c'), str(',')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(3);
      }
    });

    it('handles empty string', () => {
      const result = callVerb('tokenize', [str('')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(0);
      }
    });

    it('handles single word', () => {
      const result = callVerb('tokenize', [str('hello')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(1);
      }
    });
  });

  describe('wordCount', () => {
    it('counts words in text', () => {
      const result = callVerbNumber('wordCount', [str('hello world')]);
      expect(result).toBe(2);
    });

    it('returns 0 for empty string', () => {
      const result = callVerbNumber('wordCount', [str('')]);
      expect(result).toBe(0);
    });

    it('handles multiple spaces', () => {
      const result = callVerbNumber('wordCount', [str('hello   world')]);
      expect(result).toBe(2);
    });

    it('returns 0 for null', () => {
      const result = callVerbNumber('wordCount', [nil()]);
      expect(result).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fuzzy String Matching Verbs
// ─────────────────────────────────────────────────────────────────────────────

describe('Fuzzy String Matching Verbs', () => {
  describe('levenshtein', () => {
    it('returns 0 for identical strings', () => {
      const result = callVerbNumber('levenshtein', [str('hello'), str('hello')]);
      expect(result).toBe(0);
    });

    it('returns correct distance for one edit', () => {
      const result = callVerbNumber('levenshtein', [str('cat'), str('bat')]);
      expect(result).toBe(1);
    });

    it('returns string length for empty comparison', () => {
      const result = callVerbNumber('levenshtein', [str('abc'), str('')]);
      expect(result).toBe(3);
    });

    it('handles case sensitivity', () => {
      const result = callVerbNumber('levenshtein', [str('Hello'), str('hello')]);
      expect(result).toBe(1);
    });

    it('calculates distance for different lengths', () => {
      const result = callVerbNumber('levenshtein', [str('kitten'), str('sitting')]);
      expect(result).toBe(3);
    });
  });

  describe('soundex', () => {
    it('returns same code for similar sounding names', () => {
      const robert = callVerbString('soundex', [str('Robert')]);
      const rupert = callVerbString('soundex', [str('Rupert')]);
      expect(robert).toBe(rupert);
    });

    it('returns different codes for different names', () => {
      const robert = callVerbString('soundex', [str('Robert')]);
      const smith = callVerbString('soundex', [str('Smith')]);
      expect(robert).not.toBe(smith);
    });

    it('handles empty string', () => {
      const result = callVerbString('soundex', [str('')]);
      expect(result).toBe(''); // Empty string returns empty soundex
    });

    it('returns 4-character code', () => {
      const result = callVerbString('soundex', [str('Washington')]);
      expect(result).toHaveLength(4);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Window/Ranking Verbs
// ─────────────────────────────────────────────────────────────────────────────

describe('Window/Ranking Verbs', () => {
  describe('rowNumber', () => {
    it('assigns sequential row numbers', () => {
      const input = arr([str('a'), str('b'), str('c')]);
      const result = callVerb('rowNumber', [input]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(3);
      }
    });

    it('handles empty array', () => {
      const result = callVerb('rowNumber', [arr([])]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(0);
      }
    });
  });

  describe('rank', () => {
    it('ranks numeric values', () => {
      const input = arr([int(30), int(10), int(20)]);
      const result = callVerb('rank', [input]);
      expect(result.type).toBe('array');
    });

    it('handles empty array', () => {
      const result = callVerb('rank', [arr([])]);
      expect(result.type).toBe('array');
    });
  });

  describe('lag', () => {
    it('returns previous values', () => {
      const input = arr([int(1), int(2), int(3)]);
      const result = callVerb('lag', [input]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(3);
      }
    });

    it('handles periods parameter', () => {
      const input = arr([int(1), int(2), int(3), int(4)]);
      const result = callVerb('lag', [input, int(2)]);
      expect(result.type).toBe('array');
    });
  });

  describe('lead', () => {
    it('returns next values', () => {
      const input = arr([int(1), int(2), int(3)]);
      const result = callVerb('lead', [input]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(3);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sampling Verbs
// ─────────────────────────────────────────────────────────────────────────────

describe('Sampling Verbs', () => {
  describe('sample', () => {
    it('returns requested number of items', () => {
      const input = arr([int(1), int(2), int(3), int(4), int(5)]);
      const result = callVerb('sample', [input, int(3)]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(3);
      }
    });

    it('returns all items if count exceeds array length', () => {
      const input = arr([int(1), int(2)]);
      const result = callVerb('sample', [input, int(10)]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(2);
      }
    });

    it('produces reproducible results with seed', () => {
      const input = arr([int(1), int(2), int(3), int(4), int(5)]);
      const result1 = callVerb('sample', [input, int(3), int(42)]);
      const result2 = callVerb('sample', [input, int(3), int(42)]);
      expect(result1).toEqual(result2);
    });
  });

  describe('limit', () => {
    it('returns first N items', () => {
      const input = arr([int(1), int(2), int(3), int(4), int(5)]);
      const result = callVerb('limit', [input, int(3)]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(3);
      }
    });

    it('returns all items if count exceeds array length', () => {
      const input = arr([int(1), int(2)]);
      const result = callVerb('limit', [input, int(10)]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(2);
      }
    });
  });

  describe('fillMissing', () => {
    it('replaces null values with default', () => {
      const input = arr([int(1), nil(), int(3)]);
      const result = callVerb('fillMissing', [input, int(0)]);
      expect(result.type).toBe('array');
    });

    it('handles empty array', () => {
      const result = callVerb('fillMissing', [arr([])]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(0);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation Verbs
// ─────────────────────────────────────────────────────────────────────────────

describe('Validation Verbs', () => {
  describe('assert', () => {
    it('returns condition when true', () => {
      const result = callVerb('assert', [bool(true)]);
      expect(result.type).toBe('boolean');
      if (result.type === 'boolean') {
        expect(result.value).toBe(true);
      }
    });

    it('returns null when condition is false', () => {
      const result = callVerb('assert', [bool(false)]);
      expect(result.type).toBe('null');
    });

    it('accepts optional message parameter', () => {
      const result = callVerb('assert', [bool(true), str('test message')]);
      expect(result.type).toBe('boolean');
    });

    it('returns null for empty args', () => {
      const result = callVerb('assert', []);
      expect(result.type).toBe('null');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Collection Verbs
// ─────────────────────────────────────────────────────────────────────────────

describe('Collection Verbs', () => {
  describe('toArray', () => {
    it('wraps single value in array', () => {
      const result = callVerb('toArray', [str('single')]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(1);
      }
    });

    it('returns array as-is', () => {
      const input = arr([str('a'), str('b')]);
      const result = callVerb('toArray', [input]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(2);
      }
    });

    it('returns empty array for null', () => {
      const result = callVerb('toArray', [nil()]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(0);
      }
    });
  });

  describe('toObject', () => {
    it('converts array of [key, value] pairs', () => {
      const pairs = arr([arr([str('a'), int(1)]), arr([str('b'), int(2)])]);
      const result = callVerb('toObject', [pairs]);
      expect(result.type).toBe('object');
    });

    it('returns null for non-array input', () => {
      const result = callVerb('toObject', [str('not an array')]);
      expect(result.type).toBe('null');
    });

    it('returns null for empty args', () => {
      const result = callVerb('toObject', []);
      expect(result.type).toBe('null');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JSON Query Verbs
// ─────────────────────────────────────────────────────────────────────────────

describe('JSON Query Verbs', () => {
  describe('jsonPath', () => {
    it('extracts value from simple path', () => {
      const input = obj({ name: str('test') });
      const result = callVerb('jsonPath', [input, str('$.name')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('test');
      }
    });

    it('extracts nested value', () => {
      // jsonPath works with plain object values, not nested TransformValue
      const input = obj({
        user: { name: 'John' },
      });
      const result = callVerb('jsonPath', [input, str('$.user.name')]);
      expect(result.type).toBe('string');
    });

    it('returns null for missing path', () => {
      const input = obj({ name: str('test') });
      const result = callVerb('jsonPath', [input, str('$.missing')]);
      expect(result.type).toBe('null');
    });

    it('handles array index', () => {
      // jsonPath works with plain object/array values
      const input = obj({
        items: ['first', 'second'],
      });
      const result = callVerb('jsonPath', [input, str('$.items[0]')]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('first');
      }
    });
  });
});
