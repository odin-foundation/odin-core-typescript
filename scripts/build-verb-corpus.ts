/**
 * Generate one Markdown hint card per transform verb from the verified corpus.
 * Output: spec/transform/verb-corpus/<family>/<verb>.md and the docs/ mirror,
 * plus an index per location. Error and idiom fixtures are excluded; only verb
 * cards are emitted. Output is ASCII (no em/en dashes).
 *
 * Run: npx tsx scripts/build-verb-corpus.ts
 */
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CORPUS_DIR, loadFixtures, type CorpusFixture } from '../tests/golden/transform-corpus-shared.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const OUT_DIRS = [
  join(REPO_ROOT, 'spec', 'transform', 'verb-corpus'),
  join(REPO_ROOT, 'docs', 'transform', 'verb-corpus'),
];

// Replace em/en dashes and their common mojibake forms with a plain hyphen.
function ascii(s: string): string {
  return s
    .replace(/â€”/g, '-') // mojibake em-dash
    .replace(/â€“/g, '-') // mojibake en-dash
    .replace(/[—―]/g, '-')
    .replace(/–/g, '-');
}

function fence(body: string): string {
  return '```odin\n' + body.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n```';
}

// The title is "%verb <dash> description"; keep only the description.
function describe(title: string): string {
  let d = title.replace(/^%\S+\s*/, '');
  d = d.replace(/^(?:-|—|–|â€”)\s*/, '');
  return d.trim();
}

function oneLine(s: string): string {
  return s.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderCard(f: CorpusFixture): string {
  const lines: string[] = [];
  lines.push(`# %${f.id}`);
  lines.push('');
  lines.push(describe(f.title));
  lines.push('');
  lines.push(`**Signature:** \`${f.signature}\``);
  lines.push('');
  lines.push(f.purpose);
  lines.push('');
  lines.push('**Transform**');
  lines.push('');
  lines.push(fence(f.transform));
  lines.push('');
  lines.push('**In**');
  lines.push('');
  lines.push(fence(f.input));
  lines.push('');
  lines.push('**Out**');
  lines.push('');
  lines.push(fence(f.expectedOutput));
  lines.push('');
  if (f.notes?.length) {
    lines.push('**Notes**');
    lines.push('');
    for (const n of f.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  if (f.avoid?.length) {
    lines.push('**Avoid**');
    lines.push('');
    for (const a of f.avoid) lines.push(`- \`${oneLine(a.snippet)}\`: ${a.why}`);
    lines.push('');
  }
  return ascii(lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
}

function main(): void {
  const loaded = loadFixtures(CORPUS_DIR).filter(
    ({ file }) => !/[\\/](errors|idioms|expr)[\\/]/.test(file),
  );
  const verbs = loaded.map((l) => l.fixture);

  // family -> verb ids
  const byFamily = new Map<string, string[]>();
  for (const f of verbs) {
    if (!byFamily.has(f.family)) byFamily.set(f.family, []);
    byFamily.get(f.family)!.push(f.id);
  }
  const families = [...byFamily.keys()].sort();
  for (const ids of byFamily.values()) ids.sort();

  for (const outDir of OUT_DIRS) {
    rmSync(outDir, { recursive: true, force: true });
    for (const f of verbs) {
      const famDir = join(outDir, f.family);
      mkdirSync(famDir, { recursive: true });
      writeFileSync(join(famDir, `${f.id}.md`), renderCard(f), 'utf8');
    }
    // index
    const idx: string[] = ['# Transform Verb Corpus', ''];
    idx.push(`One hint card per built-in transform verb, grouped by family. ${verbs.length} verbs.`);
    idx.push('');
    for (const fam of families) {
      idx.push(`## ${fam}`);
      idx.push('');
      for (const id of byFamily.get(fam)!) idx.push(`- [\`%${id}\`](${fam}/${id}.md)`);
      idx.push('');
    }
    writeFileSync(join(outDir, 'README.md'), ascii(idx.join('\n').trimEnd() + '\n'), 'utf8');
  }

  console.log(`Wrote ${verbs.length} verb cards across ${families.length} families to:`);
  for (const d of OUT_DIRS) console.log(`  ${d}`);
}

main();
