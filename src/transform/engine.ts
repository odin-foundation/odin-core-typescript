/**
 * ODIN Transform Engine
 *
 * Executes ODIN Transform documents to convert data between formats.
 */

import type { OdinDocument } from '../types/document.js';
import type {
  OdinTransform,
  TransformContext,
  TransformResult,
  TransformError,
  TransformWarning,
  TransformValue,
  TransformSegment,
  FieldMapping,
  ValueExpression,
  VerbRegistry,
} from '../types/transform.js';
import { defaultVerbRegistry } from './verbs.js';
import { resolvePath } from './utils.js';
import { getVerbArity, getVerbMinArity } from './arity.js';
import { validateVerbArgTypes } from './signatures.js';
import { formatOutput } from './formatters.js';
import { Odin } from '../odin.js';
import { parseSource } from './source-parsers.js';
import {
  unknownVerbError,
  configError,
  unknownRecordTypeError,
  unknownRecordTypeWarning,
  sourceMissingError,
  transformError,
  transformWarning,
  TypeValidationError,
  isModifierCompatible,
  invalidModifierWarning,
} from './errors.js';
import { setNestedValue, getSegmentOutputPath } from './engine-paths.js';
import { evaluateCondition } from './engine-conditions.js';
import { applyModifiers } from './engine-modifiers.js';
import { interpolateString } from './engine-interpolation.js';
import { SECURITY_LIMITS } from '../utils/security-limits.js';
import { odinValueToTransformValue } from './engine-odin-values.js';
import {
  buildSegmentRoutingMap,
  extractDiscriminatorValue,
  parseRecord,
  mergeSegmentOutput,
} from './engine-multirecord.js';
import { jsToTransformValue, transformValueToJs } from './engine-value-utils.js';
import { applyDirectives } from './engine-directives.js';
import { applyConfidentialEnforcement } from './engine-confidential.js';

// Re-export types from engine-types.ts for backward compatibility
export type { TransformOptions, MultiRecordInput } from './engine-types.js';

import type { TransformOptions, MultiRecordInput } from './engine-types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Transform Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a transform on source data
 */
export function executeTransform(
  transform: OdinTransform,
  source: unknown,
  options?: TransformOptions
): TransformResult {
  const engine = new TransformEngine(transform, options);
  return engine.execute(source);
}

/**
 * Execute a transform on an ODIN document
 */
export function transformDocument(
  transform: OdinTransform,
  doc: OdinDocument,
  options?: TransformOptions
): TransformResult {
  // Convert ODIN document to plain object for processing
  const source = documentToObject(doc);
  return executeTransform(transform, source, options);
}

/**
 * Execute a transform on multi-record input using discriminator-based segment routing.
 *
 * This processes input with multiple record types (e.g., fixed-width files with
 * different record type codes) by:
 * 1. Extracting the discriminator value from each record
 * 2. Routing to the segment with matching :type directive
 * 3. Accumulating array segments across multiple matching records
 *
 * @example
 * ```typescript
 * // Fixed-width file with record types "01" (header), "20" (vehicles), "99" (trailer)
 * const result = executeMultiRecordTransform(transform, {
 *   records: [
 *     "01POL123456789   06152024A...",
 *     "2017HGCM82633A004352024TOYOTA...",
 *     "20ABC123456789DEF2025HONDA...",
 *     "99000001000002"
 *   ]
 * });
 * ```
 */
export function executeMultiRecordTransform(
  transform: OdinTransform,
  input: MultiRecordInput,
  options?: TransformOptions
): TransformResult {
  const engine = new TransformEngine(transform, options);
  return engine.executeMultiRecord(input);
}

class TransformEngine {
  private transform: OdinTransform;
  private verbRegistry: VerbRegistry;
  private strictTypes: boolean;
  private errors: TransformError[] = [];
  private warnings: TransformWarning[] = [];

  constructor(transform: OdinTransform, options?: TransformOptions) {
    this.transform = transform;
    this.verbRegistry = options?.verbRegistry ?? defaultVerbRegistry;
    // strictTypes can be set via options or via transform header
    this.strictTypes = options?.strictTypes ?? this.transform.strictTypes ?? false;
  }

