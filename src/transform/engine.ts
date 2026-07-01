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
  SegmentDirective,
  FieldMapping,
  Modifier,
  ValueExpression,
  TransformExpression,
  VerbRegistry,
} from '../types/transform.js';
import { defaultVerbRegistry } from './verbs.js';
import { toBoolean, isNull, isEmpty, toString, bool, nil } from './verbs/helpers.js';
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
  validationError,
  validationWarning,
  danglingBranchError,
  nestedInterpolationError,
  TypeValidationError,
  CodedTransformError,
  TransformAbortError,
  budgetExceededError,
  timeoutExceededError,
  expressionDepthExceededError,
  sourcePathNotFoundError,
  loopSourceNotArrayError,
  isModifierCompatible,
  invalidModifierWarning,
} from './errors.js';
import { setNestedValue, getSegmentOutputPath } from './engine-paths.js';
import { evaluateCondition } from './engine-conditions.js';
import { parseValueExpression } from './parser-expressions.js';
import { parseTransform } from './parser.js';
import { applyModifiers } from './engine-modifiers.js';
import {
  interpolateString,
  interpolateLiteralBlock,
  NestedInterpolationError,
} from './engine-interpolation.js';
import { SECURITY_LIMITS } from '../utils/security-limits.js';
import { odinValueToTransformValue } from './engine-odin-values.js';
import {
  buildSegmentRoutingMap,
  extractDiscriminatorValue,
  parseRecord,
  mergeSegmentOutput,
} from './engine-multirecord.js';
import {
  jsToTransformValue,
  transformValueToJs,
  transformValueToString,
  isTruthy,
} from './engine-value-utils.js';
import { applyDirectives } from './engine-directives.js';
import { applyConfidentialEnforcement } from './engine-confidential.js';

// Re-export types from engine-types.ts for backward compatibility
export type { TransformOptions, MultiRecordInput } from './engine-types.js';

import type { TransformOptions, MultiRecordInput } from './engine-types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Transform Engine
// ─────────────────────────────────────────────────────────────────────────────

// Arity metadata depends only on the verb name; cache it across calls.
// Control-flow verbs whose branch arguments are evaluated lazily (only the
// selected branch runs). Their results are identical to eager evaluation for
// pure-value branches; the difference is short-circuiting and not firing the
// side effects of unselected branches.
const LAZY_VERBS = new Set([
  'ifElse',
  'ifNull',
  'ifEmpty',
  'coalesce',
  'and',
  'or',
  'cond',
  'switch',
]);

// Verbs whose cost grows with an array argument. Charged proportional to the
// array width so large-array work cannot escape the fuel budget.
const SORT_VERBS = new Set(['sort']);
const WIDTH_VERBS = new Set([
  'distinct',
  'groupBy',
  'keyBy',
  'countBy',
  'reduce',
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'sumIf',
  'avgIf',
  'countIf',
  'union',
  'intersection',
  'difference',
  'symmetricDifference',
  'map',
  'filter',
  'window',
  'explode',
  'flatten',
  'reverse',
]);

// Read the wall clock once per this many charged units.
const CLOCK_CHECK_INTERVAL = 1024;

// Width of the first array-typed argument, or 0 if none.
function firstArrayWidth(args: TransformValue[]): number {
  for (const arg of args) {
    if (arg && arg.type === 'array') return arg.items.length;
  }
  return 0;
}

const verbArityCache = new Map<string, { arity: number; minArity: number }>();
function resolveVerbArity(verb: string): { arity: number; minArity: number } {
  let entry = verbArityCache.get(verb);
  if (entry === undefined) {
    entry = { arity: getVerbArity(verb), minArity: getVerbMinArity(verb) };
    verbArityCache.set(verb, entry);
  }
  return entry;
}

// Precompiled validation data for a :validate / :enum / :range modifier.
interface CompiledValidation {
  regex?: RegExp | null; // null = invalid pattern
  pattern?: string;
  enumSet?: Set<string>;
  enumLabel?: string;
  rangeStr?: string;
  rangeMin?: number;
  rangeMax?: number;
}

// Per-mapping directive references and boolean flags, derived once from the
// mapping's modifiers (which are data-independent and shared across executions).
interface MappingMods {
  ifMod: Modifier | undefined;
  unlessMod: Modifier | undefined;
  objectMod: Modifier | undefined;
  nsMod: Modifier | undefined;
  validateMod: Modifier | undefined;
  enumMod: Modifier | undefined;
  rangeMod: Modifier | undefined;
  hasDefault: boolean;
  hasRequired: boolean;
  hasOmitNull: boolean;
  hasOmitEmpty: boolean;
  hasRaw: boolean;
  hasArray: boolean;
  hasDeprecated: boolean;
  hasAttr: boolean;
  hasCdata: boolean;
  hasDefaultOrObject: boolean;
  validation: CompiledValidation;
  validationActive: boolean;
}

// Hidden memo slot on the shared FieldMapping AST node.
type MappingWithMods = FieldMapping & { __mods?: MappingMods };

