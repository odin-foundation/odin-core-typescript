/**
 * ODIN Parser - Converts tokens to document AST.
 *
 * Handles headers, assignments, arrays, and document chaining.
 */

import type { Token } from './tokens.js';
import { TokenType, internPath, getTokenValue, SPAN_ONLY_SENTINEL } from './tokens.js';
import { tokenize } from './tokenizer.js';
import { ParseError } from '../types/errors.js';
import type {
  OdinValue,
  OdinModifiers,
  OdinVerbExpression,
  OdinDirective,
} from '../types/values.js';
import type { ParseOptions } from '../types/options.js';
import { DEFAULT_MAX_DOCUMENT_SIZE, DEFAULT_MAX_NESTING_DEPTH } from '../types/options.js';
import { getVerbArity, getVerbMinArity } from '../transform/arity.js';
import { skipWhitespace, getPathDepth } from './parse-helpers.js';
import {
  DEFAULT_MODIFIERS,
  NULL_VALUE,
  parseTypedNumber,
  parseBoolean,
  parseBinaryValue,
  type ParseContext,
} from './parse-values.js';
import { hasAnyModifier } from '../utils/format-utils.js';
import { validateArrayContiguity } from './array-validator.js';
import { SECURITY_LIMITS } from '../utils/security-limits.js';

// Re-export types from parser-types.ts for backward compatibility
export type {
  ParsedAssignment,
  ImportDirective,
  SchemaDirective,
  ConditionalDirective,
  ParsedDocument,
  ParserState,
} from './parser-types.js';

import type {
  ParserState,
  ParsedDocument,
  ImportDirective,
  SchemaDirective,
  ConditionalDirective,
} from './parser-types.js';

/**
 * Flag-only directives that don't take values.
 * When parsing `:trim "value"`, the "value" should NOT be consumed
 * as the directive value, but instead left for the next argument.
 */
const FLAG_ONLY_DIRECTIVES = new Set([
  'trim',
  'upper',
  'lower',
  'required',
  'confidential',
  'deprecated',
  'omitNull',
  'omitEmpty',
]);

/**
 * ODIN Parser.
 */
export class Parser {
  private tokens: Token[] = [];
  private pos: number = 0;
  private source: string = ''; // Store source for lazy value extraction
  private state: ParserState;
  private options: ParseOptions;

  constructor(options: ParseOptions = {}) {
    this.options = {
      maxNestingDepth: DEFAULT_MAX_NESTING_DEPTH,
      maxDocumentSize: DEFAULT_MAX_DOCUMENT_SIZE,
      ...options,
    };
    this.state = this.createInitialState();
  }

  private createInitialState(): ParserState {
    return {
      headerPath: '',
      tabularMode: false,
      tabularPrimitiveMode: false,
      tabularColumns: [],
      tabularArrayPath: '',
      tabularRowIndex: 0,
      previousHeaderPath: '',
      tableMode: false,
      tableName: '',
      tableColumns: [],
      tableRowIndex: 0,
      assignedPaths: new Set(),
      arrayIndices: new Map(),
      pendingDiscriminator: undefined,
    };
  }

  /**
   * Get a ParseContext object for use with shared parsing utilities.
   */
  private get parseContext(): ParseContext {
    return {
      peek: () => this.peek(),
      advance: () => this.advance(),
      getTokenVal: (token: Token) => this.getTokenVal(token),
      isAtEnd: () => this.isAtEnd(),
    };
  }

  /**
   * Skip whitespace tokens. Wrapper for the skipWhitespace helper.
   */
  private skipWs(): number {
    return skipWhitespace(
      () => this.peek(),
      () => this.advance()
    );
  }

  /**
   * Parse ODIN source text.
   */
  parse(source: string): ParsedDocument {
    // Strip UTF-8 BOM if present (U+FEFF)
    if (source.charCodeAt(0) === 0xfeff) {
      source = source.slice(1);
    }

    // Check document size
    if (source.length > this.options.maxDocumentSize!) {
      throw new ParseError('Maximum document size exceeded', 'P011', 1, 1, {
        size: source.length,
        maxSize: this.options.maxDocumentSize,
      });
    }

    // Store source for lazy value extraction from span-only tokens
    this.source = source;
    this.tokens = tokenize(source);
    this.pos = 0;
    this.state = this.createInitialState();

    const documents: ParsedDocument[] = [];
    let currentDoc = this.createEmptyDocument();

    const tokens = this.tokens;
    const len = tokens.length;

    while (this.pos < len) {
      const token = tokens[this.pos]!;
      const tokenType = token.type;

      if (tokenType === TokenType.NEWLINE || tokenType === TokenType.COMMENT) {
        this.pos++;
        continue;
      }

      if (tokenType === TokenType.EOF) {
        break;
      }

      if (tokenType === TokenType.DOC_SEPARATOR) {
        this.pos++;
        documents.push(currentDoc);
        currentDoc = this.createEmptyDocument();
        this.state = this.createInitialState();
        continue;
      }

      if (tokenType === TokenType.HEADER_OPEN) {
        this.parseHeader();
        // Emit pending discriminator assignment if present (from inline {segment :type "value"} syntax)
        if (this.state.pendingDiscriminator) {
          const fullPath = this.state.headerPath
            ? `${this.state.headerPath}.${this.state.pendingDiscriminator.key}`
            : this.state.pendingDiscriminator.key;
          currentDoc.assignments.set(fullPath, {
            type: 'string',
            value: this.state.pendingDiscriminator.value,
          });
          this.state.pendingDiscriminator = undefined;
        }
        continue;
      }

      if (tokenType === TokenType.DIRECTIVE_IMPORT) {
        this.parseImportDirective(currentDoc);
        continue;
      }
      if (tokenType === TokenType.DIRECTIVE_SCHEMA) {
        this.parseSchemaDirective(currentDoc);
        continue;
      }
      if (tokenType === TokenType.DIRECTIVE_COND) {
        this.parseConditionalDirective(currentDoc);
        continue;
      }

      if (this.state.tableMode) {
        if (this.isAssignmentLine()) {
          this.state.tableMode = false;
          this.parseAssignment(currentDoc);
        } else {
          this.parseTableRow(currentDoc);
        }
      } else if (this.state.tabularMode) {
        if (this.isAssignmentLine()) {
          // Restore header context if we had data rows (not a transform mapping)
          if (this.state.tabularRowIndex > 0) {
            this.state.headerPath = this.state.previousHeaderPath;
          }
          this.state.tabularMode = false;
          this.state.tabularPrimitiveMode = false;
          this.parseAssignment(currentDoc);
        } else {
          this.parseTabularRow(currentDoc);
        }
      } else {
        this.parseAssignment(currentDoc);
      }
    }

    documents.push(currentDoc);

    this.validateArrayContiguityInternal();

    if (documents.length > 1) {
      const result = documents[0]!;
      result.chainedDocuments = documents.slice(1);
      return result;
    }

    return currentDoc;
  }

