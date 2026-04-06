/**
 * JSON Import Validation Tests
 *
 * Validates that the transform framework correctly parses and handles
 * all JSON input types. This ensures JSON data is properly imported
 * and typed values are correctly extracted.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTransform, executeTransform } from '../../src/transform/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenDir = path.resolve(__dirname, '../../../golden');

// CDM typed value format
interface CdmValue<T> {
  type: string;
  value: T;
}

/**
 * Extract raw value from CDM typed value
 */
function getValue<T>(cdmValue: CdmValue<T> | T | undefined): T | undefined {
  if (cdmValue === undefined || cdmValue === null) return undefined;
  if (typeof cdmValue === 'object' && 'type' in cdmValue && 'value' in cdmValue) {
    return cdmValue.value as T;
  }
  return cdmValue as T;
}

/**
 * Get CDM type from value
 */
function getType(cdmValue: CdmValue<unknown> | undefined): string | undefined {
  if (cdmValue === undefined || cdmValue === null) return undefined;
  if (typeof cdmValue === 'object' && 'type' in cdmValue) {
    return cdmValue.type as string;
  }
  return undefined;
}

// Simple passthrough transform
const _passthroughTransform = `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
result = "@.input"
`;

// Transform that extracts specific fields
function createFieldTransform(fieldPath: string): string {
  return `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
result = "@.${fieldPath}"
`;
}

