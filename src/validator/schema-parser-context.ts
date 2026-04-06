/**
 * ODIN Schema Parser Context
 *
 * Shared types and interfaces for schema parsing.
 */

import type { Token } from '../parser/tokens.js';
import { TokenType } from '../parser/tokens.js';
import type { OdinValue } from '../types/values.js';
import type {
  SchemaType,
  SchemaField,
  SchemaArray,
  SchemaObjectConstraint,
  SchemaImport,
  SchemaMetadata,
} from '../types/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Header Type Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Header type classification for schema parsing.
 */
export type SchemaHeaderType =
  | { kind: 'metadata' }
  | { kind: 'derivation' }
  | {
      kind: 'typeDefinition';
      name: string;
      namespace?: string | undefined;
      isArray?: boolean | undefined;
    }
  | { kind: 'object'; path: string }
  | { kind: 'array'; path: string; columns?: string[] | undefined };

// ─────────────────────────────────────────────────────────────────────────────
// Parser State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal parser state.
 */
export interface SchemaParserState {
  /** Current header context */
  currentHeader: SchemaHeaderType | null;

  /** Current path prefix from header */
  currentPath: string;

  /** Track defined type names for duplicate detection */
  definedTypes: Set<string>;

  /** Track defined field paths */
  definedFields: Set<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser Context Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context provided to sub-parsers.
 *
 * Provides access to:
 * - Token navigation (peek, advance, etc.)
 * - Parser state (current header, path, etc.)
 * - Result accumulators (types, fields, etc.)
 */
export interface SchemaParserContext {
  // Token navigation
  peek(): Token;
  peekAhead(n: number): Token;
  advance(): Token;
  isAtEnd(): boolean;
  getTokenVal(token: Token): string;
  expect(type: TokenType, message: string): Token;
  skipNewlines(): void;
  skipWhitespace(): void;
  consumeToNewline(): void;

  // State access
  getState(): SchemaParserState;
  setState(state: Partial<SchemaParserState>): void;

  // Result accumulators
  getMetadata(): SchemaMetadata;
  setMetadata(metadata: SchemaMetadata): void;
  addImport(imp: SchemaImport): void;
  addType(name: string, type: SchemaType): void;
  addField(path: string, field: SchemaField): void;
  addArray(path: string, array: SchemaArray): void;
  addObjectConstraint(path: string, constraint: SchemaObjectConstraint): void;

  // Type building context
  getCurrentTypeName(): string;
  setCurrentTypeName(name: string): void;
  getCurrentTypeFields(): Map<string, SchemaField>;
  clearCurrentTypeFields(): void;

  // Array building context
  getCurrentArrayPath(): string;
  setCurrentArrayPath(path: string): void;
  getCurrentArrayFields(): Map<string, SchemaField>;
  clearCurrentArrayFields(): void;
  getCurrentArrayColumns(): string[] | undefined;
  setCurrentArrayColumns(columns: string[] | undefined): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Parser Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface for schema sub-parsers.
 *
 * Sub-parsers handle specific parsing tasks (imports, headers, fields, etc.)
 * and use the shared context for state and token access.
 */
export interface SchemaSubParser<T = void> {
  /**
   * Parse from current position.
   * @param ctx - Parser context
   * @returns Parsed result (if applicable)
   */
  parse(ctx: SchemaParserContext): T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default value for a field.
 */
export interface SchemaDefaultValue {
  value: OdinValue;
  raw?: string;
}

/**
 * Enum constraint definition.
 */
export interface SchemaEnumDefinition {
  values: string[];
  caseInsensitive?: boolean;
}

/**
 * Create initial parser state.
 */
export function createInitialState(): SchemaParserState {
  return {
    currentHeader: null,
    currentPath: '',
    definedTypes: new Set(),
    definedFields: new Set(),
  };
}
