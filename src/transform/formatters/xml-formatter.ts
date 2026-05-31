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
  const emitTypeHints = transform.target.emitTypeHints !== false;
  const includeOdinNamespace = emitTypeHints && needsOdinNamespace(doc);
  const namespaces = transform.target.namespaces;

  let xml = '';
  if (declaration) {
    xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
  }

  // Build XML with type fidelity and modifiers
  xml += odinDocToXml(doc, indent, includeOdinNamespace, emitTypeHints, namespaces);
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
function odinDocToXml(
  doc: OdinDocument,
  indent: number,
  includeNamespace: boolean,
  emitTypeHints: boolean,
  namespaces: Map<string, string> | undefined
): string {
  // Build a tree structure from flat paths
  const tree = buildTreeFromPaths(doc);

  // Render the tree to XML
  return renderXmlTree(tree, doc, 0, indent, includeNamespace, true, emitTypeHints, namespaces);
}

/**
 * Build xmlns:<prefix> declarations for target namespaces in insertion order.
 */
function buildNamespaceDeclarations(namespaces: Map<string, string> | undefined): string {
  if (!namespaces || namespaces.size === 0) return '';
  const decls: string[] = [];
  for (const [prefix, uri] of namespaces) {
    decls.push(`xmlns:${prefix}="${escapeXml(uri)}"`);
  }
  return ' ' + decls.join(' ');
}

/**
 * Qualify an element name with its namespace prefix when the value carries :ns.
 */
