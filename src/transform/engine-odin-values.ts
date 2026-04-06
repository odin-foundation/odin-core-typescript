/**
 * ODIN Transform Engine - ODIN Value Type Preservation
 *
 * Standalone functions for converting between ODIN values and TransformValues.
 * Preserves ODIN's rich type system during transforms.
 */

import type { TransformValue } from '../types/transform.js';
import type { OdinValue } from '../types/values.js';

// ─────────────────────────────────────────────────────────────────────────────
// ODIN to TransformValue Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert OdinValue to JavaScript primitive (for array items and nested objects).
 *
 * @param value - ODIN value to convert
 * @returns JavaScript primitive representation
 */
export function odinValueToJs(value: OdinValue): unknown {
  switch (value.type) {
    case 'null':
      return null;
    case 'boolean':
    case 'string':
    case 'integer':
    case 'number':
    case 'currency':
    case 'percent':
      return value.value;
    case 'date':
    case 'timestamp':
      return value.raw;
    case 'time':
    case 'duration':
      return value.value;
    case 'reference':
      return `@${value.path}`;
    case 'binary': {
      const b64 = btoa(String.fromCharCode(...value.data));
      return value.algorithm ? `^${value.algorithm}:${b64}` : `^${b64}`;
    }
    case 'array':
      return value.items;
    case 'object':
      return value.value;
    default:
      return null;
  }
}

/**
 * Convert OdinValue to TransformValue, preserving type information.
 *
 * This preserves ODIN's rich type system including:
 * - Numeric types with decimal places (##, #, #$, #.N, #$.N)
 * - Temporal types with raw representation (date, timestamp, time, duration)
 * - Reference paths (@)
 * - Binary data with algorithm (^)
 *
 * @param value - ODIN value to convert
 * @returns Corresponding TransformValue with preserved types
 */
export function odinValueToTransformValue(value: OdinValue): TransformValue {
  // OdinValue IS TransformValue - return copy for immutability
  switch (value.type) {
    case 'null':
    case 'boolean':
    case 'string':
    case 'number':
    case 'integer':
    case 'currency':
    case 'percent':
    case 'date':
    case 'timestamp':
    case 'time':
    case 'duration':
    case 'reference':
    case 'binary':
      return value;
    case 'array': {
      // Arrays need special handling - convert to JS array for transform context
      const items = value.items.map((item) => {
        // Check if item is a Map (object array from ODIN syntax)
        if (item instanceof Map) {
          const obj: Record<string, unknown> = {};
          for (const [key, val] of item.entries()) {
            obj[key] = odinValueToJs(val);
          }
          return obj;
        }
        // Flat array: item is an OdinTypedValue directly - convert to JS
        return odinValueToJs(item as OdinValue);
      });
      return { type: 'object', value: { items } };
    }
    case 'object':
      return value;
    default:
      return { type: 'null' };
  }
}
