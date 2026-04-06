/**
 * ODIN XML Formatter - Format OdinDocument as XML.
 *
 * Converts the canonical ODIN representation to XML output.
 * Extracted from formatters.ts for single responsibility.
 *
 * Features:
 * - Preserves modifiers as XML attributes (odin:required, odin:confidential, odin:deprecated)
 * - Preserves type fidelity using `raw` values for currency/number
 * - Includes ODIN type information as odin:type attribute when relevant
 */

import type { OdinDocument } from '../../types/document.js';
import type { OdinValue } from '../../types/values.js';
import type { OdinTransform } from '../../types/transform.js';
import { odinValueToString, escapeXml } from './value-converters.js';
import { parsePath } from './json-formatter.js';
import { formatModifierAttributes } from '../../utils/format-utils.js';
import { isValidXmlName } from '../../utils/security-limits.js';

/**
 * Tree node for XML generation.
 */
interface XmlTreeNode {
  value?: OdinValue;
  path?: string;
  children: Map<string, XmlTreeNode>;
  isArray?: boolean;
}

/**
 * Format OdinDocument as XML.
 */
export function formatXmlFromOdin(doc: OdinDocument, transform: OdinTransform): string {
  const indent = transform.target.indent ?? 2;
  const declaration = transform.target.declaration !== false;
  const includeOdinNamespace = needsOdinNamespace(doc);

  let xml = '';
  if (declaration) {
    xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
  }

  // Build XML with type fidelity and modifiers
  xml += odinDocToXml(doc, indent, includeOdinNamespace);
  return xml;
}

/**
 * Check if document needs ODIN namespace (has typed values or modifiers).
 */
function needsOdinNamespace(doc: OdinDocument): boolean {
  // Check for modifiers
  for (const mods of doc.modifiers.values()) {
    if (mods.required || mods.confidential || mods.deprecated) {
      return true;
    }
  }

  // Check for non-string types (which need odin:type attribute)
  for (const path of doc.paths()) {
    if (path.startsWith('$.')) continue;
    const value = doc.get(path);
    if (value && value.type !== 'string' && value.type !== 'null') {
      return true;
    }
  }

  return false;
}

/**
 * Convert OdinDocument to XML with full type fidelity and modifier preservation.
 */
function odinDocToXml(doc: OdinDocument, indent: number, includeNamespace: boolean): string {
  // Build a tree structure from flat paths
  const tree = buildTreeFromPaths(doc);

  // Render the tree to XML
  return renderXmlTree(tree, doc, 0, indent, includeNamespace, true);
}

/**
 * Build a tree structure from the document's flat paths.
 */
function buildTreeFromPaths(doc: OdinDocument): XmlTreeNode {
  const root: XmlTreeNode = { children: new Map() };

  for (const path of doc.paths()) {
    // Skip metadata paths
    if (path.startsWith('$.')) continue;

    const value = doc.get(path);
    if (value === undefined) continue;

    const parts = parsePath(path);
    let node = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      const key = String(part);

      if (!node.children.has(key)) {
        node.children.set(key, { children: new Map() });
      }

      const childNode = node.children.get(key)!;

      // Mark as array if next part is numeric
      if (typeof parts[i + 1] === 'number') {
        childNode.isArray = true;
      }

      node = childNode;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart !== undefined) {
      const key = String(lastPart);
      if (!node.children.has(key)) {
        node.children.set(key, { children: new Map() });
      }
      const leafNode = node.children.get(key)!;
      leafNode.value = value;
      leafNode.path = path;
    }
  }

  return root;
}

/**
 * Check if a value has the :attr modifier (should be emitted as XML attribute).
 */
function hasAttrModifier(value: OdinValue | undefined): boolean {
  return value?.modifiers?.attr === true;
}

/**
 * Collect children marked with :attr modifier as XML attributes.
 * Returns the attribute string and a set of keys that should be skipped.
 */
