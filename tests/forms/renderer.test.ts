/**
 * Tests for the ODIN Forms HTML/CSS renderer.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderForm } from '../../src/forms/renderer.js';
import { parseForm } from '../../src/forms/parser.js';
import { generateFormCSS, generatePrintCSS } from '../../src/forms/css.js';
import type { OdinForm } from '../../src/forms/types.js';
import { Odin } from '../../src/odin.js';

// ─────────────────────────────────────────────────────────────────────────────
// Golden fixture
// ─────────────────────────────────────────────────────────────────────────────

const fixtureText = readFileSync(
  join(import.meta.dirname, '../../../golden/forms/simple-form.odin'),
  'utf-8',
);

// ─────────────────────────────────────────────────────────────────────────────
// Minimal test form for isolated tests
// ─────────────────────────────────────────────────────────────────────────────

function makeMinimalForm(overrides?: Partial<OdinForm>): OdinForm {
  return {
    metadata: { title: 'Test Form', id: 'test_1', lang: 'en' },
    pageDefaults: { width: 8.5, height: 11, unit: 'inch' },
    pages: [
      {
        elements: [
          {
            type: 'text',
            name: 'heading',
            content: 'Hello World',
            x: 0.5,
            y: 0.5,
          },
          {
            type: 'line',
            name: 'rule',
            x1: 0.5,
            y1: 1,
            x2: 8,
            y2: 1,
            stroke: '#000000',
          },
          {
            type: 'rect',
            name: 'box',
            x: 1,
            y: 2,
            w: 3,
            h: 2,
            fill: '#f0f0f0',
            stroke: '#cccccc',
          },
          {
            type: 'field.text',
            name: 'first_name',
            label: 'First Name',
            x: 0.5,
            y: 3,
            w: 3,
            h: 0.3,
            bind: '@person.first_name',
            required: true,
          },
          {
            type: 'field.checkbox',
            name: 'agree',
            label: 'I Agree',
            x: 0.5,
            y: 4,
            w: 0.2,
            h: 0.2,
            bind: '@person.agree',
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS generation tests
// ─────────────────────────────────────────────────────────────────────────────

describe('generateFormCSS', () => {
  it('includes .odin-form base rule', () => {
    const css = generateFormCSS();
    expect(css).toContain('.odin-form {');
  });

  it('includes .odin-form-input:focus rule', () => {
    const css = generateFormCSS();
    expect(css).toContain('.odin-form-input:focus');
    expect(css).toContain('#34A3F5');
  });

  it('includes sr-only class', () => {
    const css = generateFormCSS();
    expect(css).toContain('.odin-form-sr-only');
  });
});

describe('generatePrintCSS', () => {
  it('wraps in @media print block', () => {
    const css = generatePrintCSS();
    expect(css).toContain('@media print');
  });

  it('sets page-break-after on pages', () => {
    const css = generatePrintCSS();
    expect(css).toContain('page-break-after: always');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper tests
// ─────────────────────────────────────────────────────────────────────────────

describe('renderForm — wrapper', () => {
  it('renders with role="form" and aria-label', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('role="form"');
    expect(html).toContain('aria-label="Test Form"');
  });

  it('applies custom className', () => {
    const form = makeMinimalForm();
    const html = renderForm(form, undefined, { target: 'html', className: 'my-theme' });
    expect(html).toContain('class="odin-form my-theme"');
  });

  it('includes skip link', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('Skip to Test Form');
    expect(html).toContain('href="#odin-form-content"');
  });

  it('includes <style> block', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('<style>');
    expect(html).toContain('.odin-form {');
    expect(html).toContain('@media print');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Page dimension tests
// ─────────────────────────────────────────────────────────────────────────────

describe('renderForm — page dimensions', () => {
  it('renders page div with correct pixel dimensions (8.5" x 11")', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    // 8.5 * 96 = 816, 11 * 96 = 1056
    expect(html).toContain('width:816px');
    expect(html).toContain('height:1056px');
  });

  it('has odin-form-page class', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('class="odin-form-page"');
  });

  it('has id="odin-form-content" on page div', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('id="odin-form-content"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Element rendering tests
// ─────────────────────────────────────────────────────────────────────────────

describe('renderForm — text element', () => {
  it('renders as <span> with content', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('<span class="odin-form-element"');
    expect(html).toContain('Hello World');
  });

  it('applies absolute positioning in pixels', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    // 0.5" * 96 = 48px
    expect(html).toContain('left:48px');
    expect(html).toContain('top:48px');
  });
});

describe('renderForm — line element', () => {
  it('renders as inline SVG', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('<svg class="odin-form-element"');
    expect(html).toContain('<line ');
  });

  it('converts coordinates to pixels', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    // x1=0.5" → 48px, y1=1" → 96px
    expect(html).toContain('x1="48"');
    expect(html).toContain('y1="96"');
  });
});

describe('renderForm — rect element', () => {
  it('renders as positioned div', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    // rect at x=1, y=2, w=3, h=2 → 96, 192, 288, 192
    expect(html).toContain('left:96px;top:192px;width:288px;height:192px;');
  });

  it('applies fill and stroke', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('background:#f0f0f0');
    expect(html).toContain('border:');
    expect(html).toContain('#cccccc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Field rendering tests
// ─────────────────────────────────────────────────────────────────────────────

describe('renderForm — text field', () => {
  it('renders label + input with aria-required', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('<label for="odin-field-0-first_name"');
    expect(html).toContain('First Name');
    expect(html).toContain('<input type="text"');
    expect(html).toContain('class="odin-form-input"');
    expect(html).toContain('aria-required="true"');
  });

  it('includes the field id', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('id="odin-field-0-first_name"');
  });
});

describe('renderForm — checkbox', () => {
  it('renders label + checkbox input', () => {
    const form = makeMinimalForm();
    const html = renderForm(form);
    expect(html).toContain('<label for="odin-field-0-agree"');
    expect(html).toContain('I Agree');
    expect(html).toContain('<input type="checkbox"');
    expect(html).toContain('class="odin-form-checkbox"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Data binding tests
// ─────────────────────────────────────────────────────────────────────────────

describe('renderForm — data binding', () => {
  it('populates field values from data document', () => {
    const form = makeMinimalForm();
    const dataDoc = Odin.parse(
      `{person}\nfirst_name = "Alice"\nagree = ?true\n`,
    );
    const html = renderForm(form, dataDoc);
    expect(html).toContain('value="Alice"');
    expect(html).toContain('checked');
  });

  it('omits value attr when data has no matching path', () => {
    const form = makeMinimalForm();
    const dataDoc = Odin.parse(`{other}\nfoo = "bar"\n`);
    const html = renderForm(form, dataDoc);
    // The text input should not have a value attr
    expect(html).not.toMatch(/id="odin-field-0-first_name"[^>]*value="/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Golden fixture integration test
// ─────────────────────────────────────────────────────────────────────────────

describe('renderForm — golden fixture', () => {
  it('parses and renders without errors', () => {
    const form = parseForm(fixtureText);
    const html = renderForm(form);
    expect(html).toBeTruthy();
  });

  it('contains form wrapper with title', () => {
    const form = parseForm(fixtureText);
    const html = renderForm(form);
    expect(html).toContain('role="form"');
    expect(html).toContain('aria-label="Test Form"');
  });

  it('renders the text element "Application"', () => {
    const form = parseForm(fixtureText);
    const html = renderForm(form);
    expect(html).toContain('Application');
  });

  it('renders the header_rule line as SVG', () => {
    const form = parseForm(fixtureText);
    const html = renderForm(form);
    expect(html).toContain('<line ');
  });

  it('renders the insured_name text field', () => {
    const form = parseForm(fixtureText);
    const html = renderForm(form);
    expect(html).toContain('Insured Name');
    expect(html).toContain('<input type="text"');
    expect(html).toContain('aria-required="true"');
  });

  it('renders the active checkbox field', () => {
    const form = parseForm(fixtureText);
    const html = renderForm(form);
    expect(html).toContain('Active Policy');
    expect(html).toContain('<input type="checkbox"');
  });

  it('renders the section_box rect', () => {
    const form = parseForm(fixtureText);
    const html = renderForm(form);
    expect(html).toContain('background:#f5f5f5');
    expect(html).toContain('#cccccc');
  });

  it('includes style tag with CSS', () => {
    const form = parseForm(fixtureText);
    const html = renderForm(form);
    expect(html).toContain('<style>');
    expect(html).toContain('.odin-form-input');
  });

  it('page dimensions are 816px x 1056px', () => {
    const form = parseForm(fixtureText);
    const html = renderForm(form);
    expect(html).toContain('width:816px');
    expect(html).toContain('height:1056px');
  });
});
