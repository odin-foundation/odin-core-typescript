/**
 * ODIN Transform Financial & Statistical Verbs
 *
 * Financial verbs: log, ln, log10, exp, pow, sqrt, compound, discount, pmt, fv, pv
 * Statistical verbs: std, stdSample, variance, varianceSample, median, mode, percentile, quantile
 * Correlation verbs: covariance, correlation
 * Utility verbs: clamp, interpolate, weightedAvg
 */

import type { VerbFunction, TransformValue } from '../../types/transform.js';
import { resolvePath } from '../utils.js';
import { toNumber, numericResult, nil, extractNumericValue, arr } from './helpers.js';

/**
 * Helper to extract a numeric array from a TransformValue.
 */
function extractNumericArray(val: TransformValue, source: unknown): number[] | undefined {
  // Handle array type directly
  if (val.type === 'array') {
    return (val.items as unknown[]).map((item: unknown) => extractNumericValue(item));
  }

  if (val.type === 'string') {
    const str = val.value;

    // Check if it's a JSON array string
    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => extractNumericValue(item));
        }
      } catch {
        // Not valid JSON, treat as path
      }
    }

    // Try to resolve as path
    const resolved = resolvePath(str, source);
    if (Array.isArray(resolved)) {
      return resolved.map((item) => extractNumericValue(item));
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mathematical Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %log @value [base] - Logarithm (natural if no base specified)
 */
export const log: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const value = toNumber(args[0]!);
  if (value <= 0) return nil();

  if (args.length >= 2) {
    const base = toNumber(args[1]!);
    if (base <= 0 || base === 1) return nil();
    return numericResult(Math.log(value) / Math.log(base));
  }

  return numericResult(Math.log(value));
};

/**
 * %ln @value - Natural logarithm (alias for log with no base)
 */
export const ln: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const value = toNumber(args[0]!);
  if (value <= 0) return nil();
  return numericResult(Math.log(value));
};

/**
 * %log10 @value - Base-10 logarithm
 */
export const log10: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const value = toNumber(args[0]!);
  if (value <= 0) return nil();
  return numericResult(Math.log10(value));
};

/**
 * %exp @value - Exponential (e^x)
 */
export const exp: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const value = toNumber(args[0]!);
  return numericResult(Math.exp(value));
};

/**
 * %pow @base @exponent - Power function
 */
export const pow: VerbFunction = (args) => {
  if (args.length < 2) return nil();
  const base = toNumber(args[0]!);
  const exponent = toNumber(args[1]!);
  const result = Math.pow(base, exponent);
  if (!isFinite(result)) return nil();
  return numericResult(result);
};

/**
 * %sqrt @value - Square root
 */
export const sqrt: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const value = toNumber(args[0]!);
  if (value < 0) return nil();
  return numericResult(Math.sqrt(value));
};

// ─────────────────────────────────────────────────────────────────────────────
// Time Value of Money Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %compound @principal @rate @periods - Future value: P × (1 + r)^n
 */
export const compound: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const principal = toNumber(args[0]!);
  const rate = toNumber(args[1]!);
  const periods = toNumber(args[2]!);

  const result = principal * Math.pow(1 + rate, periods);
  if (!isFinite(result)) return nil();
  return numericResult(result);
};

/**
 * %discount @futureValue @rate @periods - Present value: FV / (1 + r)^n
 */
export const discount: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const futureValue = toNumber(args[0]!);
  const rate = toNumber(args[1]!);
  const periods = toNumber(args[2]!);

  const divisor = Math.pow(1 + rate, periods);
  if (divisor === 0 || !isFinite(divisor)) return nil();

  const result = futureValue / divisor;
  if (!isFinite(result)) return nil();
  return numericResult(result);
};

/**
 * %pmt @principal @rate @periods - Payment for loan/annuity
 * Formula: P * r * (1+r)^n / ((1+r)^n - 1)
 */
export const pmt: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const principal = toNumber(args[0]!);
  const rate = toNumber(args[1]!);
  const periods = toNumber(args[2]!);

  if (periods <= 0) return nil();

  // If rate is 0, simple division
  if (rate === 0) {
    return numericResult(principal / periods);
  }

  const factor = Math.pow(1 + rate, periods);
  const result = (principal * rate * factor) / (factor - 1);
  if (!isFinite(result)) return nil();
  return numericResult(result);
};

