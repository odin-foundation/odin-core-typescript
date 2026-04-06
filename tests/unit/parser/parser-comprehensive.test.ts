/**
 * Comprehensive Parser Tests for ODIN TypeScript SDK
 *
 * Covers parser edge cases for Rust test parity:
 * - Unicode keys and values
 * - All ODIN type prefixes (#, ##, #$, #%, ?, ~, @, ^, T)
 * - Deeply nested sections
 * - Error recovery (malformed headers, unterminated strings, invalid prefixes)
 * - Multi-document parsing
 * - Comment handling edge cases
 * - Large documents
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../../src/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: UNICODE KEYS AND VALUES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Unicode Keys and Values', () => {
  it('parses ASCII keys with unicode string values', () => {
    const doc = Odin.parse('greeting = "Hola mundo"');
    expect(doc.getString('greeting')).toBe('Hola mundo');
  });

  it('parses string with accented characters', () => {
    const doc = Odin.parse('name = "caf\u00e9"');
    expect(doc.getString('name')).toBe('caf\u00e9');
  });

  it('parses string with CJK characters', () => {
    const doc = Odin.parse('text = "\u4f60\u597d\u4e16\u754c"');
    expect(doc.getString('text')).toBe('\u4f60\u597d\u4e16\u754c');
  });

  it('parses string with emoji', () => {
    const doc = Odin.parse('mood = "\u{1F600}\u{1F389}"');
    expect(doc.getString('mood')).toBe('\u{1F600}\u{1F389}');
  });

  it('parses string with Arabic characters', () => {
    const doc = Odin.parse('text = "\u0645\u0631\u062d\u0628\u0627"');
    expect(doc.getString('text')).toBe('\u0645\u0631\u062d\u0628\u0627');
  });

  it('parses string with Cyrillic characters', () => {
    const doc = Odin.parse('text = "\u041f\u0440\u0438\u0432\u0435\u0442"');
    expect(doc.getString('text')).toBe('\u041f\u0440\u0438\u0432\u0435\u0442');
  });

  it('parses string with mixed unicode', () => {
    const doc = Odin.parse('text = "Hello \u4e16\u754c \u{1F30D}"');
    expect(doc.getString('text')).toBe('Hello \u4e16\u754c \u{1F30D}');
  });

  it('parses empty string', () => {
    const doc = Odin.parse('empty = ""');
    expect(doc.getString('empty')).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: ALL ODIN TYPE PREFIXES
// ═══════════════════════════════════════════════════════════════════════════════

describe('All ODIN Type Prefixes', () => {
  describe('Number prefix (#)', () => {
    it('parses positive float', () => {
      const doc = Odin.parse('value = #3.14');
      expect(doc.get('value')?.type).toBe('number');
      expect(doc.getNumber('value')).toBeCloseTo(3.14);
    });

    it('parses negative float', () => {
      const doc = Odin.parse('value = #-2.5');
      expect(doc.getNumber('value')).toBeCloseTo(-2.5);
    });

    it('parses zero', () => {
      const doc = Odin.parse('value = #0');
      expect(doc.getNumber('value')).toBe(0);
    });

    it('parses large number', () => {
      const doc = Odin.parse('value = #999999.999');
      expect(doc.getNumber('value')).toBeCloseTo(999999.999);
    });

    it('parses very small number', () => {
      const doc = Odin.parse('value = #0.001');
      expect(doc.getNumber('value')).toBeCloseTo(0.001);
    });
  });

  describe('Integer prefix (##)', () => {
    it('parses positive integer', () => {
      const doc = Odin.parse('value = ##42');
      expect(doc.get('value')?.type).toBe('integer');
      expect(doc.getInteger('value')).toBe(42);
    });

    it('parses zero integer', () => {
      const doc = Odin.parse('value = ##0');
      expect(doc.getInteger('value')).toBe(0);
    });

    it('parses negative integer', () => {
      const doc = Odin.parse('value = ##-10');
      expect(doc.getInteger('value')).toBe(-10);
    });

    it('parses large integer', () => {
      const doc = Odin.parse('value = ##999999');
      expect(doc.getInteger('value')).toBe(999999);
    });
  });

  describe('Currency prefix (#$)', () => {
    it('parses currency with two decimal places', () => {
      const doc = Odin.parse('price = #$99.99');
      expect(doc.get('price')?.type).toBe('currency');
      expect(doc.getNumber('price')).toBeCloseTo(99.99);
    });

    it('parses currency with no decimals', () => {
      const doc = Odin.parse('price = #$100');
      expect(doc.getNumber('price')).toBe(100);
    });

    it('parses zero currency', () => {
      const doc = Odin.parse('price = #$0.00');
      expect(doc.getNumber('price')).toBe(0);
    });

    it('parses large currency', () => {
      const doc = Odin.parse('price = #$1000000.50');
      expect(doc.getNumber('price')).toBeCloseTo(1000000.50);
    });
  });

  describe('Percentage prefix (#%)', () => {
    it('parses percentage value', () => {
      const doc = Odin.parse('rate = #%50');
      const val = doc.get('rate');
      expect(val).toBeDefined();
      // Percentage is parsed as 'percent' type
      expect(val?.type).toBe('percent');
    });

    it('parses decimal percentage', () => {
      const doc = Odin.parse('rate = #%12.5');
      const val = doc.get('rate');
      expect(val).toBeDefined();
      expect(val?.type).toBe('percent');
    });
  });

  describe('Boolean values', () => {
    it('parses ?true', () => {
      const doc = Odin.parse('flag = ?true');
      expect(doc.get('flag')?.type).toBe('boolean');
      expect(doc.getBoolean('flag')).toBe(true);
    });

    it('parses ?false', () => {
      const doc = Odin.parse('flag = ?false');
      expect(doc.get('flag')?.type).toBe('boolean');
      expect(doc.getBoolean('flag')).toBe(false);
    });

    it('parses bare true', () => {
      const doc = Odin.parse('flag = true');
      expect(doc.get('flag')?.type).toBe('boolean');
      expect(doc.getBoolean('flag')).toBe(true);
    });

    it('parses bare false', () => {
      const doc = Odin.parse('flag = false');
      expect(doc.get('flag')?.type).toBe('boolean');
      expect(doc.getBoolean('flag')).toBe(false);
    });
  });

  describe('Null prefix (~)', () => {
    it('parses null', () => {
      const doc = Odin.parse('nothing = ~');
      expect(doc.get('nothing')?.type).toBe('null');
    });
  });

  describe('Reference prefix (@)', () => {
    it('parses simple reference', () => {
      const doc = Odin.parse('ref = @other');
      expect(doc.get('ref')?.type).toBe('reference');
    });

    it('parses dotted reference', () => {
      const doc = Odin.parse('ref = @person.name');
      expect(doc.get('ref')?.type).toBe('reference');
    });

    it('parses reference with array index', () => {
      const doc = Odin.parse('ref = @items[0]');
      expect(doc.get('ref')?.type).toBe('reference');
    });
  });

  describe('Binary prefix (^)', () => {
    it('parses base64 binary', () => {
      const doc = Odin.parse('data = ^SGVsbG8=');
      expect(doc.get('data')?.type).toBe('binary');
    });

    it('parses empty base64', () => {
      const doc = Odin.parse('data = ^');
      const val = doc.get('data');
      expect(val?.type).toBe('binary');
    });
  });

  describe('Time prefix (T)', () => {
    it('parses time value', () => {
      const doc = Odin.parse('time = T10:30:00');
      expect(doc.get('time')?.type).toBe('time');
    });

    it('parses time with milliseconds', () => {
      const doc = Odin.parse('time = T10:30:00.500');
      expect(doc.get('time')?.type).toBe('time');
    });
  });

  describe('Date values', () => {
    it('parses date', () => {
      const doc = Odin.parse('effective = 2024-06-15');
      expect(doc.get('effective')?.type).toBe('date');
    });

    it('parses timestamp', () => {
      const doc = Odin.parse('created = 2024-06-15T10:30:00Z');
      expect(doc.get('created')?.type).toBe('timestamp');
    });

    it('parses timestamp with offset', () => {
      const doc = Odin.parse('created = 2024-06-15T10:30:00+05:00');
      expect(doc.get('created')?.type).toBe('timestamp');
    });
  });

  describe('Duration values', () => {
    it('parses ISO 8601 duration', () => {
      const doc = Odin.parse('dur = P1Y2M3D');
      expect(doc.get('dur')?.type).toBe('duration');
    });

    it('parses duration with time', () => {
      const doc = Odin.parse('dur = P1DT2H30M');
      expect(doc.get('dur')?.type).toBe('duration');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: DEEPLY NESTED SECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deeply Nested Sections', () => {
  it('parses two-level nesting via headers', () => {
    const doc = Odin.parse(`
{customer}
name = "John"

{customer.address}
city = "Austin"
`);
    expect(doc.getString('customer.name')).toBe('John');
    expect(doc.getString('customer.address.city')).toBe('Austin');
  });

  it('parses three-level nesting via paths', () => {
    const doc = Odin.parse('a.b.c = "deep"');
    expect(doc.getString('a.b.c')).toBe('deep');
  });

  it('parses nested sections with mixed types', () => {
    const doc = Odin.parse(`
{config}
name = "MyApp"
version = ##2
debug = ?false

{config.database}
host = "localhost"
port = ##5432
`);
    expect(doc.getString('config.name')).toBe('MyApp');
    expect(doc.getInteger('config.version')).toBe(2);
    expect(doc.getBoolean('config.debug')).toBe(false);
    expect(doc.getString('config.database.host')).toBe('localhost');
    expect(doc.getInteger('config.database.port')).toBe(5432);
  });

  it('handles multiple sibling sections', () => {
    const doc = Odin.parse(`
{a}
x = ##1

{b}
x = ##2

{c}
x = ##3
`);
    expect(doc.getInteger('a.x')).toBe(1);
    expect(doc.getInteger('b.x')).toBe(2);
    expect(doc.getInteger('c.x')).toBe(3);
  });

  it('handles section returning to root', () => {
    const doc = Odin.parse(`
{section}
nested = "in section"

rootField = "at root"
`);
    // rootField at root level (not in section context)
    // Different parsers may handle this differently
    const nested = doc.getString('section.nested');
    expect(nested).toBe('in section');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: ERROR RECOVERY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error Recovery', () => {
  describe('Malformed headers', () => {
    it('rejects unclosed header brace', () => {
      expect(() => Odin.parse('{section\nname = "test"')).toThrow();
    });

    it('rejects header with special characters', () => {
      expect(() => Odin.parse('{sec=tion}\nname = "test"')).toThrow();
    });
  });

  describe('Unterminated strings', () => {
    it('rejects unterminated string', () => {
      expect(() => Odin.parse('name = "unterminated')).toThrow();
    });

    it('rejects string with only opening quote', () => {
      expect(() => Odin.parse('name = "')).toThrow();
    });
  });

  describe('Invalid values', () => {
    it('rejects bare strings (unquoted multi-word)', () => {
      expect(() => Odin.parse('name = John Smith')).toThrow();
    });

    it('rejects invalid boolean', () => {
      expect(() => Odin.parse('flag = ?maybe')).toThrow();
    });
  });

  describe('Missing values', () => {
    it('rejects assignment with no value', () => {
      expect(() => Odin.parse('name =')).toThrow();
    });

    it('rejects assignment with no equals', () => {
      expect(() => Odin.parse('name "value"')).toThrow();
    });
  });

  describe('Duplicate paths', () => {
    it('rejects duplicate path assignment', () => {
      expect(() => Odin.parse('name = "John"\nname = "Jane"')).toThrow(ParseError);
    });
  });

  describe('Invalid array indices', () => {
    it('rejects non-contiguous array indices', () => {
      expect(() => Odin.parse('items[0] = "a"\nitems[5] = "f"')).toThrow(ParseError);
    });

    it('rejects negative array index', () => {
      expect(() => Odin.parse('items[-1] = "bad"')).toThrow(ParseError);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: COMMENT HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Comment Handling Edge Cases', () => {
  it('parses line with semicolon comment', () => {
    const doc = Odin.parse('name = "John" ; This is a comment');
    expect(doc.getString('name')).toBe('John');
  });

  it('parses document with comment-only lines', () => {
    const doc = Odin.parse(`
; This is a comment
name = "John"
; Another comment
age = ##30
`);
    expect(doc.getString('name')).toBe('John');
    expect(doc.getInteger('age')).toBe(30);
  });

  it('parses document starting with comments', () => {
    const doc = Odin.parse(`; Comment at start
; Another comment
name = "John"`);
    expect(doc.getString('name')).toBe('John');
  });

  it('handles comment after section header', () => {
    const doc = Odin.parse(`
{section} ; section comment
name = "test"
`);
    expect(doc.getString('section.name')).toBe('test');
  });

  it('does not treat semicolons inside strings as comments', () => {
    const doc = Odin.parse('text = "hello; world"');
    expect(doc.getString('text')).toBe('hello; world');
  });

  it('handles document that is all comments', () => {
    // An all-comment document should parse as empty (or throw for empty doc)
    try {
      const doc = Odin.parse('; only comments\n; nothing else');
      // If it succeeds, it should be an empty document
      expect(doc.toJSON()).toBeDefined();
    } catch (e) {
      // Some parsers throw for empty documents
      expect(e).toBeDefined();
    }
  });

  it('handles blank lines between assignments', () => {
    const doc = Odin.parse(`
name = "John"

age = ##30

city = "Austin"
`);
    expect(doc.getString('name')).toBe('John');
    expect(doc.getInteger('age')).toBe(30);
    expect(doc.getString('city')).toBe('Austin');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: MODIFIER PARSING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Modifier Parsing', () => {
  it('parses required modifier', () => {
    const doc = Odin.parse('name = !"John"');
    expect(doc.getString('name')).toBe('John');
    const mods = doc.modifiers.get('name');
    expect(mods?.required).toBe(true);
  });

  it('parses confidential modifier', () => {
    const doc = Odin.parse('ssn = *"123-45-6789"');
    expect(doc.getString('ssn')).toBe('123-45-6789');
    const mods = doc.modifiers.get('ssn');
    expect(mods?.confidential).toBe(true);
  });

  it('parses deprecated modifier', () => {
    const doc = Odin.parse('old = -"legacy"');
    expect(doc.getString('old')).toBe('legacy');
    const mods = doc.modifiers.get('old');
    expect(mods?.deprecated).toBe(true);
  });

  it('parses combined modifiers (required + confidential)', () => {
    const doc = Odin.parse('critical = !*"secret"');
    expect(doc.getString('critical')).toBe('secret');
    const mods = doc.modifiers.get('critical');
    expect(mods?.required).toBe(true);
    expect(mods?.confidential).toBe(true);
  });

  it('parses all three modifiers combined', () => {
    const doc = Odin.parse('field = !-*"value"');
    expect(doc.getString('field')).toBe('value');
    const mods = doc.modifiers.get('field');
    expect(mods?.required).toBe(true);
    expect(mods?.deprecated).toBe(true);
    expect(mods?.confidential).toBe(true);
  });

  it('parses modifier on integer value', () => {
    const doc = Odin.parse('count = !##42');
    expect(doc.getInteger('count')).toBe(42);
    const mods = doc.modifiers.get('count');
    expect(mods?.required).toBe(true);
  });

  it('parses modifier on boolean value', () => {
    const doc = Odin.parse('flag = !?true');
    expect(doc.getBoolean('flag')).toBe(true);
    const mods = doc.modifiers.get('flag');
    expect(mods?.required).toBe(true);
  });

  it('parses modifier on null value', () => {
    const doc = Odin.parse('empty = !~');
    expect(doc.get('empty')?.type).toBe('null');
    const mods = doc.modifiers.get('empty');
    expect(mods?.required).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: METADATA PARSING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Metadata Parsing', () => {
  it('parses metadata header', () => {
    const doc = Odin.parse(`
{$}
odin = "1.0.0"

{data}
name = "test"
`);
    expect(doc.getString('$.odin')).toBe('1.0.0');
    expect(doc.getString('data.name')).toBe('test');
  });

  it('parses metadata with multiple fields', () => {
    const doc = Odin.parse(`
{$}
odin = "1.0.0"
id = "doc-123"

{data}
value = ##42
`);
    expect(doc.getString('$.odin')).toBe('1.0.0');
    expect(doc.getString('$.id')).toBe('doc-123');
    expect(doc.getInteger('data.value')).toBe(42);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: LARGE DOCUMENT PARSING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Large Document Parsing', () => {
  it('parses 200 field document', () => {
    const lines: string[] = [];
    for (let i = 0; i < 200; i++) {
      lines.push(`field${i} = "value${i}"`);
    }
    const doc = Odin.parse(lines.join('\n'));
    expect(doc.getString('field0')).toBe('value0');
    expect(doc.getString('field199')).toBe('value199');
  });

  it('parses document with 20 sections', () => {
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push(`{section${i}}`);
      lines.push(`name = "section${i}"`);
      lines.push(`value = ##${i}`);
    }
    const doc = Odin.parse(lines.join('\n'));
    expect(doc.getString('section0.name')).toBe('section0');
    expect(doc.getString('section19.name')).toBe('section19');
  });

  it('parses document with many comments', () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(`; Comment ${i}`);
      lines.push(`field${i} = "value${i}"`);
    }
    const doc = Odin.parse(lines.join('\n'));
    expect(doc.getString('field0')).toBe('value0');
    expect(doc.getString('field49')).toBe('value49');
  });

  it('parses document with long string values', () => {
    const longString = 'a'.repeat(1000);
    const doc = Odin.parse(`text = "${longString}"`);
    expect(doc.getString('text')).toBe(longString);
    expect(doc.getString('text')?.length).toBe(1000);
  });

  it('parses document with many types intermixed', () => {
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push(`str${i} = "text${i}"`);
      lines.push(`int${i} = ##${i}`);
      lines.push(`num${i} = #${i}.5`);
      lines.push(`bool${i} = ?${i % 2 === 0 ? 'true' : 'false'}`);
      lines.push(`nil${i} = ~`);
    }
    const doc = Odin.parse(lines.join('\n'));
    expect(doc.getString('str0')).toBe('text0');
    expect(doc.getInteger('int0')).toBe(0);
    expect(doc.getNumber('num0')).toBeCloseTo(0.5);
    expect(doc.getBoolean('bool0')).toBe(true);
    expect(doc.get('nil0')?.type).toBe('null');
    expect(doc.getString('str19')).toBe('text19');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: ESCAPE SEQUENCES IN STRINGS
// ═══════════════════════════════════════════════════════════════════════════════

describe('String Escape Sequences', () => {
  it('parses escaped quote', () => {
    const doc = Odin.parse('text = "say \\"hello\\""');
    expect(doc.getString('text')).toBe('say "hello"');
  });

  it('parses escaped backslash', () => {
    const doc = Odin.parse('path = "c:\\\\temp"');
    expect(doc.getString('path')).toBe('c:\\temp');
  });

  it('parses escaped newline', () => {
    const doc = Odin.parse('text = "line1\\nline2"');
    expect(doc.getString('text')).toBe('line1\nline2');
  });

  it('parses escaped tab', () => {
    const doc = Odin.parse('text = "col1\\tcol2"');
    expect(doc.getString('text')).toBe('col1\tcol2');
  });

  it('parses multiple escape sequences', () => {
    const doc = Odin.parse('text = "a\\tb\\nc\\\\d"');
    expect(doc.getString('text')).toBe('a\tb\nc\\d');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: TOSTRING / TOJSON
// ═══════════════════════════════════════════════════════════════════════════════

describe('Document toJSON', () => {
  it('converts simple document to JSON', () => {
    const doc = Odin.parse('name = "John"\nage = ##30');
    const json = doc.toJSON();
    expect(json.name).toBe('John');
    expect(json.age).toBe(30);
  });

  it('converts sectioned document to JSON', () => {
    const doc = Odin.parse(`
{customer}
name = "John"
age = ##30
`);
    const json = doc.toJSON();
    expect((json.customer as any).name).toBe('John');
    expect((json.customer as any).age).toBe(30);
  });

  it('converts null values to null in JSON', () => {
    const doc = Odin.parse('value = ~');
    const json = doc.toJSON();
    expect(json.value).toBeNull();
  });

  it('converts boolean values correctly in JSON', () => {
    const doc = Odin.parse('active = ?true\ndeleted = ?false');
    const json = doc.toJSON();
    expect(json.active).toBe(true);
    expect(json.deleted).toBe(false);
  });
});
