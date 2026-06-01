/**
 * Generates the transform Cookbook from the verified corpus fixtures.
 *
 * Reads every fixture under sdk/golden/transform-corpus/ and writes two identical
 * files: spec/transform/Cookbook.md and docs/transform/Cookbook.md. The preamble is
 * a template constant below; verb cards are rendered per family, the idiom cards in
 * their own section. Idioms and an error catalog have placeholder sections to fill later.
 *
 * Run: npm run corpus:build
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CORPUS_DIR, ODIN_HEADER, loadFixtures, type CorpusFixture } from '../tests/golden/transform-corpus-shared.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const OUT_FILES = [
  join(REPO_ROOT, 'spec', 'transform', 'Cookbook.md'),
  join(REPO_ROOT, 'docs', 'transform', 'Cookbook.md'),
];

const FAMILY_TITLES: Record<string, string> = {
  string: 'String',
  numeric: 'Numeric',
  date: 'Date & Time',
  array: 'Array',
  logic: 'Logic & Conditionals',
  lookup: 'Lookup',
  type: 'Type Coercion',
  encoding: 'Encoding',
};

const PREAMBLE = `<!-- GENERATED FILE — do not edit by hand.
     Source: sdk/golden/transform-corpus/  ·  Generator: sdk/typescript/scripts/build-transform-corpus.ts
     Every example below is executed by the golden runner; the Out block is exact engine output. -->

# Transform Cookbook

A field guide to authoring ODIN transforms, by example. Every card is **engine-verified**:
the **In** block is run through the transform engine and the **Out** block is its exact output.

## The mental model

A transform is an ODIN document that maps a **source** document to a **target** document.
ODIN is always the canonical model in between — even an \`odin->odin\` transform parses the
source into ODIN, applies the mapping, and serializes ODIN back out.

Every transform begins with a **direction header** declaring the source and target formats:

\`\`\`odin
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "odin->odin"

{$source}
format = "odin"

{$target}
format = "odin"
\`\`\`

The examples in this cookbook show only the **mapping block(s)** below that header — the
\`odin->odin\` header above is implied and is what the engine actually runs.

A mapping is a section header (\`{out}\`, \`{invoice}\`, \`{policies[]}\`) followed by
\`target = expression\` lines. Each right-hand expression is one of three things:

| Form | Meaning | Example |
|------|---------|---------|
| \`@path\` | **Copy** a value from the source | \`name = @.name\` |
| \`%verb args...\` | **Apply a verb** to compute a value | \`name = %upper @.name\` |
| \`"..."\` \`##42\` \`#$9.99\` | A **literal** value | \`country = "US"\` |

## ODIN-specific traps

These are the mistakes that look right but aren't. Each is demonstrated in the **Avoid**
list of the cards below.

- **A quoted string is reserved for an actual string.** Conditions and lookups are
  *verb-expressions*, not quoted infix. Write \`%ifElse %gt @.amount ##1000 ...\`, never
  \`%ifElse "@.amount > 1000" ...\` — the quoted form is just a literal string and the
  comparison never runs.
- **Bare words are literals, not paths.** \`%upper name\` uppercases the literal \`"name"\`.
  Read a field with \`@.name\`.
- **\`@\` copies, \`%\` computes, \`"..."\` is data.** Mixing these up is the most common error.
- **Reference coercion: \`##@\` / \`#$@\`.** Prefix a reference with a type to coerce on copy —
  \`##@.count\` copies \`count\` as an integer, \`#$@.price\` as currency.
- **Modifiers travel with the field.** Append \`:required\`, \`:confidential\`, \`:deprecated\`
  to a mapping to emit \`!\`, \`*\`, \`-\` prefixes in the output.
- **\`:as\` and relative paths in nested loops.** Alias a loop with \`:as\` and read inner
  elements with relative paths so nested iterations don't collide.
- **\`\${...}\` interpolation is only valid inside \`:literal\` blocks.** Outside a literal
  segment, build strings with \`%concat\`.
- **Lookup tables: quote \`"TABLE.column"\`.** The first \`%lookup\` argument names the column
  and must be quoted; an unquoted \`TABLE.column\` parses as three tokens.

`;

function fence(lang: string, body: string): string {
  return '```' + lang + '\n' + body.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n```';
}

function renderCard(f: CorpusFixture): string {
  const lines: string[] = [];
  lines.push(`### \`%${f.id}\` — ${stripVerb(f.title)}`);
  lines.push('');
  lines.push(f.purpose);
  lines.push('');
  lines.push(`**Signature:** \`${f.signature}\``);
  lines.push('');
  lines.push('**Transform**');
  lines.push('');
  lines.push(fence('odin', f.transform));
  lines.push('');
  lines.push('**In**');
  lines.push('');
  lines.push(fence('odin', f.input));
  lines.push('');
  lines.push('**Out**');
  lines.push('');
  lines.push(fence('odin', f.expectedOutput));
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
    for (const a of f.avoid) lines.push(`- \`${oneLine(a.snippet)}\` — ${a.why}`);
    lines.push('');
  }
  return lines.join('\n');
}

// Title may start with "%verb — "; the h3 already prints the verb.
function stripVerb(title: string): string {
  const m = title.match(/^%\S+\s+—\s+(.*)$/);
  return m ? m[1] : title;
}

function renderIdiomCard(f: CorpusFixture): string {
  const lines: string[] = [];
  lines.push(`### ${f.title}`);
  lines.push('');
  lines.push(f.purpose);
  lines.push('');
  if (f.signature) {
    lines.push(`**Setup:** \`${f.signature}\``);
    lines.push('');
  }
  lines.push('**Transform**');
  lines.push('');
  lines.push(fence('odin', f.transform));
  lines.push('');
  lines.push('**In**');
  lines.push('');
  lines.push(fence('odin', f.input));
  lines.push('');
  lines.push('**Out**');
  lines.push('');
  lines.push(fence(f.targetFormat ?? 'odin', f.expectedOutput));
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
    for (const a of f.avoid) lines.push(`- \`${oneLine(a.snippet)}\` — ${a.why}`);
    lines.push('');
  }
  return lines.join('\n');
}

// Inline code spans can't span lines; collapse a multi-line snippet for the Avoid bullet.
function oneLine(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n+/g, ' → ').trim();
}

function build(): string {
  const loaded = loadFixtures(CORPUS_DIR).map((l) => l.fixture);
  const manifest = JSON.parse(readFileSync(join(CORPUS_DIR, 'manifest.json'), 'utf8'));
  const familyOrder: string[] = manifest.familyOrder;

  const verbs = loaded.filter((f) => f.family !== 'idiom');
  const idioms = loaded.filter((f) => f.family === 'idiom');

  const parts: string[] = [PREAMBLE.trimEnd(), ''];

  parts.push('## Verb cards');
  parts.push('');
  parts.push('One card per verb, grouped by family. Each card is engine-verified end to end.');
  parts.push('');

  for (const family of familyOrder) {
    const inFamily = verbs.filter((f) => f.family === family);
    if (!inFamily.length) continue;
    parts.push(`## ${FAMILY_TITLES[family] ?? family}`);
    parts.push('');
    for (const f of inFamily) {
      parts.push(renderCard(f));
    }
  }

  parts.push('## Idioms');
  parts.push('');
  parts.push('Patterns that compose the cards above into real transforms.');
  parts.push('');

  // Format conversion is a first-class group: ODIN is the canonical model, so
  // odin<->json, odin<->xml, odin<->csv, and odin<->fixed-width are all common paths.
  parts.push('### Format conversion');
  parts.push('');
  parts.push(
    'ODIN is the canonical model between every format. Changing only the direction header ' +
      'and `{$target} format` re-targets the output; the mapping body is unchanged.'
  );
  parts.push('');
  const fmtIdioms = idioms.filter((f) => f.group === 'format-conversion');
  for (const f of fmtIdioms) {
    parts.push(renderIdiomCard(f));
  }
  parts.push('<!-- PLACEHOLDER: odin->json, odin->csv, odin->fixed-width (and reverse xml->odin, json->odin, csv->odin, fixed-width->odin) format-conversion idioms to be added. -->');
  parts.push('');

  // Remaining idioms (non format-conversion) grouped as general patterns.
  parts.push('### Patterns');
  parts.push('');
  const patternIdioms = idioms.filter((f) => f.group !== 'format-conversion');
  for (const f of patternIdioms) {
    parts.push(renderIdiomCard(f));
  }
  parts.push('<!-- PLACEHOLDER: additional pattern idioms to be added. -->');
  parts.push('');

  parts.push('## Error catalog');
  parts.push('');
  parts.push('A catalog of common transform errors and their fixes.');
  parts.push('');
  parts.push('<!-- PLACEHOLDER: error catalog to be filled later. -->');
  parts.push('');

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function main(): void {
  // Touch the header so it is exercised; keeps the runner/generator contract visible.
  void ODIN_HEADER;
  const md = build();
  for (const out of OUT_FILES) {
    mkdirSync(join(out, '..'), { recursive: true });
    writeFileSync(out, md, 'utf8');
    console.log(`wrote ${out}`);
  }
}

main();
