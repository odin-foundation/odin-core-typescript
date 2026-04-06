/**
 * Secure file loading for import resolution with path traversal protection,
 * sandbox enforcement, extension validation, and remote URL control.
 */

import { promises as fs, realpathSync, existsSync } from 'fs';
import * as path from 'path';
import { ParseError } from '../types/errors.js';
import { SECURITY_LIMITS } from '../utils/security-limits.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for file loading.
 */
export interface FileLoaderOptions {
  /**
   * Root directory to restrict file access (sandbox).
   * All resolved paths must be within this directory.
   * If not set, uses the directory of the importing file.
   */
  sandboxRoot?: string;

  /**
   * Whether to allow remote URLs (http/https).
   * @default false
   */
  allowRemoteUrls?: boolean;

  /**
   * Allowed protocols for remote URLs.
   * Only used if allowRemoteUrls is true.
   * @default ['https']
   */
  allowedProtocols?: string[];

  /**
   * Allowed file extensions.
   * @default ['.odin']
   */
  allowedExtensions?: string[];

  /**
   * Maximum file size in bytes.
   * @default 10MB
   */
  maxFileSize?: number;

  /**
   * Custom file reader function (for testing or virtual filesystems).
   */
  readFile?: (path: string) => Promise<string>;
}

/**
 * Resolved import path information.
 */
export interface ResolvedPath {
  /** Absolute filesystem path or URL */
  absolutePath: string;
  /** Whether this is a remote URL */
  isRemote: boolean;
  /** Original import path */
  originalPath: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_ALLOWED_EXTENSIONS = ['.odin'];
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_ALLOWED_PROTOCOLS = ['https'];

/**
 * Regex patterns for blocked internal/private IP ranges.
 * These prevent SSRF (Server-Side Request Forgery) attacks.
 */
const BLOCKED_IP_PATTERNS = [
  /^127\./, // Loopback (127.0.0.0/8)
  /^10\./, // Class A private (10.0.0.0/8)
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private (172.16.0.0/12)
  /^192\.168\./, // Class C private (192.168.0.0/16)
  /^169\.254\./, // Link-local (169.254.0.0/16)
  /^0\./, // "This" network (0.0.0.0/8)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Carrier-grade NAT (100.64.0.0/10)
  /^192\.0\.0\./, // IETF Protocol Assignments (192.0.0.0/24)
  /^192\.0\.2\./, // TEST-NET-1 (192.0.2.0/24)
  /^198\.51\.100\./, // TEST-NET-2 (198.51.100.0/24)
  /^203\.0\.113\./, // TEST-NET-3 (203.0.113.0/24)
  /^224\./, // Multicast (224.0.0.0/4)
  /^240\./, // Reserved (240.0.0.0/4)
  /^255\.255\.255\.255$/, // Broadcast
  /^::1$/, // IPv6 loopback
  /^fc00:/, // IPv6 ULA (fc00::/7)
  /^fd/, // IPv6 ULA
  /^fe80:/, // IPv6 link-local
  /^::$/, // IPv6 unspecified
  /^::ffff:127\./, // IPv4-mapped loopback
  /^::ffff:10\./, // IPv4-mapped Class A
  /^::ffff:172\.(1[6-9]|2\d|3[01])\./, // IPv4-mapped Class B
  /^::ffff:192\.168\./, // IPv4-mapped Class C
];

/**
 * Check if a hostname resolves to a blocked internal IP address.
 * This prevents SSRF attacks targeting internal network resources.
 */
function isBlockedHostname(hostname: string): boolean {
  // Check if hostname is a raw IP address matching blocked patterns
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return true;
    }
  }

  // Block localhost variants
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return true;
  }

  // Block internal TLDs
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// FileLoader Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Secure file loader for ODIN imports.
 */
export class FileLoader {
  private readonly allowRemoteUrls: boolean;
  private readonly allowedProtocols: string[];
  private readonly allowedExtensions: string[];
  private readonly maxFileSize: number;
  private readonly sandboxRoot: string | undefined;
  private readonly readFileFn: ((path: string) => Promise<string>) | undefined;

