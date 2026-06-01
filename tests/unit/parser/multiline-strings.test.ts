/**
 * Triple-quoted multiline string parsing tests.
 *
 * Tests for:
 * - Verbatim multiline content spanning newlines
 * - Single-line triple-quoted strings
 * - Leading/trailing newline retention (verbatim at the core layer)
 * - Embedded quotes and backslashes
 * - Unterminated block errors
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError } from '../../../src/index.js';

describe('Multiline String Parsing', () => {
  it('parses a multiline block spanning newlines', () => {
    const doc = Odin.parse('field = """hello\nworld"""');
    expect(doc.getString('field')).toBe('hello\nworld');
  });

  it('parses a single-line triple-quoted string', () => {
    const doc = Odin.parse('field = """one line"""');
    expect(doc.getString('field')).toBe('one line');
  });

  it('retains leading and trailing newlines verbatim', () => {
    const doc = Odin.parse('field = """\ninner\n"""');
    expect(doc.getString('field')).toBe('\ninner\n');
  });

  it('parses an empty triple-quoted string', () => {
    const doc = Odin.parse('field = """"""');
    expect(doc.getString('field')).toBe('');
  });

  it('keeps single and double quotes verbatim inside the block', () => {
    const doc = Odin.parse('field = """say "hi" \'yo\'"""');
    expect(doc.getString('field')).toBe('say "hi" \'yo\'');
  });

  it('keeps backslashes verbatim (no escape decoding)', () => {
    const doc = Odin.parse('field = """C:\\path\\to"""');
    expect(doc.getString('field')).toBe('C:\\path\\to');
  });

  it('keeps interpolation markers verbatim at the core layer', () => {
    const doc = Odin.parse('field = """value=${@x}"""');
    expect(doc.getString('field')).toBe('value=${@x}');
  });

  it('throws P004 on an unterminated multiline block', () => {
    expect(() => Odin.parse('field = """never closed\n')).toThrow(ParseError);
    try {
      Odin.parse('field = """never closed\n');
    } catch (err) {
      expect((err as ParseError).code).toBe('P004');
    }
  });

  it('does not treat a normal quoted string as multiline', () => {
    const doc = Odin.parse('a = ""\nb = "x"');
    expect(doc.getString('a')).toBe('');
    expect(doc.getString('b')).toBe('x');
  });
});
