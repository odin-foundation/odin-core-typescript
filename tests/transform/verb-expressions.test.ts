/**
 * Verb Expression Tests for ODIN SDK.
 *
 * Tests the `%` prefix for verb expressions including:
 * - Happy path: basic verbs, arguments, nesting
 * - Edge cases: unknown verbs, variadic, custom verbs
 * - Error cases: malformed expressions
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../src/index.js';
import type { OdinVerbExpression } from '../../src/types/values.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: HAPPY PATH TESTS
// Basic verb expression parsing that should succeed
// ═══════════════════════════════════════════════════════════════════════════════

describe('Verb Expression Parsing - Happy Path', () => {
  describe('Basic Verb Syntax', () => {
    it('should parse verb with single reference argument', () => {
      const doc = Odin.parse('result = %upper @name');
      const value = doc.get('result');
      expect(value?.type).toBe('verb');
      const verb = value as OdinVerbExpression;
      expect(verb.verb).toBe('upper');
      expect(verb.isCustom).toBe(false);
      expect(verb.args).toHaveLength(1);
      expect(verb.args[0]?.type).toBe('reference');
    });

    it('should parse verb with string argument', () => {
      const doc = Odin.parse('result = %upper "hello"');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('upper');
      expect(value.args).toHaveLength(1);
      expect(value.args[0]?.type).toBe('string');
      expect((value.args[0] as { value: string }).value).toBe('hello');
    });

    it('should parse verb with integer argument', () => {
      const doc = Odin.parse('result = %someVerb ##42');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('someVerb');
      expect(value.args).toHaveLength(1);
      expect(value.args[0]?.type).toBe('integer');
    });

    it('should parse verb with number argument', () => {
      const doc = Odin.parse('result = %someVerb #3.14');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('someVerb');
      expect(value.args).toHaveLength(1);
      expect(value.args[0]?.type).toBe('number');
    });

    it('should parse verb with boolean true argument', () => {
      const doc = Odin.parse('result = %someVerb true');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('someVerb');
      expect(value.args).toHaveLength(1);
      expect(value.args[0]?.type).toBe('boolean');
      expect((value.args[0] as { value: boolean }).value).toBe(true);
    });

    it('should parse verb with boolean false argument', () => {
      const doc = Odin.parse('result = %someVerb false');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args[0]?.type).toBe('boolean');
      expect((value.args[0] as { value: boolean }).value).toBe(false);
    });

    it('should parse verb with null argument', () => {
      const doc = Odin.parse('result = %someVerb ~');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(1);
      expect(value.args[0]?.type).toBe('null');
    });
  });

  describe('Multiple Arguments', () => {
    it('should parse concat with multiple arguments', () => {
      const doc = Odin.parse('result = %concat @first " " @last');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('concat');
      expect(value.args).toHaveLength(3);
      expect(value.args[0]?.type).toBe('reference');
      expect(value.args[1]?.type).toBe('string');
      expect(value.args[2]?.type).toBe('reference');
    });

    it('should parse ifElse with three arguments', () => {
      const doc = Odin.parse('result = %ifElse @condition "yes" "no"');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('ifElse');
      expect(value.args).toHaveLength(3);
    });

    it('should parse replace with three arguments', () => {
      const doc = Odin.parse('result = %replace @text "old" "new"');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('replace');
      expect(value.args).toHaveLength(3);
    });

    it('should parse substring with three arguments', () => {
      const doc = Odin.parse('result = %substring @text ##0 ##5');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('substring');
      expect(value.args).toHaveLength(3);
    });
  });

  describe('Nested Verbs', () => {
    it('should parse simple nested verb', () => {
      const doc = Odin.parse('result = %upper %trim @name');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('upper');
      expect(value.args).toHaveLength(1);
      expect(value.args[0]?.type).toBe('verb');
      const inner = value.args[0] as OdinVerbExpression;
      expect(inner.verb).toBe('trim');
    });

    it('should parse deeply nested verbs', () => {
      const doc = Odin.parse('result = %upper %trim %lower @name');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('upper');
      const level1 = value.args[0] as OdinVerbExpression;
      expect(level1.verb).toBe('trim');
      const level2 = level1.args[0] as OdinVerbExpression;
      expect(level2.verb).toBe('lower');
      expect(level2.args[0]?.type).toBe('reference');
    });

    it('should parse nested verb in concat', () => {
      const doc = Odin.parse('result = %concat %upper @first " " %lower @last');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('concat');
      expect(value.args).toHaveLength(3);
      expect(value.args[0]?.type).toBe('verb');
      expect(value.args[1]?.type).toBe('string');
      expect(value.args[2]?.type).toBe('verb');
    });

    it('should parse nested ifElse', () => {
      const doc = Odin.parse('result = %ifElse @cond %upper @yes %lower @no');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('ifElse');
      expect(value.args).toHaveLength(3);
      expect(value.args[0]?.type).toBe('reference');
      expect(value.args[1]?.type).toBe('verb');
      expect(value.args[2]?.type).toBe('verb');
    });
  });

  describe('Custom Verbs', () => {
    it('should parse custom verb with %& prefix', () => {
      const doc = Odin.parse('result = %&customVerb @value');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('customVerb');
      expect(value.isCustom).toBe(true);
      expect(value.args).toHaveLength(1);
    });

    it('should parse custom verb with multiple arguments', () => {
      const doc = Odin.parse('result = %&customProcess @a @b "config"');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.isCustom).toBe(true);
      expect(value.args).toHaveLength(3);
    });

    it('should parse nested custom verb', () => {
      const doc = Odin.parse('result = %upper %&customFormat @value');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('upper');
      const inner = value.args[0] as OdinVerbExpression;
      expect(inner.isCustom).toBe(true);
      expect(inner.verb).toBe('customFormat');
    });
  });

  describe('Known Verb Arities', () => {
    it('should parse upper (arity 1)', () => {
      const doc = Odin.parse('result = %upper @name');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(1);
    });

    it('should parse lower (arity 1)', () => {
      const doc = Odin.parse('result = %lower @name');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(1);
    });

    it('should parse trim (arity 1)', () => {
      const doc = Odin.parse('result = %trim @name');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(1);
    });

    it('should parse length (arity 1)', () => {
      const doc = Odin.parse('result = %length @name');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(1);
    });

    it('should parse not (arity 1)', () => {
      const doc = Odin.parse('result = %not @flag');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(1);
    });

    it('should parse add (arity 2)', () => {
      const doc = Odin.parse('result = %add @a @b');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(2);
    });

    it('should parse subtract (arity 2)', () => {
      const doc = Odin.parse('result = %subtract @a @b');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(2);
    });

    it('should parse multiply (arity 2)', () => {
      const doc = Odin.parse('result = %multiply @a @b');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(2);
    });

    it('should parse divide (arity 2)', () => {
      const doc = Odin.parse('result = %divide @a @b');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(2);
    });

    it('should parse ifElse (arity 3)', () => {
      const doc = Odin.parse('result = %ifElse @cond @yes @no');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(3);
    });

    it('should parse replace (arity 3)', () => {
      const doc = Odin.parse('result = %replace @text "a" "b"');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(3);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: EDGE CASE TESTS
// Unusual but valid scenarios
// ═══════════════════════════════════════════════════════════════════════════════

describe('Verb Expression Parsing - Edge Cases', () => {
  describe('Unknown Verbs', () => {
    it('should parse unknown verb with variadic arity', () => {
      const doc = Odin.parse('result = %unknownVerb @a @b @c');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('unknownVerb');
      expect(value.args.length).toBeGreaterThanOrEqual(1);
    });

    it('should parse unknown verb with single argument', () => {
      const doc = Odin.parse('result = %myCustomThing @value');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('myCustomThing');
    });
  });

  describe('Verb with No Arguments', () => {
    it('should parse verb with zero arguments', () => {
      const doc = Odin.parse('result = %now');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('now');
      expect(value.args).toHaveLength(0);
    });

    it('should parse uuid verb with no arguments', () => {
      const doc = Odin.parse('result = %uuid');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('uuid');
      expect(value.args).toHaveLength(0);
    });
  });

  describe('String Literal Edge Cases', () => {
    it('should parse verb with empty string argument', () => {
      const doc = Odin.parse('result = %concat @name ""');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(2);
      expect((value.args[1] as { value: string }).value).toBe('');
    });

    it('should parse verb with string containing spaces', () => {
      const doc = Odin.parse('result = %concat @first "   " @last');
      const value = doc.get('result') as OdinVerbExpression;
      expect((value.args[1] as { value: string }).value).toBe('   ');
    });

    it('should parse verb with escaped quotes in string', () => {
      const doc = Odin.parse('result = %replace @text "\\"" "\'"');
      const value = doc.get('result') as OdinVerbExpression;
      expect((value.args[1] as { value: string }).value).toBe('"');
      expect((value.args[2] as { value: string }).value).toBe("'");
    });

    it('should parse verb with newline in string', () => {
      const doc = Odin.parse('result = %replace @text "\\n" " "');
      const value = doc.get('result') as OdinVerbExpression;
      expect((value.args[1] as { value: string }).value).toBe('\n');
    });
  });

  describe('Reference Path Edge Cases', () => {
    it('should parse verb with array index reference', () => {
      const doc = Odin.parse('result = %upper @items[0].name');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args[0]?.type).toBe('reference');
      expect((value.args[0] as { path: string }).path).toBe('items[0].name');
    });

    it('should parse verb with simple path reference', () => {
      const doc = Odin.parse('result = %upper @name');
      const value = doc.get('result') as OdinVerbExpression;
      expect((value.args[0] as { path: string }).path).toBe('name');
    });

    it('should parse verb with deep nested reference', () => {
      const doc = Odin.parse('result = %upper @a.b.c.d.e.f');
      const value = doc.get('result') as OdinVerbExpression;
      expect((value.args[0] as { path: string }).path).toBe('a.b.c.d.e.f');
    });
  });

  describe('Numeric Edge Cases', () => {
    it('should parse verb with negative integer', () => {
      const doc = Odin.parse('result = %add @value ##-100');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args[1]?.type).toBe('integer');
      expect((value.args[1] as { value: number }).value).toBe(-100);
    });

    it('should parse verb with negative number', () => {
      const doc = Odin.parse('result = %multiply @value #-3.14');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args[1]?.type).toBe('number');
    });

    it('should parse verb with zero', () => {
      const doc = Odin.parse('result = %add @value ##0');
      const value = doc.get('result') as OdinVerbExpression;
      expect((value.args[1] as { value: number }).value).toBe(0);
    });

    it('should parse verb with scientific notation', () => {
      const doc = Odin.parse('result = %multiply @value #1.5e10');
      const value = doc.get('result') as OdinVerbExpression;
      expect((value.args[1] as { value: number }).value).toBe(1.5e10);
    });
  });

  describe('Document Context', () => {
    it('should parse verb alongside other assignments', () => {
      const doc = Odin.parse(`
        name = "John"
        result = %upper @name
        age = ##30
      `);
      expect(doc.getString('name')).toBe('John');
      expect(doc.get('result')?.type).toBe('verb');
      expect(doc.getInteger('age')).toBe(30);
    });

    it('should parse multiple verb assignments', () => {
      const doc = Odin.parse(`
        upper_name = %upper @name
        lower_name = %lower @name
        trimmed = %trim @name
      `);
      expect(doc.get('upper_name')?.type).toBe('verb');
      expect(doc.get('lower_name')?.type).toBe('verb');
      expect(doc.get('trimmed')?.type).toBe('verb');
    });

    it('should parse verb in header context', () => {
      const doc = Odin.parse(`
        {person}
        formatted_name = %upper @name
      `);
      const value = doc.get('person.formatted_name') as OdinVerbExpression;
      expect(value.type).toBe('verb');
      expect(value.verb).toBe('upper');
    });

    it('should parse verb followed by comment', () => {
      const doc = Odin.parse('result = %upper @name ; this is a comment');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('upper');
      expect(value.args).toHaveLength(1);
    });
  });

  describe('Whitespace Handling', () => {
    it('should handle extra spaces between arguments', () => {
      const doc = Odin.parse('result = %concat   @first    "  "    @last');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(3);
    });

    it('should handle tab between arguments', () => {
      const doc = Odin.parse('result = %concat\t@first\t" "\t@last');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.args).toHaveLength(3);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: ROUND-TRIP TESTS
// Parse → Stringify → Parse should produce identical results
// ═══════════════════════════════════════════════════════════════════════════════

describe('Verb Expression Round-Trip', () => {
  it('should round-trip simple verb', () => {
    const original = 'result = %upper @name';
    const doc1 = Odin.parse(original);
    const serialized = Odin.stringify(doc1);
    const doc2 = Odin.parse(serialized);

    const v1 = doc1.get('result') as OdinVerbExpression;
    const v2 = doc2.get('result') as OdinVerbExpression;

    expect(v2.verb).toBe(v1.verb);
    expect(v2.args.length).toBe(v1.args.length);
  });

  it('should round-trip verb with string argument', () => {
    const original = 'result = %concat @first " " @last';
    const doc1 = Odin.parse(original);
    const serialized = Odin.stringify(doc1);
    const doc2 = Odin.parse(serialized);

    const v1 = doc1.get('result') as OdinVerbExpression;
    const v2 = doc2.get('result') as OdinVerbExpression;

    expect(v2.args.length).toBe(v1.args.length);
    expect((v2.args[1] as { value: string }).value).toBe(' ');
  });

  it('should round-trip nested verb', () => {
    const original = 'result = %upper %trim @name';
    const doc1 = Odin.parse(original);
    const serialized = Odin.stringify(doc1);
    const doc2 = Odin.parse(serialized);

    const _v1 = doc1.get('result') as OdinVerbExpression;
    const v2 = doc2.get('result') as OdinVerbExpression;

    expect(v2.verb).toBe('upper');
    expect(v2.args[0]?.type).toBe('verb');
    expect((v2.args[0] as OdinVerbExpression).verb).toBe('trim');
  });

  it('should round-trip custom verb', () => {
    const original = 'result = %&customVerb @value';
    const doc1 = Odin.parse(original);
    const serialized = Odin.stringify(doc1);
    const doc2 = Odin.parse(serialized);

    const v1 = doc1.get('result') as OdinVerbExpression;
    const v2 = doc2.get('result') as OdinVerbExpression;

    expect(v2.isCustom).toBe(true);
    expect(v2.verb).toBe(v1.verb);
  });

  it('should round-trip complex nested expression', () => {
    const original = 'result = %ifElse @cond %upper @yes %lower @no';
    const doc1 = Odin.parse(original);
    const serialized = Odin.stringify(doc1);
    const doc2 = Odin.parse(serialized);

    const v2 = doc2.get('result') as OdinVerbExpression;
    expect(v2.verb).toBe('ifElse');
    expect(v2.args).toHaveLength(3);
    expect(v2.args[1]?.type).toBe('verb');
    expect(v2.args[2]?.type).toBe('verb');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: ERROR TESTS
// Invalid syntax that should throw ParseError
// ═══════════════════════════════════════════════════════════════════════════════

describe('Verb Expression Parsing - Errors', () => {
  describe('Invalid Verb Syntax', () => {
    it('should reject % without verb name', () => {
      expect(() => Odin.parse('result = % @value')).toThrow(ParseError);
    });

    it('should reject %& without verb name', () => {
      expect(() => Odin.parse('result = %& @value')).toThrow(ParseError);
    });

    it('should reject % followed by number', () => {
      expect(() => Odin.parse('result = %123')).toThrow(ParseError);
    });

    it('should reject % at end of line without verb', () => {
      expect(() => Odin.parse('result = %')).toThrow(ParseError);
    });

    it('should reject % followed by string', () => {
      expect(() => Odin.parse('result = %"notaverb"')).toThrow(ParseError);
    });
  });

  describe('Invalid Arguments', () => {
    it('should reject verb with incomplete string', () => {
      expect(() => Odin.parse('result = %concat @a "unclosed')).toThrow(ParseError);
    });

    it('should reject verb with incomplete reference path', () => {
      // Reference without valid identifier after @ followed by invalid token
      expect(() => Odin.parse('result = %upper @[invalid')).toThrow(ParseError);
    });
  });

  describe('Context Errors', () => {
    it('should reject % in path position', () => {
      expect(() => Odin.parse('%invalid = "value"')).toThrow(ParseError);
    });

    it('should reject standalone %verb without assignment', () => {
      expect(() => Odin.parse('%upper @name')).toThrow(ParseError);
    });
  });

  describe('Arity Validation Errors', () => {
    it('should reject fixed-arity verb with too few arguments', () => {
      // %upper requires 1 argument
      expect(() => Odin.parse('result = %upper')).toThrow(ParseError);
      expect(() => Odin.parse('result = %upper')).toThrow(/requires 1 argument/);
    });

    it('should reject ifElse with insufficient arguments', () => {
      // %ifElse requires 3 arguments
      expect(() => Odin.parse('result = %ifElse @cond')).toThrow(ParseError);
      expect(() => Odin.parse('result = %ifElse @cond "yes"')).toThrow(ParseError);
    });

    it('should reject binary verb with only one argument', () => {
      // %add requires 2 arguments
      expect(() => Odin.parse('result = %add @value')).toThrow(ParseError);
      expect(() => Odin.parse('result = %add @value')).toThrow(/requires 2 argument/);
    });

    it('should reject variadic verb with zero arguments', () => {
      // %concat is variadic but requires at least 1 argument
      expect(() => Odin.parse('result = %concat')).toThrow(ParseError);
      expect(() => Odin.parse('result = %concat')).toThrow(/at least 1 argument/);
    });

    it('should accept zero-arity verbs with no arguments', () => {
      // %now has arity 0
      const doc = Odin.parse('result = %now');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('now');
      expect(value.args).toHaveLength(0);
    });

    it('should accept optional-argument verbs with fewer args', () => {
      // %uuid has arity 1 but min arity 0 (seed is optional)
      const doc = Odin.parse('result = %uuid');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('uuid');
      expect(value.args).toHaveLength(0);
    });

    it('should accept nested verb counting toward parent arity', () => {
      // %upper %trim @name - upper gets 1 arg (the nested verb expression)
      const doc = Odin.parse('result = %upper %trim @name');
      const value = doc.get('result') as OdinVerbExpression;
      expect(value.verb).toBe('upper');
      expect(value.args).toHaveLength(1);
      expect(value.args[0]?.type).toBe('verb');
    });

    it('should reject when nested verb consumes too few args', () => {
      // %concat %upper - concat is variadic (min 1), upper needs 1 arg
      // After %upper, no more args, so upper has 0 args -> error
      expect(() => Odin.parse('result = %concat %upper')).toThrow(ParseError);
      expect(() => Odin.parse('result = %concat %upper')).toThrow(/requires 1 argument/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: SERIALIZATION TESTS
// Verify verbs serialize correctly
// ═══════════════════════════════════════════════════════════════════════════════

describe('Verb Expression Serialization', () => {
  it('should serialize simple verb', () => {
    const doc = Odin.parse('result = %upper @name');
    const serialized = Odin.stringify(doc);
    expect(serialized).toContain('%upper');
    expect(serialized).toContain('@name');
  });

  it('should serialize verb with string argument', () => {
    const doc = Odin.parse('result = %concat @a " " @b');
    const serialized = Odin.stringify(doc);
    expect(serialized).toContain('%concat');
    expect(serialized).toContain('" "');
  });

  it('should serialize custom verb with %&', () => {
    const doc = Odin.parse('result = %&customVerb @value');
    const serialized = Odin.stringify(doc);
    expect(serialized).toContain('%&customVerb');
  });

  it('should serialize nested verbs', () => {
    const doc = Odin.parse('result = %upper %trim @name');
    const serialized = Odin.stringify(doc);
    expect(serialized).toContain('%upper');
    expect(serialized).toContain('%trim');
  });

  it('should serialize verb with numeric arguments', () => {
    const doc = Odin.parse('result = %substring @text ##0 ##5');
    const serialized = Odin.stringify(doc);
    expect(serialized).toContain('##0');
    expect(serialized).toContain('##5');
  });

  it('should serialize verb with boolean argument', () => {
    const doc = Odin.parse('result = %ifElse true @yes @no');
    const serialized = Odin.stringify(doc);
    expect(serialized).toMatch(/true/);
  });

  it('should serialize verb with null argument', () => {
    const doc = Odin.parse('result = %coalesce @value ~');
    const serialized = Odin.stringify(doc);
    expect(serialized).toContain('~');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: CANONICALIZATION TESTS
// Verify verbs canonicalize correctly
// ═══════════════════════════════════════════════════════════════════════════════

describe('Verb Expression Canonicalization', () => {
  it('should canonicalize simple verb', () => {
    const doc = Odin.parse('result = %upper @name');
    const canonical = Odin.canonicalize(doc);
    const text = new TextDecoder().decode(canonical);
    expect(text).toContain('%upper');
    expect(text).toContain('@name');
  });

  it('should canonicalize custom verb', () => {
    const doc = Odin.parse('result = %&customVerb @value');
    const canonical = Odin.canonicalize(doc);
    const text = new TextDecoder().decode(canonical);
    expect(text).toContain('%&customVerb');
  });

  it('should produce deterministic output', () => {
    const doc1 = Odin.parse('result = %concat @a " " @b');
    const doc2 = Odin.parse('result = %concat @a " " @b');

    const c1 = Odin.canonicalize(doc1);
    const c2 = Odin.canonicalize(doc2);

    expect(c1).toEqual(c2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: TYPE GUARD TESTS
// Verify isOdinVerbExpression works correctly
// ═══════════════════════════════════════════════════════════════════════════════

describe('Verb Expression Type Guards', () => {
  it('should identify verb expression with isOdinVerbExpression', () => {
    const doc = Odin.parse('result = %upper @name');
    const value = doc.get('result');

    // Type guard should work
    expect(value?.type).toBe('verb');
    if (value?.type === 'verb') {
      expect(value.verb).toBe('upper');
      expect(value.isCustom).toBe(false);
      expect(Array.isArray(value.args)).toBe(true);
    }
  });

  it('should distinguish verb from string', () => {
    const doc = Odin.parse(`
      verb_value = %upper @name
      string_value = "just a string"
    `);

    expect(doc.get('verb_value')?.type).toBe('verb');
    expect(doc.get('string_value')?.type).toBe('string');
  });

  it('should distinguish verb from reference', () => {
    const doc = Odin.parse(`
      verb_value = %upper @name
      ref_value = @other.path
    `);

    expect(doc.get('verb_value')?.type).toBe('verb');
    expect(doc.get('ref_value')?.type).toBe('reference');
  });
});
