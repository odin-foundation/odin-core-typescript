/**
 * ODIN Transform Engine - Directive Application
 *
 * Functions for applying extraction directives (:pos, :len, :trim) to values.
 */

import type { TransformValue } from '../types/transform.js';

/**
 * Extraction directive definition.
 */
export interface ExtractionDirective {
  name: string;
  value?: string | number;
}

/**
 * Apply extraction directives (:pos, :len, :trim, :field) to a value.
 *
 * These directives are used for extracting data from source values:
 * - :pos/:len - Extract substring from fixed-width sources
 * - :field - Extract field by index from delimited sources
 * - :trim - Trim whitespace
 *
 * @param value - The source value to extract from
 * @param directives - Array of directives to apply
 * @param delimiter - Delimiter for :field directive (defaults to ',')
 * @returns Transformed value with directives applied
 */
export function applyDirectives(
  value: TransformValue,
  directives: ReadonlyArray<ExtractionDirective>,
  delimiter: string = ','
): TransformValue {
  let str: string;
  if (value.type === 'string') {
    str = value.value;
  } else if (value.type === 'null') {
    return value;
  } else {
    str = String('value' in value ? value.value : '');
  }

  let pos: number | undefined;
  let len: number | undefined;
  let fieldIndex: number | undefined;
  let shouldTrim = false;

  for (const directive of directives) {
    switch (directive.name) {
      case 'pos':
        pos =
          typeof directive.value === 'number'
            ? directive.value
            : parseInt(String(directive.value), 10);
        break;
      case 'len':
        len =
          typeof directive.value === 'number'
            ? directive.value
            : parseInt(String(directive.value), 10);
        break;
      case 'field':
        fieldIndex =
          typeof directive.value === 'number'
            ? directive.value
            : parseInt(String(directive.value), 10);
        break;
      case 'trim':
        shouldTrim = true;
        break;
    }
  }

  // Apply :field first (extract field from delimited string)
  if (fieldIndex !== undefined) {
    const fields = str.split(delimiter);
    str = fieldIndex < fields.length ? fields[fieldIndex]! : '';
  }

  // Then apply :pos/:len (substring extraction)
  if (pos !== undefined) {
    str = len !== undefined ? str.substring(pos, pos + len) : str.substring(pos);
  }

  if (shouldTrim) {
    str = str.trim();
  }

  return { type: 'string', value: str };
}
