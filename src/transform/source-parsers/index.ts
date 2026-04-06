/**
 * ODIN Transform Source Parsers
 *
 * Registry-based parsing for source formats (JSON, XML, CSV, etc.).
 */

import type { ParsedSource, SourceParserOptions } from './types.js';
import { parseJson } from './json-parser.js';
import { parseXml } from './xml-parser.js';
import { parseCsv } from './csv-parser.js';
import { parseFixedWidth } from './fixed-width-parser.js';
import { parseFlat } from './flat-parser.js';
import { parseYaml } from './yaml-parser.js';

// Re-export types
export type { ParsedSource, SourceParserOptions, FixedWidthField } from './types.js';

// Re-export individual parsers
export { parseJson } from './json-parser.js';
export { parseXml } from './xml-parser.js';
export { parseCsv } from './csv-parser.js';
export { parseFixedWidth, parseFixedWidthRecord } from './fixed-width-parser.js';
export { parseFlat } from './flat-parser.js';
export { parseYaml } from './yaml-parser.js';

// Re-export utilities
export { extractDiscriminator, extractFixedWidthDiscriminator } from './utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Source Parser Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parser function type for source formats.
 */
export type SourceParser = (input: string, options?: SourceParserOptions) => unknown;

/**
 * Registry of source parsers by format name.
 * Allows adding new formats without modifying parseSource().
 */
const sourceParserRegistry = new Map<string, SourceParser>();

/**
 * Register a source parser for a format.
 *
 * @param format - Format name (e.g., 'json', 'xml')
 * @param parser - Parser function
 */
export function registerSourceParser(format: string, parser: SourceParser): void {
  sourceParserRegistry.set(format, parser);
}

/**
 * Get a registered source parser.
 *
 * @param format - Format name
 * @returns Parser function or undefined if not registered
 */
export function getSourceParser(format: string): SourceParser | undefined {
  return sourceParserRegistry.get(format);
}

// Register built-in parsers
registerSourceParser('json', parseJson);
registerSourceParser('xml', parseXml);
registerSourceParser('csv', parseCsv);
registerSourceParser('delimited', parseCsv);
registerSourceParser('fixed-width', parseFixedWidth);
registerSourceParser('flat', parseFlat);
registerSourceParser('properties', parseFlat);
registerSourceParser('yaml', parseYaml);

/**
 * Parse source data based on format specification.
 *
 * @param input - Raw input string
 * @param format - Source format type
 * @param options - Parser options
 * @returns Parsed data as JavaScript object
 */
export function parseSource(
  input: string,
  format: string,
  options?: SourceParserOptions
): ParsedSource {
  const parser = sourceParserRegistry.get(format);

  if (parser) {
    return { data: parser(input, options), raw: input };
  }

  // Unknown format - return as-is (assume pre-parsed)
  return { data: input, raw: input };
}
