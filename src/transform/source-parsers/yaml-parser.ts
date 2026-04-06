/**
 * ODIN Transform YAML Parser
 *
 * Parse YAML string to JavaScript object.
 *
 * Supports:
 * - Key-value pairs
 * - Nested objects via indentation
 * - Arrays with - prefix
 * - Basic types (strings, numbers, booleans, null)
 * - Comments (# prefix)
 * - Quoted strings
 */

/**
 * Parse YAML string to JavaScript object.
 */
export function parseYaml(input: string): Record<string, unknown> {
  const lines = input.split(/\r?\n/);
  const result: Record<string, unknown> = {};

  interface StackEntry {
    indent: number;
    obj: Record<string, unknown> | unknown[];
    key?: string;
    isArray?: boolean;
    currentArrayItem?: Record<string, unknown>;
    arrayItemIndent?: number;
  }

  const stack: StackEntry[] = [{ indent: -1, obj: result }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Calculate indentation
    const indent = line.search(/\S/);
    if (indent === -1) continue;

    // Pop stack to find correct parent based on indentation
    while (stack.length > 1) {
      const top = stack[stack.length - 1]!;
      // Keep array items active while we're at their indentation level
      if (top.currentArrayItem && indent > top.arrayItemIndent!) {
        break;
      }
      if (top.indent >= indent) {
        stack.pop();
      } else {
        break;
      }
    }

    const parent = stack[stack.length - 1]!;

    // Handle array items (- prefix)
    if (trimmed.startsWith('- ')) {
      const content = trimmed.slice(2);

      // Find the array to add to
      let targetArray: unknown[] | undefined;
      if (Array.isArray(parent.obj)) {
        targetArray = parent.obj;
      } else if (parent.key && Array.isArray((parent.obj as Record<string, unknown>)[parent.key])) {
        targetArray = (parent.obj as Record<string, unknown>)[parent.key] as unknown[];
      }

      if (targetArray) {
        // Check if this is a simple value or object start
        const colonIndex = content.indexOf(':');
        if (colonIndex !== -1 && !isValueWithColon(content)) {
          // Object in array (e.g., "- name: auth")
          const key = content.slice(0, colonIndex).trim();
          const value = content.slice(colonIndex + 1).trim();
          const item: Record<string, unknown> = {};

          item[key] = value ? parseYamlValue(value) : {};
          targetArray.push(item);

          // Push this item onto stack for subsequent properties
          stack.push({
            indent: indent,
            obj: item,
            currentArrayItem: item,
            arrayItemIndent: indent,
          });
        } else {
          // Simple array value
          targetArray.push(parseYamlValue(content));
        }
      }
      continue;
    }

    // Handle key: value pairs
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      const key = trimmed.slice(0, colonIndex).trim();
      const valueStr = trimmed.slice(colonIndex + 1).trim();

      // Determine target object
      let targetObj: Record<string, unknown>;
      if (parent.currentArrayItem) {
        targetObj = parent.currentArrayItem;
      } else if (Array.isArray(parent.obj)) {
        continue; // Skip, can't add key to array directly
      } else {
        targetObj = parent.obj as Record<string, unknown>;
      }

      if (valueStr === '' || valueStr === '|' || valueStr === '>') {
        // Check if next line starts array or is indented content
        const nextLine = lines[i + 1];
        const nextTrimmed = nextLine?.trim() ?? '';
        const nextIndent = nextLine?.search(/\S/) ?? -1;

        if (nextTrimmed.startsWith('-') && nextIndent > indent) {
          // This key is an array
          targetObj[key] = [];
          stack.push({ indent, obj: targetObj, key, isArray: true });
        } else if (nextIndent > indent) {
          // This key is a nested object
          targetObj[key] = {};
          stack.push({ indent, obj: targetObj[key] as Record<string, unknown> });
        }
      } else {
        // Simple key: value
        targetObj[key] = parseYamlValue(valueStr);
      }
    }
  }

  return result;
}

/**
 * Check if a string is a value that happens to contain a colon (e.g., URL, time)
 */
function isValueWithColon(str: string): boolean {
  // Check for quoted strings
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return true;
  }
  // Check for URLs
  if (str.includes('://')) {
    return true;
  }
  // Check for time formats (HH:MM)
  if (/^\d{1,2}:\d{2}/.test(str)) {
    return true;
  }
  return false;
}

/**
 * Parse a YAML value string to its appropriate type.
 */
function parseYamlValue(str: string): unknown {
  // Handle null
  if (str === 'null' || str === '~' || str === '') {
    return null;
  }

  // Handle booleans
  if (str === 'true' || str === 'yes' || str === 'on') return true;
  if (str === 'false' || str === 'no' || str === 'off') return false;

  // Handle quoted strings
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }

  // Handle numbers
  if (/^-?\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  if (/^-?\d*\.\d+$/.test(str)) {
    return parseFloat(str);
  }

  // Default to string
  return str;
}
