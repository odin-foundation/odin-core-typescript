/**
 * ODIN Transform Module
 *
 * Provides transformation capabilities between ODIN and external formats.
 */

export { parseTransform } from './parser.js';
export { executeTransform, transformDocument, executeMultiRecordTransform } from './engine.js';
export type { TransformOptions, MultiRecordInput } from './engine.js';
export { defaultVerbRegistry, createVerbRegistry } from './verbs.js';
export { VERB_ARITY } from './arity.js';
export { TransformErrorCodes } from './errors.js';
export type { TransformErrorCode } from './errors.js';

// Source parsers
export {
  parseSource,
  parseJson,
  parseXml,
  parseCsv,
  parseFixedWidth,
  parseFlat,
  parseFixedWidthRecord,
  extractFixedWidthDiscriminator,
  extractDiscriminator,
} from './source-parsers.js';
export type { ParsedSource, SourceParserOptions, FixedWidthField } from './source-parsers.js';