/**
 * %fv @payment @rate @periods - Future value of annuity
 * Formula: PMT * ((1+r)^n - 1) / r
 */
export const fv: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const payment = toNumber(args[0]!);
  const rate = toNumber(args[1]!);
  const periods = toNumber(args[2]!);

  // If rate is 0, simple multiplication
  if (rate === 0) {
    return numericResult(payment * periods);
  }

  const factor = Math.pow(1 + rate, periods);
  const result = payment * ((factor - 1) / rate);
  if (!isFinite(result)) return nil();
  return numericResult(result);
};

/**
 * %pv @payment @rate @periods - Present value of annuity
 * Formula: PMT * (1 - (1+r)^-n) / r
 */
export const pv: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const payment = toNumber(args[0]!);
  const rate = toNumber(args[1]!);
  const periods = toNumber(args[2]!);

  // If rate is 0, simple multiplication
  if (rate === 0) {
    return numericResult(payment * periods);
  }

  const factor = Math.pow(1 + rate, -periods);
  const result = payment * ((1 - factor) / rate);
  if (!isFinite(result)) return nil();
  return numericResult(result);
};

// ─────────────────────────────────────────────────────────────────────────────
// Statistical Functions (Array-Based)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper to calculate mean
 */
function calculateMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * %variance @array.field - Population variance
 */
export const variance: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const arr = extractNumericArray(args[0]!, context.source);
  if (!arr || arr.length === 0) return nil();

  const mean = calculateMean(arr);
  const sumSquaredDiff = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  return numericResult(sumSquaredDiff / arr.length);
};

/**
 * %varianceSample @array.field - Sample variance (n-1)
 */
export const varianceSample: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const arr = extractNumericArray(args[0]!, context.source);
  if (!arr || arr.length < 2) return nil();

  const mean = calculateMean(arr);
  const sumSquaredDiff = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  return numericResult(sumSquaredDiff / (arr.length - 1));
};

/**
 * %std @array.field - Population standard deviation
 */
export const std: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const arr = extractNumericArray(args[0]!, context.source);
  if (!arr || arr.length === 0) return nil();

  const mean = calculateMean(arr);
  const sumSquaredDiff = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  return numericResult(Math.sqrt(sumSquaredDiff / arr.length));
};

/**
 * %stdSample @array.field - Sample standard deviation (n-1)
 */
export const stdSample: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const arr = extractNumericArray(args[0]!, context.source);
  if (!arr || arr.length < 2) return nil();

  const mean = calculateMean(arr);
  const sumSquaredDiff = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  return numericResult(Math.sqrt(sumSquaredDiff / (arr.length - 1)));
};

/**
 * %median @array.field - Median value
 */
export const median: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const arr = extractNumericArray(args[0]!, context.source);
  if (!arr || arr.length === 0) return nil();

  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    // Even number of elements: average of two middle values
    return numericResult((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  // Odd number of elements: middle value
  return numericResult(sorted[mid]!);
};

/**
 * %mode @array.field - Most frequent value (returns first mode if tie)
 */
export const mode: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const arr = extractNumericArray(args[0]!, context.source);
  if (!arr || arr.length === 0) return nil();

  const counts = new Map<number, number>();
  let maxCount = 0;
  let modeValue = arr[0]!;

  for (const val of arr) {
    const count = (counts.get(val) ?? 0) + 1;
    counts.set(val, count);
    if (count > maxCount) {
      maxCount = count;
      modeValue = val;
    }
  }

  return numericResult(modeValue);
};

/**
 * %percentile @array.field @pct - Nth percentile (0-100)
 *
 * Uses linear interpolation between adjacent values when the percentile
 * falls between data points.
 */
export const percentile: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const arr = extractNumericArray(args[0]!, context.source);
  if (!arr || arr.length === 0) return nil();

  const pct = toNumber(args[1]!);
  if (pct < 0 || pct > 100) return nil();

  const sorted = [...arr].sort((a, b) => a - b);
  const index = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return numericResult(sorted[lower]!);
  }

  // Linear interpolation
  const weight = index - lower;
  return numericResult(sorted[lower]! * (1 - weight) + sorted[upper]! * weight);
};

/**
 * %quantile @array.field @q - Quantile (0-1)
 */
