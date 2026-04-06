/**
 * Profile the individual stages of ODIN parsing
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { tokenize } from '../src/parser/tokenizer.js';
import { parse } from '../src/parser/parser.js';
import { stringify as _stringify } from '../src/serializer/stringify.js';
import { OdinDocumentImpl } from '../src/types/document-impl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Read the generated ODIN file
  const odinPath = path.join(__dirname, '..', '..', 'large-test.odin');

  if (!fs.existsSync(odinPath)) {
    console.log('large-test.odin not found. Run performance-test.ts first.');
    process.exit(1);
  }

  const odinText = fs.readFileSync(odinPath, 'utf-8');
  const odinSize = Buffer.byteLength(odinText, 'utf-8') / 1024;

  console.log('=== ODIN Parsing Profile ===\n');
  console.log(`Input size: ${odinSize.toFixed(2)} KB`);
  console.log(`Input lines: ${odinText.split('\n').length}`);
  console.log('');

  const iterations = 10;

  // Profile tokenization
  console.log(`Tokenization (${iterations} iterations):`);
  let tokenizeTotal = 0;
  let tokens: ReturnType<typeof tokenize> = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    tokens = tokenize(odinText);
    tokenizeTotal += performance.now() - start;
  }

  const tokenizeAvg = tokenizeTotal / iterations;
  console.log(`  Avg time: ${tokenizeAvg.toFixed(2)}ms`);
  console.log(`  Token count: ${tokens.length}`);
  console.log(`  Throughput: ${((odinSize / tokenizeAvg) * 1000).toFixed(2)} KB/s`);
  console.log('');

  // Profile parsing (which includes tokenization)
  console.log(`Full Parse (${iterations} iterations):`);
  let parseTotal = 0;
  let doc: ReturnType<typeof parse>;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    doc = parse(odinText);
    parseTotal += performance.now() - start;
  }

  const parseAvg = parseTotal / iterations;
  const parserOnly = parseAvg - tokenizeAvg;
  console.log(`  Avg time: ${parseAvg.toFixed(2)}ms`);
  console.log(`  Parser only (excl. tokenizer): ${parserOnly.toFixed(2)}ms`);
  console.log(`  Assignments: ${doc!.assignments.size}`);
  console.log(`  Throughput: ${((odinSize / parseAvg) * 1000).toFixed(2)} KB/s`);
  console.log('');

  // Profile document construction
  console.log(`Document Construction (${iterations} iterations):`);
  let docTotal = 0;
  let _odinDoc: OdinDocumentImpl;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    _odinDoc = new OdinDocumentImpl(
      new Map(doc!.metadata),
      new Map(doc!.assignments),
      new Map(doc!.modifiers)
    );
    docTotal += performance.now() - start;
  }

  const docAvg = docTotal / iterations;
  console.log(`  Avg time: ${docAvg.toFixed(2)}ms`);
  console.log('');

  // Summary
  console.log('=== Summary ===');
  console.log(`Total parse pipeline: ${parseAvg.toFixed(2)}ms`);
  console.log(
    `  - Tokenizer: ${tokenizeAvg.toFixed(2)}ms (${((tokenizeAvg / parseAvg) * 100).toFixed(1)}%)`
  );
  console.log(
    `  - Parser: ${parserOnly.toFixed(2)}ms (${((parserOnly / parseAvg) * 100).toFixed(1)}%)`
  );
  console.log('');
  console.log('Target: 5ms for 1MB');
  console.log(`Current: ${parseAvg.toFixed(2)}ms for ${odinSize.toFixed(0)}KB`);
  console.log(`Extrapolated for 1MB: ${((parseAvg * 1024) / odinSize).toFixed(2)}ms`);
  console.log(`Gap to target: ${((parseAvg * 1024) / odinSize / 5).toFixed(1)}x slower`);
}

main().catch(console.error);
