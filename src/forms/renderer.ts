/**
 * ODIN Forms — HTML/CSS Renderer
 *
 * Renders a parsed OdinForm into a complete, accessible HTML string.
 * Supports absolute-positioned layout matching print coordinates,
 * ARIA attributes, skip navigation, and optional data binding.
 */

import type {
  OdinForm,
  FormElement,
  FormPage,
  RenderFormOptions,
  LineElement,
  RectElement,
  CircleElement,
  EllipseElement,
  PolygonElement,
  PolylineElement,
  PathElement,
  TextElement,
  ImageElement,
  TextFieldElement,
  CheckboxElement,
  RadioElement,
  SelectElement,
  MultiselectElement,
  DateElement,
  SignatureElement,
  BaseFieldElement,
} from './types.js';
import type { OdinDocument } from '../types/document.js';
import { toPixels } from './units.js';
import { generateFormCSS, generatePrintCSS } from './css.js';
import {
  fieldAriaAttrs,
  fieldLabelHtml,
  generateFieldId,
  skipLinkHtml,
  fieldGroupHtml,
  tabOrderSort,
} from './accessibility.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render an OdinForm to a complete HTML string.
 *
 * @param form    - Parsed OdinForm structure.
 * @param data    - Optional ODIN document for data binding (populates field values).
 * @param options - Optional rendering options (target, scale, className, lang).
 * @returns Complete HTML string including `<form>`, `<style>`, and all elements.
 */
