/**
 * ODIN Transform Engine - Path Resolution Utilities
 *
 * Standalone functions for path resolution and nested value assignment.
 * These utilities handle dot-notation paths and nested object manipulation.
 */

import { SECURITY_LIMITS } from '../utils/security-limits.js';

// ─────────────────────────────────────────────────────────────────────────────
// Nested Value Assignment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set a value at a nested path in an object.
 *
 * Creates intermediate objects as needed for nested paths.
 *
 * @param obj - Target object to modify
 * @param path - Dot-separated path (e.g., "policy.vehicles[0].vin")
 * @param value - Value to set at the path
 *
 * @example
 * const obj = {};
 * setNestedValue(obj, "policy.number", "POL123");
 * // obj = { policy: { number: "POL123" } }
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');

  // Security: Check path depth to prevent deeply nested object attacks
  if (parts.length > SECURITY_LIMITS.MAX_PATH_SEGMENTS) {
    throw new Error(
      `Path depth ${parts.length} exceeds maximum allowed depth of ${SECURITY_LIMITS.MAX_PATH_SEGMENTS}`
    );
  }

  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment Path Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get output path for a segment (strips 'segment.' prefix and lowercases).
 *
 * Used in multi-record transforms to map segment identifiers to output paths.
 *
 * @param segmentPath - Segment path (e.g., "segment.VEH")
 * @returns Output path (e.g., "veh")
 *
 * @example
 * getSegmentOutputPath("segment.VEH") // => "veh"
 * getSegmentOutputPath("vehicles")    // => "vehicles"
 */
export function getSegmentOutputPath(segmentPath: string): string {
  if (segmentPath.startsWith('segment.')) {
    return segmentPath.slice('segment.'.length).toLowerCase();
  }
  return segmentPath;
}
