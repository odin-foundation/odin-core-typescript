/**
 * Tests for XML formatter features: emitTypeHints and target namespaces.
 *
 * Covers odin->xml output: odin:type hints toggle and :ns prefixing
 * with root xmlns declarations.
 */

import { describe, it, expect } from 'vitest';
import { parseTransform } from '../../../src/index.js';
import { executeTransform } from '../../../src/transform/engine.js';

// odin->xml transform with optional target directives appended to {$}.
function xmlTransform(mapping: string, targetExtra = '', namespaceBlock = ''): string {
  return `{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "odin->xml"
target.format = "xml"
${targetExtra}
{$source}
format = "odin"
${namespaceBlock}
${mapping}
`;
}

// Minimal ODIN source document.
function odinSource(body: string): string {
  return `{$}
odin = "1.0.0"
{}
${body}
`;
}

describe('XML formatter features', () => {
  describe('emitTypeHints', () => {
    it('emits odin:type, odin:currencyCode and xmlns:odin by default (true)', () => {
      const transform = parseTransform(
        xmlTransform(`{Order}
Quantity = @order.quantity
Total = @order.total`)
      );
      const source = odinSource(`{order}
quantity = ##42
total = #$9.99:USD`);

      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);

      const xml = result.formatted!;
      expect(xml).toContain('odin:type="integer"');
      expect(xml).toContain('odin:type="currency"');
      expect(xml).toContain('odin:currencyCode="USD"');
      expect(xml).toContain('xmlns:odin');
    });

    it('renders code-less currency as currency with preserved decimals, no currencyCode', () => {
      const transform = parseTransform(
        xmlTransform(`{Order}
Total = @order.total`)
      );
      const source = odinSource(`{order}
total = #$50.00`);

      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);

      const xml = result.formatted!;
      expect(xml).toContain('<Total odin:type="currency">50.00</Total>');
      expect(xml).not.toContain('odin:currencyCode');
    });

    it('renders coded currency as currency with currencyCode and preserved decimals', () => {
      const transform = parseTransform(
        xmlTransform(`{Order}
Total = @order.total`)
      );
      const source = odinSource(`{order}
total = #$9.99:USD`);

      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);

      const xml = result.formatted!;
      expect(xml).toContain(
        '<Total odin:type="currency" odin:currencyCode="USD">9.99</Total>'
      );
    });

    it('suppresses all odin: attributes when emitTypeHints = ?false', () => {
      const transform = parseTransform(
        xmlTransform(
          `{Order}
Quantity = @order.quantity
Total = @order.total`,
          'target.emitTypeHints = ?false'
        )
      );
      const source = odinSource(`{order}
quantity = ##42
total = #$9.99`);

      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);

      const xml = result.formatted!;
      expect(xml).not.toContain('odin:type');
      expect(xml).not.toContain('odin:currencyCode');
      expect(xml).not.toContain('xmlns:odin');
      expect(xml).not.toContain('odin:');
      // Values still rendered as plain XML text.
      expect(xml).toContain('42');
      expect(xml).toContain('9.99');
    });
  });

  describe('target namespaces', () => {
    it(':ns prefixes the element and declares xmlns on the root', () => {
      const transform = parseTransform(
        xmlTransform(
          `{Policy}
PolicyNumber = @policy.number :ns p
Holder = @policy.holder`,
          '',
          `{$target.namespace}
p = "urn:x"`
        )
      );
      const source = odinSource(`{policy}
number = "POL-1"
holder = "Jane"`);

      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);

      const xml = result.formatted!;
      // Root element carries the xmlns:p declaration.
      expect(xml).toMatch(/<Policy[^>]*\bxmlns:p="urn:x"/);
      // Prefixed element.
      expect(xml).toContain('<p:PolicyNumber>POL-1</p:PolicyNumber>');
      // Unprefixed element stays bare.
      expect(xml).toContain('<Holder>Jane</Holder>');
      expect(xml).not.toContain('<p:Holder');
    });

    it('declares multiple namespace prefixes on the root', () => {
      const transform = parseTransform(
        xmlTransform(
          `{Doc}
A = @doc.a :ns p
B = @doc.b :ns q`,
          '',
          `{$target.namespace}
p = "urn:p"
q = "urn:q"`
        )
      );
      const source = odinSource(`{doc}
a = "av"
b = "bv"`);

      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);

      const xml = result.formatted!;
      expect(xml).toContain('xmlns:p="urn:p"');
      expect(xml).toContain('xmlns:q="urn:q"');
      expect(xml).toContain('<p:A>av</p:A>');
      expect(xml).toContain('<q:B>bv</q:B>');
    });

    it('combines namespace prefixing with emitTypeHints = ?false', () => {
      const transform = parseTransform(
        xmlTransform(
          `{Doc}
Amount = @doc.amount :ns p
Name = @doc.name`,
          'target.emitTypeHints = ?false',
          `{$target.namespace}
p = "urn:x"`
        )
      );
      const source = odinSource(`{doc}
amount = ##100
name = "Acme"`);

      const result = executeTransform(transform, source);
      expect(result.success).toBe(true);

      const xml = result.formatted!;
      // Namespace prefixing still applies.
      expect(xml).toContain('xmlns:p="urn:x"');
      expect(xml).toContain('<p:Amount>100</p:Amount>');
      // No odin: attributes anywhere.
      expect(xml).not.toContain('odin:');
      expect(xml).not.toContain('xmlns:odin');
    });
  });
});