  private createEmptyDocument(): ParsedDocument {
    return {
      metadata: new Map(),
      assignments: new Map(),
      modifiers: new Map(),
      imports: [],
      schemas: [],
      conditionals: [],
    };
  }

  /**
   * Parse a header: {path} or {path[] : col1, col2}
   */
  private parseHeader(): void {
    this.expect(TokenType.HEADER_OPEN, 'Expected {');

    if (this.peek().type === TokenType.HEADER_CLOSE) {
      this.advance();
      this.state.headerPath = '';
      this.state.tabularMode = false;
      this.state.tabularPrimitiveMode = false;
      return;
    }

    let isRelative = false;
    if (this.peek().type === TokenType.DOT) {
      isRelative = true;
      this.advance();
    }

    const pathParts: string[] = [];

    if (this.peek().type === TokenType.PREFIX_META) {
      this.advance();
      pathParts.push('$');
    }

    while (
      !this.isAtEnd() &&
      this.peek().type !== TokenType.HEADER_CLOSE &&
      this.peek().type !== TokenType.COLON
    ) {
      const token = this.peek();

      if (token.type === TokenType.IDENTIFIER) {
        pathParts.push(this.getTokenVal(token));
        this.advance();
      } else if (token.type === TokenType.ARRAY_INDEX) {
        if (pathParts.length > 0) {
          pathParts[pathParts.length - 1] += this.getTokenVal(token);
        } else {
          throw new ParseError('Array index without path', 'P008', token.line, token.column);
        }
        this.advance();
      } else if (token.type === TokenType.DOT) {
        this.advance();
      } else if (token.type === TokenType.PREFIX_EXTENSION) {
        this.advance();
        let extPath = '&';
        while (this.peek().type === TokenType.IDENTIFIER || this.peek().type === TokenType.DOT) {
          extPath += this.getTokenVal(this.peek());
          this.advance();
        }
        pathParts.push(extPath);
      } else {
        break;
      }
    }

    const pathStr = pathParts.join('.');

    // Clear any pending discriminator from previous headers
    this.state.pendingDiscriminator = undefined;

    if (this.peek().type === TokenType.COLON) {
      // Distinguish {segment :type "value"} (discriminator) from {array[] : type, col} (tabular)
      let lookAhead = this.pos + 1;
      while (
        lookAhead < this.tokens.length &&
        this.tokens[lookAhead]?.type === TokenType.WHITESPACE
      ) {
        lookAhead++;
      }
      // Bounds check before accessing token
      const lookAheadToken = lookAhead < this.tokens.length ? this.tokens[lookAhead] : undefined;
      const isTypeIdent =
        lookAheadToken?.type === TokenType.IDENTIFIER &&
        lookAheadToken !== undefined &&
        this.getTokenVal(lookAheadToken) === 'type';

      let isDiscriminator = false;
      if (isTypeIdent) {
        let lookAhead2 = lookAhead + 1;
        while (
          lookAhead2 < this.tokens.length &&
          this.tokens[lookAhead2]?.type === TokenType.WHITESPACE
        ) {
          lookAhead2++;
        }
        isDiscriminator = this.tokens[lookAhead2]?.type === TokenType.STRING_QUOTED;
      }

      if (isDiscriminator) {
        this.advance(); // consume :
        this.skipWs();
        this.advance(); // consume 'type'
        this.skipWs();

        const typeValue = this.getTokenVal(this.peek());
        this.advance();
        this.state.pendingDiscriminator = { key: '_type', value: typeValue };
      } else if (pathStr.endsWith('[]')) {
        this.advance(); // consume :
        // Tabular mode - continue with existing logic (colon already consumed)
        // Restore parent context for relative resolution
        if (this.state.tabularMode) {
          this.state.headerPath = this.state.previousHeaderPath;
        }
        this.state.previousHeaderPath = this.state.headerPath;
        this.state.tabularMode = true;
        this.state.tabularArrayPath = isRelative ? this.resolvePath(pathStr) : pathStr;
        this.state.tabularColumns = [];
        this.state.tabularRowIndex = 0;

        this.skipWs();

        if (this.peek().type === TokenType.PREFIX_NULL) {
          this.advance();
          this.state.tabularPrimitiveMode = true;
        } else {
          this.state.tabularPrimitiveMode = false;

          // Track parent context for relative column names
          let columnParentContext = '';

          while (!this.isAtEnd() && this.peek().type !== TokenType.HEADER_CLOSE) {
            if (this.peek().type === TokenType.DOT) {
              // Relative column name - starts with dot
              this.advance();
              if (this.peek().type !== TokenType.IDENTIFIER) {
                throw new ParseError(
                  'Expected identifier after . in relative column name',
                  'P008',
                  this.peek().line,
                  this.peek().column
                );
              }
              if (!columnParentContext) {
                throw new ParseError(
                  'Relative column name requires previous column with dot notation',
                  'P008',
                  this.peek().line,
                  this.peek().column
                );
              }
              const fieldName = this.getTokenVal(this.peek());
              this.advance();
              // Combine parent context with relative field name
              const columnName = columnParentContext + '.' + fieldName;
              this.state.tabularColumns.push(columnName);
            } else if (this.peek().type === TokenType.IDENTIFIER) {
              let columnName = this.getTokenVal(this.peek());
              this.advance();

              if (this.peek().type === TokenType.DOT) {
                this.advance();
                if (this.peek().type === TokenType.IDENTIFIER) {
                  // Update parent context for subsequent relative columns
                  columnParentContext = columnName;
                  columnName += '.' + this.getTokenVal(this.peek());
                  this.advance();
                }
              } else if (this.peek().type === TokenType.ARRAY_INDEX) {
                columnName += this.getTokenVal(this.peek());
                this.advance();
                // Array index columns don't establish a parent context
                columnParentContext = '';
              } else {
                // Plain identifier - no parent context
                columnParentContext = '';
              }

              this.state.tabularColumns.push(columnName);
            } else if (this.peek().type === TokenType.COMMA) {
              this.advance();
            } else if (this.peek().type === TokenType.WHITESPACE) {
              this.advance();
            } else {
              break;
            }
          }
        }
      } else {
        // Not a discriminator and not tabular - error
        throw new ParseError(
          'Tabular column syntax requires array brackets (e.g., {items[] : col1, col2})',
          'P008',
          this.peek().line,
          this.peek().column
        );
      }
    } else {
      // Restore parent context for relative resolution
      if (this.state.tabularMode) {
        this.state.headerPath = this.state.previousHeaderPath;
      }
      this.state.tabularMode = false;
      this.state.tabularPrimitiveMode = false;
    }

    if (this.peek().type !== TokenType.HEADER_CLOSE) {
      throw new ParseError(
        'Invalid header syntax: missing closing }',
        'P008',
        this.peek().line,
        this.peek().column
      );
    }
    this.advance(); // consume }

    const tableMatch = pathStr.match(/^\$\.table\.([^[]+)\[([^\]]+)\]$/);
    if (tableMatch) {
      const tableName = tableMatch[1]!;
      const columnsStr = tableMatch[2]!;
      const columns = columnsStr.split(',').map((c) => c.trim());

      this.state.tableMode = true;
      this.state.tableName = tableName;
      this.state.tableColumns = columns;
      this.state.tableRowIndex = 0;
      this.state.headerPath = `$.table.${tableName}`;
      return;
    }

    this.state.tableMode = false;

    // Resolve the new header path
    let newPath: string;
    if (isRelative) {
      // Relative headers resolve against the last absolute header (previousHeaderPath),
      // NOT the current headerPath (which may be from a prior relative header)
      const basePath = this.state.previousHeaderPath;
      if (!pathStr) {
        newPath = basePath;
      } else if (!basePath) {
        newPath = internPath(pathStr);
      } else {
        newPath = internPath(basePath + '.' + pathStr);
      }
    } else {
      newPath = pathStr;
      // Only absolute headers update the parent context for future relative headers.
      // Skip if we just entered tabular mode — tabular setup already saved previousHeaderPath.
      if (!this.state.tabularMode) {
        this.state.previousHeaderPath = newPath;
      }
    }

    const depth = getPathDepth(newPath);
    if (depth > this.options.maxNestingDepth!) {
      throw new ParseError(
        `Maximum nesting depth exceeded: ${depth} > ${this.options.maxNestingDepth}`,
        'P010',
        this.tokens[this.pos - 1]!.line,
        this.tokens[this.pos - 1]!.column,
        { depth, maxDepth: this.options.maxNestingDepth }
      );
    }

    this.state.headerPath = newPath;
  }

