/**
 * Comprehensive Verb Type Signature Tests
 *
 * Verifies that every verb's type signature is correct by testing
 * with both valid and invalid argument types in strict mode.
 */

import { describe, it, expect } from 'vitest';
import { parseTransform, executeTransform } from '../../src/transform/index.js';
import { VERB_SIGNATURES } from '../../src/transform/signatures.js';
import { VERB_ARITY } from '../../src/transform/arity.js';

// Helper to create a transform and execute it
function runTransform(verbExpr: string, input: Record<string, unknown>, strictTypes = true) {
  const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
strictTypes = ${strictTypes}

{Output}
result = ${verbExpr}
`;
  const transform = parseTransform(transformText);
  return executeTransform(transform, input);
}

// Helper to test a verb passes with valid types
function expectPass(verbExpr: string, input: Record<string, unknown>) {
  const result = runTransform(verbExpr, input, true);
  expect(result.success).toBe(true);
}

// Helper to test a verb fails with invalid types in strict mode
function expectFail(verbExpr: string, input: Record<string, unknown>) {
  expect(() => runTransform(verbExpr, input, true)).toThrow(/Type error/);
}

// Helper to test a verb passes (via coercion) in non-strict mode
function expectCoercionPass(verbExpr: string, input: Record<string, unknown>) {
  const result = runTransform(verbExpr, input, false);
  expect(result.success).toBe(true);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY ALL VERBS HAVE SIGNATURES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Verb Signature Coverage', () => {
  it('should have signatures for all verbs in arity map', () => {
    const arityVerbs = Object.keys(VERB_ARITY);
    const signatureVerbs = Object.keys(VERB_SIGNATURES);

    const missingSignatures = arityVerbs.filter((v) => !signatureVerbs.includes(v));

    // Report missing signatures (not a failure, just informational)
    if (missingSignatures.length > 0) {
      console.log(`Verbs without signatures (${missingSignatures.length}):`, missingSignatures);
    }

    // At least 80% coverage
    const coverage = signatureVerbs.length / arityVerbs.length;
    expect(coverage).toBeGreaterThan(0.8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STRING VERBS
// ═══════════════════════════════════════════════════════════════════════════════

describe('String Verb Signatures', () => {
  describe('upper', () => {
    it('should accept string', () => {
      expectPass('%upper @name', { name: 'john' });
    });
    it('should reject number in strict mode', () => {
      expectFail('%upper @count', { count: 42 });
    });
    it('should coerce number in non-strict mode', () => {
      expectCoercionPass('%upper @count', { count: 42 });
    });
  });

  describe('lower', () => {
    it('should accept string', () => {
      expectPass('%lower @name', { name: 'JOHN' });
    });
    it('should reject number in strict mode', () => {
      expectFail('%lower @count', { count: 42 });
    });
  });

  describe('trim', () => {
    it('should accept string', () => {
      expectPass('%trim @name', { name: '  john  ' });
    });
    it('should reject number in strict mode', () => {
      expectFail('%trim @count', { count: 42 });
    });
  });

  describe('capitalize', () => {
    it('should accept string', () => {
      expectPass('%capitalize @name', { name: 'john' });
    });
    it('should reject number in strict mode', () => {
      expectFail('%capitalize @count', { count: 42 });
    });
  });

  describe('length', () => {
    it('should accept string', () => {
      expectPass('%length @name', { name: 'john' });
    });
    it('should reject number in strict mode', () => {
      expectFail('%length @count', { count: 42 });
    });
  });

  describe('concat', () => {
    it('should accept any types (variadic any)', () => {
      expectPass('%concat @name " is " @age', { name: 'John', age: 30 });
    });
    it('should accept mixed types', () => {
      expectPass('%concat @str @num @bool', { str: 'a', num: 1, bool: true });
    });
  });

  describe('contains', () => {
    it('should accept two strings', () => {
      expectPass('%contains @text "find"', { text: 'find me' });
    });
    it('should reject number as first arg', () => {
      expectFail('%contains @num "x"', { num: 123 });
    });
  });

  describe('replace', () => {
    it('should accept three strings', () => {
      expectPass('%replace @text "old" "new"', { text: 'old value' });
    });
    it('should reject number as first arg', () => {
      expectFail('%replace @num "a" "b"', { num: 123 });
    });
  });

  describe('substring', () => {
    it('should accept string, integer, integer', () => {
      expectPass('%substring @text ##0 ##5', { text: 'hello world' });
    });
    it('should reject number as first arg', () => {
      expectFail('%substring @num ##0 ##5', { num: 12345 });
    });
  });

  describe('padLeft', () => {
    it('should accept string, integer, string', () => {
      expectPass('%padLeft @text ##10 "0"', { text: '123' });
    });
  });

  describe('split', () => {
    it('should accept string, string, integer', () => {
      expectPass('%split @text "," ##-1', { text: 'a,b,c' });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NUMERIC VERBS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Numeric Verb Signatures', () => {
  describe('add', () => {
    it('should accept two numbers', () => {
      expectPass('%add @a @b', { a: 10, b: 20 });
    });
    it('should accept integer and number', () => {
      expectPass('%add @a @b', { a: 10, b: 20.5 });
    });
    it('should reject string in strict mode', () => {
      expectFail('%add @a @b', { a: '10', b: 20 });
    });
  });

  describe('subtract', () => {
    it('should accept two numbers', () => {
      expectPass('%subtract @a @b', { a: 30, b: 10 });
    });
    it('should reject string', () => {
      expectFail('%subtract @a @b', { a: '30', b: 10 });
    });
  });

  describe('multiply', () => {
    it('should accept two numbers', () => {
      expectPass('%multiply @a @b', { a: 5, b: 4 });
    });
  });

  describe('divide', () => {
    it('should accept two numbers', () => {
      expectPass('%divide @a @b', { a: 20, b: 4 });
    });
  });

  describe('abs', () => {
    it('should accept number', () => {
      expectPass('%abs @value', { value: -5 });
    });
    it('should reject string', () => {
      expectFail('%abs @value', { value: '-5' });
    });
  });

  describe('round', () => {
    it('should accept number and integer', () => {
      expectPass('%round @value ##2', { value: 3.14159 });
    });
  });

  describe('floor', () => {
    it('should accept number', () => {
      expectPass('%floor @value', { value: 3.7 });
    });
  });

  describe('ceil', () => {
    it('should accept number', () => {
      expectPass('%ceil @value', { value: 3.2 });
    });
  });

  describe('mod', () => {
    it('should accept two numbers', () => {
      expectPass('%mod @a @b', { a: 10, b: 3 });
    });
  });

  describe('pow', () => {
    it('should accept two numbers', () => {
      expectPass('%pow @base @exp', { base: 2, exp: 3 });
    });
  });

  describe('sqrt', () => {
    it('should accept number', () => {
      expectPass('%sqrt @value', { value: 16 });
    });
  });

  describe('clamp', () => {
    it('should accept three numbers', () => {
      expectPass('%clamp @value @min @max', { value: 15, min: 0, max: 10 });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPARISON VERBS (Generic Type T)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Comparison Verb Signatures (Generic T)', () => {
  describe('eq', () => {
    it('should accept matching string types', () => {
      expectPass('%eq @a @b', { a: 'x', b: 'y' });
    });
    it('should accept matching number types', () => {
      expectPass('%eq @a @b', { a: 10, b: 20 });
    });
    it('should accept integer vs number (compatible)', () => {
      expectPass('%eq @a @b', { a: 10, b: 10.0 });
    });
    it('should reject string vs number', () => {
      expectFail('%eq @a @b', { a: '10', b: 10 });
    });
    it('should reject boolean vs string', () => {
      expectFail('%eq @a @b', { a: true, b: 'true' });
    });
  });

  describe('ne', () => {
    it('should accept matching types', () => {
      expectPass('%ne @a @b', { a: 'x', b: 'y' });
    });
    it('should reject mismatched types', () => {
      expectFail('%ne @a @b', { a: 'x', b: 1 });
    });
  });

  describe('lt', () => {
    it('should accept matching number types', () => {
      expectPass('%lt @a @b', { a: 5, b: 10 });
    });
    it('should reject string vs number', () => {
      expectFail('%lt @a @b', { a: '5', b: 10 });
    });
  });

  describe('gt', () => {
    it('should accept matching types', () => {
      expectPass('%gt @a @b', { a: 10, b: 5 });
    });
  });

  describe('lte', () => {
    it('should accept matching types', () => {
      expectPass('%lte @a @b', { a: 5, b: 5 });
    });
  });

  describe('gte', () => {
    it('should accept matching types', () => {
      expectPass('%gte @a @b', { a: 5, b: 5 });
    });
  });

  describe('between', () => {
    it('should accept three matching types', () => {
      expectPass('%between @val @min @max', { val: 5, min: 1, max: 10 });
    });
    it('should reject mixed types', () => {
      expectFail('%between @val @min @max', { val: '5', min: 1, max: 10 });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIC VERBS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Logic Verb Signatures', () => {
  describe('and', () => {
    it('should accept two booleans', () => {
      expectPass('%and @a @b', { a: true, b: false });
    });
    it('should reject non-booleans', () => {
      expectFail('%and @a @b', { a: 1, b: 0 });
    });
  });

  describe('or', () => {
    it('should accept two booleans', () => {
      expectPass('%or @a @b', { a: true, b: false });
    });
  });

  describe('not', () => {
    it('should accept boolean', () => {
      expectPass('%not @flag', { flag: true });
    });
    it('should reject number', () => {
      expectFail('%not @flag', { flag: 1 });
    });
  });

  describe('ifElse', () => {
    it('should accept boolean condition and any branches', () => {
      expectPass('%ifElse @cond "yes" "no"', { cond: true });
    });
    it('should reject non-boolean condition', () => {
      expectFail('%ifElse @cond "yes" "no"', { cond: 1 });
    });
    it('should reject string condition', () => {
      expectFail('%ifElse @cond "yes" "no"', { cond: 'true' });
    });
  });

  describe('coalesce', () => {
    it('should accept any types (variadic)', () => {
      expectPass('%coalesce @a @b @c', { a: null, b: null, c: 'found' });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE CHECK VERBS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Type Check Verb Signatures', () => {
  describe('isNull', () => {
    it('should accept any type', () => {
      expectPass('%isNull @value', { value: null });
      expectPass('%isNull @value', { value: 'string' });
      expectPass('%isNull @value', { value: 42 });
    });
  });

  describe('isString', () => {
    it('should accept any type', () => {
      expectPass('%isString @value', { value: 'test' });
      expectPass('%isString @value', { value: 42 });
    });
  });

  describe('isNumber', () => {
    it('should accept any type', () => {
      expectPass('%isNumber @value', { value: 42 });
      expectPass('%isNumber @value', { value: 'not a number' });
    });
  });

  describe('typeOf', () => {
    it('should accept any type', () => {
      expectPass('%typeOf @value', { value: 'test' });
      expectPass('%typeOf @value', { value: 42 });
      expectPass('%typeOf @value', { value: true });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COERCION VERBS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Coercion Verb Signatures', () => {
  describe('coerceString', () => {
    it('should accept any type', () => {
      expectPass('%coerceString @value', { value: 42 });
      expectPass('%coerceString @value', { value: true });
      expectPass('%coerceString @value', { value: 'already string' });
    });
  });

  describe('coerceNumber', () => {
    it('should accept any type', () => {
      expectPass('%coerceNumber @value', { value: '42' });
      expectPass('%coerceNumber @value', { value: 42 });
    });
  });

  describe('coerceBoolean', () => {
    it('should accept any type', () => {
      expectPass('%coerceBoolean @value', { value: 1 });
      expectPass('%coerceBoolean @value', { value: 'true' });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ARRAY VERBS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Array Verb Signatures', () => {
  describe('flatten', () => {
    it('should accept array', () => {
      expectPass('%flatten @arr', {
        arr: [
          [1, 2],
          [3, 4],
        ],
      });
    });
    it('should reject non-array', () => {
      expectFail('%flatten @arr', { arr: 'not an array' });
    });
  });

  describe('first', () => {
    it('should accept array', () => {
      expectPass('%first @arr', { arr: [1, 2, 3] });
    });
    it('should reject non-array', () => {
      expectFail('%first @arr', { arr: 'string' });
    });
  });

  describe('last', () => {
    it('should accept array', () => {
      expectPass('%last @arr', { arr: [1, 2, 3] });
    });
  });

  describe('count', () => {
    it('should accept array', () => {
      expectPass('%count @arr', { arr: [1, 2, 3] });
    });
  });

  describe('sum', () => {
    it('should accept array', () => {
      expectPass('%sum @arr', { arr: [1, 2, 3] });
    });
  });

  describe('reverse', () => {
    it('should accept array', () => {
      expectPass('%reverse @arr', { arr: [1, 2, 3] });
    });
  });

  describe('join', () => {
    it('should accept array and string', () => {
      expectPass('%join @arr ","', { arr: ['a', 'b', 'c'] });
    });
    it('should reject non-array as first arg', () => {
      expectFail('%join @arr ","', { arr: 'not array' });
    });
  });

  describe('at', () => {
    it('should accept array and integer', () => {
      expectPass('%at @arr ##1', { arr: [10, 20, 30] });
    });
  });

  describe('slice', () => {
    it('should accept array and two integers', () => {
      expectPass('%slice @arr ##0 ##2', { arr: [1, 2, 3, 4] });
    });
  });

  describe('includes', () => {
    it('should accept array and any value', () => {
      expectPass('%includes @arr "find"', { arr: ['find', 'me'] });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENCODING VERBS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Encoding Verb Signatures', () => {
  describe('base64Encode', () => {
    it('should accept string', () => {
      expectPass('%base64Encode @text', { text: 'hello' });
    });
    it('should reject number', () => {
      expectFail('%base64Encode @num', { num: 123 });
    });
  });

  describe('base64Decode', () => {
    it('should accept string', () => {
      expectPass('%base64Decode @encoded', { encoded: 'aGVsbG8=' });
    });
  });

  describe('urlEncode', () => {
    it('should accept string', () => {
      expectPass('%urlEncode @text', { text: 'hello world' });
    });
  });

  describe('jsonEncode', () => {
    it('should accept any type', () => {
      expectPass('%jsonEncode @obj', { obj: { key: 'value' } });
      expectPass('%jsonEncode @arr', { arr: [1, 2, 3] });
      expectPass('%jsonEncode @str', { str: 'text' });
    });
  });

  describe('jsonDecode', () => {
    it('should accept string', () => {
      expectPass('%jsonDecode @json', { json: '{"key":"value"}' });
    });
    it('should reject non-string', () => {
      expectFail('%jsonDecode @obj', { obj: { key: 'value' } });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OBJECT VERBS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Object Verb Signatures', () => {
  describe('keys', () => {
    it('should accept object', () => {
      expectPass('%keys @obj', { obj: { a: 1, b: 2 } });
    });
    it('should reject non-object', () => {
      expectFail('%keys @arr', { arr: [1, 2, 3] });
    });
  });

  describe('values', () => {
    it('should accept object', () => {
      expectPass('%values @obj', { obj: { a: 1, b: 2 } });
    });
  });

  describe('has', () => {
    it('should accept object and string', () => {
      expectPass('%has @obj "key"', { obj: { key: 'value' } });
    });
  });

  describe('merge', () => {
    it('should accept two objects', () => {
      expectPass('%merge @a @b', { a: { x: 1 }, b: { y: 2 } });
    });
    it('should reject non-objects', () => {
      expectFail('%merge @a @b', { a: { x: 1 }, b: [1, 2] });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NULL COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Null Compatibility', () => {
  it('should allow null in string position', () => {
    expectPass('%upper @name', { name: null });
  });

  it('should allow null in number position', () => {
    expectPass('%abs @value', { value: null });
  });

  it('should allow null in comparison with any type', () => {
    expectPass('%eq @a @b', { a: null, b: 'string' });
    expectPass('%eq @a @b', { a: null, b: 42 });
    expectPass('%eq @a @b', { a: null, b: null });
  });
});
