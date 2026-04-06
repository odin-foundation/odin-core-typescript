/**
 * Tests for ODIN Transform Engine
 *
 * Tests both direct OdinTransform object creation and parsing of transform
 * documents using the {$identifier} meta header syntax.
 *
 * Note: Engine output (result.output) contains TransformValue objects (CDM).
 * Use extractValues() for backward-compatible JS value comparisons,
 * or use expectCdmValue()/getCdmValue() for direct CDM verification.
 */

import { describe, it, expect } from 'vitest';
import { Odin, parseTransform } from '../../src/index.js';
import { executeTransform, transformDocument } from '../../src/transform/engine.js';
import type { OdinTransform, TransformSegment, FieldMapping } from '../../src/types/transform.js';
import { extractValues, expectCdmValue, getCdmValue } from './helpers.js';

// Helper to create a minimal transform
function createTransform(
  segments: TransformSegment[],
  options?: {
    format?: string;
    tables?: Map<string, { name: string; entries: Map<string, { type: string; value: string }> }>;
    constants?: Map<string, { type: string; value: string }>;
    onError?: 'fail' | 'warn' | 'skip';
  }
): OdinTransform {
  return {
    metadata: {
      odin: '1.0.0',
      transform: '1.0.0',
    },
    source: undefined,
    target: {
      format: options?.format ?? 'json',
      indent: 2,
      onError: options?.onError,
    },
    constants: (options?.constants ?? new Map()) as Map<string, never>,
    accumulators: new Map(),
    tables: (options?.tables ?? new Map()) as Map<string, never>,
    segments,
    imports: [],
  };
}

// Helper to create a copy expression
const copy = (path: string): FieldMapping['value'] => ({ type: 'copy', path });

// Helper to create a literal expression
const literal = (type: string, value: unknown): FieldMapping['value'] => ({
  type: 'literal',
  value: { type, value } as never,
});

// Helper to create a transform expression
const verb = (name: string, ...args: FieldMapping['value'][]): FieldMapping['value'] => ({
  type: 'transform',
  verb: name,
  isCustom: false,
  args,
});

