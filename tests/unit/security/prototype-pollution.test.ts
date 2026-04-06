/**
 * Prototype Pollution Prevention Tests
 *
 * Tests for protection against prototype pollution attacks in object verbs.
 */

import { describe, it, expect } from 'vitest';
import { keys, values, entries, has, get, merge } from '../../../src/transform/verbs/object.js';
import type { TransformValue } from '../../../src/types/transform.js';

// Helper to create object TransformValue
function createObj(value: Record<string, unknown>): TransformValue {
  return { type: 'object', value };
}

function createStr(value: string): TransformValue {
  return { type: 'string', value };
}

describe('Object Verbs Prototype Pollution Protection', () => {
  describe('%keys verb', () => {
    it('should return safe keys from object', () => {
      const obj = createObj({ a: 1, b: 2, c: 3 });
      const result = keys([obj]);
      expect(result.type).toBe('array');
      expect((result as { items: string[] }).items).toEqual(['a', 'b', 'c']);
    });

    it('should exclude __proto__ from keys', () => {
      const obj = createObj({ a: 1, __proto__: { evil: true } });
      const result = keys([obj]);
      const items = (result as { items: string[] }).items;
      expect(items).not.toContain('__proto__');
    });

    it('should exclude constructor from keys', () => {
      const obj = createObj({ a: 1, constructor: Function });
      const result = keys([obj]);
      const items = (result as { items: string[] }).items;
      expect(items).not.toContain('constructor');
    });

    it('should exclude prototype from keys', () => {
      const obj = createObj({ a: 1, prototype: {} });
      const result = keys([obj]);
      const items = (result as { items: string[] }).items;
      expect(items).not.toContain('prototype');
    });
  });

  describe('%values verb', () => {
    it('should return values for safe keys only', () => {
      const obj = createObj({ a: 1, b: 2, __proto__: { evil: true } });
      const result = values([obj]);
      const items = (result as { items: unknown[] }).items;
      expect(items).toEqual([1, 2]);
    });
  });

  describe('%entries verb', () => {
    it('should return entries for safe keys only', () => {
      const obj = createObj({ a: 1, __proto__: { evil: true } });
      const result = entries([obj]);
      const items = (result as { items: [string, unknown][] }).items;
      expect(items).toEqual([['a', 1]]);
    });
  });

  describe('%has verb', () => {
    it('should return true for existing safe keys', () => {
      const obj = createObj({ name: 'test', value: 42 });
      const result = has([obj, createStr('name')]);
      expect(result.type).toBe('boolean');
      expect((result as { value: boolean }).value).toBe(true);
    });

    it('should return false for __proto__', () => {
      const obj = createObj({ __proto__: { evil: true } });
      const result = has([obj, createStr('__proto__')]);
      expect((result as { value: boolean }).value).toBe(false);
    });

    it('should return false for constructor', () => {
      const obj = createObj({ constructor: Function });
      const result = has([obj, createStr('constructor')]);
      expect((result as { value: boolean }).value).toBe(false);
    });

    it('should return false for prototype', () => {
      const obj = createObj({ prototype: {} });
      const result = has([obj, createStr('prototype')]);
      expect((result as { value: boolean }).value).toBe(false);
    });

    it('should support nested path access safely', () => {
      const obj = createObj({ user: { name: 'test' } });
      const result = has([obj, createStr('user.name')]);
      expect((result as { value: boolean }).value).toBe(true);
    });

    it('should block nested __proto__ access', () => {
      const obj = createObj({ user: { __proto__: { evil: true } } });
      const result = has([obj, createStr('user.__proto__')]);
      expect((result as { value: boolean }).value).toBe(false);
    });
  });

  describe('%get verb', () => {
    it('should return value for safe keys', () => {
      const obj = createObj({ name: 'test' });
      const result = get([obj, createStr('name')]);
      expect(result.type).toBe('string');
      expect((result as { value: string }).value).toBe('test');
    });

    it('should return default for __proto__', () => {
      const obj = createObj({ __proto__: { evil: true } });
      const defaultVal = createStr('safe');
      const result = get([obj, createStr('__proto__'), defaultVal]);
      expect(result.type).toBe('string');
      expect((result as { value: string }).value).toBe('safe');
    });

    it('should return default for constructor', () => {
      const obj = createObj({ constructor: Function });
      const defaultVal = createStr('safe');
      const result = get([obj, createStr('constructor'), defaultVal]);
      expect((result as { value: string }).value).toBe('safe');
    });

    it('should support nested path access safely', () => {
      const obj = createObj({ user: { address: { city: 'NYC' } } });
      const result = get([obj, createStr('user.address.city')]);
      expect((result as { value: string }).value).toBe('NYC');
    });

    it('should block nested __proto__ access', () => {
      const obj = createObj({ user: { __proto__: { evil: true } } });
      const defaultVal = createStr('blocked');
      const result = get([obj, createStr('user.__proto__.evil'), defaultVal]);
      expect((result as { value: string }).value).toBe('blocked');
    });
  });

  describe('%merge verb', () => {
    it('should merge two objects', () => {
      const obj1 = createObj({ a: 1 });
      const obj2 = createObj({ b: 2 });
      const result = merge([obj1, obj2]);
      expect(result.type).toBe('object');
      expect((result as { value: Record<string, unknown> }).value).toEqual({ a: 1, b: 2 });
    });

    it('should allow second object to override first', () => {
      const obj1 = createObj({ a: 1, b: 2 });
      const obj2 = createObj({ b: 3, c: 4 });
      const result = merge([obj1, obj2]);
      expect((result as { value: Record<string, unknown> }).value).toEqual({ a: 1, b: 3, c: 4 });
    });
  });
});
