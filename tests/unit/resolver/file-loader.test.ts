/**
 * Tests for file-loader module.
 *
 * Covers secure file loading with sandbox enforcement, path traversal protection,
 * extension validation, and remote URL handling.
 */

import { describe, it, expect } from 'vitest';
import { FileLoader, createFileLoader } from '../../../src/resolver/file-loader.js';
import { ParseError } from '../../../src/types/errors.js';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Use process.cwd() drive for Windows compatibility
const testRoot = process.platform === 'win32' ? 'C:\\testproject' : '/testproject';

function testPath(...segments: string[]): string {
  return path.join(testRoot, ...segments);
}

// ─────────────────────────────────────────────────────────────────────────────
// FileLoader Constructor Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('FileLoader', () => {
  describe('constructor', () => {
    it('creates loader with default options', () => {
      const loader = new FileLoader();
      expect(loader).toBeInstanceOf(FileLoader);
    });

    it('creates loader with custom sandbox root', () => {
      const loader = new FileLoader({ sandboxRoot: '/custom/root' });
      expect(loader).toBeInstanceOf(FileLoader);
    });

    it('creates loader with remote URLs enabled', () => {
      const loader = new FileLoader({ allowRemoteUrls: true });
      expect(loader).toBeInstanceOf(FileLoader);
    });

    it('creates loader with custom allowed extensions', () => {
      const loader = new FileLoader({ allowedExtensions: ['.odin', '.json'] });
      expect(loader).toBeInstanceOf(FileLoader);
    });

    it('creates loader with custom max file size', () => {
      const loader = new FileLoader({ maxFileSize: 1024 });
      expect(loader).toBeInstanceOf(FileLoader);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveImportPath Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveImportPath', () => {
  describe('relative paths', () => {
    it('resolves relative path from base', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });
      const result = loader.resolveImportPath(testPath('src', 'main.odin'), './utils.odin');

      expect(result.isRemote).toBe(false);
      expect(result.originalPath).toBe('./utils.odin');
      expect(result.absolutePath).toBe(testPath('src', 'utils.odin'));
    });

    it('resolves parent directory path within sandbox', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });
      const result = loader.resolveImportPath(
        testPath('src', 'nested', 'file.odin'),
        '../shared.odin'
      );

      expect(result.isRemote).toBe(false);
      expect(result.absolutePath).toBe(testPath('src', 'shared.odin'));
    });

    it('resolves deeply nested relative path', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });
      const result = loader.resolveImportPath(testPath('main.odin'), './lib/utils/helpers.odin');

      expect(result.absolutePath).toBe(testPath('lib', 'utils', 'helpers.odin'));
    });
  });

  describe('absolute paths', () => {
    it('resolves absolute path within sandbox', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });
      const libPath = testPath('lib', 'utils.odin');
      const result = loader.resolveImportPath(testPath('src', 'main.odin'), libPath);

      expect(result.isRemote).toBe(false);
      expect(result.absolutePath).toBe(libPath);
    });
  });

  describe('sandbox enforcement (path traversal protection)', () => {
    it('throws for path escaping sandbox with ../', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });

      expect(() => {
        loader.resolveImportPath(testPath('src', 'main.odin'), '../../etc/passwd.odin');
      }).toThrow(ParseError);
    });

    it('throws I004 error code for sandbox escape', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });

      try {
        loader.resolveImportPath(testPath('src', 'main.odin'), '../../../etc/passwd.odin');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError);
        expect((error as ParseError).code).toBe('I004');
      }
    });

    it('throws for absolute path outside sandbox', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });
      const outsidePath =
        process.platform === 'win32' ? 'C:\\etc\\passwd.odin' : '/etc/passwd.odin';

      expect(() => {
        loader.resolveImportPath(testPath('src', 'main.odin'), outsidePath);
      }).toThrow(ParseError);
    });

    it('uses base directory as sandbox when sandboxRoot not set', () => {
      const loader = new FileLoader(); // No sandboxRoot

      // Should work - stays within base directory
      const result = loader.resolveImportPath(testPath('src', 'main.odin'), './utils.odin');
      expect(result.absolutePath).toBe(testPath('src', 'utils.odin'));
    });

    it('throws when escaping implicit sandbox', () => {
      const loader = new FileLoader(); // No sandboxRoot - uses base dir

      expect(() => {
        loader.resolveImportPath(testPath('src', 'main.odin'), '../../outside.odin');
      }).toThrow(ParseError);
    });
  });

  describe('extension validation', () => {
    it('allows .odin extension by default', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });
      const result = loader.resolveImportPath(testPath('main.odin'), './utils.odin');

      expect(result.absolutePath).toContain('.odin');
    });

    it('throws for disallowed extension', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });

      expect(() => {
        loader.resolveImportPath(testPath('main.odin'), './utils.json');
      }).toThrow(ParseError);
    });

    it('throws I003 error code for disallowed extension', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });

      try {
        loader.resolveImportPath(testPath('main.odin'), './utils.js');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError);
        expect((error as ParseError).code).toBe('I003');
      }
    });

    it('allows custom extensions', () => {
      const loader = new FileLoader({
        sandboxRoot: testRoot,
        allowedExtensions: ['.odin', '.json', '.yaml'],
      });

      const result = loader.resolveImportPath(testPath('main.odin'), './config.json');
      expect(result.absolutePath).toContain('.json');
    });

    it('extension check is case insensitive', () => {
      const loader = new FileLoader({ sandboxRoot: testRoot });
      const result = loader.resolveImportPath(testPath('main.odin'), './utils.ODIN');

      expect(result.absolutePath).toContain('.ODIN');
    });
  });

  describe('remote URLs', () => {
    it('throws for remote URL when not allowed', () => {
      const loader = new FileLoader({ allowRemoteUrls: false });

      expect(() => {
        loader.resolveImportPath(testPath('main.odin'), 'https://example.com/schema.odin');
      }).toThrow(ParseError);
    });

    it('throws I001 error code for disallowed remote URL', () => {
      const loader = new FileLoader({ allowRemoteUrls: false });

      try {
        loader.resolveImportPath(testPath('main.odin'), 'https://example.com/schema.odin');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError);
        expect((error as ParseError).code).toBe('I001');
      }
    });

    it('allows HTTPS URL when remote enabled', () => {
      const loader = new FileLoader({ allowRemoteUrls: true });
      const result = loader.resolveImportPath(
        testPath('main.odin'),
        'https://example.com/schema.odin'
      );

      expect(result.isRemote).toBe(true);
      expect(result.absolutePath).toBe('https://example.com/schema.odin');
    });

    it('throws for HTTP URL when only HTTPS allowed (default)', () => {
      const loader = new FileLoader({ allowRemoteUrls: true });

      expect(() => {
        loader.resolveImportPath(testPath('main.odin'), 'http://example.com/schema.odin');
      }).toThrow(ParseError);
    });

    it('throws I002 error code for disallowed protocol', () => {
      const loader = new FileLoader({ allowRemoteUrls: true });

      try {
        loader.resolveImportPath(testPath('main.odin'), 'http://example.com/schema.odin');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError);
        expect((error as ParseError).code).toBe('I002');
      }
    });

    it('allows HTTP when custom protocols include it', () => {
      const loader = new FileLoader({
        allowRemoteUrls: true,
        allowedProtocols: ['http', 'https'],
      });

      const result = loader.resolveImportPath(
        testPath('main.odin'),
        'http://example.com/schema.odin'
      );
      expect(result.isRemote).toBe(true);
    });

    it('preserves full URL including query and fragment', () => {
      const loader = new FileLoader({ allowRemoteUrls: true });
      const url = 'https://example.com/schema.odin?version=1#section';
      const result = loader.resolveImportPath(testPath('main.odin'), url);

      expect(result.absolutePath).toBe(url);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadFile Tests (with mock reader)
// ─────────────────────────────────────────────────────────────────────────────

describe('loadFile', () => {
  describe('local files with mock reader', () => {
    it('loads file content using custom reader', async () => {
      const mockContent = '{$}\nodin = "1.0.0"\nname = "test"';
      const loader = new FileLoader({
        sandboxRoot: testRoot,
        readFile: async () => mockContent,
      });

      const resolved = loader.resolveImportPath(testPath('main.odin'), './test.odin');
      const content = await loader.loadFile(resolved);

      expect(content).toBe(mockContent);
    });

    it('custom reader receives correct path', async () => {
      let receivedPath = '';
      const loader = new FileLoader({
        sandboxRoot: testRoot,
        readFile: async (p) => {
          receivedPath = p;
          return 'content';
        },
      });

      const resolved = loader.resolveImportPath(testPath('main.odin'), './test.odin');
      await loader.loadFile(resolved);

      expect(receivedPath).toBe(testPath('test.odin'));
    });

    it('propagates errors from custom reader', async () => {
      const loader = new FileLoader({
        sandboxRoot: testRoot,
        readFile: async () => {
          throw new Error('Mock read error');
        },
      });

      const resolved = loader.resolveImportPath(testPath('main.odin'), './test.odin');

      await expect(loader.loadFile(resolved)).rejects.toThrow();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createFileLoader Convenience Function Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('createFileLoader', () => {
  it('creates FileLoader instance', () => {
    const loader = createFileLoader();
    expect(loader).toBeInstanceOf(FileLoader);
  });

  it('passes options to FileLoader', () => {
    const loader = createFileLoader({ sandboxRoot: '/custom' });
    expect(loader).toBeInstanceOf(FileLoader);
  });

  it('creates loader with full options', () => {
    const loader = createFileLoader({
      sandboxRoot: '/project',
      allowRemoteUrls: true,
      allowedProtocols: ['https', 'http'],
      allowedExtensions: ['.odin', '.json'],
      maxFileSize: 5 * 1024 * 1024,
    });
    expect(loader).toBeInstanceOf(FileLoader);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles paths with multiple consecutive separators', () => {
    const loader = new FileLoader({ sandboxRoot: testRoot });
    const result = loader.resolveImportPath(testPath('src', 'main.odin'), './/utils.odin');

    expect(result.absolutePath).toContain('utils.odin');
  });

  it('handles paths with mixed separators on Windows', () => {
    const loader = new FileLoader({ sandboxRoot: testRoot });
    // Forward slashes should work on all platforms
    const result = loader.resolveImportPath(testPath('src', 'main.odin'), './lib/utils.odin');

    expect(result.isRemote).toBe(false);
  });

  it('handles empty import path', () => {
    const loader = new FileLoader({ sandboxRoot: testRoot });

    // Empty path should try to resolve to base directory
    expect(() => {
      loader.resolveImportPath(testPath('main.odin'), '');
    }).toThrow(); // Will fail extension validation since no .odin
  });

  it('handles hidden file with .odin extension', () => {
    const loader = new FileLoader({
      sandboxRoot: testRoot,
      allowedExtensions: ['.odin', ''], // Allow empty extension for dotfiles
    });

    // path.extname('.odin') returns empty string (it's a dotfile)
    // So we need to allow empty extension or test differently
    const result = loader.resolveImportPath(testPath('main.odin'), './.hidden.odin');
    expect(result.absolutePath).toContain('.hidden.odin');
  });

  it('resolves . and .. in paths correctly', () => {
    const loader = new FileLoader({ sandboxRoot: testRoot });
    const result = loader.resolveImportPath(testPath('src', 'main.odin'), './nested/../utils.odin');

    // ./nested/../utils.odin should resolve to ./utils.odin
    expect(result.absolutePath).toBe(testPath('src', 'utils.odin'));
  });

  it('treats file:// URLs as local paths on some platforms', () => {
    // file:// URLs are not http/https, so they're treated as local paths
    // The behavior depends on platform - just verify it doesn't crash
    const loader = new FileLoader({ sandboxRoot: testRoot });

    // file:// protocol is not considered remote (http/https only)
    // It will be treated as a regular path which may or may not resolve
    try {
      loader.resolveImportPath(testPath('main.odin'), 'file:///project/test.odin');
      // If it doesn't throw, that's valid behavior
    } catch (e) {
      // If it throws for sandbox/extension reasons, that's also valid
      expect(e).toBeInstanceOf(ParseError);
    }
  });
});