  /**
   * Parse an import directive: @import path [as alias]
   * Format: "@import ./path.odin" or "@import ./path.odin as myalias"
   */
  private parseImportDirective(doc: ParsedDocument): void {
    const token = this.tokens[this.pos]!;
    let content = this.getTokenVal(token);
    this.pos++;

    // Strip inline comments from directive
    const commentIdx = content.indexOf(' ;');
    if (commentIdx !== -1) {
      content = content.slice(0, commentIdx);
    }

    const match = content.match(/^@import\s+(.+?)(?:\s+as\s+(\w+))?\s*$/);
    if (!match) {
      throw new ParseError(`Invalid import directive syntax: ${content}`, 'P009', token.line, 0, {
        directive: content,
      });
    }

    let path = match[1]!.trim();
    const alias = match[2]?.trim();

    // Check for trailing 'as' without an identifier
    if (path.endsWith(' as') || path === 'as') {
      throw new ParseError('Import alias requires identifier after "as"', 'P009', token.line, 0, {
        directive: content,
      });
    }

    if (
      (path.startsWith('"') && path.endsWith('"')) ||
      (path.startsWith("'") && path.endsWith("'"))
    ) {
      path = path.slice(1, -1);
    }

    // Reject empty paths
    if (!path) {
      throw new ParseError('Import path cannot be empty', 'P009', token.line, 0, {
        directive: content,
      });
    }

    const importDirective: ImportDirective = {
      path,
      line: token.line,
    };
    if (alias) {
      importDirective.alias = alias;
    }
    doc.imports.push(importDirective);
  }

  /**
   * Parse a schema directive: @schema url
   */
  private parseSchemaDirective(doc: ParsedDocument): void {
    const token = this.tokens[this.pos]!;
    const content = this.getTokenVal(token);
    this.pos++;

    const match = content.match(/^@schema\s+(.+?)\s*$/);
    if (!match || !match[1]?.trim()) {
      throw new ParseError('Schema directive requires URL', 'P009', token.line, 0, {
        directive: content,
      });
    }

    const url = match[1].trim();
    const schemaDirective: SchemaDirective = {
      url,
      line: token.line,
    };
    doc.schemas.push(schemaDirective);
  }

  /**
   * Parse a conditional directive: @if condition
   */
  private parseConditionalDirective(doc: ParsedDocument): void {
    const token = this.tokens[this.pos]!;
    const content = this.getTokenVal(token);
    this.pos++;

    const match = content.match(/^@if\s+(.+?)\s*$/);
    if (!match || !match[1]?.trim()) {
      throw new ParseError('Conditional directive requires expression', 'P009', token.line, 0, {
        directive: content,
      });
    }

    const condition = match[1].trim();
    const conditionalDirective: ConditionalDirective = {
      condition,
      line: token.line,
    };
    doc.conditionals.push(conditionalDirective);
  }

  /**
   * Check if the current line is an assignment (contains = before newline).
   */
  private isAssignmentLine(): boolean {
    // An assignment line has the form: path = value
    // The first token(s) must form a valid path, followed by EQUALS.
    // We must not be fooled by EQUALS inside binary base64 data (^SGVsbG8=).
    let pos = this.pos;

    // First token must be a path-starting token
    if (pos >= this.tokens.length) return false;
    const first = this.tokens[pos]!;
    if (
      first.type !== TokenType.IDENTIFIER &&
      first.type !== TokenType.BOOLEAN &&
      first.type !== TokenType.PREFIX_EXTENSION &&
      first.type !== TokenType.PREFIX_META
    ) {
      return false;
    }

    // Scan path tokens until we hit EQUALS or something non-path
    while (pos < this.tokens.length) {
      const token = this.tokens[pos]!;
      if (token.type === TokenType.NEWLINE || token.type === TokenType.EOF) {
        return false;
      }
      if (token.type === TokenType.EQUALS) {
        return true;
      }
      if (
        token.type === TokenType.IDENTIFIER ||
        token.type === TokenType.BOOLEAN ||
        token.type === TokenType.ARRAY_INDEX ||
        token.type === TokenType.DOT ||
        token.type === TokenType.PREFIX_EXTENSION ||
        token.type === TokenType.PREFIX_META
      ) {
        pos++;
      } else {
        // Non-path token before EQUALS — not an assignment
        return false;
      }
    }
    return false;
  }

