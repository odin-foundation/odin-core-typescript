/**
 * Convenience helper: validate a document against a schema that uses @import.
 *
 * Resolves the schema's imports into a type registry and validates with it, so
 * callers don't have to wire ImportResolver + registry by hand (and can't skip
 * import resolution by accident).
 */

import type { OdinDocument } from './types/document.js';
import type { OdinSchema, ValidationResult } from './types/schema.js';
import type { ValidateOptions } from './types/options.js';
import { validate } from './validator/validate.js';
import { ImportResolver, type ResolverOptions } from './resolver/import-resolver.js';

/**
 * Validate a parsed schema's imports relative to `basePath`, then validate the document.
 *
 * @param doc - Document to validate
 * @param schema - Parsed schema (from Odin.parseSchema / parseSchema)
 * @param basePath - Path the schema was loaded from, for resolving relative @imports
 * @param options - Validation options
 * @param resolverOptions - Import resolver options (e.g. sandboxRoot)
 */
export async function validateWithImports(
  doc: OdinDocument,
  schema: OdinSchema,
  basePath: string,
  options?: ValidateOptions,
  resolverOptions?: ResolverOptions
): Promise<ValidationResult> {
  const resolver = new ImportResolver({ ...resolverOptions, schemaMode: true });
  const { resolution } = await resolver.resolveSchema(schema, basePath);
  return validate(doc, schema, options, resolution.typeRegistry);
}
