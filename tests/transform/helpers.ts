/**
 * Shared Test Helpers for ODIN Transform Tests
 *
 * Provides common utilities for creating test contexts, transform values,
 * and invoking verbs directly for unit testing.
 */

import { defaultVerbRegistry } from '../../src/transform/verbs.js';
import type { TransformContext, TransformValue, LookupTable } from '../../src/types/transform.js';

/**
 * Create a minimal TransformContext for verb testing
 */
export function createContext(overrides?: Partial<TransformContext>): TransformContext {
  return {
    source: {},
    current: undefined,
    aliases: new Map(),
    counters: new Map(),
    accumulators: new Map(),
    tables: new Map(),
    constants: new Map(),
    sequenceCounters: new Map(),
    ...overrides,
  };
}

/**
 * Create a context with a source object for path resolution
 */
export function createContextWithSource(source: unknown): TransformContext {
  return createContext({ source });
}

/**
 * Create a context with lookup tables (new format with columns and rows)
 * @param tables - Record of table name to { columns: string[], rows: TransformValue[][] }
 */
export function createContextWithTables(
  tables: Record<string, { columns: string[]; rows: TransformValue[][] }>
): TransformContext {
  const tableMap = new Map<string, LookupTable>();
  for (const [name, { columns, rows }] of Object.entries(tables)) {
    tableMap.set(name, { name, columns, rows });
  }
  return createContext({ tables: tableMap });
}

/**
 * Create a simple two-column lookup table (key -> value)
 * Convenience helper for simple code translation tables
 */
export function createSimpleTable(entries: Record<string, TransformValue>): {
  columns: string[];
  rows: TransformValue[][];
} {
  const rows: TransformValue[][] = [];
  for (const [key, value] of Object.entries(entries)) {
    rows.push([str(key), value]);
  }
  return { columns: ['key', 'value'], rows };
}

/**
 * Create a context with accumulators
 */
export function createContextWithAccumulators(
  accumulators: Record<string, TransformValue>
): TransformContext {
  const accMap = new Map<string, TransformValue>();
  for (const [name, value] of Object.entries(accumulators)) {
    accMap.set(name, value);
  }
  return createContext({ accumulators: accMap });
}

// ─────────────────────────────────────────────────────────────────────────────
// TransformValue Creation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create string TransformValue */
export const str = (value: string): TransformValue => ({ type: 'string', value });

/** Create integer TransformValue */
export const int = (value: number): TransformValue => ({
  type: 'integer',
  value: Math.floor(value),
});

/** Create number TransformValue */
export const num = (value: number): TransformValue => ({ type: 'number', value });

/** Create boolean TransformValue */
export const bool = (value: boolean): TransformValue => ({ type: 'boolean', value });

/** Create null TransformValue */
export const nil = (): TransformValue => ({ type: 'null' });

