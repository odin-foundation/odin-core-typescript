/**
 * ODIN Schema Import Parser
 *
 * Parses @import directives from schema files.
 */

import type { SchemaImport } from '../types/schema.js';
import type { SchemaTokenReader } from './schema-token-reader.js';

/**
 * Parse an @import directive.
 *
 * Format: @import "path" [as alias]
 *
 * @param reader - Token reader positioned at DIRECTIVE_IMPORT token
 * @returns Parsed import or null if invalid
 */
export function parseImportDirective(reader: SchemaTokenReader): SchemaImport | null {
  const token = reader.peek();
  const line = token.line;

  // Consume the DIRECTIVE_IMPORT token
  reader.advance();

  // The directive value contains the rest of the line after "@import "
  // Format: "path" or "path as alias"
  const directiveValue = reader.getTokenVal(token);

  // Parse path and optional alias from the directive value
  let importPath = '';
  let alias: string | undefined;

  // Remove the "@import " prefix if present
  const content = directiveValue.replace(/^@import\s+/, '').trim();

  // Check for "as alias" pattern
  const asMatch = content.match(/^(.+?)\s+as\s+(\w+)$/);
  if (asMatch) {
    importPath = asMatch[1]!.trim();
    alias = asMatch[2];
  } else {
    importPath = content;
  }

  // Remove surrounding quotes if present
  if (
    (importPath.startsWith('"') && importPath.endsWith('"')) ||
    (importPath.startsWith("'") && importPath.endsWith("'"))
  ) {
    importPath = importPath.slice(1, -1);
  }

  reader.consumeToNewline();

  if (!importPath) {
    return null;
  }

  return alias !== undefined ? { path: importPath, alias, line } : { path: importPath, line };
}
