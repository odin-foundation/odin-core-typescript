/**
 * ODIN Transform Logic Verbs
 *
 * Boolean logic, comparison operators, type checks, and conditional evaluation.
 */

import type { VerbFunction, TransformValue } from '../../types/transform.js';
import { toBoolean, toNumber, toString, bool, nil, str } from './helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Boolean Logic Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %and @a @b - Boolean AND
 * Returns true if both values are truthy.
 */
export const and: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  return bool(toBoolean(args[0]!) && toBoolean(args[1]!));
};

/**
 * %or @a @b - Boolean OR
 * Returns true if either value is truthy.
 */
export const or: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  return bool(toBoolean(args[0]!) || toBoolean(args[1]!));
};

/**
 * %not @value - Boolean NOT
 * Returns the logical negation of the value.
 */
export const not: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return bool(!toBoolean(args[0]!));
};

/**
 * %xor @a @b - Boolean XOR (exclusive or)
 * Returns true if exactly one value is truthy.
 */
export const xor: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const a = toBoolean(args[0]!);
  const b = toBoolean(args[1]!);
  return bool((a && !b) || (!a && b));
};

// ─────────────────────────────────────────────────────────────────────────────
// Comparison Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare two TransformValues for equality.
 * Handles type coercion appropriately.
 */
function valuesEqual(a: TransformValue, b: TransformValue): boolean {
  // Same type - direct comparison
  if (a.type === b.type) {
    switch (a.type) {
      case 'null':
        return true;
      case 'string':
        return a.value === (b as typeof a).value;
      case 'integer':
      case 'number':
      case 'currency':
      case 'percent':
        return a.value === (b as typeof a).value;
      case 'boolean':
        return a.value === (b as typeof a).value;
      case 'date':
      case 'timestamp':
        return a.value.getTime() === (b as typeof a).value.getTime();
      case 'time':
      case 'duration':
        return a.value === (b as typeof a).value;
      case 'array':
        return JSON.stringify(a.items) === JSON.stringify((b as typeof a).items);
      case 'object':
        return JSON.stringify(a.value) === JSON.stringify((b as typeof a).value);
      default:
        return false;
    }
  }

  // Cross-type comparison with coercion
  // null is only equal to null
  if (a.type === 'null' || b.type === 'null') {
    return false;
  }

  // Numeric types can compare with each other
  const numericTypes = new Set(['integer', 'number', 'currency']);
  if (numericTypes.has(a.type) && numericTypes.has(b.type)) {
    return toNumber(a) === toNumber(b);
  }

  // String comparison as fallback
  return toString(a) === toString(b);
}

/**
 * %eq @a @b - Equality comparison
 * Returns true if values are equal.
 */
export const eq: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  return bool(valuesEqual(args[0]!, args[1]!));
};

/**
 * %ne @a @b - Not equal comparison
 * Returns true if values are not equal.
 */
export const ne: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  return bool(!valuesEqual(args[0]!, args[1]!));
};

/**
 * %lt @a @b - Less than comparison
 * Returns true if first value is less than second.
 */
export const lt: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const a = args[0]!;
  const b = args[1]!;

  // String comparison if both are strings
  if (a.type === 'string' && b.type === 'string') {
    return bool(a.value < b.value);
  }

  // Date comparison
  if (
    (a.type === 'date' || a.type === 'timestamp') &&
    (b.type === 'date' || b.type === 'timestamp')
  ) {
    return bool(toNumber(a) < toNumber(b));
  }

  // Numeric comparison
  return bool(toNumber(a) < toNumber(b));
};

/**
 * %lte @a @b - Less than or equal comparison
 * Returns true if first value is less than or equal to second.
 */
export const lte: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const a = args[0]!;
  const b = args[1]!;

  // String comparison if both are strings
  if (a.type === 'string' && b.type === 'string') {
    return bool(a.value <= b.value);
  }

  // Date comparison
  if (
    (a.type === 'date' || a.type === 'timestamp') &&
    (b.type === 'date' || b.type === 'timestamp')
  ) {
    return bool(toNumber(a) <= toNumber(b));
  }

  // Numeric comparison
  return bool(toNumber(a) <= toNumber(b));
};

/**
 * %gt @a @b - Greater than comparison
 * Returns true if first value is greater than second.
 */
