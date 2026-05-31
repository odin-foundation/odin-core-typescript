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
  BarcodeElement,
  TextFieldElement,
  CheckboxElement,
  RadioElement,
  SelectElement,
  MultiselectElement,
  DateElement,
  SignatureElement,
  RegionElement,
  RegionChild,
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

  // Two-pass: first determine the concrete render plan (pages + overflow), then
  // render with the final total page count so `@odin.total_pages` resolves.
  const plan = buildRenderPlan(form, data);
  const totalPages = plan.length;
  const pageW = toPixels(form.pageDefaults?.width ?? 8.5, unit);
  const pageH = toPixels(form.pageDefaults?.height ?? 11, unit);

  const parts: string[] = [];
  parts.push(`<form role="form" aria-label="${escapeAttr(title)}" class="odin-form${className}">`);
  parts.push(skipLinkHtml(title));
  parts.push(`<style>${generateFormCSS()}\n${generatePrintCSS()}</style>`);

  for (let i = 0; i < plan.length; i++) {
    const planned = plan[i]!;
    const ctx: RenderContext = {
      pageNumber: i + 1,
      totalPages,
      unit,
      data,
      pageWidthPx: pageW,
      pageHeightPx: pageH,
    };
    parts.push(renderPlannedPage(planned, ctx));
  }

  parts.push('</form>');

  return parts.join('');
}

/** Render-time context for a single output page. */
interface RenderContext {
  /** 1-based page number in the final output. */
  readonly pageNumber: number;
  /** Total pages after overflow calculation. */
  readonly totalPages: number;
  readonly unit: string;
  readonly data: OdinDocument | undefined;
  readonly pageWidthPx: number;
  readonly pageHeightPx: number;
}

/** A page to render: either a concrete page or a template-generated overflow page. */
interface PlannedPage {
  readonly elements: readonly FormElement[];
  /** For overflow pages: the slice of bound items this page renders, per region. */
  readonly itemSlices?: Map<string, { start: number; count: number; bind: string }>;
}

/**
 * Build the ordered list of output pages, expanding region overflow when bound
 * array data is present. Without data, concrete pages render as-is.
 */
