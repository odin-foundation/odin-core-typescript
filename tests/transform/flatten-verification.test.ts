/**
 * Verification test for flatten verb with CDM arrays
 */

import { describe, it, expect } from 'vitest';
import { flatten } from '../../src/transform/verbs/array.js';
import type { TransformValue } from '../../src/types/transform.js';

const arr = (items: unknown[]): TransformValue => ({
  type: 'array',
  items: items as any,
});

const int = (n: number): TransformValue => ({ type: 'integer', value: n });

describe('Flatten Verb - CDM Array Handling', () => {
  it('should flatten nested CDM arrays one level deep', () => {
    // Input: [[1,2],[3,4],[5,6]]
    const input = arr([arr([int(1), int(2)]), arr([int(3), int(4)]), arr([int(5), int(6)])]);

    const result = flatten([input]);

    // Expected: [1,2,3,4,5,6]
    expect(result.type).toBe('array');
    expect(result.items).toHaveLength(6);

    const items = result.items as TransformValue[];
    expect(items[0]).toEqual(int(1));
    expect(items[1]).toEqual(int(2));
    expect(items[2]).toEqual(int(3));
    expect(items[3]).toEqual(int(4));
    expect(items[4]).toEqual(int(5));
    expect(items[5]).toEqual(int(6));
  });

  it('should flatten mixed array with CDM arrays and primitives', () => {
    // Input: [1, [2,3], 4, [5]]
    const input = arr([int(1), arr([int(2), int(3)]), int(4), arr([int(5)])]);

    const result = flatten([input]);

    // Expected: [1,2,3,4,5]
    expect(result.type).toBe('array');
    expect(result.items).toHaveLength(5);

    const items = result.items as TransformValue[];
    expect(items[0]).toEqual(int(1));
    expect(items[1]).toEqual(int(2));
    expect(items[2]).toEqual(int(3));
    expect(items[3]).toEqual(int(4));
    expect(items[4]).toEqual(int(5));
  });

  it('should handle raw JavaScript arrays as well', () => {
    // Input: [[1,2],[3,4]] as raw arrays
    const input = arr([
      [1, 2],
      [3, 4],
    ]);

    const result = flatten([input]);

    // Expected: [1,2,3,4]
    expect(result.type).toBe('array');
    expect(result.items).toHaveLength(4);
    expect(result.items).toEqual([1, 2, 3, 4]);
  });

  it('should handle empty arrays', () => {
    const input = arr([]);
    const result = flatten([input]);

    expect(result.type).toBe('array');
    expect(result.items).toHaveLength(0);
  });

  it('should handle array with no nested arrays', () => {
    const input = arr([int(1), int(2), int(3)]);
    const result = flatten([input]);

    expect(result.type).toBe('array');
    expect(result.items).toHaveLength(3);

    const items = result.items as TransformValue[];
    expect(items[0]).toEqual(int(1));
    expect(items[1]).toEqual(int(2));
    expect(items[2]).toEqual(int(3));
  });
});
