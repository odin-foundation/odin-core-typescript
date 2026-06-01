/**
 * Chain overlay (current-state computation) tests for ODIN SDK.
 *
 * Tests for Odin.collapseChain:
 * - Path replacement across documents
 * - Null field removal
 * - Array clearing
 * - Metadata isolation
 * - Multi-document chains
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Chain Overlay', () => {
  describe('Replace', () => {
    it('replaces a repeated path with the later value', () => {
      const doc = Odin.collapseChain('{p}\nname = "A"\n\n---\n\n{p}\nname = "B"');
      expect(Odin.toJSON(doc)).toContain('"B"');
      expect((doc.get('p.name') as any).value).toBe('B');
    });

    it('keeps untouched paths from earlier documents', () => {
      const doc = Odin.collapseChain('{p}\nname = "A"\nkeep = "x"\n\n---\n\n{p}\nname = "B"');
      expect((doc.get('p.keep') as any).value).toBe('x');
      expect((doc.get('p.name') as any).value).toBe('B');
    });

    it('adds new paths introduced by later documents', () => {
      const doc = Odin.collapseChain('{p}\nname = "A"\n\n---\n\n{p}\nextra = "new"');
      expect((doc.get('p.extra') as any).value).toBe('new');
    });
  });

  describe('Null removal', () => {
    it('removes a field set to null in a later document', () => {
      const doc = Odin.collapseChain('{p}\nname = "A"\nold = "gone"\n\n---\n\n{p}\nold = ~');
      expect(doc.get('p.old')).toBeUndefined();
      expect((doc.get('p.name') as any).value).toBe('A');
    });

    it('removes nested descendants when a parent path is nulled', () => {
      const doc = Odin.collapseChain('{p}\na.b = "x"\na.c = "y"\nkeep = "z"\n\n---\n\n{p}\na = ~');
      expect(doc.get('p.a.b')).toBeUndefined();
      expect(doc.get('p.a.c')).toBeUndefined();
      expect((doc.get('p.keep') as any).value).toBe('z');
    });

    it('allows a removed field to be reassigned later', () => {
      const doc = Odin.collapseChain('{p}\nx = "old"\n\n---\n\n{p}\nx = ~\n\n---\n\n{p}\nx = "new"');
      expect((doc.get('p.x') as any).value).toBe('new');
    });
  });

  describe('Array clear', () => {
    it('clears all elements of an array', () => {
      const doc = Odin.collapseChain(
        '{p}\ntags[0] = "x"\ntags[1] = "y"\nkeep = "z"\n\n---\n\n{p}\ntags[] = ~'
      );
      expect(doc.get('p.tags[0]')).toBeUndefined();
      expect(doc.get('p.tags[1]')).toBeUndefined();
      expect((doc.get('p.keep') as any).value).toBe('z');
    });

    it('allows repopulating an array after clearing', () => {
      const doc = Odin.collapseChain(
        '{p}\ntags[0] = "x"\n\n---\n\n{p}\ntags[] = ~\n\n---\n\n{p}\ntags[0] = "fresh"'
      );
      expect((doc.get('p.tags[0]') as any).value).toBe('fresh');
    });
  });

  describe('Metadata isolation', () => {
    it('carries only the final document metadata', () => {
      const doc = Odin.collapseChain(
        '{$}\nid = "first"\nrole = "base"\n\n{p}\nn = "A"\n\n---\n\n{$}\nid = "second"\n\n{p}\nn = "B"'
      );
      expect((doc.get('$.id') as any).value).toBe('second');
      expect(doc.get('$.role')).toBeUndefined();
    });
  });

  describe('Multi-document chains', () => {
    it('resolves a three-document chain to the last value', () => {
      const doc = Odin.collapseChain('{p}\nv = "1"\n\n---\n\n{p}\nv = "2"\n\n---\n\n{p}\nv = "3"');
      expect((doc.get('p.v') as any).value).toBe('3');
    });

    it('returns a single document unchanged', () => {
      const doc = Odin.collapseChain('{p}\nv = "1"');
      expect((doc.get('p.v') as any).value).toBe('1');
    });

    it('accepts a pre-parsed document array', () => {
      const docs = Odin.parseDocuments('{p}\nv = "1"\n\n---\n\n{p}\nv = "2"');
      const doc = Odin.collapseChain(docs);
      expect((doc.get('p.v') as any).value).toBe('2');
    });
  });
});
