/**
 * Resource Limits Tests
 *
 * Tests for resource exhaustion prevention:
 * - Streaming parser buffer limits
 * - Import count limits
 * - Type expansion limits
 */

import { describe, it, expect } from 'vitest';
import { SECURITY_LIMITS } from '../../../src/utils/security-limits.js';

describe('Import Limits', () => {
  it('should have reasonable import limits', () => {
    expect(SECURITY_LIMITS.MAX_TOTAL_IMPORTS).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_TOTAL_IMPORTS).toBeLessThanOrEqual(10000);

    expect(SECURITY_LIMITS.MAX_IMPORT_DEPTH).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_IMPORT_DEPTH).toBeLessThanOrEqual(100);
  });

  it('should prevent diamond dependency explosion', () => {
    // The MAX_TOTAL_IMPORTS limit prevents 2^N file explosion
    // With depth 10 and branching factor 2, naive traversal = 1024 files
    // With limit = 1000, this is prevented
    expect(SECURITY_LIMITS.MAX_TOTAL_IMPORTS).toBeLessThan(Math.pow(2, 11));
  });
});

describe('Type Expansion Limits', () => {
  it('should have reasonable type expansion limits', () => {
    expect(SECURITY_LIMITS.MAX_TYPE_FIELDS).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_TYPE_FIELDS).toBeLessThanOrEqual(10000);

    expect(SECURITY_LIMITS.MAX_COMPOSITE_TYPES).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_COMPOSITE_TYPES).toBeLessThanOrEqual(20);
  });
});

describe('Buffer Size Limits', () => {
  it('should have reasonable buffer limits', () => {
    expect(SECURITY_LIMITS.MAX_BUFFER_SIZE).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_STREAMING_BUFFER).toBeGreaterThan(0);

    // Streaming buffer should be smaller than total buffer
    expect(SECURITY_LIMITS.MAX_STREAMING_BUFFER).toBeLessThanOrEqual(
      SECURITY_LIMITS.MAX_BUFFER_SIZE
    );
  });

  it('should have reasonable chunk sizes', () => {
    expect(SECURITY_LIMITS.MAX_BINARY_CHUNK_SIZE).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_BINARY_CHUNK_SIZE).toBeLessThanOrEqual(1024 * 1024); // 1MB max

    expect(SECURITY_LIMITS.BUFFER_COMPACT_THRESHOLD).toBeGreaterThan(0);
  });
});

describe('String Operation Limits', () => {
  it('should have reasonable string limits', () => {
    expect(SECURITY_LIMITS.MAX_STRING_LENGTH).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_STRING_REPEAT).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_LEVENSHTEIN_LENGTH).toBeGreaterThan(0);
  });

  it('should prevent string multiplication attacks', () => {
    // MAX_STRING_REPEAT * reasonable base string should not exceed memory
    // e.g., 10000 repeats of 1000 char string = 10MB, which is reasonable
    const worstCase = SECURITY_LIMITS.MAX_STRING_REPEAT * 1000;
    expect(worstCase).toBeLessThan(100 * 1024 * 1024); // 100MB
  });
});

describe('Recursion Limits', () => {
  it('should have reasonable recursion limits', () => {
    expect(SECURITY_LIMITS.MAX_RECURSION_DEPTH).toBeGreaterThanOrEqual(32);
    expect(SECURITY_LIMITS.MAX_RECURSION_DEPTH).toBeLessThanOrEqual(100);

    expect(SECURITY_LIMITS.MAX_CIRCULAR_REF_DEPTH).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_TYPE_EXPANSION_DEPTH).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_PATH_RESOLUTION_DEPTH).toBeGreaterThan(0);
  });

  it('should have loop nesting limit', () => {
    expect(SECURITY_LIMITS.MAX_LOOP_NESTING).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_LOOP_NESTING).toBeLessThanOrEqual(20);
  });

  it('should have path segment limit', () => {
    expect(SECURITY_LIMITS.MAX_PATH_SEGMENTS).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_PATH_SEGMENTS).toBeLessThanOrEqual(200);
  });
});

describe('Network Limits', () => {
  it('should have fetch timeout', () => {
    expect(SECURITY_LIMITS.FETCH_TIMEOUT_MS).toBeGreaterThan(0);
    // Should be at least 10 seconds for slow networks
    expect(SECURITY_LIMITS.FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(10000);
    // Should not be longer than 60 seconds
    expect(SECURITY_LIMITS.FETCH_TIMEOUT_MS).toBeLessThanOrEqual(60000);
  });
});

describe('CSV Limits', () => {
  it('should have column limit', () => {
    expect(SECURITY_LIMITS.MAX_CSV_COLUMNS).toBeGreaterThan(0);
    // Should allow reasonable spreadsheets (1000+ columns)
    expect(SECURITY_LIMITS.MAX_CSV_COLUMNS).toBeGreaterThanOrEqual(1000);
    // Should prevent excessive columns
    expect(SECURITY_LIMITS.MAX_CSV_COLUMNS).toBeLessThanOrEqual(100000);
  });
});

describe('Regex Limits', () => {
  it('should have pattern length limit', () => {
    expect(SECURITY_LIMITS.MAX_REGEX_PATTERN_LENGTH).toBeGreaterThan(0);
  });
});

describe('Transform Limits', () => {
  it('should have record limit', () => {
    expect(SECURITY_LIMITS.MAX_RECORDS).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_RECORDS).toBeLessThanOrEqual(1000000);
  });

  it('should have expression depth limit', () => {
    expect(SECURITY_LIMITS.MAX_EXPRESSION_DEPTH).toBeGreaterThan(0);
    expect(SECURITY_LIMITS.MAX_EXPRESSION_DEPTH).toBeLessThanOrEqual(100);
  });
});
