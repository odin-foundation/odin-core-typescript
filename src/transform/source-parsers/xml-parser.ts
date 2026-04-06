/**
 * ODIN Transform XML Parser
 *
 * Converts XML elements to nested objects with support for:
 * - Element names become object keys
 * - Text content becomes string values
 * - Attributes accessible via @attributeName
 * - Repeated elements become arrays
 * - Mixed content preserves text in #text property
 */

import type { SourceParserOptions } from './types.js';
import { SECURITY_LIMITS } from '../../utils/security-limits.js';

interface XmlNode {
  tag: string;
  attributes: Map<string, string>;
  children: XmlNode[];
  text: string;
  selfClosing?: boolean;
}

interface ParseResult {
  node: XmlNode | null;
  endPos: number;
}

/**
 * Parse XML string to JavaScript object.
 */
export function parseXml(input: string, options?: SourceParserOptions): Record<string, unknown> {
  const namespaces = options?.namespaces ?? new Map<string, string>();

  // Simple XML parser (no external dependencies)
  const result = xmlToObject(input.trim(), namespaces);
  return result;
}

/**
 * Parse XML string into object structure.
 */
function xmlToObject(xml: string, namespaces: Map<string, string>): Record<string, unknown> {
  // Skip XML declaration if present
  let content = xml;
  if (content.startsWith('<?xml')) {
    const declEnd = content.indexOf('?>');
    if (declEnd !== -1) {
      content = content.slice(declEnd + 2).trim();
    }
  }

  // Parse root element
  const root = parseXmlElement(content, 0, namespaces);
  if (!root.node) {
    return {};
  }

  // Convert to object with root element as wrapper
  return { [root.node.tag]: xmlNodeToObject(root.node) };
}

/**
 * Parse a single XML element starting at given position.
 */
function parseXmlElement(
  xml: string,
  startPos: number,
  namespaces: Map<string, string>,
  depth: number = 0
): ParseResult {
  // Security: Check recursion depth to prevent stack overflow attacks
  if (depth > SECURITY_LIMITS.MAX_RECURSION_DEPTH) {
    throw new Error(
      `XML nesting depth ${depth} exceeds maximum allowed depth of ${SECURITY_LIMITS.MAX_RECURSION_DEPTH}`
    );
  }

  let pos = startPos;

  // Skip whitespace
  while (pos < xml.length && /\s/.test(xml[pos]!)) pos++;

  // Check for element start
  if (xml[pos] !== '<') {
    return { node: null, endPos: pos };
  }

  // Skip comments and CDATA
  if (xml.slice(pos, pos + 4) === '<!--') {
    const endComment = xml.indexOf('-->', pos);
    return { node: null, endPos: endComment === -1 ? xml.length : endComment + 3 };
  }

  if (xml.slice(pos, pos + 9) === '<![CDATA[') {
    const endCdata = xml.indexOf(']]>', pos);
    const cdataContent = xml.slice(pos + 9, endCdata === -1 ? xml.length : endCdata);
    // Return as text node
    return {
      node: { tag: '#cdata', attributes: new Map(), children: [], text: cdataContent },
      endPos: endCdata === -1 ? xml.length : endCdata + 3,
    };
  }

  // Parse opening tag
  pos++; // Skip '<'

  // Check for closing tag (shouldn't happen at start)
  if (xml[pos] === '/') {
    return { node: null, endPos: pos };
  }

  // Read tag name
  let tagName = '';
  while (pos < xml.length && /[a-zA-Z0-9_:\-.]/.test(xml[pos]!)) {
    tagName += xml[pos];
    pos++;
  }

  if (!tagName) {
    return { node: null, endPos: pos };
  }

  // Apply namespace prefix mapping
  const resolvedTag = resolveNamespace(tagName, namespaces);

  // Parse attributes
  const attributes = new Map<string, string>();
  while (pos < xml.length) {
    // Skip whitespace
    while (pos < xml.length && /\s/.test(xml[pos]!)) pos++;

    // Check for end of opening tag
    if (xml[pos] === '>' || xml[pos] === '/') break;

    // Read attribute name
    let attrName = '';
    while (pos < xml.length && /[a-zA-Z0-9_:\-.]/.test(xml[pos]!)) {
      attrName += xml[pos];
      pos++;
    }

    if (!attrName) break;

    // Skip whitespace and equals
    while (pos < xml.length && /\s/.test(xml[pos]!)) pos++;
    if (xml[pos] === '=') pos++;
    while (pos < xml.length && /\s/.test(xml[pos]!)) pos++;

    // Read attribute value
    const quoteChar = xml[pos];
    if (quoteChar !== '"' && quoteChar !== "'") break;
    pos++; // Skip opening quote

    let attrValue = '';
    while (pos < xml.length && xml[pos] !== quoteChar) {
      attrValue += xml[pos];
      pos++;
    }
    pos++; // Skip closing quote

    // Decode XML entities in attribute value
    attributes.set(attrName, decodeXmlEntities(attrValue));
  }

  // Check for self-closing tag
  if (xml[pos] === '/') {
    pos++; // Skip '/'
    if (xml[pos] === '>') pos++; // Skip '>'
    // Check for xsi:nil="true" which indicates null value
    const xsiNil = attributes.get('xsi:nil') || attributes.get('nil') || attributes.get('nillable');
    const isNil = xsiNil === 'true' || xsiNil === '1';
    return {
      node: {
        tag: resolvedTag,
        attributes: isNil ? new Map() : attributes, // Strip attributes for nil elements
        children: [],
        text: '',
        selfClosing: true,
      },
      endPos: pos,
    };
  }

  // Skip '>'
  if (xml[pos] === '>') pos++;

  // Parse children and text content
  const children: XmlNode[] = [];
  let textContent = '';

  while (pos < xml.length) {
    // Skip whitespace between elements (but preserve significant whitespace)
    const wsStart = pos;
    while (pos < xml.length && /\s/.test(xml[pos]!)) pos++;

    // Check for closing tag
    if (xml.slice(pos, pos + 2) === '</') {
      // Find end of closing tag
      const closeEnd = xml.indexOf('>', pos);
      if (closeEnd !== -1) {
        pos = closeEnd + 1;
      }
      break;
    }

    // Check for child element
    if (xml[pos] === '<') {
      const childResult = parseXmlElement(xml, pos, namespaces, depth + 1);
      if (childResult.node) {
        children.push(childResult.node);
      }
      pos = childResult.endPos;
    } else {
      // Text content - restore whitespace if there was any
      if (pos > wsStart && children.length > 0) {
        textContent += xml.slice(wsStart, pos);
      }

      // Read until next tag
      while (pos < xml.length && xml[pos] !== '<') {
        textContent += xml[pos];
        pos++;
      }
    }
  }

  return {
    node: {
      tag: resolvedTag,
      attributes,
      children,
      text: decodeXmlEntities(textContent.trim()),
    },
    endPos: pos,
  };
}

