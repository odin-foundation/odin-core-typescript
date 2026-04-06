/**
 * Serialize ODIN documents to text format.
 */

import type { OdinDocument } from '../types/document.js';
import type { OdinValue, OdinModifiers, OdinCurrency, OdinPercent } from '../types/values.js';
import type { StringifyOptions } from '../types/options.js';
import { parsePathCached } from '../parser/tokens.js';
import {
  escapeOdinString,
  formatBinary,
  formatModifierPrefix,
  hasAnyModifier,
} from '../utils/format-utils.js';
import { SECURITY_LIMITS, validateArrayIndex } from '../utils/security-limits.js';

/**
 * Safely parse an array index from a string, returning 0 for invalid values.
 * This prevents integer overflow issues with extremely large indices.
 */
function safeParseArrayIndex(str: string): number {
  const index = parseInt(str, 10);
  if (!validateArrayIndex(index)) {
    return SECURITY_LIMITS.MAX_ARRAY_INDEX; // Use max value for sorting purposes
  }
  return index;
}

/**
 * Extract numeric array index from a bracket notation string like "[0]" or "[123]".
 * Returns -1 if the string is not a valid bracket index.
 * Avoids regex allocation in hot loops.
 */
function parseBracketIndex(name: string): number {
  if (name.charCodeAt(0) !== 91) return -1; // '['
  const len = name.length;
  if (len < 3 || name.charCodeAt(len - 1) !== 93) return -1; // ']'
  // Parse digits between brackets
  let val = 0;
  for (let i = 1; i < len - 1; i++) {
    const c = name.charCodeAt(i);
    if (c < 48 || c > 57) return -1; // not a digit
    val = val * 10 + (c - 48);
  }
  return safeParseArrayIndex(String(val));
}

/**
 * Default stringify options.
 */
const defaultOptions: Required<StringifyOptions> = {
  pretty: false,
  includeComments: true,
  sortPaths: false,
  useHeaders: true,
  useTabular: true,
  lineEnding: '\n',
  indent: '  ',
};

/**
 * Convert an ODIN document to text format.
 *
 * @param doc - Document to serialize
 * @param options - Formatting options (headers, tabular, sorting)
 * @returns ODIN text representation
 */
export function stringify(doc: OdinDocument, options?: StringifyOptions): string {
  const opts = { ...defaultOptions, ...options };

  // Fast path: flat section-grouping when document has no arrays and no deep nesting.
  // Safe when all data paths are either 'field' or 'Section.field' (max 1 dot).
  if (opts.useHeaders && !opts.sortPaths && isShallowDocument(doc)) {
    return stringifyFlat(doc, opts);
  }

  const lines: string[] = [];

  // Single-pass path separation instead of two filter() calls
  const metaPaths: string[] = [];
  const dataPaths: string[] = [];
  for (const key of doc.assignments.keys()) {
    if (key.charCodeAt(0) === 36 && key.length > 1 && key.charCodeAt(1) === 46) {
      metaPaths.push(key);
    } else {
      dataPaths.push(key);
    }
  }
  // Also add metadata paths from the metadata map
  for (const key of doc.metadata.keys()) {
    metaPaths.push('$.' + key);
  }

  const sortedMetaPaths = opts.sortPaths ? [...metaPaths].sort() : metaPaths;

  if (sortedMetaPaths.length > 0) {
    if (opts.useHeaders) {
      lines.push('{$}');
    }
    for (const path of sortedMetaPaths) {
      const value = doc.get(path);
      if (value !== undefined) {
        const pathStr = opts.useHeaders ? path.slice(2) : path;
        lines.push(formatAssignment(pathStr, value, doc.modifiers.get(path)));
      }
    }
    if (opts.useHeaders && dataPaths.length > 0) {
      lines.push('{}');
    }
  }

  if (opts.useHeaders || opts.useTabular) {
    outputHierarchical(doc, dataPaths, opts, lines);
  } else {
    const sortedDataPaths = opts.sortPaths ? [...dataPaths].sort() : dataPaths;
    for (const path of sortedDataPaths) {
      const value = doc.get(path);
      if (value !== undefined) {
        lines.push(formatAssignment(path, value, doc.modifiers.get(path)));
      }
    }
  }

  return lines.join(opts.lineEnding) + (lines.length > 0 ? opts.lineEnding : '');
}