  /**
   * Parse an assignment: path = value
   */
  private parseAssignment(doc: ParsedDocument): void {
    const startToken = this.peek();

    let path = this.parsePath();

    if (this.state.headerPath.startsWith('$.table.')) {
      this.skipWs();

      while (this.peek().type === TokenType.COMMA) {
        this.advance();

        this.skipWs();

        const nextToken = this.peek();
        if (nextToken.type === TokenType.IDENTIFIER || nextToken.type === TokenType.NUMBER) {
          const keyPart = this.getTokenVal(this.advance());
          path = path + ', ' + keyPart;
        } else {
          break;
        }

        this.skipWs();
      }
    }

    const fullPath = this.resolvePath(path);

    const depth = getPathDepth(fullPath);
    if (depth > this.options.maxNestingDepth!) {
      throw new ParseError(
        `Maximum nesting depth exceeded: ${depth} > ${this.options.maxNestingDepth}`,
        'P010',
        startToken.line,
        startToken.column,
        { depth, maxDepth: this.options.maxNestingDepth }
      );
    }

    if (this.state.assignedPaths.has(fullPath)) {
      throw new ParseError(
        `Duplicate path assignment: ${fullPath}`,
        'P007',
        startToken.line,
        startToken.column,
        { path: fullPath }
      );
    }

    this.expect(TokenType.EQUALS, 'Expected =');

    this.skipWs();

    const modifiers = this.parseModifiers();

    let value = this.parseValue();

    const directives = this.parseTrailingDirectives();
    if (hasAnyModifier(modifiers) || directives) {
      value = {
        ...value,
        ...(hasAnyModifier(modifiers) ? { modifiers } : {}),
        ...(directives ? { directives } : {}),
      } as OdinValue;
    }

    this.state.assignedPaths.add(fullPath);
    this.trackArrayIndex(fullPath);

    if (fullPath.startsWith('$.') || fullPath === '$') {
      const metaPath = fullPath.startsWith('$.') ? fullPath.slice(2) : '';
      if (metaPath) {
        doc.metadata.set(metaPath, value);
      }
    } else {
      doc.assignments.set(fullPath, value);
    }

    if (hasAnyModifier(modifiers)) {
      doc.modifiers.set(fullPath, modifiers);
    }

    this.consumeToNewline();
  }

  /**
   * Parse a path.
   *
   * Validates path structure:
   * - Starts with identifier or extension prefix
   * - No consecutive dots (empty segments)
   * - No trailing dots
   */
  private parsePath(allowLeadingDot: boolean = false): string {
    let path = '';
    let needsDot = false;
    let lastWasDot = false;
    const startToken = this.peek();

    if (
      startToken.type !== TokenType.IDENTIFIER &&
      startToken.type !== TokenType.BOOLEAN &&
      startToken.type !== TokenType.ARRAY_INDEX &&
      startToken.type !== TokenType.PREFIX_EXTENSION
    ) {
      if (startToken.type === TokenType.DOT) {
        if (!allowLeadingDot) {
          throw new ParseError(
            'Path cannot start with a dot',
            'P003',
            startToken.line,
            startToken.column
          );
        }
        // Preserve leading dot for relative references (@.field)
        this.advance();
        path = '.';
        lastWasDot = true;
      } else {
        return path;
      }
    }

    while (!this.isAtEnd()) {
      const token = this.peek();

      if (token.type === TokenType.IDENTIFIER || token.type === TokenType.BOOLEAN) {
        const val = this.getTokenVal(token);
        if (needsDot) {
          path += '.' + val;
        } else {
          path += val;
        }
        needsDot = true;
        lastWasDot = false;
        this.advance();
      } else if (token.type === TokenType.ARRAY_INDEX) {
        // Array indices don't need dot prefix; normalize leading zeros (e.g. [007] -> [7])
        const raw = this.getTokenVal(token);
        const inner = raw.slice(1, -1); // strip [ ]
        const parsed = parseInt(inner, 10);
        path += Number.isNaN(parsed) ? raw : `[${parsed}]`;
        needsDot = true;
        lastWasDot = false;
        this.advance();
      } else if (token.type === TokenType.DOT) {
        if (lastWasDot) {
          throw new ParseError(
            'Invalid path: consecutive dots create empty segment',
            'P003',
            token.line,
            token.column
          );
        }
        lastWasDot = true;
        this.advance();
      } else if (token.type === TokenType.PREFIX_EXTENSION) {
        this.advance();
        let extPath = '&';
        let extLastWasDot = false;
        while (this.peek().type === TokenType.IDENTIFIER || this.peek().type === TokenType.DOT) {
          if (this.peek().type === TokenType.DOT) {
            if (extLastWasDot) {
              throw new ParseError(
                'Invalid extension path: consecutive dots',
                'P003',
                this.peek().line,
                this.peek().column
              );
            }
            extPath += '.';
            extLastWasDot = true;
          } else {
            extPath += this.getTokenVal(this.peek());
            extLastWasDot = false;
          }
          this.advance();
        }
        if (extLastWasDot) {
          throw new ParseError(
            'Invalid extension path: trailing dot',
            'P003',
            this.peek().line,
            this.peek().column
          );
        }
        if (needsDot) {
          path += '.' + extPath;
        } else {
          path += extPath;
        }
        needsDot = true;
        lastWasDot = false;
      } else {
        break;
      }
    }

    if (lastWasDot) {
      // Check if this is an XML attribute reference pattern .@attrName
      if (this.peek().type === TokenType.PREFIX_REFERENCE) {
        this.advance(); // consume @
        // Next should be an identifier (the attribute name)
        if (this.peek().type === TokenType.IDENTIFIER) {
          // Include the dot and @ as part of the property name
          path += '.@' + this.getTokenVal(this.peek());
          this.advance();
        } else {
          throw new ParseError(
            'Expected attribute name after .@',
            'P003',
            this.peek().line,
            this.peek().column
          );
        }
      } else if (path !== '.' || !allowLeadingDot) {
        // Standalone '.' only valid for current context references (@.)
        throw new ParseError(
          'Invalid path: trailing dot',
          'P003',
          this.peek().line,
          this.peek().column
        );
      }
    }

    return path;
  }

