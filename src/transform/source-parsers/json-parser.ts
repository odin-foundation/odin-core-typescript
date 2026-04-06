/**
 * ODIN Transform JSON Parser
 *
 * Handles parsing of JSON source format into JavaScript objects.
 */

/**
 * Parse JSON string to JavaScript object.
 * Handles standard JSON with proper error reporting.
 */
export function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON parse error: ${message}`);
  }
}
