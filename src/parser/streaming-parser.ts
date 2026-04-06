/**
 * ODIN Streaming Parser
 *
 * Processes ODIN documents in streaming fashion for memory-efficient
 * handling of large files. Emits events as headers and assignments are
 * parsed rather than building the entire document in memory.
 *
 * Performance optimizations:
 * - Uses indexOf for newline detection (not regex)
 * - Offset-based buffer management to minimize string allocations
 * - Inline value parsing to avoid Parser instance per line
 */

import type { ParseHandler } from '../types/options.js';
import type { OdinValue } from '../types/values.js';
import { OdinValues } from '../types/values.js';
import {
  TIMESTAMP_PATTERN,
  DATE_PATTERN,
  TIME_PATTERN,
  DURATION_PATTERN,
  parseQuotedString,
  stripInlineComment,
  parseBinaryValue,
  countDecimalPlaces,
} from './parse-utils.js';
import { ParseError } from '../types/errors.js';
import { SECURITY_LIMITS } from '../utils/security-limits.js';

// Buffer compaction threshold - compact when offset exceeds this
const BUFFER_COMPACT_THRESHOLD = SECURITY_LIMITS.BUFFER_COMPACT_THRESHOLD;

/**
 * Streaming parser for ODIN documents.
 *
 * Uses a line-based parsing approach:
 * 1. Accumulates data until complete lines are available
 * 2. Tracks document state (current header context)
 * 3. Emits events for each parsed element
 */
export class StreamingParser {
  private handler: ParseHandler;
  private buffer: string = '';
  private bufferOffset: number = 0; // Current read position in buffer
  private pendingBytes: number[] = [];
  private currentHeader: string = '';
  private inDocument: boolean = false;

  // Security: Track cumulative bytes to prevent slow-drip attacks
  private totalBytesReceived: number = 0;

  // Security: Track error state to stop processing after an error
  private hasError: boolean = false;

  constructor(handler: ParseHandler) {
    this.handler = handler;
  }

  /**
   * Process a chunk of UTF-8 bytes.
   */
  processChunk(chunk: Uint8Array): void {
    // Security: Track cumulative bytes received to prevent slow-drip DoS attacks
    // Even with small chunks, total bytes accumulate and could exhaust memory
    this.totalBytesReceived += chunk.length;
    if (this.totalBytesReceived > SECURITY_LIMITS.MAX_BUFFER_SIZE) {
      throw new ParseError(
        `Total bytes received (${this.totalBytesReceived}) exceeded maximum of ${SECURITY_LIMITS.MAX_BUFFER_SIZE}`,
        'P011',
        1,
        1
      );
    }

    // Handle potential multi-byte UTF-8 sequences at chunk boundaries
    // by accumulating bytes until we have complete characters
    const allBytes = new Uint8Array(this.pendingBytes.length + chunk.length);
    allBytes.set(this.pendingBytes);
    allBytes.set(chunk, this.pendingBytes.length);

    // Find how many bytes at the end might be incomplete UTF-8 sequences
    const incompleteBytes = this.findIncompleteUtf8Suffix(allBytes);

    if (incompleteBytes > 0) {
      // Save incomplete bytes for next chunk
      const completeBytes = allBytes.slice(0, allBytes.length - incompleteBytes);
      this.pendingBytes = Array.from(allBytes.slice(allBytes.length - incompleteBytes));

      const decoder = new TextDecoder('utf-8', { fatal: false });
      this.buffer += decoder.decode(completeBytes);
    } else {
      // All bytes are complete
      this.pendingBytes = [];
      const decoder = new TextDecoder('utf-8', { fatal: false });
      this.buffer += decoder.decode(allBytes);
    }

    // Check current buffer size to prevent memory exhaustion from single large chunk
    if (this.buffer.length > SECURITY_LIMITS.MAX_STREAMING_BUFFER) {
      throw new ParseError(
        `Streaming buffer exceeded maximum size of ${SECURITY_LIMITS.MAX_STREAMING_BUFFER} bytes`,
        'P011',
        1,
        1
      );
    }

    // Process complete lines
    this.processLines(false);
  }