  /**
   * Parse modifiers: !, *, -
   */
  private parseModifiers(): OdinModifiers {
    const token = this.peek();

    if (
      token.type !== TokenType.MODIFIER_CRITICAL &&
      token.type !== TokenType.MODIFIER_REDACTED &&
      token.type !== TokenType.MODIFIER_DEPRECATED
    ) {
      return DEFAULT_MODIFIERS;
    }

    let required = false;
    let confidential = false;
    let deprecated = false;

    while (!this.isAtEnd()) {
      const t = this.peek();

      if (t.type === TokenType.MODIFIER_CRITICAL) {
        required = true;
        this.advance();
      } else if (t.type === TokenType.MODIFIER_REDACTED) {
        confidential = true;
        this.advance();
      } else if (t.type === TokenType.MODIFIER_DEPRECATED) {
        deprecated = true;
        this.advance();
      } else {
        break;
      }
    }

    return { required, confidential, deprecated };
  }

  /**
   * Parse a value.
   */
  private parseValue(): OdinValue {
    const token = this.peek();

    if (token.type === TokenType.PREFIX_NULL) {
      this.advance();
      return NULL_VALUE;
    }

    if (token.type === TokenType.PREFIX_BOOLEAN || token.type === TokenType.BOOLEAN) {
      return parseBoolean(token, this.parseContext);
    }

    if (token.type === TokenType.PREFIX_NUMBER) {
      this.advance();
      return parseTypedNumber('number', this.parseContext);
    }

    if (token.type === TokenType.PREFIX_INTEGER) {
      this.advance();
      return parseTypedNumber('integer', this.parseContext);
    }

    if (token.type === TokenType.PREFIX_CURRENCY) {
      this.advance();
      return parseTypedNumber('currency', this.parseContext);
    }

    if (token.type === TokenType.PREFIX_PERCENT) {
      this.advance();
      return parseTypedNumber('percent', this.parseContext);
    }

    if (token.type === TokenType.PREFIX_REFERENCE) {
      this.advance();
      // Handle @$const.NAME references
      if (this.peek().type === TokenType.PREFIX_META) {
        this.advance(); // consume $
        const metaPath = this.parsePath(false);
        return { type: 'reference', path: '$' + metaPath };
      }
      const refPath = this.parsePath(true);
      return { type: 'reference', path: refPath };
    }

    if (token.type === TokenType.PREFIX_BINARY) {
      this.advance();
      return parseBinaryValue(this.parseContext, this.tokens, this.pos);
    }

    if (token.type === TokenType.PREFIX_VERB) {
      this.advance();
      return this.parseVerbExpression();
    }

    if (token.type === TokenType.DATE) {
      this.advance();
      const val = this.getTokenVal(token);
      // Validate date semantically (leap years, month boundaries)
      const dateError = this.validateDateString(val, token);
      if (dateError) {
        throw dateError;
      }
      return { type: 'date', value: new Date(val), raw: val };
    }

    if (token.type === TokenType.TIMESTAMP) {
      this.advance();
      const val = this.getTokenVal(token);
      return { type: 'timestamp', value: new Date(val), raw: val };
    }

    if (token.type === TokenType.TIME) {
      this.advance();
      return { type: 'time', value: this.getTokenVal(token) };
    }

    if (token.type === TokenType.DURATION) {
      this.advance();
      return { type: 'duration', value: this.getTokenVal(token) };
    }

    if (token.type === TokenType.STRING_QUOTED) {
      this.advance();
      return { type: 'string', value: this.getTokenVal(token) };
    }

    if (token.type === TokenType.STRING_BARE || token.type === TokenType.IDENTIFIER) {
      const val = this.getTokenVal(token);
      throw new ParseError(
        `Unquoted string "${val}" - use double quotes: "${val}"`,
        'P002',
        token.line,
        token.column,
        { value: val }
      );
    }

    if (token.type === TokenType.NUMBER) {
      this.advance();
      const num = parseFloat(this.getTokenVal(token));
      return { type: 'number', value: num };
    }

    throw new ParseError(
      `Expected value but found ${this.describeToken(token)}`,
      'P001',
      token.line,
      token.column,
      { tokenType: token.type }
    );
  }

  /**
   * Parse a verb expression after the % prefix.
   *
   * Format: %verb arg1 arg2 ... or %&namespace.verb arg1 arg2 ...
   */
  private parseVerbExpression(): OdinVerbExpression {
    const startToken = this.peek();

    let isCustom = false;
    if (startToken.type === TokenType.PREFIX_EXTENSION) {
      isCustom = true;
      this.advance();
    }

    const verbToken = this.peek();
    if (verbToken.type !== TokenType.IDENTIFIER) {
      throw new ParseError(
        `Expected verb name after % prefix but found ${this.describeToken(verbToken)}`,
        'P001',
        verbToken.line,
        verbToken.column
      );
    }

    let verb = this.getTokenVal(verbToken);
    this.advance();

    // Consume additional .identifier sequences for namespaced custom verbs (e.g., %&com.example.verb)
    if (isCustom) {
      while (!this.isAtEnd() && this.peek().type === TokenType.DOT) {
        verb += '.';
        this.advance(); // consume DOT
        const nextIdent = this.peek();
        if (nextIdent.type !== TokenType.IDENTIFIER) {
          throw new ParseError(
            `Expected identifier after '.' in namespaced verb`,
            'P001',
            nextIdent.line,
            nextIdent.column
          );
        }
        verb += this.getTokenVal(nextIdent);
        this.advance();
      }
    }

    const arity = getVerbArity(verb);

    const args: OdinValue[] = [];
    let argCount = 0;

    this.skipWs();

    while (!this.isAtEnd()) {
      const nextToken = this.peek();

      if (
        nextToken.type === TokenType.NEWLINE ||
        nextToken.type === TokenType.COMMENT ||
        nextToken.type === TokenType.COLON ||
        nextToken.type === TokenType.EOF
      ) {
        break;
      }

      if (arity >= 0 && argCount >= arity) {
        break;
      }

      const arg = this.parseVerbArgument();
      args.push(arg);
      argCount++;

      this.skipWs();
    }

    const minArity = getVerbMinArity(verb);
    if (args.length < minArity) {
      const arityDesc = arity < 0 ? `at least ${minArity}` : `${arity}`;
      throw new ParseError(
        `Verb '${verb}' requires ${arityDesc} argument(s) but only ${args.length} provided`,
        'P001',
        verbToken.line,
        verbToken.column
      );
    }

    return { type: 'verb', verb, isCustom, args };
  }

