/**
 * ODIN Schema Parser - Type definitions and interfaces.
 */

import type { Token } from '../parser/tokens.js';
import type {
  SchemaField,
  SchemaConstraint,
  SchemaConditional,
  ConditionalOperator,
} from '../types/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// Header Types
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

// ─────────────────────────────────────────────────────────────────────────────
// Parser Context Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface for parser context shared between parsing modules.
 * This allows modular parsers to access shared state and utilities.
 */
export interface ParserContext {
  /** Source text being parsed */
  source: string;

  /** Token stream */
  tokens: Token[];

  /** Current position in token stream */
  pos: number;

  /** Parser state */
  state: SchemaParserState;

  // Token utilities
  peek(): Token;
  peekAhead(n: number): Token;
  advance(): Token;
  isAtEnd(): boolean;
  getTokenVal(token: Token): string;
  expect(type: number, message: string): Token;
  skipWhitespace(): void;
  skipNewlines(): void;
  consumeToNewline(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conditional Parsing Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of parsing a conditional operator and value.
 */
export interface ConditionalParseResult {
  operator: ConditionalOperator;
  value: string | number | boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Parse Accumulator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mutable field accumulator used during parsing.
 * Converted to SchemaField when parsing completes.
 */
export interface FieldAccumulator {
  path: string;
  type: SchemaField['type'];
  required: boolean;
  nullable: boolean;
  redacted: boolean;
  deprecated: boolean;
  computed: boolean;
  immutable: boolean;
  constraints: SchemaConstraint[];
  conditionals: SchemaConditional[];
  defaultValue?: SchemaField['defaultValue'];
}

/**
 * Create a field accumulator with defaults.
 */
export function createFieldAccumulator(path: string): FieldAccumulator {
  return {
    path,
    type: { kind: 'string' },
    required: false,
    nullable: false,
    redacted: false,
    deprecated: false,
    computed: false,
    immutable: false,
    constraints: [],
    conditionals: [],
  };
}
