/**
 * ODIN Flat Formatter - Format OdinDocument as flat output.
 *
 * Supports multiple styles:
 * - 'kvp' (default): Simple key=value pairs with dot notation
 * - 'yaml': YAML format with indentation
 *
 * Extracted from formatters.ts for single responsibility.
 */

import type { OdinDocument } from '../../types/document.js';
import type { OdinValue } from '../../types/values.js';
import type { OdinTransform } from '../../types/transform.js';
import { escapeFlat, needsQuoting, yamlValue } from './value-converters.js';

/**
 * Format OdinDocument as flat output.
 */
export function formatFlatFromOdin(doc: OdinDocument, transform: OdinTransform): string {
  const style = transform.target.style ?? 'kvp';
  const lineEnding = transform.target.lineEnding ?? '\n';

  switch (style) {
    case 'yaml':
      return formatFlatYaml(doc, lineEnding);
    case 'kvp':
    default:
      return formatFlatKvp(doc, lineEnding);
  }
}

/**
 * Format as simple key=value pairs with dot notation.
 */
function formatFlatKvp(doc: OdinDocument, lineEnding: string): string {
  const lines: string[] = [];

  const paths = Array.from(doc.paths())
    .filter((p) => !p.startsWith('$.'))
    .sort();

  for (const path of paths) {
    const value = doc.get(path);
    if (value === undefined) continue;
    if (value.type === 'null') continue;

    const stringValue = odinValueToFlatString(value);
    if (stringValue === null) continue;

    lines.push(`${path}=${stringValue}`);
  }

  return lines.join(lineEnding);
}

/**
 * Format as YAML with indentation.
 */