  /**
   * Parse a single verb argument, including trailing directives.
   */
  private parseVerbArgument(): OdinValue {
    const token = this.peek();
    let value: OdinValue;

    if (token.type === TokenType.PREFIX_REFERENCE) {
      this.advance();
      // Handle @$const.NAME references
      if (this.peek().type === TokenType.PREFIX_META) {
        this.advance(); // consume $
        const metaPath = this.parsePath(false);
        value = { type: 'reference', path: '$' + metaPath };
      } else {
        const refPath = this.parsePath(true);
        value = { type: 'reference', path: refPath };
      }
    } else if (token.type === TokenType.PREFIX_VERB) {
      this.advance();
      // Nested verb expressions handle their own directives
      return this.parseVerbExpression();
    } else if (token.type === TokenType.STRING_QUOTED) {
      this.advance();
      value = { type: 'string', value: this.getTokenVal(token) };
    } else if (token.type === TokenType.PREFIX_NUMBER) {
      this.advance();
      value = parseTypedNumber('number', this.parseContext);
    } else if (token.type === TokenType.PREFIX_INTEGER) {
      this.advance();
      value = parseTypedNumber('integer', this.parseContext);
    } else if (token.type === TokenType.PREFIX_CURRENCY) {
      this.advance();
      value = parseTypedNumber('currency', this.parseContext);
    } else if (token.type === TokenType.PREFIX_PERCENT) {
      this.advance();
      value = parseTypedNumber('percent', this.parseContext);
    } else if (token.type === TokenType.NUMBER) {
      this.advance();
      const num = parseFloat(this.getTokenVal(token));
      value = { type: 'number', value: num };
    } else if (token.type === TokenType.BOOLEAN || token.type === TokenType.PREFIX_BOOLEAN) {
      value = parseBoolean(token, this.parseContext);
    } else if (token.type === TokenType.PREFIX_NULL) {
      this.advance();
      value = NULL_VALUE;
    } else if (token.type === TokenType.IDENTIFIER) {
      this.advance();
      // Consume dotted path segments (e.g., STATUS.code in %lookup STATUS.code ...)
      let identValue = this.getTokenVal(token);
      while (!this.isAtEnd() && this.peek().type === TokenType.DOT) {
        this.advance(); // consume DOT
        const nextToken = this.peek();
        if (nextToken.type === TokenType.IDENTIFIER) {
          identValue += '.' + this.getTokenVal(nextToken);
          this.advance();
        } else {
          // Trailing dot — just append it and stop
          identValue += '.';
          break;
        }
      }
      value = { type: 'string', value: identValue };
    } else {
      throw new ParseError(
        `Unexpected token in verb argument: ${this.describeToken(token)}`,
        'P001',
        token.line,
        token.column
      );
    }

    // Parse trailing directives for this argument (e.g., @_line :pos 3 :len 8)
    const directives = this.parseTrailingDirectives();
    if (directives) {
      value = { ...value, directives } as OdinValue;
    }

    return value;
  }

  /**
   * Parse a lookup table row (comma-separated values, no = sign).
   */
  private parseTableRow(doc: ParsedDocument): void {
    this.skipWs();

    if (this.peek().type === TokenType.NEWLINE) {
      this.consumeToNewline();
      return;
    }

    const values: (OdinValue | undefined)[] = [];

    while (!this.isAtEnd() && this.peek().type !== TokenType.NEWLINE) {
      this.skipWs();

      if (this.peek().type === TokenType.NEWLINE) break;

      if (this.peek().type === TokenType.COMMA) {
        values.push(undefined);
        this.advance();
        continue;
      }

      const value = this.parseValue();
      values.push(value);

      // Skip whitespace and comma
      this.skipWs();

      if (this.peek().type === TokenType.COMMA) {
        this.advance();
      } else if (this.peek().type !== TokenType.NEWLINE) {
        break;
      }
    }

    if (values.length > this.state.tableColumns.length) {
      throw new ParseError(
        `Table row has ${values.length} values but only ${this.state.tableColumns.length} columns defined`,
        'P008',
        this.tokens[this.pos - 1]?.line ?? 1,
        this.tokens[this.pos - 1]?.column ?? 1
      );
    }

    if (values.length > 0) {
      const rowIndex = this.state.tableRowIndex;

      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value === undefined) continue;

        const colName = this.state.tableColumns[i]!;
        const fullPath = `$.table.${this.state.tableName}[${rowIndex}].${colName}`;

        doc.assignments.set(fullPath, value);
        this.state.assignedPaths.add(fullPath);
      }

