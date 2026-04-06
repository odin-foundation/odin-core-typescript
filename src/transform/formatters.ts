/**
 * ODIN Transform Output Formatters
 *
 * Registry-based formatting to output formats (JSON, XML, CSV, etc.).
 * All transforms route through ODIN as the canonical data model.
 */

import type { TransformValue } from '../types/transform.js';
import type { OdinDocument } from '../types/document.js';
import { stringify } from '../serializer/stringify.js';
import { createDocumentBuilder } from '../types/document-impl.js';

// Re-export types for backward compatibility
export type { FormatterOptions } from './formatters/types.js';

// Re-export CDM normalizer
export { normalizeToOdin } from './cdm-normalizer.js';

// Import formatters from individual modules
import { normalizeToOdin } from './cdm-normalizer.js';
import type { FormatterOptions } from './formatters/types.js';
import { formatJsonFromOdin } from './formatters/json-formatter.js';
import { formatXmlFromOdin } from './formatters/xml-formatter.js';
import { formatCsvFromOdin } from './formatters/csv-formatter.js';
import { formatFixedWidth } from './formatters/fixed-formatter.js';
import { formatFlatFromOdin } from './formatters/flat-formatter.js';

// ─────────────────────────────────────────────────────────────────────────────
// Output Formatter Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context provided to formatters.
 */
export interface FormatterContext {
  odinDoc: OdinDocument;
  rawOutput: Record<string, TransformValue>;
  options: FormatterOptions;
}

/**
 * Formatter function type for output formats.
 */
export type OutputFormatter = (context: FormatterContext) => string;

/**
 * Registry of output formatters by format name.
 * Allows adding new formats without modifying formatOutput().
 */
const outputFormatterRegistry = new Map<string, OutputFormatter>();

/**
 * Register an output formatter for a format.
 *
 * @param format - Format name (e.g., 'json', 'xml')
 * @param formatter - Formatter function
 */
export function registerOutputFormatter(format: string, formatter: OutputFormatter): void {
  outputFormatterRegistry.set(format, formatter);
}

/**
 * Get a registered output formatter.
 *
 * @param format - Format name
 * @returns Formatter function or undefined if not registered
 */
export function getOutputFormatter(format: string): OutputFormatter | undefined {
  return outputFormatterRegistry.get(format);
}

// Register built-in formatters
registerOutputFormatter('json', (ctx) => formatJsonFromOdin(ctx.odinDoc, ctx.options.transform));
registerOutputFormatter('xml', (ctx) => formatXmlFromOdin(ctx.odinDoc, ctx.options.transform));
registerOutputFormatter('csv', (ctx) => formatCsvFromOdin(ctx.odinDoc, ctx.options.transform));
registerOutputFormatter('fixed-width', (ctx) => formatFixedWidth(ctx.rawOutput, ctx.options));
registerOutputFormatter('flat', (ctx) => formatFlatFromOdin(ctx.odinDoc, ctx.options.transform));
registerOutputFormatter('properties', (ctx) =>
  formatFlatFromOdin(ctx.odinDoc, ctx.options.transform)
);
registerOutputFormatter('odin', (ctx) => {
  if (ctx.options.transform.target.header) {
    const builder = createDocumentBuilder();
    builder.metadata('odin', '1.0.0');
    for (const path of ctx.odinDoc.paths()) {
      if (!path.startsWith('$.')) {
        const value = ctx.odinDoc.get(path);
        if (value !== undefined) {
          const mods = ctx.odinDoc.modifiers.get(path);
          if (mods) {
            builder.setWithModifiers(path, value, mods);
          } else {
            builder.set(path, value);
          }
        }
      }
    }
    return stringify(builder.build());
  }
  return stringify(ctx.odinDoc);
});

/**
 * Format output based on target format specification.
 *
 * CDM Architecture: This function first normalizes the output to an OdinDocument,
 * then formats from the canonical form to the target format.
 *
 * Flow: TransformValue -> OdinDocument (CDM) -> Target Format String
 */
export function formatOutput(
  output: Record<string, TransformValue>,
  options: FormatterOptions
): string {
  const { transform } = options;

  // Step 1: Normalize to OdinDocument (Canonical Data Model)
  const odinDoc = normalizeToOdin(output);

  // Step 2: Create formatter context
  const context: FormatterContext = {
    odinDoc,
    rawOutput: output,
    options,
  };

  // Step 3: Format from canonical form to target format using registry
  const formatter = outputFormatterRegistry.get(transform.target.format);

  if (formatter) {
    return formatter(context);
  }

  // Default: JSON stringify the canonical form
  return JSON.stringify(odinDoc.toJSON(), null, 2);
}