  /**
   * Find how many bytes at the end of a buffer might be an incomplete UTF-8 sequence.
   * Returns 0 if the buffer ends with complete characters.
   *
   * UTF-8 encoding:
   * - 1-byte (ASCII): 0xxxxxxx
   * - 2-byte: 110xxxxx 10xxxxxx
   * - 3-byte: 1110xxxx 10xxxxxx 10xxxxxx
   * - 4-byte: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
   */
  private findIncompleteUtf8Suffix(bytes: Uint8Array): number {
    if (bytes.length === 0) return 0;

    // Check up to the last 4 bytes for an incomplete sequence
    // We scan backwards looking for a start byte
    const checkLimit = Math.min(4, bytes.length);

    for (let i = 1; i <= checkLimit; i++) {
      const byte = bytes[bytes.length - i];
      if (byte === undefined) continue;

      // Check what kind of byte this is
      if ((byte & 0x80) === 0) {
        // ASCII byte (0xxxxxxx) - complete single-byte character
        // Invalid continuation bytes returned as "incomplete" for error handling
        return i - 1;
      } else if ((byte & 0xc0) === 0x80) {
        // Continuation byte (10xxxxxx) - keep scanning backwards for start byte
        continue;
      } else if ((byte & 0xe0) === 0xc0) {
        // Start of 2-byte sequence (110xxxxx)
        // Need exactly 2 bytes total (1 start + 1 continuation)
        const continuationBytes = i - 1;
        const neededContinuation = 1;
        return continuationBytes < neededContinuation ? i : 0;
      } else if ((byte & 0xf0) === 0xe0) {
        // Start of 3-byte sequence (1110xxxx)
        // Need exactly 3 bytes total (1 start + 2 continuation)
        const continuationBytes = i - 1;
        const neededContinuation = 2;
        return continuationBytes < neededContinuation ? i : 0;
      } else if ((byte & 0xf8) === 0xf0) {
        // Start of 4-byte sequence (11110xxx)
        // Need exactly 4 bytes total (1 start + 3 continuation)
        const continuationBytes = i - 1;
        const neededContinuation = 3;
        return continuationBytes < neededContinuation ? i : 0;
      } else {
        // Invalid start byte (11111xxx or similar) - treat as incomplete
        return i;
      }
    }

    // Malformed UTF-8: only continuation bytes without start byte
    return checkLimit;
  }

  /**
   * Signal end of input and flush remaining buffer.
   */
  finish(): void {
    // Process any remaining bytes
    if (this.pendingBytes.length > 0) {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      this.buffer += decoder.decode(new Uint8Array(this.pendingBytes));
      this.pendingBytes = [];
    }

    // Process remaining lines - force processing even without trailing newline
    this.processLines(true);

    // End document if active
    if (this.inDocument) {
      this.handler.onDocumentEnd?.();
      this.inDocument = false;
    }
  }

