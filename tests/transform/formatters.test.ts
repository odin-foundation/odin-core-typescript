/**
 * Tests for ODIN Transform Formatters
 *
 * Tests the formatOutput function and jsToOdinValue conversions
 * that preserve ODIN type information through the transform pipeline.
 */

import { describe, it, expect } from 'vitest';
import { parseTransform } from '../../src/index.js';
import { executeTransform } from '../../src/transform/engine.js';

// ─────────────────────────────────────────────────────────────────────────────
// jsToOdinValue Type Conversion Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('jsToOdinValue Type Conversions', () => {
  describe('Numeric Type Handling', () => {
    it('preserves integer type from ODIN source', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
Count = "@.count"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
count = ##42
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('##42');
    });

    it('preserves decimal number type', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
Price = "@.price"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
price = #99.99
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('#99.99');
    });

    it('preserves currency type with decimal places', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
Amount = "@.amount"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
amount = #$199.99
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('#$199.99');
    });
  });

  describe('Temporal Type Handling', () => {
    it('preserves date type from ODIN source', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
EventDate = "@.eventDate"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
eventDate = 2024-06-15
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('2024-06-15');
      // Should NOT have timestamp format
      expect(result.formatted).not.toContain('T00:00:00');
    });

    it('preserves timestamp type from ODIN source', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
EventTime = "@.eventTime"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
eventTime = 2024-06-15T10:30:00Z
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('2024-06-15T10:30:00');
    });

    it('preserves time type from ODIN source', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
StartTime = "@.startTime"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
startTime = T14:30:00
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('T14:30:00');
    });

    it('preserves duration type from ODIN source', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
Period = "@.period"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
period = P1Y6M
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('P1Y6M');
    });
  });

  describe('Boolean Type Handling', () => {
    it('preserves true boolean', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
Active = "@.active"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
active = true
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('true');
    });

    it('preserves false boolean', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
Inactive = "@.inactive"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
inactive = false
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('false');
    });
  });

  describe('Null Type Handling', () => {
    it('preserves null value', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
Empty = "@.empty"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
empty = ~
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('~');
    });
  });

  describe('String Type Handling', () => {
    it('preserves string value', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "odin"

{Output}
Name = "@.name"
`;
      const transform = parseTransform(transformText);
      const source = `{$}
odin = "1.0.0"
{}
name = "Hello World"
`;
      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('"Hello World"');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Field Modifier Output Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Field Modifier Output', () => {
  describe('Modifier Prefix Order', () => {
    it('outputs modifiers in correct order: ! then * then -', () => {
      // The order should be: ! (critical/required), * (redacted/confidential), - (deprecated)
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Data}
RequiredField = "@.value :required"
ConfidentialField = "@.value :confidential"
DeprecatedField = "@.value :deprecated"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 'test' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('!"test"');
      expect(result.formatted).toContain('*"test"');
      expect(result.formatted).toContain('-"test"');
    });
  });

  describe('Modifier + Type Combinations', () => {
    it('applies modifiers to integer type', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Data}
RequiredInt = "@.value :type integer :required"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 42 });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('!##42');
    });

    it('applies modifiers to currency type', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Data}
ConfidentialAmount = "@.value :type currency :confidential"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 1000 });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('*#$1000.00');
    });

    it('applies modifiers to date type', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Data}
RequiredDate = "@.value :date :required"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: '2024-06-15' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('!2024-06-15');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JSON Output Format Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('JSON Output Format', () => {
  it('outputs dates as ISO strings in JSON', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "json"

{output}
eventDate = "@.value :date"
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, { value: '2024-06-15' });
    expect(result.success).toBe(true);
    expect(result.formatted).toContain('"eventDate": "2024-06-15"');
  });

  it('outputs timestamps as ISO strings in JSON', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "json"

{output}
eventTime = "@.value :timestamp"
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, { value: '2024-06-15T10:30:00Z' });
    expect(result.success).toBe(true);
    expect(result.formatted).toContain('"eventTime": "2024-06-15T10:30:00.000Z"');
  });

  it('outputs numbers correctly in JSON', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "json"

{output}
count = "@.value :type integer"
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, { value: 42.9 });
    expect(result.success).toBe(true);
    expect(result.formatted).toContain('"count": 42');
  });
});
