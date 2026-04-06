/**
 * ODIN Transform Engine - Confidential Field Enforcement
 *
 * Functions for applying confidential field protection (redaction, masking).
 */

import type { TransformValue } from '../types/transform.js';

/**
 * Confidential enforcement mode.
 * - 'redact': All values become null
 * - 'mask': Strings become asterisks (same length), others become null
 */
export type ConfidentialMode = 'redact' | 'mask';

/**
 * Apply confidential field enforcement based on mode.
 *
 * @param value - The value to potentially redact/mask
 * @param mode - Enforcement mode ('redact' or 'mask')
 * @param isConfidential - Whether the field is marked as confidential
 * @returns The original value if not confidential, otherwise redacted/masked value
 */
export function applyConfidentialEnforcement(
  value: TransformValue,
  mode: ConfidentialMode | undefined,
  isConfidential: boolean
): TransformValue {
  // No enforcement if mode not set or field not confidential
  if (!mode || !isConfidential) {
    return value;
  }

  if (mode === 'redact') {
    // Everything becomes null
    return { type: 'null' };
  }

  if (mode === 'mask') {
    // Strings become asterisks (character count), everything else becomes null
    if (value.type === 'string') {
      const masked = '*'.repeat(value.value.length);
      return { type: 'string', value: masked };
    }
    // Numbers, booleans, arrays, objects all become null
    return { type: 'null' };
  }

  return value;
}