/** Helper to format date as YYYY-MM-DD */
function formatDateOnly(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Create date TransformValue */
export const date = (value: Date): TransformValue => ({
  type: 'date',
  value,
  raw: formatDateOnly(value),
});

/** Create timestamp TransformValue */
export const timestamp = (value: Date): TransformValue => ({
  type: 'timestamp',
  value,
  raw: value.toISOString(),
});

/** Create currency TransformValue */
export const currency = (value: number): TransformValue => ({
  type: 'currency',
  value,
  decimalPlaces: 2,
});

/** Create array TransformValue */
export const arr = (value: unknown[]): TransformValue => ({
  type: 'array',
  items: value as any,
});

/** Create object TransformValue */
export const obj = (value: Record<string, unknown>): TransformValue => ({
  type: 'object',
  value,
});

// ─────────────────────────────────────────────────────────────────────────────
// Verb Invocation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call a verb by name with given arguments
 * @throws Error if verb not found
 */
export function callVerb(
  name: string,
  args: TransformValue[],
  context?: TransformContext
): TransformValue {
  const verb = defaultVerbRegistry.get(name);
  if (!verb) {
    throw new Error(`Verb '${name}' not found in registry`);
  }
  return verb(args, context ?? createContext());
}

/**
 * Call a verb and expect it to return null
 */
export function expectVerbReturnsNull(
  name: string,
  args: TransformValue[],
  context?: TransformContext
): void {
  const result = callVerb(name, args, context);
  if (result.type !== 'null') {
    throw new Error(`Expected verb '${name}' to return null, got ${result.type}`);
  }
}

/**
 * Call a verb and return the string value (throws if not string)
 */
export function callVerbString(
  name: string,
  args: TransformValue[],
  context?: TransformContext
): string {
  const result = callVerb(name, args, context);
  if (result.type !== 'string') {
    throw new Error(`Expected verb '${name}' to return string, got ${result.type}`);
  }
  return result.value;
}

/**
 * Call a verb and return the numeric value (throws if not number/integer)
 */
export function callVerbNumber(
  name: string,
  args: TransformValue[],
  context?: TransformContext
): number {
  const result = callVerb(name, args, context);
  if (result.type !== 'number' && result.type !== 'integer' && result.type !== 'currency') {
    throw new Error(`Expected verb '${name}' to return number, got ${result.type}`);
  }
  return result.value;
}

/**
 * Call a verb and return the boolean value (throws if not boolean)
 */
export function callVerbBoolean(
  name: string,
  args: TransformValue[],
  context?: TransformContext
): boolean {
  const result = callVerb(name, args, context);
  if (result.type !== 'boolean') {
    throw new Error(`Expected verb '${name}' to return boolean, got ${result.type}`);
  }
  return result.value;
}

/**
 * Call a verb and return the date value (throws if not date/timestamp)
 */
export function callVerbDate(
  name: string,
  args: TransformValue[],
  context?: TransformContext
): Date {
  const result = callVerb(name, args, context);
  if (result.type !== 'date' && result.type !== 'timestamp') {
    throw new Error(`Expected verb '${name}' to return date/timestamp, got ${result.type}`);
  }
  return result.value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a UTC date */
export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Create a UTC timestamp */
export function utcTimestamp(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertion Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Check if TransformValue is null type */
export function isNullValue(val: TransformValue): boolean {
  return val.type === 'null';
}

/** Get the raw value from TransformValue (throws on null) */
export function getValue<T>(val: TransformValue): T {
  if (val.type === 'null') {
    throw new Error('Cannot get value from null TransformValue');
  }
  // Arrays use 'items' not 'value'
  if (val.type === 'array') {
    return val.items as T;
  }
  return (val as any).value as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// CDM Output Helpers - For verifying engine output (TransformValue objects)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a value is a TransformValue object
 */
export function isTransformValue(value: unknown): value is TransformValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as TransformValue).type === 'string'
  );
}

/**
 * Extract the raw JS value from a CDM output structure.
 * Recursively converts TransformValue objects to their JS equivalents.
 * This is used for backward-compatible test assertions.
 */
export function extractValues(output: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    result[key] = extractValue(value);
  }
  return result;
}

/**
 * Extract raw value from a single value (may be TransformValue or nested object)
 */
export function extractValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // If it's a TransformValue, extract the raw value
  if (isTransformValue(value)) {
    if (value.type === 'null') {
      return null;
    }
    if (value.type === 'array') {
      return (value.items as unknown[]).map(extractValue);
    }
    if (value.type === 'object') {
      return extractValues(value.value as Record<string, unknown>);
    }
    return (value as { value: unknown }).value;
  }

  // If it's a plain object, recurse
  if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    return extractValues(value as Record<string, unknown>);
  }

  // If it's an array, map over it
  if (Array.isArray(value)) {
    return value.map(extractValue);
  }

  // Primitive value
  return value;
}

/**
 * Assert that a CDM output field has a specific type and value.
 * Used for verifying the canonical data model directly.
 */
export function expectCdmValue(
  output: Record<string, unknown>,
  path: string,
  expectedType: string,
  expectedValue?: unknown
): void {
  const parts = path.split('.');
  let current: unknown = output;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(`Path ${path} not found: ${part} is not an object`);
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (!isTransformValue(current)) {
    throw new Error(`Value at ${path} is not a TransformValue: ${JSON.stringify(current)}`);
  }

  if (current.type !== expectedType) {
    throw new Error(`Expected type '${expectedType}' at ${path}, got '${current.type}'`);
  }

  if (expectedValue !== undefined) {
    const actualValue =
      current.type === 'null'
        ? null
        : current.type === 'array'
          ? current.items
          : (current as { value: unknown }).value;
    if (
      actualValue !== expectedValue &&
      JSON.stringify(actualValue) !== JSON.stringify(expectedValue)
    ) {
      throw new Error(
        `Expected value ${JSON.stringify(expectedValue)} at ${path}, got ${JSON.stringify(actualValue)}`
      );
    }
  }
}

/**
 * Get a CDM value at a path from the output
 */
export function getCdmValue(output: Record<string, unknown>, path: string): TransformValue {
  const parts = path.split('.');
  let current: unknown = output;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(`Path ${path} not found: ${part} is not an object`);
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (!isTransformValue(current)) {
    throw new Error(`Value at ${path} is not a TransformValue: ${JSON.stringify(current)}`);
  }

  return current;
}