  execute(source: unknown): TransformResult {
    this.errors = [];
    this.warnings = [];

    let parsedSource = source;
    let sourceOdinDoc: OdinDocument | undefined;

    // Parse source based on format specification
    const sourceFormat = this.transform.source?.format;
    const discriminator = this.transform.source?.discriminator;

    // Multi-record mode: string input with discriminator for line-based formats
    // Route to executeMultiRecord BEFORE parsing to preserve raw lines
    if (
      typeof source === 'string' &&
      discriminator &&
      (sourceFormat === 'csv' ||
        sourceFormat === 'delimited' ||
        sourceFormat === 'fixed-width' ||
        sourceFormat === 'flat')
    ) {
      // Split input into raw lines for multi-record processing
      const records = source.split(/\r?\n/).filter((line) => line.trim() !== '');
      return this.executeMultiRecord({
        records,
        delimiter: this.transform.source?.delimiter ?? ',',
      });
    }

    if (typeof source === 'string' && sourceFormat) {
      try {
        if (sourceFormat === 'odin') {
          // ODIN format - parse and preserve type information
          sourceOdinDoc = Odin.parse(source);
          parsedSource = sourceOdinDoc.toJSON();
        } else {
          // Other formats - use source parsers
          const parsed = parseSource(source, sourceFormat, {
            config: this.transform.source,
            delimiter: this.transform.source?.discriminator?.type === 'field' ? ',' : undefined,
          });
          parsedSource = parsed.data;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.errors.push(configError(`Failed to parse ${sourceFormat} input: ${message}`));
        return {
          success: false,
          output: {},
          formatted: '',
          errors: this.errors,
          warnings: this.warnings,
        };
      }
    }

    // Multi-record mode: array of strings with discriminator (pre-split input)
    if (
      Array.isArray(parsedSource) &&
      discriminator &&
      parsedSource.every((item) => typeof item === 'string')
    ) {
      return this.executeMultiRecord({ records: parsedSource as string[] });
    }

    const context = this.createContext(parsedSource, sourceOdinDoc);

    const output: Record<string, unknown> = {};

    // Multi-pass execution: ordered passes (1, 2, 3, ...) then pass 0 (no pass)
    // Single-pass execution: all segments processed together
    const passes = this.transform.passes ?? [];
    const hasMultiPass = passes.length > 0;

    if (hasMultiPass) {
      const passOrder = [...passes, 0];
      let isFirstPass = true;

      for (const passNum of passOrder) {
        if (!isFirstPass) {
          this.resetNonPersistAccumulators(context);
        }
        isFirstPass = false;

        const passSegments = this.transform.segments.filter((s) => (s.pass ?? 0) === passNum);

        for (const segment of passSegments) {
          this.processSegment(segment, context, output);
        }
      }
    } else {
      for (const segment of this.transform.segments) {
        this.processSegment(segment, context, output);
      }
    }

    // Merge verb-level errors (T011, etc.) into engine errors
    if (context.errors && context.errors.length > 0) {
      this.errors.push(...context.errors);
    }

    const formatted = formatOutput(output as Record<string, TransformValue>, {
      transform: this.transform,
      onWarning: (w) => this.warnings.push(w),
    });

    return {
      success: this.errors.length === 0,
      output,
      formatted,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Reset non-persist accumulators to their initial values.
   * Called between passes in multi-pass execution.
   */
  private resetNonPersistAccumulators(context: TransformContext): void {
    for (const [name, def] of this.transform.accumulators) {
      if (!def.persist) {
        context.accumulators.set(name, { ...def.initialValue });
      }
    }
  }

  /**
   * Execute transform on multi-record input with discriminator-based routing.
   */
  executeMultiRecord(input: MultiRecordInput): TransformResult {
    this.errors = [];
    this.warnings = [];

    const discriminator = this.transform.source?.discriminator;
    if (!discriminator) {
      this.errors.push(
        configError('Multi-record transform requires discriminator in source config')
      );
      return {
        success: false,
        output: {},
        formatted: '',
        errors: this.errors,
        warnings: this.warnings,
      };
    }

    // Build segment routing map: discriminator value -> segment
    const segmentMap = buildSegmentRoutingMap(this.transform.segments);

    // Initialize output with arrays for array segments
    const output: Record<string, unknown> = {};
    const arrayAccumulators = new Map<string, unknown[]>();

    // Initialize array accumulators for segments with :type directive and isArray
    for (const segment of this.transform.segments) {
      const typeDirective = segment.directives.find((d) => d.type === 'type');
      if (typeDirective && segment.isArray) {
        // Initialize array at segment path
        const arrayPath = segment.path.replace(/\[\]$/, '');
        arrayAccumulators.set(arrayPath, []);
      }
    }

    // Process each record (with limit to prevent resource exhaustion)
    const maxRecords = Math.min(input.records.length, SECURITY_LIMITS.MAX_RECORDS);
    if (input.records.length > SECURITY_LIMITS.MAX_RECORDS) {
      this.warnings.push(
        transformWarning(
          '',
          `Input contains ${input.records.length} records, processing only first ${SECURITY_LIMITS.MAX_RECORDS}`
        )
      );
    }

    for (let recordIndex = 0; recordIndex < maxRecords; recordIndex++) {
      const record = input.records[recordIndex]!;

      // Extract discriminator value
      const discValue = extractDiscriminatorValue(record, discriminator, input.delimiter);

      // Find matching segment
      const segment = segmentMap.get(discValue);
      if (!segment) {
        // Handle unknown record type
        if (this.transform.target.onError === 'fail') {
          this.errors.push(unknownRecordTypeError(discValue, recordIndex + 1));
        } else if (this.transform.target.onError === 'warn') {
          this.warnings.push(unknownRecordTypeWarning(discValue, recordIndex + 1));
        }
        continue;
      }

      // Parse record into source object based on format
      const recordSource = parseRecord(
        record,
        this.transform.source?.format ?? 'fixed-width',
        input.delimiter
      );

      // Create context for this record
      const context = this.createContext(recordSource);
      context.current = recordSource;
      context.counters.set('_index', recordIndex);
      context.counters.set('_recordNumber', recordIndex + 1);

      // Process mappings
      const recordOutput: Record<string, unknown> = {};
      for (const mapping of segment.mappings) {
        this.processMapping(mapping, context, recordOutput, segment.path);
      }

      // Merge verb-level errors from this record's context
      if (context.errors && context.errors.length > 0) {
        this.errors.push(...context.errors);
      }

      // Merge into output
      if (segment.isArray) {
        // Accumulate into array
        const arrayPath = segment.path.replace(/\[\]$/, '');
        const arr = arrayAccumulators.get(arrayPath);
        if (arr) {
          arr.push(recordOutput);
        }
      } else {
        // Single segment - merge or replace
        const segmentPath = segment.path.startsWith('segment.')
          ? segment.path.slice('segment.'.length)
          : segment.path;
        mergeSegmentOutput(output, segmentPath, recordOutput, setNestedValue);
      }
    }

    // Apply array accumulators to output
    for (const [path, arr] of arrayAccumulators) {
      // Handle paths like "segment.VEH" -> "vehicles"
      const outputPath = path.startsWith('segment.') ? getSegmentOutputPath(path) : path;
      setNestedValue(output, outputPath, arr);
    }

    // Format output based on target format
    // Output now contains TransformValue objects directly (typed values)
    const formatted = formatOutput(output as Record<string, TransformValue>, {
      transform: this.transform,
      onWarning: (w) => this.warnings.push(w),
    });

    return {
      success: this.errors.length === 0,
      output,
      formatted,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  private createContext(source: unknown, sourceOdinDoc?: OdinDocument): TransformContext {
    // Initialize accumulators with initial values
    const accumulators = new Map<string, TransformValue>();
    for (const [name, def] of this.transform.accumulators) {
      accumulators.set(name, { ...def.initialValue });
    }

    const context: TransformContext = {
      source,
      current: undefined,
      aliases: new Map(),
      counters: new Map(),
      accumulators,
      tables: this.transform.tables,
      constants: this.transform.constants,
      sequenceCounters: new Map(),
      loopDepth: 0,
      verbRegistry: this.verbRegistry,
      errors: [],
    };

    // Only set sourceOdinDoc if provided (exactOptionalPropertyTypes compliance)
    if (sourceOdinDoc) {
      context.sourceOdinDoc = sourceOdinDoc;
    }

    return context;
  }

  private processSegment(
    segment: TransformSegment,
    context: TransformContext,
    output: Record<string, unknown>
  ): void {
    const ifDirective = segment.directives.find((d) => d.type === 'if');
    if (ifDirective && ifDirective.value) {
      const conditionResult = evaluateCondition(ifDirective.value, context, (path, ctx) =>
        this.resolvePathValue(path, ctx)
      );
      if (!conditionResult) {
        return;
      }
    }

    const loopDirective = segment.directives.find((d) => d.type === 'loop');
    // _from directive provides an alternative loop source path
    const fromDirective = segment.directives.find((d) => d.type === 'from');

    if (loopDirective && segment.isArray) {
      // Security: Check loop nesting depth to prevent stack overflow attacks
      if (context.loopDepth >= SECURITY_LIMITS.MAX_LOOP_NESTING) {
        throw new Error(
          `Loop nesting depth ${context.loopDepth + 1} exceeds maximum allowed depth of ${SECURITY_LIMITS.MAX_LOOP_NESTING}`
        );
      }

      // Priority: _from directive > _loop value > segment path
      let loopPath = fromDirective?.value || loopDirective.value || segment.path;
      if (loopPath.startsWith('@')) {
        loopPath = loopPath.slice(1);
      }
      const items = resolvePath(loopPath, context.source);

      if (Array.isArray(items)) {
        const results: unknown[] = [];
        const counterName = segment.directives.find((d) => d.type === 'counter')?.value;

        for (let i = 0; i < items.length; i++) {
          const itemContext: TransformContext = {
            ...context,
            current: items[i],
            aliases: new Map(context.aliases),
            counters: new Map(context.counters),
            loopDepth: context.loopDepth + 1,
          };

          if (loopDirective.alias) {
            itemContext.aliases.set(loopDirective.alias, items[i]);
          }
          if (counterName) {
            itemContext.counters.set(counterName, i);
          }
          itemContext.counters.set('_index', i);

          const isValueOnly = segment.mappings.length === 1 && segment.mappings[0]!.target === '_';

          if (isValueOnly) {
            const mapping = segment.mappings[0]!;
            let value = this.evaluateExpression(mapping.value, itemContext);
            value = applyModifiers(value, mapping.modifiers, itemContext, (path, ctx) =>
              this.resolvePathValue(path, ctx)
            );
            results.push(value);
          } else {
            const itemOutput: Record<string, unknown> = {};
            for (const mapping of segment.mappings) {
              this.processMapping(mapping, itemContext, itemOutput, segment.path);
            }
            results.push(itemOutput);
          }
        }

        setNestedValue(output, segment.path, results);
      }
    } else {
      // Process single segment
      const segmentOutput: Record<string, unknown> = {};

      for (const mapping of segment.mappings) {
        this.processMapping(mapping, context, segmentOutput, segment.path);
      }

      if (segment.path === '') {
        // Root-level segment (from {} header): merge directly into output
        Object.assign(output, segmentOutput);
      } else if (segment.path.includes('.')) {
        setNestedValue(output, segment.path, segmentOutput);
      } else {
        if (Object.keys(segmentOutput).length > 0) {
          output[segment.path] = segmentOutput;
        }
      }
    }
  }

  private processMapping(
    mapping: FieldMapping,
    context: TransformContext,
    output: Record<string, unknown>,
    _pathPrefix: string = ''
  ): void {
    try {
      const ifModifier = mapping.modifiers.find((m) => m.name === 'if');
      if (ifModifier) {
        let conditionPath = String(ifModifier.value);
        if (conditionPath.startsWith('@')) {
          conditionPath = conditionPath.slice(1);
        }
        if (conditionPath.startsWith('.')) {
          conditionPath = conditionPath.slice(1);
        }
        const conditionValue = resolvePath(conditionPath, context.current ?? context.source);
        if (!conditionValue) return;
      }

      const unlessModifier = mapping.modifiers.find((m) => m.name === 'unless');
      if (unlessModifier) {
        let conditionPath = String(unlessModifier.value);
        if (conditionPath.startsWith('@')) {
          conditionPath = conditionPath.slice(1);
        }
        if (conditionPath.startsWith('.')) {
          conditionPath = conditionPath.slice(1);
        }
        const conditionValue = resolvePath(conditionPath, context.current ?? context.source);
        if (conditionValue) return;
      }

      let value = this.evaluateExpression(mapping.value, context);

      value = applyModifiers(value, mapping.modifiers, context, (path, ctx) =>
        this.resolvePathValue(path, ctx)
      );

      // Check for format-incompatible modifiers and warn
      const targetFormat = this.transform.target.format;
      for (const modifier of mapping.modifiers) {
        if (!isModifierCompatible(modifier.name, targetFormat)) {
          this.warnings.push(invalidModifierWarning(modifier.name, targetFormat, mapping.target));
        }
      }

      const requiredModifier = mapping.modifiers.find((m) => m.name === 'required');
      if (requiredModifier && value.type === 'null') {
        this.errors.push(sourceMissingError(mapping.target));
        return;
      }

      const omitNullModifier = mapping.modifiers.find((m) => m.name === 'omitNull');
      if (omitNullModifier && value.type === 'null') return;

      const omitEmptyModifier = mapping.modifiers.find((m) => m.name === 'omitEmpty');
      if (omitEmptyModifier && value.type === 'string' && value.value === '') return;

      value = applyConfidentialEnforcement(
        value,
        this.transform.enforceConfidential,
        mapping.confidential === true
      );

      // Embed value modifiers in TransformValue
      if (!this.transform.enforceConfidential) {
        const hasRequired = mapping.modifiers.some((m) => m.name === 'required');
        const hasConfidential = mapping.confidential === true;
        const hasDeprecated = mapping.modifiers.some((m) => m.name === 'deprecated');
        const hasAttr = mapping.modifiers.some((m) => m.name === 'attr');

        if (hasRequired || hasConfidential || hasDeprecated || hasAttr) {
          value = {
            ...value,
            modifiers: {
              ...(hasRequired ? { required: true } : {}),
              ...(hasConfidential ? { confidential: true } : {}),
              ...(hasDeprecated ? { deprecated: true } : {}),
              ...(hasAttr ? { attr: true } : {}),
            },
          } as TransformValue;
        }
      }

      if (mapping.target !== '_') {
        output[mapping.target] = value;
      }
    } catch (err) {
      // Re-throw TypeValidationError for strict type checking
      if (err instanceof TypeValidationError) {
        throw err;
      }

      const message = err instanceof Error ? err.message : String(err);
      if (this.transform.target.onError === 'fail') {
        this.errors.push(transformError(message, mapping.target));
      } else if (this.transform.target.onError === 'warn') {
        this.warnings.push(transformWarning(message, mapping.target));
      }
      // skip: do nothing
    }
  }

  private evaluateExpression(expr: ValueExpression, context: TransformContext): TransformValue {
    switch (expr.type) {
      case 'literal':
        // Process interpolation for string literals containing ${...}
        if (expr.value.type === 'string' && expr.value.value.includes('${')) {
          return interpolateString(
            expr.value.value,
            context,
            (path, ctx) => this.resolvePathValue(path, ctx),
            (e, ctx) => this.evaluateExpression(e, ctx)
          );
        }
        return expr.value;

      case 'copy': {
        let value = this.resolvePathValue(expr.path, context);
        // Apply extraction directives for compatible source formats
        // Only extraction-specific directives (pos, len, field, trim) — not type/modifier directives
        const sourceFormat = this.transform.source?.format;
        if (expr.directives && expr.directives.length > 0) {
          const extractionNames = new Set(['pos', 'len', 'field', 'trim']);
          const extractionDirectives = expr.directives.filter(d => extractionNames.has(d.name));
          if (extractionDirectives.length > 0) {
            if (sourceFormat === 'fixed-width' || sourceFormat === 'flat') {
              value = applyDirectives(value, extractionDirectives);
            } else if (sourceFormat === 'csv' || sourceFormat === 'delimited') {
              const delimiter = this.transform.source?.delimiter ?? ',';
              value = applyDirectives(value, extractionDirectives, delimiter);
            }
          }
        }
        return value;
      }

      case 'transform': {
        const verbFn = expr.isCustom
          ? this.verbRegistry.getCustom(expr.verb)
          : this.verbRegistry.get(expr.verb);

        if (!verbFn) {
          // T001: Unknown verb
          const err = unknownVerbError(expr.verb);
          throw new Error(err.message);
        }

        // Validate arity at execution time (defense in depth)
        const arity = getVerbArity(expr.verb);
        const minArity = getVerbMinArity(expr.verb);
        if (expr.args.length < minArity) {
          const arityDesc = arity < 0 ? `at least ${minArity}` : `${arity}`;
          throw new Error(
            `Verb '${expr.verb}' requires ${arityDesc} argument(s) but only ${expr.args.length} provided`
          );
        }

        const args = expr.args.map((arg) => this.evaluateExpression(arg, context));

        // Type validation (if strict mode enabled)
        if (this.strictTypes) {
          const typeResult = validateVerbArgTypes(expr.verb, args, expr.isCustom);
          if (!typeResult.valid) {
            throw new TypeValidationError(expr.verb, typeResult.errors);
          }
        }

        return verbFn(args, context);
      }

      case 'object': {
        const obj: Record<string, unknown> = {};
        for (const [key, valueExpr] of expr.fields) {
          const value = this.evaluateExpression(valueExpr, context);
          obj[key] = transformValueToJs(value);
        }
        return { type: 'string', value: JSON.stringify(obj) };
      }
    }
  }

  private resolvePathValue(path: string, context: TransformContext): TransformValue {
    // Handle special paths
    if (path.startsWith('$accumulator.')) {
      const name = path.slice('$accumulator.'.length);
      return context.accumulators.get(name) ?? { type: 'null' };
    }

    if (path.startsWith('$const.')) {
      const name = path.slice('$const.'.length);
      return context.constants.get(name) ?? { type: 'null' };
    }

    if (path === '_index') {
      const index = context.counters.get('_index');
      return index !== undefined ? { type: 'integer', value: index } : { type: 'null' };
    }

    // Empty path resolves to current loop item
    if (path === '') {
      if (context.current !== undefined) {
        return jsToTransformValue(context.current);
      }
      return jsToTransformValue(context.source);
    }

    let targetObj: unknown;
    let targetPath: string;

    if (path.startsWith('.')) {
      targetObj = context.current !== undefined ? context.current : context.source;
      targetPath = path.slice(1);
    } else {
      const firstPart = path.split('.')[0]!;
      if (context.aliases.has(firstPart)) {
        targetObj = context.aliases.get(firstPart);
        targetPath = path.includes('.') ? path.slice(firstPart.length + 1) : '';
      } else {
        targetObj = context.source;
        targetPath = path;
      }
    }

    // Use OdinDocument for type preservation when resolving from root source
    if (context.sourceOdinDoc && targetObj === context.source && targetPath) {
      const odinValue = context.sourceOdinDoc.get(targetPath);
      if (odinValue) {
        return odinValueToTransformValue(odinValue);
      }
    }

    const value = targetPath ? resolvePath(targetPath, targetObj) : targetObj;
    return jsToTransformValue(value);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert ODIN document to plain JavaScript object
 */
function documentToObject(doc: OdinDocument): Record<string, unknown> {
  return doc.toJSON() as Record<string, unknown>;
}
