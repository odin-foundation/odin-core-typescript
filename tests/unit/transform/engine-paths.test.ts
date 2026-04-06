/**
 * Tests for engine-paths module.
 *
 * Covers nested value assignment and segment path utilities.
 */

import { describe, it, expect } from 'vitest';
import { setNestedValue, getSegmentOutputPath } from '../../../src/transform/engine-paths.js';

// ─────────────────────────────────────────────────────────────────────────────
// setNestedValue Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('setNestedValue', () => {
  describe('single level paths', () => {
    it('sets value at single key', () => {
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, 'name', 'John');
      expect(obj.name).toBe('John');
    });

    it('overwrites existing value', () => {
      const obj: Record<string, unknown> = { name: 'Jane' };
      setNestedValue(obj, 'name', 'John');
      expect(obj.name).toBe('John');
    });
  });

  describe('nested paths', () => {
    it('creates intermediate objects', () => {
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, 'policy.number', 'POL123');
      expect(obj.policy).toBeDefined();
      expect((obj.policy as Record<string, unknown>).number).toBe('POL123');
    });

    it('creates deeply nested structure', () => {
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, 'a.b.c.d', 'deep value');
      expect(
        (
          ((obj.a as Record<string, unknown>).b as Record<string, unknown>).c as Record<
            string,
            unknown
          >
        ).d
      ).toBe('deep value');
    });

    it('preserves existing intermediate objects', () => {
      const obj: Record<string, unknown> = { policy: { type: 'auto' } };
      setNestedValue(obj, 'policy.number', 'POL123');
      expect((obj.policy as Record<string, unknown>).type).toBe('auto');
      expect((obj.policy as Record<string, unknown>).number).toBe('POL123');
    });

    it('sets multiple values at different paths', () => {
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, 'policy.number', 'POL123');
      setNestedValue(obj, 'policy.type', 'auto');
      setNestedValue(obj, 'customer.name', 'John');
      expect((obj.policy as Record<string, unknown>).number).toBe('POL123');
      expect((obj.policy as Record<string, unknown>).type).toBe('auto');
      expect((obj.customer as Record<string, unknown>).name).toBe('John');
    });
  });

  describe('value types', () => {
    it('sets string value', () => {
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, 'value', 'test');
      expect(obj.value).toBe('test');
    });

    it('sets number value', () => {
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, 'value', 42);
      expect(obj.value).toBe(42);
    });

    it('sets boolean value', () => {
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, 'value', true);
      expect(obj.value).toBe(true);
    });

    it('sets null value', () => {
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, 'value', null);
      expect(obj.value).toBe(null);
    });

    it('sets object value', () => {
      const obj: Record<string, unknown> = {};
      const nested = { a: 1, b: 2 };
      setNestedValue(obj, 'value', nested);
      expect(obj.value).toBe(nested);
    });

    it('sets array value', () => {
      const obj: Record<string, unknown> = {};
      const arr = [1, 2, 3];
      setNestedValue(obj, 'value', arr);
      expect(obj.value).toBe(arr);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSegmentOutputPath Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getSegmentOutputPath', () => {
  it('strips segment. prefix and lowercases', () => {
    expect(getSegmentOutputPath('segment.VEH')).toBe('veh');
  });

  it('handles mixed case segment name', () => {
    expect(getSegmentOutputPath('segment.Vehicle')).toBe('vehicle');
  });

  it('handles already lowercase segment name', () => {
    expect(getSegmentOutputPath('segment.policy')).toBe('policy');
  });

  it('returns non-segment path unchanged', () => {
    expect(getSegmentOutputPath('vehicles')).toBe('vehicles');
  });

  it('returns path starting with segment unchanged if no dot', () => {
    expect(getSegmentOutputPath('segmentVEH')).toBe('segmentVEH');
  });

  it('handles segment with multiple parts after prefix', () => {
    expect(getSegmentOutputPath('segment.VEH_COVERAGE')).toBe('veh_coverage');
  });
});