/**
 * Resolve namespace prefix in tag name.
 */
function resolveNamespace(tagName: string, namespaces: Map<string, string>): string {
  const colonIndex = tagName.indexOf(':');
  if (colonIndex === -1) return tagName;

  const prefix = tagName.slice(0, colonIndex);
  const localName = tagName.slice(colonIndex + 1);

  // If we have a mapping for this prefix, we could transform it
  // For now, just return the local name (strip prefix)
  if (namespaces.has(prefix)) {
    return localName;
  }

  return tagName;
}

/**
 * Convert parsed XML node to JavaScript object.
 */
function xmlNodeToObject(node: XmlNode): unknown {
  // If node has only text content (no children, no attributes), return text
  // Self-closing tags like <tag/> return null
  // Empty elements like <tag></tag> return "" (empty string)
  if (node.children.length === 0 && node.attributes.size === 0) {
    if (node.selfClosing) {
      return null;
    }
    return node.text;
  }

  const result: Record<string, unknown> = {};

  // Add attributes as properties with @ prefix
  for (const [name, value] of node.attributes) {
    // Skip xmlns declarations
    if (name.startsWith('xmlns')) continue;
    result[`@${name}`] = value;
  }

  // Add text content if present alongside children or attributes
  // Use _text instead of #text since # is reserved for type prefixes in ODIN
  if (node.text && (node.children.length > 0 || node.attributes.size > 0)) {
    result['_text'] = node.text;
  }

  // Group children by tag name
  const childGroups = new Map<string, XmlNode[]>();
  for (const child of node.children) {
    if (child.tag === '#cdata') {
      // Append CDATA content to text
      result['_text'] = (result['_text'] || '') + child.text;
      continue;
    }
    const group = childGroups.get(child.tag) ?? [];
    group.push(child);
    childGroups.set(child.tag, group);
  }

  // Convert child groups to properties
  // Always use arrays for child elements named 'item' (common collection pattern)
  // This ensures consistent behavior whether there's 1 or N items
  for (const [tag, children] of childGroups) {
    if (tag === 'item') {
      // 'item' elements are always treated as array items
      result[tag] = children.map((c) => xmlNodeToObject(c));
    } else if (children.length === 1) {
      result[tag] = xmlNodeToObject(children[0]!);
    } else {
      result[tag] = children.map((c) => xmlNodeToObject(c));
    }
  }

  // If only text content (after processing), return just the text
  if (Object.keys(result).length === 0 || (Object.keys(result).length === 1 && '_text' in result)) {
    // Prefer _text if it exists (from CDATA), otherwise use node.text
    if ('_text' in result) {
      return result['_text'];
    }
    return node.text;
  }

  return result;
}

/**
 * Decode XML entities in text.
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
