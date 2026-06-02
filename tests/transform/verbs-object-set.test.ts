/**
 * Unit tests for the object-manipulation and array set/collection verbs:
 * object: pick, omit, fromEntries, invert, defaults, renameKeys, compactObject
 * array:  intersection, union, difference, symmetricDifference, countBy, keyBy,
 *         explode, window
 */
import { describe, it, expect } from 'vitest';
import { callVerb, str, int, arr, obj, nil } from './helpers.js';

describe('object verbs', () => {
  describe('pick', () => {
    it('keeps only the named keys', () => {
      const o = obj({ a: 1, b: 'x', c: null });
      expect(callVerb('pick', [o, str('a'), str('b')]).value).toEqual({ a: 1, b: 'x' });
    });
    it('ignores keys that are absent', () => {
      const o = obj({ a: 1 });
      expect(callVerb('pick', [o, str('a'), str('zzz')]).value).toEqual({ a: 1 });
    });
    it('returns null for a non-object', () => {
      expect(callVerb('pick', [str('nope'), str('a')]).type).toBe('null');
    });
  });

  describe('omit', () => {
    it('drops the named keys and preserves order', () => {
      const o = obj({ a: 1, b: 2, c: 3 });
      expect(callVerb('omit', [o, str('b')]).value).toEqual({ a: 1, c: 3 });
    });
  });

  describe('fromEntries', () => {
    it('builds an object from [key, value] pairs', () => {
      const pairs = arr([['k1', 'v1'], ['k2', 2]]);
      expect(callVerb('fromEntries', [pairs]).value).toEqual({ k1: 'v1', k2: 2 });
    });
  });

  describe('invert', () => {
    it('swaps keys and values', () => {
      expect(callVerb('invert', [obj({ a: 'x', b: 'y' })]).value).toEqual({ x: 'a', y: 'b' });
    });
  });

  describe('defaults', () => {
    it('fills only missing keys; the source wins', () => {
      const r = callVerb('defaults', [obj({ a: 1 }), obj({ a: 9, b: 2 })]);
      expect(r.value).toEqual({ a: 1, b: 2 });
    });
  });

  describe('renameKeys', () => {
    it('renames listed keys and leaves the rest', () => {
      const r = callVerb('renameKeys', [obj({ a: 1, b: 2 }), obj({ a: 'x' })]);
      expect(r.value).toEqual({ x: 1, b: 2 });
    });
  });

  describe('compactObject', () => {
    it('drops null, empty string, empty array, and empty object', () => {
      const o = obj({ a: 1, b: null, c: '', d: [], e: {} });
      expect(callVerb('compactObject', [o]).value).toEqual({ a: 1 });
    });
  });
});

describe('array set ops and collection verbs', () => {
  const items = (xs: unknown[]) => arr(xs);

  it('intersection keeps values in both (deduped, A order)', () => {
    const r = callVerb('intersection', [items([1, 2, 3]), items([2, 3, 4])]);
    expect(r.items).toEqual([2, 3]);
  });

  it('union keeps values in either (deduped, A then new-from-B)', () => {
    const r = callVerb('union', [items([1, 2]), items([2, 3])]);
    expect(r.items).toEqual([1, 2, 3]);
  });

  it('difference keeps values in A not in B', () => {
    const r = callVerb('difference', [items([1, 2, 3]), items([2])]);
    expect(r.items).toEqual([1, 3]);
  });

  it('symmetricDifference keeps values in exactly one', () => {
    const r = callVerb('symmetricDifference', [items([1, 2, 3]), items([2, 3, 4])]);
    expect(r.items).toEqual([1, 4]);
  });

  it('countBy counts by value with keys sorted', () => {
    const r = callVerb('countBy', [items(['b', 'a', 'b', 'c', 'a', 'a'])]);
    expect(Object.keys(r.value as object)).toEqual(['a', 'b', 'c']);
    expect(r.value).toEqual({ a: int(3), b: int(2), c: int(1) });
  });

  it('countBy counts by a named field', () => {
    const r = callVerb('countBy', [items([{ s: 'x' }, { s: 'y' }, { s: 'x' }]), str('s')]);
    expect(r.value).toEqual({ x: int(2), y: int(1) });
  });

  it('keyBy indexes objects by a field (last wins)', () => {
    const r = callVerb('keyBy', [items([{ id: 'p', n: 1 }, { id: 'q', n: 2 }]), str('id')]);
    expect(Object.keys(r.value as object)).toEqual(['p', 'q']);
  });

  it('explode emits one row per element of the array field', () => {
    const r = callVerb('explode', [items([{ id: 1, tags: ['a', 'b'] }]), str('tags')]);
    expect(r.items).toEqual([{ id: 1, tags: 'a' }, { id: 1, tags: 'b' }]);
  });

  it('window produces sliding windows of length n', () => {
    const r = callVerb('window', [items([1, 2, 3, 4]), int(2)]);
    expect(r.type).toBe('array');
    if (r.type === 'array') {
      expect(r.items).toHaveLength(3);
      expect((r.items[0] as { items: unknown[] }).items).toEqual([1, 2]);
      expect((r.items[2] as { items: unknown[] }).items).toEqual([3, 4]);
    }
  });

  it('window is empty when n exceeds the array length', () => {
    expect(callVerb('window', [items([1, 2]), int(5)]).items).toEqual([]);
  });
});
