/**
 * Transform Feature Tests
 *
 * Comprehensive tests for transform features:
 * - coerceDate/coerceTimestamp verbs
 * - Generation, encoding, and array verbs
 * - Segment _if conditionals
 * - _from directive for loops
 * - Import directive parsing
 * - T001-T010 error codes
 *
 * NOTE: Engine output (result.output) contains TransformValue objects (CDM).
 * Use extractValues() for backward-compatible JS value comparisons.
 */

import { describe, it, expect } from 'vitest';
import {
  parseTransform,
  executeTransform,
  executeMultiRecordTransform,
  TransformErrorCodes,
} from '../../src/transform/index.js';
import { defaultVerbRegistry } from '../../src/transform/verbs.js';
import type { TransformValue, TransformContext } from '../../src/types/transform.js';
import { extractValues } from './helpers.js';

// Helper to get JS values from CDM output
function getValues(result: ReturnType<typeof executeTransform>) {
  return extractValues(result.output);
}

// Helper to create a minimal context for verb testing
function createTestContext(source: unknown = {}): TransformContext {
  return {
    source,
    current: undefined,
    aliases: new Map(),
    counters: new Map(),
    accumulators: new Map(),
    tables: new Map(),
    constants: new Map(),
    sequenceCounters: new Map(),
  };
}

// Helper to call a verb directly
function callVerb(
  name: string,
  args: TransformValue[],
  context?: TransformContext
): TransformValue {
  const verb = defaultVerbRegistry.get(name);
  if (!verb) throw new Error(`Verb ${name} not found`);
  return verb(args, context ?? createTestContext());
}