      this.state.tableRowIndex++;
    }

    this.consumeToNewline();
  }

  /**
   * Parse a tabular row.
   */
  private parseTabularRow(doc: ParsedDocument): void {
    if (this.state.tabularPrimitiveMode) {
      this.skipWs();

      if (this.peek().type === TokenType.NEWLINE) {
        this.consumeToNewline();
        return;
      }

      const value = this.parseValue();

      const rowIndex = this.state.tabularRowIndex;
      const fullPath = this.state.tabularArrayPath.replace('[]', `[${rowIndex}]`);

      doc.assignments.set(fullPath, value);
      this.state.assignedPaths.add(fullPath);
      this.trackArrayIndex(fullPath);

      this.state.tabularRowIndex++;
      this.consumeToNewline();
      return;
    }

    const values: (OdinValue | undefined)[] = [];

    while (!this.isAtEnd() && this.peek().type !== TokenType.NEWLINE) {
      this.skipWs();

      if (this.peek().type === TokenType.NEWLINE) break;

      if (this.peek().type === TokenType.COMMA) {
        values.push(undefined);
        this.advance();
        continue;
      }

      this.parseModifiers();

      const value = this.parseValue();
      values.push(value);

      // Skip whitespace and comma
      this.skipWs();

      if (this.peek().type === TokenType.COMMA) {
        this.advance();
      } else if (this.peek().type !== TokenType.NEWLINE) {
        break;
      }
    }

    if (values.length > this.state.tabularColumns.length) {
      throw new ParseError(
        `Tabular row has ${values.length} values but only ${this.state.tabularColumns.length} columns defined`,
        'P008',
        this.tokens[this.pos - 1]?.line ?? 1,
        this.tokens[this.pos - 1]?.column ?? 1
      );
    }

    if (values.length > 0) {
      const rowIndex = this.state.tabularRowIndex;
      const basePath = this.state.tabularArrayPath.replace('[]', `[${rowIndex}]`);

      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value === undefined) {
          continue;
        }
        const colName = this.state.tabularColumns[i]!;
        const fullPath = `${basePath}.${colName}`;

        doc.assignments.set(fullPath, value);
        this.state.assignedPaths.add(fullPath);
        this.trackArrayIndex(fullPath);
      }

      this.state.tabularRowIndex++;
    }

    this.consumeToNewline();
  }

  /**
   * Resolve a path relative to current header.
   */
  private resolvePath(path: string): string {
    const headerPath = this.state.headerPath;
    if (!path) return headerPath;
    if (!headerPath) return internPath(path);
    return internPath(headerPath + '.' + path);
  }

  /**
   * Track array index for contiguity validation.
   */
  private trackArrayIndex(path: string): void {
    const safeMultiplyThreshold = Math.floor(SECURITY_LIMITS.MAX_ARRAY_INDEX / 10);
    const maxIndex = SECURITY_LIMITS.MAX_ARRAY_INDEX;

    // First pass: check all bracket indices for P015 (range check)
    // Also compute cumulative sum to catch chained large indices
    let cumulativeIndex = 0;
    let searchStart = 0;
    while (true) {
      const bracketIdx = path.indexOf('[', searchStart);
      if (bracketIdx === -1) break;
      const closeBracketIdx = path.indexOf(']', bracketIdx);
      if (closeBracketIdx === -1) break;

      let index = 0;
      let valid = true;
      for (let i = bracketIdx + 1; i < closeBracketIdx; i++) {
        const code = path.charCodeAt(i);
        if (code < 48 || code > 57) { valid = false; break; }
        if (index > safeMultiplyThreshold) {
          throw new ParseError(
            `Array index exceeds maximum allowed value of ${maxIndex}`,
            'P015',
            this.tokens[this.pos]?.line ?? 1,
            this.tokens[this.pos]?.column ?? 1
          );
        }
        index = index * 10 + (code - 48);
        if (index > maxIndex) {
          throw new ParseError(
            `Array index ${index} exceeds maximum allowed value of ${maxIndex}`,
            'P015',
            this.tokens[this.pos]?.line ?? 1,
            this.tokens[this.pos]?.column ?? 1
          );
        }
      }

      if (valid) {
        cumulativeIndex += index;
        if (cumulativeIndex > maxIndex) {
          throw new ParseError(
            `Cumulative array indices exceed maximum allowed value of ${maxIndex}`,
            'P015',
            this.tokens[this.pos]?.line ?? 1,
            this.tokens[this.pos]?.column ?? 1
          );
        }
      }

      searchStart = closeBracketIdx + 1;
    }

    // Second pass: track first array index for contiguity validation
    const bracketIdx = path.indexOf('[');
    if (bracketIdx === -1) return;
    const closeBracketIdx = path.indexOf(']', bracketIdx);
    if (closeBracketIdx === -1) return;

    const arrayPath = path.slice(0, bracketIdx);
    let index = 0;
    for (let i = bracketIdx + 1; i < closeBracketIdx; i++) {
      const code = path.charCodeAt(i);
      if (code < 48 || code > 57) return;
      index = index * 10 + (code - 48);
    }

    let indices = this.state.arrayIndices.get(arrayPath);
    if (!indices) {
      indices = [];
      this.state.arrayIndices.set(arrayPath, indices);
    }
    if (!indices.includes(index)) {
      indices.push(index);
    }
  }

  /**
   * Validate that all arrays have contiguous indices.
   * Delegates to extracted array-validator module (SOC).
   */
  private validateArrayContiguityInternal(): void {
    validateArrayContiguity(this.state.arrayIndices);
  }

  /**
   * Parse trailing directives after a value.
   *
   * Syntax: :name [value] :name [value] ...
   * - Directive names are identifiers (e.g., pos, len, trim)
   * - Values can be integers, strings, or identifiers
   * - Directives without values are flags (e.g., :trim)
   *
   * @returns Array of directives, or undefined if none found
   */
  private parseTrailingDirectives(): OdinDirective[] | undefined {
    const directives: OdinDirective[] = [];

    while (!this.isAtEnd()) {
      // Prevent resource exhaustion from too many directives
      if (directives.length >= SECURITY_LIMITS.MAX_DIRECTIVES_PER_ASSIGNMENT) {
        throw new ParseError(
          `Too many directives (max ${SECURITY_LIMITS.MAX_DIRECTIVES_PER_ASSIGNMENT})`,
          'P009',
          this.tokens[this.pos]?.line ?? 1,
          this.tokens[this.pos]?.column ?? 1
        );
      }

      // Skip whitespace
      this.skipWs();

      const token = this.peek();

      // Stop at end of line or comment
      if (
        token.type === TokenType.NEWLINE ||
        token.type === TokenType.COMMENT ||
        token.type === TokenType.EOF
      ) {
        break;
      }

      // Look for colon to start a directive
      if (token.type !== TokenType.COLON) {
        // Not a directive, stop parsing
        break;
      }

      // Consume the colon
      this.advance();

      // Skip whitespace after colon (though typically there isn't any)
      this.skipWs();

      // Get directive name (must be an identifier)
      const nameToken = this.peek();
      if (nameToken.type !== TokenType.IDENTIFIER) {
        throw new ParseError(
          `Expected directive name after ':'`,
          'P009',
          nameToken.line,
          nameToken.column,
          { found: this.getTokenVal(nameToken) }
        );
      }
      const name = this.getTokenVal(nameToken);
      this.advance();

      // Skip whitespace
      this.skipWs();

      // Check if there's a value for this directive
      const nextToken = this.peek();
      let value: string | number | undefined;

      if (
        nextToken.type === TokenType.NEWLINE ||
        nextToken.type === TokenType.COMMENT ||
        nextToken.type === TokenType.EOF ||
        nextToken.type === TokenType.COLON
      ) {
        // No value - this is a flag directive
        directives.push({ name });
      } else if (nextToken.type === TokenType.NUMBER) {
        // Numeric value
        const numStr = this.getTokenVal(nextToken);
        value = numStr.includes('.') ? parseFloat(numStr) : parseInt(numStr, 10);
        this.advance();
        directives.push({ name, value });
      } else if (nextToken.type === TokenType.PREFIX_INTEGER) {
        // Integer with ## prefix
        this.advance();
        const numToken = this.peek();
        if (numToken.type === TokenType.NUMBER) {
          value = parseInt(this.getTokenVal(numToken), 10);
          this.advance();
          directives.push({ name, value });
        } else {
          throw new ParseError(`Expected number after ##`, 'P001', numToken.line, numToken.column);
        }
      } else if (nextToken.type === TokenType.PREFIX_NUMBER) {
        // Number with # prefix
        this.advance();
        const numToken = this.peek();
        if (numToken.type === TokenType.NUMBER) {
          const numStr = this.getTokenVal(numToken);
          value = parseFloat(numStr);
          this.advance();
          directives.push({ name, value });
        } else {
          throw new ParseError(`Expected number after #`, 'P001', numToken.line, numToken.column);
        }
      } else if (nextToken.type === TokenType.STRING_QUOTED) {
        if (FLAG_ONLY_DIRECTIVES.has(name)) {
          // Flag directive - string belongs to next argument
          directives.push({ name });
          break;
        }
        value = this.getTokenVal(nextToken);
        this.advance();
        directives.push({ name, value });
      } else if (nextToken.type === TokenType.IDENTIFIER) {
        if (FLAG_ONLY_DIRECTIVES.has(name)) {
          // Flag directive - identifier belongs to next argument
          directives.push({ name });
          break;
        }
        value = this.getTokenVal(nextToken);
        this.advance();
        directives.push({ name, value });
      } else if (nextToken.type === TokenType.MODIFIER_DEPRECATED) {
        // Negative number (- is parsed as deprecated modifier)
        this.advance();
        const numToken = this.peek();
        if (numToken.type === TokenType.NUMBER) {
          const numStr = this.getTokenVal(numToken);
          value = numStr.includes('.') ? -parseFloat(numStr) : -parseInt(numStr, 10);
          this.advance();
          directives.push({ name, value });
        } else {
          throw new ParseError(`Expected number after -`, 'P001', numToken.line, numToken.column);
        }
      } else {
        // Unknown token type - treat as no value (flag)
        directives.push({ name });
      }
    }

    return directives.length > 0 ? directives : undefined;
  }

  /**
   * Consume tokens until newline.
   */
  private consumeToNewline(): void {
    const tokens = this.tokens;
    const len = tokens.length;
    while (this.pos < len) {
      const token = tokens[this.pos]!;
      const type = token.type;
      if (type === TokenType.NEWLINE) {
        this.pos++;
        return;
      }
      if (type === TokenType.COMMENT || type === TokenType.EOF) {
        this.pos++;
        return;
      }
      if (type === TokenType.WHITESPACE) {
        this.pos++;
        continue;
      }
      throw new ParseError(`Unexpected content after value`, 'P001', token.line, token.column, {
        found: this.getTokenVal(token),
      });
    }
  }

  /**
   * Expect a token type.
   */
  private expect(type: TokenType, message: string): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new ParseError(message, 'P001', token.line, token.column);
    }
    return this.advance();
  }

  /** Cached EOF token to avoid repeated allocations */
  private static readonly EOF_TOKEN: Token = {
    type: TokenType.EOF,
    value: '',
    line: 1,
    column: 1,
    start: 0,
    end: 0,
  };

  /**
   * Get token value, extracting from source if needed.
   */
  private getTokenVal(token: Token): string {
    if (token.value !== SPAN_ONLY_SENTINEL) return token.value;
    return getTokenValue(this.source, token);
  }

  /**
   * Peek at current token.
   */
  private peek(): Token {
    return this.pos < this.tokens.length ? this.tokens[this.pos]! : Parser.EOF_TOKEN;
  }

  /**
   * Advance to next token.
   */
  private advance(): Token {
    const token = this.tokens[this.pos]!;
    this.pos++;
    return token;
  }

  /**
   * Check if at end of tokens.
   */
  private isAtEnd(): boolean {
    if (this.pos >= this.tokens.length) return true;
    return this.tokens[this.pos]!.type === TokenType.EOF;
  }

  /**
   * Get human-readable description of a token for error messages.
   */
  private describeToken(token: Token): string {
    switch (token.type) {
      case TokenType.EOF:
        return 'end of input';
      case TokenType.NEWLINE:
        return 'newline';
      case TokenType.HEADER_OPEN:
        return "'{'";
      case TokenType.HEADER_CLOSE:
        return "'}'";
      case TokenType.EQUALS:
        return "'='";
      case TokenType.COMMA:
        return "','";
      case TokenType.COLON:
        return "':'";
      case TokenType.DOT:
        return "'.'";
      default: {
        const val = this.getTokenVal(token);
        return val ? `'${val}'` : `token type ${token.type}`;
      }
    }
  }

  /**
   * Validate a date string semantically (leap years, month boundaries).
   */
  private validateDateString(dateStr: string, token: Token): ParseError | null {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return new ParseError(`Invalid date format: ${dateStr}`, 'P001', token.line, 0, {
        value: dateStr,
      });
    }

    const year = parseInt(match[1]!, 10);
    const month = parseInt(match[2]!, 10);
    const day = parseInt(match[3]!, 10);

    if (month < 1 || month > 12) {
      return new ParseError(`Invalid month: ${month}`, 'P001', token.line, 0, {
        value: dateStr,
      });
    }

    const maxDays = this.getDaysInMonth(month, year);
    if (day < 1 || day > maxDays) {
      return new ParseError(
        `Invalid day ${day} for ${year}-${month.toString().padStart(2, '0')}`,
        'P001',
        token.line,
        0,
        { value: dateStr }
      );
    }

    return null;
  }

  /**
   * Check if a year is a leap year.
   */
  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  /**
   * Get the number of days in a month.
   */
  private getDaysInMonth(month: number, year: number): number {
    const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month === 2 && this.isLeapYear(year)) {
      return 29;
    }
    return days[month] ?? 0;
  }
}

/**
 * Parse ODIN source text into a parsed document structure.
 *
 * @param source - ODIN text to parse
 * @param options - Optional parse configuration
 * @returns Parsed document with assignments, metadata, and modifiers
 * @throws {ParseError} If the source contains invalid ODIN syntax
 */
export function parse(source: string, options?: ParseOptions): ParsedDocument {
  const parser = new Parser(options);
  return parser.parse(source);
}
