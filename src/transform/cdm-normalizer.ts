/**
 * ODIN CDM Normalizer - Canonical Data Model conversion.
 *
 * Converts transform output to OdinDocument for CDM architecture.
 * All format conversions route through ODIN as the intermediate representation.
 *
 * Extracted from formatters.ts for separation of concerns.
 */

import type { OdinDocument } from '../types/document.js';
import type { TransformValue } from '../types/transform.js';
import { Odin } from '../odin.js';

/**
 * Normalize transform output to an OdinDocument (Canonical Data Model).
 *
 * This is the core of the CDM architecture: ALL transforms route through
 * ODIN as the intermediate representation before formatting to the target.
 *
 * Phase 3: Output now contains TransformValue objects directly (typed values).
 * No type reconstruction needed - values carry their types end-to-end.
 *
 * Flow: Source Data -> TransformValue -> OdinDocument -> Target Format
 *
 * @param output - Record of field names to TransformValue (typed values)
 * @returns An OdinDocument representing the canonical form
 */
export function normalizeToOdin(output: Record<string, TransformValue>): OdinDocument {
  const builder = Odin.builder();

  // Recursively add all typed values
  buildOdinFromTypedValues(output, '', builder);

  return builder.build();
}

/**
 * Recursively build ODIN document from typed values using the builder.
 *
 * Phase 3: Values are already TransformValue (typed) - no conversion needed.
 * We just need to traverse the structure and add values to the builder.
 */
function buildOdinFromTypedValues(
  obj: unknown,
  prefix: string,
  builder: ReturnType<typeof Odin.builder>
): void {
  // Check if this is a TransformValue (has a 'type' property)
  if (isTransformValue(obj)) {
    // Array TransformValues must be decomposed into indexed paths
    // so the ODIN serializer can reconstruct them properly
    if (obj.type === 'array' && obj.items) {
      const items = obj.items as unknown[];
      for (let i = 0; i < items.length; i++) {
        const itemPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`;
        buildOdinFromTypedValues(items[i], itemPrefix, builder);
      }
      return;
    }
    // Object TransformValues: recurse into .value to set nested paths
    if (obj.type === 'object' && obj.value && typeof obj.value === 'object') {
      for (const [key, val] of Object.entries(obj.value as Record<string, unknown>)) {
        const nestedPath = prefix ? `${prefix}.${key}` : key;
        buildOdinFromTypedValues(val, nestedPath, builder);
      }
      return;
    }
    if (prefix) {
      setTypedValue(builder, prefix, obj);
    }
    return;
  }

  if (obj === null || obj === undefined) {
    if (prefix) {
      builder.set(prefix, { type: 'null' });
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const itemPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`;
      buildOdinFromTypedValues(obj[i], itemPrefix, builder);
    }
    return;
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      buildOdinFromTypedValues(value, path, builder);
    }
    return;
  }

  // Fallback for raw primitives (from verbs that return plain JS values)
  if (prefix) {
    if (typeof obj === 'number') {
      builder.set(prefix, Number.isInteger(obj) ? { type: 'integer', value: obj } : { type: 'number', value: obj });
    } else if (typeof obj === 'boolean') {
      builder.set(prefix, { type: 'boolean', value: obj });
    } else if (typeof obj === 'string') {
      builder.set(prefix, { type: 'string', value: obj });
    } else {
      builder.set(prefix, { type: 'string', value: String(obj) });
    }
  }
}

/**
 * Type guard to check if a value is a TransformValue.
 */
function isTransformValue(value: unknown): value is TransformValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as TransformValue).type === 'string'
  );
}

/**
 * Set a typed value on the builder.
 * The value already contains type information and modifiers.
 */
function setTypedValue(
  builder: ReturnType<typeof Odin.builder>,
  path: string,
  value: TransformValue
): void {
  // Check if the value has modifiers
  if (
    value.modifiers &&
    (value.modifiers.confidential || value.modifiers.required || value.modifiers.deprecated)
  ) {
    builder.setWithModifiers(path, value, {
      confidential: value.modifiers.confidential ?? false,
      required: value.modifiers.required ?? false,
      deprecated: value.modifiers.deprecated ?? false,
    });
  } else {
    builder.set(path, value);
  }
}
