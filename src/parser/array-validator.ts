/**
 * ODIN Array Validator - Validates array index contiguity.
 *
 * Extracted from parser.ts for separation of concerns (SOC).
 * Parsing and validation are now separate responsibilities.
 */

import { ParseError } from '../types/errors.js';

/**
 * Validate that all arrays have contiguous indices starting from 0.
 *
 * @param arrayIndices - Map of array paths to their used indices
 * @throws ParseError if indices are non-contiguous or don't start at 0
 */
export function validateArrayContiguity(arrayIndices: Map<string, number[]>): void {
  for (const [arrayPath, indices] of arrayIndices) {
    // Sort indices for contiguity check
    indices.sort((a, b) => a - b);

    // Arrays must start at index 0
    if (indices[0] !== 0) {
      throw new ParseError(`Array ${arrayPath} must start at index 0`, 'P013', 1, 1, {
        path: arrayPath,
        expected: 0,
        found: indices[0],
      });
    }

    // Check for gaps in indices
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1]! + 1) {
        throw new ParseError(`Non-contiguous array indices in ${arrayPath}`, 'P013', 1, 1, {
          path: arrayPath,
          expected: indices[i - 1]! + 1,
          found: indices[i],
        });
      }
    }
  }
}
