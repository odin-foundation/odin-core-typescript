/**
 * Security Limits Tests
 *
 * Tests for security-related limits and protections across the ODIN SDK.
 */

import { describe, it, expect } from 'vitest';
import {
  SECURITY_LIMITS,
  uint8ArrayToBase64,
  validateArrayIndex,
  validateSafeNumber,
  isValidNumberString,
  isValidXmlName,
} from '../../../src/utils/security-limits.js';

describe('SECURITY_LIMITS', () => {
  describe('constants', () => {
    it('should have reasonable recursion limits', () => {
      expect(SECURITY_LIMITS.MAX_RECURSION_DEPTH).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.MAX_RECURSION_DEPTH).toBeLessThanOrEqual(100);

      expect(SECURITY_LIMITS.MAX_CIRCULAR_REF_DEPTH).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.MAX_TYPE_EXPANSION_DEPTH).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.MAX_PATH_RESOLUTION_DEPTH).toBeGreaterThan(0);
    });

    it('should have reasonable parser limits', () => {
      expect(SECURITY_LIMITS.MAX_ARRAY_INDEX).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.MAX_ARRAY_INDEX).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);

      expect(SECURITY_LIMITS.MAX_DIRECTIVES_PER_ASSIGNMENT).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.MAX_STRING_LENGTH).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.MAX_NESTING_DEPTH).toBeGreaterThan(0);
    });

    it('should have reasonable transform limits', () => {
      expect(SECURITY_LIMITS.MAX_RECORDS).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.MAX_EXPRESSION_DEPTH).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.MAX_STRING_REPEAT).toBeGreaterThan(0);
    });

    it('should have reasonable memory limits', () => {
      expect(SECURITY_LIMITS.MAX_BUFFER_SIZE).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.MAX_BINARY_CHUNK_SIZE).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.MAX_STREAMING_BUFFER).toBeGreaterThan(0);
    });

    it('should have reasonable cache limits', () => {
      expect(SECURITY_LIMITS.MAX_PATH_POOL_SIZE).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.CACHE_EVICTION_PERCENT).toBeGreaterThan(0);
      expect(SECURITY_LIMITS.CACHE_EVICTION_PERCENT).toBeLessThanOrEqual(1);
    });
  });
});

describe('uint8ArrayToBase64', () => {
  it('should encode empty array', () => {
    const result = uint8ArrayToBase64(new Uint8Array([]));
    expect(result).toBe('');
  });

  it('should encode small data', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const result = uint8ArrayToBase64(data);
    expect(result).toBe('SGVsbG8=');
  });

  it('should handle large data without stack overflow', () => {
    // Create data larger than the chunk size (65536)
    const largeData = new Uint8Array(100000);
    for (let i = 0; i < largeData.length; i++) {
      largeData[i] = i % 256;
    }

    // Should not throw stack overflow
    const result = uint8ArrayToBase64(largeData);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should produce valid base64', () => {
    const data = new Uint8Array([0, 127, 255, 1, 128, 254]);
    const result = uint8ArrayToBase64(data);

    // Should be valid base64
    expect(() => atob(result)).not.toThrow();
  });
});

describe('validateArrayIndex', () => {
  it('should accept valid indices', () => {
    expect(validateArrayIndex(0)).toBe(true);
    expect(validateArrayIndex(1)).toBe(true);
    expect(validateArrayIndex(100)).toBe(true);
    expect(validateArrayIndex(999999)).toBe(true);
  });

  it('should reject negative indices', () => {
    expect(validateArrayIndex(-1)).toBe(false);
    expect(validateArrayIndex(-100)).toBe(false);
  });

  it('should reject indices exceeding limit', () => {
    expect(validateArrayIndex(SECURITY_LIMITS.MAX_ARRAY_INDEX + 1)).toBe(false);
  });

  it('should reject non-integer indices', () => {
    expect(validateArrayIndex(1.5)).toBe(false);
    expect(validateArrayIndex(NaN)).toBe(false);
    expect(validateArrayIndex(Infinity)).toBe(false);
  });
});

describe('validateSafeNumber', () => {
  it('should accept normal numbers', () => {
    expect(validateSafeNumber(0)).toBe(true);
    expect(validateSafeNumber(42)).toBe(true);
    expect(validateSafeNumber(-100)).toBe(true);
    expect(validateSafeNumber(3.14159)).toBe(true);
  });

  it('should accept numbers within safe integer range', () => {
    expect(validateSafeNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(validateSafeNumber(Number.MIN_SAFE_INTEGER)).toBe(true);
  });

  it('should reject non-finite numbers', () => {
    expect(validateSafeNumber(Infinity)).toBe(false);
    expect(validateSafeNumber(-Infinity)).toBe(false);
    expect(validateSafeNumber(NaN)).toBe(false);
  });
});

describe('isValidNumberString', () => {
  it('should accept valid integer strings', () => {
    expect(isValidNumberString('0')).toBe(true);
    expect(isValidNumberString('42')).toBe(true);
    expect(isValidNumberString('-100')).toBe(true);
  });

  it('should accept valid decimal strings', () => {
    expect(isValidNumberString('3.14')).toBe(true);
    expect(isValidNumberString('-2.5')).toBe(true);
    expect(isValidNumberString('0.5')).toBe(true);
    expect(isValidNumberString('-0.5')).toBe(true);
  });

  it('should accept scientific notation', () => {
    expect(isValidNumberString('1e10')).toBe(true);
    expect(isValidNumberString('1E10')).toBe(true);
    expect(isValidNumberString('1.5e-10')).toBe(true);
    expect(isValidNumberString('-1.5E+10')).toBe(true);
  });

  it('should reject invalid strings', () => {
    expect(isValidNumberString('')).toBe(false);
    expect(isValidNumberString('abc')).toBe(false);
    expect(isValidNumberString('12abc')).toBe(false);
    expect(isValidNumberString('1.2.3')).toBe(false);
    expect(isValidNumberString('1e')).toBe(false);
    expect(isValidNumberString('Infinity')).toBe(false);
    expect(isValidNumberString('NaN')).toBe(false);
  });
});

describe('isValidXmlName', () => {
  it('should accept valid XML names', () => {
    expect(isValidXmlName('element')).toBe(true);
    expect(isValidXmlName('Element')).toBe(true);
    expect(isValidXmlName('_private')).toBe(true);
    expect(isValidXmlName('my-element')).toBe(true);
    expect(isValidXmlName('my.element')).toBe(true);
    expect(isValidXmlName('element123')).toBe(true);
  });

  it('should reject names starting with invalid characters', () => {
    expect(isValidXmlName('123element')).toBe(false);
    expect(isValidXmlName('-element')).toBe(false);
    expect(isValidXmlName('.element')).toBe(false);
  });

  it('should reject names with invalid characters', () => {
    expect(isValidXmlName('my element')).toBe(false);
    expect(isValidXmlName('my@element')).toBe(false);
    expect(isValidXmlName('my#element')).toBe(false);
  });

  it('should reject empty names', () => {
    expect(isValidXmlName('')).toBe(false);
  });

  it('should accept names that happen to start with xml', () => {
    // Note: The basic validation accepts xml-prefixed names
    // Full XML spec compliance would reject these
    expect(isValidXmlName('xml')).toBe(true);
    expect(isValidXmlName('xmlElement')).toBe(true);
  });
});