function collectAttrChildren(
  node: XmlTreeNode,
  _doc: OdinDocument
): { attrString: string; skipKeys: Set<string> } {
  const attrs: string[] = [];
  const skipKeys = new Set<string>();

  for (const [key, child] of node.children) {
    if (child.value && hasAttrModifier(child.value)) {
      const valueStr = odinValueToXmlString(child.value);
      attrs.push(`${key}="${escapeXml(valueStr)}"`);
      skipKeys.add(key);
    }
  }

  return {
    attrString: attrs.length > 0 ? ' ' + attrs.join(' ') : '',
    skipKeys,
  };
}

/**
 * Sanitize a key to be a valid XML element name.
 * If the key is already valid, return as-is.
 * Otherwise, replace invalid characters with underscores and ensure valid start.
 */
function sanitizeXmlName(key: string): string {
  if (isValidXmlName(key)) {
    return key;
  }
  // Replace invalid characters with underscores
  let sanitized = key.replace(/[^a-zA-Z0-9_.-]/g, '_');
  // Ensure it starts with a letter or underscore
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }
  return sanitized || '_element';
}

/**
 * Render a tree node to XML.
 */
function renderXmlTree(
  node: XmlTreeNode,
  doc: OdinDocument,
  depth: number,
  indent: number,
  includeNamespace: boolean,
  isRoot: boolean
): string {
  const parts: string[] = [];
  const pad = ' '.repeat(depth * indent);

  for (const [rawKey, child] of node.children) {
    // Skip numeric keys (array indices) at this level - they're handled by parent
    if (/^\d+$/.test(rawKey) && !isRoot) continue;

    // Sanitize key to valid XML element name
    const key = sanitizeXmlName(rawKey);

    if (child.children.size > 0 && !child.value) {
      // Container element
      let attrs = isRoot && includeNamespace ? ' xmlns:odin="https://odin.foundation/ns"' : '';

      // Collect :attr children for this container
      const { attrString, skipKeys } = collectAttrChildren(child, doc);
      attrs += attrString;

      // Check if children are array items (numeric keys)
      const childKeys = Array.from(child.children.keys());
      const isArrayContainer = childKeys.every((k) => /^\d+$/.test(k));

      if (isArrayContainer) {
        // Render array items
        for (const [, arrayItem] of child.children) {
          // Collect :attr children for array item
          const { attrString: itemAttrStr, skipKeys: itemSkipKeys } = collectAttrChildren(
            arrayItem,
            doc
          );
          const itemAttrs = buildXmlAttributes(arrayItem.path, arrayItem.value, doc) + itemAttrStr;

          if (arrayItem.value) {
            const valueStr = odinValueToXmlString(arrayItem.value);
            parts.push(`${pad}<${key}${itemAttrs}>${escapeXml(valueStr)}</${key}>\n`);
          } else {
            parts.push(`${pad}<${key}${itemAttrs}>\n`);
            parts.push(
              renderXmlTreeFiltered(arrayItem, doc, depth + 1, indent, false, false, itemSkipKeys)
            );
            parts.push(`${pad}</${key}>\n`);
          }
        }
      } else {
        // Regular container - skip :attr children when rendering
        parts.push(`${pad}<${key}${attrs}>\n`);
        parts.push(renderXmlTreeFiltered(child, doc, depth + 1, indent, false, false, skipKeys));
        parts.push(`${pad}</${key}>\n`);
      }
    } else if (child.value) {
      // Leaf element with value - skip if it has :attr (already handled by parent)
      if (hasAttrModifier(child.value)) continue;

      const attrs = buildXmlAttributes(child.path, child.value, doc);
      const valueStr = odinValueToXmlString(child.value);

      if (child.children.size > 0) {
        // Has both value and children (complex type) - rare case
        parts.push(`${pad}<${key}${attrs}>\n`);
        parts.push(`${pad}${' '.repeat(indent)}${escapeXml(valueStr)}\n`);
        parts.push(renderXmlTree(child, doc, depth + 1, indent, false, false));
        parts.push(`${pad}</${key}>\n`);
      } else {
        parts.push(`${pad}<${key}${attrs}>${escapeXml(valueStr)}</${key}>\n`);
      }
    }
  }

  return parts.join('');
}