  constructor(options: FileLoaderOptions = {}) {
    this.sandboxRoot = options.sandboxRoot;
    this.allowRemoteUrls = options.allowRemoteUrls ?? false;
    this.allowedProtocols = options.allowedProtocols ?? DEFAULT_ALLOWED_PROTOCOLS;
    this.allowedExtensions = options.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS;
    this.maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.readFileFn = options.readFile;
  }

  /**
   * Resolve an import path relative to a base path.
   *
   * @param basePath - The path of the file containing the import
   * @param importPath - The import path (relative, absolute, or URL)
   * @returns Resolved path information
   * @throws {ParseError} If path is invalid or outside sandbox
   */
  resolveImportPath(basePath: string, importPath: string): ResolvedPath {
    // Security: Check for null bytes (path truncation attack)
    if (importPath.includes('\0')) {
      throw new ParseError('Import path contains null byte', 'I001', 1, 1, {
        importPath: importPath.replace(/\0/g, '\\0'),
      });
    }

    // Check for remote URL
    if (this.isRemoteUrl(importPath)) {
      if (!this.allowRemoteUrls) {
        throw new ParseError(`Remote URLs are not allowed: ${importPath}`, 'I001', 1, 1, {
          importPath,
        });
      }

      const url = new URL(importPath);
      const protocol = url.protocol.replace(':', '');

      if (!this.allowedProtocols.includes(protocol)) {
        throw new ParseError(`Protocol not allowed: ${protocol}`, 'I002', 1, 1, {
          protocol,
          allowed: this.allowedProtocols,
        });
      }

      return {
        absolutePath: importPath,
        isRemote: true,
        originalPath: importPath,
      };
    }

    // Get the directory of the importing file
    const baseDir = path.dirname(basePath);

    // Resolve the import path
    let resolvedPath: string;
    if (path.isAbsolute(importPath)) {
      resolvedPath = importPath;
    } else {
      resolvedPath = path.resolve(baseDir, importPath);
    }

    // Normalize the path to resolve .. and .
    resolvedPath = path.normalize(resolvedPath);

    // Validate extension
    const ext = path.extname(resolvedPath).toLowerCase();
    if (!this.allowedExtensions.includes(ext)) {
      throw new ParseError(`File extension not allowed: ${ext}`, 'I003', 1, 1, {
        extension: ext,
        allowed: this.allowedExtensions,
      });
    }

    // Validate sandbox (path traversal protection)
    const effectiveSandboxRoot = this.sandboxRoot ?? baseDir;
    const normalizedSandbox = path.normalize(effectiveSandboxRoot);

    if (!this.isPathWithinSandbox(resolvedPath, normalizedSandbox)) {
      throw new ParseError(`Import path escapes sandbox: ${importPath}`, 'I004', 1, 1, {
        importPath,
        sandbox: normalizedSandbox,
      });
    }

    return {
      absolutePath: resolvedPath,
      isRemote: false,
      originalPath: importPath,
    };
  }

  /**
   * Load file content from a resolved path.
   *
   * @param resolvedPath - The resolved path to load
   * @returns File content as string
   * @throws {ParseError} If file cannot be loaded
   */
  async loadFile(resolvedPath: ResolvedPath): Promise<string> {
    if (resolvedPath.isRemote) {
      return this.loadRemoteFile(resolvedPath.absolutePath);
    }
    return this.loadLocalFile(resolvedPath.absolutePath);
  }

  /**
   * Load a local file.
   */
  private async loadLocalFile(filePath: string): Promise<string> {
    // Use custom reader if provided
    if (this.readFileFn) {
      return this.readFileFn(filePath);
    }

    try {
      // Check file size first
      const stats = await fs.stat(filePath);
      if (stats.size > this.maxFileSize) {
        throw new ParseError(
          `File too large: ${stats.size} bytes (max: ${this.maxFileSize})`,
          'I005',
          1,
          1,
          { size: stats.size, maxSize: this.maxFileSize }
        );
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      if (error instanceof ParseError) {
        throw error;
      }

      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        throw new ParseError(`Import file not found: ${filePath}`, 'I006', 1, 1, { filePath });
      }
      if (nodeError.code === 'EACCES') {
        throw new ParseError(`Permission denied: ${filePath}`, 'I007', 1, 1, { filePath });
      }

      throw new ParseError(`Failed to load file: ${nodeError.message}`, 'I008', 1, 1, {
        filePath,
        error: nodeError.message,
      });
    }
  }

