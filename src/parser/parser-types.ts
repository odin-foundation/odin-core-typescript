/**
 * ODIN Parser Types - Exported types for parser module.
 * @module
 */

import type { OdinValue, OdinModifiers } from '../types/values.js';

/**
 * Parsed assignment with path, value, and modifiers.
 */
export interface ParsedAssignment {
  path: string;
  value: OdinValue;
  modifiers: OdinModifiers;
  line: number;
  column: number;
}

/**
 * Import reference parsed from @import directive.
 */
export interface ImportDirective {
  /** Import path (relative, absolute, or URL) */
  path: string;
  /** Optional alias for namespacing */
  alias?: string;
  /** Line number where import appears */
  line: number;
}

/**
 * Schema reference parsed from @schema directive.
 */
export interface SchemaDirective {
  /** Schema URL */
  url: string;
  /** Line number where schema directive appears */
  line: number;
}

/**
 * Conditional directive parsed from @if directive.
 *
 * Design Decision: The parser extracts conditions but does NOT evaluate them.
 * Evaluation is delegated to the application layer. See ODIN 1.0 Specification.
 */
export interface ConditionalDirective {
  /** Condition expression (e.g., 'policy.state = "TX"') */
  condition: string;
  /** Line number where conditional appears */
  line: number;
}

/**
 * Parsed document structure.
 */
export interface ParsedDocument {
  metadata: Map<string, OdinValue>;
  assignments: Map<string, OdinValue>;
  modifiers: Map<string, OdinModifiers>;
  /** Import directives from @import statements */
  imports: ImportDirective[];
  /** Schema directives from @schema statements */
  schemas: SchemaDirective[];
  /** Conditional directives from @if statements */
  conditionals: ConditionalDirective[];
  /** For multi-doc support */
  chainedDocuments?: ParsedDocument[];
}

/**
 * Parser state.
 */
export interface ParserState {
  /** Current header context */
  headerPath: string;

  /** Whether in tabular mode */
  tabularMode: boolean;

  /** Whether in primitive array tabular mode ({path[] : ~}) */
  tabularPrimitiveMode: boolean;

  /** Tabular column names */
  tabularColumns: string[];

  /** Tabular array path */
  tabularArrayPath: string;

  /** Current tabular row index */
  tabularRowIndex: number;

  /** Previous header path (before entering tabular mode) */
  previousHeaderPath: string;

  /** Whether in lookup table mode (no = signs, just comma-separated values) */
  tableMode: boolean;

  /** Table name when in tableMode */
  tableName: string;

  /** Table column names when in tableMode */
  tableColumns: string[];

  /** Current table row index */
  tableRowIndex: number;

  /** Track assigned paths for duplicate detection */
  assignedPaths: Set<string>;

  /** Track array indices per array path */
  arrayIndices: Map<string, number[]>;

  /** Pending inline discriminator from header (e.g., {segment :type "value"}) */
  pendingDiscriminator?: { key: string; value: string } | undefined;
}
