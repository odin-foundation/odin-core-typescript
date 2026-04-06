/**
 * ODIN Fixed-Width Formatter - Format output as fixed-width text.
 *
 * Handles fixed-width formatting with position/length modifiers.
 * Extracted from formatters.ts for single responsibility.
 */

import type { FieldMapping, TransformValue } from '../../types/transform.js';
import type { FormatterOptions } from './types.js';
import { resolvePath } from '../utils.js';
import { valueOverflowWarning, positionOverflowWarning } from '../errors.js';
import { transformValueToString, isNumericValue } from './value-converters.js';

/**
 * Format output as fixed-width text.
 */
export function formatFixedWidth(
  output: Record<string, TransformValue>,
  options: FormatterOptions
): string {
  const { transform, onWarning } = options;

  // Fixed-width formatting processes segments with position/length modifiers
  const lineWidth = transform.target.lineWidth ?? 80;
  const defaultPadChar = transform.target.padChar ?? ' ';
  const lineEnding = transform.target.lineEnding ?? '\n';
  const truncate = transform.target.truncate !== false;

  const lines: string[] = [];

  // Process each segment as a line
  for (const segment of transform.segments) {
    // Get segment output data
    const segmentPath = segment.path;
    const segmentData = resolvePath(segmentPath, output) ?? output;

    if (segment.isArray && Array.isArray(segmentData)) {
      // Array segment: one line per item
      for (const item of segmentData) {
        const line = formatFixedWidthLine(
          segment.mappings,
          item as Record<string, TransformValue>,
          lineWidth,
          defaultPadChar,
          truncate,
          onWarning
        );
        lines.push(line);
      }
    } else {
      // Single segment: one line
      const data =
        typeof segmentData === 'object' && segmentData !== null
          ? (segmentData as Record<string, TransformValue>)
          : output;
      const line = formatFixedWidthLine(
        segment.mappings,
        data,
        lineWidth,
        defaultPadChar,
        truncate,
        onWarning
      );
      lines.push(line);
    }
  }

  return lines.join(lineEnding);
}

/**
 * Format a single fixed-width line.
 */
function formatFixedWidthLine(
  mappings: FieldMapping[],
  data: Record<string, TransformValue>,
  lineWidth: number,
  defaultPadChar: string,
  truncate: boolean,
  onWarning: (warning: import('../../types/transform.js').TransformWarning) => void
): string {
  let line = '';

  // Sort mappings by position for deterministic output
  const sortedMappings = [...mappings].sort((a, b) => {
    const posA = a.modifiers.find((m) => m.name === 'pos');
    const posB = b.modifiers.find((m) => m.name === 'pos');
    return ((posA?.value as number) ?? 0) - ((posB?.value as number) ?? 0);
  });

  for (const mapping of sortedMappings) {
    const posModifier = mapping.modifiers.find((m) => m.name === 'pos');
    const lenModifier = mapping.modifiers.find((m) => m.name === 'len');
    const leftPadModifier = mapping.modifiers.find((m) => m.name === 'leftPad');
    const rightPadModifier = mapping.modifiers.find((m) => m.name === 'rightPad');

    // Get position and length
    const pos = typeof posModifier?.value === 'number' ? posModifier.value : 0;
    const len = typeof lenModifier?.value === 'number' ? lenModifier.value : 0;

    if (len === 0) continue; // Skip mappings without length

    // T010: Check for position overflow
    if (pos + len > lineWidth) {
      onWarning(positionOverflowWarning(pos, len, lineWidth, mapping.target));
    }

    // Fill gap to field position
    if (line.length < pos) {
      line += defaultPadChar.repeat(pos - line.length);
    }

    // Get field value
    const rawValue = data[mapping.target];
    let value = transformValueToString(rawValue);

    let padChar = defaultPadChar;
    if (leftPadModifier && typeof leftPadModifier.value === 'string') {
      padChar = leftPadModifier.value.charAt(0) || ' ';
    } else if (rightPadModifier && typeof rightPadModifier.value === 'string') {
      padChar = rightPadModifier.value.charAt(0) || ' ';
    }

    // Handle truncation
    if (value.length > len) {
      if (truncate) {
        value = value.slice(0, len);
      } else {
        // Emit warning but don't truncate
        onWarning(valueOverflowWarning(value, len, mapping.target));
        value = value.slice(0, len);
      }
    }

    if (leftPadModifier || (!rightPadModifier && isNumericValue(rawValue))) {
      // Left pad (right-align) for numbers
      value = value.padStart(len, padChar);
    } else {
      // Right pad (left-align) for strings
      value = value.padEnd(len, padChar);
    }

    line = line.slice(0, pos) + value + line.slice(pos + len);
  }

  return line;
}
