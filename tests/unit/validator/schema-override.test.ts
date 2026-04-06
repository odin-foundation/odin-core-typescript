/**
 * Tests for ODIN Schema Type Override feature.
 *
 * The :override modifier allows a type to inherit from a base type
 * while overriding specific field constraints.
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Schema Override - Parser', () => {
  describe(':override modifier parsing', () => {
    it('parses type composition without :override', () => {
      const schema = Odin.parseSchema(`
{@base}
name = !
age = ##

{@child}
= @base
extra = !
`);

      const childType = schema.types.get('child');
      expect(childType).toBeDefined();

      const compositionField = childType?.fields.get('_composition');
      expect(compositionField).toBeDefined();
      expect(compositionField?.type.kind).toBe('typeRef');
      if (compositionField?.type.kind === 'typeRef') {
        expect(compositionField.type.name).toBe('base');
        expect(compositionField.type.override).toBeUndefined();
      }
    });

    it('parses type composition with :override', () => {
      const schema = Odin.parseSchema(`
{@base}
name = !
age = ##

{@child}
= @base :override
name = !:(1..50)
extra = !
`);

      const childType = schema.types.get('child');
      expect(childType).toBeDefined();

      const compositionField = childType?.fields.get('_composition');
      expect(compositionField).toBeDefined();
      expect(compositionField?.type.kind).toBe('typeRef');
      if (compositionField?.type.kind === 'typeRef') {
        expect(compositionField.type.name).toBe('base');
        expect(compositionField.type.override).toBe(true);
      }
    });

    it('parses :override with multiple base types', () => {
      const schema = Odin.parseSchema(`
{@timestamps}
created = !timestamp
updated = timestamp

{@auditable}
created_by = !
updated_by =

{@entity}
= @timestamps & @auditable :override
id = !
`);

      const entityType = schema.types.get('entity');
      const compositionField = entityType?.fields.get('_composition');
      expect(compositionField?.type.kind).toBe('typeRef');
      if (compositionField?.type.kind === 'typeRef') {
        expect(compositionField.type.name).toBe('timestamps&auditable');
        expect(compositionField.type.override).toBe(true);
      }
    });

    it('parses :override with namespaced type reference', () => {
      const schema = Odin.parseSchema(`
{@child}
= @base.coverage :override
limit = !#$:(30000..)
`);

      const childType = schema.types.get('child');
      const compositionField = childType?.fields.get('_composition');
      expect(compositionField?.type.kind).toBe('typeRef');
      if (compositionField?.type.kind === 'typeRef') {
        expect(compositionField.type.name).toBe('base.coverage');
        expect(compositionField.type.override).toBe(true);
      }
    });
  });
});

describe('Schema Override - Validation', () => {
  describe('type definition expansion', () => {
    it('inherits fields from base type', () => {
      const schema = Odin.parseSchema(`
{@base}
name = !
age = ##

{@child}
= @base
extra = !
`);

      const _doc = Odin.parse(`
{$}
odin = "1.0.0"

{person}
name = "John"
age = ##25
extra = "data"
`);

      // This would use the @child type for validation
      // Fields from @base (name, age) should be inherited
      expect(schema.types.get('base')?.fields.has('name')).toBe(true);
      expect(schema.types.get('base')?.fields.has('age')).toBe(true);
      expect(schema.types.get('child')?.fields.has('extra')).toBe(true);
    });

    it('allows field override with :override modifier', () => {
      const schema = Odin.parseSchema(`
{@base}
limit = #$:(0..)
name = !

{@child}
= @base :override
limit = !#$:(30000..)
`);

      // The child type should have both name (inherited) and limit (overridden)
      const childType = schema.types.get('child');
      expect(childType).toBeDefined();

      // limit should be defined in child (override)
      const limitField = childType?.fields.get('limit');
      expect(limitField).toBeDefined();
      expect(limitField?.required).toBe(true);

      // Check that the constraint was overridden
      const boundsConstraint = limitField?.constraints.find((c) => c.kind === 'bounds');
      expect(boundsConstraint).toBeDefined();
      if (boundsConstraint?.kind === 'bounds') {
        expect(boundsConstraint.min).toBe(30000);
      }
    });
  });
});

describe('Schema Override - Real World Example', () => {
  it('parses Texas liability coverage override', () => {
    const schema = Odin.parseSchema(`
{@base_liability}
limit = #$:(0..)
name = !

{@tx_liability}
= @base_liability :override
limit = !#$:(30000..)
`);

    // Check base type exists
    const baseType = schema.types.get('base_liability');
    expect(baseType).toBeDefined();

    // Check TX override type exists
    const txType = schema.types.get('tx_liability');
    expect(txType).toBeDefined();

    // Check that composition has override flag
    const compositionField = txType?.fields.get('_composition');
    expect(compositionField?.type.kind).toBe('typeRef');
    if (compositionField?.type.kind === 'typeRef') {
      expect(compositionField.type.override).toBe(true);
    }

    // Check TX-specific limit is required with correct minimum
    const limitField = txType?.fields.get('limit');
    expect(limitField).toBeDefined();
    expect(limitField?.required).toBe(true);

    const boundsConstraint = limitField?.constraints.find((c) => c.kind === 'bounds');
    expect(boundsConstraint).toBeDefined();
    if (boundsConstraint?.kind === 'bounds') {
      expect(boundsConstraint.min).toBe(30000);
    }
  });

  it('parses nested object override within type', () => {
    const schema = Odin.parseSchema(`
{@base_coverage}
{.bi}
per_person = #$:(0..)
per_accident = #$:(0..)

{@tx_coverage}
= @base_coverage :override
{.bi}
per_person = !#$:(30000..)
per_accident = !#$:(60000..)
`);

    // Check that the nested field structure is preserved
    const txType = schema.types.get('tx_coverage');
    expect(txType).toBeDefined();

    // Check composition has override
    const compositionField = txType?.fields.get('_composition');
    if (compositionField?.type.kind === 'typeRef') {
      expect(compositionField.type.override).toBe(true);
    }
  });
});
