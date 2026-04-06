/**
 * ODIN Validator - ReDoS (Regular Expression Denial of Service) Protection.
 *
 * Provides utilities to detect and mitigate dangerous regex patterns that
 * could cause catastrophic backtracking when validating user-provided schemas.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

import { SECURITY_LIMITS } from '../utils/security-limits.js';

/** Maximum allowed regex pattern length to prevent complexity attacks */
export const MAX_REGEX_PATTERN_LENGTH = SECURITY_LIMITS.MAX_REGEX_PATTERN_LENGTH;

/** Maximum time (ms) allowed for regex execution before warning */
export const MAX_REGEX_EXECUTION_MS = 100;

/** Maximum string length for pattern matching (longer strings with complex patterns are risky) */
export const MAX_PATTERN_STRING_LENGTH = 10000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of safe regex test execution.
 */
export interface SafeRegexResult {
  /** Whether the pattern matched */
  matched: boolean;
  /** Whether execution exceeded time threshold */
  timedOut: boolean;
  /** Execution time in milliseconds */
  executionTimeMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Safety Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a regex pattern contains potentially dangerous ReDoS patterns.
 * Detects nested quantifiers and other patterns known to cause catastrophic backtracking.
 *
 * @param pattern - The regex pattern to analyze
 * @returns true if the pattern is considered unsafe
 */
export function isUnsafeRegexPattern(pattern: string): boolean {
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return true;
  }

  // Detect nested quantifiers: (a+)+, (a*)+, (a+)*, (a*)*
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern)) {
    return true;
  }

  // Detect overlapping alternations with quantifiers: (a|a)+, (ab|a)+
  if (/\([^)]*\|[^)]*\)[+*]/.test(pattern)) {
    return true;
  }

  // Detect greedy .+ or .* followed by quantifier: (.+)+, (.*)+
  if (/\(\.[+*][^)]*\)[+*]/.test(pattern)) {
    return true;
  }

  // Detect multiple quantifiers in sequence without anchor: a+b+c+
  // (these can be slow on non-matching input)
  const quantifierRuns = pattern.match(/[^\\][+*]{1}[^+*?{()[\]\\][+*]{1}/g);
  if (quantifierRuns && quantifierRuns.length >= 3) {
    return true;
  }

  // Detect character class followed by same class with quantifiers: \w+\w+
  if (/\\w[+*].*\\w[+*]/.test(pattern) || /\\d[+*].*\\d[+*]/.test(pattern)) {
    return true;
  }

  // Detect alternation groups with bounded quantifiers: (a|ab){N}
  // These can cause catastrophic backtracking even without + or *
  // Simple bounded quantifiers like \d{12} are safe (no nested/overlapping)
  if (/\([^)]*\|[^)]*\)\{/.test(pattern)) {
    return true;
  }

  // Detect groups containing quantifiers followed by bounded repetition: (a+){10}, (.*){5}
  // This catches nested quantifier patterns with bounded outer repetition
  if (/\([^)]*[+*][^)]*\)\{\d/.test(pattern)) {
    return true;
  }

  // Detect backreferences which can cause exponential behavior
  // Check for \1, \2, etc. references with quantified groups
  if (/\\[1-9]/.test(pattern) && /\([^)]*\)[+*]/.test(pattern)) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe Regex Execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a regex test with timing protection.
 *
 * Note: JavaScript can't interrupt synchronous regex execution, but we can
 * detect slow patterns after execution and limit input string size.
 *
 * @param regex - The compiled regex to test
 * @param value - The string value to test against
 * @returns Result including match status and timing information
 *
 * @example
 * ```typescript
 * const result = safeRegexTest(/^[a-z]+$/, 'hello');
 * if (result.timedOut) {
 *   console.warn('Pattern took too long:', result.executionTimeMs);
 * } else if (result.matched) {
 *   console.log('Pattern matched');
 * }
 * ```
 */
export function safeRegexTest(regex: RegExp, value: string): SafeRegexResult {
  // Refuse to run pattern on very long strings (defense in depth)
  if (value.length > MAX_PATTERN_STRING_LENGTH) {
    return { matched: false, timedOut: true, executionTimeMs: 0 };
  }

  const start = performance.now();
  const matched = regex.test(value);
  const executionTimeMs = performance.now() - start;

  return {
    matched,
    timedOut: executionTimeMs > MAX_REGEX_EXECUTION_MS,
    executionTimeMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Complexity Estimation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate the complexity level of a regex pattern.
 * Higher values indicate more potential for slowness.
 *
 * @param pattern - The regex pattern to analyze
 * @returns Complexity score (0-100, higher is more complex)
 */
export function estimatePatternComplexity(pattern: string): number {
  let score = 0;

  // Length contributes to complexity
  score += Math.min(pattern.length / 10, 20);

  // Count quantifiers
  const quantifiers = (pattern.match(/[+*?]/g) || []).length;
  score += quantifiers * 5;

  // Count alternations
  const alternations = (pattern.match(/\|/g) || []).length;
  score += alternations * 10;

  // Count groups
  const groups = (pattern.match(/\(/g) || []).length;
  score += groups * 3;

  // Nested structures are more complex
  if (/\([^)]*\(/.test(pattern)) {
    score += 20;
  }

  // Backreferences are expensive
  const backrefs = (pattern.match(/\\[1-9]/g) || []).length;
  score += backrefs * 15;

  // Lookahead/lookbehind
  if (/\(\?[=!<]/.test(pattern)) {
    score += 10;
  }

  return Math.min(score, 100);
}
