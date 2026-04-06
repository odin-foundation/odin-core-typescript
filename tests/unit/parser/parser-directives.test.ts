/**
 * Parser Directive Tests
 *
 * Tests for trailing directives that can follow any ODIN value.
 * Syntax: field = value :directive1 value1 :directive2 value2
 *
 * Examples:
 * - field = @_line :pos 3 :len 8
 * - field = %parseDate @_line "YYYYMMDD" :pos 3 :len 8
 * - field = @name :trim :upper
 */

import { describe, it, expect } from 'vitest';
import { Odin, ParseError as _ParseError } from '../../../src/index.js';

describe('Parser Directives', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Basic Directive Parsing
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Basic Directive Parsing', () => {
    it('parses single directive with integer value', () => {
      const doc = Odin.parse('field = @_line :pos 3');
      const value = doc.get('field');
      expect(value).toBeDefined();
      expect(value?.type).toBe('reference');
      expect(value?.directives).toHaveLength(1);
      expect(value?.directives?.[0]).toEqual({ name: 'pos', value: 3 });
    });

    it('parses multiple directives with integer values', () => {
      const doc = Odin.parse('field = @_line :pos 3 :len 8');
      const value = doc.get('field');
      expect(value).toBeDefined();
      expect(value?.directives).toHaveLength(2);
      expect(value?.directives?.[0]).toEqual({ name: 'pos', value: 3 });
      expect(value?.directives?.[1]).toEqual({ name: 'len', value: 8 });
    });

    it('parses directive without value (flag)', () => {
      const doc = Odin.parse('field = @name :trim');
      const value = doc.get('field');
      expect(value?.directives).toHaveLength(1);
      expect(value?.directives?.[0]).toEqual({ name: 'trim' });
    });

    it('parses directive with string value', () => {
      const doc = Odin.parse('field = @value :format "ssn"');
      const value = doc.get('field');
      expect(value?.directives).toHaveLength(1);
      expect(value?.directives?.[0]).toEqual({ name: 'format', value: 'ssn' });
    });

    it('parses multiple mixed directives', () => {
      const doc = Odin.parse('field = @_line :pos 3 :len 8 :trim :format "date"');
      const value = doc.get('field');
      expect(value?.directives).toHaveLength(4);
      expect(value?.directives?.[0]).toEqual({ name: 'pos', value: 3 });
      expect(value?.directives?.[1]).toEqual({ name: 'len', value: 8 });
      expect(value?.directives?.[2]).toEqual({ name: 'trim' });
      expect(value?.directives?.[3]).toEqual({ name: 'format', value: 'date' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Directives with Different Value Types
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Directives with Different Value Types', () => {
    it('parses directives after string value', () => {
      const doc = Odin.parse('field = "hello" :upper');
      const value = doc.get('field');
      expect(value?.type).toBe('string');
      expect(value?.directives).toHaveLength(1);
      expect(value?.directives?.[0]).toEqual({ name: 'upper' });
    });

    it('parses directives after number value', () => {
      const doc = Odin.parse('field = #123.45 :decimals 2');
      const value = doc.get('field');
      expect(value?.type).toBe('number');
      expect(value?.directives).toHaveLength(1);
      expect(value?.directives?.[0]).toEqual({ name: 'decimals', value: 2 });
    });

    it('parses directives after integer value', () => {
      const doc = Odin.parse('field = ##42 :min 0 :max 100');
      const value = doc.get('field');
      expect(value?.type).toBe('integer');
      expect(value?.directives).toHaveLength(2);
    });

    it('parses directives on reference inside verb expression', () => {
      // Directives immediately follow the value they modify
      // Here :pos 3 :len 8 follows @_line, so they attach to @_line
      const doc = Odin.parse('field = %parseDate @_line :pos 3 :len 8 "YYYYMMDD"');
      const value = doc.get('field');
      expect(value?.type).toBe('verb');
      // The verb itself doesn't have directives
      expect(value?.directives).toBeUndefined();
      // The directives are on the first arg (the reference)
      const verbValue = value as { args: Array<{ type: string; directives?: unknown[] }> };
      expect(verbValue.args[0]?.directives).toHaveLength(2);
    });

    it('parses directives after nested verb expression (on inner reference)', () => {
      // Directives attach to the value they immediately follow (FWF use case)
      // Here :pos 3 :len 6 is placed after @_line, so it attaches to @_line
      const doc = Odin.parse('field = %divide %coerceNumber @_line :pos 3 :len 6 ##100');
      const value = doc.get('field');
      expect(value?.type).toBe('verb');
      // The outer verb doesn't have directives - they're on the inner @_line
      expect(value?.directives).toBeUndefined();
      // The directives are on the inner reference
      const verbValue = value as {
        args: Array<{ type: string; args?: Array<{ directives?: unknown[] }> }>;
      };
      const innerVerb = verbValue.args[0];
      expect(innerVerb?.args?.[0]?.directives).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Directives Combined with Modifiers
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Directives Combined with Modifiers', () => {
    it('parses modifiers and directives together', () => {
      const doc = Odin.parse('field = !@value :trim');
      const value = doc.get('field');
      expect(value?.modifiers?.required).toBe(true);
      expect(value?.directives).toHaveLength(1);
      expect(value?.directives?.[0]).toEqual({ name: 'trim' });
    });

    it('parses confidential modifier with directives', () => {
      const doc = Odin.parse('ssn = *@_line :pos 10 :len 9 :format "ssn"');
      const value = doc.get('ssn');
      expect(value?.modifiers?.confidential).toBe(true);
      expect(value?.directives).toHaveLength(3);
    });

    it('parses all modifiers with directives', () => {
      const doc = Odin.parse('field = !*-@value :pos 0 :len 5');
      const value = doc.get('field');
      expect(value?.modifiers?.required).toBe(true);
      expect(value?.modifiers?.confidential).toBe(true);
      expect(value?.modifiers?.deprecated).toBe(true);
      expect(value?.directives).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles no directives (empty directives array)', () => {
      const doc = Odin.parse('field = @value');
      const value = doc.get('field');
      expect(value?.directives).toBeUndefined();
    });

    it('handles directive at end of line before comment', () => {
      const doc = Odin.parse('field = @_line :pos 3 ; extract from position 3');
      const value = doc.get('field');
      expect(value?.directives).toHaveLength(1);
      expect(value?.directives?.[0]).toEqual({ name: 'pos', value: 3 });
    });

    it('handles negative integer directive values', () => {
      const doc = Odin.parse('field = @array :index -1');
      const value = doc.get('field');
      expect(value?.directives?.[0]).toEqual({ name: 'index', value: -1 });
    });

    it('handles directive with unquoted identifier value', () => {
      const doc = Odin.parse('field = @value :type string');
      const value = doc.get('field');
      expect(value?.directives?.[0]).toEqual({ name: 'type', value: 'string' });
    });
  });
});
