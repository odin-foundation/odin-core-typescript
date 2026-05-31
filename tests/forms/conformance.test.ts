/**
 * Conformance tests for ODIN Forms 1.0 dynamic/data features:
 * page templates, regions, render-time interpolation, inline values,
 * select options, barcode type, img background, text inputType, margins.
 */

import { describe, it, expect } from 'vitest';
import { parseForm, renderForm } from '../../src/forms/index.js';
import type { RegionElement } from '../../src/forms/index.js';
import { Odin } from '../../src/odin.js';

const head = `{$}\nodin = "1.0.0"\nforms = "1.0.0"\ntitle = "T"\nid = "i"\nlang = "en"\n\n{$.page}\nwidth = #8.5\nheight = #11\nunit = "inch"\n`;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Page templates {@tpl_*}
// ─────────────────────────────────────────────────────────────────────────────

describe('page templates {@tpl_*}', () => {
  const text = `${head}
{page[0]}
{.text.h}
x = #0.5
y = #0.5
content = "Hi"

{@tpl_more}
page-template = ?true
continues = "region.rows"
form-id = "F (Cont)"

{.text.header}
x = #0.5
y = #0.5
content = "Continued page {@odin.page}"
`;

  it('does not crash on {@tpl_*} headers', () => {
    expect(() => parseForm(text)).not.toThrow();
  });

  it('exposes the template by name', () => {
    const form = parseForm(text);
    expect(form.templates?.['tpl_more']).toBeDefined();
  });

  it('parses template metadata', () => {
    const tpl = parseForm(text).templates!['tpl_more']!;
    expect(tpl.pageTemplate).toBe(true);
    expect(tpl.continues).toBe('region.rows');
    expect(tpl.formId).toBe('F (Cont)');
  });

  it('parses template elements', () => {
    const tpl = parseForm(text).templates!['tpl_more']!;
    expect(tpl.elements).toHaveLength(1);
    expect(tpl.elements[0]!.type).toBe('text');
  });

  it('does not include the template among concrete pages', () => {
    const form = parseForm(text);
    expect(form.pages).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Regions {.region.*}
// ─────────────────────────────────────────────────────────────────────────────

describe('regions {.region.*}', () => {
  const text = `${head}
{page[0]}
{.region.drivers}
x = #0.5
y = #1.5
w = #7.5
h = #6
bind = @policy.drivers
max = ##4
overflow = "clone"

{.region.drivers.field.name}
x = #0
y = #0
y-offset = #1.2
w = #3
h = #0.3
label = "Driver Name"
bind = @.name

{.region.drivers.field.license}
x = #3.2
y = #0
y-offset = #1.2
w = #2
h = #0.3
label = "License"
bind = @.licenseNumber
`;

  it('creates a region element', () => {
    const el = parseForm(text).pages[0]!.elements[0]!;
    expect(el.type).toBe('region');
  });

  it('parses bind, max, and overflow', () => {
    const el = parseForm(text).pages[0]!.elements[0] as RegionElement;
    expect(el.bind).toBe('@policy.drivers');
    expect(el.max).toBe(4);
    expect(el.overflow).toBe('clone');
  });

  it('absorbs child elements with y-offset', () => {
    const el = parseForm(text).pages[0]!.elements[0] as RegionElement;
    expect(el.children).toHaveLength(2);
    const name = el.children[0] as Record<string, unknown>;
    expect(name.name).toBe('name');
    expect(name['y-offset']).toBe(1.2);
    expect(name.bind).toBe('@.name');
  });

  it('repeats children per bound array item at offset positions', () => {
    const form = parseForm(text);
    const data = Odin.parse(
      `{policy}\n{.drivers[0]}\nname = "Alice"\nlicenseNumber = "A1"\n{.drivers[1]}\nname = "Bob"\nlicenseNumber = "B2"`
    );
    const html = renderForm(form, data, { target: 'html' });
    expect(html).toContain('value="Alice"');
    expect(html).toContain('value="Bob"');
    expect(html).toContain('value="A1"');
    expect(html).toContain('value="B2"');
  });

  it('renders non-text field children with their real field type', () => {
    const t = `${head}
{page[0]}
{.region.rows}
x = #0.5
y = #1
w = #7
h = #5
bind = @items
max = ##5

{.region.rows.field.active}
type = "checkbox"
x = #0
y = #0
y-offset = #0.5
w = #0.2
h = #0.2
label = "Active"
bind = @.active
`;
    const data = Odin.parse(`{}\nitems[0].active = ?true\nitems[1].active = ?false`);
    const html = renderForm(parseForm(t), data, { target: 'html' });
    // two checkboxes, exactly one checked (the ?true item)
    expect((html.match(/type="checkbox"/g) ?? [])).toHaveLength(2);
    expect((html.match(/odin-form-checkbox[^>]*checked/g) ?? [])).toHaveLength(1);
  });

  it('preserves styling on region text children', () => {
    const t = `${head}
{page[0]}
{.region.rows}
x = #0.5
y = #1
w = #7
h = #5
bind = @items
max = ##5

{.region.rows.text.lbl}
x = #0
y = #0
y-offset = #0.5
content = "Row"
font-weight = "bold"
`;
    const data = Odin.parse(`{}\nitems[0].n = "a"\nitems[1].n = "b"`);
    const html = renderForm(parseForm(t), data, { target: 'html' });
    expect((html.match(/font-weight:bold/g) ?? [])).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Render-time variables / interpolation
// ─────────────────────────────────────────────────────────────────────────────

describe('render-time interpolation', () => {
  const text = `${head}
{page[0]}
{.text.footer}
x = #0.5
y = #10
content = "Page {@odin.page} of {@odin.total_pages}"
`;

  it('resolves @odin.page and @odin.total_pages in text content', () => {
    const html = renderForm(parseForm(text), undefined, { target: 'html' });
    expect(html).toContain('Page 1 of 1');
    expect(html).not.toContain('{@odin.page}');
    expect(html).not.toContain('{@odin.total_pages}');
  });

  it('interpolates in field labels', () => {
    const t = `${head}
{page[0]}
{.field.f}
type = "text"
x = #1
y = #1
w = #2
h = #0.3
label = "Field on page {@odin.page}"
bind = @x
`;
    const html = renderForm(parseForm(t), undefined, { target: 'html' });
    expect(html).toContain('Field on page 1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Inline field values
// ─────────────────────────────────────────────────────────────────────────────

describe('inline field values', () => {
  it('parses and renders text value', () => {
    const t = `${head}\n{page[0]}\n{.field.n}\ntype = "text"\nx=#1\ny=#1\nw=#2\nh=#0.3\nlabel="N"\nvalue = "Jane"\nbind=@x`;
    const form = parseForm(t);
    const el = form.pages[0]!.elements[0] as Record<string, unknown>;
    expect(el.value).toBe('Jane');
    expect(renderForm(form, undefined, { target: 'html' })).toContain('value="Jane"');
  });

  it('parses and renders checkbox checked', () => {
    const t = `${head}\n{page[0]}\n{.field.c}\ntype = "checkbox"\nx=#1\ny=#1\nw=#0.2\nh=#0.2\nlabel="C"\nchecked = ?true\nbind=@x`;
    const form = parseForm(t);
    const el = form.pages[0]!.elements[0] as Record<string, unknown>;
    expect(el.checked).toBe(true);
    expect(renderForm(form, undefined, { target: 'html' })).toMatch(/odin-form-checkbox[^>]*checked/);
  });

  it('parses and renders select selected', () => {
    const t = `${head}\n{page[0]}\n{.field.s}\ntype = "select"\nx=#1\ny=#1\nw=#2\nh=#0.3\nlabel="S"\nselected = "B"\nbind=@x\n\n{.field.s.options[] : ~}\n"A"\n"B"`;
    const form = parseForm(t);
    const el = form.pages[0]!.elements[0] as Record<string, unknown>;
    expect(el.selected).toBe('B');
    expect(renderForm(form, undefined, { target: 'html' })).toContain('<option value="B" selected>');
  });

  it('inline value takes precedence over bound data', () => {
    const t = `${head}\n{page[0]}\n{.field.n}\ntype = "text"\nx=#1\ny=#1\nw=#2\nh=#0.3\nlabel="N"\nvalue = "Inline"\nbind=@insured.name`;
    const data = Odin.parse(`{insured}\nname = "Bound"`);
    expect(renderForm(parseForm(t), data, { target: 'html' })).toContain('value="Inline"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. select / multiselect options
// ─────────────────────────────────────────────────────────────────────────────

describe('select options resolution', () => {
  it('resolves options despite relative tabular path doubling', () => {
    const t = `${head}\n{page[0]}\n{.field.state}\ntype = "select"\nx=#1\ny=#1\nw=#2\nh=#0.3\nlabel="State"\nbind=@s\n\n{.field.state.options[] : ~}\n"AL"\n"TX"`;
    const el = parseForm(t).pages[0]!.elements[0] as Record<string, unknown>;
    expect(el.options).toEqual(['AL', 'TX']);
  });

  it('resolves multiselect options and selected array', () => {
    const t = `${head}\n{page[0]}\n{.field.cov}\ntype = "multiselect"\nx=#1\ny=#1\nw=#3\nh=#1\nlabel="Coverages"\nbind=@c\n\n{.field.cov.selected[] : ~}\n"liability"\n\n{.field.cov.options[] : ~}\n"liability"\n"collision"`;
    const el = parseForm(t).pages[0]!.elements[0] as Record<string, unknown>;
    expect(el.options).toEqual(['liability', 'collision']);
    expect(el.selected).toEqual(['liability']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. barcode type
// ─────────────────────────────────────────────────────────────────────────────

describe('barcode type', () => {
  it('honors the spec `type` property', () => {
    const t = `${head}\n{page[0]}\n{.barcode.b}\nx=#7\ny=#0.5\nw=#1\nh=#1\ntype = "qr"\ncontent = "X"\nalt = "code"`;
    const el = parseForm(t).pages[0]!.elements[0] as Record<string, unknown>;
    expect(el.barcodeType).toBe('qr');
  });

  it('renders barcode type and content as data attributes', () => {
    const t = `${head}\n{page[0]}\n{.barcode.b}\nx=#7\ny=#0.5\nw=#1\nh=#1\ntype = "pdf417"\ncontent = "PAYLOAD"\nalt = "code"`;
    const html = renderForm(parseForm(t), undefined, { target: 'html' });
    expect(html).toContain('data-barcode-type="pdf417"');
    expect(html).toContain('data-content="PAYLOAD"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. img background, text inputType, per-side margins
// ─────────────────────────────────────────────────────────────────────────────

describe('img background flag', () => {
  const t = `${head}\n{page[0]}\n{.img.bg}\nx=#0\ny=#0\nw=#8.5\nh=#11\nsrc = ^png:iVBORw0KGgo=\nalt = "bg"\nbackground = ?true`;

  it('parses background = true', () => {
    const el = parseForm(t).pages[0]!.elements[0] as Record<string, unknown>;
    expect(el.background).toBe(true);
  });

  it('renders a background image with lowest z-index and a data URI', () => {
    const html = renderForm(parseForm(t), undefined, { target: 'html' });
    expect(html).toContain('z-index:0;');
    expect(html).toContain('data:image/png;base64,');
  });
});

describe('text inputType', () => {
  it('parses and renders inputType', () => {
    for (const type of ['email', 'tel', 'password', 'number', 'url']) {
      const t = `${head}\n{page[0]}\n{.field.f}\ntype = "text"\nx=#1\ny=#1\nw=#2\nh=#0.3\nlabel="F"\ninputType = "${type}"\nbind=@x`;
      const form = parseForm(t);
      const el = form.pages[0]!.elements[0] as Record<string, unknown>;
      expect(el.inputType).toBe(type);
      expect(renderForm(form, undefined, { target: 'html' })).toContain(`type="${type}"`);
    }
  });
});

describe('per-side page margins', () => {
  it('parses margin.top/right/bottom/left', () => {
    const t = `{$}\nodin="1.0.0"\nforms="1.0.0"\ntitle="T"\nid="i"\n\n{$.page}\nwidth=#8.5\nheight=#11\nunit="inch"\nmargin.top=#0.5\nmargin.right=#0.25\nmargin.bottom=#0.6\nmargin.left=#0.75`;
    const m = parseForm(t).pageDefaults?.margin;
    expect(m).toEqual({ top: 0.5, right: 0.25, bottom: 0.6, left: 0.75 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// i18n label references
// ─────────────────────────────────────────────────────────────────────────────

describe('i18n label references', () => {
  const t = `{$}\nodin="1.0.0"\nforms="1.0.0"\ntitle="T"\nid="i"\nlang="en"\n\n{$.i18n}\nen.field_name = "Full Name"\n\n{$.page}\nwidth=#8.5\nheight=#11\nunit="inch"\n\n{page[0]}\n{.field.name}\ntype="text"\nx=#1\ny=#1\nw=#2\nh=#0.3\nlabel = @$.i18n.en.field_name\nbind=@x`;

  it('does not crash on @$.i18n.* references', () => {
    expect(() => parseForm(t)).not.toThrow();
  });

  it('resolves the i18n label to its translated value', () => {
    const el = parseForm(t).pages[0]!.elements[0] as Record<string, unknown>;
    expect(el.label).toBe('Full Name');
  });
});