/**
 * Check if document is shallow enough for flat stringify:
 * no array paths and no paths with more than 2 segments (Section.field).
 */
function isShallowDocument(doc: OdinDocument): boolean {
  for (const key of doc.assignments.keys()) {
    if (key.indexOf('[') >= 0) return false;
    // Check for deep nesting: more than one dot means Section.sub.field → needs subheaders
    const firstDot = key.indexOf('.');
    if (firstDot >= 0 && key.indexOf('.', firstDot + 1) >= 0) return false;
  }
  return true;
}

/**
 * Fast flat stringify: iterate assignments directly with section grouping.
 * Skips path tree construction entirely. Used when no tabular output is needed.
 */
function stringifyFlat(doc: OdinDocument, opts: Required<StringifyOptions>): string {
  const lines: string[] = [];

  // Metadata
  const hasMetadata = doc.metadata.size > 0;
  if (hasMetadata) {
    lines.push('{$}');
    for (const [key, value] of doc.metadata) {
      lines.push(formatAssignment(key, value, undefined));
    }
  }

  // Check if we have any data assignments
  let hasData = false;
  for (const key of doc.assignments.keys()) {
    if (!(key.length > 1 && key.charCodeAt(0) === 36 && key.charCodeAt(1) === 46)) {
      hasData = true;
      break;
    }
  }

  // Emit {} separator after metadata if there are data assignments
  if (hasMetadata && hasData) {
    lines.push('{}');
  }

  // Assignments with section grouping
  let currentSection: string | null | undefined = undefined;

  for (const [path, value] of doc.assignments) {
    // Skip $.key entries
    if (path.length > 1 && path.charCodeAt(0) === 36 && path.charCodeAt(1) === 46) continue;

    const dotPos = path.indexOf('.');
    let section: string | null;
    let field: string;

    if (dotPos > 0) {
      section = path.slice(0, dotPos);
      field = path.slice(dotPos + 1);
    } else {
      section = null;
      field = path;
    }

    if (section !== currentSection) {
      if (section !== null) {
        lines.push(`{${section}}`);
      }
      currentSection = section;
    }

    const mods = doc.modifiers.get(path);
    lines.push(formatAssignment(field, value, mods));
  }

  return lines.join(opts.lineEnding) + (lines.length > 0 ? opts.lineEnding : '');
}

/**
 * Represents a node in the path hierarchy.
 */
interface PathNode {
  name: string;
  fullPath: string;
  value?: OdinValue;
  modifiers?: OdinModifiers;
  children: Map<string, PathNode>;
  isArray: boolean;
  arrayIndices: number[];
}

/**
 * Check if a node has any children whose keys start with '['.
 */
function nodeHasArrayChildren(node: PathNode): boolean {
  for (const key of node.children.keys()) {
    if (key.charCodeAt(0) === 91) return true; // '['
  }
  return false;
}

/**
 * Build a hierarchical tree from flat paths.
 * Optimized to minimize string allocations using interned segments.
 */
function buildPathTree(doc: OdinDocument, paths: string[]): PathNode {
  const root: PathNode = {
    name: '',
    fullPath: '',
    children: new Map(),
    isArray: false,
    arrayIndices: [],
  };

  const pathParts: string[] = [];

  for (const path of paths) {
    const segments = parsePath(path);
    let current = root;
    pathParts.length = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;

      if (seg.charCodeAt(0) === 91) {
        pathParts.push(seg);
      } else if (pathParts.length > 0) {
        pathParts.push('.', seg);
      } else {
        pathParts.push(seg);
      }

      let node = current.children.get(seg);
      if (node === undefined) {
        const fullPath = pathParts.join('');
        node = {
          name: seg,
          fullPath,
          children: new Map(),
          isArray: seg.charCodeAt(0) === 91,
          arrayIndices: [],
        };
        current.children.set(seg, node);
      }

      if (seg.charCodeAt(0) === 91) {
        let idx = 0;
        for (let j = 1; j < seg.length - 1; j++) {
          idx = idx * 10 + (seg.charCodeAt(j) - 48);
        }
        if (!current.arrayIndices.includes(idx)) {
          current.arrayIndices.push(idx);
        }
      }

      if (i === segments.length - 1) {
        const val = doc.get(path);
        if (val !== undefined) {
          node.value = val;
        }
        const mods = doc.modifiers.get(path);
        if (mods !== undefined) {
          node.modifiers = mods;
        }
      }

      current = node;
    }
  }

  return root;
}