describe('Transform Features', () => {
  describe('coerceDate verb', () => {
    it('parses ISO 8601 date strings', () => {
      const result = callVerb('coerceDate', [{ type: 'string', value: '2024-06-15' }]);
      expect(result.type).toBe('date');
      if (result.type === 'date') {
        expect(result.value.getUTCFullYear()).toBe(2024);
        expect(result.value.getUTCMonth()).toBe(5); // June = 5 (0-indexed)
        expect(result.value.getUTCDate()).toBe(15);
      }
    });

    it('parses ISO 8601 datetime strings', () => {
      const result = callVerb('coerceDate', [{ type: 'string', value: '2024-06-15T14:30:00Z' }]);
      expect(result.type).toBe('date');
    });

    it('parses Unix timestamps in milliseconds', () => {
      // 2024-06-15T00:00:00Z in ms
      const ms = Date.UTC(2024, 5, 15);
      const result = callVerb('coerceDate', [{ type: 'integer', value: ms }]);
      expect(result.type).toBe('date');
      if (result.type === 'date') {
        expect(result.value.getUTCFullYear()).toBe(2024);
        expect(result.value.getUTCMonth()).toBe(5);
        expect(result.value.getUTCDate()).toBe(15);
      }
    });

    it('parses Unix timestamps in seconds (auto-detection)', () => {
      // A timestamp in seconds (less than 100 billion)
      const seconds = Math.floor(Date.UTC(2024, 5, 15) / 1000);
      const result = callVerb('coerceDate', [{ type: 'integer', value: seconds }]);
      expect(result.type).toBe('date');
    });

    it('parses US format dates (MM/DD/YYYY)', () => {
      const result = callVerb('coerceDate', [{ type: 'string', value: '06/15/2024' }]);
      expect(result.type).toBe('date');
      if (result.type === 'date') {
        expect(result.value.getUTCMonth()).toBe(5);
        expect(result.value.getUTCDate()).toBe(15);
      }
    });

    it('parses compact format (YYYYMMDD)', () => {
      const result = callVerb('coerceDate', [{ type: 'string', value: '20240615' }]);
      expect(result.type).toBe('date');
      if (result.type === 'date') {
        expect(result.value.getUTCFullYear()).toBe(2024);
        expect(result.value.getUTCMonth()).toBe(5);
        expect(result.value.getUTCDate()).toBe(15);
      }
    });

    it('parses written format (Month DD, YYYY)', () => {
      const result = callVerb('coerceDate', [{ type: 'string', value: 'June 15, 2024' }]);
      expect(result.type).toBe('date');
      if (result.type === 'date') {
        expect(result.value.getUTCMonth()).toBe(5);
      }
    });

    it('parses written format (DD Month YYYY)', () => {
      const result = callVerb('coerceDate', [{ type: 'string', value: '15 June 2024' }]);
      expect(result.type).toBe('date');
    });

    it('returns null for invalid dates', () => {
      const result = callVerb('coerceDate', [{ type: 'string', value: 'not a date' }]);
      expect(result.type).toBe('null');
    });

    it('returns null for empty strings', () => {
      const result = callVerb('coerceDate', [{ type: 'string', value: '' }]);
      expect(result.type).toBe('null');
    });

    it('returns null for null values', () => {
      const result = callVerb('coerceDate', [{ type: 'null' }]);
      expect(result.type).toBe('null');
    });

    it('passes through existing date values', () => {
      const date = new Date('2024-06-15');
      const result = callVerb('coerceDate', [{ type: 'date', value: date }]);
      expect(result.type).toBe('date');
      if (result.type === 'date') {
        expect(result.value).toBe(date);
      }
    });
  });

  describe('coerceTimestamp verb', () => {
    it('returns timestamp type instead of date', () => {
      const result = callVerb('coerceTimestamp', [
        { type: 'string', value: '2024-06-15T14:30:00Z' },
      ]);
      expect(result.type).toBe('timestamp');
    });
  });

  describe('pad verb', () => {
    it('pads string to specified length', () => {
      const result = callVerb('pad', [
        { type: 'string', value: 'test' },
        { type: 'integer', value: 10 },
        { type: 'string', value: ' ' },
      ]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('test      ');
        expect(result.value.length).toBe(10);
      }
    });
  });

  describe('uuid verb', () => {
    it('generates valid UUID v4 format', () => {
      const result = callVerb('uuid', []);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        expect(result.value).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      }
    });

    it('generates unique UUIDs', () => {
      const result1 = callVerb('uuid', []);
      const result2 = callVerb('uuid', []);
      expect(result1.type).toBe('string');
      expect(result2.type).toBe('string');
      if (result1.type === 'string' && result2.type === 'string') {
        expect(result1.value).not.toBe(result2.value);
      }
    });
  });

  describe('sequence verb', () => {
    it('increments sequence on each call (shared context)', () => {
      const ctx = createTestContext();
      const result1 = callVerb('sequence', [{ type: 'string', value: 'test_seq' }], ctx);
      const result2 = callVerb('sequence', [{ type: 'string', value: 'test_seq' }], ctx);
      const result3 = callVerb('sequence', [{ type: 'string', value: 'test_seq' }], ctx);

      expect(result1.type).toBe('integer');
      expect(result2.type).toBe('integer');
      expect(result3.type).toBe('integer');

      if (result1.type === 'integer' && result2.type === 'integer' && result3.type === 'integer') {
        expect(result2.value).toBe(result1.value + 1);
        expect(result3.value).toBe(result2.value + 1);
      }
    });

    it('uses custom start value', () => {
      const result = callVerb('sequence', [
        { type: 'string', value: 'custom_start_seq' },
        { type: 'integer', value: 100 },
      ]);
      expect(result.type).toBe('integer');
      if (result.type === 'integer') {
        expect(result.value).toBe(100);
      }
    });
  });

  describe('base64 encoding verbs', () => {
    it('encodes string to base64', () => {
      const result = callVerb('base64Encode', [{ type: 'string', value: 'Hello, World!' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('SGVsbG8sIFdvcmxkIQ==');
      }
    });

    it('decodes base64 to string', () => {
      const result = callVerb('base64Decode', [{ type: 'string', value: 'SGVsbG8sIFdvcmxkIQ==' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('Hello, World!');
      }
    });

    it('handles round-trip encoding', () => {
      const original = 'Test with special chars: @#$%^&*()';
      const encoded = callVerb('base64Encode', [{ type: 'string', value: original }]);
      const decoded = callVerb('base64Decode', [encoded]);
      expect(decoded.type).toBe('string');
      if (decoded.type === 'string') {
        expect(decoded.value).toBe(original);
      }
    });
  });

  describe('URL encoding verbs', () => {
    it('encodes string for URL', () => {
      const result = callVerb('urlEncode', [{ type: 'string', value: 'hello world' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello%20world');
      }
    });

    it('decodes URL-encoded string', () => {
      const result = callVerb('urlDecode', [{ type: 'string', value: 'hello%20world' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('hello world');
      }
    });

    it('encodes special characters', () => {
      const result = callVerb('urlEncode', [{ type: 'string', value: 'a=b&c=d' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('a%3Db%26c%3Dd');
      }
    });
  });

  describe('JSON encoding verbs', () => {
    it('escapes string for JSON', () => {
      const result = callVerb('jsonEncode', [{ type: 'string', value: 'line1\nline2' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('line1\\nline2');
      }
    });

    it('unescapes JSON string', () => {
      const result = callVerb('jsonDecode', [{ type: 'string', value: 'line1\\nline2' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('line1\nline2');
      }
    });

    it('handles quotes in JSON encoding', () => {
      const result = callVerb('jsonEncode', [{ type: 'string', value: 'say "hello"' }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('say \\"hello\\"');
      }
    });
  });

  describe('Array operation verbs', () => {
    // Arrays used in tests - verbs now expect array TransformValue, not path strings
    const items = [
      { id: 1, name: 'Widget', status: 'active', amount: 100 },
      { id: 2, name: 'Gadget', status: 'inactive', amount: 200 },
      { id: 3, name: 'Thing', status: 'active', amount: 150 },
    ];
    const tags = ['red', 'green', 'blue', 'red'];
    const nested = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];

    // Helper to create array TransformValue
    const arr = (value: unknown[]): TransformValue => ({ type: 'array', items: value as any });

    it('filters array by field equality', () => {
      const result = callVerb('filter', [
        arr(items),
        { type: 'string', value: 'status' },
        { type: 'string', value: '=' },
        { type: 'string', value: 'active' },
      ]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(2);
      }
    });

    it('filters array by numeric comparison', () => {
      const result = callVerb('filter', [
        arr(items),
        { type: 'string', value: 'amount' },
        { type: 'string', value: '>' },
        { type: 'integer', value: 100 },
      ]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(2);
      }
    });

    it('flattens nested arrays', () => {
      const result = callVerb('flatten', [arr(nested)]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([1, 2, 3, 4, 5, 6]);
      }
    });

    it('removes duplicates with distinct', () => {
      const result = callVerb('distinct', [arr(tags)]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toHaveLength(3);
        expect(result.items).toContain('red');
        expect(result.items).toContain('green');
        expect(result.items).toContain('blue');
      }
    });

    it('sorts array ascending', () => {
      const nums = [3, 1, 4, 1, 5, 9];
      const result = callVerb('sort', [arr(nums)]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([1, 1, 3, 4, 5, 9]);
      }
    });

    it('sorts array descending', () => {
      const nums = [3, 1, 4];
      const result = callVerb('sort', [
        arr(nums),
        { type: 'string', value: '' },
        { type: 'string', value: 'desc' },
      ]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([4, 3, 1]);
      }
    });

    it('maps field from objects', () => {
      const result = callVerb('map', [arr(items), { type: 'string', value: 'name' }]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual(['Widget', 'Gadget', 'Thing']);
      }
    });

    it('finds index of value', () => {
      const result = callVerb('indexOf', [arr(tags), { type: 'string', value: 'green' }]);
      expect(result.type).toBe('integer');
      if (result.type === 'integer') {
        expect(result.value).toBe(1);
      }
    });

    it('gets element at index', () => {
      const result = callVerb('at', [arr(tags), { type: 'integer', value: 2 }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('blue');
      }
    });

    it('gets element at negative index', () => {
      const result = callVerb('at', [arr(tags), { type: 'integer', value: -1 }]);
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe('red'); // last element
      }
    });

    it('slices array', () => {
      const result = callVerb('slice', [
        arr(tags),
        { type: 'integer', value: 1 },
        { type: 'integer', value: 3 },
      ]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual(['green', 'blue']);
      }
    });

    it('reverses array', () => {
      const nums = [1, 2, 3];
      const result = callVerb('reverse', [arr(nums)]);
      expect(result.type).toBe('array');
      if (result.type === 'array') {
        expect(result.items).toEqual([3, 2, 1]);
      }
    });
  });

  describe('Segment _if conditional', () => {
    it('includes segment when condition is true', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
_if = "@includeDetails = 'yes'"
details = "@data"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { includeDetails: 'yes', data: 'test data' });

      expect(result.success).toBe(true);
      const output = getValues(result) as Record<string, unknown>;
      expect(output).toHaveProperty('output');
      expect((output['output'] as Record<string, unknown>)?.details).toBe('test data');
    });

    it('excludes segment when condition is false', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
_if = "@includeDetails = 'yes'"
details = "@data"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { includeDetails: 'no', data: 'test data' });

      expect(result.success).toBe(true);
      // The segment should be skipped
      const output = getValues(result) as Record<string, unknown>;
      expect(output).not.toHaveProperty('output');
    });

    it('handles truthy check (no operator)', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
_if = "@isEnabled"
value = "@data"
`;
      const transform = parseTransform(transformDoc);

      const resultTrue = executeTransform(transform, { isEnabled: true, data: 'test' });
      const outputTrue = getValues(resultTrue) as Record<string, unknown>;
      expect(outputTrue).toHaveProperty('output');

      const resultFalse = executeTransform(transform, { isEnabled: false, data: 'test' });
      const outputFalse = getValues(resultFalse) as Record<string, unknown>;
      expect(outputFalse).not.toHaveProperty('output');
    });

    it('handles numeric comparisons', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{premium}
_if = "@amount > 100"
value = "@amount"
`;
      const transform = parseTransform(transformDoc);

      const resultHigh = executeTransform(transform, { amount: 150 });
      const outputHigh = getValues(resultHigh) as Record<string, unknown>;
      expect(outputHigh).toHaveProperty('premium');

      const resultLow = executeTransform(transform, { amount: 50 });
      const outputLow = getValues(resultLow) as Record<string, unknown>;
      expect(outputLow).not.toHaveProperty('premium');
    });
  });

  describe('Import directive parsing', () => {
    it('parses imports from transform document', () => {
      const transformDoc = `
@import ./lookup_tables/states.odin as states
@import ./shared/codes.odin

{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
value = "@.input"
`;
      const transform = parseTransform(transformDoc);

      expect(transform.imports).toHaveLength(2);
      expect(transform.imports[0]?.path).toBe('./lookup_tables/states.odin');
      expect(transform.imports[0]?.alias).toBe('states');
      expect(transform.imports[1]?.path).toBe('./shared/codes.odin');
      expect(transform.imports[1]?.alias).toBeUndefined();
    });

    it('includes line numbers for imports', () => {
      const transformDoc = `@import ./first.odin
@import ./second.odin

{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
value = "@.input"
`;
      const transform = parseTransform(transformDoc);

      expect(transform.imports[0]?.line).toBe(1);
      expect(transform.imports[1]?.line).toBe(2);
    });
  });

  describe('_from directive for loops', () => {
    it('uses _from as explicit loop source', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{items[]}
_loop = "@"
_from = "data.items"
name = "@.name"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {
        data: {
          items: [{ name: 'Item 1' }, { name: 'Item 2' }],
        },
      });

      expect(result.success).toBe(true);
      const items = getValues(result) as { items: Array<{ name: string }> };
      expect(items.items).toHaveLength(2);
      expect(items.items[0]?.name).toBe('Item 1');
    });
  });

  describe('T001-T010 Error codes', () => {
    it('T001: reports unknown verb error', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$target}
onError = "fail"

{output}
value = "%nonExistentVerb @.input"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { input: 'test' });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // The error message should mention the unknown verb
      expect(result.errors[0]?.message).toContain('Unknown verb');
    });

    it('CONFIG_ERROR: reports missing discriminator', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "fixed-width->json"

{$source}
format = "fixed-width"

{segment.HDR}
field = "@._line"
`;
      const transform = parseTransform(transformDoc);
      const result = executeMultiRecordTransform(transform, { records: ['test'] });

      expect(result.success).toBe(false);
      expect(result.errors[0]?.code).toBe('CONFIG_ERROR');
    });

    it('UNKNOWN_RECORD_TYPE: reports unknown discriminator value', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "fixed-width->json"

{$source}
format = "fixed-width"
discriminator = ":pos 0 :len 2"

{$target}
onError = "warn"

{segment.HDR}
_type = "01"
field = "@._line"
`;
      const transform = parseTransform(transformDoc);
      const result = executeMultiRecordTransform(transform, {
        records: ['01valid', '99unknown'],
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]?.code).toBe('UNKNOWN_RECORD_TYPE');
    });

    it('SOURCE_MISSING: reports required field missing', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
value = "@.missing :required"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(false);
      expect(result.errors[0]?.code).toBe('SOURCE_MISSING');
    });
  });

  describe('TransformErrorCodes export', () => {
    it('exports all T001-T010 codes', () => {
      expect(TransformErrorCodes.T001_UNKNOWN_VERB).toBe('T001');
      expect(TransformErrorCodes.T002_INVALID_VERB_ARGS).toBe('T002');
      expect(TransformErrorCodes.T003_LOOKUP_TABLE_NOT_FOUND).toBe('T003');
      expect(TransformErrorCodes.T004_LOOKUP_KEY_NOT_FOUND).toBe('T004');
      expect(TransformErrorCodes.T005_SOURCE_PATH_NOT_FOUND).toBe('T005');
      expect(TransformErrorCodes.T006_INVALID_OUTPUT_FORMAT).toBe('T006');
      expect(TransformErrorCodes.T007_INVALID_MODIFIER).toBe('T007');
      expect(TransformErrorCodes.T008_ACCUMULATOR_OVERFLOW).toBe('T008');
      expect(TransformErrorCodes.T009_LOOP_SOURCE_NOT_ARRAY).toBe('T009');
      expect(TransformErrorCodes.T010_POSITION_OVERFLOW).toBe('T010');
    });
  });
});
