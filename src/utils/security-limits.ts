/**
 * Security limits for ODIN SDK
 *
 * All limits can be overridden via environment variables prefixed with ODIN_.
 * Example: ODIN_MAX_RECURSION_DEPTH=128
 */

function envInt(name: string, defaultValue: number): number {
  const val = typeof process !== 'undefined' ? process.env?.[`ODIN_${name}`] : undefined;
  if (val === undefined) return defaultValue;
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function envFloat(name: string, defaultValue: number): number {
  const val = typeof process !== 'undefined' ? process.env?.[`ODIN_${name}`] : undefined;
  if (val === undefined) return defaultValue;
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const SECURITY_LIMITS = {
  // Recursion limits
  MAX_RECURSION_DEPTH: envInt('MAX_RECURSION_DEPTH', 64),
  MAX_CIRCULAR_REF_DEPTH: envInt('MAX_CIRCULAR_REF_DEPTH', 64),
  MAX_TYPE_EXPANSION_DEPTH: envInt('MAX_TYPE_EXPANSION_DEPTH', 32),
  MAX_PATH_RESOLUTION_DEPTH: envInt('MAX_PATH_RESOLUTION_DEPTH', 64),
  MAX_PATH_SEGMENTS: envInt('MAX_PATH_SEGMENTS', 100),

  // Parser limits
  MAX_ARRAY_INDEX: envInt('MAX_ARRAY_INDEX', 1_000_000),
  MAX_DIRECTIVES_PER_ASSIGNMENT: envInt('MAX_DIRECTIVES_PER_ASSIGNMENT', 100),
  MAX_STRING_LENGTH: envInt('MAX_STRING_LENGTH', 10_000_000),
  MAX_NESTING_DEPTH: envInt('MAX_NESTING_DEPTH', 64),

  // Transform limits
  MAX_RECORDS: envInt('MAX_RECORDS', 100_000),
  MAX_EXPRESSION_DEPTH: envInt('MAX_EXPRESSION_DEPTH', 32),
  MAX_STRING_REPEAT: envInt('MAX_STRING_REPEAT', 10_000),
  MAX_LOOP_NESTING: envInt('MAX_LOOP_NESTING', 10),

  // Memory limits
  MAX_BUFFER_SIZE: envInt('MAX_BUFFER_SIZE', 100_000_000),
  MAX_BINARY_CHUNK_SIZE: envInt('MAX_BINARY_CHUNK_SIZE', 65_536),

  // Streaming parser limits
  BUFFER_COMPACT_THRESHOLD: envInt('BUFFER_COMPACT_THRESHOLD', 65_536),
  MAX_STREAMING_BUFFER: envInt('MAX_STREAMING_BUFFER', 10_000_000),

  // Cache limits
  MAX_PATH_POOL_SIZE: envInt('MAX_PATH_POOL_SIZE', 10_000),
  CACHE_EVICTION_PERCENT: envFloat('CACHE_EVICTION_PERCENT', 0.1),

  // String operation limits
  MAX_LEVENSHTEIN_LENGTH: envInt('MAX_LEVENSHTEIN_LENGTH', 1_000),
  MAX_DISTINCT_KEY_LENGTH: envInt('MAX_DISTINCT_KEY_LENGTH', 10_000),

  // Regex limits
  MAX_REGEX_PATTERN_LENGTH: envInt('MAX_REGEX_PATTERN_LENGTH', 1_048_576),

  // Import/resolver limits
  MAX_TOTAL_IMPORTS: envInt('MAX_TOTAL_IMPORTS', 1_000),
  MAX_IMPORT_DEPTH: envInt('MAX_IMPORT_DEPTH', 32),

  // Schema/type limits
  MAX_TYPE_FIELDS: envInt('MAX_TYPE_FIELDS', 1_000),
  MAX_COMPOSITE_TYPES: envInt('MAX_COMPOSITE_TYPES', 16),

  // CSV/tabular limits
  MAX_CSV_COLUMNS: envInt('MAX_CSV_COLUMNS', 10_000),

  // Network limits
  FETCH_TIMEOUT_MS: envInt('FETCH_TIMEOUT_MS', 30_000),
};

/**
 * Helper to safely convert Uint8Array to base64 without stack overflow.
 */
export function uint8ArrayToBase64(data: Uint8Array): string {
  const chunkSize = SECURITY_LIMITS.MAX_BINARY_CHUNK_SIZE;
  let binary = '';
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, Math.min(i + chunkSize, data.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]!);
    }
  }
  return btoa(binary);
}

/**
 * Validates that a parsed integer is within safe bounds.
 */
export function validateArrayIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= SECURITY_LIMITS.MAX_ARRAY_INDEX;
}

/**
 * Validates that a number is safe for use (not NaN, Infinity, or too large).
 */
export function validateSafeNumber(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

/**
 * Checks if a string is a valid number before parsing.
 */
export function isValidNumberString(str: string): boolean {
  if (str.length === 0) return false;
  const trimmed = str.trim();
  if (trimmed === 'Infinity' || trimmed === '-Infinity' || trimmed === 'NaN') {
    return false;
  }
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed);
}

/**
 * Validates XML element/attribute names.
 */
export function isValidXmlName(name: string): boolean {
  if (name.length === 0) return false;
  return /^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(name);
}