/**
 * Parse a path into segments, keeping array indices as separate segments.
 * Uses cached parsing for performance.
 */
function parsePath(path: string): readonly string[] {
  return parsePathCached(path);
}

/**
 * Output paths hierarchically with proper headers and tabular arrays.
 *
 * Root level requires explicit headers for each top-level group to ensure
 * proper context separation. Scalars are output first, then groups are
 * categorized into single-leaf groups (no header needed) and header groups
 * (arrays or multi-leaf objects).
 */
function outputHierarchical(
  doc: OdinDocument,
  dataPaths: string[],
  opts: Required<StringifyOptions>,
  lines: string[]
): void {
  const tree = buildPathTree(doc, dataPaths);

  const childNames = Array.from(tree.children.keys());
  if (opts.sortPaths) {
    childNames.sort((a, b) => a.localeCompare(b));
  }

  const scalars: string[] = [];
  const groups: string[] = [];

  for (const childName of childNames) {
    const child = tree.children.get(childName)!;
    if (child.value !== undefined) {
      scalars.push(childName);
    } else {
      groups.push(childName);
    }
  }

  for (const childName of scalars) {
    const child = tree.children.get(childName)!;
    lines.push(formatAssignment(child.fullPath, child.value!, child.modifiers));
  }

  const singleLeafGroups: string[] = [];
  const headerGroups: string[] = [];

  for (const childName of groups) {
    const child = tree.children.get(childName)!;
    const hasArr = nodeHasArrayChildren(child);

    if (hasArr || (opts.useHeaders && hasMultipleLeafDescendants(child))) {
      headerGroups.push(childName);
    } else {
      singleLeafGroups.push(childName);
    }
  }

  for (const childName of singleLeafGroups) {
    const child = tree.children.get(childName)!;
    outputNode(doc, child, '', opts, lines);
  }

  for (const childName of headerGroups) {
    const child = tree.children.get(childName)!;
    const hasArrayChildren = nodeHasArrayChildren(child);

    if (hasArrayChildren && opts.useTabular && child.arrayIndices.length > 0) {
      const tabular = tryOutputAsTabular(doc, child, '', opts, lines);
      if (tabular) continue;
    }

    if (hasArrayChildren) {
      outputNode(doc, child, '', opts, lines);
    } else if (opts.useHeaders && hasMultipleLeafDescendants(child)) {
      lines.push(`{${child.fullPath}}`);
      outputNode(doc, child, child.fullPath, opts, lines);
    } else {
      outputNode(doc, child, '', opts, lines);
    }
  }
}

/**
 * Unified recursive function to output a node and all its descendants.
 *
 * Algorithm:
 * 1. If node has a value, output it with path relative to headerPath
 * 2. If node has array children, try tabular first, then output each array item
 * 3. If node has object children, output leaf values first, then subheaders
 *
 * @param doc - The ODIN document
 * @param node - Current node in the path tree
 * @param headerPath - Current header context (empty string = root level)
 * @param opts - Stringify options
 * @param lines - Output lines array
 */
