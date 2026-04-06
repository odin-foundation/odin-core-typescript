/**
 * ODIN Transform Generation Verbs
 *
 * Value generation verbs: uuid, sequence, resetSequence.
 */

import type { VerbFunction } from '../../types/transform.js';
import { toString, toNumber, str, int, nil } from './helpers.js';

/**
 * Simple UUID v4 generator (RFC 4122 compliant)
 * Uses crypto.randomUUID if available, falls back to crypto.getRandomValues
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (Node.js 19+, modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  /* v8 ignore start - Fallback paths for environments without crypto.randomUUID */
  // Fallback: Use crypto.getRandomValues for secure random bytes
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set version (4) and variant (10xx) bits per RFC 4122
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Variant 10xx

    // Convert to hex string with dashes
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  // Last resort fallback for non-secure environments
  // Maintains backwards compatibility but is not cryptographically secure
  const hex = '0123456789abcdef';
  let uuid = '';

  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4'; // Version 4
    } else if (i === 19) {
      // Variant bits: 10xx (8, 9, a, b)
      uuid += hex[(Math.random() * 4 + 8) | 0];
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }

  return uuid;
  /* v8 ignore stop */
}

/**
 * Generate a deterministic UUID v5-like from a seed string
 * Uses a simple hash to produce consistent output for the same seed
 */
function generateSeededUUID(seed: string): string {
  // Simple hash function (djb2 variant)
  let hash1 = 5381;
  let hash2 = 52711;

  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash1 = ((hash1 << 5) + hash1) ^ char;
    hash2 = ((hash2 << 5) + hash2) ^ char;
  }

  // Ensure positive values
  hash1 = hash1 >>> 0;
  hash2 = hash2 >>> 0;

  // Generate 16 bytes from the hashes
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    bytes[i] = (hash1 >> (i * 4)) & 0xff;
    bytes[i + 8] = (hash2 >> (i * 4)) & 0xff;
  }

  // Set version (5 for name-based) and variant (10xx) bits
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // Version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Variant 10xx

  // Convert to hex string with dashes
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * %uuid - Generate a new random UUID v4
 * %uuid @seed - Generate a deterministic UUID from seed
 *
 * @example
 * id = "%uuid"             ; generates random UUID
 * id = "%uuid @.orderId"   ; generates deterministic UUID from orderId
 */
export const uuid: VerbFunction = (args) => {
  // If a seed is provided, generate deterministic UUID
  if (args.length > 0) {
    const seed = toString(args[0]!);
    if (seed !== '') {
      return str(generateSeededUUID(seed));
    }
  }

  // Otherwise generate random UUID
  return str(generateUUID());
};

/**
 * %sequence "name" - Get next value in named sequence
 * %sequence "name" start - Get next value, initialize to start if new
 *
 * Sequences persist across verb calls within a transform execution.
 * State is stored in context.sequenceCounters (per-execution scope).
 *
 * @example
 * lineNum = "%sequence \"line\""         ; 1, 2, 3, ...
 * itemNum = "%sequence \"item\" ##100"   ; 100, 101, 102, ...
 */
export const sequence: VerbFunction = (args, context) => {
  if (args.length === 0) return int(1);

  const name = toString(args[0]!);
  const startValue = args.length > 1 ? Math.floor(toNumber(args[1]!)) : 1;

  let current = context.sequenceCounters.get(name);
  if (current === undefined) {
    current = startValue;
  } else {
    current++;
  }

  context.sequenceCounters.set(name, current);
  return int(current);
};

/**
 * %resetSequence "name" - Reset a named sequence to its initial value
 * %resetSequence "name" value - Reset to specific value
 */
export const resetSequence: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const name = toString(args[0]!);
  const value = args.length > 1 ? Math.floor(toNumber(args[1]!)) : 0;

  context.sequenceCounters.set(name, value);
  return int(value);
};

// ─────────────────────────────────────────────────────────────────────────────
// NanoID Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * URL-safe alphabet for nanoid (64 characters - power of 2 for unbiased distribution)
 * Same alphabet as fornix.sdk: A-Za-z0-9_-
 */
const NANOID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/**
 * Simple seeded random number generator (Mulberry32)
 * Returns a function that generates deterministic random numbers [0, 1)
 */
function seededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convert a string seed to a numeric seed
 */
function stringToSeed(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash >>> 0; // Convert to unsigned
}

/**
 * Generate a random nanoid using crypto
 */
function generateNanoid(size: number): string {
  // Use Node.js crypto for secure random bytes
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const bytes = crypto.randomBytes(size);
    let id = '';

    for (let i = 0; i < size; i++) {
      // Bitmask with 0x3F (63) gives uniform distribution for 64-char alphabet
      // Each of 256 byte values maps to exactly 4 alphabet characters (256/64 = 4)
      id += NANOID_ALPHABET[bytes[i] & 0x3f];
    }

    return id;
  } catch {
    // Fallback to Math.random (less secure but works everywhere)
    let id = '';
    for (let i = 0; i < size; i++) {
      id += NANOID_ALPHABET[Math.floor(Math.random() * 64)];
    }
    return id;
  }
}

/**
 * Generate a seeded (deterministic) nanoid
 */
function generateSeededNanoid(size: number, seed: string): string {
  const numericSeed = stringToSeed(seed);
  const rng = seededRandom(numericSeed);

  let id = '';
  for (let i = 0; i < size; i++) {
    id += NANOID_ALPHABET[Math.floor(rng() * 64)];
  }

  return id;
}

/**
 * %nanoid - Generate a random nanoid (21 characters, ~126 bits of entropy)
 * %nanoid size - Generate nanoid of specified size
 * %nanoid size @seed - Generate deterministic nanoid from seed
 *
 * Uses URL-safe alphabet (A-Za-z0-9_-) for compatibility.
 * Following fornix.sdk pattern for cross-platform consistency.
 *
 * @example
 * id = "%nanoid"               ; generates 21-char random ID
 * id = "%nanoid ##8"           ; generates 8-char random ID
 * id = "%nanoid ##21 @.userId" ; generates deterministic ID from userId
 */
export const nanoid: VerbFunction = (args) => {
  // Default size is 21 characters (~126 bits of entropy)
  let size = 21;
  let seed: string | undefined;

  // Parse arguments
  if (args.length >= 1) {
    const firstArg = args[0]!;
    // If first arg is numeric, it's the size
    if (firstArg.type === 'integer' || firstArg.type === 'number') {
      size = Math.floor(toNumber(firstArg));
    } else if (firstArg.type === 'string') {
      // If first arg is string, could be seed (for backwards compat with uuid pattern)
      seed = toString(firstArg);
    }
  }

  if (args.length >= 2) {
    // Second arg is always the seed
    seed = toString(args[1]!);
  }

  // Validate size
  if (size <= 0) return nil();
  if (size > 256) size = 256; // Reasonable limit

  // Generate ID
  if (seed && seed !== '') {
    return str(generateSeededNanoid(size, seed));
  }

  return str(generateNanoid(size));
};