function formatFlatYaml(doc: OdinDocument, lineEnding: string): string {
  const paths = Array.from(doc.paths())
    .filter((p) => !p.startsWith('$.'))
    .sort();

  // Build a tree structure from paths
  interface YamlNode {
    value?: string;
    children: Map<string, YamlNode>;
    isArrayItem?: boolean;
  }

  const root: YamlNode = { children: new Map() };

  for (const path of paths) {
    const value = doc.get(path);
    if (value === undefined) continue;
    if (value.type === 'null') continue;

    const stringValue = odinValueToFlatString(value);
    if (stringValue === null) continue;

    // Parse path into segments
    const segments: Array<{ name: string; isArrayIndex: boolean }> = [];
    let current = '';
    let i = 0;

    while (i < path.length) {
      const char = path[i]!;
      if (char === '.') {
        if (current) {
          segments.push({ name: current, isArrayIndex: false });
          current = '';
        }
        i++;
      } else if (char === '[') {
        if (current) {
          segments.push({ name: current, isArrayIndex: false });
          current = '';
        }
        i++;
        let indexStr = '';
        while (i < path.length && path[i] !== ']') {
          indexStr += path[i];
          i++;
        }
        segments.push({ name: indexStr, isArrayIndex: true });
        i++; // skip ']'
      } else {
        current += char;
        i++;
      }
    }
    if (current) {
      segments.push({ name: current, isArrayIndex: false });
    }

    // Build tree
    let node = root;
    for (let j = 0; j < segments.length - 1; j++) {
      const seg = segments[j]!;
      if (!node.children.has(seg.name)) {
        node.children.set(seg.name, { children: new Map(), isArrayItem: seg.isArrayIndex });
      }
      node = node.children.get(seg.name)!;
    }

    const lastSeg = segments[segments.length - 1]!;
    if (!node.children.has(lastSeg.name)) {
      node.children.set(lastSeg.name, { children: new Map(), isArrayItem: lastSeg.isArrayIndex });
    }
    const leafNode = node.children.get(lastSeg.name)!;
    leafNode.value = stringValue;
  }

  // Render tree to YAML
  const lines: string[] = [];

  function renderNode(node: YamlNode, indent: number, isArrayContext: boolean): void {
    const pad = '  '.repeat(indent);

    // Sort children, but keep array indices in numeric order
    const sortedChildren = Array.from(node.children.entries()).sort((a, b) => {
      const aIsNum = /^\d+$/.test(a[0]);
      const bIsNum = /^\d+$/.test(b[0]);
      if (aIsNum && bIsNum) return parseInt(a[0]) - parseInt(b[0]);
      return a[0].localeCompare(b[0]);
    });

    for (const [key, child] of sortedChildren) {
      const isArrayItem = child.isArrayItem;

      if (child.value !== undefined && child.children.size === 0) {
        // Leaf node
        if (isArrayItem && isArrayContext) {
          lines.push(`${pad}- ${key}: ${yamlValue(child.value)}`);
        } else if (isArrayItem) {
          lines.push(`${pad}  ${key}: ${yamlValue(child.value)}`);
        } else {
          lines.push(`${pad}${key}: ${yamlValue(child.value)}`);
        }
      } else if (child.children.size > 0) {
        // Container node
        const firstChildKey = Array.from(child.children.keys())[0];
        const childrenAreArrayItems = firstChildKey !== undefined && /^\d+$/.test(firstChildKey);

        if (isArrayItem) {
          // Array element with nested properties
          const childEntries = Array.from(child.children.entries()).sort((a, b) => {
            const aIsNum = /^\d+$/.test(a[0]);
            const bIsNum = /^\d+$/.test(b[0]);
            if (aIsNum && bIsNum) return parseInt(a[0]) - parseInt(b[0]);
            return a[0].localeCompare(b[0]);
          });

          let first = true;
          for (const [childKey, childNode] of childEntries) {
            if (first) {
              if (childNode.value !== undefined) {
                lines.push(`${pad}- ${childKey}: ${yamlValue(childNode.value)}`);
              } else {
                lines.push(`${pad}- ${childKey}:`);
                renderNode(childNode, indent + 2, false);
              }
              first = false;
            } else {
              if (childNode.value !== undefined) {
                lines.push(`${pad}  ${childKey}: ${yamlValue(childNode.value)}`);
              } else {
                lines.push(`${pad}  ${childKey}:`);
                renderNode(childNode, indent + 2, false);
              }
            }
          }
        } else {
          lines.push(`${pad}${key}:`);
          if (childrenAreArrayItems) {
            renderNode(child, indent + 1, true);
          } else {
            renderNode(child, indent + 1, false);
          }
        }
      }
    }
  }

  renderNode(root, 0, false);
  return lines.join(lineEnding);
}

/**
 * Convert an OdinValue to a flat string value (without ODIN type prefixes).
 * Returns null for complex types that can't be represented in flat format.
 */
function odinValueToFlatString(value: OdinValue): string | null {
  switch (value.type) {
    case 'null':
      return null;
    case 'boolean':
      return String(value.value);
    case 'string':
      // Quote strings that contain special characters
      if (needsQuoting(value.value)) {
        return `"${escapeFlat(value.value)}"`;
      }
      return value.value;
    case 'integer':
      return String(value.value);
    case 'number':
      // Use raw string if available to preserve precision
      return value.raw !== undefined ? value.raw : String(value.value);
    case 'currency':
      // Use raw string if available to preserve precision
      return value.raw !== undefined ? value.raw : String(value.value);
    case 'percent':
      // Use raw string if available to preserve precision
      return value.raw !== undefined ? value.raw : String(value.value);
    case 'date':
      return value.raw;
    case 'timestamp':
      return value.raw;
    case 'time':
      return value.value;
    case 'duration':
      return value.value;
    case 'reference':
      // References are typically internal - output as path
      return value.path;
    case 'binary':
      // Skip binary in flat format (can't be represented as text)
      return null;
    case 'array':
      // Arrays are handled by path enumeration, skip here
      return null;
    case 'object':
      // Objects are handled by path enumeration, skip here
      return null;
    case 'verb':
      // Skip verbs in flat format
      return null;
    default:
      return null;
  }
}
