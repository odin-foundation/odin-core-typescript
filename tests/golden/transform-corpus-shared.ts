/**
 * Shared loading for the transform corpus: fixture type, the standard odin->odin
 * header, and fixture discovery from the manifest. Used by the golden runner and
 * the Cookbook generator so both apply the identical header and fixture set.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface AvoidEntry {
  snippet: string;
  why: string;
}

export interface CorpusFixture {
  id: string;
  family: string;
  title: string;
  purpose: string;
  signature: string;
  transform: string;
  input: string;
  expectedOutput: string;
  notes: string[];
  avoid: AvoidEntry[];
  /** Optional: idiom grouping (e.g. "format-conversion"). */
  group?: string;
  /** Optional: target format for format-conversion idioms. Defaults to "odin". */
  targetFormat?: string;
  /** Optional: extra {$target} keys (e.g. root for XML), rendered verbatim. */
  targetOptions?: Record<string, string>;
}

export const CORPUS_DIR = join(HERE, '..', '..', '..', 'golden', 'transform-corpus');

// The standard odin->odin header, prepended to verb-card fixtures.
export const ODIN_HEADER = buildHeader('odin');

// Builds the transform header for a fixture. Source is always ODIN; the target
// format defaults to odin and may be overridden by format-conversion idioms.
export function buildHeader(targetFormat: string, targetOptions?: Record<string, string>): string {
  const target = [`format = "${targetFormat}"`];
  for (const [k, v] of Object.entries(targetOptions ?? {})) {
    target.push(`${k} = "${v}"`);
  }
  return `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "odin->${targetFormat}"

{$source}
format = "odin"

{$target}
${target.join('\n')}

`;
}

// The full header for a given fixture, honoring any targetFormat/targetOptions.
export function headerFor(fixture: CorpusFixture): string {
  return buildHeader(fixture.targetFormat ?? 'odin', fixture.targetOptions);
}

interface LoadedFixture {
  fixture: CorpusFixture;
  file: string;
}

// Discover fixtures by walking <family>/*.json (manifest.json excluded).
export function loadFixtures(dir: string): LoadedFixture[] {
  const out: LoadedFixture[] = [];
  for (const family of readdirSync(dir)) {
    const familyPath = join(dir, family);
    if (!statSync(familyPath).isDirectory()) continue;
    for (const name of readdirSync(familyPath)) {
      if (!name.endsWith('.json')) continue;
      const file = join(familyPath, name);
      const fixture = JSON.parse(readFileSync(file, 'utf8')) as CorpusFixture;
      out.push({ fixture, file });
    }
  }
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;
}