describe('Transform Engine', () => {
  describe('Basic Transform Execution', () => {
    it('executes simple copy transforms', () => {
      const transform = createTransform([
        {
          path: 'policy',
          isArray: false,
          directives: [],
          mappings: [
            { target: 'number', value: copy('policy.number'), modifiers: [] },
            { target: 'status', value: copy('status'), modifiers: [] },
          ],
        },
      ]);

      const source = {
        policy: { number: 'POL-001' },
        status: 'active',
      };

      const result = executeTransform(transform, source);

      expect(result.success).toBe(true);
      // Verify CDM output (TransformValue objects)
      expectCdmValue(result.output, 'policy.number', 'string', 'POL-001');
      expectCdmValue(result.output, 'policy.status', 'string', 'active');
      // Also verify extractValues for backward compatibility
      expect(extractValues(result.output)).toEqual({
        policy: {
          number: 'POL-001',
          status: 'active',
        },
      });
    });

    it('executes transforms with string verbs', () => {
      const transform = createTransform([
        {
          path: 'result',
          isArray: false,
          directives: [],
          mappings: [
            { target: 'upper_name', value: verb('upper', copy('name')), modifiers: [] },
            { target: 'trimmed', value: verb('trim', copy('value')), modifiers: [] },
          ],
        },
      ]);

      const source = {
        name: 'john',
        value: '  hello  ',
      };

      const result = executeTransform(transform, source);

      expect(result.success).toBe(true);
      // Verify CDM output
      expectCdmValue(result.output, 'result.upper_name', 'string', 'JOHN');
      expectCdmValue(result.output, 'result.trimmed', 'string', 'hello');
    });

    it('handles literal values', () => {
      const transform = createTransform([
        {
          path: 'record',
          isArray: false,
          directives: [],
          mappings: [
            { target: 'type', value: literal('string', '01'), modifiers: [] },
            { target: 'count', value: literal('integer', 42), modifiers: [] },
          ],
        },
      ]);

      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      // Verify CDM output with type preservation
      expectCdmValue(result.output, 'record.type', 'string', '01');
      expectCdmValue(result.output, 'record.count', 'integer', 42);
    });
  });

  describe('Lookup Tables', () => {
    it('uses lookup tables for value translation', () => {
      const tables = new Map([
        [
          'STATUS',
          {
            name: 'STATUS',
            columns: ['name', 'code'],
            rows: [
              [
                { type: 'string', value: 'active' },
                { type: 'string', value: 'A' },
              ],
              [
                { type: 'string', value: 'pending' },
                { type: 'string', value: 'P' },
              ],
              [
                { type: 'string', value: 'cancelled' },
                { type: 'string', value: 'C' },
              ],
            ],
          },
        ],
      ]);

      const transform = createTransform(
        [
          {
            path: 'result',
            isArray: false,
            directives: [],
            mappings: [
              {
                target: 'status_code',
                // New syntax: %lookup TABLE.column @match_value
                value: verb('lookup', literal('string', 'STATUS.code'), copy('status')),
                modifiers: [],
              },
            ],
          },
        ],
        { tables: tables as never }
      );

      const source = { status: 'active' };
      const result = executeTransform(transform, source);

      expect(result.success).toBe(true);
      // Verify CDM output
      expectCdmValue(result.output, 'result.status_code', 'string', 'A');
    });
  });

  describe('Constants', () => {
    it('uses document constants', () => {
      const constants = new Map([
        ['DEFAULT_STATE', { type: 'string', value: 'TX' }],
        ['VERSION', { type: 'string', value: '1.0' }],
      ]);

      const transform = createTransform(
        [
          {
            path: 'result',
            isArray: false,
            directives: [],
            mappings: [{ target: 'version', value: copy('$const.VERSION'), modifiers: [] }],
          },
        ],
        { constants: constants as never }
      );

      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      // Verify CDM output
      expectCdmValue(result.output, 'result.version', 'string', '1.0');
    });
  });

  describe('Modifiers', () => {
    it('applies default modifier', () => {
      const transform = createTransform([
        {
          path: 'result',
          isArray: false,
          directives: [],
          mappings: [
            {
              target: 'state',
              value: copy('state'),
              modifiers: [{ name: 'default', value: 'TX' }],
            },
          ],
        },
      ]);

      const result = executeTransform(transform, { state: null });

      expect(result.success).toBe(true);
      // Verify CDM output
      expectCdmValue(result.output, 'result.state', 'string', 'TX');
    });

    it('applies upper modifier', () => {
      const transform = createTransform([
        {
          path: 'result',
          isArray: false,
          directives: [],
          mappings: [
            {
              target: 'code',
              value: copy('code'),
              modifiers: [{ name: 'upper' }],
            },
          ],
        },
      ]);

      const result = executeTransform(transform, { code: 'abc' });

      expect(result.success).toBe(true);
      // Verify CDM output
      expectCdmValue(result.output, 'result.code', 'string', 'ABC');
    });
  });

  describe('Output Formatters', () => {
    describe('JSON output', () => {
      it('formats as JSON with indentation', () => {
        const transform = createTransform([
          {
            path: 'data',
            isArray: false,
            directives: [],
            mappings: [{ target: 'name', value: copy('name'), modifiers: [] }],
          },
        ]);

        const result = executeTransform(transform, { name: 'test' });

        expect(result.formatted).toContain('"name": "test"');
        expect(result.formatted).toContain('  '); // indentation
      });

      it('omits null values when configured', () => {
        const transform: OdinTransform = {
          ...createTransform([
            {
              path: 'data',
              isArray: false,
              directives: [],
              mappings: [
                { target: 'name', value: copy('name'), modifiers: [] },
                { target: 'missing', value: copy('missing'), modifiers: [] },
              ],
            },
          ]),
          target: {
            format: 'json',
            nulls: 'omit',
          },
        };

        const result = executeTransform(transform, { name: 'test' });

        expect(result.formatted).not.toContain('missing');
      });
    });

    describe('XML output', () => {
      it('formats as XML', () => {
        const transform = createTransform(
          [
            {
              path: 'Policy',
              isArray: false,
              directives: [],
              mappings: [{ target: 'Number', value: copy('number'), modifiers: [] }],
            },
          ],
          { format: 'xml' }
        );

        const result = executeTransform(transform, { number: 'POL-001' });

        expect(result.formatted).toContain('<?xml version="1.0"');
        expect(result.formatted).toContain('<Policy>');
        expect(result.formatted).toContain('<Number>POL-001</Number>');
        expect(result.formatted).toContain('</Policy>');
      });
    });

    describe('CSV output', () => {
      it('formats as CSV', () => {
        const transform = createTransform(
          [
            {
              path: 'items',
              isArray: true,
              directives: [{ type: 'loop', value: 'items' }],
              mappings: [
                { target: 'name', value: copy('.name'), modifiers: [] },
                { target: 'value', value: copy('.value'), modifiers: [] },
              ],
            },
          ],
          { format: 'csv' }
        );

        const result = executeTransform(transform, {
          items: [
            { name: 'a', value: 1 },
            { name: 'b', value: 2 },
          ],
        });

        expect(result.formatted).toBeDefined();
      });
    });

    describe('Fixed-width output', () => {
      it('formats fields at specified positions', () => {
        const transform: OdinTransform = {
          metadata: { odin: '1.0.0', transform: '1.0.0', direction: 'odin->fixed-width' },
          source: undefined,
          target: { format: 'fixed-width', lineWidth: 40 },
          constants: new Map(),
          accumulators: new Map(),
          tables: new Map(),
          segments: [
            {
              path: 'record',
              isArray: false,
              directives: [],
              mappings: [
                {
                  target: 'type',
                  value: literal('string', '01'),
                  modifiers: [
                    { name: 'pos', value: 0 },
                    { name: 'len', value: 2 },
                  ],
                },
                {
                  target: 'name',
                  value: copy('name'),
                  modifiers: [
                    { name: 'pos', value: 2 },
                    { name: 'len', value: 15 },
                  ],
                },
                {
                  target: 'amount',
                  value: copy('amount'),
                  modifiers: [
                    { name: 'pos', value: 17 },
                    { name: 'len', value: 10 },
                    { name: 'leftPad', value: '0' },
                  ],
                },
              ],
            },
          ],
          imports: [],
        };

        const result = executeTransform(transform, { name: 'JOHN', amount: 12345 });

        expect(result.success).toBe(true);
        expect(result.formatted).toBeDefined();
        // Should be: "01JOHN           0000012345          "
        expect(result.formatted?.substring(0, 2)).toBe('01');
        expect(result.formatted?.substring(2, 6)).toBe('JOHN');
        expect(result.formatted?.substring(17, 27)).toBe('0000012345');
      });

      it('right-pads string fields by default', () => {
        const transform: OdinTransform = {
          metadata: { odin: '1.0.0', transform: '1.0.0', direction: 'odin->fixed-width' },
          source: undefined,
          target: { format: 'fixed-width', lineWidth: 20 },
          constants: new Map(),
          accumulators: new Map(),
          tables: new Map(),
          segments: [
            {
              path: 'record',
              isArray: false,
              directives: [],
              mappings: [
                {
                  target: 'name',
                  value: copy('name'),
                  modifiers: [
                    { name: 'pos', value: 0 },
                    { name: 'len', value: 10 },
                  ],
                },
              ],
            },
          ],
          imports: [],
        };

        const result = executeTransform(transform, { name: 'ABC' });

        expect(result.formatted?.substring(0, 10)).toBe('ABC       ');
      });

      it('truncates values exceeding field length', () => {
        const transform: OdinTransform = {
          metadata: { odin: '1.0.0', transform: '1.0.0', direction: 'odin->fixed-width' },
          source: undefined,
          target: { format: 'fixed-width', lineWidth: 20, truncate: true },
          constants: new Map(),
          accumulators: new Map(),
          tables: new Map(),
          segments: [
            {
              path: 'record',
              isArray: false,
              directives: [],
              mappings: [
                {
                  target: 'name',
                  value: copy('name'),
                  modifiers: [
                    { name: 'pos', value: 0 },
                    { name: 'len', value: 5 },
                  ],
                },
              ],
            },
          ],
          imports: [],
        };

        const result = executeTransform(transform, { name: 'ALEXANDER' });

        expect(result.formatted?.substring(0, 5)).toBe('ALEXA');
      });

      it('handles array segments with multiple lines', () => {
        const transform: OdinTransform = {
          metadata: { odin: '1.0.0', transform: '1.0.0', direction: 'odin->fixed-width' },
          source: undefined,
          target: { format: 'fixed-width', lineWidth: 20, lineEnding: '\n' },
          constants: new Map(),
          accumulators: new Map(),
          tables: new Map(),
          segments: [
            {
              path: 'items',
              isArray: true,
              directives: [{ type: 'loop', value: 'items' }],
              mappings: [
                {
                  target: 'code',
                  value: copy('.code'),
                  modifiers: [
                    { name: 'pos', value: 0 },
                    { name: 'len', value: 3 },
                  ],
                },
                {
                  target: 'qty',
                  value: copy('.qty'),
                  modifiers: [
                    { name: 'pos', value: 3 },
                    { name: 'len', value: 5 },
                    { name: 'leftPad', value: '0' },
                  ],
                },
              ],
            },
          ],
          imports: [],
        };

        const result = executeTransform(transform, {
          items: [
            { code: 'A01', qty: 10 },
            { code: 'B02', qty: 200 },
          ],
        });

        const lines = result.formatted?.split('\n') ?? [];
        expect(lines.length).toBe(2);
        expect(lines[0]?.substring(0, 8)).toBe('A0100010');
        expect(lines[1]?.substring(0, 8)).toBe('B0200200');
      });

      it('uses custom pad character', () => {
        const transform: OdinTransform = {
          metadata: { odin: '1.0.0', transform: '1.0.0', direction: 'odin->fixed-width' },
          source: undefined,
          target: { format: 'fixed-width', lineWidth: 15, padChar: '*' },
          constants: new Map(),
          accumulators: new Map(),
          tables: new Map(),
          segments: [
            {
              path: 'record',
              isArray: false,
              directives: [],
              mappings: [
                {
                  target: 'code',
                  value: copy('code'),
                  modifiers: [
                    { name: 'pos', value: 0 },
                    { name: 'len', value: 5 },
                  ],
                },
              ],
            },
          ],
          imports: [],
        };

        const result = executeTransform(transform, { code: 'AB' });

        // Field at pos 0-5 with value "AB" padded to 5 chars with custom pad char '*'
        expect(result.formatted).toBe('AB***');
      });
    });
  });

  describe('Transform with ODIN Documents', () => {
    it('transforms ODIN document to JSON', () => {
      const odinText = `
{policy}
number = "POL-2024-001"
premium = #$747.50
status = "active"
`;

      const transform = createTransform([
        {
          path: 'result',
          isArray: false,
          directives: [],
          mappings: [
            { target: 'policyNumber', value: copy('policy.number'), modifiers: [] },
            { target: 'totalPremium', value: copy('policy.premium'), modifiers: [] },
            { target: 'policyStatus', value: verb('upper', copy('policy.status')), modifiers: [] },
          ],
        },
      ]);

      const doc = Odin.parse(odinText);
      const result = transformDocument(transform, doc);

      expect(result.success).toBe(true);
      // Verify CDM output
      // Note: transformDocument uses doc.toJSON() which converts currency to number
      expectCdmValue(result.output, 'result.policyNumber', 'string', 'POL-2024-001');
      expectCdmValue(result.output, 'result.totalPremium', 'number', 747.5);
      expectCdmValue(result.output, 'result.policyStatus', 'string', 'ACTIVE');
    });
  });

  describe('Error Handling', () => {
    it('reports errors for required missing fields', () => {
      const transform = createTransform(
        [
          {
            path: 'result',
            isArray: false,
            directives: [],
            mappings: [
              {
                target: 'required_field',
                value: copy('missing'),
                modifiers: [{ name: 'required' }],
              },
            ],
          },
        ],
        { onError: 'fail' }
      );

      const result = executeTransform(transform, {});

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.code).toBe('SOURCE_MISSING');
    });

    it('skips errors when onError is skip', () => {
      const transform = createTransform(
        [
          {
            path: 'result',
            isArray: false,
            directives: [],
            mappings: [{ target: 'good_field', value: copy('good'), modifiers: [] }],
          },
        ],
        { onError: 'skip' }
      );

      const result = executeTransform(transform, { good: 'value' });

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('Verb Chaining', () => {
    it('chains multiple transformations', () => {
      const transform = createTransform([
        {
          path: 'result',
          isArray: false,
          directives: [],
          mappings: [
            {
              target: 'formatted',
              value: verb(
                'concat',
                verb('upper', copy('first')),
                literal('string', ' '),
                verb('upper', copy('last'))
              ),
              modifiers: [],
            },
          ],
        },
      ]);

      const source = { first: 'john', last: 'doe' };
      const result = executeTransform(transform, source);

      expect(result.success).toBe(true);
      // Verify CDM output
      expectCdmValue(result.output, 'result.formatted', 'string', 'JOHN DOE');
    });
  });
});

describe('Transform Parsing with Meta Headers', () => {
  describe('Basic Transform Document Parsing', () => {
    it('parses transform with {$} metadata header', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
name = "Test Transform"

{$target}
format = "json"
indent = ##2
`;
      const transform = parseTransform(transformText);

      expect(transform.metadata.odin).toBe('1.0.0');
      expect(transform.metadata.transform).toBe('1.0.0');
      expect(transform.metadata.name).toBe('Test Transform');
      expect(transform.target.format).toBe('json');
      expect(transform.target.indent).toBe(2);
    });

    it('parses transform with {$source} header', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"

{$source}
format = "csv"
schema = "input.schema"

{$target}
format = "json"
`;
      const transform = parseTransform(transformText);

      expect(transform.source?.format).toBe('csv');
      expect(transform.source?.schema).toBe('input.schema');
      expect(transform.target.format).toBe('json');
    });

    it('parses transform with {$const} header', () => {
      const transformText = `
{$}
direction = "odin->json"

{$const}
DEFAULT_STATE = "TX"
MAX_RETRIES = ##3
RATE = #1.5

{$target}
format = "json"
`;
      const transform = parseTransform(transformText);

      expect(transform.constants.get('DEFAULT_STATE')).toEqual({ type: 'string', value: 'TX' });
      expect(transform.constants.get('MAX_RETRIES')).toEqual({ type: 'integer', value: 3 });
      expect(transform.constants.get('RATE')).toEqual({ type: 'number', value: 1.5 });
    });

    it('parses transform with {$table.NAME[columns]} header', () => {
      const transformText = `
{$}
direction = "odin->json"

{$table.STATUS[code, name]}
"A", "Active"
"I", "Inactive"
"P", "Pending"

{$target}
format = "json"
`;
      const transform = parseTransform(transformText);

      expect(transform.tables.has('STATUS')).toBe(true);
      const statusTable = transform.tables.get('STATUS')!;
      expect(statusTable.columns).toEqual(['code', 'name']);
      expect(statusTable.rows.length).toBe(3);
      expect(statusTable.rows[0]).toEqual([
        { type: 'string', value: 'A' },
        { type: 'string', value: 'Active' },
      ]);
    });
  });

  describe('Complete Transform Document', () => {
    it('parses and executes a complete transform', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "odin->json"
name = "Policy Transform"

{$source}
format = "odin"

{$target}
format = "json"
indent = ##2

{$const}
VERSION = "2.0"

{$table.STATUS[name, code]}
"active", "A"
"pending", "P"
"cancelled", "C"

{output}
version = "@$const.VERSION"
`;
      const transform = parseTransform(transformText);

      expect(transform.metadata.name).toBe('Policy Transform');
      expect(transform.source?.format).toBe('odin');
      expect(transform.target.format).toBe('json');
      expect(transform.constants.get('VERSION')).toEqual({ type: 'string', value: '2.0' });
      // New format: check columns and rows
      const statusTable = transform.tables.get('STATUS');
      expect(statusTable?.columns).toEqual(['name', 'code']);
      expect(statusTable?.rows[0]).toEqual([
        { type: 'string', value: 'active' },
        { type: 'string', value: 'A' },
      ]);
    });
  });

  describe('Transform Target Options', () => {
    it('parses all target options', () => {
      const transformText = `
{$}
direction = "odin->json"

{$target}
format = "json"
encoding = "utf-8"
indent = ##2
nulls = "omit"
emptyArrays = "include"
onError = "warn"
onMissing = "default"
`;
      const transform = parseTransform(transformText);

      expect(transform.target.format).toBe('json');
      expect(transform.target.encoding).toBe('utf-8');
      expect(transform.target.indent).toBe(2);
      expect(transform.target.nulls).toBe('omit');
      expect(transform.target.emptyArrays).toBe('include');
      expect(transform.target.onError).toBe('warn');
      expect(transform.target.onMissing).toBe('default');
    });

    it('parses CSV target options', () => {
      const transformText = `
{$}
direction = "odin->csv"

{$target}
format = "csv"
delimiter = ","
quote = "'"
header = ?true
`;
      const transform = parseTransform(transformText);

      expect(transform.target.format).toBe('csv');
      expect(transform.target.delimiter).toBe(',');
      expect(transform.target.quote).toBe("'");
      expect(transform.target.header).toBe(true);
    });

    it('parses fixed-width target options', () => {
      const transformText = `
{$}
direction = "odin->fixed-width"

{$target}
format = "fixed-width"
lineWidth = ##132
padChar = " "
truncate = ?true
lineEnding = "\\r\\n"
`;
      const transform = parseTransform(transformText);

      expect(transform.target.format).toBe('fixed-width');
      expect(transform.target.lineWidth).toBe(132);
      expect(transform.target.padChar).toBe(' ');
      expect(transform.target.truncate).toBe(true);
    });

    it('parses XML target options', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"

{$target}
format = "xml"
declaration = ?true
omitEmpty = ?true
indent = ##4
`;
      const transform = parseTransform(transformText);

      expect(transform.target.format).toBe('xml');
      expect(transform.target.declaration).toBe(true);
      expect(transform.target.omitEmpty).toBe(true);
      expect(transform.target.indent).toBe(4);
    });
  });
});

describe('ODIN Source Type Preservation', () => {
  it('preserves temporal types from ODIN source', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "json"

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
    // Verify CDM preserves date type
    expectCdmValue(result.output, 'Output.EventDate', 'date');
    const dateValue = getCdmValue(result.output, 'Output.EventDate');
    expect(dateValue.type).toBe('date');
    expect((dateValue as { value: Date }).value.toISOString()).toContain('2024-06-15');
  });

  it('handles currency values from ODIN source', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "json"

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
    // Verify CDM preserves currency type
    expectCdmValue(result.output, 'Output.Amount', 'currency', 199.99);
  });

  it('handles decimal values from ODIN source', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "json"

{Output}
Price = "@.price"
`;
    const transform = parseTransform(transformText);
    const source = `{$}
odin = "1.0.0"
{}
price = #45.99
`;
    const result = executeTransform(transform, source);
    expect(result.success).toBe(true);
    // Verify CDM preserves number type
    expectCdmValue(result.output, 'Output.Price', 'number', 45.99);
  });

  it('handles null values from ODIN source', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "json"

{Output}
Value = "@.nullValue"
`;
    const transform = parseTransform(transformText);
    const source = `{$}
odin = "1.0.0"
{}
nullValue = ~
`;
    const result = executeTransform(transform, source);
    expect(result.success).toBe(true);
    // Verify CDM preserves null type
    expectCdmValue(result.output, 'Output.Value', 'null');
  });

  it('handles boolean values from ODIN source', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "json"

{Output}
Active = "@.isActive"
`;
    const transform = parseTransform(transformText);
    const source = `{$}
odin = "1.0.0"
{}
isActive = true
`;
    const result = executeTransform(transform, source);
    expect(result.success).toBe(true);
    // Verify CDM preserves boolean type
    expectCdmValue(result.output, 'Output.Active', 'boolean', true);
  });

  it('handles invalid ODIN source gracefully', () => {
    const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
source.format = "odin"
target.format = "json"

{Output}
Value = "@.test"
`;
    const transform = parseTransform(transformText);
    const source = 'this is not valid odin';
    const result = executeTransform(transform, source);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain('Failed to parse odin input');
  });
});

