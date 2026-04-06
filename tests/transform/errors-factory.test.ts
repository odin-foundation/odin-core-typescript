/**
 * Error Factory Function Tests
 *
 * Tests for the error factory functions in errors.ts.
 * These functions create standardized TransformError and TransformWarning objects.
 */

import { describe, it, expect } from 'vitest';
import {
  TransformErrorCodes,
  unknownVerbError,
  invalidVerbArgsError,
  lookupTableNotFoundError,
  lookupKeyNotFoundError,
  lookupKeyNotFoundWarning,
  sourcePathNotFoundError,
  invalidOutputFormatError,
  invalidModifierError,
  accumulatorOverflowError,
  loopSourceNotArrayError,
  positionOverflowError,
  positionOverflowWarning,
  configError,
  unknownRecordTypeError,
  unknownRecordTypeWarning,
  sourceMissingError,
  valueOverflowWarning,
  transformError,
  transformWarning,
} from '../../src/transform/errors.js';

describe('Transform Error Codes', () => {
  it('defines all standard error codes', () => {
    expect(TransformErrorCodes.T001_UNKNOWN_VERB).toBe('T001');
    expect(TransformErrorCodes.T002_INVALID_VERB_ARGS).toBe('T002');
    expect(TransformErrorCodes.T003_LOOKUP_TABLE_NOT_FOUND).toBe('T003');
    expect(TransformErrorCodes.T004_LOOKUP_KEY_NOT_FOUND).toBe('T004');
    expect(TransformErrorCodes.T005_SOURCE_PATH_NOT_FOUND).toBe('T005');
    expect(TransformErrorCodes.T006_INVALID_OUTPUT_FORMAT).toBe('T006');
    expect(TransformErrorCodes.T007_INVALID_MODIFIER).toBe('T007');
    expect(TransformErrorCodes.T008_ACCUMULATOR_OVERFLOW).toBe('T008');
    expect(TransformErrorCodes.T009_LOOP_SOURCE_NOT_ARRAY).toBe('T009');
    expect(TransformErrorCodes.T010_POSITION_OVERFLOW).toBe('T010');
  });

  it('defines extended error codes', () => {
    expect(TransformErrorCodes.CONFIG_ERROR).toBe('CONFIG_ERROR');
    expect(TransformErrorCodes.UNKNOWN_RECORD_TYPE).toBe('UNKNOWN_RECORD_TYPE');
    expect(TransformErrorCodes.TRANSFORM_ERROR).toBe('TRANSFORM_ERROR');
    expect(TransformErrorCodes.SOURCE_MISSING).toBe('SOURCE_MISSING');
    expect(TransformErrorCodes.VALUE_OVERFLOW).toBe('VALUE_OVERFLOW');
  });
});

describe('Error Factory Functions', () => {
  describe('unknownVerbError', () => {
    it('creates error with verb name', () => {
      const error = unknownVerbError('invalidVerb');
      expect(error.code).toBe('T001');
      expect(error.message).toContain('invalidVerb');
      expect(error.field).toBeUndefined();
    });

    it('includes field when provided', () => {
      const error = unknownVerbError('badVerb', 'output.field');
      expect(error.code).toBe('T001');
      expect(error.field).toBe('output.field');
    });
  });

  describe('invalidVerbArgsError', () => {
    it('creates error with argument details', () => {
      const error = invalidVerbArgsError('substring', '3', 1);
      expect(error.code).toBe('T002');
      expect(error.message).toContain('substring');
      expect(error.message).toContain('expected 3');
      expect(error.message).toContain('got 1');
    });

    it('includes field when provided', () => {
      const error = invalidVerbArgsError('add', '2+', 1, 'calc.result');
      expect(error.field).toBe('calc.result');
    });
  });

  describe('lookupTableNotFoundError', () => {
    it('creates error with table name', () => {
      const error = lookupTableNotFoundError('STATE_CODES');
      expect(error.code).toBe('T003');
      expect(error.message).toContain('STATE_CODES');
    });

    it('includes field when provided', () => {
      const error = lookupTableNotFoundError('MISSING', 'address.state');
      expect(error.field).toBe('address.state');
    });
  });

  describe('lookupKeyNotFoundError', () => {
    it('creates error with table and key', () => {
      const error = lookupKeyNotFoundError('STATUS', 'unknown');
      expect(error.code).toBe('T004');
      expect(error.message).toContain('STATUS');
      expect(error.message).toContain('unknown');
    });

    it('includes field when provided', () => {
      const error = lookupKeyNotFoundError('STATES', 'ZZ', 'address.state');
      expect(error.field).toBe('address.state');
    });
  });

  describe('lookupKeyNotFoundWarning', () => {
    it('creates warning with table and key', () => {
      const warning = lookupKeyNotFoundWarning('CODES', 'missing');
      expect(warning.code).toBe('T004');
      expect(warning.message).toContain('CODES');
      expect(warning.message).toContain('missing');
    });

    it('includes field when provided', () => {
      const warning = lookupKeyNotFoundWarning('TYPES', 'X', 'record.type');
      expect(warning.field).toBe('record.type');
    });
  });

  describe('sourcePathNotFoundError', () => {
    it('creates error with source path', () => {
      const error = sourcePathNotFoundError('data.items[0].name');
      expect(error.code).toBe('T005');
      expect(error.message).toContain('data.items[0].name');
      expect(error.sourcePath).toBe('data.items[0].name');
    });

    it('includes field when provided', () => {
      const error = sourcePathNotFoundError('missing.path', 'output.value');
      expect(error.field).toBe('output.value');
    });
  });

  describe('invalidOutputFormatError', () => {
    it('creates error with format name', () => {
      const error = invalidOutputFormatError('invalid-format');
      expect(error.code).toBe('T006');
      expect(error.message).toContain('invalid-format');
    });
  });

  describe('invalidModifierError', () => {
    it('creates error with modifier and format', () => {
      const error = invalidModifierError('unknownMod', 'json');
      expect(error.code).toBe('T007');
      expect(error.message).toContain('unknownMod');
      expect(error.message).toContain('json');
    });

    it('includes field when provided', () => {
      const error = invalidModifierError('badMod', 'xml', 'output');
      expect(error.field).toBe('output');
    });
  });

  describe('accumulatorOverflowError', () => {
    it('creates error with accumulator name and value', () => {
      const error = accumulatorOverflowError('runningTotal', 9999999999);
      expect(error.code).toBe('T008');
      expect(error.message).toContain('runningTotal');
      expect(error.message).toContain('9999999999');
    });

    it('includes field when provided', () => {
      const error = accumulatorOverflowError('sum', 1e15, 'totals.grand');
      expect(error.field).toBe('totals.grand');
    });
  });

  describe('loopSourceNotArrayError', () => {
    it('creates error with source path', () => {
      const error = loopSourceNotArrayError('data.item');
      expect(error.code).toBe('T009');
      expect(error.message).toContain('data.item');
      expect(error.sourcePath).toBe('data.item');
    });

    it('includes segment when provided', () => {
      const error = loopSourceNotArrayError('records', 'DETAIL');
      expect(error.segment).toBe('DETAIL');
    });
  });

  describe('positionOverflowError', () => {
    it('creates error with position, length, and line width', () => {
      const error = positionOverflowError(100, 50, 120);
      expect(error.code).toBe('T010');
      expect(error.message).toContain('100');
      expect(error.message).toContain('50');
      expect(error.message).toContain('120');
    });

    it('includes field when provided', () => {
      const error = positionOverflowError(80, 30, 100, 'fixedField');
      expect(error.field).toBe('fixedField');
    });
  });

  describe('positionOverflowWarning', () => {
    it('creates warning with position details', () => {
      const warning = positionOverflowWarning(90, 20, 100);
      expect(warning.code).toBe('T010');
      expect(warning.message).toContain('90');
      expect(warning.message).toContain('20');
      expect(warning.message).toContain('100');
    });

    it('includes field when provided', () => {
      const warning = positionOverflowWarning(95, 10, 100, 'overflowField');
      expect(warning.field).toBe('overflowField');
    });
  });
});

