/**
 * Conformance tests for transform field modifiers and formatter behavior.
 *
 * Covers validation modifiers, JSON structural modifiers, field conditions,
 * loop counters, computation-only sinks, XML CDATA, and fixed-width line width.
 */

import { describe, it, expect } from 'vitest';
import { parseTransform, executeTransform } from '../../src/transform/index.js';

const BASE = [
  '{$}',
  'odin = "1.0.0"',
  'transform = "1.0.0"',
  'direction = "json->json"',
  'target.format = "json"',
].join('\n');

function run(transformText: string, input: unknown) {
  const transform = parseTransform(transformText);
  return executeTransform(transform, input);
}

describe('Validation modifiers', () => {
  it(':validate fails an invalid value when onValidation = fail', () => {
    const t = `${BASE}\ntarget.onValidation = "fail"\n\n{C}\nemail = "@.email :validate \\"^[^@]+@[^@]+$\\""\n`;
    const r = run(t, { email: 'nope' });
    expect(r.success).toBe(false);
    expect(r.errors[0]?.code).toBe('T013');
  });

  it(':validate passes a matching value', () => {
    const t = `${BASE}\n\n{C}\nemail = "@.email :validate \\"^[^@]+@[^@]+$\\""\n`;
    const r = run(t, { email: 'a@b.com' });
    expect(r.success).toBe(true);
    expect((r.output as any).C.email.value).toBe('a@b.com');
  });

  it(':enum warns and still emits when onValidation = warn', () => {
    const t = `${BASE}\ntarget.onValidation = "warn"\n\n{C}\nstatus = "@.status :enum A,P,C"\n`;
    const r = run(t, { status: 'Z' });
    expect(r.success).toBe(true);
    expect(r.warnings.length).toBe(1);
    expect((r.output as any).C.status.value).toBe('Z');
  });

  it(':range skips an out-of-range value when onValidation = skip', () => {
    const t = `${BASE}\ntarget.onValidation = "skip"\n\n{C}\nyear = "@.year :range 1900..2100"\n`;
    const r = run(t, { year: 1850 });
    expect(r.success).toBe(true);
    expect((r.output as any).C).toBeUndefined();
  });

  it(':range accepts an in-range value', () => {
    const t = `${BASE}\n\n{C}\nyear = "@.year :range 1900..2100"\n`;
    const r = run(t, { year: 2024 });
    expect(r.success).toBe(true);
    expect((r.output as any).C.year.value).toBe(2024);
  });
});

describe('JSON structural modifiers', () => {
  it(':object builds a nested object from the inline spec', () => {
    const t = `${BASE}\n\n{C}\ncontact = ":object {name = @.name, phone = @.phone}"\n`;
    const r = run(t, { name: 'Jo', phone: '555' });
    expect((r.output as any).C.contact).toMatchObject({
      type: 'object',
      value: { name: { type: 'string', value: 'Jo' }, phone: { type: 'string', value: '555' } },
    });
    expect(JSON.parse(r.formatted)).toEqual({ C: { contact: { name: 'Jo', phone: '555' } } });
  });

  it(':raw emits inline JSON structurally', () => {
    const t = `${BASE}\n\n{C}\nmeta = "@.meta :raw"\n`;
    const r = run(t, { meta: '{"a":1,"b":[2,3]}' });
    expect(JSON.parse(r.formatted)).toEqual({ C: { meta: { a: 1, b: [2, 3] } } });
  });

  it(':array wraps the value in a single-element array', () => {
    const t = `${BASE}\n\n{C}\ntags = "@.tag :array"\n`;
    const r = run(t, { tag: 'x' });
    expect(JSON.parse(r.formatted)).toEqual({ C: { tags: ['x'] } });
  });
});

