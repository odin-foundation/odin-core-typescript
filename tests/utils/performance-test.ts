/**
 * Performance test: JSON -> ODIN -> JSON roundtrip on large file
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Odin } from '../src/index.js';
import type { OdinValue } from '../src/types/values.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to convert JSON value to OdinValue
function jsonToOdinValue(value: unknown): OdinValue {
  if (value === null) {
    return { type: 'null' };
  }

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      const dateObj = new Date(value);
      return { type: 'timestamp', value: dateObj, raw: value };
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const dateObj = new Date(value + 'T00:00:00Z');
      return { type: 'date', value: dateObj, raw: value };
    }
    return { type: 'string', value };
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { type: 'integer', value };
    }
    return { type: 'number', value };
  }

  if (typeof value === 'boolean') {
    return { type: 'boolean', value };
  }

  throw new Error(`Cannot convert complex value directly: ${typeof value}`);
}

// Helper to flatten nested JSON into ODIN paths
function flattenJson(obj: unknown, prefix: string = ''): Map<string, OdinValue> {
  const result = new Map<string, OdinValue>();

  if (obj === null || obj === undefined) {
    if (prefix) {
      result.set(prefix, { type: 'null' });
    }
    return result;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const itemPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`;
      const itemResult = flattenJson(obj[i], itemPrefix);
      for (const [k, v] of itemResult) {
        result.set(k, v);
      }
    }
    return result;
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      const subResult = flattenJson(value, newPrefix);
      for (const [k, v] of subResult) {
        result.set(k, v);
      }
    }
    return result;
  }

  try {
    result.set(prefix, jsonToOdinValue(obj));
  } catch {
    // Skip complex values we can't convert
  }

  return result;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main() {
  console.log('=== ODIN Performance Test ===\n');

  const jsonPath = path.join(__dirname, '..', '..', 'large-test.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('Error: large-test.json not found. Run generate-large-json.ts first.');
    process.exit(1);
  }

  // Step 1: Read JSON
  console.log('1. Reading JSON file...');
  const readStart = performance.now();
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const readEnd = performance.now();
  console.log(`   File size: ${formatBytes(jsonContent.length)}`);
  console.log(`   Read time: ${formatDuration(readEnd - readStart)}`);

  // Step 2: Parse JSON
  console.log('\n2. Parsing JSON...');
  const parseJsonStart = performance.now();
  const jsonData = JSON.parse(jsonContent) as unknown[];
  const parseJsonEnd = performance.now();
  console.log(`   Envelope count: ${jsonData.length}`);
  console.log(`   Parse time: ${formatDuration(parseJsonEnd - parseJsonStart)}`);

  // Step 3: Convert to ODIN document
  console.log('\n3. Converting to ODIN document...');
  const convertStart = performance.now();

  const builder = Odin.builder();
  builder.metadata('odin', '1.0.0');
  builder.metadata('source', 'large-test.json');
  builder.metadata('envelopeCount', jsonData.length.toString());

  let totalPaths = 0;
  for (let i = 0; i < jsonData.length; i++) {
    const envelope = jsonData[i];
    const flatPaths = flattenJson(envelope, `envelopes[${i}]`);
    for (const [p, value] of flatPaths) {
      builder.set(p, value);
      totalPaths++;
    }
  }

  const doc = builder.build();
  const convertEnd = performance.now();
  console.log(`   Total paths: ${totalPaths.toLocaleString()}`);
  console.log(`   Convert time: ${formatDuration(convertEnd - convertStart)}`);

  // Step 4: Serialize to ODIN
  console.log('\n4. Serializing to ODIN...');
  const serializeStart = performance.now();
  const odinContent = Odin.stringify(doc, { useTabular: true });
  const serializeEnd = performance.now();
  console.log(`   ODIN size: ${formatBytes(odinContent.length)}`);
  console.log(`   Serialize time: ${formatDuration(serializeEnd - serializeStart)}`);
  console.log(
    `   Compression ratio: ${((1 - odinContent.length / jsonContent.length) * 100).toFixed(1)}% smaller`
  );

  // Step 5: Write ODIN file
  const odinPath = path.join(__dirname, '..', '..', 'large-test.odin');
  console.log('\n5. Writing ODIN file...');
  const writeOdinStart = performance.now();
  fs.writeFileSync(odinPath, odinContent);
  const writeOdinEnd = performance.now();
  console.log(`   Write time: ${formatDuration(writeOdinEnd - writeOdinStart)}`);

  // Step 6: Parse ODIN back
  console.log('\n6. Parsing ODIN...');
  const parseOdinStart = performance.now();
  const reparsedDoc = Odin.parse(odinContent);
  const parseOdinEnd = performance.now();
  console.log(`   Paths recovered: ${reparsedDoc.paths().length.toLocaleString()}`);
  console.log(`   Parse time: ${formatDuration(parseOdinEnd - parseOdinStart)}`);

  // Step 7: Convert back to JSON
  console.log('\n7. Converting to JSON...');
  const toJsonStart = performance.now();
  const outputJson = reparsedDoc.toJSON();
  const roundtripJsonContent = JSON.stringify(outputJson, null, 2);
  const toJsonEnd = performance.now();
  console.log(`   JSON size: ${formatBytes(roundtripJsonContent.length)}`);
  console.log(`   Convert time: ${formatDuration(toJsonEnd - toJsonStart)}`);

  // Write roundtrip JSON
  const roundtripPath = path.join(__dirname, '..', '..', 'large-test.roundtrip.json');
  fs.writeFileSync(roundtripPath, roundtripJsonContent);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Original JSON:  ${formatBytes(jsonContent.length)}`);
  console.log(
    `ODIN output:    ${formatBytes(odinContent.length)} (${((1 - odinContent.length / jsonContent.length) * 100).toFixed(1)}% smaller)`
  );
  console.log(`Roundtrip JSON: ${formatBytes(roundtripJsonContent.length)}`);

  const totalTime =
    convertEnd -
    convertStart +
    (serializeEnd - serializeStart) +
    (parseOdinEnd - parseOdinStart) +
    (toJsonEnd - toJsonStart);
  console.log(`\nTotal processing time: ${formatDuration(totalTime)}`);
  console.log(`  - JSON to ODIN doc: ${formatDuration(convertEnd - convertStart)}`);
  console.log(`  - Serialize ODIN:   ${formatDuration(serializeEnd - serializeStart)}`);
  console.log(`  - Parse ODIN:       ${formatDuration(parseOdinEnd - parseOdinStart)}`);
  console.log(`  - ODIN to JSON:     ${formatDuration(toJsonEnd - toJsonStart)}`);

  console.log(
    `\nThroughput: ${(jsonContent.length / 1024 / 1024 / (totalTime / 1000)).toFixed(2)} MB/s`
  );

  // Verify path counts match
  const pathsMatch = doc.paths().length === reparsedDoc.paths().length;
  console.log(
    `\nPath count verification: ${pathsMatch ? 'PASS' : 'FAIL'} (${doc.paths().length} vs ${reparsedDoc.paths().length})`
  );

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