export function renderForm(
  form: OdinForm,
  data?: OdinDocument,
  options?: RenderFormOptions,
): string {
  const title = form.metadata.title || 'ODIN Form';
  const className = options?.className ? ` ${options.className}` : '';
  const unit = form.pageDefaults?.unit ?? 'inch';

  const parts: string[] = [];

  // Wrapper
  parts.push(`<form role="form" aria-label="${escapeAttr(title)}" class="odin-form${className}">`);

  // Skip link
  parts.push(skipLinkHtml(title));

  // Style tag
  parts.push(`<style>${generateFormCSS()}\n${generatePrintCSS()}</style>`);

  // Pages
  for (let pageIndex = 0; pageIndex < form.pages.length; pageIndex++) {
    const page = form.pages[pageIndex]!;
    parts.push(renderPage(page, pageIndex, unit, form, data));
  }

  parts.push('</form>');

  return parts.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderPage(
  page: FormPage,
  pageIndex: number,
  unit: string,
  form: OdinForm,
  data?: OdinDocument,
): string {
  const w = toPixels(form.pageDefaults?.width ?? 8.5, unit);
  const h = toPixels(form.pageDefaults?.height ?? 11, unit);

  const parts: string[] = [];
  parts.push(
    `<div class="odin-form-page" id="odin-form-content" style="width:${w}px;height:${h}px;">`,
  );

  // Render non-field elements in document order
  const fieldTypes = new Set([
    'field.text', 'field.checkbox', 'field.radio', 'field.select',
    'field.multiselect', 'field.date', 'field.signature',
  ]);

  for (const el of page.elements) {
    if (!fieldTypes.has(el.type)) {
      parts.push(renderElement(el, pageIndex, unit, data));
    }
  }

  // Render field elements sorted by tab order
  const sortedFields = tabOrderSort([...page.elements]);
  for (const el of sortedFields) {
    parts.push(renderElement(el, pageIndex, unit, data));
  }

  parts.push('</div>');
  return parts.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Element Dispatch
// ─────────────────────────────────────────────────────────────────────────────

function renderElement(
  el: FormElement,
  pageIndex: number,
  unit: string,
  data?: OdinDocument,
): string {
  switch (el.type) {
    case 'line':        return renderLine(el, unit);
    case 'rect':        return renderRect(el, unit);
    case 'circle':      return renderCircle(el, unit);
    case 'ellipse':     return renderEllipse(el, unit);
    case 'polygon':     return renderPolygon(el, unit);
    case 'polyline':    return renderPolyline(el, unit);
    case 'path':        return renderPath(el, unit);
    case 'text':        return renderText(el, unit);
    case 'img':         return renderImage(el, unit);
    case 'field.text':  return renderTextField(el, pageIndex, unit, data);
    case 'field.checkbox': return renderCheckbox(el, pageIndex, unit, data);
    case 'field.radio': return renderRadio(el, pageIndex, unit, data);
    case 'field.select': return renderSelect(el, pageIndex, unit, data);
    case 'field.multiselect': return renderMultiselect(el, pageIndex, unit, data);
    case 'field.date':  return renderDate(el, pageIndex, unit, data);
    case 'field.signature': return renderSignature(el, pageIndex, unit);
    default:
      return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometric Elements
// ─────────────────────────────────────────────────────────────────────────────

function renderLine(el: LineElement, unit: string): string {
  const x1 = toPixels(el.x1, unit);
  const y1 = toPixels(el.y1, unit);
  const x2 = toPixels(el.x2, unit);
  const y2 = toPixels(el.y2, unit);
  const stroke = el.stroke ?? '#000000';
  const strokeWidth = el['stroke-width'] ? toPixels(el['stroke-width'], unit) : 1;
  return (
    `<svg class="odin-form-element" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;">` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}"/>` +
    `</svg>`
  );
}

function renderRect(el: RectElement, unit: string): string {
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const border = el.stroke ? `border:${el['stroke-width'] ? toPixels(el['stroke-width'], unit) : 1}px solid ${el.stroke};` : '';
  const bg = el.fill && el.fill !== 'none' ? `background:${el.fill};` : '';
  const rx = el.rx ? toPixels(el.rx, unit) : 0;
  const ry = el.ry ? toPixels(el.ry, unit) : 0;
  const radius = rx || ry ? `border-radius:${rx}px ${ry}px;` : '';
  return `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${border}${bg}${radius}"></div>`;
}

function renderCircle(el: CircleElement, unit: string): string {
  const cx = toPixels(el.cx, unit);
  const cy = toPixels(el.cy, unit);
  const r = toPixels(el.r, unit);
  const stroke = el.stroke ?? '#000000';
  const strokeWidth = el['stroke-width'] ? toPixels(el['stroke-width'], unit) : 1;
  const fill = el.fill ?? 'none';
  return (
    `<svg class="odin-form-element" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}"/>` +
    `</svg>`
  );
}

function renderEllipse(el: EllipseElement, unit: string): string {
  const cx = toPixels(el.cx, unit);
  const cy = toPixels(el.cy, unit);
  const rx = toPixels(el.rx, unit);
  const ry = toPixels(el.ry, unit);
  const stroke = el.stroke ?? '#000000';
  const strokeWidth = el['stroke-width'] ? toPixels(el['stroke-width'], unit) : 1;
  const fill = el.fill ?? 'none';
  return (
    `<svg class="odin-form-element" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;">` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}"/>` +
    `</svg>`
  );
}

function renderPolygon(el: PolygonElement, unit: string): string {
  const points = convertPoints(el.points, unit);
  const stroke = el.stroke ?? '#000000';
  const strokeWidth = el['stroke-width'] ? toPixels(el['stroke-width'], unit) : 1;
  const fill = el.fill ?? 'none';
  return (
    `<svg class="odin-form-element" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;">` +
    `<polygon points="${points}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}"/>` +
    `</svg>`
  );
}

function renderPolyline(el: PolylineElement, unit: string): string {
  const points = convertPoints(el.points, unit);
  const stroke = el.stroke ?? '#000000';
  const strokeWidth = el['stroke-width'] ? toPixels(el['stroke-width'], unit) : 1;
  return (
    `<svg class="odin-form-element" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;">` +
    `<polyline points="${points}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="none"/>` +
    `</svg>`
  );
}

function renderPath(el: PathElement, unit: string): string {
  const stroke = el.stroke ?? '#000000';
  const strokeWidth = el['stroke-width'] ? toPixels(el['stroke-width'], unit) : 1;
  const fill = el.fill ?? 'none';
  return (
    `<svg class="odin-form-element" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;">` +
    `<path d="${el.d}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}"/>` +
    `</svg>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Content Elements
// ─────────────────────────────────────────────────────────────────────────────

function renderText(el: TextElement, unit: string): string {
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const fontSize = el['font-size'] ? toPixels(el['font-size'], 'pt') : toPixels(12, 'pt');
  const fontWeight = el['font-weight'] ?? 'normal';
  const color = el.color ?? '#000000';
  const fontFamily = el['font-family'] ? `font-family:${el['font-family']};` : '';
  const fontStyle = el['font-style'] === 'italic' ? 'font-style:italic;' : '';
  const textAlign = el['text-align'] ? `text-align:${el['text-align']};` : '';
  return `<span class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;font-size:${fontSize}px;font-weight:${fontWeight};color:${color};${fontFamily}${fontStyle}${textAlign}">${escapeHtml(el.content)}</span>`;
}

function renderImage(el: ImageElement, unit: string): string {
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  return `<img class="odin-form-element" src="${escapeAttr(el.src)}" alt="${escapeAttr(el.alt)}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Elements
// ─────────────────────────────────────────────────────────────────────────────

function renderTextField(
  el: TextFieldElement,
  pageIndex: number,
  unit: string,
  data?: OdinDocument,
): string {
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);
  const value = lookupBoundValue(el, data);
  const valueAttr = value !== undefined ? ` value="${escapeAttr(value)}"` : '';
  const requiredAttr = el.required ? ' required' : '';
  const readonlyAttr = el.readonly ? ' readonly' : '';
  const placeholderAttr = el.placeholder ? ` placeholder="${escapeAttr(el.placeholder)}"` : '';

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(el.label, inputId) +
    `<input type="text" class="odin-form-input" id="${attrs.id}" aria-label="${escapeAttr(attrs['aria-label']!)}"${attrs['aria-required'] ? ' aria-required="true"' : ''}${valueAttr}${requiredAttr}${readonlyAttr}${placeholderAttr}>` +
    `</div>`
  );
}

function renderCheckbox(
  el: CheckboxElement,
  pageIndex: number,
  unit: string,
  data?: OdinDocument,
): string {
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);
  const value = lookupBoundValue(el, data);
  const checked = value === 'true' ? ' checked' : '';

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(el.label, inputId) +
    `<input type="checkbox" class="odin-form-checkbox" id="${attrs.id}" aria-label="${escapeAttr(attrs['aria-label']!)}"${attrs['aria-required'] ? ' aria-required="true"' : ''}${checked}>` +
    `</div>`
  );
}

function renderRadio(
  el: RadioElement,
  pageIndex: number,
  unit: string,
  data?: OdinDocument,
): string {
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const value = lookupBoundValue(el, data);
  const checked = value === el.value ? ' checked' : '';

  const radioHtml =
    `<input type="radio" class="odin-form-radio" id="${attrs.id}" name="${escapeAttr(el.group)}" value="${escapeAttr(el.value)}" aria-label="${escapeAttr(attrs['aria-label']!)}"${attrs['aria-required'] ? ' aria-required="true"' : ''}${checked}>` +
    `<label for="${attrs.id}">${escapeHtml(el.label)}</label>`;

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldGroupHtml(el.group, el.label, radioHtml) +
    `</div>`
  );
}

function renderSelect(
  el: SelectElement,
  pageIndex: number,
  unit: string,
  data?: OdinDocument,
): string {
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);
  const value = lookupBoundValue(el, data);

  let optionsHtml = '';
  if (el.placeholder) {
    optionsHtml += `<option value="">${escapeHtml(el.placeholder)}</option>`;
  }
  for (const opt of el.options) {
    const selected = value === opt ? ' selected' : '';
    optionsHtml += `<option value="${escapeAttr(opt)}"${selected}>${escapeHtml(opt)}</option>`;
  }

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(el.label, inputId) +
    `<select class="odin-form-select" id="${attrs.id}" aria-label="${escapeAttr(attrs['aria-label']!)}"${attrs['aria-required'] ? ' aria-required="true"' : ''}>` +
    optionsHtml +
    `</select>` +
    `</div>`
  );
}

function renderMultiselect(
  el: MultiselectElement,
  pageIndex: number,
  unit: string,
  data?: OdinDocument,
): string {
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);
  const value = lookupBoundValue(el, data);
  const selectedValues = value ? value.split(',').map((v) => v.trim()) : [];

  let optionsHtml = '';
  for (const opt of el.options) {
    const selected = selectedValues.includes(opt) ? ' selected' : '';
    optionsHtml += `<option value="${escapeAttr(opt)}"${selected}>${escapeHtml(opt)}</option>`;
  }

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(el.label, inputId) +
    `<select multiple class="odin-form-select" id="${attrs.id}" aria-label="${escapeAttr(attrs['aria-label']!)}"${attrs['aria-required'] ? ' aria-required="true"' : ''}>` +
    optionsHtml +
    `</select>` +
    `</div>`
  );
}

function renderDate(
  el: DateElement,
  pageIndex: number,
  unit: string,
  data?: OdinDocument,
): string {
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);
  const value = lookupBoundValue(el, data);
  const valueAttr = value !== undefined ? ` value="${escapeAttr(value)}"` : '';
  const requiredAttr = el.required ? ' required' : '';

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(el.label, inputId) +
    `<input type="date" class="odin-form-input" id="${attrs.id}" aria-label="${escapeAttr(attrs['aria-label']!)}"${attrs['aria-required'] ? ' aria-required="true"' : ''}${valueAttr}${requiredAttr}>` +
    `</div>`
  );
}

function renderSignature(
  el: SignatureElement,
  pageIndex: number,
  unit: string,
): string {
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(el.label, inputId) +
    `<div class="odin-form-signature" id="${attrs.id}" aria-label="${escapeAttr(attrs['aria-label']!)}"${attrs['aria-required'] ? ' aria-required="true"' : ''} role="img" tabindex="0" style="width:100%;height:100%;"></div>` +
    `</div>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Binding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Looks up a field's bound value in the data document.
 *
 * The `bind` property uses `@path.to.value` syntax. We strip the leading `@`
 * and resolve the path against the data document.
 */
function lookupBoundValue(
  el: BaseFieldElement,
  data?: OdinDocument,
): string | undefined {
  if (!data || !el.bind) return undefined;

  const path = el.bind.startsWith('@') ? el.bind.slice(1) : el.bind;
  if (!path) return undefined;

  const val = data.get(path);
  if (val === undefined) return undefined;

  switch (val.type) {
    case 'string':    return val.value;
    case 'number':    return String(val.value);
    case 'integer':   return String(val.value);
    case 'boolean':   return String(val.value);
    default:          return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Converts an SVG `points` string (space-separated x,y pairs in page units)
 * to pixel values.
 */
function convertPoints(points: string, unit: string): string {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',');
      if (x === undefined || y === undefined) return pair;
      return `${toPixels(parseFloat(x), unit)},${toPixels(parseFloat(y), unit)}`;
    })
    .join(' ');
}
