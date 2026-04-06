/**
 * Self-testing ODIN transforms.
 *
 * These transforms contain their own test cases and assertions.
 * The runner just executes them and checks TestResult.success === true.
 *
 * Convention: Self-testing transforms end with `-test.odin`
 *
 * Test Input:
 * The runner provides a standard input object with known test values:
 * - _test.currentDate: A fixed date string (2024-06-15)
 * - _test.currentTimestamp: A fixed timestamp (2024-06-15T14:30:45Z)
 * - _test.currentYear: Current year (2024)
 * - _test.unixTime: Unix timestamp for the test date (1718458245)
 *
 * Transforms can reference these via @.input._test.* for deterministic assertions.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTransform, executeTransform } from '../../src/transform/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const selfTestDir = path.resolve(__dirname, '../../../golden/transform/verbs');

// Discover self-testing transforms (files ending with .test.odin)
const selfTests = fs.existsSync(selfTestDir)
  ? fs.readdirSync(selfTestDir).filter((f) => f.endsWith('.test.odin'))
  : [];

/**
 * Standard test input with known datetime values for deterministic testing.
 * Transforms can access these via @.input._test.*
 */
const testInput = {
  _test: {
    // Fixed test datetime: June 15, 2024 at 14:30:45 UTC
    currentDate: '2024-06-15',
    currentTimestamp: '2024-06-15T14:30:45Z',
    currentYear: 2024,
    currentMonth: 6,
    currentDay: 15,
    currentHour: 14,
    currentMinute: 30,
    currentSecond: 45,
    // Unix timestamp for 2024-06-15T14:30:45Z
    unixTime: 1718458245,
    // Day of week: Saturday = 6
    dayOfWeek: 6,
    // Week of year for June 15, 2024
    weekOfYear: 24,
    // Quarter for June
    quarter: 2,
  },
};

// CDM typed value format
interface CdmValue<T> {
  type: string;
  value: T;
}

// TestResult segment output (CDM format)
interface TestResultCdm {
  verb: CdmValue<string>;
  passed: CdmValue<number>;
  failed: CdmValue<number>;
  total: CdmValue<number>;
  success: CdmValue<boolean>;
}

/**
 * Extract raw value from CDM typed value
 */
function getValue<T>(cdmValue: CdmValue<T> | T | undefined): T | undefined {
  if (cdmValue === undefined || cdmValue === null) return undefined;
  if (typeof cdmValue === 'object' && 'type' in cdmValue && 'value' in cdmValue) {
    return cdmValue.value as T;
  }
  return cdmValue as T;
}

describe('Self-Testing Transforms', () => {
  if (selfTests.length === 0) {
    it.skip('No self-testing transforms found', () => {});
    return;
  }

  for (const testFile of selfTests) {
    const verbName = testFile.replace('.test.odin', '');

    it(`%${verbName} self-test`, () => {
      const transformPath = path.join(selfTestDir, testFile);
      const transformContent = fs.readFileSync(transformPath, 'utf-8');

      const transform = parseTransform(transformContent);
      const result = executeTransform(transform, testInput); // Provide test input with known datetime values

      expect(result.success).toBe(true);

      // Check the TestResult segment (output is in CDM format)
      const output = result.output as Record<string, unknown> | undefined;
      const testResultRaw = output?.TestResult as TestResultCdm | undefined;

      expect(testResultRaw).toBeDefined();

      // Extract values from CDM format
      const success = getValue(testResultRaw?.success);
      const failed = getValue(testResultRaw?.failed);
      const total = getValue(testResultRaw?.total);
      const verb = getValue(testResultRaw?.verb);

      expect(success).toBe(true);

      // Provide useful output on failure
      if (!success) {
        console.log(`FAILED: %${verb} - ${failed}/${total} failed`);
      }
    });
  }
});