  /**
   * Load a remote file via HTTP/HTTPS.
   */
  private async loadRemoteFile(url: string): Promise<string> {
    // Security: Check for SSRF attacks targeting internal networks
    const parsedUrl = new URL(url);
    if (isBlockedHostname(parsedUrl.hostname)) {
      throw new ParseError(
        `Access to internal network addresses is blocked: ${parsedUrl.hostname}`,
        'I012',
        1,
        1,
        { url, hostname: parsedUrl.hostname }
      );
    }

    // Security: Use AbortController to enforce fetch timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SECURITY_LIMITS.FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/plain, application/octet-stream',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ParseError(
          `Failed to fetch remote file: ${response.status} ${response.statusText}`,
          'I009',
          1,
          1,
          { url, status: response.status }
        );
      }

      // Check content length if available
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > this.maxFileSize) {
          throw new ParseError(
            `Remote file too large: ${size} bytes (max: ${this.maxFileSize})`,
            'I005',
            1,
            1,
            { size, maxSize: this.maxFileSize, url }
          );
        }
      }

      const content = await response.text();

      // Check actual size after download
      if (content.length > this.maxFileSize) {
        throw new ParseError(
          `Remote file too large: ${content.length} bytes (max: ${this.maxFileSize})`,
          'I005',
          1,
          1,
          { size: content.length, maxSize: this.maxFileSize, url }
        );
      }

      return content;
    } catch (error) {
      if (error instanceof ParseError) {
        throw error;
      }

      // Handle timeout/abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ParseError(
          `Remote file fetch timed out after ${SECURITY_LIMITS.FETCH_TIMEOUT_MS}ms`,
          'I011',
          1,
          1,
          { url, timeout: SECURITY_LIMITS.FETCH_TIMEOUT_MS }
        );
      }

      throw new ParseError(
        `Failed to fetch remote file: ${(error as Error).message}`,
        'I010',
        1,
        1,
        { url, error: (error as Error).message }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if a string is a remote URL.
   */
  private isRemoteUrl(str: string): boolean {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is within the sandbox root.
   * Prevents path traversal attacks including symlink attacks.
   *
   * Security hardening:
   * - Uses realpath to resolve symlinks (prevents symlink escape)
   * - Case-insensitive comparison on Windows (prevents case manipulation)
   */
  private isPathWithinSandbox(filePath: string, sandboxRoot: string): boolean {
    try {
      // Resolve symlinks to get the real path
      // This prevents symlink attacks where a symlink points outside the sandbox
      let realFile: string;
      let realSandbox: string;

      // Only resolve realpath if the file/directory exists
      // For non-existent files (e.g., when checking before creation), use normalized paths
      if (existsSync(filePath)) {
        realFile = realpathSync(filePath);
      } else {
        // For non-existent files, resolve the parent directory and append filename
        const parentDir = path.dirname(filePath);
        const fileName = path.basename(filePath);
        if (existsSync(parentDir)) {
          realFile = path.join(realpathSync(parentDir), fileName);
        } else {
          realFile = path.normalize(filePath);
        }
      }

      if (existsSync(sandboxRoot)) {
        realSandbox = realpathSync(sandboxRoot);
      } else {
        realSandbox = path.normalize(sandboxRoot);
      }

      // On Windows, normalize case for comparison (case-insensitive filesystem)
      const isWindows = process.platform === 'win32';
      const normalizedFile = isWindows ? realFile.toLowerCase() : realFile;
      const normalizedSandbox = isWindows ? realSandbox.toLowerCase() : realSandbox;

      // The file path must start with the sandbox root
      // Use path.relative to check - if result starts with '..' it's outside
      const relative = path.relative(normalizedSandbox, normalizedFile);

      // If relative path starts with '..' or is absolute, it's outside sandbox
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return false;
      }

      return true;
    } catch {
      // If realpath fails (e.g., broken symlink), reject the path
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a file loader with default options.
 */
export function createFileLoader(options?: FileLoaderOptions): FileLoader {
  return new FileLoader(options);
}
