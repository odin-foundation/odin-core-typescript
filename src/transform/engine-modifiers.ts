/**
 * ODIN Transform Engine - Field Modifier Application
 *
 * Functions for applying field modifiers to transform values.
 * Handles string manipulation, type coercion, defaults, and format modifiers.
 */

import type { TransformValue, TransformContext, Modifier } from '../types/transform.js';
import { transformValueToString, formatDateOnly } from './engine-value-utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Path Value Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a path value from the transform context.
 * Needed for :default modifier with path references.
 */
export type PathValueResolver = (path: string, context: TransformContext) => TransformValue;

// ─────────────────────────────────────────────────────────────────────────────
// Modifier Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context provided to modifier handlers.
 */
export interface ModifierContext {
  value: TransformValue;
  modifier: Modifier;
  transformContext: TransformContext;
  resolvePathValue: PathValueResolver;
}

/**
 * Modifier handler function type.
 * Returns the modified value, or the original value if no modification was made.
 */
export type ModifierHandler = (ctx: ModifierContext) => TransformValue;

/**
 * Registry of modifier handlers by modifier name.
 * Allows adding new modifiers without modifying applyModifiers().
 */
const modifierRegistry = new Map<string, ModifierHandler>();

/**
 * Register a modifier handler.
 *
 * @param name - Modifier name (e.g., 'upper', 'trim')
 * @param handler - Handler function
 */
export function registerModifier(name: string, handler: ModifierHandler): void {
  modifierRegistry.set(name, handler);
}

/**
 * Get a registered modifier handler.
 *
 * @param name - Modifier name
 * @returns Handler function or undefined if not registered
 */
export function getModifier(name: string): ModifierHandler | undefined {
  return modifierRegistry.get(name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Modifier Handlers
// ─────────────────────────────────────────────────────────────────────────────

// String manipulation modifiers
registerModifier('upper', ({ value }) => {
  if (value.type === 'string') {
    return { type: 'string', value: value.value.toUpperCase() };
  }
  return value;
});

registerModifier('lower', ({ value }) => {
  if (value.type === 'string') {
    return { type: 'string', value: value.value.toLowerCase() };
  }
  return value;
});

registerModifier('trim', ({ value }) => {
  if (value.type === 'string') {
    return { type: 'string', value: value.value.trim() };
  }
  return value;
});

registerModifier('maxLen', ({ value, modifier }) => {
  if (value.type === 'string' && typeof modifier.value === 'number') {
    return { type: 'string', value: value.value.slice(0, modifier.value) };
  }
  return value;
});

// Default value modifier
registerModifier('default', ({ value, modifier, transformContext, resolvePathValue }) => {
  if (value.type === 'null' && modifier.value !== undefined) {
    // Check if default value is a path reference that needs resolution
    if (typeof modifier.value === 'string' && modifier.value.startsWith('@')) {
      // Resolve the path reference (e.g., @$const.DEFAULT_STATE)
      const path = modifier.value.slice(1); // Remove the @ prefix
      return resolvePathValue(path, transformContext);
    } else if (typeof modifier.value === 'string') {
      return { type: 'string', value: modifier.value };
    } else if (typeof modifier.value === 'number') {
      return { type: 'number', value: modifier.value };
    } else if (typeof modifier.value === 'boolean') {
      return { type: 'boolean', value: modifier.value };
    }
  }
  return value;
});

// Type coercion modifier (handles multiple sub-types)
registerModifier('type', ({ value, modifier }) => {
  if (modifier.value === 'string' && value.type !== 'string') {
    return { type: 'string', value: transformValueToString(value) };
  } else if (modifier.value === 'number') {
    if (value.type === 'string') {
      const n = parseFloat(value.value);
      if (!isNaN(n)) {
        return { type: 'number', value: n, raw: value.value };
      }
    } else if (value.type === 'integer') {
      return { type: 'number', value: value.value };
    }
  } else if (modifier.value === 'integer') {
    const numVal =
      value.type === 'string'
        ? parseInt(value.value, 10)
        : value.type === 'number' || value.type === 'integer' || value.type === 'currency'
          ? Math.trunc(value.value)
          : NaN;
    if (!isNaN(numVal)) {
      return { type: 'integer', value: numVal };
    }
  } else if (modifier.value === 'currency') {
    const rawStr = value.type === 'string' ? value.value : undefined;
    const numVal =
      value.type === 'string'
        ? parseFloat(value.value)
        : value.type === 'number' ||
            value.type === 'integer' ||
            value.type === 'currency' ||
            value.type === 'percent'
          ? value.value
          : NaN;
    if (!isNaN(numVal)) {
      return rawStr
        ? { type: 'currency', value: numVal, decimalPlaces: 2, raw: rawStr }
        : { type: 'currency', value: numVal, decimalPlaces: 2 };
    }
  } else if (modifier.value === 'percent') {
    const rawStr = value.type === 'string' ? value.value : undefined;
    const numVal =
      value.type === 'string'
        ? parseFloat(value.value)
        : value.type === 'number' ||
            value.type === 'integer' ||
            value.type === 'currency' ||
            value.type === 'percent'
          ? value.value
          : NaN;
    if (!isNaN(numVal)) {
      return rawStr
        ? { type: 'percent', value: numVal, raw: rawStr }
        : { type: 'percent', value: numVal };
    }
  } else if (modifier.value === 'boolean') {
    if (value.type === 'string') {
      return {
        type: 'boolean',
        value: value.value === 'true' || value.value === '1',
      };
    }
  } else if (modifier.value === 'reference') {
    if (value.type === 'string') {
      return { type: 'reference', path: value.value };
    }
  } else if (modifier.value === 'binary') {
    if (value.type === 'string') {
      const colonIndex = value.value.indexOf(':');
      if (colonIndex > 0 && colonIndex < 20) {
        const algorithm = value.value.slice(0, colonIndex);
        const base64Data = value.value.slice(colonIndex + 1);
        const binaryStr = atob(base64Data);
        const data = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          data[i] = binaryStr.charCodeAt(i);
        }
        return { type: 'binary', data, algorithm };
      } else {
        const binaryStr = atob(value.value);
        const data = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          data[i] = binaryStr.charCodeAt(i);
        }
        return { type: 'binary', data };
      }
    }
  }
  return value;
});