export const gt: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const a = args[0]!;
  const b = args[1]!;

  // String comparison if both are strings
  if (a.type === 'string' && b.type === 'string') {
    return bool(a.value > b.value);
  }

  // Date comparison
  if (
    (a.type === 'date' || a.type === 'timestamp') &&
    (b.type === 'date' || b.type === 'timestamp')
  ) {
    return bool(toNumber(a) > toNumber(b));
  }

  // Numeric comparison
  return bool(toNumber(a) > toNumber(b));
};

/**
 * %gte @a @b - Greater than or equal comparison
 * Returns true if first value is greater than or equal to second.
 */
export const gte: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const a = args[0]!;
  const b = args[1]!;

  // String comparison if both are strings
  if (a.type === 'string' && b.type === 'string') {
    return bool(a.value >= b.value);
  }

  // Date comparison
  if (
    (a.type === 'date' || a.type === 'timestamp') &&
    (b.type === 'date' || b.type === 'timestamp')
  ) {
    return bool(toNumber(a) >= toNumber(b));
  }

  // Numeric comparison
  return bool(toNumber(a) >= toNumber(b));
};

/**
 * %between @value @min @max - Numeric range check (inclusive)
 * Returns true if value is between min and max (inclusive).
 */
export const between: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const value = toNumber(args[0]!);
  const min = toNumber(args[1]!);
  const max = toNumber(args[2]!);
  return bool(value >= min && value <= max);
};

// ─────────────────────────────────────────────────────────────────────────────
// Type Check Verbs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %isNull @value - Check if value is null
 */
export const isNullVerb: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return bool(args[0]!.type === 'null');
};

/**
 * %isString @value - Check if value is a string
 */
export const isString: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return bool(args[0]!.type === 'string');
};

/**
 * %isNumber @value - Check if value is numeric (integer, number, or currency)
 */
export const isNumber: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const type = args[0]!.type;
  return bool(type === 'integer' || type === 'number' || type === 'currency');
};

/**
 * %isBoolean @value - Check if value is a boolean
 */
export const isBoolean: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return bool(args[0]!.type === 'boolean');
};

/**
 * %isArray @value - Check if value is an array
 */
export const isArray: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return bool(args[0]!.type === 'array');
};

/**
 * %isObject @value - Check if value is an object
 */
export const isObject: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return bool(args[0]!.type === 'object');
};

/**
 * %isDate @value - Check if value is a date or timestamp
 */
export const isDate: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const type = args[0]!.type;
  return bool(type === 'date' || type === 'timestamp');
};

/**
 * %typeOf @value - Return the type name of a value
 * Returns: "null", "string", "integer", "number", "currency", "boolean",
 *          "date", "timestamp", "time", "duration", "array", "object",
 *          "reference", "binary"
 */
export const typeOf: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  return str(args[0]!.type);
};

// ─────────────────────────────────────────────────────────────────────────────
// Conditional Verb
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %cond @c1 @v1 @c2 @v2 ... @default - Multi-condition evaluation
 * Evaluates conditions in pairs, returning the value for the first true condition.
 * If no condition matches, returns the final default value.
 *
 * @example
 * ```odin
 * ; If status is "active" return "A", if "pending" return "P", else "X"
 * code = "%cond %eq @.status 'active' 'A' %eq @.status 'pending' 'P' 'X'"
 * ```
 */
export const cond: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  // Process condition/value pairs
  let i = 0;
  while (i < args.length - 1) {
    const condition = args[i]!;
    const value = args[i + 1]!;

    if (toBoolean(condition)) {
      return value;
    }

    i += 2;
  }

  // Return default (last arg) if no condition matched
  // If odd number of args, last one is default
  if (args.length % 2 === 1) {
    return args[args.length - 1]!;
  }

  return nil();
};

// ─────────────────────────────────────────────────────────────────────────────
// Validation/Assertion Verb
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %assert @condition [@message] - Assert a condition is true
 *
 * Returns the condition value if truthy, otherwise returns null with an
 * optional error message. Use for validation in transforms.
 * Throws a warning (not error) when assertion fails - transform continues.
 *
 * @example
 * valid = "%assert %gt @.amount ##0 \"Amount must be positive\""
 * valid = "%assert %isNumber @.value"
 */
export const assert: VerbFunction = (args) => {
  if (args.length === 0) return nil();

  const condition = args[0]!;
  // Message argument is available for logging/debugging but not used in output
  // const message = args.length >= 2 ? toString(args[1]!) : 'Assertion failed';

  if (toBoolean(condition)) {
    return condition;
  }

  // Return null when assertion fails - caller can handle logging if needed
  return nil();
};
