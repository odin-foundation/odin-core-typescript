/**
 * Extended integration tests for output formatters.
 *
 * Covers edge cases for JSON, XML, CSV, and Fixed-Width formatting.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../src/odin.js';
import {
  formatOutput,
  normalizeToOdin,
  registerOutputFormatter,
  getOutputFormatter,
} from '../../src/transform/formatters.js';
import type { OdinTransform, TransformValue } from '../../src/types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createTransform(format: string, options: Record<string, unknown> = {}): OdinTransform {
  return {
    odin: '1.0.0',
    transform: '1.0.0',
    direction: 'json->json',
    source: { format: 'json' },
    target: { format, ...options },
    header: {},
    segments: [],
    mappings: [],
    verbs: new Map(),
  };
}

function str(value: string): TransformValue {
  return { type: 'string', value };
}

function int(value: number): TransformValue {
  return { type: 'integer', value };
}

function num(value: number): TransformValue {
  return { type: 'number', value };
}

function bool(value: boolean): TransformValue {
  return { type: 'boolean', value };
}

function nil(): TransformValue {
  return { type: 'null' };
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Formatter Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('JSON formatter', () => {
  it('formats simple object to JSON', () => {
    const output: Record<string, TransformValue> = {
      name: str('John'),
      age: int(30),
    };
    const transform = createTransform('json');

    const result = formatOutput(output, { transform });

    expect(result).toContain('"name"');
    expect(result).toContain('"John"');
    expect(result).toContain('"age"');
    expect(result).toContain('30');
  });

  it('formats nested objects', () => {
    const output: Record<string, TransformValue> = {
      'person.name': str('John'),
      'person.address.city': str('NYC'),
    };
    const transform = createTransform('json');

    const result = formatOutput(output, { transform });
    const parsed = JSON.parse(result);

    expect(parsed.person.name).toBe('John');
    expect(parsed.person.address.city).toBe('NYC');
  });

  it('handles null values', () => {
    const output: Record<string, TransformValue> = {
      name: str('John'),
      spouse: nil(),
    };
    const transform = createTransform('json');

    const result = formatOutput(output, { transform });
    const parsed = JSON.parse(result);

    expect(parsed.spouse).toBe(null);
  });

  it('handles boolean values', () => {
    const output: Record<string, TransformValue> = {
      active: bool(true),
      deleted: bool(false),
    };
    const transform = createTransform('json');

    const result = formatOutput(output, { transform });
    const parsed = JSON.parse(result);

    expect(parsed.active).toBe(true);
    expect(parsed.deleted).toBe(false);
  });

  it('handles numeric values', () => {
    const output: Record<string, TransformValue> = {
      count: int(42),
      price: num(19.99),
    };
    const transform = createTransform('json');

    const result = formatOutput(output, { transform });
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(42);
    expect(parsed.price).toBe(19.99);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// XML Formatter Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('XML formatter', () => {
  it('formats simple object to XML', () => {
    const output: Record<string, TransformValue> = {
      name: str('John'),
      age: int(30),
    };
    const transform = createTransform('xml');

    const result = formatOutput(output, { transform });

    expect(result).toContain('<name>John</name>');
    // XML formatter includes type attribute for integers
    expect(result).toContain('<age');
    expect(result).toContain('>30</age>');
  });

  it('formats nested objects', () => {
    const output: Record<string, TransformValue> = {
      'person.name': str('John'),
      'person.city': str('NYC'),
    };
    const transform = createTransform('xml');

    const result = formatOutput(output, { transform });

    expect(result).toContain('<person>');
    expect(result).toContain('<name>John</name>');
  });

  it('escapes special XML characters', () => {
    const output: Record<string, TransformValue> = {
      message: str('Price < $100 & discount > 10%'),
    };
    const transform = createTransform('xml');

    const result = formatOutput(output, { transform });

    expect(result).toContain('&lt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&gt;');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV Formatter Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CSV formatter', () => {
  it('formats object to CSV with header', () => {
    const output: Record<string, TransformValue> = {
      name: str('John'),
      age: int(30),
    };
    const transform = createTransform('csv');

    const result = formatOutput(output, { transform });
    const lines = result.split('\n');

    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('age');
    expect(lines[1]).toContain('John');
    expect(lines[1]).toContain('30');
  });

  it('escapes values with delimiter', () => {
    const output: Record<string, TransformValue> = {
      message: str('Hello, World'),
    };
    const transform = createTransform('csv');

    const result = formatOutput(output, { transform });

    // Should be quoted because it contains comma
    expect(result).toContain('"Hello, World"');
  });

  it('escapes values with quotes', () => {
    const output: Record<string, TransformValue> = {
      message: str('Say "Hello"'),
    };
    const transform = createTransform('csv');

    const result = formatOutput(output, { transform });

    // Quotes should be escaped as ""
    expect(result).toContain('""Hello""');
  });

  it('uses custom delimiter', () => {
    const output: Record<string, TransformValue> = {
      name: str('John'),
      age: int(30),
    };
    const transform = createTransform('csv', { delimiter: '|' });

    const result = formatOutput(output, { transform });

    expect(result).toContain('|');
  });

  it('formats without header when specified', () => {
    const output: Record<string, TransformValue> = {
      name: str('John'),
    };
    const transform = createTransform('csv', { header: false });

    const result = formatOutput(output, { transform });
    const lines = result.split('\n').filter((l) => l.length > 0);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('John');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ODIN Formatter Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ODIN formatter', () => {
  it('formats to valid ODIN syntax', () => {
    const output: Record<string, TransformValue> = {
      name: str('John'),
      age: int(30),
    };
    const transform = createTransform('odin');

    const result = formatOutput(output, { transform });

    // Should be parseable ODIN
    expect(() => Odin.parse(result)).not.toThrow();
  });

  it('does not include forced metadata header', () => {
    const output: Record<string, TransformValue> = {
      name: str('John'),
    };
    const transform = createTransform('odin');

    const result = formatOutput(output, { transform });

    expect(result).not.toContain('{$}');
    expect(result).toContain('name = "John"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Formatter Registry Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Formatter Registry', () => {
  it('registers and retrieves custom formatter', () => {
    const customFormatter = () => 'CUSTOM_OUTPUT';

    registerOutputFormatter('custom-test', customFormatter);
    const retrieved = getOutputFormatter('custom-test');

    expect(retrieved).toBe(customFormatter);
  });

  it('returns undefined for unregistered format', () => {
    const formatter = getOutputFormatter('nonexistent-format');
    expect(formatter).toBeUndefined();
  });

  it('built-in formatters are registered', () => {
    expect(getOutputFormatter('json')).toBeDefined();
    expect(getOutputFormatter('xml')).toBeDefined();
    expect(getOutputFormatter('csv')).toBeDefined();
    expect(getOutputFormatter('odin')).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeToOdin Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeToOdin', () => {
  it('converts TransformValue map to OdinDocument', () => {
    const output: Record<string, TransformValue> = {
      name: str('John'),
      age: int(30),
    };

    const doc = normalizeToOdin(output);

    expect(doc).toBeDefined();
    expect(doc.get('name')?.type).toBe('string');
    expect(doc.get('age')?.type).toBe('integer');
  });

  it('preserves nested paths', () => {
    const output: Record<string, TransformValue> = {
      'person.name': str('John'),
      'person.age': int(30),
    };

    const doc = normalizeToOdin(output);

    expect(doc.get('person.name')?.type).toBe('string');
    expect(doc.get('person.age')?.type).toBe('integer');
  });
});
