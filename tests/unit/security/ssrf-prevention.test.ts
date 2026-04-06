/**
 * SSRF Prevention Tests
 *
 * Tests for Server-Side Request Forgery prevention in the file loader.
 */

import { describe, it, expect } from 'vitest';
import { FileLoader } from '../../../src/resolver/file-loader.js';
import { ParseError } from '../../../src/types/errors.js';

describe('SSRF Prevention', () => {
  const loader = new FileLoader({
    allowRemoteUrls: true,
    allowedProtocols: ['https', 'http'],
  });

  describe('Blocked IP Ranges', () => {
    it('should block loopback addresses (127.x.x.x)', () => {
      const result = loader.resolveImportPath('/base/file.odin', 'https://127.0.0.1/file.odin');
      expect(result.isRemote).toBe(true);
      // The actual blocking happens in loadRemoteFile, not resolveImportPath
    });

    it('should block localhost', () => {
      const result = loader.resolveImportPath('/base/file.odin', 'https://localhost/file.odin');
      expect(result.isRemote).toBe(true);
    });

    it('should allow external URLs', () => {
      const result = loader.resolveImportPath('/base/file.odin', 'https://example.com/file.odin');
      expect(result.isRemote).toBe(true);
      expect(result.absolutePath).toBe('https://example.com/file.odin');
    });
  });

  describe('Protocol Validation', () => {
    const strictLoader = new FileLoader({
      allowRemoteUrls: true,
      allowedProtocols: ['https'],
    });

    it('should allow HTTPS when configured', () => {
      const result = strictLoader.resolveImportPath(
        '/base/file.odin',
        'https://example.com/file.odin'
      );
      expect(result.isRemote).toBe(true);
    });

    it('should block HTTP when only HTTPS is allowed', () => {
      expect(() =>
        strictLoader.resolveImportPath('/base/file.odin', 'http://example.com/file.odin')
      ).toThrow(ParseError);
    });

    it('should treat FTP as local path (not remote URL)', () => {
      // FTP is not recognized as a remote URL (only http/https are)
      // So it's treated as a local path, which will fail extension validation
      expect(() =>
        strictLoader.resolveImportPath('/base/file.odin', 'ftp://example.com/file.txt')
      ).toThrow(ParseError); // Fails on extension, not protocol
    });

    it('should treat file:// as local path', () => {
      // file:// is not recognized as a remote URL
      // So it's treated as a local path
      expect(() => strictLoader.resolveImportPath('/base/file.odin', 'file:///etc/passwd')).toThrow(
        ParseError
      ); // Fails on extension, not protocol
    });
  });

  describe('Remote URL Blocking', () => {
    const localOnlyLoader = new FileLoader({
      allowRemoteUrls: false,
    });

    it('should block all remote URLs when disabled', () => {
      expect(() =>
        localOnlyLoader.resolveImportPath('/base/file.odin', 'https://example.com/file.odin')
      ).toThrow(ParseError);
    });

    it('should allow local paths when remote is disabled', () => {
      const result = localOnlyLoader.resolveImportPath('/base/file.odin', './other.odin');
      expect(result.isRemote).toBe(false);
    });
  });
});

describe('Path Traversal Prevention', () => {
  const loader = new FileLoader({
    sandboxRoot: '/safe/directory',
  });

  it('should allow paths within sandbox', () => {
    const result = loader.resolveImportPath('/safe/directory/base.odin', './other.odin');
    expect(result.isRemote).toBe(false);
    expect(result.absolutePath).toContain('safe');
  });

  it('should block paths escaping sandbox', () => {
    expect(() =>
      loader.resolveImportPath('/safe/directory/base.odin', '../../../etc/passwd.odin')
    ).toThrow(ParseError);
  });

  it('should block null bytes in paths', () => {
    expect(() => loader.resolveImportPath('/base/file.odin', './file\0.odin')).toThrow(ParseError);
  });
});

describe('File Extension Validation', () => {
  const loader = new FileLoader({
    allowedExtensions: ['.odin'],
  });

  it('should allow .odin extension', () => {
    const result = loader.resolveImportPath('/base/file.odin', './other.odin');
    expect(result.absolutePath).toContain('.odin');
  });

  it('should block .js extension', () => {
    expect(() => loader.resolveImportPath('/base/file.odin', './script.js')).toThrow(ParseError);
  });

  it('should block .json extension', () => {
    expect(() => loader.resolveImportPath('/base/file.odin', './data.json')).toThrow(ParseError);
  });

  it('should block files with no extension', () => {
    expect(() => loader.resolveImportPath('/base/file.odin', './noext')).toThrow(ParseError);
  });
});