export const quantile: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const arr = extractNumericArray(args[0]!, context.source);
  if (!arr || arr.length === 0) return nil();

  const q = toNumber(args[1]!);
  if (q < 0 || q > 1) return nil();

  const sorted = [...arr].sort((a, b) => a - b);
  const index = q * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return numericResult(sorted[lower]!);
  }

  // Linear interpolation
  const weight = index - lower;
  return numericResult(sorted[lower]! * (1 - weight) + sorted[upper]! * weight);
};

// ─────────────────────────────────────────────────────────────────────────────
// Correlation Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %covariance @array1 @array2 - Covariance between two arrays
 */
export const covariance: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const arr1 = extractNumericArray(args[0]!, context.source);
  const arr2 = extractNumericArray(args[1]!, context.source);

  if (!arr1 || !arr2 || arr1.length === 0 || arr2.length === 0) return nil();

  // Use the shorter length
  const n = Math.min(arr1.length, arr2.length);
  if (n === 0) return nil();

  const mean1 = arr1.slice(0, n).reduce((sum, val) => sum + val, 0) / n;
  const mean2 = arr2.slice(0, n).reduce((sum, val) => sum + val, 0) / n;

  let cov = 0;
  for (let i = 0; i < n; i++) {
    cov += (arr1[i]! - mean1) * (arr2[i]! - mean2);
  }

  return numericResult(cov / n);
};

/**
 * %correlation @array1 @array2 - Pearson correlation coefficient (-1 to 1)
 */
export const correlation: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const arr1 = extractNumericArray(args[0]!, context.source);
  const arr2 = extractNumericArray(args[1]!, context.source);

  if (!arr1 || !arr2 || arr1.length === 0 || arr2.length === 0) return nil();

  // Use the shorter length
  const n = Math.min(arr1.length, arr2.length);
  if (n === 0) return nil();

  const mean1 = arr1.slice(0, n).reduce((sum, val) => sum + val, 0) / n;
  const mean2 = arr2.slice(0, n).reduce((sum, val) => sum + val, 0) / n;

  let cov = 0;
  let var1 = 0;
  let var2 = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = arr1[i]! - mean1;
    const diff2 = arr2[i]! - mean2;
    cov += diff1 * diff2;
    var1 += diff1 * diff1;
    var2 += diff2 * diff2;
  }

  const denom = Math.sqrt(var1 * var2);
  if (denom === 0) return nil();

  return numericResult(cov / denom);
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %clamp @value @min @max - Constrain value to range
 */
export const clamp: VerbFunction = (args) => {
  if (args.length < 3) return nil();
  const value = toNumber(args[0]!);
  const min = toNumber(args[1]!);
  const max = toNumber(args[2]!);
  return numericResult(Math.max(min, Math.min(max, value)));
};

/**
 * %interpolate @x @x1 @y1 @x2 @y2 - Linear interpolation
 */
export const interpolate: VerbFunction = (args) => {
  if (args.length < 5) return nil();
  const x = toNumber(args[0]!);
  const x1 = toNumber(args[1]!);
  const y1 = toNumber(args[2]!);
  const x2 = toNumber(args[3]!);
  const y2 = toNumber(args[4]!);

  // Avoid division by zero
  if (x2 === x1) return numericResult(y1);

  // Linear interpolation: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
  const result = y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
  return numericResult(result);
};

/**
 * %weightedAvg @values @weights - Weighted average of two arrays
 */
export const weightedAvg: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const values = extractNumericArray(args[0]!, context.source);
  const weights = extractNumericArray(args[1]!, context.source);

  if (!values || !weights || values.length === 0 || weights.length === 0) return nil();

  // Use the shorter length
  const n = Math.min(values.length, weights.length);

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < n; i++) {
    weightedSum += values[i]! * weights[i]!;
    totalWeight += weights[i]!;
  }

  if (totalWeight === 0) return nil();

  return numericResult(weightedSum / totalWeight);
};

// ─────────────────────────────────────────────────────────────────────────────
// Additional Financial Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %npv @rate @cashflows - Net Present Value
 * Calculates NPV of a series of cash flows at a given discount rate.
 * Cash flows are assumed to occur at end of each period.
 *
 * Formula: NPV = sum of CF_t / (1 + r)^t for t = 0, 1, 2, ...
 *
 * @example
 * npv = "%npv ##0.1 @cashflows"  ; 10% discount rate
 * ; cashflows = [-100, 30, 40, 50, 60] → NPV ≈ 43.36
 */
