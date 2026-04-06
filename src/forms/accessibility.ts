/**
 * ODIN Forms — Accessibility Utilities
 *
 * Pure helper functions used by the HTML renderer to generate accessible
 * markup. No side effects, no DOM access — all functions return strings or
 * plain objects.
 */

import type { BaseFieldElement, FormElement } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Field element type guard
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_TYPES = new Set([
  'field.text',
  'field.checkbox',
  'field.radio',
  'field.select',
  'field.multiselect',
  'field.date',
  'field.signature',
]);

function isFieldElement(el: FormElement): el is BaseFieldElement & FormElement {
  return FIELD_TYPES.has(el.type);
}

// ─────────────────────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a unique, stable HTML element ID for a form field.
 *
 * @param elementName - The element's `name` property.
 * @param pageIndex   - Zero-based index of the page containing the element.
 * @returns `odin-field-{pageIndex}-{elementName}`
 */
export function generateFieldId(elementName: string, pageIndex: number): string {
  return `odin-field-${pageIndex}-${elementName}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label HTML
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns an HTML `<label>` element associated with the given input ID.
 *
 * @param label   - Visible label text.
 * @param inputId - Value of the `for` attribute (must match the input's `id`).
 */
export function fieldLabelHtml(label: string, inputId: string): string {
  return `<label for="${inputId}" class="odin-form-label">${label}</label>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARIA attributes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a plain object of ARIA and `id` attributes for a field element.
 *
 * Included attributes:
 * - `id`            — from `generateFieldId` (uses element name; caller must
 *                     supply `pageIndex`).
 * - `aria-label`    — from `element['aria-label']` if set, otherwise
 *                     `element.label`.
 * - `aria-required` — `"true"` when `element.required` is truthy; omitted
 *                     otherwise.
 *
 * @param element   - A field element that extends `BaseFieldElement`.
 * @param pageIndex - Zero-based index of the page containing the element.
 */
export function fieldAriaAttrs(
  element: BaseFieldElement,
  pageIndex: number,
): Record<string, string> {
  const attrs: Record<string, string> = {
    id: generateFieldId(element.name, pageIndex),
    'aria-label': element['aria-label'] ?? element.label,
  };

  if (element.required) {
    attrs['aria-required'] = 'true';
  }

  return attrs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fieldset / radio group HTML
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps `content` in a `<fieldset>` with a `<legend>` for grouped controls
 * (e.g. radio button groups).
 *
 * @param groupName - Logical group identifier (not rendered; reserved for
 *                    future use such as `name` attributes).
 * @param legend    - Human-readable group label rendered inside `<legend>`.
 * @param content   - Pre-rendered HTML string of the group's child elements.
 */
export function fieldGroupHtml(groupName: string, legend: string, content: string): string {
  // groupName is accepted for API symmetry and future use (e.g. data attributes).
  void groupName;
  return (
    `<fieldset class="odin-form-fieldset">` +
    `<legend class="odin-form-legend">${legend}</legend>` +
    `${content}` +
    `</fieldset>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns only the field elements from `elements`, sorted by natural reading
 * order: top-to-bottom (ascending `y`), then left-to-right (ascending `x`).
 *
 * Geometric and content elements (`line`, `rect`, `text`, `img`, `barcode`,
 * etc.) are excluded from the result.
 *
 * @param elements - All elements on a single page.
 */
export function tabOrderSort(elements: FormElement[]): FormElement[] {
  return elements
    .filter(isFieldElement)
    .sort((a, b) => {
      const fieldA = a as BaseFieldElement & FormElement;
      const fieldB = b as BaseFieldElement & FormElement;
      if (fieldA.y !== fieldB.y) return fieldA.y - fieldB.y;
      return fieldA.x - fieldB.x;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen-reader helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a skip-navigation link that allows keyboard users to bypass
 * repeated page chrome and jump directly to the form content.
 *
 * The link targets `#odin-form-content`, which the renderer must place on the
 * main form container.
 *
 * @param formTitle - Descriptive form name used in the link text.
 */
export function skipLinkHtml(formTitle: string): string {
  return (
    `<a class="odin-form-sr-only odin-form-skip" href="#odin-form-content">` +
    `Skip to ${formTitle}` +
    `</a>`
  );
}

/**
 * Wraps `text` in a visually-hidden `<span>` that is still announced by
 * screen readers.
 *
 * Relies on the `.odin-form-sr-only` CSS class (clip-path / position
 * absolute pattern) being present in the renderer's stylesheet.
 *
 * @param text - Text to expose to assistive technology only.
 */
export function srOnlyHtml(text: string): string {
  return `<span class="odin-form-sr-only">${text}</span>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// WCAG contrast utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts an 8-bit sRGB channel value (0–255) to its linear-light component
 * as defined by the WCAG 2.x relative luminance formula.
 */
function linearize(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/**
 * Parses a 6-digit hex colour string to an `[r, g, b]` triple (0–255 each).
 * The leading `#` is optional.
 *
 * @throws {Error} if the string is not a valid 6-digit hex colour.
 */
function parseHex(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Invalid hex colour: "${hex}"`);
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/**
 * Computes the WCAG 2.x relative luminance of a 6-digit hex colour.
 *
 * Result is in the range [0, 1], where 0 is pure black and 1 is pure white.
 */
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Computes the WCAG 2.x contrast ratio between two hex colours.
 *
 * The ratio is always ≥ 1. A ratio of 1 means identical colours; 21 is the
 * maximum (black on white or white on black).
 *
 * Formula: `(L1 + 0.05) / (L2 + 0.05)` where `L1 ≥ L2`.
 *
 * @param fg - Foreground colour as a 6-digit hex string (e.g. `#1a2b3c`).
 * @param bg - Background colour as a 6-digit hex string.
 */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Returns `true` when the contrast ratio between `fg` and `bg` satisfies
 * WCAG 2.x Level AA requirements for the given font size.
 *
 * Thresholds:
 * - Normal text (< 18 pt):  ratio ≥ 4.5
 * - Large text  (≥ 18 pt):  ratio ≥ 3.0
 *
 * Note: bold text ≥ 14 pt also qualifies as "large text" per WCAG, but this
 * function uses font size alone. Callers that know the weight should pass
 * `fontSize >= 14` for bold text.
 *
 * @param fg       - Foreground colour as a 6-digit hex string.
 * @param bg       - Background colour as a 6-digit hex string.
 * @param fontSize - Font size in points.
 */
export function meetsContrastAA(fg: string, bg: string, fontSize: number): boolean {
  const ratio = contrastRatio(fg, bg);
  const isLargeText = fontSize >= 18;
  return isLargeText ? ratio >= 3.0 : ratio >= 4.5;
}
