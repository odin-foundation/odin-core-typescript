/**
 * ODIN Validator module.
 */

export { validate } from './validate.js';
export { parseSchema } from './schema-parser.js';

// Re-export from extracted modules for advanced usage
export {
  validateConstraint,
  validateBounds,
  validatePattern,
  validateFormat,
  validateCardinality,
  validateInvariant,
  addError,
  addWarning,
  type ConstraintValidationContext,
  type CardinalityValidationContext,
} from './validate-constraints.js';

export {
  isUnsafeRegexPattern,
  safeRegexTest,
  estimatePatternComplexity,
  MAX_REGEX_PATTERN_LENGTH,
  MAX_REGEX_EXECUTION_MS,
  MAX_PATTERN_STRING_LENGTH,
  type SafeRegexResult,
} from './validate-redos.js';

// Streaming schema parser with lazy type resolution
export {
  StreamingSchemaParser,
  parseSchemaStreaming,
  parseSchemaFromChunks,
  type StreamingSchemaEvents,
  type UnresolvedTypeRef,
  type ResolutionResult,
} from './streaming-schema-parser.js';
