/**
 * Tests for ODIN output formatters: toJSON, toXML, toCSV, toFixedWidth.
 * Also covers utility functions like Odin.path().
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../src/index.js';

describe('Output Formatters', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // toJSON
  // ─────────────────────────────────────────────────────────────────────────────

  describe('toJSON', () => {
    it('converts simple document to JSON string', () => {
      const doc = Odin.parse('name = "John"\nage = ##30');
      const json = Odin.toJSON(doc);

      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('John');
      expect(parsed.age).toBe(30);
    });

    it('supports indent option', () => {
      const doc = Odin.parse('name = "John"');
      const json = Odin.toJSON(doc, { indent: 2 });

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('supports omitNulls option', () => {
      const doc = Odin.parse('name = "John"\nmissing = ~');
      const jsonWithNulls = Odin.toJSON(doc);
      const jsonWithoutNulls = Odin.toJSON(doc, { omitNulls: true });

      expect(JSON.parse(jsonWithNulls).missing).toBeNull();
      expect(JSON.parse(jsonWithoutNulls).missing).toBeUndefined();
    });

    it('omits nulls in nested objects', () => {
      const doc = Odin.parse(`
        {user}
        name = "John"
        age = ~
      `);
      const json = Odin.toJSON(doc, { omitNulls: true });
      const parsed = JSON.parse(json);

      expect(parsed.user.name).toBe('John');
      expect(parsed.user.age).toBeUndefined();
    });

    it('omits nulls in arrays', () => {
      const doc = Odin.parse(`
        items[0] = "first"
        items[1] = ~
        items[2] = "third"
      `);
      const json = Odin.toJSON(doc, { omitNulls: true });
      const parsed = JSON.parse(json);

      // nulls filtered from array
      expect(parsed.items).toEqual(['first', 'third']);
    });

    it('handles empty document', () => {
      const doc = Odin.empty();
      const json = Odin.toJSON(doc);

      expect(JSON.parse(json)).toEqual({});
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // toXML
  // ─────────────────────────────────────────────────────────────────────────────

  describe('toXML', () => {
    it('converts document to XML with default root', () => {
      const doc = Odin.parse('name = "John"');
      const xml = Odin.toXML(doc);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<root>');
      expect(xml).toContain('</root>');
      expect(xml).toContain('<name>John</name>');
    });

    it('supports custom root element', () => {
      const doc = Odin.parse('name = "John"');
      const xml = Odin.toXML(doc, { rootElement: 'policy' });

      expect(xml).toContain('<policy>');
      expect(xml).toContain('</policy>');
    });

    it('supports indentation', () => {
      const doc = Odin.parse(`
        {user}
        name = "John"
      `);
      const xml = Odin.toXML(doc, { indent: 4 });

      expect(xml).toContain('    <name>');
    });

    it('supports disabling XML declaration', () => {
      const doc = Odin.parse('name = "John"');
      const xml = Odin.toXML(doc, { declaration: false });

      expect(xml).not.toContain('<?xml');
    });

    it('escapes special XML characters', () => {
      const doc = Odin.parse('text = "< > & \\" \'"');
      const xml = Odin.toXML(doc);

      expect(xml).toContain('&lt;');
      expect(xml).toContain('&gt;');
      expect(xml).toContain('&amp;');
      expect(xml).toContain('&quot;');
      expect(xml).toContain('&apos;');
    });

    it('handles nested objects', () => {
      const doc = Odin.parse(`
        {user}
        name = "John"
        age = ##30
      `);
      const xml = Odin.toXML(doc);

      expect(xml).toContain('<user>');
      expect(xml).toContain('</user>');
      expect(xml).toContain('<name>John</name>');
      expect(xml).toContain('odin:type="integer"');
      expect(xml).toContain('>30</age>');
    });

    it('handles arrays as repeated elements', () => {
      const doc = Odin.parse(`
        items[0] = "first"
        items[1] = "second"
      `);
      const xml = Odin.toXML(doc);

      // Arrays become repeated elements
      expect(xml).toContain('<items>');
      expect((xml.match(/<items>/g) || []).length).toBeGreaterThanOrEqual(1);
    });

    it('handles null values by skipping', () => {
      const doc = Odin.parse('value = ~\nname = "test"');
      const xml = Odin.toXML(doc);

      expect(xml).not.toContain('<value>');
      expect(xml).toContain('<name>test</name>');
    });

    it('handles empty document', () => {
      const doc = Odin.empty();
      const xml = Odin.toXML(doc);

      expect(xml).toContain('<root>');
      expect(xml).toContain('</root>');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // toCSV
  // ─────────────────────────────────────────────────────────────────────────────

  describe('toCSV', () => {
    it('converts array data to CSV', () => {
      const doc = Odin.parse(`
        {items[0]}
        name = "John"
        age = ##30

        {items[1]}
        name = "Jane"
        age = ##25
      `);
      const csv = Odin.toCSV(doc, { arrayPath: 'items' });

      expect(csv).toContain('name,age');
      expect(csv).toContain('John,30');
      expect(csv).toContain('Jane,25');
    });

    it('uses custom delimiter', () => {
      const doc = Odin.parse(`
        {items[0]}
        name = "John"
        age = ##30
      `);
      const csv = Odin.toCSV(doc, { arrayPath: 'items', delimiter: ';' });

      expect(csv).toContain('name;age');
      expect(csv).toContain('John;30');
    });

    it('supports disabling header', () => {
      const doc = Odin.parse(`
        {items[0]}
        name = "John"
        age = ##30
      `);
      const csv = Odin.toCSV(doc, { arrayPath: 'items', header: false });

      expect(csv).not.toContain('name,age');
      expect(csv).toContain('John,30');
    });

    it('auto-detects first array without arrayPath', () => {
      const doc = Odin.parse(`
        {rows[0]}
        a = "1"
        b = "2"
      `);
      const csv = Odin.toCSV(doc);

      expect(csv).toContain('a,b');
    });

    it('escapes values containing delimiter', () => {
      const doc = Odin.parse(`
        {items[0]}
        text = "hello, world"
      `);
      const csv = Odin.toCSV(doc, { arrayPath: 'items' });

      expect(csv).toContain('"hello, world"');
    });

    it('escapes values containing quotes', () => {
      const doc = Odin.parse(`
        {items[0]}
        text = "say \\"hello\\""
      `);
      const csv = Odin.toCSV(doc, { arrayPath: 'items' });

      expect(csv).toContain('""');
    });

    it('escapes values containing newlines', () => {
      const doc = Odin.parse(`
        {items[0]}
        text = "line1\\nline2"
      `);
      const csv = Odin.toCSV(doc, { arrayPath: 'items' });

      expect(csv).toContain('"');
    });

    it('handles null values as empty string', () => {
      const doc = Odin.parse(`
        {items[0]}
        name = "John"
        missing = ~
      `);
      const csv = Odin.toCSV(doc, { arrayPath: 'items' });

      expect(csv).toContain('John,');
    });

    it('handles undefined values as empty string', () => {
      const doc = Odin.parse(`
        {items[0]}
        name = "John"
      `);
      const csv = Odin.toCSV(doc, { arrayPath: 'items' });
      const lines = csv.split('\n');

      expect(lines[0]).toBe('name');
      expect(lines[1]).toBe('John');
    });

    it('falls back to root object if no array found', () => {
      const doc = Odin.parse('name = "John"\nage = ##30');
      const csv = Odin.toCSV(doc);

      expect(csv).toContain('name,age');
      expect(csv).toContain('John,30');
    });

    it('handles empty array', () => {
      const doc = Odin.parse('other = "value"');
      const csv = Odin.toCSV(doc, { arrayPath: 'nonexistent' });

      // Falls back to root
      expect(csv).toContain('other');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // toFixedWidth
  // ─────────────────────────────────────────────────────────────────────────────

  describe('toFixedWidth', () => {
    it('produces fixed-width output', () => {
      const doc = Odin.parse('code = "ABC"\nvalue = "123"');
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 20,
        fields: [
          { path: 'code', pos: 0, len: 5 },
          { path: 'value', pos: 5, len: 5 },
        ],
      });

      expect(fw.length).toBe(20);
      expect(fw.slice(0, 3)).toBe('ABC');
      expect(fw.slice(5, 8)).toBe('123');
    });

    it('pads values to specified length', () => {
      const doc = Odin.parse('short = "X"');
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 10,
        fields: [{ path: 'short', pos: 0, len: 5 }],
      });

      expect(fw.slice(0, 5)).toBe('X    ');
    });

    it('truncates values that exceed length', () => {
      const doc = Odin.parse('long = "ABCDEFGHIJ"');
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 10,
        fields: [{ path: 'long', pos: 0, len: 5 }],
      });

      expect(fw.slice(0, 5)).toBe('ABCDE');
    });

    it('supports custom pad character', () => {
      const doc = Odin.parse('num = "42"');
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 10,
        padChar: '0',
        fields: [{ path: 'num', pos: 0, len: 5, padChar: '0', align: 'right' }],
      });

      expect(fw.slice(0, 5)).toBe('00042');
    });

    it('supports left alignment (default)', () => {
      const doc = Odin.parse('text = "AB"');
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 10,
        fields: [{ path: 'text', pos: 0, len: 5 }],
      });

      expect(fw.slice(0, 5)).toBe('AB   ');
    });

    it('supports right alignment', () => {
      const doc = Odin.parse('text = "AB"');
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 10,
        fields: [{ path: 'text', pos: 0, len: 5, align: 'right' }],
      });

      expect(fw.slice(0, 5)).toBe('   AB');
    });

    it('handles multiple fields at different positions', () => {
      const doc = Odin.parse(`
        {record}
        type = "01"
        id = "12345"
        status = "A"
      `);
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 20,
        fields: [
          { path: 'record.type', pos: 0, len: 2 },
          { path: 'record.id', pos: 2, len: 10 },
          { path: 'record.status', pos: 12, len: 1 },
        ],
      });

      expect(fw.slice(0, 2)).toBe('01');
      expect(fw.slice(2, 7)).toBe('12345');
      expect(fw.slice(12, 13)).toBe('A');
    });

    it('handles missing values as empty', () => {
      const doc = Odin.parse('existing = "X"');
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 10,
        fields: [
          { path: 'existing', pos: 0, len: 3 },
          { path: 'missing', pos: 3, len: 3 },
        ],
      });

      expect(fw.slice(0, 3)).toBe('X  ');
      expect(fw.slice(3, 6)).toBe('   ');
    });

    it('handles null values as empty', () => {
      const doc = Odin.parse('value = ~');
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 10,
        fields: [{ path: 'value', pos: 0, len: 5 }],
      });

      expect(fw.slice(0, 5)).toBe('     ');
    });

    it('handles nested paths', () => {
      const doc = Odin.parse(`
        {policy}
        number = "POL123"
      `);
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 20,
        fields: [{ path: 'policy.number', pos: 0, len: 10 }],
      });

      expect(fw.slice(0, 6)).toBe('POL123');
    });

    it('fills remaining space with pad character', () => {
      const doc = Odin.parse('a = "X"');
      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 10,
        padChar: '*',
        fields: [{ path: 'a', pos: 0, len: 1 }],
      });

      expect(fw).toBe('X*********');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Odin.path() Utility
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Odin.path()', () => {
    it('builds simple path', () => {
      expect(Odin.path('field')).toBe('field');
    });

    it('builds nested path with dots', () => {
      expect(Odin.path('user', 'name')).toBe('user.name');
    });

    it('builds path with array index', () => {
      expect(Odin.path('items', 0)).toBe('items[0]');
    });

    it('builds complex path with multiple segments', () => {
      expect(Odin.path('policy', 'vehicles', 0, 'vin')).toBe('policy.vehicles[0].vin');
    });

    it('handles extension path prefix', () => {
      expect(Odin.path('&com.acme', 'custom_field')).toBe('&com.acme.custom_field');
    });

    it('handles multiple array indices', () => {
      expect(Odin.path('matrix', 0, 1, 2)).toBe('matrix[0][1][2]');
    });

    it('handles empty segments array', () => {
      expect(Odin.path()).toBe('');
    });

    it('handles single array index', () => {
      expect(Odin.path(0)).toBe('[0]');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Odin.builder() and Odin.empty()
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Factory Methods', () => {
    it('Odin.builder() creates document builder', () => {
      const doc = Odin.builder()
        .set('name', 'John')
        .set('age', { type: 'integer', value: 30 })
        .build();

      expect(doc.getString('name')).toBe('John');
      expect(doc.getInteger('age')).toBe(30);
    });

    it('Odin.empty() creates empty document', () => {
      const doc = Odin.empty();

      expect(doc.paths()).toHaveLength(0);
    });

    it('builder supports metadata', () => {
      const doc = Odin.builder().metadata('version', '1.0.0').build();

      expect(doc.get('$.version')).toEqual({ type: 'string', value: '1.0.0' });
    });

    it('builder supports modifiers', () => {
      const doc = Odin.builder()
        .setWithModifiers('secret', 'value', { confidential: true })
        .build();

      expect(doc.modifiers.get('secret')?.confidential).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Cases and Integration
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Integration and Edge Cases', () => {
    it('handles complex document through all formatters', () => {
      const doc = Odin.parse(`
        {$}
        version = "1.0.0"

        {policy}
        number = "POL-001"
        premium = #$500.00
        active = ?true
        created = 2024-06-15

        {policy.vehicles[0]}
        make = "Toyota"
        year = ##2024
      `);

      // JSON
      const json = Odin.toJSON(doc, { indent: 2 });
      expect(JSON.parse(json)).toHaveProperty('policy');

      // XML
      const xml = Odin.toXML(doc, { rootElement: 'data' });
      expect(xml).toContain('<policy>');

      // Canonical
      const canonical = Odin.canonicalize(doc);
      expect(canonical.length).toBeGreaterThan(0);
    });

    it('handles special characters in all formatters', () => {
      const doc = Odin.parse('text = "Hello <World> & \\"Friends\\""');

      const json = Odin.toJSON(doc);
      expect(json).toContain('Hello');

      const xml = Odin.toXML(doc);
      expect(xml).toContain('&lt;');
      expect(xml).toContain('&amp;');
    });

    it('numeric values convert correctly in all formats', () => {
      const doc = Odin.parse('count = ##42\nrate = #3.14\nprice = #$99.99');

      const json = JSON.parse(Odin.toJSON(doc));
      expect(json.count).toBe(42);
      expect(json.rate).toBe(3.14);
      expect(json.price).toBe(99.99);

      const xml = Odin.toXML(doc);
      expect(xml).toContain('odin:type="integer"');
      expect(xml).toContain('>42</count>');

      const fw = Odin.toFixedWidth(doc, {
        lineWidth: 20,
        fields: [{ path: 'count', pos: 0, len: 5, align: 'right', padChar: '0' }],
      });
      expect(fw.slice(0, 5)).toBe('00042');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Type Fidelity and Modifier Preservation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Type Fidelity and Modifier Preservation', () => {
    describe('JSON high-precision currency', () => {
      it('preserves 18-decimal crypto currency values (wei)', () => {
        const doc = Odin.parse('amount = #$1.234567890123456789');
        const json = Odin.toJSON(doc);
        const parsed = JSON.parse(json);

        // High-precision values should be preserved as strings
        expect(parsed.amount).toBe('1.234567890123456789');
      });

      it('preserves 8-decimal crypto currency values (satoshi)', () => {
        const doc = Odin.parse('btc = #$0.00000001');
        const json = Odin.toJSON(doc);
        const parsed = JSON.parse(json);

        // Standard precision values can remain as numbers
        expect(parsed.btc).toBe(0.00000001);
      });

      it('preserves high-value currency without precision loss', () => {
        const doc = Odin.parse('total = #$999999999999999.99');
        const json = Odin.toJSON(doc);
        const parsed = JSON.parse(json);

        // High-precision values should be preserved as strings
        expect(parsed.total).toBe('999999999999999.99');
      });
    });

    describe('JSON high-precision numbers', () => {
      it('preserves scientific constants with full precision', () => {
        const doc = Odin.parse('pi = #3.14159265358979323846');
        const json = Odin.toJSON(doc);
        const parsed = JSON.parse(json);

        // High-precision numbers should be preserved as strings
        expect(parsed.pi).toBe('3.14159265358979323846');
      });

      it('handles normal precision numbers as numbers', () => {
        const doc = Odin.parse('rate = #3.14');
        const json = Odin.toJSON(doc);
        const parsed = JSON.parse(json);

        // Normal precision numbers should remain as numbers
        expect(parsed.rate).toBe(3.14);
      });
    });

    describe('XML modifier attributes', () => {
      it('includes odin:required attribute for required fields', () => {
        const doc = Odin.builder().setWithModifiers('name', 'John', { required: true }).build();

        const xml = Odin.toXML(doc);
        expect(xml).toContain('odin:required="true"');
      });

      it('includes odin:confidential attribute for confidential fields', () => {
        const doc = Odin.builder()
          .setWithModifiers('ssn', '123-45-6789', { confidential: true })
          .build();

        const xml = Odin.toXML(doc);
        expect(xml).toContain('odin:confidential="true"');
      });

      it('includes odin:deprecated attribute for deprecated fields', () => {
        const doc = Odin.builder()
          .setWithModifiers('oldField', 'value', { deprecated: true })
          .build();

        const xml = Odin.toXML(doc);
        expect(xml).toContain('odin:deprecated="true"');
      });

      it('includes multiple modifier attributes when applicable', () => {
        const doc = Odin.builder()
          .setWithModifiers('criticalSecret', 'value', {
            required: true,
            confidential: true,
          })
          .build();

        const xml = Odin.toXML(doc);
        expect(xml).toContain('odin:required="true"');
        expect(xml).toContain('odin:confidential="true"');
      });

      it('includes ODIN namespace when modifiers are present', () => {
        const doc = Odin.builder().setWithModifiers('field', 'value', { required: true }).build();

        const xml = Odin.toXML(doc);
        expect(xml).toContain('xmlns:odin="https://odin.foundation/ns"');
      });

      it('does not include namespace when no modifiers are present', () => {
        const doc = Odin.builder().set('name', 'John').build();

        const xml = Odin.toXML(doc);
        expect(xml).not.toContain('xmlns:odin');
      });
    });

    describe('XML type fidelity', () => {
      it('preserves high-precision currency in XML', () => {
        const doc = Odin.parse('amount = #$1.234567890123456789');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('1.234567890123456789');
      });

      it('preserves high-precision numbers in XML', () => {
        const doc = Odin.parse('pi = #3.14159265358979323846');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('3.14159265358979323846');
      });

      it('preserves date format in XML', () => {
        const doc = Odin.parse('dob = 2024-06-15');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('odin:type="date"');
        expect(xml).toContain('>2024-06-15</dob>');
      });

      it('preserves timestamp format in XML', () => {
        const doc = Odin.parse('created = 2024-06-15T10:30:00Z');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('odin:type="timestamp"');
        expect(xml).toContain('>2024-06-15T10:30:00Z</created>');
      });
    });

    describe('XML type attributes', () => {
      it('includes odin:type for integer values', () => {
        const doc = Odin.parse('count = ##42');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('odin:type="integer"');
        expect(xml).toContain('>42<');
      });

      it('includes odin:type for number values', () => {
        const doc = Odin.parse('rate = #3.14');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('odin:type="number"');
      });

      it('includes odin:type for currency values', () => {
        const doc = Odin.parse('price = #$99.99');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('odin:type="currency"');
      });

      it('includes odin:type for boolean values', () => {
        const doc = Odin.parse('active = ?true');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('odin:type="boolean"');
      });

      it('includes odin:type for date values', () => {
        const doc = Odin.parse('dob = 2024-06-15');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('odin:type="date"');
      });

      it('includes odin:type for timestamp values', () => {
        const doc = Odin.parse('created = 2024-06-15T10:30:00Z');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('odin:type="timestamp"');
      });

      it('does not include odin:type for string values (default)', () => {
        const doc = Odin.parse('name = "John"');
        const xml = Odin.toXML(doc);

        expect(xml).not.toContain('odin:type="string"');
        expect(xml).toContain('<name>John</name>');
      });

      it('includes namespace when typed values are present', () => {
        const doc = Odin.parse('count = ##42');
        const xml = Odin.toXML(doc);

        expect(xml).toContain('xmlns:odin="https://odin.foundation/ns"');
      });

      it('excludes ODIN attributes when includeOdinAttributes is false', () => {
        const doc = Odin.parse('count = ##42\nprice = #$99.99');
        const xml = Odin.toXML(doc, { includeOdinAttributes: false });

        expect(xml).not.toContain('odin:type');
        expect(xml).not.toContain('xmlns:odin');
        expect(xml).toContain('<count>42</count>');
        expect(xml).toContain('<price>99.99</price>');
      });

      it('excludes modifier attributes when includeOdinAttributes is false', () => {
        const doc = Odin.builder()
          .setWithModifiers('ssn', '123-45-6789', { confidential: true })
          .build();

        const xml = Odin.toXML(doc, { includeOdinAttributes: false });

        expect(xml).not.toContain('odin:confidential');
        expect(xml).not.toContain('xmlns:odin');
        expect(xml).toContain('<ssn>123-45-6789</ssn>');
      });
    });
  });
});