describe('Transform Value Type Handling', () => {
  it('handles Date objects in source', () => {
    const transform = createTransform([
      {
        path: 'Output',
        isArray: false,
        directives: [],
        mappings: [{ target: 'Timestamp', value: copy('eventTime'), modifiers: [] }],
      },
    ]);
    const source = { eventTime: new Date('2024-06-15T10:30:00Z') };
    const result = executeTransform(transform, source);
    expect(result.success).toBe(true);
    // Verify CDM preserves timestamp type
    const timestampValue = getCdmValue(result.output, 'Output.Timestamp');
    expect(timestampValue.type).toBe('timestamp');
    expect((timestampValue as { value: Date }).value.toISOString()).toContain('2024-06-15');
  });

  it('handles nested objects in source', () => {
    const transform = createTransform([
      {
        path: 'Output',
        isArray: false,
        directives: [],
        mappings: [{ target: 'Details', value: copy('metadata'), modifiers: [] }],
      },
    ]);
    const source = { metadata: { key: 'value', nested: { deep: true } } };
    const result = executeTransform(transform, source);
    expect(result.success).toBe(true);
    // Verify CDM preserves object type
    const objValue = getCdmValue(result.output, 'Output.Details');
    expect(objValue.type).toBe('object');
    expect((objValue as { value: unknown }).value).toEqual({
      key: 'value',
      nested: { deep: true },
    });
  });

  it('handles arrays in source', () => {
    const transform = createTransform([
      {
        path: 'Output',
        isArray: false,
        directives: [],
        mappings: [{ target: 'Items', value: copy('items'), modifiers: [] }],
      },
    ]);
    const source = { items: [1, 2, 3, 4, 5] };
    const result = executeTransform(transform, source);
    expect(result.success).toBe(true);
    // Verify CDM preserves array type
    const arrValue = getCdmValue(result.output, 'Output.Items');
    expect(arrValue.type).toBe('array');
    // Extract primitive values from array items
    const items = (arrValue as { items: unknown[] }).items;
    expect(items.map((item: unknown) => (item as { value: number }).value)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('handles boolean values in source', () => {
    const transform = createTransform([
      {
        path: 'Output',
        isArray: false,
        directives: [],
        mappings: [
          { target: 'Active', value: copy('isActive'), modifiers: [] },
          { target: 'Inactive', value: copy('isInactive'), modifiers: [] },
        ],
      },
    ]);
    const source = { isActive: true, isInactive: false };
    const result = executeTransform(transform, source);
    expect(result.success).toBe(true);
    // Verify CDM preserves boolean types
    expectCdmValue(result.output, 'Output.Active', 'boolean', true);
    expectCdmValue(result.output, 'Output.Inactive', 'boolean', false);
  });

  it('handles undefined values in source', () => {
    const transform = createTransform([
      {
        path: 'Output',
        isArray: false,
        directives: [],
        mappings: [{ target: 'Missing', value: copy('nonexistent'), modifiers: [] }],
      },
    ]);
    const source = { other: 'value' };
    const result = executeTransform(transform, source);
    expect(result.success).toBe(true);
  });

  it('converts unknown types to string', () => {
    const transform = createTransform([
      {
        path: 'Output',
        isArray: false,
        directives: [],
        mappings: [{ target: 'Symbol', value: copy('sym'), modifiers: [] }],
      },
    ]);
    // Test with a Symbol - should be converted to string
    const source = { sym: Symbol.for('test') };
    const result = executeTransform(transform, source);
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type Modifier Tests - Testing :type, :date, :timestamp, :time, :duration, :decimals
// ─────────────────────────────────────────────────────────────────────────────

describe('Type Modifier Tests', () => {
  describe(':type integer modifier', () => {
    it('converts number to integer (truncates decimal)', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->odin"
target.format = "odin"

{Output}
Count = "@.value :type integer"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 42.9 });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('##42');
    });

    it('converts string to integer', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Output}
Count = "@.value :type integer"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: '123' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('##123');
    });
  });

  describe(':type currency modifier', () => {
    it('converts number to currency with default 2 decimals', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Output}
Amount = "@.value :type currency"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 99.5 });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('#$99.50');
    });

    it('respects :decimals modifier for currency', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Output}
PreciseAmount = "@.value :type currency :decimals 4"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 12.3456 });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('#$12.3456');
    });
  });

  describe(':date modifier', () => {
    it('converts ISO string to date', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Output}
EventDate = "@.value :date"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: '2024-06-15T10:30:00Z' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('EventDate = 2024-06-15');
    });
  });

  describe(':timestamp modifier', () => {
    it('converts ISO string to timestamp', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Output}
EventTime = "@.value :timestamp"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: '2024-06-15T10:30:00Z' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('2024-06-15T10:30:00');
    });
  });

  describe(':time modifier', () => {
    it('extracts time from ISO timestamp', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Output}
TimeOnly = "@.value :time"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: '2024-06-15T14:30:45Z' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('T14:30:45');
    });

    it('handles time string with T prefix', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Output}
