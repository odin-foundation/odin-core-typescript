/**
 * Tests for ODIN Streaming Schema Parser.
 *
 * Tests cover:
 * - Line buffering and chunk boundary handling
 * - Type definition parsing
 * - Forward reference handling with lazy resolution
 * - Event emission
 * - Metadata and import parsing
 */

import { describe, it, expect, vi } from 'vitest';
import {
  StreamingSchemaParser,
  parseSchemaStreaming,
  parseSchemaFromChunks,
  type StreamingSchemaEvents as _StreamingSchemaEvents,
  type UnresolvedTypeRef,
} from '../../../src/validator/streaming-schema-parser.js';

describe('StreamingSchemaParser', () => {
  describe('basic parsing', () => {
    it('parses a simple type definition', () => {
      const schema = `
{@person}
name = !
age = ##
`;
      const result = parseSchemaStreaming(schema);

      expect(result.schema.types.has('person')).toBe(true);
      const person = result.schema.types.get('person')!;
      expect(person.fields.has('name')).toBe(true);
      expect(person.fields.has('age')).toBe(true);
      expect(person.fields.get('name')!.required).toBe(true);
      expect(person.fields.get('age')!.type.kind).toBe('integer');
    });

    it('parses metadata section', () => {
      const schema = `
{$}
odin = "1.0.0"
schema = "1.0.0"
id = "test-schema"
`;
      const result = parseSchemaStreaming(schema);

      expect(result.schema.metadata.odin).toBe('1.0.0');
      expect(result.schema.metadata.schema).toBe('1.0.0');
      expect(result.schema.metadata.id).toBe('test-schema');
    });

    it('parses import directives', () => {
      const schema = `
@import "./common/types.schema.odin" as types
@import ../shared/base.schema.odin

{@record}
id = !
`;
      const result = parseSchemaStreaming(schema);

      expect(result.schema.imports).toHaveLength(2);
      expect(result.schema.imports[0]!.path).toBe('./common/types.schema.odin');
      expect(result.schema.imports[0]!.alias).toBe('types');
      expect(result.schema.imports[1]!.path).toBe('../shared/base.schema.odin');
      expect(result.schema.imports[1]!.alias).toBeUndefined();
    });

    it('parses multiple types', () => {
      const schema = `
{@address}
street = !
city = !

{@person}
name = !
address = @address
`;
      const result = parseSchemaStreaming(schema);

      expect(result.schema.types.size).toBe(2);
      expect(result.schema.types.has('address')).toBe(true);
      expect(result.schema.types.has('person')).toBe(true);
    });

    it('skips comments', () => {
      const schema = `
; This is a comment
{@person}
; Another comment
name = !
`;
      const result = parseSchemaStreaming(schema);

      expect(result.schema.types.has('person')).toBe(true);
      expect(result.schema.types.get('person')!.fields.size).toBe(1);
    });

    it('handles empty lines', () => {
      const schema = `

{@person}

name = !

age = ##

`;
      const result = parseSchemaStreaming(schema);

      const person = result.schema.types.get('person')!;
      expect(person.fields.size).toBe(2);
    });
  });

  describe('line buffering', () => {
    it('handles content split across chunk boundaries', () => {
      const parser = new StreamingSchemaParser();

      // Split a line across two chunks
      parser.write('{@per');
      parser.write('son}\nname = !\n');

      const result = parser.end();
      expect(result.schema.types.has('person')).toBe(true);
    });

    it('handles multiple chunks with partial lines', () => {
      const parser = new StreamingSchemaParser();

      parser.write('{@addr');
      parser.write('ess}\nstr');
      parser.write('eet = !\ncity');
      parser.write(' = !\n');

      const result = parser.end();
      const address = result.schema.types.get('address')!;
      expect(address.fields.has('street')).toBe(true);
      expect(address.fields.has('city')).toBe(true);
    });

    it('handles CRLF line endings', () => {
      const parser = new StreamingSchemaParser();
      parser.write('{@person}\r\nname = !\r\n');

      const result = parser.end();
      expect(result.schema.types.get('person')!.fields.has('name')).toBe(true);
    });

    it('handles mixed line endings', () => {
      const parser = new StreamingSchemaParser();
      parser.write('{@person}\nname = !\r\nage = ##\n');

      const result = parser.end();
      const person = result.schema.types.get('person')!;
      expect(person.fields.size).toBe(2);
    });

    it('handles content with no trailing newline', () => {
      const parser = new StreamingSchemaParser();
      parser.write('{@person}\nname = !');

      const result = parser.end();
      expect(result.schema.types.get('person')!.fields.has('name')).toBe(true);
    });

    it('processes lines as they become complete', () => {
      const parser = new StreamingSchemaParser();
      const progress1 = parser.getProgress();
      expect(progress1.line).toBe(1);

      parser.write('{@person}\n');
      const progress2 = parser.getProgress();
      expect(progress2.typesFound).toBe(1);

      parser.write('name = !\nage = ##\n');
      const progress3 = parser.getProgress();
      expect(progress3.line).toBe(4);
    });

    it('handles Uint8Array chunks', () => {
      const parser = new StreamingSchemaParser();
      const encoder = new TextEncoder();

      parser.write(encoder.encode('{@person}\n'));
      parser.write(encoder.encode('name = !\n'));

      const result = parser.end();
      expect(result.schema.types.has('person')).toBe(true);
    });
  });

  describe('forward references and lazy resolution', () => {
    it('collects forward references during parse', () => {
      const refs: UnresolvedTypeRef[] = [];
      const parser = new StreamingSchemaParser({
        onTypeRef: (ref) => refs.push(ref),
      });

      parser.write(`
{@policy}
customer = @customer
coverage = @coverage

{@customer}
name = !

{@coverage}
limit = #$
`);

      parser.end();

      // References were collected during parse
      expect(refs).toHaveLength(2);
      expect(refs[0]!.typeName).toBe('customer');
      expect(refs[1]!.typeName).toBe('coverage');
    });

    it('resolves forward references after parsing', () => {
      const schema = `
{@policy}
customer = @customer
coverage = @coverage

{@customer}
name = !

{@coverage}
limit = #$
`;
      const result = parseSchemaStreaming(schema);

      // All references should be resolved
      expect(result.unresolvedRefs).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('reports unresolved references', () => {
      const schema = `
{@policy}
customer = @unknown_type
`;
      const result = parseSchemaStreaming(schema);

      expect(result.unresolvedRefs).toHaveLength(1);
      expect(result.unresolvedRefs[0]!.typeName).toBe('unknown_type');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('handles composite type references', () => {
      const schema = `
{@timestamps}
created = !timestamp

{@auditable}
created_by = !

{@record}
= @timestamps&auditable
id = !
`;
      const result = parseSchemaStreaming(schema);

      // The composite reference should be resolvable
      // since both component types exist
      const recordType = result.schema.types.get('record');
      expect(recordType).toBeDefined();
    });

    it('handles namespaced type references', () => {
      const schema = `
{@common.address}
street = !

{@person}
address = @common.address
`;
      const result = parseSchemaStreaming(schema);

      expect(result.schema.types.has('common.address')).toBe(true);
      expect(result.unresolvedRefs).toHaveLength(0);
    });
  });

  describe('field type parsing', () => {
    it('parses string type (default)', () => {
      const result = parseSchemaStreaming('{@t}\nfield = \n');
      expect(result.schema.types.get('t')!.fields.get('field')!.type.kind).toBe('string');
    });

    it('parses boolean type', () => {
      const result = parseSchemaStreaming('{@t}\nfield = ?\n');
      expect(result.schema.types.get('t')!.fields.get('field')!.type.kind).toBe('boolean');
    });

    it('parses number type', () => {
      const result = parseSchemaStreaming('{@t}\nfield = #\n');
      expect(result.schema.types.get('t')!.fields.get('field')!.type.kind).toBe('number');
    });

    it('parses integer type', () => {
      const result = parseSchemaStreaming('{@t}\nfield = ##\n');
      expect(result.schema.types.get('t')!.fields.get('field')!.type.kind).toBe('integer');
    });

    it('parses currency type', () => {
      const result = parseSchemaStreaming('{@t}\nfield = #$\n');
      expect(result.schema.types.get('t')!.fields.get('field')!.type.kind).toBe('currency');
    });

    it('parses timestamp type', () => {
      const result = parseSchemaStreaming('{@t}\nfield = timestamp\n');
      expect(result.schema.types.get('t')!.fields.get('field')!.type.kind).toBe('timestamp');
    });

    it('parses date type', () => {
      const result = parseSchemaStreaming('{@t}\nfield = date\n');
      expect(result.schema.types.get('t')!.fields.get('field')!.type.kind).toBe('date');
    });

    it('parses array type (returns element type)', () => {
      // Arrays in SchemaFieldType are represented by their element type
      // Full array semantics handled by SchemaArray structure
      const result = parseSchemaStreaming('{@t}\nfield = ##[]\n');
      const fieldType = result.schema.types.get('t')!.fields.get('field')!.type;
      expect(fieldType.kind).toBe('integer'); // Element type
    });

    it('parses type reference', () => {
      const result = parseSchemaStreaming('{@t}\nfield = @other\n');
      const fieldType = result.schema.types.get('t')!.fields.get('field')!.type;
      expect(fieldType.kind).toBe('typeRef');
      if (fieldType.kind === 'typeRef') {
        expect(fieldType.name).toBe('other');
      }
    });
  });

  describe('field modifiers', () => {
    it('parses required modifier', () => {
      const result = parseSchemaStreaming('{@t}\nfield = !\n');
      expect(result.schema.types.get('t')!.fields.get('field')!.required).toBe(true);
    });

    it('parses deprecated modifier', () => {
      const result = parseSchemaStreaming('{@t}\nfield = -\n');
      expect(result.schema.types.get('t')!.fields.get('field')!.deprecated).toBe(true);
    });

    it('parses redacted modifier', () => {
      const result = parseSchemaStreaming('{@t}\nfield = *\n');
      expect(result.schema.types.get('t')!.fields.get('field')!.redacted).toBe(true);
    });

    it('parses nullable modifier', () => {
      const result = parseSchemaStreaming('{@t}\nfield = ~\n');
      expect(result.schema.types.get('t')!.fields.get('field')!.nullable).toBe(true);
    });

    it('parses combined modifiers', () => {
      const result = parseSchemaStreaming('{@t}\nfield = !*##\n');
      const field = result.schema.types.get('t')!.fields.get('field')!;
      expect(field.required).toBe(true);
      expect(field.redacted).toBe(true);
      expect(field.type.kind).toBe('integer');
    });
  });

  describe('nested object paths', () => {
    it('parses nested object header', () => {
      const schema = `
{@person}
name = !

{.address}
street = !
city = !
`;
      const result = parseSchemaStreaming(schema);
      const person = result.schema.types.get('person')!;

      expect(person.fields.has('address.street')).toBe(true);
      expect(person.fields.has('address.city')).toBe(true);
    });
  });

  describe('event callbacks', () => {
    it('emits onTypeStart event', () => {
      const onTypeStart = vi.fn();
      const parser = new StreamingSchemaParser({ onTypeStart });

      parser.write('{@person}\nname = !\n');
      parser.end();

      expect(onTypeStart).toHaveBeenCalledWith('person', expect.any(Number));
    });

    it('emits onTypeEnd event', () => {
      const onTypeEnd = vi.fn();
      const parser = new StreamingSchemaParser({ onTypeEnd });

      parser.write('{@person}\nname = !\n{@other}\nid = !\n');
      parser.end();

      expect(onTypeEnd).toHaveBeenCalledWith('person');
      expect(onTypeEnd).toHaveBeenCalledWith('other');
    });

    it('emits onField event', () => {
      const onField = vi.fn();
      const parser = new StreamingSchemaParser({ onField });

      parser.write('{@person}\nname = !\nage = ##\n');
      parser.end();

      expect(onField).toHaveBeenCalledTimes(2);
      expect(onField).toHaveBeenCalledWith('person', expect.objectContaining({ path: 'name' }));
      expect(onField).toHaveBeenCalledWith('person', expect.objectContaining({ path: 'age' }));
    });

    it('emits onMetadata event', () => {
      const onMetadata = vi.fn();
      const parser = new StreamingSchemaParser({ onMetadata });

      parser.write('{$}\nodin = "1.0.0"\n');
      parser.end();

      expect(onMetadata).toHaveBeenCalled();
    });

    it('emits onImport event', () => {
      const onImport = vi.fn();
      const parser = new StreamingSchemaParser({ onImport });

      parser.write('@import ./types.schema.odin as types\n');
      parser.end();

      expect(onImport).toHaveBeenCalledWith(
        expect.objectContaining({
          path: './types.schema.odin',
          alias: 'types',
        })
      );
    });

    it('emits onTypeRef for forward references', () => {
      const onTypeRef = vi.fn();
      const parser = new StreamingSchemaParser({ onTypeRef });

      parser.write('{@policy}\ncustomer = @customer\n');
      parser.end();

      expect(onTypeRef).toHaveBeenCalledWith(
        expect.objectContaining({
          typeName: 'customer',
        })
      );
    });
  });

  describe('parseSchemaFromChunks', () => {
    it('parses from async iterable', async () => {
      async function* generateChunks() {
        yield '{@person}\n';
        yield 'name = !\n';
        yield 'age = ##\n';
      }

      const result = await parseSchemaFromChunks(generateChunks());

      expect(result.schema.types.has('person')).toBe(true);
      const person = result.schema.types.get('person')!;
      expect(person.fields.size).toBe(2);
    });

    it('handles events during async parsing', async () => {
      const onTypeStart = vi.fn();

      async function* generateChunks() {
        yield '{@person}\nname = !\n';
      }

      await parseSchemaFromChunks(generateChunks(), { onTypeStart });

      expect(onTypeStart).toHaveBeenCalledWith('person', expect.any(Number));
    });
  });

  describe('parser reset', () => {
    it('can be reset and reused', () => {
      const parser = new StreamingSchemaParser();

      parser.write('{@first}\nid = !\n');
      const result1 = parser.end();
      expect(result1.schema.types.has('first')).toBe(true);

      parser.reset();

      parser.write('{@second}\nname = !\n');
      const result2 = parser.end();
      expect(result2.schema.types.has('second')).toBe(true);
      expect(result2.schema.types.has('first')).toBe(false);
    });
  });

  describe('progress tracking', () => {
    it('tracks line number', () => {
      const parser = new StreamingSchemaParser();

      parser.write('{@person}\n');
      expect(parser.getProgress().line).toBe(2);

      parser.write('name = !\nage = ##\n');
      expect(parser.getProgress().line).toBe(4);
    });

    it('tracks types found', () => {
      const parser = new StreamingSchemaParser();

      parser.write('{@first}\nid = !\n');
      expect(parser.getProgress().typesFound).toBe(1);

      parser.write('{@second}\nname = !\n');
      expect(parser.getProgress().typesFound).toBe(2);
    });

    it('tracks unresolved count', () => {
      const parser = new StreamingSchemaParser();

      parser.write('{@policy}\ncustomer = @customer\ncoverage = @coverage\n');
      expect(parser.getProgress().unresolvedCount).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = parseSchemaStreaming('');
      expect(result.schema.types.size).toBe(0);
      expect(result.unresolvedRefs).toHaveLength(0);
    });

    it('handles whitespace-only input', () => {
      const result = parseSchemaStreaming('   \n\n   \n');
      expect(result.schema.types.size).toBe(0);
    });

    it('handles comment-only input', () => {
      const result = parseSchemaStreaming('; Just a comment\n; Another comment\n');
      expect(result.schema.types.size).toBe(0);
    });

    it('handles type with no fields', () => {
      const parser = new StreamingSchemaParser();
      parser.write('{@empty}\n{@another}\nid = !\n');
      const result = parser.end();

      // Empty type should not be added (no fields)
      expect(result.schema.types.has('another')).toBe(true);
    });

    it('handles single character chunks', () => {
      const parser = new StreamingSchemaParser();
      const text = '{@t}\na = !\n';

      for (const char of text) {
        parser.write(char);
      }

      const result = parser.end();
      expect(result.schema.types.has('t')).toBe(true);
    });
  });
});
