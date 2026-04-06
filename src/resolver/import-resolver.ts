/**
 * Recursively resolve imports and build type registry.
 */

import { FileLoader, type FileLoaderOptions, type ResolvedPath } from './file-loader.js';
import { CircularDetector, type ImportChain, withCircularDetection } from './circular-detector.js';
import { TypeRegistry, createTypeRegistry } from './type-registry.js';
import { parseSchema } from '../validator/schema-parser.js';
import { parse, type ParsedDocument, type ImportDirective } from '../parser/parser.js';
import type { OdinSchema } from '../types/schema.js';
import { ParseError } from '../types/errors.js';
import { SECURITY_LIMITS } from '../utils/security-limits.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for import resolution.
 */
export interface ResolverOptions extends FileLoaderOptions {
  /**
   * Maximum depth of import nesting.
   * @default 32
   */
  maxImportDepth?: number;

  /**
   * Whether to parse imports as schemas (true) or documents (false).
   * Schema mode extracts type definitions (@name).
   * Document mode extracts data.
   * @default true
   */
  schemaMode?: boolean;

  /**
   * Cache for already-resolved files.
   * Allows sharing resolution results across multiple parse operations.
   */
  cache?: ResolverCache;

  /**
   * Custom FileLoader instance for dependency injection.
   * If provided, other FileLoaderOptions are ignored.
   * Use this for testing with mock file systems.
   */
  fileLoader?: FileLoader;
}

/**
 * Cache for resolved imports.
 */
export interface ResolverCache {
  /** Get a cached schema by path */
  getSchema(path: string): OdinSchema | undefined;
  /** Set a cached schema */
  setSchema(path: string, schema: OdinSchema): void;
  /** Get a cached document by path */
  getDocument(path: string): ParsedDocument | undefined;
  /** Set a cached document */
  setDocument(path: string, doc: ParsedDocument): void;
  /** Clear the cache */
  clear(): void;
}

/**
 * Information about a resolved import.
 */
export interface ResolvedImport {
  /** The alias used for this import */
  alias: string;
  /** The resolved absolute path */
  path: string;
  /** The original import path from the directive */
  originalPath: string;
  /** The parsed schema (if schemaMode) */
  schema?: OdinSchema;
  /** The parsed document (if not schemaMode) */
  document?: ParsedDocument;
  /** Line number of the import directive */
  line: number;
}

/**
 * Result of resolving all imports for a document/schema.
 */
export interface ResolvedResult {
  /** The primary document's resolved imports */
  imports: Map<string, ResolvedImport>;
  /** Merged type registry from all imports */
  typeRegistry: TypeRegistry;
  /** All resolved file paths (for cache invalidation) */
  resolvedPaths: string[];
}

/**
 * Result of fully resolving a schema with imports.
 */
export interface ResolvedSchema {
  /** The primary schema */
  schema: OdinSchema;
  /** Resolution result with imports and type registry */
  resolution: ResolvedResult;
}

/**
 * Result of fully resolving a document with imports.
 */
export interface ResolvedDocument {
  /** The primary document */
  document: ParsedDocument;
  /** Resolution result with imports and type registry */
  resolution: ResolvedResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_IMPORT_DEPTH = 32;

// ─────────────────────────────────────────────────────────────────────────────
// Simple Cache Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple in-memory cache for resolved imports.
 */
export class SimpleResolverCache implements ResolverCache {
  private schemas = new Map<string, OdinSchema>();
  private documents = new Map<string, ParsedDocument>();

  getSchema(path: string): OdinSchema | undefined {
    return this.schemas.get(this.normalize(path));
  }

  setSchema(path: string, schema: OdinSchema): void {
    this.schemas.set(this.normalize(path), schema);
  }

  getDocument(path: string): ParsedDocument | undefined {
    return this.documents.get(this.normalize(path));
  }

  setDocument(path: string, doc: ParsedDocument): void {
    this.documents.set(this.normalize(path), doc);
  }

  clear(): void {
    this.schemas.clear();
    this.documents.clear();
  }

