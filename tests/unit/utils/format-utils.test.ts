/**
 * Tests for format-utils module.
 *
 * Covers modifier formatting, string escaping, binary formatting, and date utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  formatModifierPrefix,
  hasAnyModifier,
  formatModifierAttributes,
  escapeOdinString,
  formatBinary,
  formatDateOnly,
} from '../../../src/utils/format-utils.js';
import type { OdinValue } from '../../../src/types/values.js';

// ─────────────────────────────────────────────────────────────────────────────
// formatModifierPrefix Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('formatModifierPrefix', () => {
  it('returns empty string for undefined modifiers', () => {
    expect(formatModifierPrefix(undefined)).toBe('');
  });

  it('returns empty string for empty modifiers object', () => {
    expect(formatModifierPrefix({})).toBe('');
  });

  it('returns empty string when all modifiers are false', () => {
    expect(formatModifierPrefix({ required: false, confidential: false, deprecated: false })).toBe(
      ''
    );
  });

  it('returns "!" for required only', () => {
    expect(formatModifierPrefix({ required: true })).toBe('!');
  });

  it('returns "*" for confidential only', () => {
    expect(formatModifierPrefix({ confidential: true })).toBe('*');
  });

  it('returns "-" for deprecated only', () => {
    expect(formatModifierPrefix({ deprecated: true })).toBe('-');
  });

  it('returns "!*" for required and confidential', () => {
    expect(formatModifierPrefix({ required: true, confidential: true })).toBe('!*');
  });

  it('returns "!-" for required and deprecated', () => {
    expect(formatModifierPrefix({ required: true, deprecated: true })).toBe('!-');
  });

  it('returns "*-" for confidential and deprecated', () => {
    expect(formatModifierPrefix({ confidential: true, deprecated: true })).toBe('*-');
  });

  it('returns "!*-" for all three modifiers', () => {
    expect(formatModifierPrefix({ required: true, confidential: true, deprecated: true })).toBe(
      '!*-'
    );
  });

  it('preserves correct order regardless of input object order', () => {
    // Even if deprecated is listed first, output should still be !*-
    expect(formatModifierPrefix({ deprecated: true, required: true, confidential: true })).toBe(
      '!*-'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasAnyModifier Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('hasAnyModifier', () => {
  it('returns false for undefined modifiers', () => {
    expect(hasAnyModifier(undefined)).toBe(false);
  });

  it('returns false for empty modifiers object', () => {
    expect(hasAnyModifier({})).toBe(false);
  });

  it('returns false when all modifiers are false', () => {
    expect(hasAnyModifier({ required: false, confidential: false, deprecated: false })).toBe(false);
  });

  it('returns true when required is true', () => {
    expect(hasAnyModifier({ required: true })).toBe(true);
  });

  it('returns true when confidential is true', () => {
    expect(hasAnyModifier({ confidential: true })).toBe(true);
  });

  it('returns true when deprecated is true', () => {
    expect(hasAnyModifier({ deprecated: true })).toBe(true);
  });

  it('returns true when multiple modifiers are true', () => {
    expect(hasAnyModifier({ required: true, confidential: true })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatModifierAttributes Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('formatModifierAttributes', () => {
  it('returns empty array for undefined modifiers', () => {
    expect(formatModifierAttributes(undefined)).toEqual([]);
  });

  it('returns empty array for empty modifiers object', () => {
    expect(formatModifierAttributes({})).toEqual([]);
  });

  it('returns single attribute for required only', () => {
    expect(formatModifierAttributes({ required: true })).toEqual(['odin:required="true"']);
  });

  it('returns single attribute for confidential only', () => {
    expect(formatModifierAttributes({ confidential: true })).toEqual(['odin:confidential="true"']);
  });

  it('returns single attribute for deprecated only', () => {
    expect(formatModifierAttributes({ deprecated: true })).toEqual(['odin:deprecated="true"']);
  });

  it('returns attributes in correct order for all modifiers', () => {
    const result = formatModifierAttributes({
      required: true,
      confidential: true,
      deprecated: true,
    });
    expect(result).toEqual([
      'odin:required="true"',
      'odin:confidential="true"',
      'odin:deprecated="true"',
    ]);
  });

  it('excludes false modifiers from output', () => {
    expect(formatModifierAttributes({ required: true, confidential: false })).toEqual([
      'odin:required="true"',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// escapeOdinString Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('escapeOdinString', () => {
  describe('regular mode (canonical=false)', () => {
    it('returns unchanged string when no escaping needed', () => {
      expect(escapeOdinString('hello world')).toBe('hello world');
    });

    it('returns empty string unchanged', () => {
      expect(escapeOdinString('')).toBe('');
    });

    it('escapes backslash', () => {
      expect(escapeOdinString('C:\\path')).toBe('C:\\\\path');
    });

    it('escapes double quote', () => {
      expect(escapeOdinString('say "hello"')).toBe('say \\"hello\\"');
    });

    it('escapes newline', () => {
      expect(escapeOdinString('line1\nline2')).toBe('line1\\nline2');
    });

    it('escapes carriage return', () => {
      expect(escapeOdinString('line1\rline2')).toBe('line1\\rline2');
    });

    it('escapes tab', () => {
      expect(escapeOdinString('col1\tcol2')).toBe('col1\\tcol2');
    });

    it('escapes multiple special characters', () => {
      expect(escapeOdinString('C:\\path\t"name"\n\r')).toBe('C:\\\\path\\t\\"name\\"\\n\\r');
    });

    it('handles consecutive escape characters', () => {
      expect(escapeOdinString('\\\\')).toBe('\\\\\\\\');
      expect(escapeOdinString('""')).toBe('\\"\\"');
      expect(escapeOdinString('\n\n')).toBe('\\n\\n');
    });

    it('handles escape at start of string', () => {
      expect(escapeOdinString('"start')).toBe('\\"start');
    });

    it('handles escape at end of string', () => {
      expect(escapeOdinString('end"')).toBe('end\\"');
    });

    it('preserves unicode characters', () => {
      expect(escapeOdinString('Hello')).toBe('Hello');
    });
  });

  describe('canonical mode (canonical=true)', () => {
    it('returns unchanged string when no escaping needed', () => {
      expect(escapeOdinString('hello world', true)).toBe('hello world');
    });

    it('escapes backslash', () => {
      expect(escapeOdinString('C:\\path', true)).toBe('C:\\\\path');
    });

    it('escapes double quote', () => {
      expect(escapeOdinString('say "hello"', true)).toBe('say \\"hello\\"');
    });

    it('escapes newline', () => {
      expect(escapeOdinString('line1\nline2', true)).toBe('line1\\nline2');
    });

    it('escapes carriage return', () => {
      expect(escapeOdinString('line1\rline2', true)).toBe('line1\\rline2');
    });

    it('escapes tab', () => {
      expect(escapeOdinString('col1\tcol2', true)).toBe('col1\\tcol2');
    });

    it('produces same output as regular mode', () => {
      const testStrings = ['C:\\path\t"name"\n\r', '\\\\', '""', 'no escape needed', '', 'Hello'];

      for (const str of testStrings) {
        expect(escapeOdinString(str, true)).toBe(escapeOdinString(str, false));
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatBinary Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('formatBinary', () => {
  it('formats binary without algorithm', () => {
    const value: OdinValue & { type: 'binary' } = {
      type: 'binary',
      data: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
    };
    expect(formatBinary(value)).toBe('^SGVsbG8=');
  });

  it('formats binary with algorithm', () => {
    const value: OdinValue & { type: 'binary' } = {
      type: 'binary',
      data: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
      algorithm: 'sha256',
    };
    expect(formatBinary(value)).toBe('^sha256:SGVsbG8=');
  });

  it('formats empty binary', () => {
    const value: OdinValue & { type: 'binary' } = {
      type: 'binary',
      data: new Uint8Array([]),
    };
    expect(formatBinary(value)).toBe('^');
  });

  it('formats single byte binary', () => {
    const value: OdinValue & { type: 'binary' } = {
      type: 'binary',
      data: new Uint8Array([255]),
    };
    expect(formatBinary(value)).toBe('^/w==');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatDateOnly Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('formatDateOnly', () => {
  it('formats standard date correctly', () => {
    const date = new Date(Date.UTC(2024, 11, 25)); // December 25, 2024
    expect(formatDateOnly(date)).toBe('2024-12-25');
  });

  it('pads single-digit month with leading zero', () => {
    const date = new Date(Date.UTC(2024, 0, 15)); // January 15, 2024
    expect(formatDateOnly(date)).toBe('2024-01-15');
  });

  it('pads single-digit day with leading zero', () => {
    const date = new Date(Date.UTC(2024, 5, 5)); // June 5, 2024
    expect(formatDateOnly(date)).toBe('2024-06-05');
  });

  it('handles leap year February 29', () => {
    const date = new Date(Date.UTC(2024, 1, 29)); // February 29, 2024 (leap year)
    expect(formatDateOnly(date)).toBe('2024-02-29');
  });

  it('handles year boundary', () => {
    const date = new Date(Date.UTC(2024, 11, 31)); // December 31, 2024
    expect(formatDateOnly(date)).toBe('2024-12-31');
  });

  it('handles dates with time component (uses UTC)', () => {
    // Create a date with time - should only output date portion using UTC
    const date = new Date(Date.UTC(2024, 5, 15, 14, 30, 45));
    expect(formatDateOnly(date)).toBe('2024-06-15');
  });
});