describe('JSON Import Validation', () => {
  describe('Primitive Types', () => {
    it('parses string values', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: 'hello world' });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<string>>>;
      expect(getType(output?.output?.result)).toBe('string');
      expect(getValue(output?.output?.result)).toBe('hello world');
    });

    it('parses empty string', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: '' });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<string>>>;
      expect(getType(output?.output?.result)).toBe('string');
      expect(getValue(output?.output?.result)).toBe('');
    });

    it('parses integer values', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: 42 });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getType(output?.output?.result)).toBe('integer');
      expect(getValue(output?.output?.result)).toBe(42);
    });

    it('parses negative integer values', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: -100 });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getType(output?.output?.result)).toBe('integer');
      expect(getValue(output?.output?.result)).toBe(-100);
    });

    it('parses zero', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: 0 });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getType(output?.output?.result)).toBe('integer');
      expect(getValue(output?.output?.result)).toBe(0);
    });

    it('parses floating point values', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: 3.14159 });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getType(output?.output?.result)).toBe('number');
      expect(getValue(output?.output?.result)).toBeCloseTo(3.14159, 5);
    });

    it('parses negative floating point values', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: -99.99 });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getType(output?.output?.result)).toBe('number');
      expect(getValue(output?.output?.result)).toBeCloseTo(-99.99, 2);
    });

    it('parses boolean true', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: true });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<boolean>>>;
      expect(getType(output?.output?.result)).toBe('boolean');
      expect(getValue(output?.output?.result)).toBe(true);
    });

    it('parses boolean false', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: false });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<boolean>>>;
      expect(getType(output?.output?.result)).toBe('boolean');
      expect(getValue(output?.output?.result)).toBe(false);
    });

    it('parses null values', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: null });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<null>>>;
      expect(getType(output?.output?.result)).toBe('null');
    });
  });

  describe('Nested Objects', () => {
    it('parses nested object fields', () => {
      const transform = parseTransform(createFieldTransform('person.name'));
      const result = executeTransform(transform, {
        person: { name: 'John', age: 30 },
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<string>>>;
      expect(getValue(output?.output?.result)).toBe('John');
    });

    it('parses deeply nested object fields', () => {
      const transform = parseTransform(createFieldTransform('level1.level2.level3.value'));
      const result = executeTransform(transform, {
        level1: { level2: { level3: { value: 'deep' } } },
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<string>>>;
      expect(getValue(output?.output?.result)).toBe('deep');
    });

    it('handles empty object', () => {
      const transform = parseTransform(createFieldTransform('obj'));
      const result = executeTransform(transform, { obj: {} });

      expect(result.success).toBe(true);
    });
  });

  describe('Arrays', () => {
    it('parses array of strings', () => {
      const transform = parseTransform(`{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
count = "%count @.items"
first = "%first @.items"
`);
      const result = executeTransform(transform, { items: ['a', 'b', 'c'] });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number | string>>>;
      expect(getValue(output?.output?.count)).toBe(3);
      expect(getValue(output?.output?.first)).toBe('a');
    });

    it('parses array of numbers', () => {
      const transform = parseTransform(`{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
sum = "%sum @.numbers"
avg = "%avg @.numbers"
`);
      const result = executeTransform(transform, { numbers: [10, 20, 30] });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getValue(output?.output?.sum)).toBe(60);
      expect(getValue(output?.output?.avg)).toBe(20);
    });

    it('parses array of objects', () => {
      const transform = parseTransform(`{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
count = "%count @.users"
totalAge = "%sum @.users.age"
`);
      const result = executeTransform(transform, {
        users: [
          { name: 'Alice', age: 25 },
          { name: 'Bob', age: 30 },
        ],
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getValue(output?.output?.count)).toBe(2);
      expect(getValue(output?.output?.totalAge)).toBe(55);
    });

    it('handles empty array', () => {
      const transform = parseTransform(`{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
count = "%count @.items"
`);
      const result = executeTransform(transform, { items: [] });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getValue(output?.output?.count)).toBe(0);
    });

    it('parses mixed type array', () => {
      const transform = parseTransform(`{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
count = "%count @.mixed"
`);
      const result = executeTransform(transform, { mixed: [1, 'two', true, null] });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getValue(output?.output?.count)).toBe(4);
    });
  });

  describe('Special Characters', () => {
    it('parses strings with unicode', () => {
      const transform = parseTransform(createFieldTransform('text'));
      const result = executeTransform(transform, { text: '日本語テスト' });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<string>>>;
      expect(getValue(output?.output?.result)).toBe('日本語テスト');
    });

    it('parses strings with emoji', () => {
      const transform = parseTransform(createFieldTransform('text'));
      const result = executeTransform(transform, { text: 'Hello 👋 World 🌍' });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<string>>>;
      expect(getValue(output?.output?.result)).toBe('Hello 👋 World 🌍');
    });

    it('parses strings with newlines', () => {
      const transform = parseTransform(createFieldTransform('text'));
      const result = executeTransform(transform, { text: 'line1\nline2\nline3' });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<string>>>;
      expect(getValue(output?.output?.result)).toBe('line1\nline2\nline3');
    });

    it('parses strings with special JSON characters', () => {
      const transform = parseTransform(createFieldTransform('text'));
      const result = executeTransform(transform, { text: 'quotes: "test" and backslash: \\' });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<string>>>;
      expect(getValue(output?.output?.result)).toBe('quotes: "test" and backslash: \\');
    });
  });

  describe('Edge Cases', () => {
    it('handles large integers', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: 9007199254740991 }); // MAX_SAFE_INTEGER

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getValue(output?.output?.result)).toBe(9007199254740991);
    });

    it('handles very small floating point', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: 0.000001 });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getValue(output?.output?.result)).toBeCloseTo(0.000001, 6);
    });

    it('handles scientific notation', () => {
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: 1.5e10 });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getValue(output?.output?.result)).toBe(1.5e10);
    });

    it('handles very long strings', () => {
      const longString = 'a'.repeat(10000);
      const transform = parseTransform(createFieldTransform('value'));
      const result = executeTransform(transform, { value: longString });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<string>>>;
      expect(getValue(output?.output?.result)).toBe(longString);
    });

    it('handles large arrays', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const transform = parseTransform(`{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
count = "%count @.items"
sum = "%sum @.items"
`);
      const result = executeTransform(transform, { items: largeArray });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<number>>>;
      expect(getValue(output?.output?.count)).toBe(1000);
      expect(getValue(output?.output?.sum)).toBe(499500); // sum of 0-999
    });
  });

  describe('Type Preservation', () => {
    it('distinguishes integer from number', () => {
      const transformInt = parseTransform(createFieldTransform('value'));
      const resultInt = executeTransform(transformInt, { value: 42 });

      const transformFloat = parseTransform(createFieldTransform('value'));
      const resultFloat = executeTransform(transformFloat, { value: 42.5 });

      const outputInt = resultInt.output as Record<string, Record<string, CdmValue<number>>>;
      const outputFloat = resultFloat.output as Record<string, Record<string, CdmValue<number>>>;

      expect(getType(outputInt?.output?.result)).toBe('integer');
      expect(getType(outputFloat?.output?.result)).toBe('number');
    });

    it('preserves type through transformations', () => {
      const transform = parseTransform(`{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
str = "@.strVal"
num = "@.numVal"
bool = "@.boolVal"
`);
      const result = executeTransform(transform, {
        strVal: 'test',
        numVal: 123,
        boolVal: true,
      });

      expect(result.success).toBe(true);
      const output = result.output as Record<string, Record<string, CdmValue<unknown>>>;
      expect(getType(output?.output?.str)).toBe('string');
      expect(getType(output?.output?.num)).toBe('integer');
      expect(getType(output?.output?.bool)).toBe('boolean');
    });
  });
});