function outputNode(
  doc: OdinDocument,
  node: PathNode,
  headerPath: string,
  opts: Required<StringifyOptions>,
  lines: string[],
  insideRelativeHeader = false
): void {
  if (node.value !== undefined) {
    const relativePath = headerPath ? node.fullPath.slice(headerPath.length + 1) : node.fullPath;
    lines.push(formatAssignment(relativePath, node.value, node.modifiers));
    return;
  }

  if (node.children.size === 0) return;

  let childNames: string[];
  if (opts.sortPaths) {
    childNames = Array.from(node.children.keys());
    childNames.sort((a, b) => {
      const aIsArray = a.charCodeAt(0) === 91;
      const bIsArray = b.charCodeAt(0) === 91;
      if (aIsArray && bIsArray) {
        const aIdx = safeParseArrayIndex(a.slice(1, -1));
        const bIdx = safeParseArrayIndex(b.slice(1, -1));
        return aIdx - bIdx;
      }
      if (aIsArray) return 1;
      if (bIsArray) return -1;
      return a.localeCompare(b);
    });
  } else {
    childNames = Array.from(node.children.keys());
  }

  const arrayChildren: string[] = [];
  const regularChildren: string[] = [];
  const subheaderChildren: string[] = [];

  for (const childName of childNames) {
    const child = node.children.get(childName)!;

    if (childName.startsWith('[')) {
      arrayChildren.push(childName);
      continue;
    }

    const childHasArrayChildren = nodeHasArrayChildren(child);

    const shouldGetSubheader =
      opts.useHeaders &&
      child.value === undefined &&
      !childHasArrayChildren &&
      hasMultipleLeafDescendants(child);

    if (shouldGetSubheader) {
      subheaderChildren.push(childName);
    } else {
      regularChildren.push(childName);
    }
  }

  for (const childName of regularChildren) {
    const child = node.children.get(childName)!;
    outputNode(doc, child, headerPath, opts, lines);
  }

  if (arrayChildren.length > 0) {
    if (opts.useTabular && node.arrayIndices.length > 0) {
      const tabular = tryOutputAsTabular(doc, node, headerPath, opts, lines);
      if (!tabular) {
        for (const childName of arrayChildren) {
          const child = node.children.get(childName)!;
          if (opts.useHeaders && hasMultipleLeafDescendants(child)) {
            lines.push(`{${child.fullPath}}`);
            outputNode(doc, child, child.fullPath, opts, lines);
          } else {
            outputNode(doc, child, headerPath, opts, lines);
          }
        }
      }
    } else {
      for (const childName of arrayChildren) {
        const child = node.children.get(childName)!;
        if (opts.useHeaders && hasMultipleLeafDescendants(child)) {
          lines.push(`{${child.fullPath}}`);
          outputNode(doc, child, child.fullPath, opts, lines);
        } else {
          outputNode(doc, child, headerPath, opts, lines);
        }
      }
    }
  }

  for (const childName of subheaderChildren) {
    const child = node.children.get(childName)!;
    // Use relative header only for direct children of an absolute header context.
    // Per spec, relative headers resolve against the last ABSOLUTE header,
    // so we must not nest relative headers (that would chain them incorrectly).
    const isDirectChild =
      headerPath &&
      child.fullPath.startsWith(headerPath + '.') &&
      !child.fullPath.slice(headerPath.length + 1).includes('.');
    const canUseRelative = isDirectChild && !insideRelativeHeader;

    if (canUseRelative) {
      const relativeName = child.fullPath.slice(headerPath.length + 1);
      lines.push(`{.${relativeName}}`);
      outputNode(doc, child, child.fullPath, opts, lines, true);
    } else {
      lines.push(`{${child.fullPath}}`);
      outputNode(doc, child, child.fullPath, opts, lines, false);
    }
  }
}

/**
 * Check if a node has multiple leaf descendants (values).
 */
function hasMultipleLeafDescendants(node: PathNode): boolean {
  let count = 0;

  function countLeaves(n: PathNode): void {
    if (n.value !== undefined) {
      count++;
      return;
    }
    for (const child of n.children.values()) {
      countLeaves(child);
      if (count > 1) return;
    }
  }

  countLeaves(node);
  return count > 1;
}

/**
 * Try to output an array node as tabular format.
 * Returns true if successful, false if not eligible.
 *
 * Supports single-level nesting in column names:
 * - Dot notation: product.name, product.sku
 * - Array indices: permissions[0], permissions[1]
 *
 * Does NOT support multi-level nesting (a.b.c or a[0].b).
 */