export const npv: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const rate = toNumber(args[0]!);
  const cashflows = extractNumericArray(args[1]!, context.source);

  if (!cashflows || cashflows.length === 0) return nil();

  let npvValue = 0;
  for (let t = 0; t < cashflows.length; t++) {
    npvValue += cashflows[t]! / Math.pow(1 + rate, t);
  }

  if (!isFinite(npvValue)) return nil();
  return numericResult(npvValue);
};

/**
 * %irr @cashflows [guess] - Internal Rate of Return
 * Finds the discount rate that makes NPV = 0.
 * Uses Newton-Raphson iteration.
 *
 * Precision: 0.0001% (1e-6)
 * Max iterations: 100
 *
 * @example
 * rate = "%irr @cashflows"  ; [-100, 30, 40, 50, 60] → ~0.189 (18.9%)
 */
export const irr: VerbFunction = (args, context) => {
  if (args.length === 0) return nil();

  const cashflows = extractNumericArray(args[0]!, context.source);
  if (!cashflows || cashflows.length < 2) return nil();

  // Initial guess (default 10%)
  let rate = args.length >= 2 ? toNumber(args[1]!) : 0.1;

  const maxIterations = 100;
  const precision = 1e-6; // 0.0001%

  // Newton-Raphson iteration
  for (let i = 0; i < maxIterations; i++) {
    let npvValue = 0;
    let npvDerivative = 0;

    for (let t = 0; t < cashflows.length; t++) {
      const cf = cashflows[t]!;
      const discountFactor = Math.pow(1 + rate, t);
      npvValue += cf / discountFactor;

      // Derivative: d/dr [CF / (1+r)^t] = -t * CF / (1+r)^(t+1)
      if (t > 0) {
        npvDerivative -= (t * cf) / Math.pow(1 + rate, t + 1);
      }
    }

    // Check convergence
    if (Math.abs(npvValue) < precision) {
      return numericResult(rate);
    }

    // Avoid division by zero
    if (Math.abs(npvDerivative) < 1e-10) {
      return nil(); // No convergence
    }

    // Newton-Raphson update
    rate = rate - npvValue / npvDerivative;

    // Bounds check to prevent runaway
    if (rate < -0.99 || rate > 10) {
      return nil(); // No reasonable solution
    }
  }

  // Max iterations reached without convergence
  return nil();
};

/**
 * %rate @periods @pmt @pv @fv - Calculate interest rate per period
 * Given nper, pmt, pv, and fv, solves for rate.
 * Uses Newton-Raphson iteration.
 *
 * @example
 * rate = "%rate ##12 ##-100 ##1000 ##0"  ; 12 periods, $100/period, $1000 PV
 */
export const rate: VerbFunction = (args) => {
  if (args.length < 4) return nil();

  const nper = toNumber(args[0]!);
  const pmt = toNumber(args[1]!);
  const pvValue = toNumber(args[2]!);
  const fvValue = toNumber(args[3]!);

  if (nper <= 0) return nil();

  // Special case: no payments
  if (pmt === 0) {
    if (pvValue === 0) return nil();
    // FV = PV * (1 + r)^n => r = (FV/PV)^(1/n) - 1
    const ratio = -fvValue / pvValue;
    if (ratio <= 0) return nil();
    return numericResult(Math.pow(ratio, 1 / nper) - 1);
  }

  // Newton-Raphson iteration
  let guess = 0.1;
  const maxIterations = 100;
  const precision = 1e-6;

  for (let i = 0; i < maxIterations; i++) {
    const r = guess;
    if (r === 0) {
      // Special handling for r = 0
      const f = pvValue + pmt * nper + fvValue;
      if (Math.abs(f) < precision) return numericResult(0);
      guess = 0.01;
      continue;
    }

    const rPlus1 = 1 + r;
    const rPlus1N = Math.pow(rPlus1, nper);

    // f(r) = PV + PMT * (1 - (1+r)^-n) / r + FV * (1+r)^-n
    const f = pvValue + (pmt * (1 - 1 / rPlus1N)) / r + fvValue / rPlus1N;

    // f'(r) derivative
    const fPrime =
      (pmt * (1 / rPlus1N - 1)) / (r * r) +
      (pmt * nper) / (r * Math.pow(rPlus1, nper + 1)) -
      (fvValue * nper) / Math.pow(rPlus1, nper + 1);

    if (Math.abs(f) < precision) {
      return numericResult(guess);
    }

    if (Math.abs(fPrime) < 1e-10) return nil();

    guess = guess - f / fPrime;

    if (guess < -0.99 || guess > 10) return nil();
  }

  return nil();
};

