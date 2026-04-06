/**
 * Detect and prevent circular import dependencies during schema resolution.
 */

import { ParseError } from '../types/errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents the current import chain being resolved.
 */
export interface ImportChain {
  /**
   * Add a path to the import chain.
   * @throws {ParseError} If adding this path would create a cycle
   */
  enter(path: string): void;

  /**
   * Remove the most recent path from the chain.
   */
  exit(): void;

  /**
   * Check if a path is already in the chain (would create cycle).
   */
  isCircular(path: string): boolean;

  /**
   * Get the current import chain for error reporting.
   */
  getChain(): readonly string[];

  /**
   * Get a formatted string showing the circular dependency.
   */
  formatCycle(newPath: string): string;

  /**
   * Create a child detector for tracking a branch.
   */
  branch(): ImportChain;
}

// ─────────────────────────────────────────────────────────────────────────────
// CircularDetector Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects circular imports using a stack-based approach.
 */
export class CircularDetector implements ImportChain {
  private chain: string[] = [];
  private chainSet: Set<string> = new Set();

  constructor(initialChain?: readonly string[]) {
    if (initialChain) {
      for (const path of initialChain) {
        this.chain.push(path);
        this.chainSet.add(this.normalizePath(path));
      }
    }
  }

  /**
   * Enter a new file in the import chain.
   * @throws {ParseError} If this creates a circular dependency
   */
  enter(path: string): void {
    const normalized = this.normalizePath(path);

    if (this.chainSet.has(normalized)) {
      throw new ParseError(`Circular import detected: ${this.formatCycle(path)}`, 'I011', 1, 1, {
        path,
        chain: [...this.chain],
      });
    }

    this.chain.push(path);
    this.chainSet.add(normalized);
  }

  /**
   * Exit the current file (pop from chain).
   */
  exit(): void {
    const path = this.chain.pop();
    if (path) {
      this.chainSet.delete(this.normalizePath(path));
    }
  }

  /**
   * Check if adding a path would create a cycle.
   */
  isCircular(path: string): boolean {
    return this.chainSet.has(this.normalizePath(path));
  }

  /**
   * Get the current import chain.
   */
  getChain(): readonly string[] {
    return [...this.chain];
  }

  /**
   * Format a cycle for error messages.
   *
   * @example
   * // Given chain: [a.odin, b.odin, c.odin] and newPath: a.odin
   * // Returns: "a.odin -> b.odin -> c.odin -> a.odin"
   */
  formatCycle(newPath: string): string {
    const normalized = this.normalizePath(newPath);
    const cycleStart = this.chain.findIndex((p) => this.normalizePath(p) === normalized);

    if (cycleStart === -1) {
      // Not actually a cycle, just show the chain
      return [...this.chain, newPath].join(' -> ');
    }

    // Show only the cycle portion
    const cyclePortion = this.chain.slice(cycleStart);
    return [...cyclePortion, newPath].join(' -> ');
  }

  /**
   * Create a branch of this detector for parallel resolution.
   * The branch inherits the current chain but modifications don't affect parent.
   */
  branch(): ImportChain {
    return new CircularDetector(this.chain);
  }

  /**
   * Get the current depth of the import chain.
   */
  get depth(): number {
    return this.chain.length;
  }

  /**
   * Normalize a path for comparison.
   * Handles case sensitivity and path separators.
   */
  private normalizePath(p: string): string {
    // Normalize path separators and case (for Windows compatibility)
    return p.replace(/\\/g, '/').toLowerCase();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new circular detector.
 */
export function createCircularDetector(): ImportChain {
  return new CircularDetector();
}

/**
 * Execute a function with circular detection.
 * Automatically enters before and exits after.
 *
 * @param detector - The circular detector
 * @param path - The path being processed
 * @param fn - The function to execute
 * @returns The result of the function
 */
export async function withCircularDetection<T>(
  detector: ImportChain,
  path: string,
  fn: () => Promise<T>
): Promise<T> {
  detector.enter(path);
  try {
    return await fn();
  } finally {
    detector.exit();
  }
}

/**
 * Synchronous version of withCircularDetection.
 */
export function withCircularDetectionSync<T>(detector: ImportChain, path: string, fn: () => T): T {
  detector.enter(path);
  try {
    return fn();
  } finally {
    detector.exit();
  }
}