function tryOutputAsTabular(
  _doc: OdinDocument,
  node: PathNode,
  currentHeader: string,
  opts: Required<StringifyOptions>,
  lines: string[]
): boolean {
  if (isPrimitiveArrayNode(node)) {
    return tryOutputAsPrimitiveTabular(node, currentHeader, lines);
  }

  const items: Map<
    number,
    Map<string, { value: OdinValue; modifiers?: OdinModifiers }>
  > = new Map();
  const allColumns = new Set<string>();

  for (const [childName, child] of node.children) {
    if (!childName.startsWith('[')) continue;

    const index = parseBracketIndex(childName);
    if (index < 0) continue;

    const fields = new Map<string, { value: OdinValue; modifiers?: OdinModifiers }>();

    const result = collectTabularFields(child, '', fields);
    if (!result) {
      return false;
    }

    if (fields.size === 0) {
      return false;
    }

    for (const col of fields.keys()) {
      allColumns.add(col);
    }

    items.set(index, fields);
  }

  if (items.size === 0) {
    return false;
  }

  const indices = Array.from(items.keys()).sort((a, b) => a - b);
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i) {
      return false;
    }
  }

  const columns = Array.from(allColumns);
  if (opts.sortPaths) {
    columns.sort(sortTabularColumns);
  }

  const headerPath = currentHeader
    ? '.' + node.fullPath.slice(currentHeader.length + 1) + '[]'
    : node.fullPath + '[]';

  const formattedColumns = formatColumnsWithRelative(columns);
  lines.push(`{${headerPath} : ${formattedColumns}}`);

  for (let i = 0; i < indices.length; i++) {
    const fields = items.get(i)!;
    const values: string[] = [];
    for (const col of columns) {
      const field = fields.get(col);
      if (field === undefined) {
        values.push('');
      } else {
        values.push(formatValue(field.value));
      }
    }
    lines.push(values.join(', '));
  }

  return true;
}

/**
 * Collect fields from a node for tabular output.
 * Supports single-level nesting (one dot or one array index).
 *
 * @param node - The node to collect fields from
 * @param prefix - Current column prefix (empty for top-level)
 * @param fields - Map to collect field values into
 * @returns true if eligible for tabular, false if not
 */
function collectTabularFields(
  node: PathNode,
  prefix: string,
  fields: Map<string, { value: OdinValue; modifiers?: OdinModifiers }>
): boolean {
  for (const [fieldName, fieldNode] of node.children) {
    const columnName = prefix ? `${prefix}.${fieldName}` : fieldName;

    if (fieldNode.value !== undefined) {
      if (!isPrimitiveValue(fieldNode.value)) {
        return false;
      }
      if (hasAnyModifier(fieldNode.modifiers)) {
        return false;
      }
      const fieldEntry: { value: OdinValue; modifiers?: OdinModifiers } = {
        value: fieldNode.value,
      };
      if (fieldNode.modifiers !== undefined) {
        fieldEntry.modifiers = fieldNode.modifiers;
      }
      fields.set(columnName, fieldEntry);
      continue;
    }

    if (prefix !== '') {
      return false;
    }

    const childKeys = Array.from(fieldNode.children.keys());

    const hasArrayChildren = childKeys.some((k) => k.startsWith('['));

    if (hasArrayChildren) {
      for (const [childKey, childNode] of fieldNode.children) {
        if (!childKey.startsWith('[')) {
          return false;
        }
        if (childNode.value === undefined) {
          return false;
        }
        if (childNode.children.size > 0) {
          return false;
        }
        if (!isPrimitiveValue(childNode.value)) {
          return false;
        }
        if (hasAnyModifier(childNode.modifiers)) {
          return false;
        }
        const arrColumnName = `${fieldName}${childKey}`;
        const fieldEntry: { value: OdinValue; modifiers?: OdinModifiers } = {
          value: childNode.value,
        };
        if (childNode.modifiers !== undefined) {
          fieldEntry.modifiers = childNode.modifiers;
        }
        fields.set(arrColumnName, fieldEntry);
      }
    } else {
      for (const [childKey, childNode] of fieldNode.children) {
        if (childNode.value === undefined) {
          return false;
        }
        if (childNode.children.size > 0) {
          return false;
        }
        if (!isPrimitiveValue(childNode.value)) {
          return false;
        }
        if (hasAnyModifier(childNode.modifiers)) {
          return false;
        }
        const dotColumnName = `${fieldName}.${childKey}`;
        const fieldEntry: { value: OdinValue; modifiers?: OdinModifiers } = {
          value: childNode.value,
        };
        if (childNode.modifiers !== undefined) {
          fieldEntry.modifiers = childNode.modifiers;
        }
        fields.set(dotColumnName, fieldEntry);
      }
    }
  }

  return true;
}

/**
 * Check if an array node contains only primitive values (no object children).
 * Returns true if all array items are direct primitive values.
 */
function isPrimitiveArrayNode(node: PathNode): boolean {
  let hasItems = false;

  for (const [childName, child] of node.children) {
    if (!childName.startsWith('[')) continue;

    hasItems = true;

    if (child.value === undefined || child.children.size > 0) {
      return false;
    }

    if (!isPrimitiveValue(child.value)) {
      return false;
    }

    if (hasAnyModifier(child.modifiers)) {
      return false;
    }
  }

  return hasItems;
}

