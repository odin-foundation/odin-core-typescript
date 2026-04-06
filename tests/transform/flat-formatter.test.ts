/**
 * Tests for Flat Output Formatter
 */

import { describe, it, expect } from 'vitest';
import { parseTransform, executeTransform } from '../../src/transform/index.js';

describe('Flat Output Formatter', () => {
  it('formats simple object to flat', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "flat"

{Output}
name = "John"
age = ##30
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, {});

    expect(result.success).toBe(true);
    expect(result.formatted).toContain('Output.name=John');
    expect(result.formatted).toContain('Output.age=30');
  });

  it('formats nested object to flat with dot notation', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "flat"

{person}
name = "John"

{person.address}
city = "NYC"
zip = "10001"
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, {});

    expect(result.success).toBe(true);
    expect(result.formatted).toContain('person.name=John');
    expect(result.formatted).toContain('person.address.city=NYC');
    expect(result.formatted).toContain('person.address.zip=10001');
  });

  it('formats array with bracket notation', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "flat"

{items[0]}
value = "A"

{items[1]}
value = "B"

{items[2]}
value = "C"
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, {});

    expect(result.success).toBe(true);
    expect(result.formatted).toContain('items[0].value=A');
    expect(result.formatted).toContain('items[1].value=B');
    expect(result.formatted).toContain('items[2].value=C');
  });

  it('outputs raw values without ODIN type prefixes', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "flat"

{data}
amount = #$99.99
count = ##42
ratio = #3.14
active = ?true
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, {});

    expect(result.success).toBe(true);
    // Values should NOT have type prefixes
    expect(result.formatted).toContain('data.amount=99.99');
    expect(result.formatted).toContain('data.count=42');
    expect(result.formatted).toContain('data.ratio=3.14');
    expect(result.formatted).toContain('data.active=true');
    // Should NOT contain ODIN prefixes
    expect(result.formatted).not.toContain('#$');
    expect(result.formatted).not.toContain('##');
  });

  it('handles date values correctly', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "flat"

{event}
date = 2024-12-15
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, {});

    expect(result.success).toBe(true);
    expect(result.formatted).toContain('event.date=2024-12-15');
  });

  it('quotes strings with special characters', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "flat"

{data}
equation = "a=b+c"
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, {});

    expect(result.success).toBe(true);
    // String with = should be quoted
    expect(result.formatted).toMatch(/data\.equation=".*"/);
  });

  it('skips null values', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "flat"

{data}
name = "Test"
empty = ~
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, {});

    expect(result.success).toBe(true);
    expect(result.formatted).toContain('data.name=Test');
    // Null value should be skipped
    expect(result.formatted).not.toContain('data.empty');
  });

  it('handles properties alias', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "properties"

{config}
value = "test"
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, {});

    expect(result.success).toBe(true);
    expect(result.formatted).toContain('config.value=test');
  });

  it('uses custom line ending', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "flat"
target.lineEnding = "\\r\\n"

{data}
a = "1"
b = "2"
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, {});

    expect(result.success).toBe(true);
    // Check that output has Windows line endings
    expect(result.formatted).toContain('\r\n');
  });

  it('handles complex nested structures', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "flat"

{company}
name = "ACME"

{company.employees[0]}
name = "John"
department.name = "Engineering"

{company.employees[1]}
name = "Jane"
department.name = "Marketing"
`;
    const transform = parseTransform(transformText);
    const result = executeTransform(transform, {});

    expect(result.success).toBe(true);
    expect(result.formatted).toContain('company.name=ACME');
    expect(result.formatted).toContain('company.employees[0].name=John');
    expect(result.formatted).toContain('company.employees[0].department.name=Engineering');
    expect(result.formatted).toContain('company.employees[1].name=Jane');
    expect(result.formatted).toContain('company.employees[1].department.name=Marketing');
  });
});