function buildRenderPlan(form: OdinForm, data?: OdinDocument): PlannedPage[] {
  const plan: PlannedPage[] = [];

  for (const page of form.pages) {
    plan.push({ elements: page.elements });

    if (!data) continue;

    // Generate overflow pages for any region whose bound data exceeds `max`.
    for (const el of page.elements) {
      if (el.type !== 'region') continue;
      const region = el;
      if (!region.bind || region.max === undefined || !region.overflow) continue;
      // A non-positive page capacity can't paginate; skip overflow.
      if (!Number.isFinite(region.max) || region.max < 1) continue;
      const count = boundArrayLength(region.bind, data);
      if (count <= region.max) continue;

      let consumed = region.max;
      let templateName = region.overflow.startsWith('@')
        ? region.overflow.slice(1)
        : undefined;
      // `clone` reuses the same page; a template ref uses that template.
      let guard = 0;
      while (consumed < count && guard++ < 10000) {
        const tpl = templateName ? form.templates?.[templateName] : undefined;
        const tplRegion = tpl?.elements.find(
          (e): e is RegionElement => e.type === 'region' && e.name === region.name,
        );
        const candidateMax = tplRegion?.max ?? region.max;
        const pageMax = Number.isFinite(candidateMax) && candidateMax >= 1 ? candidateMax : region.max;
        const slices = new Map<string, { start: number; count: number; bind: string }>();
        slices.set(region.name, {
          start: consumed,
          count: Math.min(pageMax, count - consumed),
          bind: region.bind,
        });
        const elements = tpl ? tpl.elements : page.elements;
        plan.push({ elements, itemSlices: slices });
        consumed += pageMax;
        // Follow the template's own overflow target for further pages.
        if (tplRegion?.overflow?.startsWith('@')) {
          templateName = tplRegion.overflow.slice(1);
        }
      }
    }
  }

  return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderPlannedPage(page: PlannedPage, ctx: RenderContext): string {
  const pageIndex = ctx.pageNumber - 1;

  const parts: string[] = [];
  parts.push(
    `<div class="odin-form-page" id="odin-form-content" data-page="${ctx.pageNumber}" style="width:${ctx.pageWidthPx}px;height:${ctx.pageHeightPx}px;">`,
  );

  const fieldTypes = new Set([
    'field.text', 'field.checkbox', 'field.radio', 'field.select',
    'field.multiselect', 'field.date', 'field.signature',
  ]);

  // Background images first (lowest z-index), then non-field elements, then fields.
  for (const el of page.elements) {
    if (el.type === 'img' && el.background) {
      parts.push(renderElement(el, pageIndex, ctx, page));
    }
  }
  for (const el of page.elements) {
    if (el.type === 'img' && el.background) continue;
    if (!fieldTypes.has(el.type)) {
      parts.push(renderElement(el, pageIndex, ctx, page));
    }
  }
  const sortedFields = tabOrderSort([...page.elements]);
  for (const el of sortedFields) {
    parts.push(renderElement(el, pageIndex, ctx, page));
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
  ctx: RenderContext,
  page: PlannedPage,
): string {
  const unit = ctx.unit;
  switch (el.type) {
    case 'line':        return renderLine(el, unit);
    case 'rect':        return renderRect(el, unit);
    case 'circle':      return renderCircle(el, unit);
    case 'ellipse':     return renderEllipse(el, unit);
    case 'polygon':     return renderPolygon(el, unit);
    case 'polyline':    return renderPolyline(el, unit);
    case 'path':        return renderPath(el, unit);
    case 'text':        return renderText(el, ctx);
    case 'img':         return renderImage(el, ctx);
    case 'barcode':     return renderBarcode(el, ctx);
    case 'field.text':  return renderTextField(el, pageIndex, ctx);
    case 'field.checkbox': return renderCheckbox(el, pageIndex, ctx);
    case 'field.radio': return renderRadio(el, pageIndex, ctx);
    case 'field.select': return renderSelect(el, pageIndex, ctx);
    case 'field.multiselect': return renderMultiselect(el, pageIndex, ctx);
    case 'field.date':  return renderDate(el, pageIndex, ctx);
    case 'field.signature': return renderSignature(el, pageIndex, ctx);
    case 'region':      return renderRegion(el, ctx, page);
    default:
      return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Interpolation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve `{@odin.page}` / `{@odin.total_pages}` interpolation tokens in a
 * string. Unknown `{@odin.*}` tokens are left untouched.
 */
function interpolate(text: string, ctx: RenderContext): string {
  return text.replace(/\{@odin\.([a-z_]+)\}/g, (match, name: string) => {
    switch (name) {
      case 'page':        return String(ctx.pageNumber);
      case 'total_pages': return String(ctx.totalPages);
      default:            return match;
    }
  });
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

function renderText(el: TextElement, ctx: RenderContext): string {
  const unit = ctx.unit;
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const fontSize = el['font-size'] ? toPixels(el['font-size'], 'pt') : toPixels(12, 'pt');
  const fontWeight = el['font-weight'] ?? 'normal';
  const color = el.color ?? '#000000';
  const fontFamily = el['font-family'] ? `font-family:${el['font-family']};` : '';
  const fontStyle = el['font-style'] === 'italic' ? 'font-style:italic;' : '';
  const textAlign = el['text-align'] ? `text-align:${el['text-align']};` : '';
  const content = interpolate(el.content, ctx);
  return `<span class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;font-size:${fontSize}px;font-weight:${fontWeight};color:${color};${fontFamily}${fontStyle}${textAlign}">${escapeHtml(content)}</span>`;
}

function renderImage(el: ImageElement, ctx: RenderContext): string {
  const unit = ctx.unit;
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const src = imageSrcToDataUri(el.src);
  const alt = interpolate(el.alt, ctx);
  const zIndex = el.background ? 'z-index:0;' : '';
  return `<img class="odin-form-element" src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${zIndex}">`;
}

function renderBarcode(el: BarcodeElement, ctx: RenderContext): string {
  const unit = ctx.unit;
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const alt = interpolate(el.alt, ctx);
  const content = interpolate(el.content, ctx);
  return (
    `<div class="odin-form-element odin-form-barcode" role="img" aria-label="${escapeAttr(alt)}" ` +
    `data-barcode-type="${escapeAttr(el.barcodeType)}" data-content="${escapeAttr(content)}" ` +
    `style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;"></div>`
  );
}

/**
 * Convert an ODIN binary literal (`^png:base64`) to a data URI for `<img>`.
 * Passes through values already in data-URI or URL form.
 */
function imageSrcToDataUri(src: string): string {
  if (!src.startsWith('^')) return src;
  const rest = src.slice(1);
  const colon = rest.indexOf(':');
  if (colon === -1) return `data:image/png;base64,${rest}`;
  const format = rest.slice(0, colon);
  const b64 = rest.slice(colon + 1);
  return `data:image/${format};base64,${b64}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Elements
// ─────────────────────────────────────────────────────────────────────────────

function renderTextField(
  el: TextFieldElement,
  pageIndex: number,
  ctx: RenderContext,
): string {
  const unit = ctx.unit;
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);
  const value = el.value ?? lookupBoundValue(el, ctx.data);
  const valueAttr = value !== undefined ? ` value="${escapeAttr(value)}"` : '';
  const requiredAttr = el.required ? ' required' : '';
  const readonlyAttr = el.readonly ? ' readonly' : '';
  const placeholderAttr = el.placeholder ? ` placeholder="${escapeAttr(el.placeholder)}"` : '';
  const inputType = el.inputType ?? 'text';

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(interpolate(el.label, ctx), inputId) +
    `<input type="${escapeAttr(inputType)}" class="odin-form-input" id="${attrs.id}" aria-label="${escapeAttr(interpolate(attrs['aria-label']!, ctx))}"${attrs['aria-required'] ? ' aria-required="true"' : ''}${valueAttr}${requiredAttr}${readonlyAttr}${placeholderAttr}>` +
    `</div>`
  );
}

function renderCheckbox(
  el: CheckboxElement,
  pageIndex: number,
  ctx: RenderContext,
): string {
  const unit = ctx.unit;
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);
  const bound = lookupBoundValue(el, ctx.data);
  const isChecked = el.checked ?? (bound === 'true');
  const checked = isChecked ? ' checked' : '';

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(interpolate(el.label, ctx), inputId) +
    `<input type="checkbox" class="odin-form-checkbox" id="${attrs.id}" aria-label="${escapeAttr(interpolate(attrs['aria-label']!, ctx))}"${attrs['aria-required'] ? ' aria-required="true"' : ''}${checked}>` +
    `</div>`
  );
}

function renderRadio(
  el: RadioElement,
  pageIndex: number,
  ctx: RenderContext,
): string {
  const unit = ctx.unit;
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const value = lookupBoundValue(el, ctx.data);
  const checked = value === el.value ? ' checked' : '';

  const radioHtml =
    `<input type="radio" class="odin-form-radio" id="${attrs.id}" name="${escapeAttr(el.group)}" value="${escapeAttr(el.value)}" aria-label="${escapeAttr(interpolate(attrs['aria-label']!, ctx))}"${attrs['aria-required'] ? ' aria-required="true"' : ''}${checked}>` +
    `<label for="${attrs.id}">${escapeHtml(interpolate(el.label, ctx))}</label>`;

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldGroupHtml(el.group, interpolate(el.label, ctx), radioHtml) +
    `</div>`
  );
}

function renderSelect(
  el: SelectElement,
  pageIndex: number,
  ctx: RenderContext,
): string {
  const unit = ctx.unit;
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);
  const value = el.selected ?? lookupBoundValue(el, ctx.data);

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
    fieldLabelHtml(interpolate(el.label, ctx), inputId) +
    `<select class="odin-form-select" id="${attrs.id}" aria-label="${escapeAttr(interpolate(attrs['aria-label']!, ctx))}"${attrs['aria-required'] ? ' aria-required="true"' : ''}>` +
    optionsHtml +
    `</select>` +
    `</div>`
  );
}

function renderMultiselect(
  el: MultiselectElement,
  pageIndex: number,
  ctx: RenderContext,
): string {
  const unit = ctx.unit;
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);
  let selectedValues: string[];
  if (el.selected !== undefined) {
    selectedValues = [...el.selected];
  } else {
    const value = lookupBoundValue(el, ctx.data);
    selectedValues = value ? value.split(',').map((v) => v.trim()) : [];
  }

  let optionsHtml = '';
  for (const opt of el.options) {
    const selected = selectedValues.includes(opt) ? ' selected' : '';
    optionsHtml += `<option value="${escapeAttr(opt)}"${selected}>${escapeHtml(opt)}</option>`;
  }

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(interpolate(el.label, ctx), inputId) +
    `<select multiple class="odin-form-select" id="${attrs.id}" aria-label="${escapeAttr(interpolate(attrs['aria-label']!, ctx))}"${attrs['aria-required'] ? ' aria-required="true"' : ''}>` +
    optionsHtml +
    `</select>` +
    `</div>`
  );
}

function renderDate(
  el: DateElement,
  pageIndex: number,
  ctx: RenderContext,
): string {
  const unit = ctx.unit;
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);
  const value = el.value ?? lookupBoundValue(el, ctx.data);
  const valueAttr = value !== undefined ? ` value="${escapeAttr(value)}"` : '';
  const requiredAttr = el.required ? ' required' : '';

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(interpolate(el.label, ctx), inputId) +
    `<input type="date" class="odin-form-input" id="${attrs.id}" aria-label="${escapeAttr(interpolate(attrs['aria-label']!, ctx))}"${attrs['aria-required'] ? ' aria-required="true"' : ''}${valueAttr}${requiredAttr}>` +
    `</div>`
  );
}

function renderSignature(
  el: SignatureElement,
  pageIndex: number,
  ctx: RenderContext,
): string {
  const unit = ctx.unit;
  const x = toPixels(el.x, unit);
  const y = toPixels(el.y, unit);
  const w = toPixels(el.w, unit);
  const h = toPixels(el.h, unit);
  const attrs = fieldAriaAttrs(el, pageIndex);
  const inputId = generateFieldId(el.name, pageIndex);

  return (
    `<div class="odin-form-element" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;">` +
    fieldLabelHtml(interpolate(el.label, ctx), inputId) +
    `<div class="odin-form-signature" id="${attrs.id}" aria-label="${escapeAttr(interpolate(attrs['aria-label']!, ctx))}"${attrs['aria-required'] ? ' aria-required="true"' : ''} role="img" tabindex="0" style="width:100%;height:100%;"></div>` +
    `</div>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Region Rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a region: repeat its children for each bound array item, positioning
 * each repetition by `y-offset`/`x-offset` relative to the region origin.
 *
 * Without bound data, the region renders a single empty instance so the static
 * layout is still visible.
 */
function renderRegion(
  el: RegionElement,
  ctx: RenderContext,
  page: PlannedPage,
): string {
  const unit = ctx.unit;
  const regionX = toPixels(el.x, unit);
  const regionY = toPixels(el.y, unit);
  const regionW = toPixels(el.w, unit);
  const regionH = toPixels(el.h, unit);

  const slice = page.itemSlices?.get(el.name);
  // On overflow pages the template region may omit `bind`; inherit it from the slice.
  const bind = el.bind ?? slice?.bind;
  const total = bind ? boundArrayLength(bind, ctx.data) : 0;
  let start = 0;
  let count: number;
  if (slice) {
    start = slice.start;
    count = slice.count;
  } else if (total > 0) {
    count = el.max !== undefined ? Math.min(el.max, total) : total;
  } else {
    count = 1; // empty layout preview
  }

  const parts: string[] = [];
  parts.push(
    `<div class="odin-form-element odin-form-region" data-region="${escapeAttr(el.name)}" ` +
    `style="position:absolute;left:${regionX}px;top:${regionY}px;width:${regionW}px;height:${regionH}px;">`,
  );

  for (let i = 0; i < count; i++) {
    const itemIndex = start + i;
    const itemBind = bind ? `${bind}[${itemIndex}]` : undefined;
    for (const child of el.children) {
      parts.push(renderRegionChild(child, i, itemBind, ctx));
    }
  }

  parts.push('</div>');
  return parts.join('');
}

/**
 * Render one region child for repetition index `i`. Coordinates are rebased by
 * the per-item `y-offset`/`x-offset`; field children get a unique name and have
 * their `@.field` relative binding resolved against the current item. Rendering
 * is delegated to the same element renderers used for top-level elements so all
 * field types, styling, and accessibility are preserved.
 */
function renderRegionChild(
  child: RegionChild,
  i: number,
  itemBind: string | undefined,
  ctx: RenderContext,
): string {
  const yOffset = child['y-offset'] ?? 0;
  const xOffset = child['x-offset'] ?? 0;
  const dx = child.x + xOffset * i;
  const dy = child.y + yOffset * i;

  if (child.type === 'text') {
    return renderText({ ...child, x: dx, y: dy }, ctx);
  }

  // Field child: rebase coords, make the name unique per item, and resolve the
  // `@.field` relative binding against the current item path.
  const resolvedBind = resolveRelativeBind(child.bind, itemBind) ?? child.bind;
  const rebased = {
    ...child,
    x: dx,
    y: dy,
    name: `${child.name}_${i}`,
    bind: resolvedBind,
  } as RegionChild;
  // Region children render on a synthetic page index so generated IDs are unique.
  const childPageIndex = -1 - i;
  return renderElement(rebased, childPageIndex, ctx, { elements: [] });
}

/** Resolve a region child's `@.field` relative bind against the current item path. */
function resolveRelativeBind(bind: string, itemBind: string | undefined): string | undefined {
  if (!bind) return undefined;
  if (bind.startsWith('@.')) {
    if (!itemBind) return undefined;
    return `${itemBind}.${bind.slice(2)}`;
  }
  return bind;
}

/**
 * Number of items in a bound array path. Counts both scalar elements
 * (`path[n]`) and object elements (`path[n].field`) in a single path scan.
 */
function boundArrayLength(bind: string, data?: OdinDocument): number {
  if (!data) return 0;
  const path = bind.startsWith('@') ? bind.slice(1) : bind;
  const re = new RegExp(`^${escapeRegExpRenderer(path)}\\[(\\d+)\\](?:\\.|$)`);
  let max = -1;
  for (const p of data.paths()) {
    const m = re.exec(p);
    if (m) {
      const idx = parseInt(m[1]!, 10);
      if (idx > max) max = idx;
    }
  }
  return max + 1;
}

function escapeRegExpRenderer(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    .replace(/'/g, '&#39;')
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
