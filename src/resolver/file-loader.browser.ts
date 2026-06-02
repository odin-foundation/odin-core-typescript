/**
 * Browser substitute for the file loader. The real loader performs Node file
 * I/O for local schema imports and is not usable in a browser. The same names
 * are exported so bundlers resolve, but constructing or calling them throws.
 */

const message = 'FileLoader requires a Node.js environment and is unavailable in the browser.';

export interface FileLoaderOptions {
  [key: string]: unknown;
}

export interface ResolvedPath {
  [key: string]: unknown;
}

export class FileLoader {
  constructor() {
    throw new Error(message);
  }
}

export function createFileLoader(_options?: FileLoaderOptions): FileLoader {
  throw new Error(message);
}
