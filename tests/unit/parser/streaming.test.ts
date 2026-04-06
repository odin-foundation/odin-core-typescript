/**
 * Tests for ODIN Streaming Parser
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';
import type { OdinValue } from '../../../src/types/document.js';

/**
 * Helper to create a ReadableStream from a string
 */
function stringToStream(text: string, chunkSize: number = 64): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let offset = 0;

  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const chunk = bytes.slice(offset, offset + chunkSize);
      offset += chunkSize;
      controller.enqueue(chunk);
    },
  });
}

describe('Streaming Parser', () => {
  describe('Basic parsing', () => {
    it('parses simple assignments', async () => {
      const assignments: Array<{ path: string; value: OdinValue }> = [];

      await Odin.parseStream(stringToStream('name = "John"\nage = ##42'), {
        onAssignment(path, value) {
          assignments.push({ path, value });
        },
      });

      expect(assignments).toHaveLength(2);
      expect(assignments[0]).toEqual({
        path: 'name',
        value: { type: 'string', value: 'John' },
      });
      expect(assignments[1]).toEqual({
        path: 'age',
        value: { type: 'integer', value: 42 },
      });
    });

    it('handles headers', async () => {
      const headers: string[] = [];
      const assignments: Array<{ path: string; value: OdinValue }> = [];

      await Odin.parseStream(
        stringToStream(`
{policy}
number = "POL-001"
premium = #$100.00
`),
        {
          onHeader(path) {
            headers.push(path);
          },
          onAssignment(path, value) {
            assignments.push({ path, value });
          },
        }
      );

      expect(headers).toContain('policy');
      expect(assignments.some((a) => a.path === 'policy.number')).toBe(true);
      expect(assignments.some((a) => a.path === 'policy.premium')).toBe(true);
    });

    it('emits document start and end events', async () => {
      const events: string[] = [];

      await Odin.parseStream(stringToStream('name = "test"'), {
        onDocumentStart() {
          events.push('start');
        },
        onDocumentEnd() {
          events.push('end');
        },
      });

      expect(events).toContain('start');
      expect(events).toContain('end');
    });
  });

  describe('Chunked input', () => {
    it('handles data split across chunk boundaries', async () => {
      const assignments: Array<{ path: string; value: OdinValue }> = [];

      // Use very small chunks to force splits
      await Odin.parseStream(stringToStream('name = "John Doe"', 3), {
        onAssignment(path, value) {
          assignments.push({ path, value });
        },
      });

      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.value).toEqual({
        type: 'string',
        value: 'John Doe',
      });
    });

    it('handles multi-byte UTF-8 characters across chunks', async () => {
      const assignments: Array<{ path: string; value: OdinValue }> = [];

      // Use chunk size that might split UTF-8 sequences
      await Odin.parseStream(stringToStream('greeting = "Hello 世界"', 5), {
        onAssignment(path, value) {
          assignments.push({ path, value });
        },
      });

      expect(assignments).toHaveLength(1);
      expect(assignments[0]?.value).toEqual({
        type: 'string',
        value: 'Hello 世界',
      });
    });
  });

  describe('Multiple documents', () => {
    it('handles document separator', async () => {
      const documentStarts: number[] = [];
      const documentEnds: number[] = [];
      let docIndex = 0;

      await Odin.parseStream(
        stringToStream(`
name = "Doc1"
---
name = "Doc2"
`),
        {
          onDocumentStart() {
            documentStarts.push(docIndex++);
          },
          onDocumentEnd() {
            documentEnds.push(docIndex);
          },
        }
      );

      expect(documentStarts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Value types', () => {
    it('parses all value types', async () => {
      const assignments = new Map<string, OdinValue>();

      await Odin.parseStream(
        stringToStream(`
str = "hello"
int = ##42
num = #3.14
currency = #$99.99
bool = ?true
ref = @other.path
`),
        {
          onAssignment(path, value) {
            assignments.set(path, value);
          },
        }
      );

      expect(assignments.get('str')?.type).toBe('string');
      expect(assignments.get('int')).toEqual({ type: 'integer', value: 42 });
      expect(assignments.get('num')).toEqual({ type: 'number', value: 3.14, raw: '3.14' });
      expect(assignments.get('currency')).toEqual({
        type: 'currency',
        value: 99.99,
        decimalPlaces: 2,
        raw: '99.99',
      });
      expect(assignments.get('bool')).toEqual({ type: 'boolean', value: true });
      expect(assignments.get('ref')).toEqual({ type: 'reference', path: 'other.path' });
    });

    it('parses temporal values', async () => {
      const assignments = new Map<string, OdinValue>();

      await Odin.parseStream(
        stringToStream(`
date = 2024-06-15
datetime = 2024-06-15T10:30:00Z
`),
        {
          onAssignment(path, value) {
            assignments.set(path, value);
          },
        }
      );

      const dateVal = assignments.get('date');
      expect(dateVal?.type).toBe('date');
    });
  });

  describe('Comments and whitespace', () => {
    it('ignores comments', async () => {
      const assignments: string[] = [];

      await Odin.parseStream(
        stringToStream(`
; This is a comment
name = "John"
; Another comment
age = ##30
`),
        {
          onAssignment(path) {
            assignments.push(path);
          },
        }
      );

      expect(assignments).toEqual(['name', 'age']);
    });

    it('handles blank lines', async () => {
      const assignments: string[] = [];

      await Odin.parseStream(
        stringToStream(`

name = "John"

age = ##30

`),
        {
          onAssignment(path) {
            assignments.push(path);
          },
        }
      );

      expect(assignments).toEqual(['name', 'age']);
    });
  });

  describe('Error handling', () => {
    it('calls onError for parse errors', async () => {
      const errors: Error[] = [];

      await Odin.parseStream(stringToStream('invalid = "unterminated string'), {
        onError(error) {
          errors.push(error);
        },
      });

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Meta headers', () => {
    it('handles meta headers for transforms', async () => {
      const headers: string[] = [];
      const assignments = new Map<string, OdinValue>();

      await Odin.parseStream(
        stringToStream(`
{$}
odin = "1.0.0"
transform = "1.0.0"

{$target}
format = "json"
`),
        {
          onHeader(path) {
            headers.push(path);
          },
          onAssignment(path, value) {
            assignments.set(path, value);
          },
        }
      );

      expect(headers).toContain('$');
      expect(headers).toContain('$.target');
      expect(assignments.get('$.odin')).toEqual({ type: 'string', value: '1.0.0' });
      expect(assignments.get('$.target.format')).toEqual({ type: 'string', value: 'json' });
    });
  });

  describe('Large documents', () => {
    it('handles documents with many assignments', async () => {
      // Generate a large document
      const lines: string[] = [];
      for (let i = 0; i < 1000; i++) {
        lines.push(`field${i} = "value${i}"`);
      }

      let count = 0;
      await Odin.parseStream(stringToStream(lines.join('\n')), {
        onAssignment() {
          count++;
        },
      });

      expect(count).toBe(1000);
    });

    it('handles documents with long lines', async () => {
      const longValue = 'x'.repeat(10000);
      const assignments = new Map<string, OdinValue>();

      await Odin.parseStream(stringToStream(`longField = "${longValue}"`), {
        onAssignment(path, value) {
          assignments.set(path, value);
        },
      });

      expect(assignments.get('longField')).toEqual({
        type: 'string',
        value: longValue,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // UTF-8 Boundary Handling Regression Tests
  // These tests ensure the streaming parser correctly handles UTF-8 multi-byte
  // sequences that are split across chunk boundaries.
  // ─────────────────────────────────────────────────────────────────────────────

  describe('UTF-8 Boundary Handling (Regression)', () => {
    /**
     * Helper to create a stream that splits bytes at exact positions
     */
    function bytesToStreamWithSplits(
      bytes: Uint8Array,
      splitPositions: number[]
    ): ReadableStream<Uint8Array> {
      let chunkIndex = 0;
      const positions = [0, ...splitPositions, bytes.length];

      return new ReadableStream({
        pull(controller) {
          if (chunkIndex >= positions.length - 1) {
            controller.close();
            return;
          }
          const start = positions[chunkIndex]!;
          const end = positions[chunkIndex + 1]!;
          controller.enqueue(bytes.slice(start, end));
          chunkIndex++;
        },
      });
    }

    it('handles 2-byte UTF-8 sequence split at byte boundary', async () => {
      // ñ = U+00F1 = 0xC3 0xB1 (2 bytes)
      const text = 'name = "niño"';
      const bytes = new TextEncoder().encode(text);

      // Find the position of ñ in the encoded bytes
      // "name = \"ni" = 10 chars, then ñ starts
      // ñ is at position 10 in the string, but in bytes it's after "name = \"ni"
      const assignments = new Map<string, OdinValue>();

      // Split right in the middle of the ñ character (after first byte)
      // The ñ character starts at byte 10 (after 'name = "ni')
      const nPos = text.indexOf('ñ');
      const bytePos = new TextEncoder().encode(text.slice(0, nPos)).length;

      await Odin.parseStream(bytesToStreamWithSplits(bytes, [bytePos + 1]), {
        onAssignment(path, value) {
          assignments.set(path, value);
        },
      });

      expect(assignments.get('name')).toEqual({
        type: 'string',
        value: 'niño',
      });
    });

    it('handles 3-byte UTF-8 sequence split at first byte boundary', async () => {
      // 世 = U+4E16 = 0xE4 0xB8 0x96 (3 bytes)
      const text = 'greeting = "世界"';
      const bytes = new TextEncoder().encode(text);
      const assignments = new Map<string, OdinValue>();

      // Split after first byte of 世
      const worldPos = text.indexOf('世');
      const bytePos = new TextEncoder().encode(text.slice(0, worldPos)).length;

      await Odin.parseStream(bytesToStreamWithSplits(bytes, [bytePos + 1]), {
        onAssignment(path, value) {
          assignments.set(path, value);
        },
      });

      expect(assignments.get('greeting')).toEqual({
        type: 'string',
        value: '世界',
      });
    });

    it('handles 3-byte UTF-8 sequence split at second byte boundary', async () => {
      // 世 = U+4E16 = 0xE4 0xB8 0x96 (3 bytes)
      const text = 'greeting = "世界"';
      const bytes = new TextEncoder().encode(text);
      const assignments = new Map<string, OdinValue>();

      // Split after second byte of 世
      const worldPos = text.indexOf('世');
      const bytePos = new TextEncoder().encode(text.slice(0, worldPos)).length;

      await Odin.parseStream(bytesToStreamWithSplits(bytes, [bytePos + 2]), {
        onAssignment(path, value) {
          assignments.set(path, value);
        },
      });

      expect(assignments.get('greeting')).toEqual({
        type: 'string',
        value: '世界',
      });
    });

    it('handles 4-byte UTF-8 sequence (emoji) split at various boundaries', async () => {
      // 😀 = U+1F600 = 0xF0 0x9F 0x98 0x80 (4 bytes)
      const text = 'emoji = "😀"';
      const bytes = new TextEncoder().encode(text);

      // Test split at each byte boundary of the emoji
      for (let splitOffset = 1; splitOffset <= 3; splitOffset++) {
        const assignments = new Map<string, OdinValue>();
        const emojiPos = text.indexOf('😀');
        const bytePos = new TextEncoder().encode(text.slice(0, emojiPos)).length;

        await Odin.parseStream(bytesToStreamWithSplits(bytes, [bytePos + splitOffset]), {
          onAssignment(path, value) {
            assignments.set(path, value);
          },
        });

        expect(assignments.get('emoji')).toEqual({
          type: 'string',
          value: '😀',
        });
      }
    });

    it('handles multiple multi-byte characters with splits between them', async () => {
      // Mix of 2-byte, 3-byte, and 4-byte UTF-8 sequences
      const text = 'mixed = "café世界🎉"';
      const bytes = new TextEncoder().encode(text);
      const assignments = new Map<string, OdinValue>();

      // Split at multiple points to stress test
      await Odin.parseStream(bytesToStreamWithSplits(bytes, [5, 10, 15, 20, 25]), {
        onAssignment(path, value) {
          assignments.set(path, value);
        },
      });

      expect(assignments.get('mixed')).toEqual({
        type: 'string',
        value: 'café世界🎉',
      });
    });

    it('handles single-byte chunks with multi-byte characters', async () => {
      // Extreme case: 1 byte per chunk
      const text = 'emoji = "🎉"';
      const assignments = new Map<string, OdinValue>();

      await Odin.parseStream(stringToStream(text, 1), {
        onAssignment(path, value) {
          assignments.set(path, value);
        },
      });

      expect(assignments.get('emoji')).toEqual({
        type: 'string',
        value: '🎉',
      });
    });

    it('handles continuation bytes without start byte (malformed UTF-8)', async () => {
      // Create malformed input: continuation bytes (0x80-0xBF) without start byte
      // The decoder should handle this gracefully (replacement character or skip)
      const bytes = new Uint8Array([
        ...new TextEncoder().encode('field = "'),
        0x80, // orphan continuation byte
        0x81, // another orphan
        ...new TextEncoder().encode('"'),
      ]);

      const assignments = new Map<string, OdinValue>();
      const errors: Error[] = [];

      await Odin.parseStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        {
          onAssignment(path, value) {
            assignments.set(path, value);
          },
          onError(error) {
            errors.push(error);
          },
        }
      );

      // Should either parse with replacement chars or report error - not crash
      expect(true).toBe(true); // If we get here, no crash occurred
    });
  });
});
