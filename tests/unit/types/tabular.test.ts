/**
 * Tabular mode edge case tests for ODIN SDK.
 *
 * Tests for:
 * - Tabular header syntax {items[] : col1, col2}
 * - Value rows
 * - Empty values / absent cells
 * - Mixed types in columns
 * - Strings with commas
 * - Column definitions with dot notation and array indices
 * - Transitioning out of tabular mode
 */

import { describe, it, expect } from 'vitest';
import { Odin } from '../../../src/index.js';

describe('Tabular Mode Parsing', () => {
  describe('Basic Tabular Syntax', () => {
    it('should parse simple tabular data', () => {
      const doc = Odin.parse(`
        {items[] : sku, name, qty}
        "SKU-001", "Widget", ##10
        "SKU-002", "Gadget", ##5
      `);
      expect(doc.getString('items[0].sku')).toBe('SKU-001');
      expect(doc.getString('items[0].name')).toBe('Widget');
      expect(doc.getInteger('items[0].qty')).toBe(10);
      expect(doc.getString('items[1].sku')).toBe('SKU-002');
      expect(doc.getString('items[1].name')).toBe('Gadget');
      expect(doc.getInteger('items[1].qty')).toBe(5);
    });

    it('should parse single row tabular', () => {
      const doc = Odin.parse(`
        {items[] : name}
        "Only One"
      `);
      expect(doc.getString('items[0].name')).toBe('Only One');
    });

    it('should parse single column tabular', () => {
      const doc = Odin.parse(`
        {items[] : name}
        "First"
        "Second"
        "Third"
      `);
      expect(doc.getString('items[0].name')).toBe('First');
      expect(doc.getString('items[1].name')).toBe('Second');
      expect(doc.getString('items[2].name')).toBe('Third');
    });

    it('should parse tabular with many columns', () => {
      const doc = Odin.parse(`
        {data[] : a, b, c, d, e, f, g, h}
        ##1, ##2, ##3, ##4, ##5, ##6, ##7, ##8
      `);
      expect(doc.getInteger('data[0].a')).toBe(1);
      expect(doc.getInteger('data[0].h')).toBe(8);
    });

    it('should parse tabular with many rows', () => {
      const lines = ['{items[] : idx}'];
      for (let i = 0; i < 100; i++) {
        lines.push(`##${i}`);
      }
      const doc = Odin.parse(lines.join('\n'));
      expect(doc.getInteger('items[0].idx')).toBe(0);
      expect(doc.getInteger('items[50].idx')).toBe(50);
      expect(doc.getInteger('items[99].idx')).toBe(99);
    });
  });

  describe('Tabular with Different Value Types', () => {
    it('should parse mixed types in tabular', () => {
      const doc = Odin.parse(`
        {items[] : str, int, float, bool, null, date}
        "text", ##42, #3.14, true, ~, 2024-06-15
      `);
      expect(doc.getString('items[0].str')).toBe('text');
      expect(doc.getInteger('items[0].int')).toBe(42);
      expect(doc.getNumber('items[0].float')).toBe(3.14);
      expect(doc.getBoolean('items[0].bool')).toBe(true);
      expect(doc.get('items[0].null')?.type).toBe('null');
      expect(doc.get('items[0].date')?.type).toBe('date');
    });

    it('should parse currency in tabular', () => {
      const doc = Odin.parse(`
        {prices[] : item, price}
        "Widget", #$99.99
        "Gadget", #$149.99
      `);
      expect(doc.getNumber('prices[0].price')).toBe(99.99);
      expect(doc.getNumber('prices[1].price')).toBe(149.99);
    });

    it('should parse references in tabular', () => {
      const doc = Odin.parse(`
        default_status = "active"
        {items[] : name, status}
        "Item1", @default_status
        "Item2", @default_status
      `);
      expect(doc.get('items[0].status')?.type).toBe('reference');
      expect((doc.get('items[0].status') as any).path).toBe('default_status');
    });

    it('should parse timestamps in tabular', () => {
      const doc = Odin.parse(`
        {events[] : name, timestamp}
        "Created", 2024-06-15T10:30:00Z
        "Updated", 2024-06-15T14:45:00Z
      `);
      expect(doc.get('events[0].timestamp')?.type).toBe('timestamp');
    });
  });

  describe('Empty and Absent Values', () => {
    it('should handle empty string in tabular', () => {
      const doc = Odin.parse(`
        {items[] : name, description}
        "Widget", ""
        "Gadget", "Has description"
      `);
      expect(doc.getString('items[0].description')).toBe('');
      expect(doc.getString('items[1].description')).toBe('Has description');
    });

    it('should handle null in tabular', () => {
      const doc = Odin.parse(`
        {items[] : name, optional}
        "Item1", ~
        "Item2", "has value"
      `);
      expect(doc.get('items[0].optional')?.type).toBe('null');
      expect(doc.getString('items[1].optional')).toBe('has value');
    });

    it('should handle absent cells (trailing missing)', () => {
      const doc = Odin.parse(`
        {items[] : a, b, c}
        "val1", "val2"
      `);
      // Only a and b should exist, c should be absent (no path created)
      expect(doc.getString('items[0].a')).toBe('val1');
      expect(doc.getString('items[0].b')).toBe('val2');
      expect(doc.has('items[0].c')).toBe(false);
    });

    it('should handle absent cells in middle (empty between commas)', () => {
      const doc = Odin.parse(`
        {items[] : a, b, c}
        "val1",, "val3"
      `);
      expect(doc.getString('items[0].a')).toBe('val1');
      expect(doc.has('items[0].b')).toBe(false);
      expect(doc.getString('items[0].c')).toBe('val3');
    });

    it('should handle row with absent first cell', () => {
      const doc = Odin.parse(`
        {items[] : a, b}
        , "data"
        "real", "more"
      `);
      // First row has absent a but has b
      expect(doc.has('items[0].a')).toBe(false);
      expect(doc.getString('items[0].b')).toBe('data');
      // Second row has both
      expect(doc.getString('items[1].a')).toBe('real');
      expect(doc.getString('items[1].b')).toBe('more');
    });
  });

  describe('Strings with Special Characters in Tabular', () => {
    it('should handle string with comma inside quotes', () => {
      const doc = Odin.parse(`
        {items[] : name, desc}
        "Widget", "Size: small, medium, large"
      `);
      expect(doc.getString('items[0].desc')).toBe('Size: small, medium, large');
    });

    it('should handle string with quotes inside', () => {
      const doc = Odin.parse(`
        {items[] : name, quote}
        "Widget", "He said \\"Hello\\""
      `);
      expect(doc.getString('items[0].quote')).toBe('He said "Hello"');
    });

    it('should handle string with newline escape', () => {
      const doc = Odin.parse(`
        {items[] : name, multiline}
        "Widget", "Line1\\nLine2"
      `);
      expect(doc.getString('items[0].multiline')).toBe('Line1\nLine2');
    });
  });

  describe('Column Names with Dot Notation', () => {
    it('should parse column with single dot notation', () => {
      const doc = Odin.parse(`
        {items[] : name, product.sku}
        "Item1", "SKU-001"
      `);
      expect(doc.getString('items[0].name')).toBe('Item1');
      expect(doc.getString('items[0].product.sku')).toBe('SKU-001');
    });

    it('should parse multiple columns with dot notation', () => {
      const doc = Odin.parse(`
        {items[] : product.name, product.price}
        "Widget", #$9.99
        "Gadget", #$19.99
      `);
      expect(doc.getString('items[0].product.name')).toBe('Widget');
      expect(doc.getNumber('items[0].product.price')).toBe(9.99);
    });
  });

  describe('Column Names with Array Indices', () => {
    it('should parse column with array index', () => {
      const doc = Odin.parse(`
        {items[] : name, tags[0], tags[1]}
        "Widget", "sale", "new"
      `);
      expect(doc.getString('items[0].tags[0]')).toBe('sale');
      expect(doc.getString('items[0].tags[1]')).toBe('new');
    });
  });

  describe('Relative Column Names', () => {
    it('should parse relative columns after dot notation column', () => {
      const doc = Odin.parse(`
        {holders[] : name, address.line1, .city, .state, .postal}
        "ABC Corp", "500 Commerce St", "Dallas", "TX", "75201"
      `);
      expect(doc.getString('holders[0].name')).toBe('ABC Corp');
      expect(doc.getString('holders[0].address.line1')).toBe('500 Commerce St');
      expect(doc.getString('holders[0].address.city')).toBe('Dallas');
      expect(doc.getString('holders[0].address.state')).toBe('TX');
      expect(doc.getString('holders[0].address.postal')).toBe('75201');
    });

    it('should handle multiple rows with relative columns', () => {
      const doc = Odin.parse(`
        {holders[] : name, address.line1, .city, .state}
        "ABC Corp", "500 Commerce St", "Dallas", "TX"
        "XYZ LLC", "123 Main St", "Austin", "TX"
      `);
      expect(doc.getString('holders[0].address.city')).toBe('Dallas');
      expect(doc.getString('holders[1].address.city')).toBe('Austin');
    });

    it('should reset context when non-dotted column follows', () => {
      const doc = Odin.parse(`
        {data[] : id, address.line1, .city, active}
        "001", "123 Main St", "Dallas", true
      `);
      expect(doc.getString('data[0].id')).toBe('001');
      expect(doc.getString('data[0].address.line1')).toBe('123 Main St');
      expect(doc.getString('data[0].address.city')).toBe('Dallas');
      expect(doc.getBoolean('data[0].active')).toBe(true);
    });

    it('should handle multiple context switches', () => {
      const doc = Odin.parse(`
        {data[] : name, home.street, .city, work.street, .city}
        "John", "123 Oak Ave", "Dallas", "456 Elm St", "Austin"
      `);
      expect(doc.getString('data[0].name')).toBe('John');
      expect(doc.getString('data[0].home.street')).toBe('123 Oak Ave');
      expect(doc.getString('data[0].home.city')).toBe('Dallas');
      expect(doc.getString('data[0].work.street')).toBe('456 Elm St');
      expect(doc.getString('data[0].work.city')).toBe('Austin');
    });

    it('should reject relative column without prior context', () => {
      expect(() =>
        Odin.parse(`
          {data[] : name, .city}
          "John", "Dallas"
        `)
      ).toThrow(/Relative column name requires previous column with dot notation/);
    });

    it('should reject relative column as first column', () => {
      expect(() =>
        Odin.parse(`
          {data[] : .name, .city}
          "John", "Dallas"
        `)
      ).toThrow(/Relative column name requires previous column with dot notation/);
    });

    it('should reject relative column after array index column', () => {
      // Array index columns (like tags[0]) don't establish a parent context
      expect(() =>
        Odin.parse(`
          {data[] : name, tags[0], .more}
          "John", "tag1", "tag2"
        `)
      ).toThrow(/Relative column name requires previous column with dot notation/);
    });

    it('should roundtrip relative columns', () => {
      const original = `{holders[] : name, address.line1, .city, .state}
"ABC Corp", "500 Commerce St", "Dallas", "TX"
"XYZ LLC", "123 Main St", "Austin", "TX"
`;
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc, { useTabular: true });
      const reparsed = Odin.parse(output);

      expect(reparsed.getString('holders[0].address.city')).toBe('Dallas');
      expect(reparsed.getString('holders[1].address.city')).toBe('Austin');
    });

    it('should serialize columns with relative syntax', () => {
      const builder = Odin.builder();
      builder.set('items[0].name', { type: 'string', value: 'Widget' });
      builder.set('items[0].product.sku', { type: 'string', value: 'SKU-001' });
      builder.set('items[0].product.name', { type: 'string', value: 'Widget Pro' });

      const output = Odin.stringify(builder.build(), { useTabular: true });
      // Should use relative syntax: product.sku, .name
      expect(output).toContain('.name');
    });
  });

  describe('Hyphenated Column Names', () => {
    it('should parse column with hyphen', () => {
      const doc = Odin.parse(`
        {items[] : item-name, end-type}
        "Widget", "coverage"
      `);
      expect(doc.getString('items[0].item-name')).toBe('Widget');
      expect(doc.getString('items[0].end-type')).toBe('coverage');
    });
  });

  describe('Transitioning Out of Tabular Mode', () => {
    it('should exit tabular mode on assignment', () => {
      const doc = Odin.parse(`
        {items[] : name}
        "Item1"
        "Item2"
        count = ##2
      `);
      expect(doc.getString('items[0].name')).toBe('Item1');
      expect(doc.getString('items[1].name')).toBe('Item2');
      expect(doc.getInteger('count')).toBe(2);
    });

    it('should exit tabular mode on new header', () => {
      const doc = Odin.parse(`
        {items[] : name}
        "Item1"
        {other}
        value = "test"
      `);
      expect(doc.getString('items[0].name')).toBe('Item1');
      expect(doc.getString('other.value')).toBe('test');
    });

    it('should exit tabular mode on empty header', () => {
      const doc = Odin.parse(`
        {items[] : name}
        "Item1"
        {}
        root_value = "at root"
      `);
      expect(doc.getString('items[0].name')).toBe('Item1');
      expect(doc.getString('root_value')).toBe('at root');
    });

    it('should start new tabular mode after previous', () => {
      const doc = Odin.parse(`
        {items[] : name}
        "Item1"
        {other[] : value}
        "Other1"
      `);
      expect(doc.getString('items[0].name')).toBe('Item1');
      expect(doc.getString('other[0].value')).toBe('Other1');
    });
  });

  describe('Nested Tabular Headers', () => {
    it('should parse nested array path in tabular header', () => {
      const doc = Odin.parse(`
        {order.items[] : sku, qty}
        "SKU-001", ##5
        "SKU-002", ##3
      `);
      expect(doc.getString('order.items[0].sku')).toBe('SKU-001');
      expect(doc.getInteger('order.items[0].qty')).toBe(5);
      expect(doc.getString('order.items[1].sku')).toBe('SKU-002');
    });

    it('should parse deeply nested tabular', () => {
      const doc = Odin.parse(`
        {customer.orders[0].items[] : name}
        "Widget"
        "Gadget"
      `);
      expect(doc.getString('customer.orders[0].items[0].name')).toBe('Widget');
      expect(doc.getString('customer.orders[0].items[1].name')).toBe('Gadget');
    });
  });

  describe('Whitespace Handling in Tabular', () => {
    it('should handle spaces around commas', () => {
      const doc = Odin.parse(`
        {items[] : a, b, c}
        "val1" , "val2" , "val3"
      `);
      expect(doc.getString('items[0].a')).toBe('val1');
      expect(doc.getString('items[0].b')).toBe('val2');
      expect(doc.getString('items[0].c')).toBe('val3');
    });

    it('should handle no spaces around commas', () => {
      const doc = Odin.parse(`
        {items[] : a,b,c}
        "val1","val2","val3"
      `);
      expect(doc.getString('items[0].a')).toBe('val1');
      expect(doc.getString('items[0].b')).toBe('val2');
      expect(doc.getString('items[0].c')).toBe('val3');
    });

    it('should handle leading whitespace on row', () => {
      const doc = Odin.parse(`
        {items[] : name}
            "Widget"
      `);
      expect(doc.getString('items[0].name')).toBe('Widget');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tabular section', () => {
      const doc = Odin.parse(`
        {items[] : name}
        other = "value"
      `);
      // No data rows, so array doesn't exist; assignment scoped to header
      expect(doc.has('items[0]')).toBe(false);
      expect(doc.getString('items[].other')).toBe('value');
    });

    it('should reject tabular with no columns but data rows', () => {
      // Data rows without columns would cause silent data loss - reject
      expect(() =>
        Odin.parse(`
        {items[] :}
        "value"
      `)
      ).toThrow();
    });

    it('should accept tabular with no columns and no data rows', () => {
      // Empty column list is valid if there's no data to lose
      const doc = Odin.parse(`
        {items[] :}
        {other}
        name = "test"
      `);
      expect(doc.has('items[0]')).toBe(false);
      expect(doc.getString('other.name')).toBe('test');
    });

    it('should handle column definition with only spaces', () => {
      const doc = Odin.parse(`
        {items[] : a ,  b  , c}
        "1", "2", "3"
      `);
      expect(doc.getString('items[0].a')).toBe('1');
      expect(doc.getString('items[0].b')).toBe('2');
      expect(doc.getString('items[0].c')).toBe('3');
    });
  });

  describe('Roundtrip Tabular', () => {
    it('should roundtrip simple tabular data', () => {
      const original = `{items[] : sku, description, qty}
"ABC-001", "Widget", ##10
"ABC-002", "Gadget", ##5
`;
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);

      // Parse the output and verify values match
      const reparsed = Odin.parse(output);
      expect(reparsed.getString('items[0].sku')).toBe('ABC-001');
      expect(reparsed.getString('items[0].description')).toBe('Widget');
      expect(reparsed.getInteger('items[0].qty')).toBe(10);
      expect(reparsed.getString('items[1].sku')).toBe('ABC-002');
    });

    it('should roundtrip tabular with mixed types', () => {
      const original = `{data[] : str, num, bool}
"text", ##42, true
"more", ##100, false
`;
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc);
      const reparsed = Odin.parse(output);

      expect(reparsed.getString('data[0].str')).toBe('text');
      expect(reparsed.getInteger('data[0].num')).toBe(42);
      expect(reparsed.getBoolean('data[0].bool')).toBe(true);
    });
  });

  describe('Primitive Array Tabular Syntax', () => {
    it('should parse primitive integer array with ~ column marker', () => {
      const doc = Odin.parse(`
{txIndexes[] : ~}
##100
##200
##300
`);
      expect(doc.getInteger('txIndexes[0]')).toBe(100);
      expect(doc.getInteger('txIndexes[1]')).toBe(200);
      expect(doc.getInteger('txIndexes[2]')).toBe(300);
    });

    it('should parse primitive string array', () => {
      const doc = Odin.parse(`
{tags[] : ~}
"urgent"
"important"
"reviewed"
`);
      expect(doc.getString('tags[0]')).toBe('urgent');
      expect(doc.getString('tags[1]')).toBe('important');
      expect(doc.getString('tags[2]')).toBe('reviewed');
    });

    it('should parse mixed primitive types', () => {
      const doc = Odin.parse(`
{values[] : ~}
"text"
##42
true
~
`);
      expect(doc.getString('values[0]')).toBe('text');
      expect(doc.getInteger('values[1]')).toBe(42);
      expect(doc.getBoolean('values[2]')).toBe(true);
      expect(doc.get('values[3]')?.type).toBe('null');
    });

    it('should serialize primitive array to tabular format', () => {
      const builder = Odin.builder();
      builder.set('numbers[0]', { type: 'integer', value: 10 });
      builder.set('numbers[1]', { type: 'integer', value: 20 });
      builder.set('numbers[2]', { type: 'integer', value: 30 });

      const output = Odin.stringify(builder.build(), { useTabular: true });
      expect(output).toContain('{numbers[] : ~}');
      expect(output).toContain('##10');
      expect(output).toContain('##20');
      expect(output).toContain('##30');
    });

    it('should roundtrip primitive array', () => {
      const original = `{ids[] : ~}
##1001
##1002
##1003
`;
      const doc = Odin.parse(original);
      const output = Odin.stringify(doc, { useTabular: true });
      const reparsed = Odin.parse(output);

      expect(reparsed.getInteger('ids[0]')).toBe(doc.getInteger('ids[0]'));
      expect(reparsed.getInteger('ids[1]')).toBe(doc.getInteger('ids[1]'));
      expect(reparsed.getInteger('ids[2]')).toBe(doc.getInteger('ids[2]'));
    });

    it('should exit primitive tabular mode on assignment line', () => {
      const doc = Odin.parse(`
{nums[] : ~}
##1
##2
name = "test"
`);
      expect(doc.getInteger('nums[0]')).toBe(1);
      expect(doc.getInteger('nums[1]')).toBe(2);
      expect(doc.getString('name')).toBe('test');
    });

    it('should handle nested primitive array in header context', () => {
      const doc = Odin.parse(`
{data}
name = "container"
{.items[] : ~}
"a"
"b"
"c"
`);
      expect(doc.getString('data.name')).toBe('container');
      expect(doc.getString('data.items[0]')).toBe('a');
      expect(doc.getString('data.items[1]')).toBe('b');
      expect(doc.getString('data.items[2]')).toBe('c');
    });

    it('should handle whitespace around ~ in header', () => {
      const doc = Odin.parse(`
{items[] :   ~  }
##1
##2
`);
      expect(doc.getInteger('items[0]')).toBe(1);
      expect(doc.getInteger('items[1]')).toBe(2);
    });

    it('should exit primitive tabular mode on new header', () => {
      const doc = Odin.parse(`
{nums[] : ~}
##1
##2
{other}
value = "test"
`);
      expect(doc.getInteger('nums[0]')).toBe(1);
      expect(doc.getInteger('nums[1]')).toBe(2);
      expect(doc.getString('other.value')).toBe('test');
    });

    it('should parse primitive array with references', () => {
      const doc = Odin.parse(`
ref_target = "value"
{refs[] : ~}
@ref_target
@ref_target
`);
      const ref0 = doc.get('refs[0]');
      const ref1 = doc.get('refs[1]');
      expect(ref0?.type).toBe('reference');
      expect(ref1?.type).toBe('reference');
    });

    it('should parse primitive array with currency values', () => {
      const doc = Odin.parse(`
{prices[] : ~}
#$99.99
#$149.50
#$24.00
`);
      expect(doc.getNumber('prices[0]')).toBe(99.99);
      expect(doc.getNumber('prices[1]')).toBe(149.5);
      expect(doc.getNumber('prices[2]')).toBe(24.0);
    });

    it('should parse primitive array with dates', () => {
      const doc = Odin.parse(`
{dates[] : ~}
2024-01-15
2024-06-30
2024-12-25
`);
      expect(doc.get('dates[0]')?.type).toBe('date');
      expect(doc.get('dates[1]')?.type).toBe('date');
      expect(doc.get('dates[2]')?.type).toBe('date');
    });
  });
});
