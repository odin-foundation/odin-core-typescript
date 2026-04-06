/**
 * ODIN Transform Source Parsers
 *
 * Backward compatibility wrapper - imports from source-parsers/ modules.
 *
 * Handles parsing of various source formats into JavaScript objects
 * that can be processed by the transform engine.
 *
 * Supported formats:
 * - JSON: Standard JSON parsing
 * - XML: Element-based XML to object conversion
 * - CSV: Delimited text to array of objects
 * - Fixed-Width: Position-based field extraction
 * - Flat: Key=value pairs with dot notation paths
 */

// Re-export everything from the modular implementation
export type { ParsedSource, SourceParserOptions, FixedWidthField } from './source-parsers/index.js';

export {
  parseSource,
  parseJson,
  parseXml,
  parseCsv,
  parseFixedWidth,
  parseFixedWidthRecord,
  parseFlat,
  parseYaml,
  extractDiscriminator,
  extractFixedWidthDiscriminator,
} from './source-parsers/index.js';
