/**
 * ODIN Transform Flat Parser
 *
 * Parse flat key=value format to nested object.
 *
 * Format:
 * ```
 * header.runDate=2024-12-15
 * employees[0].id=1234
 * employees[0].name=John Smith
 * employees[1].id=5678
 * employees[1].name=Jane Doe
 * ```
 *
 * Features:
 * - Dot notation for nesting
 * - Bracket notation for arrays
 * - Comment lines (# or ;)
 * - Empty line handling
 * - Value type inference
 */

/**
 * Parse flat key=value format to nested object.
 */
export function parseFlat(input: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = input.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    // Find first equals sign (not inside brackets)
    const eqIndex = findEqualsSign(trimmed);
    if (eqIndex === -1) continue;

    const path = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (!path) continue;

    // Set value at path
    setValueAtPath(result, path, inferFlatValue(value));
  }

  return result;
}

/**
 * Find the first equals sign that's not inside brackets.
 */
function findEqualsSign(line: string): number {
  let bracketDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '[') bracketDepth++;
    else if (char === ']') bracketDepth--;
    else if (char === '=' && bracketDepth === 0) return i;
  }

  return -1;
}

/**
 * Set a value at a dot/bracket path in an object.
 */
function setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = parseFlatPath(path);
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const nextPart = parts[i + 1]!;

    if (typeof part === 'number') {
      // Current is array index
      const arr = current as unknown as unknown[];
      if (arr[part] === undefined) {
        arr[part] = typeof nextPart === 'number' ? [] : {};
      }
      current = arr[part] as Record<string, unknown>;
    } else {
      // Current is object key
      if (current[part] === undefined) {
        current[part] = typeof nextPart === 'number' ? [] : {};
      }
      current = current[part] as Record<string, unknown>;
    }
  }

  const lastPart = parts[parts.length - 1]!;
  if (typeof lastPart === 'number') {
    (current as unknown as unknown[])[lastPart] = value;
  } else {
    current[lastPart] = value;
  }
}

/**
 * Parse a flat path into segments.
 * Handles: foo.bar, foo[0], foo[0].bar, foo.bar[0].baz
 */
function parseFlatPath(path: string): (string | number)[] {
  const parts: (string | number)[] = [];
  let current = '';

  for (let i = 0; i < path.length; i++) {
    const char = path[i]!;

    if (char === '.') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else if (char === '[') {
      if (current) {
        parts.push(current);
        current = '';
      }
      // Read array index
      i++;
      let indexStr = '';
      while (i < path.length && path[i] !== ']') {
        indexStr += path[i];
        i++;
      }
      parts.push(parseInt(indexStr, 10));
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Infer value type from flat format string.
 */
function inferFlatValue(value: string): unknown {
  // Empty string -> null
  if (value === '') return null;

  // Explicit null
  if (value === '~' || value.toLowerCase() === 'null') return null;

  // Boolean
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  // Quoted string - remove quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Integer
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  // Number (float)
  if (/^-?\d*\.\d+$/.test(value)) {
    return parseFloat(value);
  }

  // ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value; // Keep as string, engine can convert
  }

  // ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return value;
  }

  // Return as string
  return value;
}
