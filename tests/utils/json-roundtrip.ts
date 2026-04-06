/**
 * Test script: JSON -> ODIN -> JSON roundtrip
 *
 * 1. Parse librarium.envelopes.json
 * 2. Convert to ODIN document and save as .odin file
 * 3. Serialize back to JSON
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Odin } from '../src/index.js';
import type { OdinValue } from '../src/types/values.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to convert JSON value to OdinValue
function jsonToOdinValue(value: unknown): OdinValue {
  if (value === null) {
    return { type: 'null' };
  }

  if (typeof value === 'string') {
    // Check for date/timestamp patterns
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

  // For objects and arrays, we'll handle them specially
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
    // Handle MongoDB extended JSON types
    const objRecord = obj as Record<string, unknown>;

    // $oid -> string
    if ('$oid' in objRecord && typeof objRecord.$oid === 'string') {
      result.set(prefix, { type: 'string', value: objRecord.$oid });
      return result;
    }

    // $date -> timestamp
    if ('$date' in objRecord) {
      const dateVal = objRecord.$date as Record<string, unknown>;
      if (dateVal && '$numberLong' in dateVal) {
        const ms = parseInt(dateVal.$numberLong as string, 10);
        const dateObj = new Date(ms);
        const isoDate = dateObj.toISOString();
        result.set(prefix, { type: 'timestamp', value: dateObj, raw: isoDate });
        return result;
      }
    }

    // $numberInt -> integer
    if ('$numberInt' in objRecord) {
      result.set(prefix, {
        type: 'integer',
        value: parseInt(objRecord.$numberInt as string, 10),
      });
      return result;
    }

    // $numberLong -> integer
    if ('$numberLong' in objRecord) {
      result.set(prefix, {
        type: 'integer',
        value: parseInt(objRecord.$numberLong as string, 10),
      });
      return result;
    }

    // Regular object - recurse into properties
    for (const [key, value] of Object.entries(objRecord)) {
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      const subResult = flattenJson(value, newPrefix);
      for (const [k, v] of subResult) {
        result.set(k, v);
      }
    }
    return result;
  }

  // Primitive value
  try {
    result.set(prefix, jsonToOdinValue(obj));
  } catch {
    // Skip complex values we can't convert
    console.warn(`Skipping unconvertible value at ${prefix}`);
  }

  return result;
}

async function main() {
  console.log('=== JSON -> ODIN -> JSON Roundtrip Test ===\n');

  // 1. Read and parse the JSON file
  const jsonPath = path.join(__dirname, '..', '..', 'librarium.envelopes.json');
  console.log(`1. Reading JSON from: ${jsonPath}`);

  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const jsonData = JSON.parse(jsonContent);

  // Take the first envelope from the array
  const envelope = Array.isArray(jsonData) ? jsonData[0] : jsonData;
  console.log(`   Parsed envelope with id: ${envelope.id}`);

  // 2. Convert to ODIN document
  console.log('\n2. Converting JSON to ODIN document...');

  const builder = Odin.builder();
  builder.metadata('odin', '1.0.0');
  builder.metadata('source', 'librarium.envelopes.json');

  // Flatten the JSON and add all paths
  const flatPaths = flattenJson(envelope);
  console.log(`   Flattened ${flatPaths.size} paths`);

  for (const [path, value] of flatPaths) {
    builder.set(path, value);
  }

  const doc = builder.build();
  console.log(`   Built ODIN document with ${doc.paths().length} paths`);

  // 3. Save as .odin file
  const odinPath = path.join(__dirname, '..', '..', 'librarium.envelopes.odin');
  const odinContent = Odin.stringify(doc, { useTabular: true });
  fs.writeFileSync(odinPath, odinContent);
  console.log(`\n3. Saved ODIN file to: ${odinPath}`);
  console.log(`   File size: ${odinContent.length} bytes`);

  // Show first 50 lines of ODIN output
  const odinLines = odinContent.split('\n');
  console.log(`\n   First 30 lines of ODIN output:`);
  console.log('   ' + '-'.repeat(60));
  for (let i = 0; i < Math.min(30, odinLines.length); i++) {
    console.log(`   ${odinLines[i]}`);
  }
  if (odinLines.length > 30) {
    console.log(`   ... (${odinLines.length - 30} more lines)`);
  }

  // 4. Parse the ODIN back and convert to JSON
  console.log('\n4. Parsing ODIN back and converting to JSON...');

  const reparsedDoc = Odin.parse(odinContent);
  const outputJson = reparsedDoc.toJSON();

  const outputJsonPath = path.join(__dirname, '..', '..', 'librarium.envelopes.roundtrip.json');
  fs.writeFileSync(outputJsonPath, JSON.stringify(outputJson, null, 2));
  console.log(`   Saved roundtrip JSON to: ${outputJsonPath}`);

  // 5. Verify some key values
  console.log('\n5. Verification:');
  console.log(`   Original ID: ${envelope.id}`);
  // Path is at root level (no header)
  const roundtripId = reparsedDoc.get('id');
  console.log(
    `   Roundtrip ID: ${roundtripId?.type === 'string' ? roundtripId.value : 'not found'}`
  );
  console.log(`   Original creator: ${envelope.creator}`);
  const roundtripCreator = reparsedDoc.get('creator');
  console.log(
    `   Roundtrip creator: ${roundtripCreator?.type === 'string' ? roundtripCreator.value : 'not found'}`
  );
  console.log(`   Original file count: ${envelope.envelope.files.length}`);

  // Count files in roundtrip
  let fileCount = 0;
  for (const p of reparsedDoc.paths()) {
    if (p.match(/^envelope\.files\[\d+\]\.fileId$/)) {
      fileCount++;
    }
  }
  console.log(`   Roundtrip file count: ${fileCount}`);

  // Show all paths
  console.log(`\n   All ${reparsedDoc.paths().length} paths in roundtrip document:`);
  for (const p of reparsedDoc.paths().slice(0, 20)) {
    console.log(`     ${p}`);
  }
  console.log(`     ...`);

  // Verify ID and creator match
  const idMatches = roundtripId?.type === 'string' && roundtripId.value === envelope.id;
  const creatorMatches =
    roundtripCreator?.type === 'string' && roundtripCreator.value === envelope.creator;
  console.log(`\n   ID matches: ${idMatches ? 'YES' : 'NO'}`);
  console.log(`   Creator matches: ${creatorMatches ? 'YES' : 'NO'}`);

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
