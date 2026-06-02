/**
 * Unit tests for the encoding/web and markup string verbs:
 * encoding: base64urlEncode, base64urlDecode, hmac, parseUrl, parseQuery,
 *           buildQuery, buildUrl
 * string:   escapeHtml, unescapeHtml, escapeXml, stripTags, template
 */
import { describe, it, expect } from 'vitest';
import { callVerb, callVerbString, str, obj, nil } from './helpers.js';

describe('encoding/web verbs', () => {
  describe('base64urlEncode / base64urlDecode', () => {
    it('produces URL-safe output without padding', () => {
      const enc = callVerbString('base64urlEncode', [str('hello world?>>')]);
      expect(enc).not.toMatch(/[+/=]/);
    });
    it('round-trips through decode', () => {
      const original = 'hello world?>>';
      const enc = callVerb('base64urlEncode', [str(original)]);
      expect(callVerbString('base64urlDecode', [enc])).toBe(original);
    });
    it('returns null with no arguments', () => {
      expect(callVerb('base64urlEncode', []).type).toBe('null');
    });
  });

  describe('hmac', () => {
    it('is deterministic for the same message and key', () => {
      const a = callVerbString('hmac', [str('message'), str('secret')]);
      const b = callVerbString('hmac', [str('message'), str('secret')]);
      expect(a).toBe(b);
    });
    it('produces a 64-character lowercase hex digest for sha256', () => {
      const h = callVerbString('hmac', [str('message'), str('secret')]);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
    it('differs when the key differs', () => {
      const a = callVerbString('hmac', [str('message'), str('secret')]);
      const b = callVerbString('hmac', [str('message'), str('other')]);
      expect(a).not.toBe(b);
    });
    it('supports an explicit algorithm', () => {
      const h = callVerbString('hmac', [str('message'), str('secret'), str('sha1')]);
      expect(h).toMatch(/^[0-9a-f]{40}$/);
    });
    it('returns null when the key is missing', () => {
      expect(callVerb('hmac', [str('message')]).type).toBe('null');
    });
  });

  describe('parseUrl', () => {
    it('splits a URL into components with sorted query keys', () => {
      const u = callVerb('parseUrl', [str('https://example.com:8080/a/b?z=1&a=2#frag')]);
      expect(u.value).toEqual({
        scheme: 'https',
        host: 'example.com',
        port: 8080,
        path: '/a/b',
        query: { a: '2', z: '1' },
        fragment: 'frag',
      });
    });
    it('uses null port when none is present', () => {
      const u = callVerb('parseUrl', [str('https://example.com/x')]);
      expect((u.value as Record<string, unknown>).port).toBeNull();
    });
    it('returns null for an invalid URL', () => {
      expect(callVerb('parseUrl', [str('not a url')]).type).toBe('null');
    });
  });

  describe('parseQuery', () => {
    it('parses a query string with sorted keys', () => {
      const q = callVerb('parseQuery', [str('z=1&a=2')]);
      expect(q.value).toEqual({ a: '2', z: '1' });
    });
    it('tolerates a leading question mark', () => {
      const q = callVerb('parseQuery', [str('?a=2')]);
      expect(q.value).toEqual({ a: '2' });
    });
  });

  describe('buildQuery', () => {
    it('serializes an object with keys sorted', () => {
      expect(callVerbString('buildQuery', [obj({ z: 1, a: 2 })])).toBe('a=2&z=1');
    });
    it('skips null values', () => {
      expect(callVerbString('buildQuery', [obj({ a: 1, b: null })])).toBe('a=1');
    });
  });

  describe('buildUrl', () => {
    it('is the inverse of parseUrl', () => {
      const built = callVerbString('buildUrl', [
        obj({
          scheme: 'https',
          host: 'example.com',
          port: 8080,
          path: '/a/b',
          query: { z: 1, a: 2 },
          fragment: 'frag',
        }),
      ]);
      expect(built).toBe('https://example.com:8080/a/b?a=2&z=1#frag');
    });
    it('returns null when scheme or host is missing', () => {
      expect(callVerb('buildUrl', [obj({ host: 'example.com' })]).type).toBe('null');
    });
  });
});

describe('markup string verbs', () => {
  describe('escapeHtml', () => {
    it('escapes the five special characters', () => {
      expect(callVerbString('escapeHtml', [str(`<a href="x">&'`)])).toBe(
        '&lt;a href=&quot;x&quot;&gt;&amp;&#39;'
      );
    });
  });

  describe('unescapeHtml', () => {
    it('round-trips with escapeHtml', () => {
      const original = `<a href="x">&'`;
      const escaped = callVerb('escapeHtml', [str(original)]);
      expect(callVerbString('unescapeHtml', [escaped])).toBe(original);
    });
    it('decodes numeric and hex references', () => {
      expect(callVerbString('unescapeHtml', [str('&#65;&#x42;')])).toBe('AB');
    });
  });

  describe('escapeXml', () => {
    it("uses &apos; for the apostrophe", () => {
      expect(callVerbString('escapeXml', [str(`'<>`)])).toBe('&apos;&lt;&gt;');
    });
  });

  describe('stripTags', () => {
    it('removes tags and keeps text', () => {
      expect(callVerbString('stripTags', [str('<p>Hello <b>world</b></p>')])).toBe('Hello world');
    });
  });

  describe('template', () => {
    it('substitutes placeholders from an object', () => {
      expect(
        callVerbString('template', [str('Hi {name}, you are {age}'), obj({ name: 'Ada', age: 36 })])
      ).toBe('Hi Ada, you are 36');
    });
    it('renders missing keys as empty strings', () => {
      expect(callVerbString('template', [str('a{missing}b'), obj({})])).toBe('ab');
    });
    it('returns null without a data object', () => {
      expect(callVerb('template', [str('x')]).type).toBe('null');
    });
  });
});