// ─── Golden File–Driven JSON Import Tests ────────────────────────────────────

interface GoldenJsonImportTest {
  id: string;
  description: string;
  transform: string;
  input: unknown;
  expected?: { output?: Record<string, unknown> };
}

interface GoldenJsonImportSuite {
  suite: string;
  tests: GoldenJsonImportTest[];
}

function assertValueMatches(actual: unknown, expected: unknown, path: string): void {
  if (expected === null || expected === undefined) {
    // null check
    return;
  }
  if (typeof expected === 'boolean') {
    expect(getValue(actual as CdmValue<boolean>)).toBe(expected);
  } else if (typeof expected === 'number') {
    const actualVal = getValue(actual as CdmValue<number>);
    if (Number.isInteger(expected)) {
      expect(actualVal).toBe(expected);
    } else {
      expect(actualVal).toBeCloseTo(expected, 5);
    }
  } else if (typeof expected === 'string') {
    expect(getValue(actual as CdmValue<string>)).toBe(expected);
  } else if (typeof expected === 'object' && !Array.isArray(expected)) {
    const obj = actual as Record<string, unknown>;
    for (const [key, val] of Object.entries(expected as Record<string, unknown>)) {
      assertValueMatches(obj?.[key], val, `${path}.${key}`);
    }
  }
}

describe('Golden JSON Import Tests (from golden file)', () => {
  const jsonImportDir = path.join(goldenDir, 'json-import');
  if (!fs.existsSync(jsonImportDir)) return;

  const jsonFiles = fs.readdirSync(jsonImportDir)
    .filter(f => f.endsWith('.json') && f !== 'manifest.json');

  for (const file of jsonFiles) {
    const content = fs.readFileSync(path.join(jsonImportDir, file), 'utf-8');
    const suite = JSON.parse(content) as GoldenJsonImportSuite;

    describe(suite.suite || file, () => {
      for (const test of suite.tests) {
        it(test.description || test.id, () => {
          const transform = parseTransform(test.transform);
          const result = executeTransform(transform, test.input);

          expect(result.success).toBe(true);

          if (test.expected?.output) {
            const output = result.output as Record<string, Record<string, unknown>>;
            const outSeg = output?.output;
            expect(outSeg).toBeDefined();
            for (const [key, val] of Object.entries(test.expected.output)) {
              assertValueMatches(outSeg?.[key], val, `output.${key}`);
            }
          }
        });
      }
    });
  }
});