/**
 * Output a primitive array as {path[] : ~} format.
 * One value per line.
 */
function tryOutputAsPrimitiveTabular(
  node: PathNode,
  currentHeader: string,
  lines: string[]
): boolean {
  const items: Map<number, { value: OdinValue; modifiers?: OdinModifiers }> = new Map();

  for (const [childName, child] of node.children) {
    if (!childName.startsWith('[')) continue;

    const index = parseBracketIndex(childName);
    if (index < 0) continue;

    if (child.value === undefined) {
      return false;
    }

    const item: { value: OdinValue; modifiers?: OdinModifiers } = {
      value: child.value,
    };
    if (child.modifiers !== undefined) item.modifiers = child.modifiers;
    items.set(index, item);
  }

  if (items.size === 0) {
    return false;
  }

  const indices = Array.from(items.keys()).sort((a, b) => a - b);
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i) {
      return false;
    }
  }

  const headerPath = currentHeader
    ? '.' + node.fullPath.slice(currentHeader.length + 1) + '[]'
    : node.fullPath + '[]';

  lines.push(`{${headerPath} : ~}`);

  for (let i = 0; i < indices.length; i++) {
    const item = items.get(i)!;
    lines.push(formatValue(item.value));
  }

  return true;
}

/**
 * Format column names using relative syntax where appropriate.
 * Consecutive columns with the same parent prefix are converted to relative form.
 *
 * Example: ['name', 'address.line1', 'address.city', 'address.state', 'active']
 * becomes: 'name, address.line1, .city, .state, active'
 */
function formatColumnsWithRelative(columns: string[]): string {
  if (columns.length === 0) return '';

  const result: string[] = [];
  let currentParent = '';

  for (const column of columns) {
    const dotIndex = column.indexOf('.');

    if (dotIndex > 0) {
      // Column has dot notation
      const parent = column.slice(0, dotIndex);
      const field = column.slice(dotIndex + 1);

      if (parent === currentParent) {
        // Same parent as previous - use relative syntax
        result.push('.' + field);
      } else {
        // New parent - use full syntax and update context
        result.push(column);
        currentParent = parent;
      }
    } else {
      // No dot notation - reset parent context
      result.push(column);
      currentParent = '';
    }
  }

  return result.join(', ');
}

/**
 * Sort tabular columns: plain fields first, then dotted, then array indices.
 * Within each category, sort alphabetically. For array indices, sort numerically.
 */
function sortTabularColumns(a: string, b: string): number {
  const aHasDot = a.includes('.');
  const bHasDot = b.includes('.');
  const aHasArray = a.includes('[');
  const bHasArray = b.includes('[');

  if (!aHasDot && !aHasArray && (bHasDot || bHasArray)) return -1;
  if (!bHasDot && !bHasArray && (aHasDot || aHasArray)) return 1;

  if (aHasDot && !aHasArray && bHasArray) return -1;
  if (bHasDot && !bHasArray && aHasArray) return 1;

  if (aHasArray && bHasArray) {
    // Parse base[index] without regex: find '[', extract base and numeric index
    const aBracket = a.indexOf('[');
    const bBracket = b.indexOf('[');
    if (
      aBracket > 0 && a.charCodeAt(a.length - 1) === 93 &&
      bBracket > 0 && b.charCodeAt(b.length - 1) === 93
    ) {
      const aBase = a.slice(0, aBracket);
      const bBase = b.slice(0, bBracket);
      const baseCmp = aBase.localeCompare(bBase);
      if (baseCmp !== 0) return baseCmp;
      // Parse numeric indices directly
      let aIdx = 0;
      for (let i = aBracket + 1; i < a.length - 1; i++) {
        const c = a.charCodeAt(i);
        if (c < 48 || c > 57) { aIdx = -1; break; }
        aIdx = aIdx * 10 + (c - 48);
      }
      let bIdx = 0;
      for (let i = bBracket + 1; i < b.length - 1; i++) {
        const c = b.charCodeAt(i);
        if (c < 48 || c > 57) { bIdx = -1; break; }
        bIdx = bIdx * 10 + (c - 48);
      }
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    }
  }

  return a.localeCompare(b);
}