  private normalize(path: string): string {
    return path.replace(/\\/g, '/').toLowerCase();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ImportResolver Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves imports for ODIN documents and schemas.
 */
export class ImportResolver {
  private fileLoader: FileLoader;
  private readonly maxImportDepth: number;
  private readonly schemaMode: boolean;
  private readonly cache: ResolverCache | undefined;

  // Security: Track total files loaded to prevent diamond dependency explosion
  private totalFilesLoaded = 0;
  private readonly maxTotalImports: number;

  constructor(options: ResolverOptions = {}) {
    // Use injected FileLoader or create new one (DIP)
    this.fileLoader = options.fileLoader ?? new FileLoader(options);
    this.maxImportDepth = options.maxImportDepth ?? DEFAULT_MAX_IMPORT_DEPTH;
    this.schemaMode = options.schemaMode ?? true;
    this.cache = options.cache;
    this.maxTotalImports = SECURITY_LIMITS.MAX_TOTAL_IMPORTS;
  }

  /**
   * Reset the file counter (call before each top-level resolution).
   */
  private resetFileCounter(): void {
    this.totalFilesLoaded = 0;
  }

  /**
   * Increment file counter and check against limit.
   * @throws {ParseError} if limit exceeded
   */
  private incrementFileCounter(path: string): void {
    this.totalFilesLoaded++;
    if (this.totalFilesLoaded > this.maxTotalImports) {
      throw new ParseError(
        `Maximum total imports exceeded (${this.maxTotalImports}). Possible diamond dependency explosion.`,
        'I013',
        1,
        1,
        { totalFiles: this.totalFilesLoaded, maxFiles: this.maxTotalImports, lastPath: path }
      );
    }
  }

  /**
   * Resolve all imports for a schema.
   *
   * @param schema - The schema to resolve imports for
   * @param basePath - The path of the schema file (for relative import resolution)
   * @returns Resolved schema with type registry
   */
  async resolveSchema(schema: OdinSchema, basePath: string): Promise<ResolvedSchema> {
    // Security: Reset file counter for this resolution session
    this.resetFileCounter();

    const detector = new CircularDetector();
    const typeRegistry = createTypeRegistry();
    const imports = new Map<string, ResolvedImport>();
    const resolvedPaths: string[] = [basePath];

    // Register local types from the primary schema
    typeRegistry.registerAll(schema.types, undefined, basePath);

    // Resolve imports if the schema has any
    // OdinSchema imports are extracted from metadata
    const importDirectives = this.extractImportsFromSchema(schema);

    if (importDirectives.length > 0) {
      await withCircularDetection(detector, basePath, async () => {
        await this.resolveImportsRecursive(
          importDirectives,
          basePath,
          detector,
          typeRegistry,
          imports,
          resolvedPaths
        );
      });
    }

    return {
      schema,
      resolution: {
        imports,
        typeRegistry,
        resolvedPaths,
      },
    };
  }

  /**
   * Resolve all imports for a parsed document.
   *
   * @param document - The parsed document
   * @param basePath - The path of the document file
   * @returns Resolved document with type registry
   */
  async resolveDocument(document: ParsedDocument, basePath: string): Promise<ResolvedDocument> {
    // Security: Reset file counter for this resolution session
    this.resetFileCounter();

    const detector = new CircularDetector();
    const typeRegistry = createTypeRegistry();
    const imports = new Map<string, ResolvedImport>();
    const resolvedPaths: string[] = [basePath];

    if (document.imports.length > 0) {
      await withCircularDetection(detector, basePath, async () => {
        await this.resolveImportsRecursive(
          document.imports,
          basePath,
          detector,
          typeRegistry,
          imports,
          resolvedPaths
        );
      });
    }

    return {
      document,
      resolution: {
        imports,
        typeRegistry,
        resolvedPaths,
      },
    };
  }

  /**
   * Resolve imports from a file path.
   *
   * @param filePath - Path to the ODIN file
   * @returns Resolved schema or document with type registry
   */
  async resolveFile(filePath: string): Promise<ResolvedSchema | ResolvedDocument> {
    // Security: Reset file counter for this resolution session
    this.resetFileCounter();

    // resolveImportPath expects (basePath, importPath)
    // For an initial file, we use '.' as the base and the filePath as the import
    const resolvedPath = this.fileLoader.resolveImportPath('.', filePath);

    // Security: Count the initial file
    this.incrementFileCounter(resolvedPath.absolutePath);

    const content = await this.fileLoader.loadFile(resolvedPath);

    if (this.schemaMode) {
      const schema = parseSchema(content);
      return this.resolveSchema(schema, resolvedPath.absolutePath);
    } else {
      const document = parse(content);
      return this.resolveDocument(document, resolvedPath.absolutePath);
    }
  }

  /**
   * Recursively resolve imports.
   */
  private async resolveImportsRecursive(
    importDirectives: readonly ImportDirective[],
    basePath: string,
    detector: ImportChain,
    typeRegistry: TypeRegistry,
    imports: Map<string, ResolvedImport>,
    resolvedPaths: string[]
  ): Promise<void> {
    // Check depth limit
    const chain = detector.getChain();
    if (chain.length > this.maxImportDepth) {
      throw new ParseError(`Maximum import depth exceeded (${this.maxImportDepth})`, 'I012', 1, 1, {
        depth: chain.length,
        maxDepth: this.maxImportDepth,
      });
    }

    for (const directive of importDirectives) {
      await this.resolveImport(directive, basePath, detector, typeRegistry, imports, resolvedPaths);
    }
  }

  /**
   * Resolve a single import directive.
   */
  private async resolveImport(
    directive: ImportDirective,
    basePath: string,
    detector: ImportChain,
    typeRegistry: TypeRegistry,
    imports: Map<string, ResolvedImport>,
    resolvedPaths: string[]
  ): Promise<void> {
    // Resolve the import path
    let resolvedPath: ResolvedPath;
    try {
      resolvedPath = this.fileLoader.resolveImportPath(basePath, directive.path);
    } catch (error) {
      if (error instanceof ParseError) {
        // Add line info from directive
        throw new ParseError(error.message, error.code, directive.line, 1, error.context);
      }
      throw error;
    }

    // Determine alias (use provided alias or derive from filename)
    const alias = directive.alias ?? this.deriveAlias(directive.path);

    // Check for circular import
    if (detector.isCircular(resolvedPath.absolutePath)) {
      throw new ParseError(
        `Circular import detected: ${detector.formatCycle(resolvedPath.absolutePath)}`,
        'I011',
        directive.line,
        1,
        { path: directive.path, chain: detector.getChain() }
      );
    }

    // Check cache first
    if (this.cache) {
      const cached = this.schemaMode
        ? this.cache.getSchema(resolvedPath.absolutePath)
        : this.cache.getDocument(resolvedPath.absolutePath);

      if (cached) {
        // Use cached result
        if (this.schemaMode && 'types' in cached) {
          typeRegistry.registerAll((cached as OdinSchema).types, alias, resolvedPath.absolutePath);
        }

        // Only add if not already present (first import wins for alias determination)
        if (!imports.has(resolvedPath.absolutePath)) {
          const cachedImport: ResolvedImport = {
            alias,
            path: resolvedPath.absolutePath,
            originalPath: directive.path,
            line: directive.line,
          };
          if (this.schemaMode) {
            cachedImport.schema = cached as OdinSchema;
          } else {
            cachedImport.document = cached as ParsedDocument;
          }
          imports.set(resolvedPath.absolutePath, cachedImport);
        }

        if (!resolvedPaths.includes(resolvedPath.absolutePath)) {
          resolvedPaths.push(resolvedPath.absolutePath);
        }

        return;
      }
    }

    // Security: Increment file counter to prevent diamond dependency explosion
    this.incrementFileCounter(resolvedPath.absolutePath);

    // Load and parse the imported file
    const content = await this.fileLoader.loadFile(resolvedPath);

    let importedSchema: OdinSchema | undefined;
    let importedDocument: ParsedDocument | undefined;
    let nestedImports: readonly ImportDirective[] = [];

    if (this.schemaMode) {
      try {
        importedSchema = parseSchema(content);
      } catch (err) {
        const parseErr = err as Error;
        throw new Error(`Error parsing ${resolvedPath.absolutePath}: ${parseErr.message}`);
      }
      nestedImports = this.extractImportsFromSchema(importedSchema);

      // Register types with the alias namespace
      typeRegistry.registerAll(importedSchema.types, alias, resolvedPath.absolutePath);

      // Cache the result
      if (this.cache) {
        this.cache.setSchema(resolvedPath.absolutePath, importedSchema);
      }
    } else {
      importedDocument = parse(content);
      nestedImports = importedDocument.imports;

      // Cache the result
      if (this.cache) {
        this.cache.setDocument(resolvedPath.absolutePath, importedDocument);
      }
    }

    // Store the resolved import (keyed by absolute path to avoid alias collisions)
    // Only add if not already present (first import wins for alias determination)
    if (!imports.has(resolvedPath.absolutePath)) {
      const resolvedImport: ResolvedImport = {
        alias,
        path: resolvedPath.absolutePath,
        originalPath: directive.path,
        line: directive.line,
      };
      if (importedSchema !== undefined) {
        resolvedImport.schema = importedSchema;
      }
      if (importedDocument !== undefined) {
        resolvedImport.document = importedDocument;
      }
      imports.set(resolvedPath.absolutePath, resolvedImport);
    }

    resolvedPaths.push(resolvedPath.absolutePath);

    // Recursively resolve nested imports
    if (nestedImports.length > 0) {
      await withCircularDetection(detector, resolvedPath.absolutePath, async () => {
        await this.resolveImportsRecursive(
          nestedImports,
          resolvedPath.absolutePath,
          detector,
          typeRegistry,
          imports,
          resolvedPaths
        );
      });
    }
  }

  /**
   * Extract import directives from a schema.
   */
  private extractImportsFromSchema(schema: OdinSchema): ImportDirective[] {
    // OdinSchema.imports uses SchemaImport which is compatible with ImportDirective
    return schema.imports.map((imp) => {
      const directive: ImportDirective = { path: imp.path, line: imp.line };
      if (imp.alias !== undefined) {
        directive.alias = imp.alias;
      }
      return directive;
    });
  }

  /**
   * Derive an alias from an import path using the filename without extension.
   *
   * @example
   * deriveAlias("./vehicle.odin") // "vehicle"
   * deriveAlias("../../_types.odin") // "_types"
   * deriveAlias("https://example.com/schemas/address.odin") // "address"
   */
  private deriveAlias(importPath: string): string {
    // Handle URLs
    if (importPath.startsWith('http://') || importPath.startsWith('https://')) {
      try {
        const url = new URL(importPath);
        const pathname = url.pathname;
        const filename = pathname.split('/').pop() ?? '';
        return filename.replace(/\.odin$/i, '');
      } catch {
        // Fall through to path handling
      }
    }

    // Handle file paths
    const segments = importPath.replace(/\\/g, '/').split('/');
    const filename = segments.pop() ?? '';
    return filename.replace(/\.odin$/i, '');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an import resolver with the given options.
 */
export function createImportResolver(options?: ResolverOptions): ImportResolver {
  return new ImportResolver(options);
}

/**
 * Resolve imports for a schema file.
 *
 * @param filePath - Path to the schema file
 * @param options - Resolver options
 * @returns Resolved schema with type registry
 */
export async function resolveSchemaFile(
  filePath: string,
  options?: ResolverOptions
): Promise<ResolvedSchema> {
  const resolver = new ImportResolver({ ...options, schemaMode: true });
  const result = await resolver.resolveFile(filePath);
  return result as ResolvedSchema;
}

/**
 * Resolve imports for a document file.
 *
 * @param filePath - Path to the document file
 * @param options - Resolver options
 * @returns Resolved document with type registry
 */
export async function resolveDocumentFile(
  filePath: string,
  options?: ResolverOptions
): Promise<ResolvedDocument> {
  const resolver = new ImportResolver({ ...options, schemaMode: false });
  const result = await resolver.resolveFile(filePath);
  return result as ResolvedDocument;
}

/**
 * Create a new resolver cache.
 */
export function createResolverCache(): ResolverCache {
  return new SimpleResolverCache();
}
