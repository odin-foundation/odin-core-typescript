/**
 * Golden tests for ODIN Forms.
 *
 * Loads the shared forms manifest and exercises parse + render conformance.
 * This is the cross-language contract for Forms.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseForm, renderForm } from '../../src/forms/index.js';
import type { OdinForm, FormElement, RegionElement } from '../../src/forms/index.js';
import { Odin } from '../../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const formsDir = path.resolve(__dirname, '../../../golden/forms');

interface ElementExpectation {
  type?: string;
  bind?: string;
  max?: number | string;
  overflow?: string;
  childCount?: number;
  value?: string;
  inputType?: string;
  checked?: boolean;
  selected?: string;
  options?: string[];
  min?: string;
  label?: string;
  barcodeType?: string;
  background?: boolean;
}

interface ExpectParse {
  pages?: number;
  margins?: Record<string, number>;
  templates?: Record<
    string,
    {
      pageTemplate?: boolean;
      continues?: string;
      formId?: string;
      elementTypes?: string[];
    }
  >;
  page0?: {
    elementTypes?: string[];
    elements?: Record<string, ElementExpectation>;
  };
}

interface FormsGoldenTest {
  id: string;
  description: string;
  formFile: string;
  renderData?: string;
  expectParse?: ExpectParse;
  renderContains?: string[];
  renderNotContains?: string[];
}

interface FormsSuite {
  suite: string;
  description: string;
  tests: FormsGoldenTest[];
}

function findElement(elements: readonly FormElement[], name: string): FormElement | undefined {
  return elements.find((e) => e.name === name);
}

function checkElement(el: FormElement | undefined, exp: ElementExpectation): void {
  expect(el, `element not found`).toBeDefined();
  const e = el as Record<string, unknown>;
  if (exp.type !== undefined) expect(e.type).toBe(exp.type);
  if (exp.bind !== undefined) expect(e.bind).toBe(exp.bind);
  if (exp.max !== undefined) expect(e.max).toBe(exp.max);
  if (exp.overflow !== undefined) expect(e.overflow).toBe(exp.overflow);
  if (exp.childCount !== undefined) {
    expect((el as RegionElement).children.length).toBe(exp.childCount);
  }
  if (exp.value !== undefined) expect(e.value).toBe(exp.value);
  if (exp.inputType !== undefined) expect(e.inputType).toBe(exp.inputType);
  if (exp.checked !== undefined) expect(e.checked).toBe(exp.checked);
  if (exp.selected !== undefined) expect(e.selected).toBe(exp.selected);
  if (exp.options !== undefined) expect(e.options).toEqual(exp.options);
  if (exp.min !== undefined) expect(e.min).toBe(exp.min);
  if (exp.label !== undefined) expect(e.label).toBe(exp.label);
  if (exp.barcodeType !== undefined) expect(e.barcodeType).toBe(exp.barcodeType);
  if (exp.background !== undefined) expect(e.background).toBe(exp.background);
}

const manifestPath = path.join(formsDir, 'manifest.json');
const suite: FormsSuite | undefined = fs.existsSync(manifestPath)
  ? (JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as FormsSuite)
  : undefined;

describe('Golden Forms Tests', () => {
  if (!suite) {
    it('manifest exists', () => {
      expect(suite).toBeDefined();
    });
    return;
  }

  describe(suite.description || suite.suite, () => {
    for (const test of suite.tests) {
      it(test.description || test.id, () => {
        const formText = fs.readFileSync(path.join(formsDir, test.formFile), 'utf-8');
        const form: OdinForm = parseForm(formText);

        if (test.expectParse) {
          const ep = test.expectParse;

          if (ep.pages !== undefined) {
            expect(form.pages.length).toBe(ep.pages);
          }

          if (ep.margins) {
            for (const [side, value] of Object.entries(ep.margins)) {
              expect((form.pageDefaults?.margin as Record<string, number>)?.[side]).toBe(value);
            }
          }

          if (ep.templates) {
            for (const [name, t] of Object.entries(ep.templates)) {
              const tpl = form.templates?.[name];
              expect(tpl, `template ${name} missing`).toBeDefined();
              if (t.pageTemplate !== undefined) expect(tpl!.pageTemplate).toBe(t.pageTemplate);
              if (t.continues !== undefined) expect(tpl!.continues).toBe(t.continues);
              if (t.formId !== undefined) expect(tpl!.formId).toBe(t.formId);
              if (t.elementTypes) {
                expect(tpl!.elements.map((e) => e.type)).toEqual(t.elementTypes);
              }
            }
          }

          if (ep.page0) {
            const page0 = form.pages[0]!;
            if (ep.page0.elementTypes) {
              expect(page0.elements.map((e) => e.type)).toEqual(ep.page0.elementTypes);
            }
            if (ep.page0.elements) {
              for (const [name, exp] of Object.entries(ep.page0.elements)) {
                checkElement(findElement(page0.elements, name), exp);
              }
            }
          }
        }

        if (
          test.renderContains ||
          test.renderNotContains
        ) {
          const data = test.renderData ? Odin.parse(test.renderData) : undefined;
          const html = renderForm(form, data, { target: 'html' });
          for (const needle of test.renderContains ?? []) {
            expect(html, `expected render to contain: ${needle}`).toContain(needle);
          }
          for (const needle of test.renderNotContains ?? []) {
            expect(html, `expected render NOT to contain: ${needle}`).not.toContain(needle);
          }
        }
      });
    }
  });
});