/**
 * Check if a value is a primitive (eligible for tabular).
 */
function isPrimitiveValue(value: OdinValue): boolean {
  switch (value.type) {
    case 'null':
    case 'boolean':
    case 'string':
    case 'number':
    case 'integer':
    case 'currency':
    case 'percent':
    case 'date':
    case 'timestamp':
    case 'time':
    case 'duration':
    case 'reference':
    case 'binary':
    case 'verb':
      return true;
    case 'array':
    case 'object':
      return false;
    default:
      return false;
  }
}

/**
 * Format a single assignment line.
 */
function formatAssignment(path: string, value: OdinValue, modifiers?: OdinModifiers): string {
  let line = path + ' = ';
  line += formatModifierPrefix(modifiers);
  line += formatValue(value);
  return line;
}

/**
 * Format a value to ODIN text.
 */
function formatValue(value: OdinValue): string {
  switch (value.type) {
    case 'null':
      return '~';

    case 'boolean':
      return value.value ? '?true' : '?false';

    case 'string':
      return formatString(value.value);

    case 'number':
      // Use raw value if available (preserves precision for scientific values)
      return value.raw !== undefined ? `#${value.raw}` : `#${value.value}`;

    case 'integer':
      // Use raw value if available (preserves precision for large integers)
      return value.raw !== undefined ? `##${value.raw}` : `##${value.value}`;

    case 'currency':
      return formatCurrency(value);

    case 'percent':
      return formatPercent(value);

    case 'date':
      return value.raw;

    case 'timestamp':
      return value.raw;

    case 'time':
      return value.value;

    case 'duration':
      return value.value;

    case 'reference':
      return `@${value.path}`;

    case 'binary':
      return formatBinary(value);

    case 'verb':
      return formatVerbExpression(value);

    case 'array':
      // Arrays are expanded to indexed paths during document construction
      return '[]';

    case 'object':
      // Objects are expanded to dot-separated paths during document construction
      return '{}';

    default:
      return '';
  }
}

/**
 * Format a verb expression value.
 */
function formatVerbExpression(value: {
  type: 'verb';
  verb: string;
  isCustom: boolean;
  args: readonly OdinValue[];
}): string {
  const prefix = value.isCustom ? '%&' : '%';
  let result = `${prefix}${value.verb}`;

  for (const arg of value.args) {
    result += ' ';
    result += formatVerbArgument(arg);
  }

  return result;
}

/**
 * Format a single verb argument.
 */
function formatVerbArgument(value: OdinValue): string {
  switch (value.type) {
    case 'reference':
      return `@${value.path}`;
    case 'string':
      return formatString(value.value);
    case 'verb':
      return formatVerbExpression(value);
    case 'number':
      return value.raw !== undefined ? `#${value.raw}` : `#${value.value}`;
    case 'integer':
      return value.raw !== undefined ? `##${value.raw}` : `##${value.value}`;
    case 'currency':
      return formatCurrency(value);
    case 'percent':
      return formatPercent(value);
    case 'boolean':
      return value.value ? '?true' : '?false';
    case 'null':
      return '~';
    default:
      return formatValue(value);
  }
}

/**
 * Format a string value. All strings must be quoted in ODIN.
 */
function formatString(value: string): string {
  return `"${escapeOdinString(value)}"`;
}

/**
 * Format a currency value with #$ prefix and proper decimal places.
 * Uses raw string if available to preserve high-precision values.
 * Appends currency code suffix if present (e.g., #$99.99:USD).
 */
function formatCurrency(value: OdinCurrency): string {
  // Use raw value if available (preserves precision for crypto, etc.)
  const numPart = value.raw !== undefined ? value.raw : value.value.toFixed(value.decimalPlaces);
  const codePart = value.currencyCode ? `:${value.currencyCode}` : '';
  return `#$${numPart}${codePart}`;
}

/**
 * Format a percentage value with #% prefix.
 * Uses raw string if available to preserve high-precision values.
 */
function formatPercent(value: OdinPercent): string {
  // Use raw value if available (preserves precision)
  if (value.raw !== undefined) {
    return `#%${value.raw}`;
  }
  return `#%${value.value}`;
}

/**
 * Format a Date object as ISO date string.
 * @internal Reserved for future use
 */
function _formatDateValue(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

void _formatDateValue;
