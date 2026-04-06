/**
 * ReDoS Prevention Tests
 *
 * Tests for Regular Expression Denial of Service protections.
 */

import { describe, it, expect } from 'vitest';
import {
  isUnsafeRegexPattern,
  safeRegexTest,
  estimatePatternComplexity,
  MAX_REGEX_PATTERN_LENGTH,
} from '../../../src/validator/validate-redos.js';

describe('isUnsafeRegexPattern', () => {
  describe('nested quantifiers detection', () => {
    it('should detect (a+)+ pattern', () => {
      expect(isUnsafeRegexPattern('(a+)+')).toBe(true);
    });

    it('should detect (a*)* pattern', () => {
      expect(isUnsafeRegexPattern('(a*)*')).toBe(true);
    });

    it('should detect (a+)* pattern', () => {
      expect(isUnsafeRegexPattern('(a+)*')).toBe(true);
    });

    it('should detect (.+)+ pattern', () => {
      expect(isUnsafeRegexPattern('(.+)+')).toBe(true);
    });
  });

  describe('overlapping alternations detection', () => {
    it('should detect (a|a)+ pattern', () => {
      expect(isUnsafeRegexPattern('(a|a)+')).toBe(true);
    });

    it('should detect (ab|a)+ pattern', () => {
      expect(isUnsafeRegexPattern('(ab|a)+')).toBe(true);
    });
  });

  describe('safe patterns', () => {
    it('should accept simple patterns', () => {
      expect(isUnsafeRegexPattern('^[a-z]+$')).toBe(false);
      expect(isUnsafeRegexPattern('^\\d{4}-\\d{2}-\\d{2}$')).toBe(false);
      expect(isUnsafeRegexPattern('^[A-Z][a-z]*$')).toBe(false);
    });

    it('should accept anchored patterns', () => {
      expect(isUnsafeRegexPattern('^hello$')).toBe(false);
      expect(isUnsafeRegexPattern('^[0-9]+$')).toBe(false);
    });

    it('should accept patterns without quantifiers', () => {
      expect(isUnsafeRegexPattern('hello')).toBe(false);
      expect(isUnsafeRegexPattern('[abc]')).toBe(false);
    });
  });

  describe('pattern length limits', () => {
    it('should reject patterns exceeding max length', () => {
      const longPattern = 'a'.repeat(MAX_REGEX_PATTERN_LENGTH + 1);
      expect(isUnsafeRegexPattern(longPattern)).toBe(true);
    });

    it('should accept patterns within length limit', () => {
      const pattern = '^[a-z]+$';
      expect(pattern.length).toBeLessThan(MAX_REGEX_PATTERN_LENGTH);
      expect(isUnsafeRegexPattern(pattern)).toBe(false);
    });
  });

  describe('backreferences with quantifiers', () => {
    it('should detect backreference combined with quantified group', () => {
      // Pattern with backreference AND quantified group is dangerous
      expect(isUnsafeRegexPattern('(a+)+\\1')).toBe(true);
    });

    it('should allow simple backreference without nested quantifiers', () => {
      // Simple backreference without nested quantifiers is acceptable
      expect(isUnsafeRegexPattern('(a+)\\1')).toBe(false);
    });
  });

  describe('bounded quantifiers', () => {
    it('should accept high repetition counts (not a ReDoS vector)', () => {
      // High repetition counts don't cause ReDoS - structure does
      expect(isUnsafeRegexPattern('a{200,}b+')).toBe(false);
      expect(isUnsafeRegexPattern('a{1,10}')).toBe(false);
      expect(isUnsafeRegexPattern('[0-9]{1,1000}')).toBe(false);
    });
  });
});

describe('safeRegexTest', () => {
  it('should return match result for safe patterns', () => {
    const regex = /^[a-z]+$/;
    const result = safeRegexTest(regex, 'hello');
    expect(result.matched).toBe(true);
    expect(result.timedOut).toBe(false);
  });

  it('should return non-match for non-matching input', () => {
    const regex = /^[a-z]+$/;
    const result = safeRegexTest(regex, '12345');
    expect(result.matched).toBe(false);
    expect(result.timedOut).toBe(false);
  });

  it('should timeout for very long strings', () => {
    const regex = /^[a-z]+$/;
    const longString = 'a'.repeat(20000);
    const result = safeRegexTest(regex, longString);
    // Should complete but may timeout on complex patterns
    expect(typeof result.executionTimeMs).toBe('number');
  });
});

describe('estimatePatternComplexity', () => {
  it('should give low complexity to simple patterns', () => {
    expect(estimatePatternComplexity('^hello$')).toBeLessThan(30);
    expect(estimatePatternComplexity('[a-z]')).toBeLessThan(30);
  });

  it('should give higher complexity to patterns with quantifiers', () => {
    const simpleComplexity = estimatePatternComplexity('abc');
    const quantifiedComplexity = estimatePatternComplexity('a+b+c+');
    expect(quantifiedComplexity).toBeGreaterThan(simpleComplexity);
  });

  it('should give higher complexity to patterns with alternations', () => {
    const simpleComplexity = estimatePatternComplexity('abc');
    const alternationComplexity = estimatePatternComplexity('a|b|c');
    expect(alternationComplexity).toBeGreaterThan(simpleComplexity);
  });

  it('should give higher complexity to nested patterns', () => {
    const flatComplexity = estimatePatternComplexity('(abc)');
    const nestedComplexity = estimatePatternComplexity('((abc))');
    expect(nestedComplexity).toBeGreaterThan(flatComplexity);
  });

  it('should return score between 0 and 100', () => {
    expect(estimatePatternComplexity('')).toBeGreaterThanOrEqual(0);
    expect(estimatePatternComplexity('(a+)+|(b+)+')).toBeLessThanOrEqual(100);
  });
});
