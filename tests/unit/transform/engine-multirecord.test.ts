/**
 * Tests for engine-multirecord module.
 *
 * Covers multi-record processing with discriminator-based routing.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSegmentRoutingMap,
  extractDiscriminatorValue,
  parseRecord,
  mergeSegmentOutput,
} from '../../../src/transform/engine-multirecord.js';
import type { TransformSegment, Discriminator } from '../../../src/types/transform.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createSegment(path: string, typeValue?: string): TransformSegment {
  const directives = typeValue ? [{ type: 'type' as const, value: typeValue }] : [];
  return {
    path,
    directives,
    mappings: [],
    children: [],
  };
}

function createSetNestedValue() {
  return (obj: Record<string, unknown>, path: string, value: unknown): void => {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSegmentRoutingMap Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSegmentRoutingMap', () => {
  describe('single type values', () => {
    it('builds map from segments with single type', () => {
      const segments = [
        createSegment('policy', '01'),
        createSegment('vehicle', '02'),
        createSegment('driver', '03'),
      ];

      const map = buildSegmentRoutingMap(segments);

      expect(map.size).toBe(3);
      expect(map.get('01')).toBe(segments[0]);
      expect(map.get('02')).toBe(segments[1]);
      expect(map.get('03')).toBe(segments[2]);
    });

    it('handles segments without type directive', () => {
      const segments = [
        createSegment('policy', '01'),
        createSegment('vehicle'), // No type
        createSegment('driver', '03'),
      ];

      const map = buildSegmentRoutingMap(segments);

      expect(map.size).toBe(2);
      expect(map.get('01')).toBe(segments[0]);
      expect(map.get('03')).toBe(segments[2]);
    });

    it('returns empty map for no segments', () => {
      const map = buildSegmentRoutingMap([]);
      expect(map.size).toBe(0);
    });
  });

  describe('multiple type values', () => {
    it('maps multiple types to same segment', () => {
      const segment = createSegment('address', '04,05,06');
      const segments = [segment];

      const map = buildSegmentRoutingMap(segments);

      expect(map.size).toBe(3);
      expect(map.get('04')).toBe(segment);
      expect(map.get('05')).toBe(segment);
      expect(map.get('06')).toBe(segment);
    });

    it('trims whitespace around type values', () => {
      const segment = createSegment('address', '04 , 05 , 06');
      const segments = [segment];

      const map = buildSegmentRoutingMap(segments);

      expect(map.get('04')).toBe(segment);
      expect(map.get('05')).toBe(segment);
      expect(map.get('06')).toBe(segment);
    });

    it('handles mixed single and multi-type segments', () => {
      const segments = [
        createSegment('policy', '01'),
        createSegment('address', '02,03'),
        createSegment('vehicle', '04'),
      ];

      const map = buildSegmentRoutingMap(segments);

      expect(map.size).toBe(4);
      expect(map.get('01')).toBe(segments[0]);
      expect(map.get('02')).toBe(segments[1]);
      expect(map.get('03')).toBe(segments[1]);
      expect(map.get('04')).toBe(segments[2]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractDiscriminatorValue Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('extractDiscriminatorValue', () => {
  describe('position discriminator', () => {
    it('extracts from start position', () => {
      const discriminator: Discriminator = { type: 'position', pos: 0, len: 2 };
      const result = extractDiscriminatorValue('01POL123456', discriminator);
      expect(result).toBe('01');
    });

    it('extracts from middle position', () => {
      const discriminator: Discriminator = { type: 'position', pos: 2, len: 3 };
      const result = extractDiscriminatorValue('01POL123456', discriminator);
      expect(result).toBe('POL');
    });

    it('uses defaults when pos/len not provided', () => {
      const discriminator: Discriminator = { type: 'position' };
      const result = extractDiscriminatorValue('ABCDEFG', discriminator);
      expect(result).toBe('A'); // pos: 0, len: 1
    });

    it('handles position beyond record length', () => {
      const discriminator: Discriminator = { type: 'position', pos: 100, len: 2 };
      const result = extractDiscriminatorValue('SHORT', discriminator);
      expect(result).toBe('');
    });

    it('handles partial extraction at end', () => {
      const discriminator: Discriminator = { type: 'position', pos: 3, len: 10 };
      const result = extractDiscriminatorValue('ABCDE', discriminator);
      expect(result).toBe('DE');
    });
  });

  describe('field discriminator', () => {
    it('extracts first field', () => {
      const discriminator: Discriminator = { type: 'field', field: 0 };
      const result = extractDiscriminatorValue('POL123,John,Doe', discriminator, ',');
      expect(result).toBe('POL123');
    });

    it('extracts middle field', () => {
      const discriminator: Discriminator = { type: 'field', field: 1 };
      const result = extractDiscriminatorValue('POL123,John,Doe', discriminator, ',');
      expect(result).toBe('John');
    });

    it('extracts last field', () => {
      const discriminator: Discriminator = { type: 'field', field: 2 };
      const result = extractDiscriminatorValue('POL123,John,Doe', discriminator, ',');
      expect(result).toBe('Doe');
    });

    it('trims field values', () => {
      const discriminator: Discriminator = { type: 'field', field: 1 };
      const result = extractDiscriminatorValue('POL123,  John  ,Doe', discriminator, ',');
      expect(result).toBe('John');
    });

    it('uses comma as default delimiter', () => {
      const discriminator: Discriminator = { type: 'field', field: 1 };
      const result = extractDiscriminatorValue('A,B,C', discriminator);
      expect(result).toBe('B');
    });

    it('uses field 0 as default', () => {
      const discriminator: Discriminator = { type: 'field' };
      const result = extractDiscriminatorValue('FIRST,SECOND', discriminator, ',');
      expect(result).toBe('FIRST');
    });

    it('returns empty for field index out of range', () => {
      const discriminator: Discriminator = { type: 'field', field: 10 };
      const result = extractDiscriminatorValue('A,B,C', discriminator, ',');
      expect(result).toBe('');
    });

    it('handles pipe delimiter', () => {
      const discriminator: Discriminator = { type: 'field', field: 1 };
      const result = extractDiscriminatorValue('A|B|C', discriminator, '|');
      expect(result).toBe('B');
    });

    it('handles tab delimiter', () => {
      const discriminator: Discriminator = { type: 'field', field: 1 };
      const result = extractDiscriminatorValue('A\tB\tC', discriminator, '\t');
      expect(result).toBe('B');
    });
  });

  describe('path discriminator', () => {
    it('extracts from JSON path', () => {
      const discriminator: Discriminator = { type: 'path', path: 'type' };
      const record = '{"type":"policy","id":"123"}';
      const result = extractDiscriminatorValue(record, discriminator);
      expect(result).toBe('policy');
    });

    it('extracts from nested path', () => {
      const discriminator: Discriminator = { type: 'path', path: 'meta.type' };
      const record = '{"meta":{"type":"vehicle"},"id":"456"}';
      const result = extractDiscriminatorValue(record, discriminator);
      expect(result).toBe('vehicle');
    });

    it('converts number to string', () => {
      const discriminator: Discriminator = { type: 'path', path: 'code' };
      const record = '{"code":42}';
      const result = extractDiscriminatorValue(record, discriminator);
      expect(result).toBe('42');
    });

    it('returns empty for non-existent path', () => {
      const discriminator: Discriminator = { type: 'path', path: 'missing' };
      const record = '{"type":"policy"}';
      const result = extractDiscriminatorValue(record, discriminator);
      expect(result).toBe('');
    });

    it('returns empty for malformed JSON', () => {
      const discriminator: Discriminator = { type: 'path', path: 'type' };
      const record = 'not valid json';
      const result = extractDiscriminatorValue(record, discriminator);
      expect(result).toBe('');
    });

    it('uses empty path as default - returns stringified object', () => {
      const discriminator: Discriminator = { type: 'path' };
      const record = '{"type":"policy"}';
      const result = extractDiscriminatorValue(record, discriminator);
      // Empty path returns the whole object, stringified to "[object Object]"
      expect(result).toBe('[object Object]');
    });
  });

  describe('unknown discriminator type', () => {
    it('returns empty for unknown type', () => {
      const discriminator = { type: 'unknown' } as unknown as Discriminator;
      const result = extractDiscriminatorValue('some record', discriminator);
      expect(result).toBe('');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseRecord Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseRecord', () => {
  describe('fixed-width format', () => {
    it('returns _raw and _line for fixed-width', () => {
      const record = '01POL123456789';
      const result = parseRecord(record, 'fixed-width');

      expect(result._raw).toBe(record);
      expect(result._line).toBe(record);
    });

    it('returns _raw and _line for unknown format (default)', () => {
      const record = 'ABCDEFG';
      const result = parseRecord(record, 'unknown-format');

      expect(result._raw).toBe(record);
      expect(result._line).toBe(record);
    });
  });

  describe('delimited format', () => {
    it('parses comma-delimited record', () => {
      const record = 'POL123,John,Doe';
      const result = parseRecord(record, 'delimited', ',');

      expect(result._raw).toBe(record);
      expect(result['0']).toBe('POL123');
      expect(result['1']).toBe('John');
      expect(result['2']).toBe('Doe');
    });

    it('uses comma as default delimiter', () => {
      const record = 'A,B,C';
      const result = parseRecord(record, 'delimited');

      expect(result['0']).toBe('A');
      expect(result['1']).toBe('B');
      expect(result['2']).toBe('C');
    });

    it('handles pipe delimiter', () => {
      const record = 'A|B|C';
      const result = parseRecord(record, 'delimited', '|');

      expect(result['0']).toBe('A');
      expect(result['1']).toBe('B');
      expect(result['2']).toBe('C');
    });

    it('handles tab delimiter', () => {
      const record = 'A\tB\tC';
      const result = parseRecord(record, 'delimited', '\t');

      expect(result['0']).toBe('A');
      expect(result['1']).toBe('B');
      expect(result['2']).toBe('C');
    });

    it('handles empty fields', () => {
      const record = 'A,,C';
      const result = parseRecord(record, 'delimited', ',');

      expect(result['0']).toBe('A');
      expect(result['1']).toBe('');
      expect(result['2']).toBe('C');
    });
  });

  describe('csv format', () => {
    it('parses csv same as delimited', () => {
      const record = 'First,Second,Third';
      const result = parseRecord(record, 'csv', ',');

      expect(result._raw).toBe(record);
      expect(result['0']).toBe('First');
      expect(result['1']).toBe('Second');
      expect(result['2']).toBe('Third');
    });
  });

  describe('json format', () => {
    it('parses valid JSON', () => {
      const record = '{"name":"John","age":30}';
      const result = parseRecord(record, 'json');

      expect(result._raw).toBe(record);
      expect(result.name).toBe('John');
      expect(result.age).toBe(30);
    });

    it('parses nested JSON', () => {
      const record = '{"person":{"name":"John"},"active":true}';
      const result = parseRecord(record, 'json');

      expect(result.person).toEqual({ name: 'John' });
      expect(result.active).toBe(true);
    });

    it('returns only _raw for malformed JSON', () => {
      const record = 'not valid json';
      const result = parseRecord(record, 'json');

      expect(result._raw).toBe(record);
      expect(Object.keys(result)).toEqual(['_raw']);
    });

    it('handles JSON with arrays', () => {
      const record = '{"items":[1,2,3]}';
      const result = parseRecord(record, 'json');

      expect(result.items).toEqual([1, 2, 3]);
    });
  });

  describe('odin format', () => {
    it('parses valid ODIN', () => {
      const record = '{$}\nodin = "1.0.0"\n\n{Document}\nname = "John"\nage = ##30';
      const result = parseRecord(record, 'odin');

      expect(result._raw).toBe(record);
      // ODIN document parsed to JSON
      expect(result.Document).toBeDefined();
    });

    it('returns only _raw for malformed ODIN', () => {
      const record = 'not valid odin { [ }';
      const result = parseRecord(record, 'odin');

      expect(result._raw).toBe(record);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeSegmentOutput Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeSegmentOutput', () => {
  const setNestedValue = createSetNestedValue();

  describe('root level merge', () => {
    it('merges at root for empty path', () => {
      const output: Record<string, unknown> = { existing: 'value' };
      const segmentOutput = { new: 'data' };

      mergeSegmentOutput(output, '', segmentOutput, setNestedValue);

      expect(output.existing).toBe('value');
      expect(output.new).toBe('data');
    });

    it('merges at root for dot path', () => {
      const output: Record<string, unknown> = { existing: 'value' };
      const segmentOutput = { new: 'data' };

      mergeSegmentOutput(output, '.', segmentOutput, setNestedValue);

      expect(output.existing).toBe('value');
      expect(output.new).toBe('data');
    });
  });

  describe('nested path assignment', () => {
    it('creates nested path and assigns', () => {
      const output: Record<string, unknown> = {};
      const segmentOutput = { number: 'POL123' };

      mergeSegmentOutput(output, 'policy', segmentOutput, setNestedValue);

      expect(output.policy).toEqual({ number: 'POL123' });
    });

    it('merges into existing object at path', () => {
      const output: Record<string, unknown> = {
        policy: { type: 'auto' },
      };
      const segmentOutput = { number: 'POL123' };

      mergeSegmentOutput(output, 'policy', segmentOutput, setNestedValue);

      expect(output.policy).toEqual({ type: 'auto', number: 'POL123' });
    });

    it('creates deeply nested path', () => {
      const output: Record<string, unknown> = {};
      const segmentOutput = { name: 'John' };

      mergeSegmentOutput(output, 'customer.info', segmentOutput, setNestedValue);

      expect((output.customer as Record<string, unknown>).info).toEqual({ name: 'John' });
    });

    it('replaces non-object at path', () => {
      const output: Record<string, unknown> = {
        policy: 'was a string',
      };
      const segmentOutput = { number: 'POL123' };

      mergeSegmentOutput(output, 'policy', segmentOutput, setNestedValue);

      expect(output.policy).toEqual({ number: 'POL123' });
    });

    it('replaces array at path', () => {
      const output: Record<string, unknown> = {
        items: [1, 2, 3],
      };
      const segmentOutput = { name: 'replacement' };

      mergeSegmentOutput(output, 'items', segmentOutput, setNestedValue);

      expect(output.items).toEqual({ name: 'replacement' });
    });

    it('replaces null at path', () => {
      const output: Record<string, unknown> = {
        data: null,
      };
      const segmentOutput = { value: 42 };

      mergeSegmentOutput(output, 'data', segmentOutput, setNestedValue);

      expect(output.data).toEqual({ value: 42 });
    });
  });
});
