/**
 * Strict Type Validation Tests
 *
 * Tests for the optional strict type checking feature for verb arguments.
 */

import { describe, it, expect } from 'vitest';
import { parseTransform, executeTransform } from '../../src/transform/index.js';
import {
  validateVerbArgTypes,
  areTypesCompatible,
  isTypeMatch,
  getVerbSignature,
} from '../../src/transform/signatures.js';
import type { TransformValue } from '../../src/types/transform.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: TYPE COMPATIBILITY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Type Compatibility', () => {
  describe('Same Type', () => {
    it('should consider same types compatible', () => {
      expect(areTypesCompatible('string', 'string')).toBe(true);
      expect(areTypesCompatible('number', 'number')).toBe(true);
      expect(areTypesCompatible('boolean', 'boolean')).toBe(true);
      expect(areTypesCompatible('array', 'array')).toBe(true);
    });
  });

  describe('Numeric Types', () => {
    it('should consider number and integer compatible', () => {
      expect(areTypesCompatible('number', 'integer')).toBe(true);
      expect(areTypesCompatible('integer', 'number')).toBe(true);
    });

    it('should consider number and currency compatible', () => {
      expect(areTypesCompatible('number', 'currency')).toBe(true);
      expect(areTypesCompatible('currency', 'number')).toBe(true);
    });

    it('should consider integer and currency compatible', () => {
      expect(areTypesCompatible('integer', 'currency')).toBe(true);
      expect(areTypesCompatible('currency', 'integer')).toBe(true);
    });
  });

  describe('Null Compatibility', () => {
    it('should consider null compatible with all types', () => {
      expect(areTypesCompatible('null', 'string')).toBe(true);
      expect(areTypesCompatible('null', 'number')).toBe(true);
      expect(areTypesCompatible('null', 'boolean')).toBe(true);
      expect(areTypesCompatible('null', 'array')).toBe(true);
      expect(areTypesCompatible('null', 'object')).toBe(true);
    });

    it('should consider all types compatible with null', () => {
      expect(areTypesCompatible('string', 'null')).toBe(true);
      expect(areTypesCompatible('number', 'null')).toBe(true);
      expect(areTypesCompatible('boolean', 'null')).toBe(true);
    });
  });

  describe('Date/Time Types', () => {
    it('should consider date and timestamp compatible', () => {
      expect(areTypesCompatible('date', 'timestamp')).toBe(true);
      expect(areTypesCompatible('timestamp', 'date')).toBe(true);
    });

    it('should not consider date and time compatible', () => {
      expect(areTypesCompatible('date', 'time')).toBe(false);
      expect(areTypesCompatible('time', 'date')).toBe(false);
    });
  });

  describe('Incompatible Types', () => {
    it('should not consider string and number compatible', () => {
      expect(areTypesCompatible('string', 'number')).toBe(false);
      expect(areTypesCompatible('number', 'string')).toBe(false);
    });

    it('should not consider string and boolean compatible', () => {
      expect(areTypesCompatible('string', 'boolean')).toBe(false);
      expect(areTypesCompatible('boolean', 'string')).toBe(false);
    });

    it('should not consider number and boolean compatible', () => {
      expect(areTypesCompatible('number', 'boolean')).toBe(false);
      expect(areTypesCompatible('boolean', 'number')).toBe(false);
    });

    it('should not consider array and object compatible', () => {
      expect(areTypesCompatible('array', 'object')).toBe(false);
      expect(areTypesCompatible('object', 'array')).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: TYPE MATCH TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Type Match', () => {
  it('should match any type with "any"', () => {
    expect(isTypeMatch('string', 'any')).toBe(true);
    expect(isTypeMatch('number', 'any')).toBe(true);
    expect(isTypeMatch('boolean', 'any')).toBe(true);
    expect(isTypeMatch('array', 'any')).toBe(true);
  });

  it('should match generic type "T"', () => {
    expect(isTypeMatch('string', 'T')).toBe(true);
    expect(isTypeMatch('number', 'T')).toBe(true);
  });

  it('should match number signature with numeric types', () => {
    expect(isTypeMatch('number', 'number')).toBe(true);
    expect(isTypeMatch('integer', 'number')).toBe(true);
    expect(isTypeMatch('currency', 'number')).toBe(true);
  });

  it('should not match string with number signature', () => {
    expect(isTypeMatch('string', 'number')).toBe(false);
  });

  it('should match exact types', () => {
    expect(isTypeMatch('string', 'string')).toBe(true);
    expect(isTypeMatch('boolean', 'boolean')).toBe(true);
    expect(isTypeMatch('array', 'array')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: VERB SIGNATURE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Verb Signatures', () => {
  it('should have signature for upper', () => {
    const sig = getVerbSignature('upper');
    expect(sig).toBeDefined();
    expect(sig?.args).toEqual(['string']);
  });

  it('should have signature for add', () => {
    const sig = getVerbSignature('add');
    expect(sig).toBeDefined();
    expect(sig?.args).toEqual(['number', 'number']);
  });

  it('should have generic signature for eq', () => {
    const sig = getVerbSignature('eq');
    expect(sig).toBeDefined();
    expect(sig?.args).toEqual(['T', 'T']);
  });

  it('should have variadic signature for concat', () => {
    const sig = getVerbSignature('concat');
    expect(sig).toBeDefined();
    expect(sig?.args).toEqual([]);
    expect(sig?.variadic).toBe('any');
  });

  it('should return undefined for unknown verb', () => {
    const sig = getVerbSignature('unknownVerb123');
    expect(sig).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: VALIDATE VERB ARG TYPES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Validate Verb Arg Types', () => {
  describe('Basic Type Validation', () => {
    it('should pass for correct string argument to upper', () => {
      const args: TransformValue[] = [{ type: 'string', value: 'hello' }];
      const result = validateVerbArgTypes('upper', args, false);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for number argument to upper', () => {
      const args: TransformValue[] = [{ type: 'number', value: 42 }];
      const result = validateVerbArgTypes('upper', args, false);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('expected string');
      expect(result.errors[0]).toContain('got number');
    });

    it('should pass for correct numeric arguments to add', () => {
      const args: TransformValue[] = [
        { type: 'number', value: 10 },
        { type: 'number', value: 20 },
      ];
      const result = validateVerbArgTypes('add', args, false);
      expect(result.valid).toBe(true);
    });

    it('should pass for integer arguments to add (number compatible)', () => {
      const args: TransformValue[] = [
        { type: 'integer', value: 10 },
        { type: 'integer', value: 20 },
      ];
      const result = validateVerbArgTypes('add', args, false);
      expect(result.valid).toBe(true);
    });

    it('should fail for string arguments to add', () => {
      const args: TransformValue[] = [
        { type: 'string', value: '10' },
        { type: 'number', value: 20 },
      ];
      const result = validateVerbArgTypes('add', args, false);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Arg 1');
    });
  });

  describe('Generic Type Validation (Comparisons)', () => {
    it('should pass for eq with matching string types', () => {
      const args: TransformValue[] = [
        { type: 'string', value: 'a' },
        { type: 'string', value: 'b' },
      ];
      const result = validateVerbArgTypes('eq', args, false);
      expect(result.valid).toBe(true);
    });

    it('should pass for eq with matching number types', () => {
      const args: TransformValue[] = [
        { type: 'number', value: 1 },
        { type: 'number', value: 2 },
      ];
      const result = validateVerbArgTypes('eq', args, false);
      expect(result.valid).toBe(true);
    });

    it('should pass for eq with compatible numeric types (integer vs number)', () => {
      const args: TransformValue[] = [
        { type: 'integer', value: 1 },
        { type: 'number', value: 2.5 },
      ];
      const result = validateVerbArgTypes('eq', args, false);
      expect(result.valid).toBe(true);
    });

    it('should fail for eq with incompatible types (string vs number)', () => {
      const args: TransformValue[] = [
        { type: 'string', value: '42' },
        { type: 'number', value: 42 },
      ];
      const result = validateVerbArgTypes('eq', args, false);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not compatible');
      expect(result.errors[0]).toContain('mismatched types');
    });

    it('should pass for eq with null and any type', () => {
      const args: TransformValue[] = [{ type: 'null' }, { type: 'string', value: 'test' }];
      const result = validateVerbArgTypes('eq', args, false);
      expect(result.valid).toBe(true);
    });

    it('should fail for between with mixed types', () => {
      const args: TransformValue[] = [
        { type: 'string', value: 'a' },
        { type: 'number', value: 1 },
        { type: 'number', value: 10 },
      ];
      const result = validateVerbArgTypes('between', args, false);
      expect(result.valid).toBe(false);
    });

    it('should pass for between with all same types', () => {
      const args: TransformValue[] = [
        { type: 'number', value: 5 },
        { type: 'number', value: 1 },
        { type: 'number', value: 10 },
      ];
      const result = validateVerbArgTypes('between', args, false);
      expect(result.valid).toBe(true);
    });
  });

  describe('Any Type and Variadic', () => {
    it('should pass for concat with any types', () => {
      const args: TransformValue[] = [
        { type: 'string', value: 'a' },
        { type: 'number', value: 42 },
        { type: 'boolean', value: true },
      ];
      const result = validateVerbArgTypes('concat', args, false);
      expect(result.valid).toBe(true);
    });

    it('should pass for ifElse with boolean condition', () => {
      const args: TransformValue[] = [
        { type: 'boolean', value: true },
        { type: 'string', value: 'yes' },
        { type: 'string', value: 'no' },
      ];
      const result = validateVerbArgTypes('ifElse', args, false);
      expect(result.valid).toBe(true);
    });

    it('should fail for ifElse with non-boolean condition', () => {
      const args: TransformValue[] = [
        { type: 'string', value: 'true' },
        { type: 'string', value: 'yes' },
        { type: 'string', value: 'no' },
      ];
      const result = validateVerbArgTypes('ifElse', args, false);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Arg 1');
      expect(result.errors[0]).toContain('expected boolean');
    });
  });

  describe('Custom Verbs', () => {
    it('should skip validation for custom verbs', () => {
      const args: TransformValue[] = [
        { type: 'string', value: 'anything' },
        { type: 'number', value: 42 },
      ];
      const result = validateVerbArgTypes('myCustomVerb', args, true);
      expect(result.valid).toBe(true);
    });
  });

  describe('Unknown Verbs', () => {
    it('should skip validation for unknown verbs', () => {
      const args: TransformValue[] = [{ type: 'string', value: 'anything' }];
      const result = validateVerbArgTypes('unknownVerb999', args, false);
      expect(result.valid).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: INTEGRATION TESTS WITH TRANSFORM ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Strict Types Integration', () => {
  describe('Header Option', () => {
    it('should parse strictTypes = true from header', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
strictTypes = true

{Output}
name = %upper @name
`;
      const transform = parseTransform(transformText);
      expect(transform.strictTypes).toBe(true);
    });

    it('should parse strictTypes = false from header', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
strictTypes = false

{Output}
name = %upper @name
`;
      const transform = parseTransform(transformText);
      expect(transform.strictTypes).toBe(false);
    });

    it('should default strictTypes to undefined when not specified', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"

{Output}
name = %upper @name
`;
      const transform = parseTransform(transformText);
      expect(transform.strictTypes).toBeUndefined();
    });
  });

  describe('Execution with strictTypes', () => {
    it('should pass with correct types when strictTypes enabled', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
strictTypes = true

{Output}
name = %upper @name
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { name: 'john' });
      expect(result.success).toBe(true);
      expect(result.output.Output.name.value).toBe('JOHN');
    });

    it('should fail with wrong types when strictTypes enabled', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
strictTypes = true

{Output}
result = %upper @count
`;
      const transform = parseTransform(transformText);
      // count is a number, upper expects string
      expect(() => executeTransform(transform, { count: 42 })).toThrow(/Type error/);
    });

    it('should pass with wrong types when strictTypes disabled (coercion)', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
strictTypes = false

{Output}
result = %upper @count
`;
      const transform = parseTransform(transformText);
      // count is a number, but without strict mode it coerces to string
      const result = executeTransform(transform, { count: 42 });
      expect(result.success).toBe(true);
      expect(result.output.Output.result.value).toBe('42');
    });

    it('should catch comparison type mismatch in strict mode', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
strictTypes = true

{Output}
match = %eq @name @count
`;
      const transform = parseTransform(transformText);
      // name is string, count is number - incompatible for comparison
      expect(() => executeTransform(transform, { name: 'test', count: 42 })).toThrow(
        /Type error.*not compatible/
      );
    });

    it('should allow comparison of compatible types in strict mode', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
strictTypes = true

{Output}
match = %eq @a @b
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { a: 10, b: 20 });
      expect(result.success).toBe(true);
      expect(result.output.Output.match.value).toBe(false);
    });
  });

  describe('Options Override', () => {
    it('should allow strictTypes via options', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"

{Output}
result = %upper @count
`;
      const transform = parseTransform(transformText);
      // No strictTypes in header, but enabled via options
      expect(() => executeTransform(transform, { count: 42 }, { strictTypes: true })).toThrow(
        /Type error/
      );
    });

    it('should override header with options', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
strictTypes = true

{Output}
result = %upper @count
`;
      const transform = parseTransform(transformText);
      // Header says strict, but options override to false
      const result = executeTransform(transform, { count: 42 }, { strictTypes: false });
      expect(result.success).toBe(true);
      expect(result.output.Output.result.value).toBe('42');
    });
  });
});