function compileValidation(
  validateMod?: Modifier,
  enumMod?: Modifier,
  rangeMod?: Modifier
): CompiledValidation {
  const v: CompiledValidation = {};
  if (validateMod && validateMod.value !== undefined) {
    const pattern = String(validateMod.value);
    v.pattern = pattern;
    try {
      v.regex = new RegExp(pattern);
    } catch {
      v.regex = null;
    }
  }
  if (enumMod && enumMod.value !== undefined) {
    const allowed = String(enumMod.value)
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''));
    v.enumSet = new Set(allowed);
    v.enumLabel = allowed.join(', ');
  }
  if (rangeMod && rangeMod.value !== undefined) {
    const rangeStr = String(rangeMod.value);
    const parts = rangeStr.split('..');
    v.rangeStr = rangeStr;
    v.rangeMin = parseFloat(parts[0] ?? '');
    v.rangeMax = parseFloat(parts[1] ?? '');
  }
  return v;
}

function getMappingMods(mapping: FieldMapping): MappingMods {
  const cached = (mapping as MappingWithMods).__mods;
  if (cached !== undefined) return cached;

  const mods = mapping.modifiers;
  let ifMod: Modifier | undefined;
  let unlessMod: Modifier | undefined;
  let objectMod: Modifier | undefined;
  let nsMod: Modifier | undefined;
  let validateMod: Modifier | undefined;
  let enumMod: Modifier | undefined;
  let rangeMod: Modifier | undefined;
  let hasDefault = false;
  let hasRequired = false;
  let hasOmitNull = false;
  let hasOmitEmpty = false;
  let hasRaw = false;
  let hasArray = false;
  let hasDeprecated = false;
  let hasAttr = false;
  let hasCdata = false;

  for (const m of mods) {
    switch (m.name) {
      case 'if': if (!ifMod) ifMod = m; break;
      case 'unless': if (!unlessMod) unlessMod = m; break;
      case 'object': if (!objectMod) objectMod = m; break;
      case 'ns': if (!nsMod) nsMod = m; break;
      case 'validate': if (!validateMod) validateMod = m; break;
      case 'enum': if (!enumMod) enumMod = m; break;
      case 'range': if (!rangeMod) rangeMod = m; break;
      case 'default': hasDefault = true; break;
      case 'required': hasRequired = true; break;
      case 'omitNull': hasOmitNull = true; break;
      case 'omitEmpty': hasOmitEmpty = true; break;
      case 'raw': hasRaw = true; break;
      case 'array': hasArray = true; break;
      case 'deprecated': hasDeprecated = true; break;
      case 'attr': hasAttr = true; break;
      case 'cdata': hasCdata = true; break;
    }
  }

  const validation = compileValidation(validateMod, enumMod, rangeMod);
  const entry: MappingMods = {
    ifMod,
    unlessMod,
    objectMod,
    nsMod,
    validateMod,
    enumMod,
    rangeMod,
    hasDefault,
    hasRequired,
    hasOmitNull,
    hasOmitEmpty,
    hasRaw,
    hasArray,
    hasDeprecated,
    hasAttr,
    hasCdata,
    hasDefaultOrObject: hasDefault || objectMod !== undefined,
    validation,
    validationActive:
      validateMod !== undefined || enumMod !== undefined || rangeMod !== undefined,
  };
  Object.defineProperty(mapping, '__mods', {
    value: entry,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return entry;
}

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

  // Execution guard state. Fuel/timeout charge only when their cap is > 0.
  // A per-call option overrides the global limit; unset falls back to it.
  private readonly fuelCap: number;
  private readonly timeoutMs: number;
  private readonly maxExprDepth: number;
  private fuelUsed = 0;
  private exprDepth = 0;
  private opsSinceClock = 0;
  private startTime = 0;

  constructor(transform: OdinTransform, options?: TransformOptions) {
    this.transform = transform;
    this.verbRegistry = options?.verbRegistry ?? defaultVerbRegistry;
    // strictTypes can be set via options or via transform header
    this.strictTypes = options?.strictTypes ?? this.transform.strictTypes ?? false;
    this.fuelCap = options?.maxTransformFuel ?? SECURITY_LIMITS.MAX_TRANSFORM_FUEL;
    this.timeoutMs = options?.transformTimeoutMs ?? SECURITY_LIMITS.TRANSFORM_TIMEOUT_MS;
    this.maxExprDepth = options?.maxExpressionDepth ?? SECURITY_LIMITS.MAX_EXPRESSION_DEPTH;
    if (this.timeoutMs > 0) this.startTime = Date.now();

    if (options?.importResolver && this.transform.imports.length > 0) {
      this.resolveImports(options.importResolver);
    }
  }

  // Merge imported lookup tables, constants, accumulators, and named segments
  // into this transform. Local declarations win over imported ones; imported
  // segments are appended so their mappings remain referenceable.
  private resolveImports(resolver: (path: string) => string | undefined): void {
    const seen = new Set<string>();
    for (const imp of this.transform.imports) {
      if (seen.has(imp.path)) continue;
      seen.add(imp.path);

      const text = resolver(imp.path);
      if (text === undefined) continue;

      const imported = parseTransform(text);

      for (const [name, table] of imported.tables) {
        if (!this.transform.tables.has(name)) this.transform.tables.set(name, table);
      }
      for (const [name, value] of imported.constants) {
        if (!this.transform.constants.has(name)) this.transform.constants.set(name, value);
      }
      for (const [name, def] of imported.accumulators) {
        if (!this.transform.accumulators.has(name)) this.transform.accumulators.set(name, def);
      }
      const existingPaths = new Set(this.transform.segments.map((s) => s.path));
      for (const segment of imported.segments) {
        if (segment.path === '' || existingPaths.has(segment.path)) continue;
        this.transform.segments.push(segment);
      }
    }
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

    try {
      if (hasMultiPass) {
        const passOrder = [...passes, 0];
        let isFirstPass = true;

        for (const passNum of passOrder) {
          if (!isFirstPass) {
            this.resetNonPersistAccumulators(context);
          }
          isFirstPass = false;

          const passSegments = this.transform.segments.filter((s) => (s.pass ?? 0) === passNum);

          this.processSegmentList(passSegments, context, output);
        }
      } else {
        this.processSegmentList(this.transform.segments, context, output);
      }
    } catch (err) {
      if (err instanceof TransformAbortError) return this.abortResult(err, output);
      throw err;
    }

    // Merge verb-level errors (T011, etc.) into engine errors
    if (context.errors && context.errors.length > 0) {
      this.errors.push(...context.errors);
    }
    if (context.warnings && context.warnings.length > 0) {
      this.warnings.push(...context.warnings);
    }

    const formatted = formatOutput(output as Record<string, TransformValue>, {
      transform: this.transform,
      onWarning: (w) => this.warnings.push(w),
      onError: (e) => this.errors.push(e),
    });

    return {
      success: this.errors.length === 0,
      output,
      formatted,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  // Surface a guard abort as a failed result; the abort is never thrown past
  // the execute boundary.
  private abortResult(err: TransformAbortError, output: Record<string, unknown>): TransformResult {
    this.errors.push(err.transformError);
    return {
      success: false,
      output,
      formatted: '',
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

    try {
    for (let recordIndex = 0; recordIndex < maxRecords; recordIndex++) {
      const record = input.records[recordIndex]!;

      // Extract discriminator value
      const discValue = extractDiscriminatorValue(record, discriminator, input.delimiter);

      // Find matching segment
      const segment = segmentMap.get(discValue);
      if (!segment) {
        // Handle unknown record type
        const onError = this.transform.target.onError ?? 'fail';
        if (onError === 'fail') {
          this.errors.push(unknownRecordTypeError(discValue, recordIndex + 1));
        } else if (onError === 'warn') {
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
      if (context.warnings && context.warnings.length > 0) {
        this.warnings.push(...context.warnings);
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
    } catch (err) {
      if (err instanceof TransformAbortError) return this.abortResult(err, output);
      throw err;
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
      onError: (e) => this.errors.push(e),
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
      warnings: [],
      onError: this.transform.target.onError ?? 'fail',
      onMissing: this.transform.target.onMissing,
    };

    // Only set sourceOdinDoc if provided (exactOptionalPropertyTypes compliance)
    if (sourceOdinDoc) {
      context.sourceOdinDoc = sourceOdinDoc;
    }

    return context;
  }

  // Evaluate a segment condition: a verb expression, or a legacy quoted-infix string.
  private evaluateSegmentCondition(
    directive: SegmentDirective,
    context: TransformContext
  ): boolean {
    if (directive.expr) {
      return isTruthy(this.evaluateExpression(directive.expr, context));
    }
    return evaluateCondition(directive.value, context, (path, ctx) =>
      this.resolvePathValue(path, ctx)
    );
  }

  // Evaluate a field-level :if / :unless condition (truthy path or `path op value`).
  // The left path resolves against the current loop item when present, else source.
  private evaluateFieldCondition(condition: string, context: TransformContext): boolean {
    return evaluateCondition(condition, context, (path, ctx) =>
      this.resolveFieldConditionPath(path, ctx)
    );
  }

  // Resolve a field-condition path against the current loop item, falling back to source.
  private resolveFieldConditionPath(path: string, context: TransformContext): TransformValue {
    if (path.startsWith('.')) {
      return this.resolvePathValue(path, context);
    }
    if (context.current !== undefined) {
      const current = resolvePath(path, context.current);
      if (current !== undefined) {
        return jsToTransformValue(current);
      }
    }
    return this.resolvePathValue(path, context);
  }

  // Process a list of segments, honoring if/elif/else conditional chains.
  // A chain is a run of consecutive segments: one `if`, then any `elif`, then
  // an optional `else`. Only the first branch whose condition holds is emitted.
  private processSegmentList(
    segments: TransformSegment[],
    context: TransformContext,
    output: Record<string, unknown>
  ): void {
    // 'none' = no active chain; 'pending' = chain open, none taken yet; 'taken' = a branch taken
    let branch: 'none' | 'pending' | 'taken' = 'none';

    for (const segment of segments) {
      const ifDir = segment.directives.find((d) => d.type === 'if');
      const elifDir = segment.directives.find((d) => d.type === 'elif');
      const elseDir = segment.directives.find((d) => d.type === 'else');

      if (ifDir) {
        const taken = this.evaluateSegmentCondition(ifDir, context);
        branch = taken ? 'taken' : 'pending';
        if (taken) this.processSegment(segment, context, output);
      } else if (elifDir) {
        if (branch === 'none') {
          this.errors.push(danglingBranchError('elif', segment.path));
          continue;
        }
        if (branch === 'taken') continue;
        const taken = this.evaluateSegmentCondition(elifDir, context);
        branch = taken ? 'taken' : 'pending';
        if (taken) this.processSegment(segment, context, output);
      } else if (elseDir) {
        if (branch === 'none') {
          this.errors.push(danglingBranchError('else', segment.path));
          continue;
        }
        if (branch === 'pending') this.processSegment(segment, context, output);
        branch = 'none';
      } else {
        branch = 'none';
        this.processSegment(segment, context, output);
      }
    }
  }

  // A segment whose name begins with `_` is a computation-only sink.
  private isSinkSegment(segmentPath: string): boolean {
    if (segmentPath === '') return false;
    const name = segmentPath.startsWith('segment.')
      ? segmentPath.slice('segment.'.length)
      : segmentPath;
    const last = name.split('.').pop() ?? name;
    return last.startsWith('_');
  }

  private processSegment(
    segment: TransformSegment,
    context: TransformContext,
    output: Record<string, unknown>
  ): void {
    const loopDirectives = segment.directives.filter((d) => d.type === 'loop');
    // _from directive provides an alternative loop source path
    const fromDirective = segment.directives.find((d) => d.type === 'from');

    // Literal block: emit interpolated text lines instead of field mappings.
    if (segment.directives.some((d) => d.type === 'literal')) {
      this.processLiteralSegment(segment, loopDirectives, fromDirective, context, output);
      return;
    }

    // Computation-only sink: a `_`-prefixed section runs for side effects only
    // (accumulators, verbs) and never appears in the output.
    const isSink = this.isSinkSegment(segment.path);

    if (loopDirectives.length > 0 && segment.isArray) {
      const counterName = segment.directives.find((d) => d.type === 'counter')?.value;
      // _from overrides the source path of the outermost loop only.
      const firstFrom = fromDirective?.value;
      const results: unknown[] = [];

      // A non-array loop source raises a coded error honoring onError.
      try {
        this.iterateLoops(loopDirectives, 0, context, segment, firstFrom, counterName, results);
      } catch (err) {
        if (err instanceof TransformAbortError) throw err;
        if (err instanceof CodedTransformError) {
          const onError = this.transform.target.onError ?? 'fail';
          if (onError === 'fail') {
            this.errors.push(err.transformError);
          } else if (onError === 'warn') {
            this.warnings.push(err.transformError as TransformWarning);
          }
          return;
        }
        throw err;
      }

      if (!isSink) {
        setNestedValue(output, segment.path, results);
      }
    } else {
      // Process single segment
      const segmentOutput: Record<string, unknown> = {};

      for (const mapping of segment.mappings) {
        this.processMapping(mapping, context, segmentOutput, segment.path);
      }

      if (isSink) {
        // Sink section: side effects only, nothing emitted.
      } else if (segment.path === '') {
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

  // Render a `:literal` segment to interpolated text lines. The `"""` body's
  // outermost leading/trailing newline (from delimiters on their own lines) is
  // trimmed; each remaining source line becomes an output line. Under a `:loop`
  // the block renders once per item.
  private processLiteralSegment(
    segment: TransformSegment,
    loopDirectives: SegmentDirective[],
    fromDirective: SegmentDirective | undefined,
    context: TransformContext,
    output: Record<string, unknown>
  ): void {
    const bodyDir = segment.directives.find((d) => d.type === 'literalBody');
    const template = this.normalizeLiteralBody(bodyDir?.value ?? '');

    const lines: string[] = [];
    const render = (ctx: TransformContext): void => {
      const rendered = this.renderLiteral(template, ctx, segment.path);
      for (const line of rendered.split('\n')) lines.push(line);
    };

    if (loopDirectives.length > 0 && segment.isArray) {
      const counterName = segment.directives.find((d) => d.type === 'counter')?.value;
      const firstFrom = fromDirective?.value;
      const results: unknown[] = [];
      this.iterateLoops(loopDirectives, 0, context, segment, firstFrom, counterName, results, render);
    } else {
      render(context);
    }

    setNestedValue(output, segment.path, { __literalLines: lines });
  }

  // Strip one leading and one trailing newline so the `"""` delimiters, written
  // on their own lines, do not contribute blank output lines.
  private normalizeLiteralBody(body: string): string {
    let s = body;
    if (s.startsWith('\r\n')) s = s.slice(2);
    else if (s.startsWith('\n')) s = s.slice(1);
    if (s.endsWith('\r\n')) s = s.slice(0, -2);
    else if (s.endsWith('\n')) s = s.slice(0, -1);
    return s;
  }

  private renderLiteral(
    template: string,
    context: TransformContext,
    segmentPath: string
  ): string {
    try {
      return interpolateLiteralBlock(
        template,
        context,
        (path, ctx) => this.resolvePathValue(path, ctx),
        (e, ctx) => this.evaluateExpression(e, ctx)
      );
    } catch (err) {
      if (err instanceof TransformAbortError) throw err;
      if (err instanceof NestedInterpolationError) {
        this.errors.push(nestedInterpolationError(err.expr, segmentPath));
        return '';
      }
      // Verb and resolution failures honor the target onError policy.
      const onError = this.transform.target.onError ?? 'fail';
      if (err instanceof CodedTransformError) {
        const coded = { ...err.transformError, segment: segmentPath };
        if (onError === 'fail') {
          this.errors.push(coded);
        } else if (onError === 'warn') {
          this.warnings.push(coded as TransformWarning);
        }
        return '';
      }
      const message = err instanceof Error ? err.message : String(err);
      if (onError === 'fail') {
        this.errors.push(transformError(message, segmentPath));
      } else if (onError === 'warn') {
        this.warnings.push(transformWarning(message, segmentPath));
      }
      return '';
    }
  }

  // Drive one or more :loop directives as a nested cross-product. Each level binds
  // its alias and current item, then recurses into the next loop; the innermost
  // level emits one result element per item. Relative loop paths (`.field`)
  // resolve against the current outer item.
  private iterateLoops(
    loops: SegmentDirective[],
    depth: number,
    context: TransformContext,
    segment: TransformSegment,
    firstFrom: string | undefined,
    counterName: string | undefined,
    results: unknown[],
    onItem?: (ctx: TransformContext) => void
  ): void {
    if (context.loopDepth >= SECURITY_LIMITS.MAX_LOOP_NESTING) {
      throw new Error(
        `Loop nesting depth ${context.loopDepth + 1} exceeds maximum allowed depth of ${SECURITY_LIMITS.MAX_LOOP_NESTING}`
      );
    }

    const loop = loops[depth]!;
    const isOutermost = depth === 0;

    // Outermost loop: _from > loop value > segment path; resolves against source.
    // Inner loops resolve against the current outer item (relative or aliased).
    let loopPath = (isOutermost ? firstFrom || loop.value || segment.path : loop.value) || '';
    if (loopPath.startsWith('@')) {
      loopPath = loopPath.slice(1);
    }

    const base =
      isOutermost && !context.current ? context.source : (context.current ?? context.source);
    let items: unknown;
    if (loopPath.startsWith('.')) {
      items = resolvePath(loopPath.slice(1), context.current ?? context.source);
    } else if (isOutermost) {
      items = resolvePath(loopPath, context.source);
    } else {
      const firstPart = loopPath.split('.')[0]!;
      if (context.aliases.has(firstPart)) {
        const aliased = context.aliases.get(firstPart);
        const rest = loopPath.includes('.') ? loopPath.slice(firstPart.length + 1) : '';
        items = rest ? resolvePath(rest, aliased) : aliased;
      } else {
        items = resolvePath(loopPath, base);
      }
    }

    if (!Array.isArray(items)) {
      // A present non-array scalar is a T009 error; an absent (undefined/null)
      // source yields zero rows silently.
      if (items !== undefined && items !== null) {
        throw new CodedTransformError(loopSourceNotArrayError(loopPath, segment.path));
      }
      return;
    }

    // Type preservation: track the ODIN doc path of the current item when resolvable.
    const trackOdin =
      context.sourceOdinDoc !== undefined &&
      (isOutermost ? !context.currentOdinPath : context.currentOdinPath !== undefined);
    const odinBase = isOutermost
      ? loopPath
      : loopPath.startsWith('.')
        ? `${context.currentOdinPath}.${loopPath.slice(1)}`
        : undefined;

    const isInnermost = depth === loops.length - 1;

    for (let i = 0; i < items.length; i++) {
      const itemContext: TransformContext = {
        ...context,
        current: items[i],
        aliases: new Map(context.aliases),
        counters: new Map(context.counters),
        loopDepth: context.loopDepth + 1,
      };

      if (trackOdin && odinBase) {
        itemContext.currentOdinPath = `${odinBase}[${i}]`;
      } else {
        delete itemContext.currentOdinPath;
      }

      if (loop.alias) {
        itemContext.aliases.set(loop.alias, items[i]);
      }
      itemContext.counters.set('_index', i);
      if (counterName && isInnermost) {
        itemContext.counters.set(counterName, i);
      }

      if (!isInnermost) {
        this.iterateLoops(
          loops,
          depth + 1,
          itemContext,
          segment,
          undefined,
          counterName,
          results,
          onItem
        );
        continue;
      }

      // Literal segments render text per item via the callback instead of mappings.
      if (onItem) {
        onItem(itemContext);
        continue;
      }

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
  }

  private processMapping(
    mapping: FieldMapping,
    context: TransformContext,
    output: Record<string, unknown>,
    _pathPrefix: string = ''
  ): void {
    const mods = getMappingMods(mapping);
    try {
      const ifModifier = mods.ifMod;
      if (ifModifier) {
        if (!this.evaluateFieldCondition(String(ifModifier.value), context)) return;
      }

      const unlessModifier = mods.unlessMod;
      if (unlessModifier) {
        if (this.evaluateFieldCondition(String(unlessModifier.value), context)) return;
      }

      const objectModifier = mods.objectMod;

      // A :default modifier handles a missing lookup; suppress errors raised during evaluation.
      const hasDefaultModifier = mods.hasDefault;
      const errorsBefore = hasDefaultModifier ? (context.errors?.length ?? 0) : 0;

      let value = objectModifier
        ? this.buildInlineObject(String(objectModifier.value), context)
        : this.evaluateExpression(mapping.value, context);

      value = applyModifiers(value, mapping.modifiers, context, (path, ctx) =>
        this.resolvePathValue(path, ctx)
      );

      // If a :default rescued a null result, drop errors raised during evaluation.
      if (hasDefaultModifier && context.errors && context.errors.length > errorsBefore) {
        context.errors.length = errorsBefore;
      }

      // Validation modifiers: :validate, :enum, :range (honors onValidation policy)
      if (mods.validationActive && !this.validateFieldValue(value, mapping, mods)) return;

      // Check for format-incompatible modifiers and warn
      const targetFormat = this.transform.target.format;
      for (const modifier of mapping.modifiers) {
        if (!isModifierCompatible(modifier.name, targetFormat)) {
          this.warnings.push(invalidModifierWarning(modifier.name, targetFormat, mapping.target));
        }
      }

      // Missing source path: a required field always fails (T005); an ordinary
      // field honors the onMissing policy (fail -> T005, warn -> warning,
      // skip/default -> keep null). A path that is merely null is not "missing".
      const requiredModifier = mods.hasRequired;
      if (value.type === 'null' && this.isCopySourceAbsent(mapping, context, mods)) {
        const rawPath = (mapping.value as { path?: string }).path ?? mapping.target;
        const path = rawPath.startsWith('.') ? rawPath.slice(1) : rawPath;
        if (requiredModifier) {
          this.errors.push(sourcePathNotFoundError(path, mapping.target));
          return;
        }
        const policy = context.onMissing;
        if (policy === 'fail') {
          this.errors.push(sourcePathNotFoundError(path, mapping.target));
          return;
        }
        if (policy === 'warn') {
          this.warnings.push({
            ...sourcePathNotFoundError(path, mapping.target),
          } as TransformWarning);
        }
      } else if (requiredModifier && value.type === 'null') {
        // Required field present but explicitly null.
        this.errors.push(sourceMissingError(mapping.target));
        return;
      }

      if (mods.hasOmitNull && value.type === 'null') return;

      if (mods.hasOmitEmpty && value.type === 'string' && value.value === '') return;

      value = applyConfidentialEnforcement(
        value,
        this.transform.enforceConfidential,
        mapping.confidential === true
      );

      // Embed value modifiers in TransformValue
      if (!this.transform.enforceConfidential) {
        const hasRequired = mods.hasRequired;
        const hasConfidential = mapping.confidential === true;
        const hasDeprecated = mods.hasDeprecated;
        const hasAttr = mods.hasAttr;
        const hasCdata = mods.hasCdata;
        const nsMod = mods.nsMod;

        if (hasRequired || hasConfidential || hasDeprecated || hasAttr || hasCdata || nsMod?.value) {
          value = {
            ...value,
            modifiers: {
              ...(hasRequired ? { required: true } : {}),
              ...(hasConfidential ? { confidential: true } : {}),
              ...(hasDeprecated ? { deprecated: true } : {}),
              ...(hasAttr ? { attr: true } : {}),
              ...(hasCdata ? { cdata: true } : {}),
              ...(nsMod?.value ? { ns: String(nsMod.value) } : {}),
            },
          } as TransformValue;
        }
      }

      // :raw emits inline JSON structurally instead of an escaped string.
      if (mods.hasRaw) {
        value = this.parseRawJsonValue(value);
      }

      // :array wraps the value in a single-element array.
      if (mods.hasArray) {
        value = { type: 'array', items: [value] };
      }

      // `_`-prefixed targets are computation-only sinks: evaluated for side
      // effects (accumulators, counters) but never emitted to the output.
      if (!mapping.target.startsWith('_')) {
        output[mapping.target] = value;
      }
    } catch (err) {
      // Guard aborts and strict type errors are not downgraded by onError.
      if (err instanceof TransformAbortError) throw err;
      if (err instanceof TypeValidationError) {
        throw err;
      }

      const onError = this.transform.target.onError ?? 'fail';

      // Coded errors carry a stable T-code; preserve it under fail/warn.
      if (err instanceof CodedTransformError) {
        const coded = { ...err.transformError, field: mapping.target };
        if (onError === 'fail') {
          this.errors.push(coded);
        } else if (onError === 'warn') {
          this.warnings.push(coded as TransformWarning);
        }
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      if (onError === 'fail') {
        this.errors.push(transformError(message, mapping.target));
      } else if (onError === 'warn') {
        this.warnings.push(transformWarning(message, mapping.target));
      }
      // skip: do nothing
    }
  }

  // Validate a value against :validate / :enum / :range modifiers.
  // Returns false when the field should be dropped (onValidation = skip).
  private validateFieldValue(
    value: TransformValue,
    mapping: FieldMapping,
    mods: MappingMods = getMappingMods(mapping)
  ): boolean {
    if (value.type === 'null') return true;

    const policy = this.transform.target.onValidation ?? 'fail';
    const failures: string[] = [];
    const v = mods.validation;

    if (mods.validateMod && mods.validateMod.value !== undefined) {
      const pattern = v.pattern!;
      const str = transformValueToString(value);
      if (v.regex === null) {
        failures.push(`invalid validation pattern '${pattern}'`);
      } else if (!v.regex!.test(str)) {
        failures.push(`value '${str}' does not match pattern '${pattern}'`);
      }
    }

    if (mods.enumMod && mods.enumMod.value !== undefined) {
      const str = transformValueToString(value);
      if (!v.enumSet!.has(str)) {
        failures.push(`value '${str}' is not one of [${v.enumLabel}]`);
      }
    }

    if (mods.rangeMod && mods.rangeMod.value !== undefined) {
      const rangeStr = v.rangeStr!;
      const min = v.rangeMin!;
      const max = v.rangeMax!;
      const num = this.numericOf(value);
      if (num === null) {
        failures.push(`value '${transformValueToString(value)}' is not numeric for range ${rangeStr}`);
      } else if ((!isNaN(min) && num < min) || (!isNaN(max) && num > max)) {
        failures.push(`value ${num} is outside range ${rangeStr}`);
      }
    }

    if (failures.length === 0) return true;

    const message = `Validation failed for '${mapping.target}': ${failures.join('; ')}`;
    if (policy === 'warn') {
      this.warnings.push(validationWarning(message, mapping.target));
      return true;
    }
    if (policy === 'skip') {
      return false;
    }
    this.errors.push(validationError(message, mapping.target));
    return false;
  }

  private numericOf(value: TransformValue): number | null {
    switch (value.type) {
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        return value.value;
      case 'string': {
        const n = parseFloat(value.value);
        return isNaN(n) ? null : n;
      }
      default:
        return null;
    }
  }

  // Build a structural object from an inline :object {key = @path, ...} spec.
  private buildInlineObject(spec: string, context: TransformContext): TransformValue {
    const trimmed = spec.trim().replace(/^\{/, '').replace(/\}$/, '');
    const obj: Record<string, unknown> = {};
    if (trimmed.trim() !== '') {
      for (const pair of this.splitObjectPairs(trimmed)) {
        const eq = pair.indexOf('=');
        if (eq === -1) continue;
        const key = pair.slice(0, eq).trim();
        const rhs = pair.slice(eq + 1).trim();
        if (!key) continue;
        const expr = parseValueExpression(rhs);
        obj[key] = this.evaluateExpression(expr, context);
      }
    }
    return { type: 'object', value: obj };
  }

  // Split an inline object body on commas not nested inside braces.
  private splitObjectPairs(body: string): string[] {
    const pairs: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of body) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (ch === ',' && depth === 0) {
        pairs.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim() !== '') pairs.push(current);
    return pairs;
  }

  // Parse a string value as JSON for :raw, producing a structural TransformValue.
  private parseRawJsonValue(value: TransformValue): TransformValue {
    if (value.type !== 'string') return value;
    try {
      return jsToTransformValue(JSON.parse(value.value));
    } catch {
      return value;
    }
  }

  // Guard boundary: charge one unit of fuel, enforce depth, and batch the
  // wall-clock check before delegating to the evaluator. All evaluation paths
  // funnel through here, so charging stays concentrated at this single point.
  private evaluateExpression(expr: ValueExpression, context: TransformContext): TransformValue {
    if (++this.exprDepth > this.maxExprDepth) {
      this.exprDepth--;
      throw new TransformAbortError(expressionDepthExceededError(this.maxExprDepth));
    }
    this.charge(1);
    try {
      return this.evaluateExpressionInner(expr, context);
    } finally {
      this.exprDepth--;
    }
  }

  // Charge fuel and, at a coarse interval, the wall clock. Both are no-ops
  // unless their cap is set (> 0), so unbounded transforms pay nothing.
  private charge(units: number): void {
    if (this.fuelCap > 0) {
      this.fuelUsed += units;
      if (this.fuelUsed > this.fuelCap) {
        throw new TransformAbortError(budgetExceededError(this.fuelCap));
      }
    }
    if (this.timeoutMs > 0) {
      this.opsSinceClock += units;
      if (this.opsSinceClock >= CLOCK_CHECK_INTERVAL) {
        this.opsSinceClock = 0;
        if (Date.now() - this.startTime > this.timeoutMs) {
          throw new TransformAbortError(timeoutExceededError(this.timeoutMs));
        }
      }
    }
  }

  // Charge width for a verb doing O(n)/O(n log n) work over an array argument,
  // so large-array work cannot escape the budget at a flat unit.
  private chargeVerbWidth(verb: string, args: TransformValue[]): void {
    if (this.fuelCap <= 0 && this.timeoutMs <= 0) return;
    const n = firstArrayWidth(args);
    if (n <= 0) return;
    if (SORT_VERBS.has(verb)) {
      this.charge(n * Math.ceil(Math.log2(Math.max(n, 2))));
    } else if (WIDTH_VERBS.has(verb)) {
      this.charge(n);
    }
  }

  private evaluateExpressionInner(expr: ValueExpression, context: TransformContext): TransformValue {
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
          // Unregistered custom verbs are an SDK extension point: echo the
          // first argument rather than failing the transform.
          if (expr.isCustom) {
            const customArgs = expr.args.map((arg) => this.evaluateExpression(arg, context));
            return customArgs[0] ?? { type: 'null' };
          }
          // T001: Unknown built-in verb
          throw new CodedTransformError(unknownVerbError(expr.verb));
        }

        // Validate arity at execution time (defense in depth)
        const { arity, minArity } = resolveVerbArity(expr.verb);
        if (expr.args.length < minArity) {
          const arityDesc = arity < 0 ? `at least ${minArity}` : `${arity}`;
          throw new Error(
            `Verb '${expr.verb}' requires ${arityDesc} argument(s) but only ${expr.args.length} provided`
          );
        }

        // Control-flow verbs evaluate their branches lazily: the condition is
        // evaluated first and only the selected branch is evaluated, so
        // unselected branches do not fire side effects and `and`/`or`/`coalesce`
        // short-circuit. For pure-value branches the result is identical.
        // Strict mode validates all argument types, so it evaluates eagerly.
        if (!expr.isCustom && !this.strictTypes && LAZY_VERBS.has(expr.verb)) {
          const lazy = this.evaluateLazyVerb(expr, context);
          if (lazy.handled) return lazy.value;
        }

        const args = expr.args.map((arg) => this.evaluateExpression(arg, context));
        this.chargeVerbWidth(expr.verb, args);

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

  // Evaluate a control-flow verb lazily, evaluating only the arguments needed
  // to decide the result. Returns handled=false to defer to eager evaluation
  // (e.g. when there are too few arguments). Selector verbs return the chosen
  // argument unchanged; `and`/`or` short-circuit to a boolean.
  private evaluateLazyVerb(
    expr: TransformExpression,
    context: TransformContext
  ): { handled: boolean; value: TransformValue } {
    const a = expr.args;
    const ev = (i: number): TransformValue => this.evaluateExpression(a[i]!, context);
    const ok = (value: TransformValue) => ({ handled: true, value });
    switch (expr.verb) {
      case 'ifElse':
        if (a.length < 3) break;
        return ok(toBoolean(ev(0)) ? ev(1) : ev(2));
      case 'ifNull': {
        if (a.length < 2) break;
        const v0 = ev(0);
        return ok(isNull(v0) ? ev(1) : v0);
      }
      case 'ifEmpty': {
        if (a.length < 2) break;
        const v0 = ev(0);
        return ok(isEmpty(v0) ? ev(1) : v0);
      }
      case 'coalesce': {
        for (let i = 0; i < a.length; i++) {
          const v = ev(i);
          if (!isNull(v)) return ok(v);
        }
        return ok(nil());
      }
      case 'and':
        if (a.length < 2) break;
        if (!toBoolean(ev(0))) return ok(bool(false));
        return ok(bool(toBoolean(ev(1))));
      case 'or':
        if (a.length < 2) break;
        if (toBoolean(ev(0))) return ok(bool(true));
        return ok(bool(toBoolean(ev(1))));
      case 'cond': {
        if (a.length === 0) break;
        let i = 0;
        while (i < a.length - 1) {
          if (toBoolean(ev(i))) return ok(ev(i + 1));
          i += 2;
        }
        return ok(a.length % 2 === 1 ? ev(a.length - 1) : nil());
      }
      case 'switch': {
        if (a.length < 2) break;
        const subject = toString(ev(0));
        for (let i = 1; i < a.length - 1; i += 2) {
          if (subject === toString(ev(i))) return ok(ev(i + 1));
        }
        return ok((a.length - 1) % 2 === 1 ? ev(a.length - 1) : nil());
      }
    }
    return { handled: false, value: nil() };
  }

  // Whether a mapping copies a source path that is absent (undefined) — distinct
  // from a path present with a null value. Only plain copy expressions qualify;
  // verbs, literals, objects, and special paths are never "missing source".
  private isCopySourceAbsent(
    mapping: FieldMapping,
    context: TransformContext,
    mods: MappingMods = getMappingMods(mapping)
  ): boolean {
    const expr = mapping.value;
    if (expr.type !== 'copy') return false;
    // A :default modifier supplies its own fallback; not a missing-source error.
    if (mods.hasDefaultOrObject) return false;
    const path = expr.path;
    if (path === '' || path.startsWith('$') || path === '_index') return false;
    if (context.counters.has(path)) return false;

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
    const value = targetPath ? resolvePath(targetPath, targetObj) : targetObj;
    return value === undefined;
  }

  private resolvePathValue(path: string, context: TransformContext): TransformValue {
    // Handle special paths
    if (path.startsWith('$accumulator.')) {
      const name = path.slice('$accumulator.'.length);
      const acc = context.accumulators.get(name);
      if (acc !== undefined) return acc;
      const counter = context.counters.get(name);
      if (counter !== undefined) return { type: 'integer', value: counter };
      return { type: 'null' };
    }

    if (path.startsWith('$const.')) {
      const name = path.slice('$const.'.length);
      return context.constants.get(name) ?? { type: 'null' };
    }

    if (path === '_index') {
      const index = context.counters.get('_index');
      return index !== undefined ? { type: 'integer', value: index } : { type: 'null' };
    }

    // Loop counters declared via :counter are readable by bare name.
    if (context.counters.has(path)) {
      return { type: 'integer', value: context.counters.get(path)! };
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

      // Preserve ODIN type info for loop-item fields via the item's doc path.
      if (context.sourceOdinDoc && context.currentOdinPath && targetPath) {
        const odinValue = context.sourceOdinDoc.get(`${context.currentOdinPath}.${targetPath}`);
        if (odinValue) {
          return odinValueToTransformValue(odinValue);
        }
      }
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