describe('Field conditions', () => {
  it(':if path = value emits only when the comparison holds', () => {
    const t = `${BASE}\n\n{C}\na = "@.x :if @.flag = yes"\nb = "@.x :if @.flag = no"\n`;
    const r = run(t, { x: 5, flag: 'yes' });
    expect(JSON.parse(r.formatted)).toEqual({ C: { a: 5 } });
  });

  it(':unless path = value omits when the comparison holds', () => {
    const t = `${BASE}\n\n{C}\na = "@.x :unless @.flag = yes"\n`;
    const r = run(t, { x: 5, flag: 'yes' });
    expect(JSON.parse(r.formatted)).toEqual({});
  });

  it(':if truthy path still works', () => {
    const t = `${BASE}\n\n{C}\na = "@.x :if @.flag"\n`;
    expect(JSON.parse(run(t, { x: 5, flag: true }).formatted)).toEqual({ C: { a: 5 } });
    expect(JSON.parse(run(t, { x: 5, flag: false }).formatted)).toEqual({});
  });
});

describe('Loop counter', () => {
  it('counter is readable by name and via the accumulator reference', () => {
    const t = `${BASE}\n\n{rows[]}\n:loop items\n:counter rownum\nn = "@rownum"\nm = "@$accumulator.rownum"\n`;
    const r = run(t, { items: [{}, {}, {}] });
    expect(JSON.parse(r.formatted)).toEqual({
      rows: [
        { n: 0, m: 0 },
        { n: 1, m: 1 },
        { n: 2, m: 2 },
      ],
    });
  });
});

describe('Computation-only sink sections', () => {
  it('omits a _-prefixed looping section from output', () => {
    const t = `${BASE}\n\n{_loop[]}\n:loop items\nv = "@.a"\n\n{Out}\nx = "y"\n`;
    const r = run(t, { items: [{ a: 1 }, { a: 2 }] });
    expect(Object.keys(r.output)).toEqual(['Out']);
  });

  it('omits a _-prefixed scalar section from output', () => {
    const t = `${BASE}\n\n{_calc}\nsum = "%add @.a @.b"\n\n{Out}\nx = "@.a"\n`;
    const r = run(t, { a: 1, b: 2 });
    expect(Object.keys(r.output)).toEqual(['Out']);
  });
});

describe('XML CDATA', () => {
  it(':cdata wraps element text in a CDATA section', () => {
    const t = [
      '{$}',
      'odin = "1.0.0"',
      'transform = "1.0.0"',
      'direction = "json->xml"',
      'target.format = "xml"',
      'emitTypeHints = ?false',
      '',
      '{Policy}',
      'Desc = "@.desc :cdata"',
      'Plain = "@.plain"',
    ].join('\n');
    const r = run(t, { desc: 'a < b & c', plain: 'a < b' });
    expect(r.formatted).toContain('<Desc><![CDATA[a < b & c]]></Desc>');
    expect(r.formatted).toContain('<Plain>a &lt; b</Plain>');
  });
});

describe('Fixed-width line width', () => {
  it('pads each record to the configured lineWidth using padChar', () => {
    const t = [
      '{$}',
      'odin = "1.0.0"',
      'transform = "1.0.0"',
      'direction = "json->fixed-width"',
      'target.format = "fixed-width"',
      'target.lineWidth = ##20',
      'target.padChar = "."',
      '',
      '{Rec}',
      'a = "@.a :pos 0 :len 5"',
      'b = "@.b :pos 5 :len 5"',
    ].join('\n');
    const r = run(t, { a: 'AB', b: 'CD' });
    expect(r.formatted.length).toBe(20);
    expect(r.formatted).toBe('AB...CD.............');
  });

  it('does not pad when lineWidth is unset', () => {
    const t = [
      '{$}',
      'odin = "1.0.0"',
      'transform = "1.0.0"',
      'direction = "json->fixed-width"',
      'target.format = "fixed-width"',
      '',
      '{Rec}',
      'a = "@.a :pos 0 :len 5"',
    ].join('\n');
    const r = run(t, { a: 'AB' });
    expect(r.formatted).toBe('AB   ');
  });
});