/**
 * Render a tree node to XML, skipping specified keys.
 */
function renderXmlTreeFiltered(
  node: XmlTreeNode,
  doc: OdinDocument,
  depth: number,
  indent: number,
  includeNamespace: boolean,
  isRoot: boolean,
  skipKeys: Set<string>
): string {
  const parts: string[] = [];
  const pad = ' '.repeat(depth * indent);

  for (const [rawKey, child] of node.children) {
    // Skip specified keys (already emitted as attributes)
    if (skipKeys.has(rawKey)) continue;

    // Skip numeric keys (array indices) at this level - they're handled by parent
    if (/^\d+$/.test(rawKey) && !isRoot) continue;

    // Sanitize key to valid XML element name
    const key = sanitizeXmlName(rawKey);

    if (child.children.size > 0 && !child.value) {
      // Container element
      let attrs = isRoot && includeNamespace ? ' xmlns:odin="https://odin.foundation/ns"' : '';

      // Collect :attr children for this container
      const { attrString, skipKeys: childSkipKeys } = collectAttrChildren(child, doc);
      attrs += attrString;

      // Check if children are array items (numeric keys)
      const childKeys = Array.from(child.children.keys());
      const isArrayContainer = childKeys.every((k) => /^\d+$/.test(k));

      if (isArrayContainer) {
        // Render array items
        for (const [, arrayItem] of child.children) {
          const { attrString: itemAttrStr, skipKeys: itemSkipKeys } = collectAttrChildren(
            arrayItem,
            doc
          );
          const itemAttrs = buildXmlAttributes(arrayItem.path, arrayItem.value, doc) + itemAttrStr;

          if (arrayItem.value) {
            const valueStr = odinValueToXmlString(arrayItem.value);
            parts.push(`${pad}<${key}${itemAttrs}>${escapeXml(valueStr)}</${key}>\n`);
          } else {
            parts.push(`${pad}<${key}${itemAttrs}>\n`);
            parts.push(
              renderXmlTreeFiltered(arrayItem, doc, depth + 1, indent, false, false, itemSkipKeys)
            );
            parts.push(`${pad}</${key}>\n`);
          }
        }
      } else {
        // Regular container
        parts.push(`${pad}<${key}${attrs}>\n`);
        parts.push(
          renderXmlTreeFiltered(child, doc, depth + 1, indent, false, false, childSkipKeys)
        );
        parts.push(`${pad}</${key}>\n`);
      }
    } else if (child.value) {
      const attrs = buildXmlAttributes(child.path, child.value, doc);
      const valueStr = odinValueToXmlString(child.value);

      if (child.children.size > 0) {
        parts.push(`${pad}<${key}${attrs}>\n`);
        parts.push(`${pad}${' '.repeat(indent)}${escapeXml(valueStr)}\n`);
        parts.push(renderXmlTreeFiltered(child, doc, depth + 1, indent, false, false, new Set()));
        parts.push(`${pad}</${key}>\n`);
      } else {
        parts.push(`${pad}<${key}${attrs}>${escapeXml(valueStr)}</${key}>\n`);
      }
    }
  }

  return parts.join('');
}

/**
 * Build XML attributes string for a path, including type and modifiers.
 */
function buildXmlAttributes(
  path: string | undefined,
  value: OdinValue | undefined,
  doc: OdinDocument
): string {
  const attrs: string[] = [];

  // Add type attribute (skip for string as it's the default)
  if (value && value.type !== 'string') {
    attrs.push(`odin:type="${value.type}"`);
  }

  // Add currency code attribute for currency values
  if (value && value.type === 'currency' && 'currencyCode' in value && value.currencyCode) {
    attrs.push(`odin:currencyCode="${value.currencyCode}"`);
  }

  // Add modifier attributes
  if (path) {
    const modifiers = doc.modifiers.get(path);
    attrs.push(...formatModifierAttributes(modifiers));
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

/**
 * Convert an OdinValue to an XML string value with precision preservation.
 */
function odinValueToXmlString(value: OdinValue): string {
  return odinValueToString(value, { preservePrecision: true });
}