  /**
   * Process complete lines from the buffer.
   * Uses offset-based tracking to minimize string allocations.
   * @param final - If true, process any remaining content even without newline
   */
  private processLines(final: boolean): void {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Security: Stop processing if an error has occurred
      if (this.hasError) {
        break;
      }

      // Find next newline using indexOf (much faster than regex)
      // Search from current offset, not beginning
      const newlineIndex = this.buffer.indexOf('\n', this.bufferOffset);

      if (newlineIndex === -1) {
        // No complete line found
        if (final) {
          // At end of stream - process remaining content
          const remaining = this.buffer.slice(this.bufferOffset).trim();
          if (remaining) {
            try {
              this.processLine(remaining);
            } catch (e) {
              this.hasError = true;
              throw e;
            }
          }
          this.buffer = '';
          this.bufferOffset = 0;
        } else {
          // Compact buffer if offset is large (avoid unbounded growth)
          this.maybeCompactBuffer();
        }
        break;
      }

      // Extract line (without newline characters)
      // Handle both \n and \r\n line endings
      let lineEnd = newlineIndex;
      if (lineEnd > this.bufferOffset && this.buffer[lineEnd - 1] === '\r') {
        lineEnd--; // Exclude \r from line content
      }

      const line = this.buffer.slice(this.bufferOffset, lineEnd);

      // Advance offset past the newline
      this.bufferOffset = newlineIndex + 1;

      // Process the line with exception guard
      try {
        this.processLine(line);
      } catch (e) {
        // Security: Set error state to prevent further processing
        this.hasError = true;
        throw e;
      }
    }
  }

  /**
   * Compact buffer when offset exceeds threshold.
   * This prevents unbounded memory growth from accumulated offset.
   */
  private maybeCompactBuffer(): void {
    if (this.bufferOffset > BUFFER_COMPACT_THRESHOLD) {
      this.buffer = this.buffer.slice(this.bufferOffset);
      this.bufferOffset = 0;
    }
  }

  /**
   * Process a single logical line.
   */
  private processLine(line: string): void {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith(';')) {
      return;
    }

    // Check for document separator
    if (trimmed === '---') {
      if (this.inDocument) {
        this.handler.onDocumentEnd?.();
      }
      this.handler.onDocumentStart?.();
      this.inDocument = true;
      this.currentHeader = '';
      return;
    }

    // Start document if not already started
    if (!this.inDocument) {
      this.handler.onDocumentStart?.();
      this.inDocument = true;
    }

    // Check for header
    if (trimmed.startsWith('{') && trimmed.includes('}')) {
      this.processHeader(trimmed);
      return;
    }

    // Process assignment
    this.processAssignment(line);
  }

  /**
   * Process a header line.
   */
  private processHeader(line: string): void {
    // Parse header content between { and }
    const match = line.match(/^\s*\{([^}]*)\}/);
    if (!match) return;

    const headerPath = match[1]!.trim();

    // Handle meta headers: {$}, {$target}, etc.
    if (headerPath.startsWith('$')) {
      // Keep original format for building full path
      if (headerPath === '$') {
        this.currentHeader = '$';
        this.handler.onHeader?.('$');
      } else {
        // {$target} -> current header = "$target", emits "$.target"
        this.currentHeader = headerPath;
        this.handler.onHeader?.('$.' + headerPath.slice(1));
      }
      return;
    }

    this.currentHeader = headerPath;
    this.handler.onHeader?.(headerPath);
  }

  /**
   * Process an assignment line with inline parsing.
   * Avoids creating Parser instance for each line.
   */
  private processAssignment(line: string): void {
    try {
      // Find the equals sign (separates path from value)
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) {
        // Not a valid assignment - might be continuation or error
        return;
      }

      // Extract path (left of =) and value text (right of =)
      const pathPart = line.slice(0, eqIndex).trim();
      let valuePart = line.slice(eqIndex + 1);

      // Strip inline comment from value
      valuePart = stripInlineComment(valuePart).trim();

      // Parse the path
      const localPath = this.parsePath(pathPart);
      if (!localPath) return;

      // Build full path with header context
      let fullPath: string;
      if (this.currentHeader) {
        if (this.currentHeader === '$') {
          fullPath = `$.${localPath}`;
        } else if (this.currentHeader.startsWith('$')) {
          fullPath = `$.${this.currentHeader.slice(1)}.${localPath}`;
        } else {
          fullPath = `${this.currentHeader}.${localPath}`;
        }
      } else {
        fullPath = localPath;
      }

      // Parse the value
      const value = this.parseValue(valuePart);

      // Emit the assignment
      this.handler.onAssignment?.(fullPath, value);
    } catch (error) {
      // Report parse error
      this.handler.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Parse a simple path (handles segments and array indices).
   */
  private parsePath(pathPart: string): string | null {
    // Handle modifiers at start of path
    let path = pathPart;
    while (path.startsWith('!') || path.startsWith('*') || path.startsWith('-')) {
      path = path.slice(1);
    }
    path = path.trim();

    if (!path) return null;

    // Path is already in a valid format - just clean it up
    // Handle quoted segments if present
    return path.replace(/\s+/g, '');
  }

  /**
   * Parse a value string into an OdinValue.
   * Handles all ODIN value types with inline parsing.
   */
  private parseValue(text: string): OdinValue {
    if (!text) {
      return OdinValues.nullValue();
    }

    // Check for modifiers at the start
    let hasRequired = false;
    let hasConfidential = false;
    let hasDeprecated = false;
    let pos = 0;

    while (pos < text.length) {
      const ch = text[pos];
      if (ch === '!') {
        hasRequired = true;
        pos++;
      } else if (ch === '*') {
        hasConfidential = true;
        pos++;
      } else if (ch === '-') {
        hasDeprecated = true;
        pos++;
      } else {
        break;
      }
    }

    const valueText = text.slice(pos).trim();
    const value = this.parseValueCore(valueText);

    // Apply modifiers if any are set
    if (hasRequired || hasConfidential || hasDeprecated) {
      const modifiers: { required?: boolean; confidential?: boolean; deprecated?: boolean } = {};
      if (hasRequired) modifiers.required = true;
      if (hasConfidential) modifiers.confidential = true;
      if (hasDeprecated) modifiers.deprecated = true;
      return { ...value, modifiers } as OdinValue;
    }

    return value;
  }

  /**
   * Parse the core value (without modifiers).
   * Uses shared utilities and OdinValues factory functions.
   */
  private parseValueCore(text: string): OdinValue {
    if (!text) {
      return OdinValues.nullValue();
    }

    const first = text[0];

    // Null
    if (text === '~') {
      return OdinValues.nullValue();
    }

    // Boolean (true/false or ?true/?false)
    if (text === 'true' || text === '?true') {
      return OdinValues.boolean(true);
    }
    if (text === 'false' || text === '?false') {
      return OdinValues.boolean(false);
    }

    // Reference (@path)
    if (first === '@') {
      return OdinValues.reference(text.slice(1));
    }

    // Binary (^base64 or ^algorithm:base64)
    if (first === '^') {
      const { data, algorithm } = parseBinaryValue(text.slice(1));
      return OdinValues.binary(data, algorithm ? { algorithm } : undefined);
    }

    // Currency (#$value) - pass as string to preserve high-precision values
    if (text.startsWith('#$')) {
      const numStr = text.slice(2);
      const decimalPlaces = countDecimalPlaces(numStr);
      // Pass raw string to preserve precision for crypto/high-decimal values
      return OdinValues.currency(numStr, { decimalPlaces });
    }

    // Integer (##value)
    if (text.startsWith('##')) {
      const numStr = text.slice(2);
      const num = parseInt(numStr, 10);
      return OdinValues.integer(isNaN(num) ? 0 : num);
    }

    // Number (#value) - pass as string to preserve high-precision values
    if (first === '#') {
      const numStr = text.slice(1);
      // Pass raw string to preserve precision for scientific/high-precision values
      return OdinValues.number(numStr);
    }

    // String (quoted)
    if (first === '"') {
      const parsed = parseQuotedString(text);
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      return OdinValues.string(parsed.value);
    }

    // Check for ISO date/timestamp patterns (unquoted temporal values)
    if (TIMESTAMP_PATTERN.test(text)) {
      return OdinValues.timestamp(text);
    }

    if (DATE_PATTERN.test(text)) {
      return OdinValues.date(text);
    }

    if (TIME_PATTERN.test(text)) {
      return OdinValues.time(text);
    }

    if (DURATION_PATTERN.test(text) && text.length > 1) {
      return OdinValues.duration(text);
    }

    // Unquoted string or other value
    // Check if it looks like a number without prefix
    if (/^-?\d/.test(text)) {
      // Could be an unquoted number - treat as string in streaming mode
      return OdinValues.string(text);
    }

    // Unquoted string
    return OdinValues.string(text);
  }
}

/**
 * Parse ODIN from a ReadableStream, emitting events for each element.
 *
 * @param reader - Stream of UTF-8 bytes
 * @param handler - Callbacks for parse events
 */
export async function parseStream(
  reader: ReadableStream<Uint8Array>,
  handler: ParseHandler
): Promise<void> {
  const parser = new StreamingParser(handler);
  const streamReader = reader.getReader();

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await streamReader.read();
      if (done) {
        break;
      }
      parser.processChunk(value);
    }
    parser.finish();
  } finally {
    streamReader.releaseLock();
  }
}
