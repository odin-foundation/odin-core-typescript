/**
 * Tests for ODIN Transform Financial & Statistical Verbs
 */

import { describe, it, expect } from 'vitest';
import { defaultVerbRegistry } from '../../src/transform/verbs.js';
import type { TransformContext, TransformValue } from '../../src/types/transform.js';

// Helper to create a minimal context
function createContext(overrides?: Partial<TransformContext>): TransformContext {
  return {
    source: {},
    current: undefined,
    aliases: new Map(),
    counters: new Map(),
    accumulators: new Map(),
    tables: new Map(),
    constants: new Map(),
    ...overrides,
  };
}

// Helper to create transform values
const num = (n: number): TransformValue => ({ type: 'number', value: n });
const int = (n: number): TransformValue => ({ type: 'integer', value: n });
const arr = (a: unknown[]): TransformValue => ({ type: 'array', items: a as any });
const nil = (): TransformValue => ({ type: 'null' });

// Helper for approximate equality
function expectApprox(actual: TransformValue, expected: number, _tolerance = 0.0001) {
  expect(['number', 'integer']).toContain(actual.type);
  if (actual.type === 'number' || actual.type === 'integer') {
    expect(actual.value).toBeCloseTo(expected, 4);
  }
}

describe('Financial & Statistical Verbs', () => {
  describe('Mathematical Functions', () => {
    describe('log', () => {
      it('calculates natural logarithm', () => {
        const log = defaultVerbRegistry.get('log')!;
        const result = log([num(Math.E)], createContext());
        expectApprox(result, 1);
      });

      it('calculates logarithm with custom base', () => {
        const log = defaultVerbRegistry.get('log')!;
        const result = log([num(8), int(2)], createContext());
        expectApprox(result, 3);
      });

      it('returns null for non-positive values', () => {
        const log = defaultVerbRegistry.get('log')!;
        expect(log([num(0)], createContext())).toEqual(nil());
        expect(log([num(-1)], createContext())).toEqual(nil());
      });
    });

    describe('ln', () => {
      it('calculates natural logarithm', () => {
        const ln = defaultVerbRegistry.get('ln')!;
        const result = ln([num(Math.E)], createContext());
        expectApprox(result, 1);
      });
    });

    describe('log10', () => {
      it('calculates base-10 logarithm', () => {
        const log10 = defaultVerbRegistry.get('log10')!;
        const result = log10([num(1000)], createContext());
        expectApprox(result, 3);
      });
    });

    describe('exp', () => {
      it('calculates exponential', () => {
        const exp = defaultVerbRegistry.get('exp')!;
        const result = exp([num(1)], createContext());
        expectApprox(result, Math.E);
      });

      it('exp(0) = 1', () => {
        const exp = defaultVerbRegistry.get('exp')!;
        const result = exp([num(0)], createContext());
        expectApprox(result, 1);
      });
    });

    describe('pow', () => {
      it('calculates power', () => {
        const pow = defaultVerbRegistry.get('pow')!;
        const result = pow([num(2), int(10)], createContext());
        expectApprox(result, 1024);
      });

      it('handles fractional exponents', () => {
        const pow = defaultVerbRegistry.get('pow')!;
        const result = pow([num(16), num(0.5)], createContext());
        expectApprox(result, 4);
      });
    });

    describe('sqrt', () => {
      it('calculates square root', () => {
        const sqrt = defaultVerbRegistry.get('sqrt')!;
        const result = sqrt([num(16)], createContext());
        expectApprox(result, 4);
      });

      it('returns null for negative values', () => {
        const sqrt = defaultVerbRegistry.get('sqrt')!;
        expect(sqrt([num(-1)], createContext())).toEqual(nil());
      });
    });
  });

  describe('Time Value of Money', () => {
    describe('compound', () => {
      it('calculates future value', () => {
        const compound = defaultVerbRegistry.get('compound')!;
        // $10,000 at 5% for 10 years
        const result = compound([num(10000), num(0.05), int(10)], createContext());
        expectApprox(result, 16288.9463);
      });
    });

    describe('discount', () => {
      it('calculates present value', () => {
        const discount = defaultVerbRegistry.get('discount')!;
        // $16288.95 at 5% for 10 years
        const result = discount([num(16288.946267774418), num(0.05), int(10)], createContext());
        expectApprox(result, 10000);
      });
    });

    describe('pmt', () => {
      it('calculates payment amount', () => {
        const pmt = defaultVerbRegistry.get('pmt')!;
        // $10,000 at 5% for 12 periods
        const result = pmt([num(10000), num(0.05), int(12)], createContext());
        expectApprox(result, 1128.2541);
      });

      it('handles zero interest rate', () => {
        const pmt = defaultVerbRegistry.get('pmt')!;
        // $12,000 at 0% for 12 periods = $1000/period
        const result = pmt([num(12000), num(0), int(12)], createContext());
        expectApprox(result, 1000);
      });
    });

    describe('fv', () => {
      it('calculates future value of annuity', () => {
        const fv = defaultVerbRegistry.get('fv')!;
        // $100/period at 5% for 10 periods
        const result = fv([num(100), num(0.05), int(10)], createContext());
        expectApprox(result, 1257.7893);
      });
    });

    describe('pv', () => {
      it('calculates present value of annuity', () => {
        const pv = defaultVerbRegistry.get('pv')!;
        // $100/period at 5% for 10 periods
        const result = pv([num(100), num(0.05), int(10)], createContext());
        expectApprox(result, 772.1735);
      });
    });
  });

  describe('Statistical Functions', () => {
    describe('variance', () => {
      it('calculates population variance', () => {
        const variance = defaultVerbRegistry.get('variance')!;
        // Values: 2, 4, 4, 4, 5, 5, 7, 9 -> mean = 5, variance = 4
        const result = variance([arr([2, 4, 4, 4, 5, 5, 7, 9])], createContext());
        expectApprox(result, 4);
      });
    });

    describe('varianceSample', () => {
      it('calculates sample variance (n-1)', () => {
        const varianceSample = defaultVerbRegistry.get('varianceSample')!;
        // Values: 2, 4, 4, 4, 5, 5, 7, 9 -> sample variance = 32/7 ≈ 4.571
        const result = varianceSample([arr([2, 4, 4, 4, 5, 5, 7, 9])], createContext());
        expectApprox(result, 4.5714);
      });
    });

    describe('std', () => {
      it('calculates population standard deviation', () => {
        const std = defaultVerbRegistry.get('std')!;
        // Values: 2, 4, 4, 4, 5, 5, 7, 9 -> std = 2
        const result = std([arr([2, 4, 4, 4, 5, 5, 7, 9])], createContext());
        expectApprox(result, 2);
      });
    });

    describe('stdSample', () => {
      it('calculates sample standard deviation (n-1)', () => {
        const stdSample = defaultVerbRegistry.get('stdSample')!;
        // Values: 2, 4, 4, 4, 5, 5, 7, 9 -> sample std ≈ 2.138
        const result = stdSample([arr([2, 4, 4, 4, 5, 5, 7, 9])], createContext());
        expectApprox(result, 2.1381);
      });
    });

    describe('median', () => {
      it('calculates median for odd count', () => {
        const median = defaultVerbRegistry.get('median')!;
        const result = median([arr([1, 3, 5, 7, 9])], createContext());
        expectApprox(result, 5);
      });

      it('calculates median for even count (average of middle)', () => {
        const median = defaultVerbRegistry.get('median')!;
        const result = median([arr([1, 2, 3, 4])], createContext());
        expectApprox(result, 2.5);
      });

      it('handles unsorted array', () => {
        const median = defaultVerbRegistry.get('median')!;
        const result = median([arr([5, 1, 3, 9, 7])], createContext());
        expectApprox(result, 5);
      });
    });

    describe('mode', () => {
      it('finds most frequent value', () => {
        const mode = defaultVerbRegistry.get('mode')!;
        const result = mode([arr([1, 2, 2, 3, 3, 3, 4])], createContext());
        expectApprox(result, 3);
      });

      it('returns first mode on tie', () => {
        const mode = defaultVerbRegistry.get('mode')!;
        const result = mode([arr([1, 1, 2, 2, 3])], createContext());
        expectApprox(result, 1);
      });
    });

    describe('percentile', () => {
      it('calculates 50th percentile (median)', () => {
        const percentile = defaultVerbRegistry.get('percentile')!;
        const result = percentile([arr([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), int(50)], createContext());
        expectApprox(result, 5.5);
      });

      it('calculates 90th percentile', () => {
        const percentile = defaultVerbRegistry.get('percentile')!;
        const result = percentile([arr([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), int(90)], createContext());
        expectApprox(result, 9.1);
      });

      it('returns null for out-of-range percentile', () => {
        const percentile = defaultVerbRegistry.get('percentile')!;
        expect(percentile([arr([1, 2, 3]), int(101)], createContext())).toEqual(nil());
        expect(percentile([arr([1, 2, 3]), int(-1)], createContext())).toEqual(nil());
      });
    });

    describe('quantile', () => {
      it('calculates 0.75 quantile', () => {
        const quantile = defaultVerbRegistry.get('quantile')!;
        const result = quantile([arr([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), num(0.75)], createContext());
        expectApprox(result, 7.75);
      });

      it('returns null for out-of-range quantile', () => {
        const quantile = defaultVerbRegistry.get('quantile')!;
        expect(quantile([arr([1, 2, 3]), num(1.5)], createContext())).toEqual(nil());
        expect(quantile([arr([1, 2, 3]), num(-0.1)], createContext())).toEqual(nil());
      });
    });
  });

  describe('Correlation Functions', () => {
    describe('covariance', () => {
      it('calculates covariance', () => {
        const covariance = defaultVerbRegistry.get('covariance')!;
        // Perfect linear relationship: y = 2x
        const result = covariance([arr([1, 2, 3, 4, 5]), arr([2, 4, 6, 8, 10])], createContext());
        expectApprox(result, 4);
      });
    });

    describe('correlation', () => {
      it('calculates perfect positive correlation', () => {
        const correlation = defaultVerbRegistry.get('correlation')!;
        const result = correlation([arr([1, 2, 3, 4, 5]), arr([2, 4, 6, 8, 10])], createContext());
        expectApprox(result, 1);
      });

      it('calculates perfect negative correlation', () => {
        const correlation = defaultVerbRegistry.get('correlation')!;
        const result = correlation([arr([1, 2, 3, 4, 5]), arr([10, 8, 6, 4, 2])], createContext());
        expectApprox(result, -1);
      });
    });
  });

  describe('Utility Functions', () => {
    describe('clamp', () => {
      it('clamps value within range', () => {
        const clamp = defaultVerbRegistry.get('clamp')!;
        const result = clamp([num(50), num(0), num(100)], createContext());
        expectApprox(result, 50);
      });

      it('clamps value below minimum', () => {
        const clamp = defaultVerbRegistry.get('clamp')!;
        const result = clamp([num(-10), num(0), num(100)], createContext());
        expectApprox(result, 0);
      });

      it('clamps value above maximum', () => {
        const clamp = defaultVerbRegistry.get('clamp')!;
        const result = clamp([num(150), num(0), num(100)], createContext());
        expectApprox(result, 100);
      });
    });

    describe('interpolate', () => {
      it('interpolates at midpoint', () => {
        const interpolate = defaultVerbRegistry.get('interpolate')!;
        // x=35, points (25, 100) and (45, 200) -> y=150
        const result = interpolate(
          [num(35), num(25), num(100), num(45), num(200)],
          createContext()
        );
        expectApprox(result, 150);
      });

      it('interpolates at start point', () => {
        const interpolate = defaultVerbRegistry.get('interpolate')!;
        const result = interpolate(
          [num(25), num(25), num(100), num(45), num(200)],
          createContext()
        );
        expectApprox(result, 100);
      });

      it('extrapolates beyond range', () => {
        const interpolate = defaultVerbRegistry.get('interpolate')!;
        // x=55 (beyond x2=45)
        const result = interpolate(
          [num(55), num(25), num(100), num(45), num(200)],
          createContext()
        );
        expectApprox(result, 250);
      });
    });

    describe('weightedAvg', () => {
      it('calculates weighted average', () => {
        const weightedAvg = defaultVerbRegistry.get('weightedAvg')!;
        // Values: 80, 90, 100 with weights: 1, 2, 1
        // = (80*1 + 90*2 + 100*1) / (1+2+1) = 360/4 = 90
        const result = weightedAvg([arr([80, 90, 100]), arr([1, 2, 1])], createContext());
        expectApprox(result, 90);
      });

      it('handles single value', () => {
        const weightedAvg = defaultVerbRegistry.get('weightedAvg')!;
        const result = weightedAvg([arr([100]), arr([5])], createContext());
        expectApprox(result, 100);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles empty array for statistical functions', () => {
      const std = defaultVerbRegistry.get('std')!;
      const median = defaultVerbRegistry.get('median')!;
      const mode = defaultVerbRegistry.get('mode')!;

      expect(std([arr([])], createContext())).toEqual(nil());
      expect(median([arr([])], createContext())).toEqual(nil());
      expect(mode([arr([])], createContext())).toEqual(nil());
    });

    it('handles single element array for sample statistics', () => {
      const stdSample = defaultVerbRegistry.get('stdSample')!;
      const varianceSample = defaultVerbRegistry.get('varianceSample')!;

      // Sample statistics need at least 2 elements
      expect(stdSample([arr([5])], createContext())).toEqual(nil());
      expect(varianceSample([arr([5])], createContext())).toEqual(nil());
    });

    it('handles mismatched array lengths for correlation', () => {
      const correlation = defaultVerbRegistry.get('correlation')!;
      // Uses shorter array length
      const result = correlation([arr([1, 2, 3]), arr([2, 4, 6, 8, 10])], createContext());
      expectApprox(result, 1); // Still perfect correlation on first 3 pairs
    });
  });

  describe('Error Handling & Edge Cases', () => {
    describe('Missing Arguments', () => {
      it('log returns null with no arguments', () => {
        const log = defaultVerbRegistry.get('log')!;
        expect(log([], createContext())).toEqual(nil());
      });

      it('pow returns null with insufficient arguments', () => {
        const pow = defaultVerbRegistry.get('pow')!;
        expect(pow([], createContext())).toEqual(nil());
        expect(pow([num(2)], createContext())).toEqual(nil());
      });

      it('compound returns null with insufficient arguments', () => {
        const compound = defaultVerbRegistry.get('compound')!;
        expect(compound([], createContext())).toEqual(nil());
        expect(compound([num(1000)], createContext())).toEqual(nil());
        expect(compound([num(1000), num(0.05)], createContext())).toEqual(nil());
      });

      it('clamp returns null with insufficient arguments', () => {
        const clamp = defaultVerbRegistry.get('clamp')!;
        expect(clamp([], createContext())).toEqual(nil());
        expect(clamp([num(50)], createContext())).toEqual(nil());
        expect(clamp([num(50), num(0)], createContext())).toEqual(nil());
      });

      it('interpolate returns null with insufficient arguments', () => {
        const interpolate = defaultVerbRegistry.get('interpolate')!;
        expect(interpolate([], createContext())).toEqual(nil());
        expect(interpolate([num(35), num(25), num(100), num(45)], createContext())).toEqual(nil());
      });

      it('percentile returns null with missing percentile', () => {
        const percentile = defaultVerbRegistry.get('percentile')!;
        expect(percentile([arr([1, 2, 3])], createContext())).toEqual(nil());
      });

      it('weightedAvg returns null with missing weights', () => {
        const weightedAvg = defaultVerbRegistry.get('weightedAvg')!;
        expect(weightedAvg([arr([1, 2, 3])], createContext())).toEqual(nil());
      });

      it('covariance returns null with missing second array', () => {
        const covariance = defaultVerbRegistry.get('covariance')!;
        expect(covariance([arr([1, 2, 3])], createContext())).toEqual(nil());
      });
    });

    describe('Invalid Inputs', () => {
      it('log returns null for zero', () => {
        const log = defaultVerbRegistry.get('log')!;
        expect(log([num(0)], createContext())).toEqual(nil());
      });

      it('log returns null for negative numbers', () => {
        const log = defaultVerbRegistry.get('log')!;
        expect(log([num(-5)], createContext())).toEqual(nil());
      });

      it('log returns null for invalid base (0, 1, negative)', () => {
        const log = defaultVerbRegistry.get('log')!;
        expect(log([num(10), num(0)], createContext())).toEqual(nil());
        expect(log([num(10), num(1)], createContext())).toEqual(nil());
        expect(log([num(10), num(-2)], createContext())).toEqual(nil());
      });

      it('sqrt returns null for negative numbers', () => {
        const sqrt = defaultVerbRegistry.get('sqrt')!;
        expect(sqrt([num(-16)], createContext())).toEqual(nil());
      });

      it('pmt returns null for zero or negative periods', () => {
        const pmt = defaultVerbRegistry.get('pmt')!;
        expect(pmt([num(10000), num(0.05), int(0)], createContext())).toEqual(nil());
        expect(pmt([num(10000), num(0.05), int(-5)], createContext())).toEqual(nil());
      });

      it('percentile returns null for out-of-range values', () => {
        const percentile = defaultVerbRegistry.get('percentile')!;
        expect(percentile([arr([1, 2, 3]), int(-5)], createContext())).toEqual(nil());
        expect(percentile([arr([1, 2, 3]), int(105)], createContext())).toEqual(nil());
      });

      it('quantile returns null for out-of-range values', () => {
        const quantile = defaultVerbRegistry.get('quantile')!;
        expect(quantile([arr([1, 2, 3]), num(-0.5)], createContext())).toEqual(nil());
        expect(quantile([arr([1, 2, 3]), num(1.5)], createContext())).toEqual(nil());
      });
    });

    describe('Zero Weight Handling', () => {
      it('weightedAvg returns null when total weight is zero', () => {
        const weightedAvg = defaultVerbRegistry.get('weightedAvg')!;
        expect(weightedAvg([arr([1, 2, 3]), arr([0, 0, 0])], createContext())).toEqual(nil());
      });
    });

    describe('Empty Arrays', () => {
      it('variance returns null for empty array', () => {
        const variance = defaultVerbRegistry.get('variance')!;
        expect(variance([arr([])], createContext())).toEqual(nil());
      });

      it('std returns null for empty array', () => {
        const std = defaultVerbRegistry.get('std')!;
        expect(std([arr([])], createContext())).toEqual(nil());
      });

      it('median returns null for empty array', () => {
        const median = defaultVerbRegistry.get('median')!;
        expect(median([arr([])], createContext())).toEqual(nil());
      });

      it('mode returns null for empty array', () => {
        const mode = defaultVerbRegistry.get('mode')!;
        expect(mode([arr([])], createContext())).toEqual(nil());
      });

      it('percentile returns null for empty array', () => {
        const percentile = defaultVerbRegistry.get('percentile')!;
        expect(percentile([arr([]), int(50)], createContext())).toEqual(nil());
      });

      it('covariance returns null for empty arrays', () => {
        const covariance = defaultVerbRegistry.get('covariance')!;
        expect(covariance([arr([]), arr([])], createContext())).toEqual(nil());
        expect(covariance([arr([1, 2]), arr([])], createContext())).toEqual(nil());
      });

      it('correlation returns null for empty arrays', () => {
        const correlation = defaultVerbRegistry.get('correlation')!;
        expect(correlation([arr([]), arr([])], createContext())).toEqual(nil());
      });

      it('weightedAvg returns null for empty arrays', () => {
        const weightedAvg = defaultVerbRegistry.get('weightedAvg')!;
        expect(weightedAvg([arr([]), arr([])], createContext())).toEqual(nil());
      });
    });

    describe('Single Element Arrays', () => {
      it('stdSample returns null for single element (n-1 = 0)', () => {
        const stdSample = defaultVerbRegistry.get('stdSample')!;
        expect(stdSample([arr([5])], createContext())).toEqual(nil());
      });

      it('varianceSample returns null for single element', () => {
        const varianceSample = defaultVerbRegistry.get('varianceSample')!;
        expect(varianceSample([arr([5])], createContext())).toEqual(nil());
      });

      it('std handles single element (variance = 0)', () => {
        const std = defaultVerbRegistry.get('std')!;
        expectApprox(std([arr([5])], createContext()), 0);
      });

      it('median handles single element', () => {
        const median = defaultVerbRegistry.get('median')!;
        expectApprox(median([arr([42])], createContext()), 42);
      });

      it('mode handles single element', () => {
        const mode = defaultVerbRegistry.get('mode')!;
        expectApprox(mode([arr([42])], createContext()), 42);
      });
    });

    describe('Overflow and Precision', () => {
      it('pow handles overflow gracefully', () => {
        const pow = defaultVerbRegistry.get('pow')!;
        // This would overflow
        const result = pow([num(10), num(1000)], createContext());
        expect(result).toEqual(nil()); // Infinity should return null
      });

      it('exp handles overflow gracefully', () => {
        const exp = defaultVerbRegistry.get('exp')!;
        // e^1000 = Infinity
        const result = exp([num(1000)], createContext());
        // Should still return a number (Infinity is allowed in JS, but let's check)
        expect(result.type).toBe('number');
      });

      it('compound handles very large periods', () => {
        const compound = defaultVerbRegistry.get('compound')!;
        const result = compound([num(100), num(0.01), int(10000)], createContext());
        // Should return null if result is Infinity, or a finite numeric value
        const isFiniteNumeric =
          (result.type === 'number' || result.type === 'integer') && isFinite(result.value);
        expect(result.type === 'null' || isFiniteNumeric).toBe(true);
      });
    });

    describe('Zero Rate Handling for Financial Functions', () => {
      it('pmt handles zero rate correctly', () => {
        const pmt = defaultVerbRegistry.get('pmt')!;
        // At 0% rate, payment = principal / periods
        const result = pmt([num(12000), num(0), int(12)], createContext());
        expectApprox(result, 1000);
      });

      it('fv handles zero rate correctly', () => {
        const fv = defaultVerbRegistry.get('fv')!;
        // At 0% rate, fv = payment * periods
        const result = fv([num(100), num(0), int(12)], createContext());
        expectApprox(result, 1200);
      });

      it('pv handles zero rate correctly', () => {
        const pv = defaultVerbRegistry.get('pv')!;
        // At 0% rate, pv = payment * periods
        const result = pv([num(100), num(0), int(12)], createContext());
        expectApprox(result, 1200);
      });
    });

    describe('Correlation Edge Cases', () => {
      it('correlation returns null for constant arrays (zero variance)', () => {
        const correlation = defaultVerbRegistry.get('correlation')!;
        // Both arrays are constant -> denominator is 0
        const result = correlation([arr([5, 5, 5]), arr([3, 3, 3])], createContext());
        expect(result).toEqual(nil());
      });

      it('correlation handles one constant array', () => {
        const correlation = defaultVerbRegistry.get('correlation')!;
        // One array is constant -> denominator is 0
        const result = correlation([arr([5, 5, 5]), arr([1, 2, 3])], createContext());
        expect(result).toEqual(nil());
      });
    });

    describe('Interpolation Edge Cases', () => {
      it('interpolate handles same x values (x1 = x2)', () => {
        const interpolate = defaultVerbRegistry.get('interpolate')!;
        // When x1 = x2, should return y1 to avoid division by zero
        const result = interpolate(
          [num(25), num(25), num(100), num(25), num(200)],
          createContext()
        );
        expectApprox(result, 100);
      });

      it('interpolate handles extrapolation below range', () => {
        const interpolate = defaultVerbRegistry.get('interpolate')!;
        // x=15 (below x1=25)
        const result = interpolate(
          [num(15), num(25), num(100), num(45), num(200)],
          createContext()
        );
        expectApprox(result, 50); // Linear extrapolation
      });
    });
  });
});
