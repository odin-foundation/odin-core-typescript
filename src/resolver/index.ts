/**
 * Import resolution, bundling, and serialization for ODIN schemas.
 *
 * @example
 * ```typescript
 * import { resolveSchemaFile, bundleSchema } from '@odin/sdk/resolver';
 *
 * const result = await resolveSchemaFile('./policy.odin');
 * const addressType = result.resolution.typeRegistry.lookup('types.address');
 *
 * const bundled = await bundleSchema('./auto.schema.odin', {
 *   headerComment: 'Generated bundle - DO NOT EDIT',
 * });
 * fs.writeFileSync('./auto.bundled.odin', bundled);
 * ```
 */

// File Loader
export {
  FileLoader,
  createFileLoader,
  type FileLoaderOptions,
  type ResolvedPath,
} from './file-loader.js';

// Circular Detector
export {
  CircularDetector,
  createCircularDetector,
  withCircularDetection,
  withCircularDetectionSync,
  type ImportChain,
} from './circular-detector.js';

// Type Registry
export {
  TypeRegistry,
  createTypeRegistry,
  type RegisteredType,
  type LookupOptions,
} from './type-registry.js';

// Import Resolver
export {
  ImportResolver,
  createImportResolver,
  resolveSchemaFile,
  resolveDocumentFile,
  createResolverCache,
  SimpleResolverCache,
  type ResolverOptions,
  type ResolverCache,
  type ResolvedImport,
  type ResolvedResult,
  type ResolvedSchema,
  type ResolvedDocument,
} from './import-resolver.js';

// Schema Serializer
export {
  SchemaSerializer,
  createSchemaSerializer,
  serializeSchema,
  type SerializerOptions,
} from './schema-serializer.js';

// Schema Flattener
export {
  SchemaFlattener,
  createSchemaFlattener,
  flattenSchemaFile,
  bundleSchema,
  type FlattenerOptions,
  type FlattenedResult,
} from './schema-flattener.js';
