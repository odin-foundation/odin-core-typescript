/**
 * Tests for discriminator-based segment routing
 *
 * Note: Directives use _name syntax (e.g., _type, _loop) since ODIN identifiers
 * cannot start with : - the underscore prefix is the standard ODIN-compliant form.
 */

import { describe, it, expect } from 'vitest';
import { parseTransform, executeMultiRecordTransform } from '../../src/transform/index.js';

describe('Discriminator-Based Segment Routing', () => {
  describe('Position-based discriminator (fixed-width)', () => {
    it('routes records by position-based discriminator', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "fixed-width->odin"

{$source}
format = "fixed-width"
discriminator = ":pos 0 :len 2"

{segment.HDR}
_type = "01"
number = "@._line :pos 2 :len 10 :trim"
status = "@._line :pos 12 :len 1"

{segment.VEH[]}
_type = "20"
vin = "@._line :pos 2 :len 17 :trim"
year = "@._line :pos 19 :len 4"

{segment.TRL}
_type = "99"
count = "@._line :pos 2 :len 6 :trim"
`;

      const transform = parseTransform(transformDoc);

      // Verify discriminator was parsed
      expect(transform.source?.discriminator).toEqual({
        type: 'position',
        pos: 0,
        len: 2,
      });

      // Verify segments have :type directives
      const hdrSegment = transform.segments.find((s) => s.path === 'segment.HDR');
      expect(hdrSegment?.directives.find((d) => d.type === 'type')?.value).toBe('01');

      const vehSegment = transform.segments.find((s) => s.path === 'segment.VEH');
      expect(vehSegment?.directives.find((d) => d.type === 'type')?.value).toBe('20');
      expect(vehSegment?.isArray).toBe(true);

      const trlSegment = transform.segments.find((s) => s.path === 'segment.TRL');
      expect(trlSegment?.directives.find((d) => d.type === 'type')?.value).toBe('99');
    });

    it('processes multi-record fixed-width input', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "fixed-width->json"

{$source}
format = "fixed-width"
discriminator = ":pos 0 :len 2"

{segment.HDR}
_type = "01"
policyNumber = "@._line"

{segment.VEH[]}
_type = "20"
vin = "@._line"
`;

      const transform = parseTransform(transformDoc);

      const result = executeMultiRecordTransform(transform, {
        records: ['01POL-12345', '20VIN123456789', '20VIN987654321'],
      });

      expect(result.success).toBe(true);
      // Output keys preserve segment name case (HDR) for single segments
      // Array segments are lowercased (veh from VEH[])
      expect(result.output).toHaveProperty('HDR');
      expect(result.output).toHaveProperty('veh');

      const veh = result.output['veh'] as unknown[];
      expect(veh).toHaveLength(2);
    });
  });

  describe('Field-based discriminator (delimited)', () => {
    it('routes records by field index', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "csv->json"

{$source}
format = "delimited"
discriminator = ":field 0"

{segment.HDR}
_type = "H"
id = "@.1"

{segment.DTL[]}
_type = "D"
item = "@.1"
qty = "@.2"
`;

      const transform = parseTransform(transformDoc);

      expect(transform.source?.discriminator).toEqual({
        type: 'field',
        field: 0,
      });

      const result = executeMultiRecordTransform(transform, {
        records: ['H,ORDER-001', 'D,Widget,10', 'D,Gadget,5'],
        delimiter: ',',
      });

      expect(result.success).toBe(true);
      // Output keys preserve case for single segments, lowercase for arrays
      expect(result.output).toHaveProperty('HDR');
      expect(result.output).toHaveProperty('dtl');

      const dtl = result.output['dtl'] as unknown[];
      expect(dtl).toHaveLength(2);
    });
  });

  describe('Path-based discriminator (JSON)', () => {
    it('routes records by JSON path', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$source}
format = "json"
discriminator = "@recordType"

{segment.order}
_type = "ORDER"
orderId = "@.id"

{segment.item[]}
_type = "ITEM"
itemId = "@.id"
name = "@.name"
`;

      const transform = parseTransform(transformDoc);

      expect(transform.source?.discriminator).toEqual({
        type: 'path',
        path: 'recordType',
      });

      const result = executeMultiRecordTransform(transform, {
        records: [
          '{"recordType":"ORDER","id":"ORD-001"}',
          '{"recordType":"ITEM","id":"ITM-001","name":"Widget"}',
          '{"recordType":"ITEM","id":"ITM-002","name":"Gadget"}',
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('requires discriminator for multi-record transform', () => {
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
      const result = executeMultiRecordTransform(transform, {
        records: ['test line'],
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]?.code).toBe('CONFIG_ERROR');
    });

    it('handles unknown record types based on onError setting', () => {
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
        records: ['01valid record', '99unknown type'],
      });

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]?.code).toBe('UNKNOWN_RECORD_TYPE');
    });
  });

  describe('Multiple types per segment', () => {
    it('supports comma-separated type values', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "fixed-width->json"

{$source}
format = "fixed-width"
discriminator = ":pos 0 :len 2"

{segment.DTL[]}
_type = "20, 21, 22"
value = "@._line"
`;

      const transform = parseTransform(transformDoc);
      const result = executeMultiRecordTransform(transform, {
        records: ['20line one', '21line two', '22line three', '23unknown'],
      });

      const dtl = result.output['dtl'] as unknown[];
      expect(dtl).toHaveLength(3);
    });
  });
});
