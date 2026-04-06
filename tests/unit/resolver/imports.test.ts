/**
 * Tests for ODIN import directive parsing
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Import Directives', () => {
  describe('Basic import parsing', () => {
    it('parses simple import directive', () => {
      const doc = Odin.parse(`
@import ./shared/types.odin

{policy}
number = "POL-001"
`);

      expect(doc.imports).toHaveLength(1);
      expect(doc.imports[0]?.path).toBe('./shared/types.odin');
      expect(doc.imports[0]?.alias).toBeUndefined();
    });

    it('parses import with alias', () => {
      const doc = Odin.parse(`
@import ./types.odin as types

{policy}
number = "POL-001"
`);

      expect(doc.imports).toHaveLength(1);
      expect(doc.imports[0]?.path).toBe('./types.odin');
      expect(doc.imports[0]?.alias).toBe('types');
    });

    it('parses multiple imports', () => {
      const doc = Odin.parse(`
@import ./insured.odin as insured
@import ./policy_base.odin as base
@import https://schemas.example.com/auto/2024.odin

{policy}
number = "POL-001"
`);

      expect(doc.imports).toHaveLength(3);

      expect(doc.imports[0]?.path).toBe('./insured.odin');
      expect(doc.imports[0]?.alias).toBe('insured');

      expect(doc.imports[1]?.path).toBe('./policy_base.odin');
      expect(doc.imports[1]?.alias).toBe('base');

      expect(doc.imports[2]?.path).toBe('https://schemas.example.com/auto/2024.odin');
      expect(doc.imports[2]?.alias).toBeUndefined();
    });
  });

  describe('Import path formats', () => {
    it('parses relative path imports', () => {
      const doc = Odin.parse(`@import ./types.odin
name = "test"`);

      expect(doc.imports[0]?.path).toBe('./types.odin');
    });

    it('parses parent directory imports', () => {
      const doc = Odin.parse(`@import ../shared/types.odin
name = "test"`);

      expect(doc.imports[0]?.path).toBe('../shared/types.odin');
    });

    it('parses URL imports', () => {
      const doc = Odin.parse(`@import https://example.com/schemas/policy.odin
name = "test"`);

      expect(doc.imports[0]?.path).toBe('https://example.com/schemas/policy.odin');
    });

    it('parses quoted path imports', () => {
      const doc = Odin.parse(`@import "./path with spaces/types.odin"
name = "test"`);

      expect(doc.imports[0]?.path).toBe('./path with spaces/types.odin');
    });
  });

  describe('Import ordering and context', () => {
    it('imports are independent of document content', () => {
      const doc = Odin.parse(`
@import ./types.odin as t

{$}
odin = "1.0.0"

{policy}
number = "POL-001"
`);

      // Imports captured
      expect(doc.imports).toHaveLength(1);
      expect(doc.imports[0]?.path).toBe('./types.odin');

      // Document content still accessible
      expect(doc.getString('$.odin')).toBe('1.0.0');
      expect(doc.getString('policy.number')).toBe('POL-001');
    });

    it('records line numbers for imports', () => {
      const doc = Odin.parse(`@import ./first.odin
@import ./second.odin
name = "test"`);

      expect(doc.imports[0]?.line).toBe(1);
      expect(doc.imports[1]?.line).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('handles document with no imports', () => {
      const doc = Odin.parse(`
{policy}
number = "POL-001"
`);

      expect(doc.imports).toHaveLength(0);
    });

    it('handles empty alias name gracefully', () => {
      // Import without valid alias syntax is parsed as-is
      const doc = Odin.parse(`@import ./types.odin
name = "test"`);

      expect(doc.imports).toHaveLength(1);
      expect(doc.imports[0]?.alias).toBeUndefined();
    });
  });
});