/**
 * %nper @rate @pmt @pv @fv - Calculate number of periods
 * Given rate, pmt, pv, and fv, solves for nper.
 *
 * Formula: nper = log((PMT - r*FV) / (PMT + r*PV)) / log(1 + r)
 *
 * @example
 * periods = "%nper ##0.05 ##-100 ##1000 ##0"  ; 5% rate, $100/period, $1000 PV
 */
export const nper: VerbFunction = (args) => {
  if (args.length < 4) return nil();

  const rateValue = toNumber(args[0]!);
  const pmt = toNumber(args[1]!);
  const pvValue = toNumber(args[2]!);
  const fvValue = toNumber(args[3]!);

  // Special case: rate is 0
  if (rateValue === 0) {
    if (pmt === 0) return nil();
    return numericResult(-(pvValue + fvValue) / pmt);
  }

  // nper = log((PMT - r*FV) / (PMT + r*PV)) / log(1 + r)
  const numerator = pmt - rateValue * fvValue;
  const denominator = pmt + rateValue * pvValue;

  if (denominator === 0) return nil();

  const ratio = numerator / denominator;
  if (ratio <= 0) return nil();

  const result = Math.log(ratio) / Math.log(1 + rateValue);
  if (!isFinite(result)) return nil();

  return numericResult(result);
};

/**
 * %depreciation @cost @salvage @life - Straight-line depreciation per period
 * Formula: (cost - salvage) / life
 *
 * @example
 * depr = "%depreciation ##10000 ##2000 ##5"  ; $10000 cost, $2000 salvage, 5 years
 * ; Returns 1600 (annual depreciation)
 */
export const depreciation: VerbFunction = (args) => {
  if (args.length < 3) return nil();

  const cost = toNumber(args[0]!);
  const salvage = toNumber(args[1]!);
  const life = toNumber(args[2]!);

  if (life <= 0) return nil();
  if (salvage > cost) return nil(); // Invalid when salvage exceeds cost

  const depreciationPerPeriod = (cost - salvage) / life;
  return numericResult(depreciationPerPeriod);
};

/**
 * %zscore @value @array - Calculate z-score (standard score) of a value relative to a dataset
 * Z-score = (value - mean) / standard_deviation
 *
 * The z-score indicates how many standard deviations a value is from the mean.
 * Positive z-score = above mean, Negative = below mean.
 *
 * Returns null if standard deviation is 0 (all values identical).
 *
 * @example
 * z = "%zscore ##85 @scores"  ; z-score of 85 in dataset [70, 75, 80, 85, 90]
 * ; mean = 80, std ≈ 7.07, z ≈ 0.707
 */
export const zscore: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const value = toNumber(args[0]!);
  const arr = extractNumericArray(args[1]!, context.source);

  if (!arr || arr.length === 0) return nil();

  // Calculate mean
  const mean = calculateMean(arr);

  // Calculate population standard deviation
  const sumSquaredDiff = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  const stdDev = Math.sqrt(sumSquaredDiff / arr.length);

  // Cannot compute z-score if all values are identical (std = 0)
  if (stdDev === 0) return nil();

  const zScore = (value - mean) / stdDev;

  if (!isFinite(zScore)) return nil();
  return numericResult(zScore);
};

// ─────────────────────────────────────────────────────────────────────────────
// Moving Average
// ─────────────────────────────────────────────────────────────────────────────

/**
 * %movingAvg @array ##windowSize - Rolling window average
 *
 * Computes a simple moving average over a numeric array.
 * First elements use partial window (available data only).
 * Non-numeric elements are treated as 0.
 * Window < 1 → T002. Non-array → T002.
 *
 * @example
 * smoothed = "%movingAvg @.prices ##3"
 * ; [10, 20, 30, 40, 50] → [10, 15, 20, 30, 40]
 */
export const movingAvg: VerbFunction = (args, context) => {
  if (args.length < 2) return nil();

  const values = extractNumericArray(args[0]!, context.source);
  if (!values || values.length === 0) return arr([]);

  const windowSize = Math.floor(toNumber(args[1]!));
  if (windowSize < 1) return nil();

  const result: unknown[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) {
      sum += values[j]!;
    }
    const count = i - start + 1;
    result.push(numericResult(sum / count));
  }

  return arr(result);
};