// Decimals modifier for currency
registerModifier('decimals', ({ value, modifier }) => {
  if (value.type === 'currency' && typeof modifier.value === 'number') {
    return { ...value, decimalPlaces: modifier.value };
  }
  return value;
});

// Currency code modifier (e.g., :currencyCode "USD")
registerModifier('currencyCode', ({ value, modifier }) => {
  if (value.type === 'currency' && typeof modifier.value === 'string') {
    return { ...value, currencyCode: modifier.value.toUpperCase() };
  }
  return value;
});

// Temporal modifiers
registerModifier('date', ({ value }) => {
  if (value.type === 'string') {
    const parsed = new Date(value.value);
    if (!isNaN(parsed.getTime())) {
      const raw = formatDateOnly(parsed);
      return { type: 'date', value: parsed, raw };
    }
  } else if (value.type === 'timestamp') {
    const raw = formatDateOnly(value.value);
    return { type: 'date', value: value.value, raw };
  }
  return value;
});

registerModifier('timestamp', ({ value }) => {
  if (value.type === 'string') {
    const parsed = new Date(value.value);
    if (!isNaN(parsed.getTime())) {
      const raw = parsed.toISOString();
      return { type: 'timestamp', value: parsed, raw };
    }
  } else if (value.type === 'date') {
    const raw = value.value.toISOString();
    return { type: 'timestamp', value: value.value, raw };
  }
  return value;
});

registerModifier('time', ({ value }) => {
  if (value.type === 'string') {
    // Extract time portion from ISO string or use as-is
    let timeStr = value.value;
    if (timeStr.includes('T')) {
      timeStr = timeStr.split('T')[1]?.split('Z')[0]?.split('+')[0]?.split('-')[0] ?? timeStr;
    }
    return { type: 'time', value: timeStr.startsWith('T') ? timeStr : `T${timeStr}` };
  } else if (value.type === 'timestamp' || value.type === 'date') {
    const d = value.value;
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const mins = String(d.getUTCMinutes()).padStart(2, '0');
    const secs = String(d.getUTCSeconds()).padStart(2, '0');
    return { type: 'time', value: `T${hours}:${mins}:${secs}` };
  }
  return value;
});

registerModifier('duration', ({ value }) => {
  if (value.type === 'string') {
    return { type: 'duration', value: value.value };
  }
  return value;
});

// Pass-through modifiers (handled by formatter or caller)
// These are registered as no-ops so the registry knows they're valid
const noopHandler: ModifierHandler = ({ value }) => value;
registerModifier('pos', noopHandler);
registerModifier('len', noopHandler);
registerModifier('field', noopHandler);
registerModifier('leftPad', noopHandler);
registerModifier('rightPad', noopHandler);
registerModifier('truncate', noopHandler);
registerModifier('if', noopHandler);
registerModifier('unless', noopHandler);
registerModifier('required', noopHandler);
registerModifier('omitNull', noopHandler);
registerModifier('omitEmpty', noopHandler);
registerModifier('attr', noopHandler);

// ─────────────────────────────────────────────────────────────────────────────
// Modifier Application
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a sequence of modifiers to a transform value.
 *
 * Supports modifiers:
 * - String manipulation: upper, lower, trim, maxLen
 * - Defaults: default
 * - Type coercion: type, decimals
 * - Temporal: date, timestamp, time, duration
 * - Fixed-width: pos, len, leftPad, rightPad, truncate (handled by formatter)
 * - Conditionals: if, unless, required, omitNull, omitEmpty (handled by caller)
 *
 * @param value - Initial transform value
 * @param modifiers - Array of modifiers to apply
 * @param context - Transform context for path resolution
 * @param resolvePathValue - Function to resolve path values (for :default)
 * @returns Modified transform value
 *
 * @example
 * applyModifiers(
 *   { type: 'string', value: 'hello' },
 *   [{ name: 'upper', value: undefined }],
 *   context,
 *   resolvePathValue
 * ) // => { type: 'string', value: 'HELLO' }
 */
export function applyModifiers(
  value: TransformValue,
  modifiers: Modifier[],
  context: TransformContext,
  resolvePathValue: PathValueResolver
): TransformValue {
  let result = value;

  for (const mod of modifiers) {
    const handler = modifierRegistry.get(mod.name);
    if (handler) {
      result = handler({
        value: result,
        modifier: mod,
        transformContext: context,
        resolvePathValue,
      });
    }
    // Unknown modifiers are silently ignored for forward compatibility
  }

  return result;
}
