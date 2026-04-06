/**
 * Multi-Pass Transform Engine Tests
 *
 * Tests for multi-pass execution feature including:
 * - Basic multi-pass execution
 * - Accumulator persistence between passes
 * - Non-persist accumulator reset
 * - Pass ordering
 * - Edge cases and error conditions
 * - Backwards compatibility
 *
 * Note: Accumulator persistence uses the syntax:
 *   name = ##0
 *   name._persist = ?true
 *
 * NOTE: Engine output (result.output) contains TransformValue objects (CDM).
 * Use extractValues() for backward-compatible JS value comparisons.
 */

import { describe, it, expect } from 'vitest';
import { parseTransform, executeTransform } from '../../src/transform/index.js';
import { extractValues } from './helpers.js';

// Helper to get JS values from CDM output
function getValues(result: ReturnType<typeof executeTransform>) {
  return extractValues(result.output);
}

describe('Multi-Pass Transform Engine', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Happy Path Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Happy Path', () => {
    it('executes single pass (pass 1) correctly', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
count = ##0
count._persist = ?true

{_counter[]}
_pass = ##1
_loop = "@"
_from = "items"
_ = "%accumulate count ##1"

{Summary}
TotalCount = "@$accumulator.count"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { items: [1, 2, 3, 4, 5] });

      expect(result.success).toBe(true);
      const output = getValues(result) as { Summary: { TotalCount: number } };
      expect(output.Summary.TotalCount).toBe(5);
    });

    it('executes two passes in order with persist accumulators', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
total = ##0
total._persist = ?true
count = ##0
count._persist = ?true
average = ##0
average._persist = ?true

{_sumTotal[]}
_pass = ##1
_loop = "@"
_from = "values"
_ = "%accumulate total @."

{_sumCount[]}
_pass = ##1
_loop = "@"
_from = "values"
_ = "%accumulate count ##1"

{_avgPass}
_pass = ##2
_ = "%set average %divide @$accumulator.total @$accumulator.count"

{Result}
Sum = "@$accumulator.total"
Count = "@$accumulator.count"
Average = "@$accumulator.average"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { values: [10, 20, 30, 40, 50] });

      expect(result.success).toBe(true);
      const output = getValues(result) as {
        Result: { Sum: number; Count: number; Average: number };
      };
      expect(output.Result.Sum).toBe(150);
      expect(output.Result.Count).toBe(5);
      expect(output.Result.Average).toBe(30);
    });

    it('executes three passes with persist accumulators', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
sumA = ##0
sumA._persist = ?true
sumB = ##0
sumB._persist = ?true
combined = ##0
combined._persist = ?true

{_sumPass1[]}
_pass = ##1
_loop = "@"
_from = "a"
_ = "%accumulate sumA @."

{_sumPass2[]}
_pass = ##2
_loop = "@"
_from = "b"
_ = "%accumulate sumB @."

{_combinePass3}
_pass = ##3
_ = "%set combined %add @$accumulator.sumA @$accumulator.sumB"

{Stats}
SumA = "@$accumulator.sumA"
SumB = "@$accumulator.sumB"
Combined = "@$accumulator.combined"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { a: [1, 2, 3], b: [10, 20, 30] });

      expect(result.success).toBe(true);
      const output = getValues(result) as {
        Stats: { SumA: number; SumB: number; Combined: number };
      };
      expect(output.Stats.SumA).toBe(6); // 1+2+3
      expect(output.Stats.SumB).toBe(60); // 10+20+30
      expect(output.Stats.Combined).toBe(66); // 6+60
    });

    it('segments without _pass run after all numbered passes', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
step = ##0
step._persist = ?true

{_pass1}
_pass = ##1
_ = "%accumulate step ##10"

{_pass2}
_pass = ##2
_ = "%accumulate step ##100"

{Result}
FinalStep = "@$accumulator.step"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      const output = getValues(result) as { Result: { FinalStep: number } };
      expect(output.Result.FinalStep).toBe(110);
    });

    it('all passes emit output to result', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{Pass1Output}
_pass = ##1
Message = "From Pass 1"
Value = ##1

{Pass2Output}
_pass = ##2
Message = "From Pass 2"
Value = ##2

{FinalOutput}
Message = "From Final Pass"
Value = ##3
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      const output = getValues(result) as {
        Pass1Output: { Message: string; Value: number };
        Pass2Output: { Message: string; Value: number };
        FinalOutput: { Message: string; Value: number };
      };
      expect(output.Pass1Output.Message).toBe('From Pass 1');
      expect(output.Pass1Output.Value).toBe(1);
      expect(output.Pass2Output.Message).toBe('From Pass 2');
      expect(output.Pass2Output.Value).toBe(2);
      expect(output.FinalOutput.Message).toBe('From Final Pass');
      expect(output.FinalOutput.Value).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Accumulator Persistence Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Accumulator Persistence', () => {
    it('persist accumulators carry values between passes', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
persistCounter = ##0
persistCounter._persist = ?true

{_pass1}
_pass = ##1
_ = "%accumulate persistCounter ##5"

{_pass2}
_pass = ##2
_ = "%accumulate persistCounter ##10"

{Result}
Total = "@$accumulator.persistCounter"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      const output = getValues(result) as { Result: { Total: number } };
      expect(output.Result.Total).toBe(15); // 5 + 10
    });

    it('non-persist accumulators reset between passes', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
nonPersist = ##0
persistRecord = ##0
persistRecord._persist = ?true
pass2Record = ##0
pass2Record._persist = ?true

{_pass1a}
_pass = ##1
_ = "%accumulate nonPersist ##5"

{_pass1b}
_pass = ##1
_ = "%set persistRecord @$accumulator.nonPersist"

{_pass2a}
_pass = ##2
_ = "%accumulate nonPersist ##10"

{_pass2b}
_pass = ##2
_ = "%set pass2Record @$accumulator.nonPersist"

{Result}
NonPersistValue = "@$accumulator.nonPersist"
RecordedFromPass1 = "@$accumulator.persistRecord"
RecordedFromPass2 = "@$accumulator.pass2Record"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      const output = getValues(result) as {
        Result: { NonPersistValue: number; RecordedFromPass1: number; RecordedFromPass2: number };
      };
      // nonPersist resets at start of each pass (except first):
      // - Pass 1: no reset, accumulates to 5
      // - Pass 2: reset to 0, then accumulates to 10
      // - Pass 0 (final): reset to 0, no further modifications
      expect(output.Result.NonPersistValue).toBe(0); // Reset at start of final pass
      expect(output.Result.RecordedFromPass1).toBe(5); // Captured in pass 1 before reset
      expect(output.Result.RecordedFromPass2).toBe(10); // Captured in pass 2 before reset
    });

    it('mixed persist and non-persist accumulators work correctly', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
passCount = ##0
totalItems = ##0
totalItems._persist = ?true
runningSum = ##0
runningSum._persist = ?true
pass2Counter = ##0
pass2Counter._persist = ?true

{_countPassCount[]}
_pass = ##1
_loop = "@"
_from = "items"
_ = "%accumulate passCount ##1"

{_countTotalItems[]}
_pass = ##1
_loop = "@"
_from = "items"
_ = "%accumulate totalItems ##1"

{_countRunningSum[]}
_pass = ##1
_loop = "@"
_from = "items"
_ = "%accumulate runningSum @."

{_checkPassA}
_pass = ##2
_ = "%accumulate passCount ##100"

{_checkPassB}
_pass = ##2
_ = "%set pass2Counter @$accumulator.passCount"

{Result}
PassCounter = "@$accumulator.passCount"
Pass2Counter = "@$accumulator.pass2Counter"
TotalItems = "@$accumulator.totalItems"
RunningSum = "@$accumulator.runningSum"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { items: [1, 2, 3, 4, 5] });

      expect(result.success).toBe(true);
      const output = getValues(result) as {
        Result: {
          PassCounter: number;
          Pass2Counter: number;
          TotalItems: number;
          RunningSum: number;
        };
      };
      // passCount resets each pass:
      // - Pass 1: accumulates to 5 (counted 5 items)
      // - Pass 2: reset to 0, then accumulates to 100
      // - Pass 0: reset to 0 (final value)
      expect(output.Result.PassCounter).toBe(0); // Reset at start of final pass
      expect(output.Result.Pass2Counter).toBe(100); // Captured in pass 2 before reset
      expect(output.Result.TotalItems).toBe(5); // Persisted
      expect(output.Result.RunningSum).toBe(15); // Persisted
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles empty passes (no segments in a pass)', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
value = ##0
value._persist = ?true