TimeOnly = "@.value :time"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 'T09:00:00' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('T09:00:00');
    });
  });

  describe(':duration modifier', () => {
    it('preserves ISO duration string', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Output}
Period = "@.value :duration"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 'P1Y6M' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('P1Y6M');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Field Modifiers Tests - Testing :required, :confidential, :deprecated
// ─────────────────────────────────────────────────────────────────────────────

describe('Field Modifiers Tests', () => {
  describe(':required modifier', () => {
    it('outputs ! prefix for required fields', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Customer}
Name = "@.name :required"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { name: 'John' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('!"John"');
    });
  });

  describe(':confidential modifier', () => {
    it('outputs * prefix for confidential fields', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Customer}
SSN = "@.ssn :confidential"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { ssn: '123-45-6789' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('*"123-45-6789"');
    });
  });

  describe(':deprecated modifier', () => {
    it('outputs - prefix for deprecated fields', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Data}
OldField = "@.old :deprecated"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { old: 'legacy value' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('-"legacy value"');
    });
  });

  describe('combined modifiers', () => {
    it('handles required + confidential combination', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Customer}
CriticalSecret = "@.value :required :confidential"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 'top secret' });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('!*"top secret"');
    });

    it('handles type + modifier combination', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Data}
Amount = "@.value :type currency :required"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 100 });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('!#$100.00');
    });

    it('handles type integer + confidential combination', () => {
      const transformText = `
{$}
odin = "1.0.0"
transform = "1.0.0"
target.format = "odin"

{Data}
SecretCount = "@.value :type integer :confidential"
`;
      const transform = parseTransform(transformText);
      const result = executeTransform(transform, { value: 42 });
      expect(result.success).toBe(true);
      expect(result.formatted).toContain('*##42');
    });
  });
});
