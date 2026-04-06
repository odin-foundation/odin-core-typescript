/**
 * ODIN Transform Engine - Multi-Record Processing
 *
 * Standalone functions for processing multi-record input with discriminator-based routing.
 * Handles fixed-width, delimited, JSON, and ODIN format records.
 */

import type { TransformSegment, Discriminator } from '../types/transform.js';
import { resolvePath } from './utils.js';
import { Odin } from '../odin.js';

// ─────────────────────────────────────────────────────────────────────────────
// Segment Routing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a map from discriminator values to segments.
 *
 * Segments can specify multiple type values separated by commas in their :type directive.
 *
 * @param segments - Array of transform segments
 * @returns Map from discriminator value to segment
 *
 * @example
 * // Segment with :type "01,02" maps both "01" and "02" to the same segment
 * buildSegmentRoutingMap(segments) // => Map { "01" => segment, "02" => segment }
 */
export function buildSegmentRoutingMap(
  segments: TransformSegment[]
): Map<string, TransformSegment> {
  const map = new Map<string, TransformSegment>();

  for (const segment of segments) {
    const typeDirective = segment.directives.find((d) => d.type === 'type');
    if (typeDirective && typeDirective.value) {
      // Support multiple types separated by comma
      const types = typeDirective.value.split(',').map((t) => t.trim());
      for (const type of types) {
        map.set(type, segment);
      }
    }
  }

  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminator Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract discriminator value from a record.
 *
 * Supports three discriminator types:
 * - position: Extract from fixed position/length
 * - field: Extract from delimited field index
 * - path: Extract from JSON/ODIN object path
 *
 * @param record - Record string to extract from
 * @param discriminator - Discriminator configuration
 * @param delimiter - Delimiter for delimited format
 * @returns Discriminator value string
 *
 * @example
 * extractDiscriminatorValue("01POL123456", { type: 'position', pos: 0, len: 2 })
 * // => "01"
 */
export function extractDiscriminatorValue(
  record: string,
  discriminator: Discriminator,
  delimiter?: string
): string {
  switch (discriminator.type) {
    case 'position': {
      const pos = discriminator.pos ?? 0;
      const len = discriminator.len ?? 1;
      return record.slice(pos, pos + len);
    }
    case 'field': {
      const fields = record.split(delimiter ?? ',');
      const fieldIndex = discriminator.field ?? 0;
      return fields[fieldIndex]?.trim() ?? '';
    }
    case 'path': {
      // For path-based, try to parse as JSON first
      try {
        const obj = JSON.parse(record);
        return String(resolvePath(discriminator.path ?? '', obj) ?? '');
      } catch {
        // Malformed JSON - return empty to skip discriminator matching
        return '';
      }
    }
    default:
      return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Record Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a record string into a source object for field mappings.
 *
 * Handles different source formats:
 * - fixed-width: Raw record available as @._raw and @._line for pos/len extraction
 * - delimited/csv: Fields indexed as @.0, @.1, etc.
 * - json: Parsed JSON object
 * - odin: Parsed ODIN document
 *
 * @param record - Record string to parse
 * @param format - Source format type
 * @param delimiter - Delimiter for delimited format
 * @returns Parsed source object
 *
 * @example
 * parseRecord("01POL123456", "fixed-width")
 * // => { _raw: "01POL123456", _line: "01POL123456" }
 *
 * parseRecord("POL123,John,Doe", "csv", ",")
 * // => { _raw: "POL123,John,Doe", "0": "POL123", "1": "John", "2": "Doe" }
 */
export function parseRecord(
  record: string,
  format: string,
  delimiter?: string
): Record<string, unknown> {
  if (format === 'delimited' || format === 'csv') {
    // Parse delimited record into indexed fields
    const fields = record.split(delimiter ?? ',');
    const result: Record<string, unknown> = { _raw: record, _line: record };
    for (let i = 0; i < fields.length; i++) {
      result[String(i)] = fields[i];
    }
    return result;
  }

  if (format === 'json') {
    try {
      return { ...JSON.parse(record), _raw: record };
    } catch {
      // Malformed JSON - return raw record for partial processing
      return { _raw: record };
    }
  }

  if (format === 'odin') {
    try {
      const odinDoc = Odin.parse(record);
      return { ...odinDoc.toJSON(), _raw: record };
    } catch {
      // Malformed ODIN - return raw record for partial processing
      return { _raw: record };
    }
  }

  // Default: fixed-width - the raw record is the source
  // Field extraction happens via :pos/:len modifiers
  return { _raw: record, _line: record };
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment Output Merging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge segment output into the main output object.
 *
 * Handles root-level merge and nested path assignment.
 *
 * @param output - Main output object
 * @param segmentPath - Segment path (may have 'segment.' prefix)
 * @param segmentOutput - Segment output to merge
 * @param setNestedValue - Function to set nested values
 *
 * @example
 * mergeSegmentOutput(output, "policy", { number: "POL123" }, setNestedValue)
 * // output.policy = { number: "POL123" }
 */
export function mergeSegmentOutput(
  output: Record<string, unknown>,
  segmentPath: string,
  segmentOutput: Record<string, unknown>,
  setNestedValue: (obj: Record<string, unknown>, path: string, value: unknown) => void
): void {
  if (segmentPath === '' || segmentPath === '.') {
    // Merge at root
    Object.assign(output, segmentOutput);
  } else {
    // Merge at path
    const existing = resolvePath(segmentPath, output);
    if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
      Object.assign(existing as Record<string, unknown>, segmentOutput);
    } else {
      setNestedValue(output, segmentPath, segmentOutput);
    }
  }
}