{_pass1}
_pass = ##1
_ = "%set value ##10"

{_pass3}
_pass = ##3
_ = "%accumulate value ##5"

{Result}
Value = "@$accumulator.value"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      const output = getValues(result) as { Result: { Value: number } };
      expect(output.Result.Value).toBe(15); // Pass 1 sets 10, pass 3 adds 5
    });

    it('handles non-sequential pass numbers (1, 3, 5)', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
sequence = ##0
sequence._persist = ?true

{_pass1}
_pass = ##1
_ = "%accumulate sequence ##1"

{_pass3}
_pass = ##3
_ = "%accumulate sequence ##30"

{_pass5}
_pass = ##5
_ = "%accumulate sequence ##500"

{Result}
Sequence = "@$accumulator.sequence"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      const output = getValues(result) as { Result: { Sequence: number } };
      // 1 + 30 + 500 = 531 proves passes run in order: 1, then 3, then 5
      expect(output.Result.Sequence).toBe(531);
    });

    it('handles only no-pass segments (backwards compatibility)', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
counter = ##0

{_count[]}
_loop = "@"
_from = "items"
_ = "%accumulate counter ##1"

{Result}
Count = "@$accumulator.counter"
Name = "@.name"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { name: 'Test', items: [1, 2, 3] });

      expect(result.success).toBe(true);
      const output = getValues(result) as { Result: { Count: number; Name: string } };
      expect(output.Result.Count).toBe(3);
      expect(output.Result.Name).toBe('Test');
    });

    it('hidden segments work across different passes', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
pass1Value = ##0
pass1Value._persist = ?true
pass2Value = ##0
pass2Value._persist = ?true

{_hidden1}
_pass = ##1
_ = "%set pass1Value ##100"

{_hidden2}
_pass = ##2
_ = "%set pass2Value ##200"

{Visible}
Pass1 = "@$accumulator.pass1Value"
Pass2 = "@$accumulator.pass2Value"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      const output = getValues(result) as { Visible: { Pass1: number; Pass2: number } };
      expect(output.Visible.Pass1).toBe(100);
      expect(output.Visible.Pass2).toBe(200);
      // Hidden segments should not appear in output
      expect(output).not.toHaveProperty('_hidden1');
      expect(output).not.toHaveProperty('_hidden2');
    });

    it('handles loop segments in multiple passes', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
sum = ##0
sum._persist = ?true
doubled = ##0
doubled._persist = ?true

{_sumPass[]}
_pass = ##1
_loop = "@"
_from = "numbers"
_ = "%accumulate sum @."

{_doublePass[]}
_pass = ##2
_loop = "@"
_from = "numbers"
_ = "%accumulate doubled %multiply @. ##2"

{Result}
Sum = "@$accumulator.sum"
DoubledSum = "@$accumulator.doubled"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, { numbers: [1, 2, 3, 4, 5] });

      expect(result.success).toBe(true);
      const output = getValues(result) as { Result: { Sum: number; DoubledSum: number } };
      expect(output.Result.Sum).toBe(15);
      expect(output.Result.DoubledSum).toBe(30);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Error Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Error Cases', () => {
    it('ignores _pass = ##0 (same as no pass)', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
value = ##0
value._persist = ?true

{_explicitPass0}
_pass = ##0
_ = "%set value ##42"

{Result}
Value = "@$accumulator.value"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      const output = getValues(result) as { Result: { Value: number } };
      // Pass 0 is treated as "no pass" - runs in the final pass group
      expect(output.Result.Value).toBe(42);
    });

    it('ignores negative pass numbers', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
value = ##0
value._persist = ?true

{_negativePass}
_pass = ##-1
_ = "%set value ##99"

{_pass1}
_pass = ##1
_ = "%accumulate value ##10"

{Result}
Value = "@$accumulator.value"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      // Negative pass should be ignored (segment runs in no-pass group)
      // Pass 1 runs first (10), then no-pass group (value stays at 10 or 99 depending on order)
      // Since negative is ignored, _negativePass runs in final group after pass 1
      const output = getValues(result) as { Result: { Value: number } };
      expect(output.Result.Value).toBe(99); // _negativePass runs last as no-pass
    });

    it('handles non-integer pass values gracefully', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
value = ##0
value._persist = ?true

{_floatPass}
_pass = #1.5
_ = "%set value ##50"

{Result}
Value = "@$accumulator.value"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {});

      expect(result.success).toBe(true);
      // Float values should be floored to integer
      const output = getValues(result) as { Result: { Value: number } };
      expect(output.Result.Value).toBe(50); // 1.5 floors to 1
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Real-World Use Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Real-World Use Cases', () => {
    it('normalizes values against computed average', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
total = ##0
total._persist = ?true
count = ##0
count._persist = ?true
average = ##0
average._persist = ?true

{_calcTotalVal[]}
_pass = ##1
_loop = "@"
_from = "items"
_ = "%accumulate total @.value"

{_calcTotalCnt[]}
_pass = ##1
_loop = "@"
_from = "items"
_ = "%accumulate count ##1"

{_calcAverage}
_pass = ##2
_ = "%set average %divide @$accumulator.total @$accumulator.count"

{NormalizedItems[]}
_pass = ##3
_loop = "@"
_from = "items"
Name = "@.name"
Original = "@.value"
Normalized = "%round %divide @.value @$accumulator.average ##2"

{Summary}
Average = "@$accumulator.average"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {
        items: [
          { name: 'A', value: 100 },
          { name: 'B', value: 200 },
          { name: 'C', value: 300 },
        ],
      });

      expect(result.success).toBe(true);
      const output = getValues(result) as {
        NormalizedItems: Array<{ Name: string; Original: number; Normalized: number }>;
        Summary: { Average: number };
      };
      expect(output.Summary.Average).toBe(200);
      expect(output.NormalizedItems).toHaveLength(3);
      expect(output.NormalizedItems[0]?.Normalized).toBe(0.5); // 100/200
      expect(output.NormalizedItems[1]?.Normalized).toBe(1); // 200/200
      expect(output.NormalizedItems[2]?.Normalized).toBe(1.5); // 300/200
    });

    it('calculates percentages after counting in different passes', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{$accumulator}
totalItems = ##0
totalItems._persist = ?true
totalValue = ##0
totalValue._persist = ?true
avgValue = ##0
avgValue._persist = ?true

{_countItems[]}
_pass = ##1
_loop = "@"
_from = "items"
_ = "%accumulate totalItems ##1"

{_sumValues[]}
_pass = ##1
_loop = "@"
_from = "items"
_ = "%accumulate totalValue @.value"

{_calcAverage}
_pass = ##2
_ = "%set avgValue %divide @$accumulator.totalValue @$accumulator.totalItems"

{Statistics}
Count = "@$accumulator.totalItems"
Total = "@$accumulator.totalValue"
Average = "@$accumulator.avgValue"
PerItemPercent = "%round %multiply %divide ##1 @$accumulator.totalItems ##100 ##1"
`;
      const transform = parseTransform(transformDoc);
      const result = executeTransform(transform, {
        items: [{ value: 10 }, { value: 20 }, { value: 30 }, { value: 40 }, { value: 50 }],
      });

      expect(result.success).toBe(true);
      const output = getValues(result) as {
        Statistics: {
          Count: number;
          Total: number;
          Average: number;
          PerItemPercent: number;
        };
      };
      expect(output.Statistics.Count).toBe(5);
      expect(output.Statistics.Total).toBe(150);
      expect(output.Statistics.Average).toBe(30);
      expect(output.Statistics.PerItemPercent).toBe(20); // Each item is 20% of total count
    });
  });
});