function nsQualify(key: string, value: OdinValue | undefined): string {
  const prefix = value?.modifiers?.ns;
  return prefix ? `${prefix}:${key}` : key;
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
 * Render element text content, wrapping in a CDATA section when :cdata is set.
 */
function renderXmlText(value: OdinValue | undefined, valueStr: string): string {
  if (value?.modifiers?.cdata === true) {
    // Split any embedded CDATA terminator so the section stays well-formed.
    return `<![CDATA[${valueStr.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
  }
  return escapeXml(valueStr);
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
 * Root-element attributes: the odin namespace (when type hints are emitted) plus
 * any declared target namespaces. Empty for non-root elements.
 */
function buildRootAttributes(
  isRoot: boolean,
  includeNamespace: boolean,
  namespaces: Map<string, string> | undefined
): string {
  if (!isRoot) return '';
  const odinNs = includeNamespace ? ' xmlns:odin="https://odin.foundation/ns"' : '';
  return odinNs + buildNamespaceDeclarations(namespaces);
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
  isRoot: boolean,
  emitTypeHints: boolean,
  namespaces: Map<string, string> | undefined
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
      let attrs = buildRootAttributes(isRoot, includeNamespace, namespaces);

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
          const itemAttrs =
            buildXmlAttributes(arrayItem.path, arrayItem.value, doc, emitTypeHints) + itemAttrStr;
          const itemTag = nsQualify(key, arrayItem.value);

          if (arrayItem.value) {
            const valueStr = odinValueToXmlString(arrayItem.value);
            parts.push(`${pad}<${itemTag}${itemAttrs}>${renderXmlText(arrayItem.value, valueStr)}</${itemTag}>\n`);
          } else {
            parts.push(`${pad}<${itemTag}${itemAttrs}>\n`);
            parts.push(
              renderXmlTreeFiltered(
                arrayItem,
                doc,
                depth + 1,
                indent,
                false,
                false,
                itemSkipKeys,
                emitTypeHints,
                namespaces
              )
            );
            parts.push(`${pad}</${itemTag}>\n`);
          }
        }
      } else {
        // Regular container - skip :attr children when rendering
        parts.push(`${pad}<${key}${attrs}>\n`);
        parts.push(
          renderXmlTreeFiltered(child, doc, depth + 1, indent, false, false, skipKeys, emitTypeHints, namespaces)
        );
        parts.push(`${pad}</${key}>\n`);
      }
    } else if (child.value) {
      // Leaf element with value - skip if it has :attr (already handled by parent)
      if (hasAttrModifier(child.value)) continue;

      const attrs = buildXmlAttributes(child.path, child.value, doc, emitTypeHints);
      const valueStr = odinValueToXmlString(child.value);
      const tag = nsQualify(key, child.value);

      if (child.children.size > 0) {
        // Has both value and children (complex type) - rare case
        parts.push(`${pad}<${tag}${attrs}>\n`);
        parts.push(`${pad}${' '.repeat(indent)}${renderXmlText(child.value, valueStr)}\n`);
        parts.push(
          renderXmlTree(child, doc, depth + 1, indent, false, false, emitTypeHints, namespaces)
        );
        parts.push(`${pad}</${tag}>\n`);
      } else {
        parts.push(`${pad}<${tag}${attrs}>${renderXmlText(child.value, valueStr)}</${tag}>\n`);
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
  skipKeys: Set<string>,
  emitTypeHints: boolean,
  namespaces: Map<string, string> | undefined
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
      let attrs = buildRootAttributes(isRoot, includeNamespace, namespaces);

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
          const itemAttrs =
            buildXmlAttributes(arrayItem.path, arrayItem.value, doc, emitTypeHints) + itemAttrStr;
          const itemTag = nsQualify(key, arrayItem.value);

          if (arrayItem.value) {
            const valueStr = odinValueToXmlString(arrayItem.value);
            parts.push(`${pad}<${itemTag}${itemAttrs}>${renderXmlText(arrayItem.value, valueStr)}</${itemTag}>\n`);
          } else {
            parts.push(`${pad}<${itemTag}${itemAttrs}>\n`);
            parts.push(
              renderXmlTreeFiltered(
                arrayItem,
                doc,
                depth + 1,
                indent,
                false,
                false,
                itemSkipKeys,
                emitTypeHints,
                namespaces
              )
            );
            parts.push(`${pad}</${itemTag}>\n`);
          }
        }
      } else {
        // Regular container
        parts.push(`${pad}<${key}${attrs}>\n`);
        parts.push(
          renderXmlTreeFiltered(
            child,
            doc,
            depth + 1,
            indent,
            false,
            false,
            childSkipKeys,
            emitTypeHints,
            namespaces
          )
        );
        parts.push(`${pad}</${key}>\n`);
      }
    } else if (child.value) {
      const attrs = buildXmlAttributes(child.path, child.value, doc, emitTypeHints);
      const valueStr = odinValueToXmlString(child.value);
      const tag = nsQualify(key, child.value);

      if (child.children.size > 0) {
        parts.push(`${pad}<${tag}${attrs}>\n`);
        parts.push(`${pad}${' '.repeat(indent)}${renderXmlText(child.value, valueStr)}\n`);
        parts.push(
          renderXmlTreeFiltered(child, doc, depth + 1, indent, false, false, new Set(), emitTypeHints, namespaces)
        );
        parts.push(`${pad}</${tag}>\n`);
      } else {
        parts.push(`${pad}<${tag}${attrs}>${renderXmlText(child.value, valueStr)}</${tag}>\n`);
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
  doc: OdinDocument,
  emitTypeHints: boolean
): string {
  // emitTypeHints=false produces plain XML with no odin: attributes
  if (!emitTypeHints) return '';

  const attrs: string[] = [];

  // Currency is first-class: always odin:type="currency"; emit currencyCode when present.
  // Decimal scale is preserved by the value renderer (toFixed/raw).
  if (value && value.type === 'currency') {
    attrs.push(`odin:type="currency"`);
    const code = 'currencyCode' in value && value.currencyCode ? value.currencyCode : undefined;
    if (code) {
      attrs.push(`odin:currencyCode="${code}"`);
    }
  } else if (value && value.type !== 'string') {
    // Type attribute (string is the default and omitted)
    attrs.push(`odin:type="${value.type}"`);
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
