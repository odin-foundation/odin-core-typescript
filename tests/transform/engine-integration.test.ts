/**
 * Transform Engine Integration Tests
 *
 * End-to-end tests for transform execution including:
 * - Multi-verb chains
 * - Verb + loop combinations
 * - Verb + conditional combinations
 * - Accumulator with multiple verbs
 * - Real-world transform scenarios
 *
 * NOTE: In the ODIN transform parser, nested verbs consume all remaining arguments.
 * For example: `%outer %inner @.arg "extra"` parses as outer(inner(@.arg, "extra"))
 * NOT as outer(inner(@.arg), "extra")
 *
 * NOTE: Engine output (result.output) contains TransformValue objects (CDM).
 * Use extractValues() for backward-compatible JS value comparisons.
 */

import { describe, it, expect } from 'vitest';
import { parseTransform, executeTransform } from '../../src/transform/index.js';
import { extractValues } from './helpers.js';

// Helper to get JS values from CDM output
function getValues(result: ReturnType<typeof executeTransform>) {
  return extractValues(result.output);
}

describe('Transform Engine Integration', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Multi-Verb Chains
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Multi-Verb Chains', () => {
    it('chains string verbs: trim then upper', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
name = "%upper %trim @.rawName"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { rawName: '  john doe  ' });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { name: string } };
      expect(output.output.name).toBe('JOHN DOE');
    });

    it('chains string verbs: lower then trim', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
name = "%trim %lower @.rawName"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { rawName: '  JOHN DOE  ' });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { name: string } };
      expect(output.output.name).toBe('john doe');
    });

    it('applies add verb with two paths', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
total = "%add @.price @.tax"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { price: 99.99, tax: 7.75 });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { total: number } };
      expect(output.output.total).toBeCloseTo(107.74, 2);
    });

    it('chains conditional with string verb: coalesce then upper', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
status = "%upper %coalesce @.status @.defaultStatus"
`;
      const transform = parseTransform(transformDoc);

      const result1 = executeTransform(transform, { status: 'active', defaultStatus: 'pending' });
      const output1 = getValues(result1) as { output: { status: string } };
      expect(output1.output.status).toBe('ACTIVE');

      const result2 = executeTransform(transform, { status: null, defaultStatus: 'pending' });
      const output2 = getValues(result2) as { output: { status: string } };
      expect(output2.output.status).toBe('PENDING');
    });

    it('applies coerceDate to convert string to date', () => {
      // coerceDate auto-detects format, no format argument needed
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
date = "%coerceDate @.dateString"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { dateString: 'June 15, 2024' });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { date: Date } };
      // coerceDate returns a date type
      expect(output.output.date).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Complex Field Mappings
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Complex Field Mappings', () => {
    it('applies titleCase to concatenated strings', () => {
      // Note: nested verbs consume remaining args, so %titleCase %concat @.a @.b
      // means titleCase(concat(@.a, @.b)) which is correct
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
fullName = "%titleCase %concat @.firstName @.lastName"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { firstName: 'john ', lastName: 'DOE' });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { fullName: string } };
      expect(output.output.fullName).toBe('John Doe');
    });

    it('formats phone number with mask', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
phone = "%mask @.rawPhone \\"(###) ###-####\\""
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { rawPhone: '5125551234' });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { phone: string } };
      expect(output.output.phone).toBe('(512) 555-1234');
    });

    it('divides two values', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
ratio = "%divide @.part @.total"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { part: 3, total: 4 });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { ratio: number } };
      expect(output.output.ratio).toBe(0.75);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Encoding Scenarios
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Encoding Scenarios', () => {
    it('base64 encodes sensitive data', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
encodedToken = "%base64Encode @.token"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { token: 'secret-api-key' });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { encodedToken: string } };
      expect(output.output.encodedToken).toBe('c2VjcmV0LWFwaS1rZXk=');
    });

    it('url encodes query parameters', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
encoded = "%urlEncode @.query"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { query: 'hello world' });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { encoded: string } };
      expect(output.output.encoded).toBe('hello%20world');
    });

    it('escapes JSON content', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
escapedContent = "%jsonEncode @.content"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { content: 'Line 1\nLine 2\tTabbed' });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { escapedContent: string } };
      expect(output.output.escapedContent).toBe('Line 1\\nLine 2\\tTabbed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Lookup Table Integration
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Lookup Table Integration', () => {
    it('maps status codes to descriptions', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$table.STATUS[code, description]}
"A", "Active"
"P", "Pending"
"X", "Cancelled"

{output}
statusCode = "@.status"
statusDescription = "%lookup STATUS.description @.status"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { status: 'A' });

      expect(result.success).toBe(true);
      const output = getValues(result) as {
        output: { statusCode: string; statusDescription: string };
      };
      expect(output.output.statusDescription).toBe('Active');
    });

    it('uses default for unknown lookup values', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$table.STATUS[code, description]}
"A", "Active"
"P", "Pending"

{output}
statusDescription = "%lookupDefault STATUS.description @.status Unknown"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { status: 'X' });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { statusDescription: string } };
      expect(output.output.statusDescription).toBe('Unknown');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // UUID and Sequence Generation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('UUID and Sequence Generation', () => {
    it('generates unique identifier', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
id = "%uuid"
name = "@.name"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { name: 'Test' });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { id: string; name: string } };
      expect(output.output.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('generates sequential line numbers', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{items[]}
_loop = "@"
_from = "items"
lineNumber = "%sequence line"
value = "@.value"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {
        items: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
      });

      expect(result.success).toBe(true);
      const output = getValues(result) as { items: Array<{ lineNumber: number; value: string }> };
      expect(output.items[0]?.lineNumber).toBe(1);
      expect(output.items[1]?.lineNumber).toBe(2);
      expect(output.items[2]?.lineNumber).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Loop Directive Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Loop Directive Tests', () => {
    it('iterates over array with _loop', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{items[]}
_loop = "@"
_from = "items"
name = "@.name"
value = "@.value"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {
        items: [
          { name: 'first', value: 1 },
          { name: 'second', value: 2 },
          { name: 'third', value: 3 },
        ],
      });

      expect(result.success).toBe(true);
      const output = getValues(result) as { items: Array<{ name: string; value: number }> };
      expect(output.items).toHaveLength(3);
      expect(output.items[0]?.name).toBe('first');
      expect(output.items[2]?.value).toBe(3);
    });

    it('applies verbs within loop', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{items[]}
_loop = "@"
_from = "items"
upperName = "%upper @.name"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {
        items: [{ name: 'first' }, { name: 'second' }],
      });

      expect(result.success).toBe(true);
      const output = getValues(result) as { items: Array<{ upperName: string }> };
      expect(output.items[0]?.upperName).toBe('FIRST');
      expect(output.items[1]?.upperName).toBe('SECOND');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Copy Expression Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Copy Expression Tests', () => {
    it('copies simple path', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
name = "@.user.name"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { user: { name: 'John' } });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { name: string } };
      expect(output.output.name).toBe('John');
    });

    it('copies nested paths', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
city = "@.address.city"
zip = "@.address.postal.code"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {
        address: { city: 'Austin', postal: { code: '78701' } },
      });

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { city: string; zip: string } };
      expect(output.output.city).toBe('Austin');
      expect(output.output.zip).toBe('78701');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Literal Value Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Literal Value Tests', () => {
    it('outputs string literal', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
status = "active"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { status: string } };
      expect(output.output.status).toBe('active');
    });

    it('outputs numeric literals', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
count = ##42
rate = #1.5
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      const output = getValues(result) as { output: { count: number; rate: number } };
      expect(output.output.count).toBe(42);
      expect(output.output.rate).toBe(1.5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Real-World Scenarios
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Real-World Scenarios', () => {
    it('transforms basic policy data', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{policy}
policyNumber = "%upper @.policyId"
status = "%coalesce @.status @.defaultStatus"
premiumTotal = "%add @.premium.base @.premium.fees"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {
        policyId: 'pol-123-abc',
        status: 'active',
        defaultStatus: 'pending',
        premium: {
          base: 1200,
          fees: 95.5,
        },
      });

      expect(result.success).toBe(true);
      const output = getValues(result) as any;

      expect(output.policy.policyNumber).toBe('POL-123-ABC');
      expect(output.policy.status).toBe('active');
      expect(output.policy.premiumTotal).toBe(1295.5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Error Handling in Transforms
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Error Handling in Transforms', () => {
    it('handles missing optional fields gracefully', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
name = "@.name"
nickname = "@.nickname"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { name: 'John' });

      expect(result.success).toBe(true);
      const output = getValues(result) as any;
      expect(output.output.name).toBe('John');
      expect(output.output.nickname).toBeNull();
    });

    it('uses fallback for missing values with ifNull', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
status = "%ifNull @.status pending"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { status: null });

      expect(result.success).toBe(true);
      const output = getValues(result) as any;
      expect(output.output.status).toBe('pending');
    });

    it('uses fallback for empty values with ifEmpty', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{output}
priority = "%ifEmpty @.priority normal"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { priority: '' });

      expect(result.success).toBe(true);
      const output = getValues(result) as any;
      expect(output.output.priority).toBe('normal');
    });
  });
});
