/**
 * ODIN Schema Parser - Header parsing.
 */

import { TokenType } from '../parser/tokens.js';
import type { SchemaTokenReader } from './schema-token-reader.js';
import type { SchemaHeaderType } from './schema-parser-context.js';

// ─────────────────────────────────────────────────────────────────────────────
// Header Parse Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of parsing a schema header.
 */
export interface HeaderParseResult {
  /** The parsed header type */
  header: SchemaHeaderType | null;
  /** The current path (for object/array headers) */
  path: string;
  /** For type definition headers: the type name */
  typeName?: string;
  /** For type definition headers: whether this is a continuation block */
  isContinuation?: boolean;
  /** For array headers: the column names */
  columns?: string[];
}

/**
 * Result of parsing array constraints.
 */
export interface ArrayConstraintsResult {
  minItems?: number;
  maxItems?: number;
  unique?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Header Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a schema header: {$}, {@type}, {path}, {path[]}, etc.
 *
 * @param reader - Token reader positioned at HEADER_OPEN
 * @param definedTypes - Set of already defined type names (for continuation detection)
 * @returns Parsed header result
 */
export function parseSchemaHeader(
  reader: SchemaTokenReader,
  definedTypes: Set<string>
): HeaderParseResult {
  reader.expect(TokenType.HEADER_OPEN, 'Expected {');

  // Empty header resets context
  if (reader.peek().type === TokenType.HEADER_CLOSE) {
    reader.advance();
    return { header: null, path: '' };
  }

  // Check for $ (metadata) or @ (type definition)
  const firstToken = reader.peek();
  const firstVal = reader.getTokenVal(firstToken);

  if (firstVal === '$') {
    return parseMetadataHeader(reader);
  }

  if (firstToken.type === TokenType.PREFIX_REFERENCE) {
    return parseTypeDefinitionHeader(reader, definedTypes);
  }

  // Object or array header: {path} or {path[]} or {path[] : col1, col2}
  return parsePathHeader(reader);
}

/**
 * Parse metadata header: {$} or {$derivation}
 */
function parseMetadataHeader(reader: SchemaTokenReader): HeaderParseResult {
  reader.advance(); // consume $

  // Check for $derivation
  if (reader.peek().type === TokenType.IDENTIFIER) {
    const nextVal = reader.getTokenVal(reader.peek());
    if (nextVal === 'derivation') {
      reader.advance();
      reader.expect(TokenType.HEADER_CLOSE, 'Expected }');
      return {
        header: { kind: 'derivation' },
        path: '$derivation',
      };
    }
  }

  reader.expect(TokenType.HEADER_CLOSE, 'Expected }');
  return {
    header: { kind: 'metadata' },
    path: '$',
  };
}

/**
 * Parse type definition header: {@name} or {@&namespace.name} or {@name[]}
 */
function parseTypeDefinitionHeader(
  reader: SchemaTokenReader,
  definedTypes: Set<string>
): HeaderParseResult {
  reader.advance(); // consume @

  let namespace: string | undefined;
  let name = '';

  // Check for namespace prefix (&)
  if (reader.peek().type === TokenType.PREFIX_EXTENSION) {
    reader.advance();
    // Parse namespace.name
    const parts: string[] = [];
    while (reader.peek().type === TokenType.IDENTIFIER || reader.peek().type === TokenType.DOT) {
      if (reader.peek().type === TokenType.DOT) {
        reader.advance();
      } else {
        parts.push(reader.getTokenVal(reader.peek()));
        reader.advance();
      }
    }
    if (parts.length > 1) {
      name = parts.pop()!;
      namespace = parts.join('.');
    } else {
      name = parts[0] ?? '';
    }
  } else {
    // Simple type name or dotted path (e.g., @coverage or @coverage.limits)
    const parts: string[] = [];
    while (reader.peek().type === TokenType.IDENTIFIER || reader.peek().type === TokenType.DOT) {
      if (reader.peek().type === TokenType.DOT) {
        reader.advance();
      } else {
        parts.push(reader.getTokenVal(reader.peek()));
        reader.advance();
      }
    }
    name = parts.join('.');
  }

  // Check for array suffix [] on type definition
  let isArrayType = false;
  if (reader.peek().type === TokenType.ARRAY_INDEX) {
    const arrayIdx = reader.getTokenVal(reader.peek());
    if (arrayIdx === '[]') {
      isArrayType = true;
      reader.advance();
    }
  }

  reader.expect(TokenType.HEADER_CLOSE, 'Expected }');

  // Check if this is a continuation block
  const isContinuation = definedTypes.has(name);

  const header: SchemaHeaderType = { kind: 'typeDefinition', name };
  if (namespace !== undefined) {
    header.namespace = namespace;
  }
  if (isArrayType) {
    header.isArray = true;
  }

  return {
    header,
    path: '',
    typeName: name,
    isContinuation,
  };
}

/**
 * Parse object or array path header: {path}, {path[]}, {path[] : col1, col2}
 */
function parsePathHeader(reader: SchemaTokenReader): HeaderParseResult {
  const pathParts: string[] = [];

  while (
    !reader.isAtEnd() &&
    reader.peek().type !== TokenType.HEADER_CLOSE &&
    reader.peek().type !== TokenType.COLON
  ) {
    const token = reader.peek();

    if (token.type === TokenType.IDENTIFIER) {
      pathParts.push(reader.getTokenVal(token));
      reader.advance();
    } else if (token.type === TokenType.ARRAY_INDEX) {
      // Append array index to path
      if (pathParts.length > 0) {
        pathParts[pathParts.length - 1] += reader.getTokenVal(token);
      }
      reader.advance();
    } else if (token.type === TokenType.DOT) {
      reader.advance();
    } else if (token.type === TokenType.PREFIX_EXTENSION) {
      // Extension path &domain.name
      reader.advance();
      let extPath = '&';
      while (reader.peek().type === TokenType.IDENTIFIER || reader.peek().type === TokenType.DOT) {
        if (reader.peek().type === TokenType.DOT) {
          extPath += '.';
        } else {
          extPath += reader.getTokenVal(reader.peek());
        }
        reader.advance();
      }
      pathParts.push(extPath);
    } else {
      break;
    }
  }

  const pathStr = pathParts.join('.');
  const isArray = pathStr.endsWith('[]');
  const basePath = isArray ? pathStr.slice(0, -2) : pathStr;

  // Check for tabular columns
  let columns: string[] | undefined;
  if (reader.peek().type === TokenType.COLON) {
    reader.advance();
    columns = parseColumnList(reader);
  }

  reader.expect(TokenType.HEADER_CLOSE, 'Expected }');

  if (isArray) {
    const header: SchemaHeaderType = { kind: 'array', path: basePath };
    if (columns !== undefined) {
      header.columns = columns;
    }
    const result: HeaderParseResult = {
      header,
      path: basePath,
    };
    if (columns !== undefined) {
      result.columns = columns;
    }
    return result;
  }

  return {
    header: { kind: 'object', path: basePath },
    path: basePath,
  };
}

/**
 * Parse column list in array header: col1, col2, product.name
 */
function parseColumnList(reader: SchemaTokenReader): string[] {
  const columns: string[] = [];

  while (!reader.isAtEnd() && reader.peek().type !== TokenType.HEADER_CLOSE) {
    if (reader.peek().type === TokenType.IDENTIFIER) {
      // Parse column name, which may include single-level dot notation
      // (e.g., "product.name") or array index (e.g., "permissions[0]")
      let columnName = reader.getTokenVal(reader.peek());
      reader.advance();

      // Check for single-level dot notation (IDENTIFIER DOT IDENTIFIER)
      if (reader.peek().type === TokenType.DOT && !reader.isAtEnd()) {
        const nextToken = reader.peekAhead(1);
        if (nextToken && nextToken.type === TokenType.IDENTIFIER) {
          columnName += '.' + reader.getTokenVal(nextToken);
          reader.advance(); // consume DOT
          reader.advance(); // consume IDENTIFIER
        }
      }
      // Check for single-level array index (IDENTIFIER ARRAY_INDEX)
      else if (reader.peek().type === TokenType.ARRAY_INDEX) {
        columnName += reader.getTokenVal(reader.peek());
        reader.advance();
      }

      columns.push(columnName);
    } else if (reader.peek().type === TokenType.COMMA) {
      reader.advance();
    } else if (reader.peek().type === TokenType.WHITESPACE) {
      reader.advance();
    } else {
      break;
    }
  }

  return columns;
}

// ─────────────────────────────────────────────────────────────────────────────
// Array Constraints Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse array constraints: :(1..100) or :unique or :(1..100):unique
 */
export function parseArrayConstraints(reader: SchemaTokenReader): ArrayConstraintsResult {
  const result: ArrayConstraintsResult = {};

  if (reader.peek().type !== TokenType.COLON) return result;
  reader.advance();

  // Check for bounds or unique
  const next = reader.peek();
  const nextVal = reader.getTokenVal(next);

  // unique constraint
  if (next.type === TokenType.IDENTIFIER && nextVal === 'unique') {
    reader.advance();
    result.unique = true;
    // Check for another constraint after unique
    if (reader.peek().type === TokenType.COLON) {
      const more = parseArrayConstraints(reader);
      Object.assign(result, more);
    }
    return result;
  }

  // Parse bounds (min..max)
  if (nextVal.startsWith('(') || next.type === TokenType.NUMBER) {
    // Check if entire bounds is in one token
    if (nextVal.startsWith('(') && nextVal.includes(')')) {
      reader.advance(); // consume the token
      // Extract content between parens
      const openIdx = nextVal.indexOf('(');
      const closeIdx = nextVal.lastIndexOf(')');
      if (closeIdx > openIdx) {
        const content = nextVal.substring(openIdx + 1, closeIdx);
        const trimmed = content.trim();
        if (trimmed.includes('..')) {
          const parts = trimmed.split('..');
          const minStr = parts[0]?.trim();
          const maxStr = parts[1]?.trim();
          if (minStr) {
            result.minItems = parseInt(minStr, 10);
          }
          if (maxStr) {
            result.maxItems = parseInt(maxStr, 10);
          }
        }
      }

      // Check for :unique within the same token after the closing paren
      const afterClose = nextVal.substring(closeIdx + 1);
      if (afterClose.includes(':unique')) {
        result.unique = true;
      }

      // Check for :unique after bounds in next token
      if (reader.peek().type === TokenType.COLON) {
        const more = parseArrayConstraints(reader);
        Object.assign(result, more);
      }
      return result;
    }

    // Handle token-by-token parsing
    // Skip opening paren if present
    if (reader.getTokenVal(reader.peek()) === '(') {
      reader.advance();
    }

    // Parse min value
    if (reader.peek().type === TokenType.NUMBER) {
      result.minItems = parseInt(reader.getTokenVal(reader.peek()), 10);
      reader.advance();
    }

    // Check for ..
    if (reader.peek().type === TokenType.DOT) {
      reader.advance();
      if (reader.peek().type === TokenType.DOT) {
        reader.advance();
      }
    }

    // Parse max value
    if (reader.peek().type === TokenType.NUMBER) {
      result.maxItems = parseInt(reader.getTokenVal(reader.peek()), 10);
      reader.advance();
    }

    // Skip closing paren if present
    if (reader.getTokenVal(reader.peek()) === ')') {
      reader.advance();
    }

    // Check for :unique after bounds
    if (reader.peek().type === TokenType.COLON) {
      const more = parseArrayConstraints(reader);
      Object.assign(result, more);
    }
  }

  return result;
}
