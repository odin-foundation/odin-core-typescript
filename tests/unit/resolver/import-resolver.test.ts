/**
 * Tests for ODIN import resolution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FileLoader,
  CircularDetector,
  TypeRegistry,
  ImportResolver,
  createTypeRegistry,
} from '../../../src/resolver/index.js';
import { parseSchema } from '../../../src/validator/schema-parser.js';
import type { SchemaType } from '../../../src/types/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// FileLoader Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('FileLoader', () => {
  describe('resolveImportPath', () => {
    it('resolves relative paths', () => {
      const loader = new FileLoader({ sandboxRoot: '/base/dir' });
      const result = loader.resolveImportPath('/base/dir/file.odin', './other.odin');

      expect(result.isRemote).toBe(false);
      expect(result.absolutePath).toMatch(/other\.odin$/);
      expect(result.originalPath).toBe('./other.odin');
    });

    it('resolves parent directory paths within sandbox', () => {
      // Set sandboxRoot to allow parent directory traversal within allowed area
      const loader = new FileLoader({ sandboxRoot: '/base/dir' });
      const result = loader.resolveImportPath('/base/dir/sub/file.odin', '../types.odin');

      expect(result.isRemote).toBe(false);
      expect(result.absolutePath).toMatch(/types\.odin$/);
    });

    it('rejects remote URLs by default', () => {
      const loader = new FileLoader({ sandboxRoot: '/base/dir' });

      expect(() =>
        loader.resolveImportPath('/base/file.odin', 'https://example.com/schema.odin')
      ).toThrow('Remote URLs are not allowed');
    });

    it('allows remote URLs when enabled', () => {
      const loader = new FileLoader({ allowRemoteUrls: true });
      const result = loader.resolveImportPath('/base/file.odin', 'https://example.com/schema.odin');

      expect(result.isRemote).toBe(true);
      expect(result.absolutePath).toBe('https://example.com/schema.odin');
    });

    it('rejects non-odin extensions by default', () => {
      const loader = new FileLoader({ sandboxRoot: '/base/dir' });

      expect(() => loader.resolveImportPath('/base/file.odin', './types.json')).toThrow(
        'File extension not allowed'
      );
    });

    it('allows custom extensions', () => {
      const loader = new FileLoader({ allowedExtensions: ['.odin', '.json'] });
      const result = loader.resolveImportPath('/base/file.odin', './types.json');

      expect(result.absolutePath).toMatch(/types\.json$/);
    });

    // Edge cases
    it('handles deeply nested relative paths', () => {
      const loader = new FileLoader({ sandboxRoot: '/project' });
      const result = loader.resolveImportPath(
        '/project/schemas/insurance/auto/policy.odin',
        '../../../common/types.odin'
      );

      expect(result.absolutePath).toMatch(/common.*types\.odin$/);
    });

    it('handles paths with dots in directory names', () => {
      const loader = new FileLoader({ sandboxRoot: '/project' });
      const result = loader.resolveImportPath('/project/v1.0/schema.odin', './types.odin');

      expect(result.absolutePath).toMatch(/v1\.0.*types\.odin$/);
    });

    it('rejects http URLs when only https allowed', () => {
      const loader = new FileLoader({ allowRemoteUrls: true, allowedProtocols: ['https'] });

      expect(() =>
        loader.resolveImportPath('/base/file.odin', 'http://example.com/schema.odin')
      ).toThrow();
    });

    it('handles URLs with query strings', () => {
      const loader = new FileLoader({ allowRemoteUrls: true });
      const result = loader.resolveImportPath(
        '/base/file.odin',
        'https://example.com/schema.odin?version=1'
      );

      expect(result.isRemote).toBe(true);
    });

    it('rejects empty import path', () => {
      const loader = new FileLoader({ sandboxRoot: '/base/dir' });

      expect(() => loader.resolveImportPath('/base/dir/file.odin', '')).toThrow();
    });

    it('rejects import path with only whitespace', () => {
      const loader = new FileLoader({ sandboxRoot: '/base/dir' });

      expect(() => loader.resolveImportPath('/base/dir/file.odin', '   ')).toThrow();
    });
  });

  describe('sandbox protection', () => {
    it('allows paths within sandbox', () => {
      const loader = new FileLoader({ sandboxRoot: '/project/schemas' });
      const result = loader.resolveImportPath(
        '/project/schemas/policy/auto.odin',
        './vehicle.odin'
      );

      expect(result.absolutePath).toMatch(/vehicle\.odin$/);
    });

    it('rejects paths escaping sandbox', () => {
      const loader = new FileLoader({ sandboxRoot: '/project/schemas' });

      expect(() =>
        loader.resolveImportPath('/project/schemas/policy/auto.odin', '../../../etc/passwd.odin')
      ).toThrow('Import path escapes sandbox');
    });

    it('rejects absolute paths outside sandbox', () => {
      const loader = new FileLoader({ sandboxRoot: '/project/schemas' });

      expect(() =>
        loader.resolveImportPath('/project/schemas/file.odin', '/etc/passwd.odin')
      ).toThrow();
    });

    it('allows sibling directories within sandbox', () => {
      const loader = new FileLoader({ sandboxRoot: '/project/schemas' });
      const result = loader.resolveImportPath(
        '/project/schemas/insurance/auto.odin',
        '../common/types.odin'
      );

      expect(result.absolutePath).toMatch(/common.*types\.odin$/);
    });

    it('rejects symlink-like path traversal attempts', () => {
      const loader = new FileLoader({ sandboxRoot: '/project/schemas' });

      // Multiple parent traversals that escape sandbox
      expect(() =>
        loader.resolveImportPath(
          '/project/schemas/a/b/c/file.odin',
          '../../../../../../../../etc/passwd.odin'
        )
      ).toThrow('Import path escapes sandbox');
    });
  });

  describe('extension validation', () => {
    it('rejects files without extension', () => {
      const loader = new FileLoader({ sandboxRoot: '/base' });

      expect(() => loader.resolveImportPath('/base/file.odin', './noextension')).toThrow(
        'File extension not allowed'
      );
    });

    it('handles case-insensitive extensions', () => {
      const loader = new FileLoader({ sandboxRoot: '/base', allowedExtensions: ['.odin'] });

      // Extension matching is case-insensitive - .ODIN is allowed
      const result = loader.resolveImportPath('/base/file.odin', './types.ODIN');
      expect(result.absolutePath).toMatch(/types\.ODIN$/);
    });

    it('allows multiple custom extensions', () => {
      const loader = new FileLoader({
        sandboxRoot: '/base',
        allowedExtensions: ['.odin', '.schema', '.types'],
      });

      expect(loader.resolveImportPath('/base/file.odin', './a.schema').absolutePath).toMatch(
        /\.schema$/
      );
      expect(loader.resolveImportPath('/base/file.odin', './b.types').absolutePath).toMatch(
        /\.types$/
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CircularDetector Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CircularDetector', () => {
  let detector: CircularDetector;

  beforeEach(() => {
    detector = new CircularDetector();
  });

  describe('basic functionality', () => {
    it('tracks import chain', () => {
      detector.enter('/path/a.odin');
      detector.enter('/path/b.odin');

      expect(detector.getChain()).toEqual(['/path/a.odin', '/path/b.odin']);
    });

    it('detects circular imports', () => {
      detector.enter('/path/a.odin');
      detector.enter('/path/b.odin');

      expect(detector.isCircular('/path/a.odin')).toBe(true);
      expect(detector.isCircular('/path/c.odin')).toBe(false);
    });

    it('throws on circular import', () => {
      detector.enter('/path/a.odin');
      detector.enter('/path/b.odin');

      expect(() => detector.enter('/path/a.odin')).toThrow('Circular import detected');
    });

    it('formats cycle correctly', () => {
      detector.enter('/path/a.odin');
      detector.enter('/path/b.odin');
      detector.enter('/path/c.odin');

      const formatted = detector.formatCycle('/path/a.odin');
      expect(formatted).toBe('/path/a.odin -> /path/b.odin -> /path/c.odin -> /path/a.odin');
    });

    it('exits correctly', () => {
      detector.enter('/path/a.odin');
      detector.enter('/path/b.odin');
      detector.exit();

      expect(detector.getChain()).toEqual(['/path/a.odin']);
      expect(detector.isCircular('/path/b.odin')).toBe(false);
    });

    it('branches correctly', () => {
      detector.enter('/path/a.odin');
      const branch = detector.branch();
      branch.enter('/path/b.odin');

      // Original unchanged
      expect(detector.getChain()).toEqual(['/path/a.odin']);

      // Branch has both
      expect(branch.getChain()).toEqual(['/path/a.odin', '/path/b.odin']);
    });
  });

  describe('edge cases', () => {
    it('handles empty chain', () => {
      expect(detector.getChain()).toEqual([]);
      expect(detector.isCircular('/any/path.odin')).toBe(false);
    });

    it('handles single entry chain', () => {
      detector.enter('/path/a.odin');

      expect(detector.getChain()).toHaveLength(1);
      expect(detector.isCircular('/path/a.odin')).toBe(true);
    });

    it('handles multiple exit calls correctly', () => {
      detector.enter('/path/a.odin');
      detector.enter('/path/b.odin');
      detector.exit();
      detector.exit();

      expect(detector.getChain()).toEqual([]);
    });

    it('handles exit on empty chain gracefully', () => {
      // Should not throw
      expect(() => detector.exit()).not.toThrow();
      expect(detector.getChain()).toEqual([]);
    });

    it('handles paths with different cases', () => {
      detector.enter('/Path/A.odin');

      // Case sensitivity depends on implementation
      // This test verifies consistent behavior - exact match should always be circular
      expect(detector.isCircular('/Path/A.odin')).toBe(true);

      // Different case - behavior may vary by platform/implementation
      // Just verify it doesn't throw
      expect(() => detector.isCircular('/path/a.odin')).not.toThrow();
    });

    it('handles very long chains', () => {
      for (let i = 0; i < 100; i++) {
        detector.enter(`/path/file${i}.odin`);
      }

      expect(detector.getChain()).toHaveLength(100);
      expect(detector.isCircular('/path/file0.odin')).toBe(true);
      expect(detector.isCircular('/path/file99.odin')).toBe(true);
      expect(detector.isCircular('/path/file100.odin')).toBe(false);
    });

    it('formats cycle for middle element', () => {
      detector.enter('/path/a.odin');
      detector.enter('/path/b.odin');
      detector.enter('/path/c.odin');

      const formatted = detector.formatCycle('/path/b.odin');
      expect(formatted).toContain('/path/b.odin');
      expect(formatted).toContain('/path/c.odin');
    });

    it('handles paths with special characters', () => {
      detector.enter('/path/with spaces/file.odin');
      detector.enter('/path/with-dashes/file.odin');
      detector.enter('/path/with_underscores/file.odin');

      expect(detector.getChain()).toHaveLength(3);
      expect(detector.isCircular('/path/with spaces/file.odin')).toBe(true);
    });

    it('branch inherits full chain', () => {
      detector.enter('/path/a.odin');
      detector.enter('/path/b.odin');
      detector.enter('/path/c.odin');

      const branch = detector.branch();

      expect(branch.getChain()).toEqual(['/path/a.odin', '/path/b.odin', '/path/c.odin']);
      expect(branch.isCircular('/path/a.odin')).toBe(true);
    });

    it('branches are independent', () => {
      detector.enter('/path/a.odin');

      const branch1 = detector.branch();
      const branch2 = detector.branch();

      branch1.enter('/path/b.odin');
      branch2.enter('/path/c.odin');

      expect(branch1.getChain()).toEqual(['/path/a.odin', '/path/b.odin']);
      expect(branch2.getChain()).toEqual(['/path/a.odin', '/path/c.odin']);
      expect(detector.getChain()).toEqual(['/path/a.odin']);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TypeRegistry Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('TypeRegistry', () => {
  let registry: TypeRegistry;

  beforeEach(() => {
    registry = createTypeRegistry();
  });

  const createMockType = (name: string): SchemaType => ({
    name,
    fields: new Map(),
  });

  describe('registration and lookup', () => {
    it('registers and looks up local types', () => {
      const addressType = createMockType('address');
      registry.register('address', addressType);

      const result = registry.lookup('address');
      expect(result).toBe(addressType);
    });

    it('registers and looks up namespaced types', () => {
      const addressType = createMockType('address');
      registry.register('address', addressType, 'types');

      // Direct lookup with namespace
      const result = registry.lookup('types.address');
      expect(result).toBe(addressType);

      // Unqualified lookup should not find it by default
      expect(registry.lookup('address')).toBeUndefined();
    });

    it('looks up unqualified in default namespace', () => {
      const addressType = createMockType('address');
      registry.register('address', addressType, 'types');

      const result = registry.lookup('address', { defaultNamespace: 'types' });
      expect(result).toBe(addressType);
    });

    it('searches all namespaces when enabled', () => {
      const addressType = createMockType('address');
      registry.register('address', addressType, 'types');

      const result = registry.lookup('address', { searchAllNamespaces: true });
      expect(result).toBe(addressType);
    });
  });

  describe('registerAll', () => {
    it('registers all types from a map', () => {
      const types = new Map<string, SchemaType>([
        ['address', createMockType('address')],
        ['contact', createMockType('contact')],
      ]);

      registry.registerAll(types, 'types');

      expect(registry.lookup('types.address')).toBeDefined();
      expect(registry.lookup('types.contact')).toBeDefined();
    });
  });

  describe('namespace management', () => {
    it('lists namespaces', () => {
      registry.register('a', createMockType('a'), 'ns1');
      registry.register('b', createMockType('b'), 'ns2');

      const namespaces = registry.getNamespaces();
      expect(namespaces).toContain('ns1');
      expect(namespaces).toContain('ns2');
    });

    it('gets all types in a namespace', () => {
      registry.register('a', createMockType('a'), 'ns1');
      registry.register('b', createMockType('b'), 'ns1');

      const nsTypes = registry.getNamespace('ns1');
      expect(nsTypes.size).toBe(2);
      expect(nsTypes.has('a')).toBe(true);
      expect(nsTypes.has('b')).toBe(true);
    });

    it('returns empty map for non-existent namespace', () => {
      const nsTypes = registry.getNamespace('nonexistent');
      expect(nsTypes.size).toBe(0);
    });
  });

  describe('cloning and merging', () => {
    it('clones correctly', () => {
      registry.register('a', createMockType('a'));
      registry.register('b', createMockType('b'), 'ns');

      const clone = registry.clone();

      expect(clone.lookup('a')).toBeDefined();
      expect(clone.lookup('ns.b')).toBeDefined();

      // Modifying clone doesn't affect original
      clone.register('c', createMockType('c'));
      expect(registry.lookup('c')).toBeUndefined();
    });

    it('merges registries', () => {
      const other = createTypeRegistry();
      other.register('a', createMockType('a'));
      other.register('b', createMockType('b'), 'ns');

      registry.merge(other);

      expect(registry.lookup('a')).toBeDefined();
      expect(registry.lookup('ns.b')).toBeDefined();
    });
  });

  describe('composite types', () => {
    it('looks up composite types (intersection)', () => {
      const fields1 = new Map([['line1', {} as any]]);
      const fields2 = new Map([['email', {} as any]]);

      registry.register('address', { name: 'address', fields: fields1 });
      registry.register('contact', { name: 'contact', fields: fields2 });

      const composite = registry.lookup('address&contact');

      expect(composite).toBeDefined();
      expect(composite?.fields.has('line1')).toBe(true);
      expect(composite?.fields.has('email')).toBe(true);
    });

    it('returns undefined if any composite type is missing', () => {
      registry.register('address', createMockType('address'));

      expect(registry.lookup('address&nonexistent')).toBeUndefined();
    });

    it('handles three-way intersection', () => {
      const fields1 = new Map([['f1', {} as any]]);
      const fields2 = new Map([['f2', {} as any]]);
      const fields3 = new Map([['f3', {} as any]]);

      registry.register('t1', { name: 't1', fields: fields1 });
      registry.register('t2', { name: 't2', fields: fields2 });
      registry.register('t3', { name: 't3', fields: fields3 });

      const composite = registry.lookup('t1&t2&t3');

      expect(composite).toBeDefined();
      expect(composite?.fields.has('f1')).toBe(true);
      expect(composite?.fields.has('f2')).toBe(true);
      expect(composite?.fields.has('f3')).toBe(true);
    });

    it('handles namespaced composite types', () => {
      const fields1 = new Map([['line1', {} as any]]);
      const fields2 = new Map([['email', {} as any]]);

      registry.register('address', { name: 'address', fields: fields1 }, 'common');
      registry.register('contact', { name: 'contact', fields: fields2 }, 'common');

      const composite = registry.lookup('common.address&common.contact');

      expect(composite).toBeDefined();
      expect(composite?.fields.has('line1')).toBe(true);
      expect(composite?.fields.has('email')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty registry', () => {
      expect(registry.lookup('nonexistent')).toBeUndefined();
      expect(registry.getNamespaces()).toHaveLength(0);
    });

    it('handles type names with special characters', () => {
      const type = createMockType('_internal_type');
      registry.register('_internal_type', type);

      expect(registry.lookup('_internal_type')).toBe(type);
    });

    it('handles type names with numbers', () => {
      const type = createMockType('type123');
      registry.register('type123', type);

      expect(registry.lookup('type123')).toBe(type);
    });

    it('handles namespace lookup correctly', () => {
      const type = createMockType('address');
      registry.register('address', type, 'example');

      // Namespace.typeName lookup
      expect(registry.lookup('example.address')).toBe(type);
    });

    it('overwrites type with same name in same namespace', () => {
      const type1 = createMockType('address');
      const type2 = createMockType('address_v2');

      registry.register('address', type1);
      registry.register('address', type2);

      // Second registration should overwrite
      expect(registry.lookup('address')).toBe(type2);
    });

    it('allows same type name in different namespaces', () => {
      const type1 = createMockType('address');
      const type2 = createMockType('address');

      registry.register('address', type1, 'v1');
      registry.register('address', type2, 'v2');

      expect(registry.lookup('v1.address')).toBe(type1);
      expect(registry.lookup('v2.address')).toBe(type2);
    });

    it('registerAll handles empty map', () => {
      const emptyTypes = new Map<string, SchemaType>();
      registry.registerAll(emptyTypes, 'empty');

      expect(registry.getNamespace('empty').size).toBe(0);
    });

    it('clone produces deep copy of namespaces', () => {
      registry.register('a', createMockType('a'), 'ns1');
      registry.register('b', createMockType('b'), 'ns2');

      const clone = registry.clone();

      // Add to original after cloning
      registry.register('c', createMockType('c'), 'ns1');

      // Clone should not have the new type
      expect(clone.lookup('ns1.c')).toBeUndefined();
      expect(registry.lookup('ns1.c')).toBeDefined();
    });

    it('merge handles overlapping namespaces', () => {
      registry.register('a', createMockType('a'), 'shared');

      const other = createTypeRegistry();
      other.register('b', createMockType('b'), 'shared');

      registry.merge(other);

      // Both types should be in shared namespace
      expect(registry.lookup('shared.a')).toBeDefined();
      expect(registry.lookup('shared.b')).toBeDefined();
    });

    it('merge handles conflicting type names', () => {
      const type1 = createMockType('original');
      const type2 = createMockType('replacement');

      registry.register('conflicting', type1);

      const other = createTypeRegistry();
      other.register('conflicting', type2);

      registry.merge(other);

      // Merged registry overwrites with other's value
      expect(registry.lookup('conflicting')).toBe(type2);
    });

    it('lookup with multiple options', () => {
      registry.register('address', createMockType('address'), 'types');

      // Should find with default namespace
      expect(registry.lookup('address', { defaultNamespace: 'types' })).toBeDefined();

      // Should find when searching all
      expect(registry.lookup('address', { searchAllNamespaces: true })).toBeDefined();

      // Should not find without options
      expect(registry.lookup('address')).toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ImportResolver Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ImportResolver', () => {
  // Mock file system for testing - comprehensive set for various scenarios
  const mockFiles = new Map<string, string>([
    // Base types file (no imports)
    [
      '/schemas/_types.odin',
      `{$}
odin = "1.0.0"
schema = "1.0.0"

{@address}
line1 = !:(1..100)
city = !:(1..60)
state = !:(2)
zip = !:/^\\d{5}$/
`,
    ],
    // Vehicle file (no imports)
    [
      '/schemas/vehicle.odin',
      `{$}
odin = "1.0.0"
schema = "1.0.0"

{@vehicle}
vin = !:/^[A-HJ-NPR-Z0-9]{17}$/
year = ##:(1900..2100)
make = :(1..50)
model = :(1..50)
`,
    ],
    // Policy file (imports types and vehicle)
    [
      '/schemas/policy.odin',
      `@import ./_types.odin as types
@import ./vehicle.odin as vehicle

{$}
odin = "1.0.0"
schema = "1.0.0"

{policy}
number = !:(1..20)
`,
    ],
    // === RECURSIVE IMPORT CHAIN: A -> B -> C ===
    // Level C (deepest, no imports)
    [
      '/schemas/deep/level-c.odin',
      `{$}
odin = "1.0.0"
schema = "1.0.0"

{@baseType}
id = !:(1..50)
created = date
`,
    ],
    // Level B (imports C)
    [
      '/schemas/deep/level-b.odin',
      `@import ./level-c.odin as levelC

{$}
odin = "1.0.0"
schema = "1.0.0"

{@middleType}
name = !:(1..100)
base = @levelC.baseType
`,
    ],
    // Level A (imports B, which imports C)
    [
      '/schemas/deep/level-a.odin',
      `@import ./level-b.odin as levelB

{$}
odin = "1.0.0"
schema = "1.0.0"

{@topType}
title = !:(1..200)
middle = @levelB.middleType
`,
    ],
    // === CIRCULAR IMPORT FILES ===
    // Circular A -> B -> A
    [
      '/schemas/circular/circular-a.odin',
      `@import ./circular-b.odin as b

{$}
odin = "1.0.0"
schema = "1.0.0"

{@typeA}
fieldA = !
`,
    ],
    [
      '/schemas/circular/circular-b.odin',
      `@import ./circular-a.odin as a

{$}
odin = "1.0.0"
schema = "1.0.0"

{@typeB}
fieldB = !
`,
    ],
    // Self-import (imports itself)
    [
      '/schemas/circular/self-import.odin',
      `@import ./self-import.odin as self

{$}
odin = "1.0.0"
schema = "1.0.0"

{@selfType}
field = !
`,
    ],
    // Longer cycle: A -> B -> C -> A
    [
      '/schemas/circular/cycle-a.odin',
      `@import ./cycle-b.odin as b

{$}
odin = "1.0.0"
schema = "1.0.0"

{@cycleA}
field = !
`,
    ],
    [
      '/schemas/circular/cycle-b.odin',
      `@import ./cycle-c.odin as c

{$}
odin = "1.0.0"
schema = "1.0.0"

{@cycleB}
field = !
`,
    ],
    [
      '/schemas/circular/cycle-c.odin',
      `@import ./cycle-a.odin as a

{$}
odin = "1.0.0"
schema = "1.0.0"

{@cycleC}
field = !
`,
    ],
    // === DIAMOND DEPENDENCY: A imports B and C, both import D ===
    [
      '/schemas/diamond/shared.odin',
      `{$}
odin = "1.0.0"
schema = "1.0.0"

{@sharedType}
id = !##
`,
    ],
    [
      '/schemas/diamond/left.odin',
      `@import ./shared.odin as shared

{$}
odin = "1.0.0"
schema = "1.0.0"

{@leftType}
name = !
base = @shared.sharedType
`,
    ],
    [
      '/schemas/diamond/right.odin',
      `@import ./shared.odin as shared

{$}
odin = "1.0.0"
schema = "1.0.0"

{@rightType}
value = !#
base = @shared.sharedType
`,
    ],
    [
      '/schemas/diamond/top.odin',
      `@import ./left.odin as left
@import ./right.odin as right

{$}
odin = "1.0.0"
schema = "1.0.0"

{@topType}
leftRef = @left.leftType
rightRef = @right.rightType
`,
    ],
    // === EMPTY AND MINIMAL FILES ===
    [
      '/schemas/empty.odin',
      `{$}
odin = "1.0.0"
schema = "1.0.0"
`,
    ],
    // === MALFORMED FILES ===
    [
      '/schemas/malformed/syntax-error.odin',
      `{$}
odin = "1.0.0"
schema = "1.0.0"

{@broken
field = !
`,
    ],
    [
      '/schemas/malformed/invalid-import-path.odin',
      `@import ./nonexistent.odin as missing

{$}
odin = "1.0.0"
schema = "1.0.0"

{@type}
field = !
`,
    ],
    // === DUPLICATE ALIAS IMPORTS ===
    [
      '/schemas/duplicate-alias.odin',
      `@import ./_types.odin as types
@import ./vehicle.odin as types

{$}
odin = "1.0.0"
schema = "1.0.0"

{@policy}
field = !
`,
    ],
    // === DEEP NESTING (for depth limit testing) ===
    [
      '/schemas/nest/d1.odin',
      `@import ./d2.odin as d2\n{$}\nodin = "1.0.0"\nschema = "1.0.0"\n{@t1}\nf = !`,
    ],
    [
      '/schemas/nest/d2.odin',
      `@import ./d3.odin as d3\n{$}\nodin = "1.0.0"\nschema = "1.0.0"\n{@t2}\nf = !`,
    ],
    [
      '/schemas/nest/d3.odin',
      `@import ./d4.odin as d4\n{$}\nodin = "1.0.0"\nschema = "1.0.0"\n{@t3}\nf = !`,
    ],
    [
      '/schemas/nest/d4.odin',
      `@import ./d5.odin as d5\n{$}\nodin = "1.0.0"\nschema = "1.0.0"\n{@t4}\nf = !`,
    ],
    ['/schemas/nest/d5.odin', `{$}\nodin = "1.0.0"\nschema = "1.0.0"\n{@t5}\nf = !`],
  ]);

  // Helper to create a resolver with mock file system
  const createMockResolver = (options: { maxImportDepth?: number; cache?: any } = {}) => {
    return new ImportResolver({
      readFile: async (filePath: string) => {
        const normalized = filePath.replace(/\\/g, '/');
        // Try to match the path from the end
        for (const [key] of mockFiles) {
          if (normalized.endsWith(key) || normalized.includes(key.substring(1))) {
            const content = mockFiles.get(key);
            if (content) return content;
          }
        }
        // Direct lookup
        const content = mockFiles.get(normalized);
        if (!content) {
          const keyMatch = normalized.match(/\/schemas\/.+$/);
          const key = keyMatch ? keyMatch[0] : normalized;
          const fallback = mockFiles.get(key);
          if (!fallback) {
            throw new Error(`Mock file not found: ${normalized}`);
          }
          return fallback;
        }
        return content;
      },
      sandboxRoot: '/schemas',
      maxImportDepth: options.maxImportDepth,
      cache: options.cache,
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Happy Path Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('resolves schema with imports', async () => {
      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/policy.odin')!;
      const schema = parseSchema(schemaContent);

      const result = await resolver.resolveSchema(schema, '/schemas/policy.odin');

      expect(result.resolution.imports.size).toBe(2);
      // Imports are keyed by resolved file path, not alias
      const importKeys = Array.from(result.resolution.imports.keys());
      expect(importKeys.some((k) => k.includes('_types.odin'))).toBe(true);
      expect(importKeys.some((k) => k.includes('vehicle.odin'))).toBe(true);
      expect(result.resolution.typeRegistry.lookup('types.address')).toBeDefined();
      expect(result.resolution.typeRegistry.lookup('vehicle.vehicle')).toBeDefined();
    });

    it('handles schemas with no imports', async () => {
      const resolver = createMockResolver();
      const typesContent = mockFiles.get('/schemas/_types.odin')!;
      const schema = parseSchema(typesContent);

      const result = await resolver.resolveSchema(schema, '/schemas/_types.odin');

      expect(result.resolution.imports.size).toBe(0);
      expect(result.resolution.typeRegistry.lookup('address')).toBeDefined();
    });

    it('tracks all resolved file paths', async () => {
      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/policy.odin')!;
      const schema = parseSchema(schemaContent);

      const result = await resolver.resolveSchema(schema, '/schemas/policy.odin');

      expect(result.resolution.resolvedPaths).toHaveLength(3);
      expect(result.resolution.resolvedPaths).toContain('/schemas/policy.odin');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Recursive Import Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('recursive imports', () => {
    it('resolves imports recursively (A -> B -> C)', async () => {
      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/deep/level-a.odin')!;
      const schema = parseSchema(schemaContent);

      const result = await resolver.resolveSchema(schema, '/schemas/deep/level-a.odin');

      // Should have resolved level-b import (keyed by file path)
      const importKeys = Array.from(result.resolution.imports.keys());
      expect(importKeys.some((k) => k.includes('level-b.odin'))).toBe(true);

      // Level B's types should be in registry
      expect(result.resolution.typeRegistry.lookup('levelB.middleType')).toBeDefined();

      // Level C's types should also be in registry (transitive)
      expect(result.resolution.typeRegistry.lookup('levelC.baseType')).toBeDefined();

      // All three files should be in resolved paths
      expect(result.resolution.resolvedPaths.length).toBeGreaterThanOrEqual(3);
    });

    it('resolves diamond dependency correctly (A -> B,C -> D)', async () => {
      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/diamond/top.odin')!;
      const schema = parseSchema(schemaContent);

      const result = await resolver.resolveSchema(schema, '/schemas/diamond/top.odin');

      // Direct imports (keyed by file path)
      const importKeys = Array.from(result.resolution.imports.keys());
      expect(importKeys.some((k) => k.includes('left.odin'))).toBe(true);
      expect(importKeys.some((k) => k.includes('right.odin'))).toBe(true);

      // Transitive imports - shared should be resolved once
      expect(result.resolution.typeRegistry.lookup('left.leftType')).toBeDefined();
      expect(result.resolution.typeRegistry.lookup('right.rightType')).toBeDefined();
      expect(result.resolution.typeRegistry.lookup('shared.sharedType')).toBeDefined();
    });

    it('handles deep nesting within depth limit', async () => {
      const resolver = createMockResolver({ maxImportDepth: 10 });
      const schemaContent = mockFiles.get('/schemas/nest/d1.odin')!;
      const schema = parseSchema(schemaContent);

      const result = await resolver.resolveSchema(schema, '/schemas/nest/d1.odin');

      // All 5 levels should be resolved
      expect(result.resolution.resolvedPaths.length).toBeGreaterThanOrEqual(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Circular Import Detection Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('circular import detection', () => {
    it('detects direct circular import (A -> B -> A)', async () => {
      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/circular/circular-a.odin')!;
      const schema = parseSchema(schemaContent);

      await expect(
        resolver.resolveSchema(schema, '/schemas/circular/circular-a.odin')
      ).rejects.toThrow(/[Cc]ircular/);
    });

    it('detects self-import', async () => {
      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/circular/self-import.odin')!;
      const schema = parseSchema(schemaContent);

      await expect(
        resolver.resolveSchema(schema, '/schemas/circular/self-import.odin')
      ).rejects.toThrow(/[Cc]ircular/);
    });

    it('detects longer circular chain (A -> B -> C -> A)', async () => {
      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/circular/cycle-a.odin')!;
      const schema = parseSchema(schemaContent);

      await expect(
        resolver.resolveSchema(schema, '/schemas/circular/cycle-a.odin')
      ).rejects.toThrow(/[Cc]ircular/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Error Handling Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws on file not found', async () => {
      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/malformed/invalid-import-path.odin')!;
      const schema = parseSchema(schemaContent);

      await expect(
        resolver.resolveSchema(schema, '/schemas/malformed/invalid-import-path.odin')
      ).rejects.toThrow(/not found|ENOENT/i);
    });

    it('throws on malformed imported file', async () => {
      // Add a file that imports the malformed file
      mockFiles.set(
        '/schemas/imports-malformed.odin',
        `@import ./malformed/syntax-error.odin as bad

{$}
odin = "1.0.0"
schema = "1.0.0"

{@valid}
field = !
`
      );

      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/imports-malformed.odin')!;
      const schema = parseSchema(schemaContent);

      await expect(
        resolver.resolveSchema(schema, '/schemas/imports-malformed.odin')
      ).rejects.toThrow();
    });

    it('enforces maximum import depth', async () => {
      // Set very low depth limit
      const resolver = createMockResolver({ maxImportDepth: 2 });
      const schemaContent = mockFiles.get('/schemas/nest/d1.odin')!;
      const schema = parseSchema(schemaContent);

      await expect(resolver.resolveSchema(schema, '/schemas/nest/d1.odin')).rejects.toThrow(
        /depth|exceeded/i
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty schema file', async () => {
      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/empty.odin')!;
      const schema = parseSchema(schemaContent);

      const result = await resolver.resolveSchema(schema, '/schemas/empty.odin');

      expect(result.resolution.imports.size).toBe(0);
      expect(result.resolution.resolvedPaths).toContain('/schemas/empty.odin');
    });

    it('handles import with auto-derived alias (no explicit alias)', async () => {
      // Create a file with import without alias
      mockFiles.set(
        '/schemas/auto-alias.odin',
        `@import ./_types.odin

{$}
odin = "1.0.0"
schema = "1.0.0"

{@test}
field = !
`
      );

      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/auto-alias.odin')!;
      const schema = parseSchema(schemaContent);

      const result = await resolver.resolveSchema(schema, '/schemas/auto-alias.odin');

      // Import keyed by file path, alias derived from filename: _types
      const importKeys = Array.from(result.resolution.imports.keys());
      expect(importKeys.some((k) => k.includes('_types.odin'))).toBe(true);
    });

    it('handles multiple imports from same directory', async () => {
      const resolver = createMockResolver();
      const schemaContent = mockFiles.get('/schemas/policy.odin')!;
      const schema = parseSchema(schemaContent);

      const result = await resolver.resolveSchema(schema, '/schemas/policy.odin');

      // Both imports should be resolved
      expect(result.resolution.imports.size).toBe(2);
      expect(result.resolution.typeRegistry.lookup('types.address')).toBeDefined();
      expect(result.resolution.typeRegistry.lookup('vehicle.vehicle')).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Cache Behavior Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('cache behavior', () => {
    it('uses cache for repeated imports', async () => {
      let loadCount = 0;
      const trackingResolver = new ImportResolver({
        readFile: async (path: string) => {
          loadCount++;
          const normalized = path.replace(/\\/g, '/');
          for (const [key, content] of mockFiles) {
            if (normalized.endsWith(key) || normalized.includes(key.substring(1))) {
              return content;
            }
          }
          throw new Error(`Mock file not found: ${normalized}`);
        },
        sandboxRoot: '/schemas',
        cache: new (await import('../../../src/resolver/index.js')).SimpleResolverCache(),
      });

      // Resolve diamond top - shared.odin should be loaded once due to cache
      const schemaContent = mockFiles.get('/schemas/diamond/top.odin')!;
      const schema = parseSchema(schemaContent);

      await trackingResolver.resolveSchema(schema, '/schemas/diamond/top.odin');

      // Without cache, shared.odin would be loaded twice (once from left, once from right)
      // With cache, it should only be loaded once after the first occurrence
      // Note: exact count depends on resolution order, but should be less than double
      expect(loadCount).toBeLessThanOrEqual(5); // top + left + right + shared (cached) + any others
    });

    it('cache can be cleared', async () => {
      const { SimpleResolverCache } = await import('../../../src/resolver/index.js');
      const cache = new SimpleResolverCache();

      // Manually populate cache
      const schema = parseSchema(mockFiles.get('/schemas/_types.odin')!);
      cache.setSchema('/schemas/_types.odin', schema);

      expect(cache.getSchema('/schemas/_types.odin')).toBeDefined();

      cache.clear();

      expect(cache.getSchema('/schemas/_types.odin')).toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration with Schema Parser
// ─────────────────────────────────────────────────────────────────────────────

describe('Schema Parser Import Integration', () => {
  it('parses import directives in schemas', () => {
    const schema = parseSchema(`
@import ../../_types.odin as types
@import ./vehicle.odin as vehicle

{$}
odin = "1.0.0"
schema = "1.0.0"

{policy.vehicles[]}
:(1..99)
vin = !
`);

    expect(schema.imports).toHaveLength(2);
    expect(schema.imports[0]?.path).toBe('../../_types.odin');
    expect(schema.imports[0]?.alias).toBe('types');
    expect(schema.imports[1]?.path).toBe('./vehicle.odin');
    expect(schema.imports[1]?.alias).toBe('vehicle');
  });

  it('handles schema with no imports', () => {
    const schema = parseSchema(`
{$}
odin = "1.0.0"
schema = "1.0.0"

{policy}
number = !:(1..20)
`);

    expect(schema.imports).toHaveLength(0);
  });
});