describe('Extended Error Factory Functions', () => {
  describe('configError', () => {
    it('creates error with custom message', () => {
      const error = configError('Missing required output format');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.message).toBe('Missing required output format');
    });
  });

  describe('unknownRecordTypeError', () => {
    it('creates error with discriminator value and record index', () => {
      const error = unknownRecordTypeError('X', 5);
      expect(error.code).toBe('UNKNOWN_RECORD_TYPE');
      expect(error.message).toContain('X');
      expect(error.message).toContain('5');
    });
  });

  describe('unknownRecordTypeWarning', () => {
    it('creates warning with discriminator value and record index', () => {
      const warning = unknownRecordTypeWarning('Y', 10);
      expect(warning.code).toBe('UNKNOWN_RECORD_TYPE');
      expect(warning.message).toContain('Y');
      expect(warning.message).toContain('10');
    });
  });

  describe('sourceMissingError', () => {
    it('creates error for missing required field', () => {
      const error = sourceMissingError('customer.name');
      expect(error.code).toBe('SOURCE_MISSING');
      expect(error.message).toContain('customer.name');
      expect(error.field).toBe('customer.name');
    });
  });

  describe('valueOverflowWarning', () => {
    it('creates warning for value exceeding length', () => {
      const warning = valueOverflowWarning('VeryLongValue', 5);
      expect(warning.code).toBe('VALUE_OVERFLOW');
      expect(warning.message).toContain('VeryLongValue');
      expect(warning.message).toContain('5');
    });

    it('includes field when provided', () => {
      const warning = valueOverflowWarning('TooLong', 10, 'shortField');
      expect(warning.field).toBe('shortField');
    });
  });

  describe('transformError', () => {
    it('creates general transform error', () => {
      const error = transformError('Something went wrong');
      expect(error.code).toBe('TRANSFORM_ERROR');
      expect(error.message).toBe('Something went wrong');
    });

    it('includes field when provided', () => {
      const error = transformError('Failed to process', 'output.data');
      expect(error.field).toBe('output.data');
    });
  });

  describe('transformWarning', () => {
    it('creates general transform warning', () => {
      const warning = transformWarning('Minor issue detected');
      expect(warning.code).toBe('TRANSFORM_ERROR');
      expect(warning.message).toBe('Minor issue detected');
    });

    it('includes field when provided', () => {
      const warning = transformWarning('Unusual value', 'record.status');
      expect(warning.field).toBe('record.status');
    });
  });
});

describe('Error Object Structure', () => {
  it('errors have correct shape', () => {
    const error = unknownVerbError('test', 'field');
    expect(typeof error.code).toBe('string');
    expect(typeof error.message).toBe('string');
    expect(typeof error.field).toBe('string');
  });

  it('warnings have correct shape', () => {
    const warning = lookupKeyNotFoundWarning('table', 'key', 'field');
    expect(typeof warning.code).toBe('string');
    expect(typeof warning.message).toBe('string');
    expect(typeof warning.field).toBe('string');
  });

  it('source path errors include sourcePath property', () => {
    const error = sourcePathNotFoundError('data.path');
    expect(error.sourcePath).toBe('data.path');
  });

  it('loop errors can include segment property', () => {
    const error = loopSourceNotArrayError('path', 'SEGMENT');
    expect(error.segment).toBe('SEGMENT');
  });
});
