/**
 * Tests for the ODIN Forms parser.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseForm } from '../../src/forms/parser.js';

// ─────────────────────────────────────────────────────────────────────────────
// Golden fixture
// ─────────────────────────────────────────────────────────────────────────────

const fixtureText = readFileSync(
  join(import.meta.dirname, '../../../golden/forms/simple-form.odin'),
  'utf-8'
);

// ─────────────────────────────────────────────────────────────────────────────
// Metadata tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — metadata', () => {
  it('parses the form title', () => {
    const form = parseForm(fixtureText);
    expect(form.metadata.title).toBe('Test Form');
  });

  it('parses the form id', () => {
    const form = parseForm(fixtureText);
    expect(form.metadata.id).toBe('test_form_1');
  });

  it('parses the form lang', () => {
    const form = parseForm(fixtureText);
    expect(form.metadata.lang).toBe('en');
  });

  it('parses the forms schema version', () => {
    const form = parseForm(fixtureText);
    expect(form.metadata.version).toBe('1.0.0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Page defaults tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — page defaults', () => {
  it('parses page width as 8.5', () => {
    const form = parseForm(fixtureText);
    expect(form.pageDefaults?.width).toBe(8.5);
  });

  it('parses page height as 11', () => {
    const form = parseForm(fixtureText);
    expect(form.pageDefaults?.height).toBe(11);
  });

  it('parses page unit as inch', () => {
    const form = parseForm(fixtureText);
    expect(form.pageDefaults?.unit).toBe('inch');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pages and element counts
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — pages', () => {
  it('finds exactly 1 page', () => {
    const form = parseForm(fixtureText);
    expect(form.pages).toHaveLength(1);
  });

  it('finds 5 elements on page 0', () => {
    const form = parseForm(fixtureText);
    expect(form.pages[0]!.elements).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Element type identification
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — element types', () => {
  it('identifies the first element as a text element', () => {
    const form = parseForm(fixtureText);
    expect(form.pages[0]!.elements[0]!.type).toBe('text');
  });

  it('identifies the second element as a line element', () => {
    const form = parseForm(fixtureText);
    expect(form.pages[0]!.elements[1]!.type).toBe('line');
  });

  it('identifies the third element as a text field', () => {
    const form = parseForm(fixtureText);
    expect(form.pages[0]!.elements[2]!.type).toBe('field.text');
  });

  it('identifies the fourth element as a checkbox field', () => {
    const form = parseForm(fixtureText);
    expect(form.pages[0]!.elements[3]!.type).toBe('field.checkbox');
  });

  it('identifies the fifth element as a rect element', () => {
    const form = parseForm(fixtureText);
    expect(form.pages[0]!.elements[4]!.type).toBe('rect');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Element name extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — element names', () => {
  it('extracts the text element name as "title"', () => {
    const form = parseForm(fixtureText);
    expect(form.pages[0]!.elements[0]!.name).toBe('title');
  });

  it('extracts the line element name as "header_rule"', () => {
    const form = parseForm(fixtureText);
    expect(form.pages[0]!.elements[1]!.name).toBe('header_rule');
  });

  it('extracts the field name as "insured_name"', () => {
    const form = parseForm(fixtureText);
    expect(form.pages[0]!.elements[2]!.name).toBe('insured_name');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Text element properties
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — text element properties', () => {
  it('extracts text content', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[0]!;
    expect(el.type).toBe('text');
    if (el.type === 'text') {
      expect(el.content).toBe('Application');
    }
  });

  it('extracts text x position', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[0]!;
    if (el.type === 'text') {
      expect(el.x).toBe(0.5);
    }
  });

  it('extracts text font-size (integer value via ## prefix)', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[0]!;
    if (el.type === 'text') {
      expect(el['font-size']).toBe(18);
    }
  });

  it('extracts text font-weight', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[0]!;
    if (el.type === 'text') {
      expect(el['font-weight']).toBe('bold');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Line element properties
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — line element properties', () => {
  it('extracts x1', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[1]!;
    if (el.type === 'line') {
      expect(el.x1).toBe(0.5);
    }
  });

  it('extracts y1', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[1]!;
    if (el.type === 'line') {
      expect(el.y1).toBe(1.1);
    }
  });

  it('extracts x2', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[1]!;
    if (el.type === 'line') {
      expect(el.x2).toBe(8);
    }
  });

  it('extracts y2', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[1]!;
    if (el.type === 'line') {
      expect(el.y2).toBe(1.1);
    }
  });

  it('extracts stroke color', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[1]!;
    if (el.type === 'line') {
      expect(el.stroke).toBe('#000000');
    }
  });

  it('extracts stroke-width', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[1]!;
    if (el.type === 'line') {
      expect(el['stroke-width']).toBe(0.5);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Field element properties
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — field element properties', () => {
  it('extracts field label', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[2]!;
    if (el.type === 'field.text') {
      expect(el.label).toBe('Insured Name');
    }
  });

  it('extracts field bind reference', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[2]!;
    if (el.type === 'field.text') {
      expect(el.bind).toBe('@policy.insured_name');
    }
  });

  it('extracts field required flag', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[2]!;
    if (el.type === 'field.text') {
      expect(el.required).toBe(true);
    }
  });

  it('extracts field x position', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[2]!;
    if (el.type === 'field.text') {
      expect(el.x).toBe(0.5);
    }
  });

  it('extracts field width', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[2]!;
    if (el.type === 'field.text') {
      expect(el.w).toBe(3);
    }
  });

  it('extracts checkbox field bind reference without required', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[3]!;
    if (el.type === 'field.checkbox') {
      expect(el.bind).toBe('@policy.active');
      expect(el.required).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rect element properties
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — rect element properties', () => {
  it('extracts rect x position', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[4]!;
    if (el.type === 'rect') {
      expect(el.x).toBe(0.5);
    }
  });

  it('extracts rect fill color', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[4]!;
    if (el.type === 'rect') {
      expect(el.fill).toBe('#f5f5f5');
    }
  });

  it('extracts rect stroke color', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[4]!;
    if (el.type === 'rect') {
      expect(el.stroke).toBe('#cccccc');
    }
  });

  it('extracts rect rx corner radius', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[4]!;
    if (el.type === 'rect') {
      expect(el.rx).toBe(0.1);
    }
  });

  it('extracts rect ry corner radius', () => {
    const form = parseForm(fixtureText);
    const el = form.pages[0]!.elements[4]!;
    if (el.type === 'rect') {
      expect(el.ry).toBe(0.1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — id generation', () => {
  it('generates a unique id for each element', () => {
    const form = parseForm(fixtureText);
    const ids = form.pages[0]!.elements.map((el) => el.id).filter(Boolean);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every element has an id', () => {
    const form = parseForm(fixtureText);
    for (const el of form.pages[0]!.elements) {
      expect(el.id).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inline form text parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('parseForm — inline text parsing', () => {
  it('returns an empty pages array when no page sections are present', () => {
    const form = parseForm(`{$}\ntitle = "Empty"\nid = "empty"\nlang = "en"`);
    expect(form.pages).toHaveLength(0);
  });

  it('parses optional screen settings', () => {
    const text = `{$}\ntitle = "T"\nid = "i"\nlang = "en"\n{$.screen}\nscale = #1.5`;
    const form = parseForm(text);
    expect(form.screen?.scale).toBe(1.5);
  });

  it('parses optional odincode settings', () => {
    const text = `{$}\ntitle = "T"\nid = "i"\nlang = "en"\n{$.odincode}\nenabled = ?true\nzone = "bottom-center"`;
    const form = parseForm(text);
    expect(form.odincode?.enabled).toBe(true);
    expect(form.odincode?.zone).toBe('bottom-center');
  });

  it('parses a multi-page form', () => {
    const text = `
{$}
title = "Multi"
id = "multi"
lang = "en"

{page[0]}
{.rect.box1}
x = #0
y = #0
w = #1
h = #1

{page[1]}
{.rect.box2}
x = #0
y = #0
w = #1
h = #1
`;
    const form = parseForm(text);
    expect(form.pages).toHaveLength(2);
    expect(form.pages[0]!.elements).toHaveLength(1);
    expect(form.pages[1]!.elements).toHaveLength(1);
  });
});
