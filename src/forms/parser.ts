/**
 * ODIN Forms 1.0 — Form Parser
 *
 * Parses a `.odin` forms document into a typed OdinForm structure.
 * Delegates low-level ODIN parsing to Odin.parse(), then maps the
 * resulting flat path space onto the strongly-typed Forms 1.0 schema.
 */

import { Odin } from '../odin.js';
import type { OdinDocument } from '../types/document.js';
import type { OdinValue } from '../types/values.js';
import type {
  OdinForm,
  FormMetadata,
  PageDefaults,
  PageMargins,
  ScreenSettings,
  OdincodeSettings,
  FormPage,
  FormElement,
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
  PageTemplate,
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an ODIN forms document text into a typed OdinForm.
 *
 * @param text - Raw ODIN text from a `.odin` forms file
 * @returns Parsed OdinForm with metadata, page defaults, and pages
 * @throws {ParseError} If the text is not valid ODIN
 */
export function parseForm(text: string): OdinForm {
  // `{@tpl_*}` template headers are not valid core ODIN sections, so split them
  // out before parsing and parse each template body separately.
  const { body, templateBlocks } = splitTemplates(text);

  const doc = Odin.parse(body);

  const metadata = extractMetadata(doc);
  const pageDefaults = extractPageDefaults(doc);
  const screen = extractScreen(doc);
  const odincode = extractOdincode(doc);
  const i18n = extractI18n(doc);
  const pages = extractPages(doc, i18n);
  const templates = extractTemplates(templateBlocks, i18n);

  return {
    metadata,
    ...(pageDefaults !== undefined && { pageDefaults }),
    ...(screen !== undefined && { screen }),
    ...(odincode !== undefined && { odincode }),
    ...(i18n !== undefined && { i18n }),
    pages,
    ...(templates !== undefined && { templates }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Template Extraction
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateBlock {
  /** Full template name, e.g. `tpl_vehicles_continued`. */
  name: string;
  /** Lines of the template body (everything after the `{@tpl_*}` header). */
  text: string;
}

/**
 * Split a forms document into its core-parseable body and the raw text of each
 * `{@tpl_*}` template block. A template block runs from its header line until
 * the next top-level section (`{$...}`, `{page[...]}`, or another `{@tpl_*}`).
 */
function splitTemplates(text: string): { body: string; templateBlocks: TemplateBlock[] } {
  const lines = text.split(/\r?\n/);
  const bodyLines: string[] = [];
  const templateBlocks: TemplateBlock[] = [];

  const tplHeader = /^\s*\{\s*@(tpl_[A-Za-z0-9_]+)\s*\}\s*$/;
  const topLevelHeader = /^\s*\{\s*(\$|page\[\d+\]|@tpl_)/;

  let current: TemplateBlock | undefined;
  for (const line of lines) {
    const tplMatch = tplHeader.exec(line);
    if (tplMatch) {
      current = { name: tplMatch[1]!, text: '' };
      templateBlocks.push(current);
      continue;
    }
    if (current) {
      // A new top-level (non-template) section ends the current template.
      if (topLevelHeader.test(line) && !tplHeader.test(line)) {
        current = undefined;
        bodyLines.push(line);
      } else {
        current.text += line + '\n';
      }
      continue;
    }
    bodyLines.push(line);
  }

  return { body: reanchor(bodyLines.join('\n')), templateBlocks };
}

/**
 * A relative tabular header (`{.x[] : ...}`) leaves the core parser's parent
 * context pointing at the field, so any following relative header (`{.region…}`,
 * `{.field…}`) nests under it. Re-emit the active top-level anchor (`{page[N]}`
 * or the section root) after each such block so siblings resolve correctly.
 */
function reanchor(text: string, rootAnchor?: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  const anchorHeader = /^\s*\{\s*(page\[\d+\]|tpl\.[A-Za-z0-9_]+)\s*\}\s*$/;
  const relativeHeader = /^\s*\{\s*\./;
  const relativeTabular = /^\s*\{\s*\.[^}]*\[\]\s*:/;

  let anchor = rootAnchor;
  let needsReanchor = false;

  for (const line of lines) {
    const anchorMatch = anchorHeader.exec(line);
    if (anchorMatch) {
      anchor = `{${anchorMatch[1]}}`;
      needsReanchor = false;
      out.push(line);
      continue;
    }

    if (relativeHeader.test(line)) {
      if (needsReanchor && anchor) {
        out.push(anchor);
        needsReanchor = false;
      }
      if (relativeTabular.test(line)) {
        needsReanchor = true;
      }
      out.push(line);
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

/**
 * Parse each template block body into a PageTemplate. The body is reparented
 * under a synthetic `{tpl.<name>}` section so it parses as ordinary ODIN.
 */
function extractTemplates(
  blocks: TemplateBlock[],
  i18n: Record<string, string> | undefined
): Record<string, PageTemplate> | undefined {
  if (blocks.length === 0) return undefined;

  const templates: Record<string, PageTemplate> = {};
  for (const block of blocks) {
    const root = `tpl.${block.name}`;
    const synthetic = reanchor(`{${root}}\n${block.text}`, `{${root}}`);
    const doc = Odin.parse(synthetic);

    const prefix = `${root}.`;
    const pageTemplate = getBooleanValue(doc, `${prefix}page-template`) ?? true;
    const continues = getStringValue(doc, `${prefix}continues`);
    const formId = getStringValue(doc, `${prefix}form-id`);
    const elements = extractElements(doc, prefix, i18n);

    templates[block.name] = {
      name: block.name,
      pageTemplate,
      ...(continues !== undefined && { continues }),
      ...(formId !== undefined && { formId }),
      elements,
    };
  }
  return templates;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata and Settings Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractMetadata(doc: OdinDocument): FormMetadata {
  const meta: FormMetadata = {
    title: getStringValue(doc, '$.title') ?? '',
    id: getStringValue(doc, '$.id') ?? '',
    lang: getStringValue(doc, '$.lang') ?? 'en',
  } as FormMetadata;
  const version = getStringValue(doc, '$.forms');
  if (version) (meta as any).version = version;
  return meta;
}

function extractPageDefaults(doc: OdinDocument): PageDefaults | undefined {
  const width = getNumberValue(doc, '$.page.width');
  const height = getNumberValue(doc, '$.page.height');
  const unit = getStringValue(doc, '$.page.unit');
  const margin = extractMargins(doc);

  if (width === undefined && height === undefined && unit === undefined) {
    return undefined;
  }

  const validUnits = ['inch', 'cm', 'mm', 'pt'] as const;
  const resolvedUnit = validUnits.includes(unit as (typeof validUnits)[number])
    ? (unit as PageDefaults['unit'])
    : 'inch';

  return {
    width: width ?? 8.5,
    height: height ?? 11,
    unit: resolvedUnit,
    ...(margin !== undefined && { margin }),
  };
}

/** Read per-side margins from `$.page.margin.{top,right,bottom,left}`. */
function extractMargins(doc: OdinDocument): PageMargins | undefined {
  const top = getNumberValue(doc, '$.page.margin.top');
  const right = getNumberValue(doc, '$.page.margin.right');
  const bottom = getNumberValue(doc, '$.page.margin.bottom');
  const left = getNumberValue(doc, '$.page.margin.left');
  if (top === undefined && right === undefined && bottom === undefined && left === undefined) {
    return undefined;
  }
  return {
    ...(top !== undefined && { top }),
    ...(right !== undefined && { right }),
    ...(bottom !== undefined && { bottom }),
    ...(left !== undefined && { left }),
  };
}

function extractScreen(doc: OdinDocument): ScreenSettings | undefined {
  const scale = getNumberValue(doc, '$.screen.scale');
  if (scale === undefined) return undefined;
  return { scale };
}

function extractOdincode(doc: OdinDocument): OdincodeSettings | undefined {
  const enabled = getBooleanValue(doc, '$.odincode.enabled');
  const zone = getStringValue(doc, '$.odincode.zone');
  if (enabled === undefined && zone === undefined) return undefined;

  const validZones = ['top-center', 'bottom-center'] as const;
  const resolvedZone = validZones.includes(zone as (typeof validZones)[number])
    ? (zone as OdincodeSettings['zone'])
    : 'bottom-center';

  return {
    enabled: enabled ?? false,
    zone: resolvedZone,
  };
}

function extractI18n(doc: OdinDocument): Record<string, string> | undefined {
  const i18nPaths = doc.paths().filter((p) => p.startsWith('$.i18n.'));
  if (i18nPaths.length === 0) return undefined;

  const result: Record<string, string> = {};
  for (const path of i18nPaths) {
    const key = path.slice('$.i18n.'.length);
    const value = getStringValue(doc, path);
    if (key && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page and Element Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walk all paths to find distinct page indices, then for each page
 * collect elements in document order.
 */
function extractPages(
  doc: OdinDocument,
  i18n: Record<string, string> | undefined
): readonly FormPage[] {
  const allPaths = doc.paths();

  // Find all page indices referenced in paths like page[N].*
  const pageIndices = new Set<number>();
  const pagePathPattern = /^page\[(\d+)\]\./;

  for (const path of allPaths) {
    const match = pagePathPattern.exec(path);
    if (match) {
      pageIndices.add(parseInt(match[1]!, 10));
    }
  }

  if (pageIndices.size === 0) {
    return [];
  }

  // Sort page indices numerically
  const sortedIndices = Array.from(pageIndices).sort((a, b) => a - b);

  // Build pages in index order
  const pages: FormPage[] = [];
  for (const index of sortedIndices) {
    pages.push({ elements: extractElements(doc, `page[${index}].`, i18n) });
  }

  return pages;
}

/**
 * Collect element keys under `prefix` in document order and build each element.
 * An element key is `{elementType}.{elementName}` (e.g. `text.title`,
 * `region.vehicles`). Region children are absorbed by their region.
 */
function extractElements(
  doc: OdinDocument,
  prefix: string,
  i18n: Record<string, string> | undefined
): readonly FormElement[] {
  const allPaths = doc.paths().filter((p) => p.startsWith(prefix));

  const elementKeysSeen = new Set<string>();
  const elementKeysOrdered: string[] = [];

  for (const path of allPaths) {
    const rest = path.slice(prefix.length); // e.g. "text.title.content"
    const parts = rest.split('.');
    if (parts.length >= 2) {
      const elementKey = `${parts[0]}.${parts[1]}`; // "text.title" / "region.vehicles"
      if (!elementKeysSeen.has(elementKey)) {
        elementKeysSeen.add(elementKey);
        elementKeysOrdered.push(elementKey);
      }
    }
  }

  let idCounter = 0;
  const elements: FormElement[] = [];
  for (const elementKey of elementKeysOrdered) {
    const [elementType, elementName] = elementKey.split('.') as [string, string];
    const elementPrefix = `${prefix}${elementKey}.`;
    const element = buildElement(doc, elementType, elementName, elementPrefix, idCounter++, i18n);
    if (element !== undefined) {
      elements.push(element);
    }
  }

  return elements;
}

// ─────────────────────────────────────────────────────────────────────────────
// Element Builder Dispatch
// ─────────────────────────────────────────────────────────────────────────────

function buildElement(
  doc: OdinDocument,
  elementType: string,
  elementName: string,
  prefix: string,
  idCounter: number,
  i18n: Record<string, string> | undefined
): FormElement | undefined {
  const id = `${elementType}_${elementName}_${idCounter}`;

  switch (elementType) {
    case 'line':
      return buildLineElement(doc, elementName, id, prefix);
    case 'rect':
      return buildRectElement(doc, elementName, id, prefix);
    case 'circle':
      return buildCircleElement(doc, elementName, id, prefix);
    case 'ellipse':
      return buildEllipseElement(doc, elementName, id, prefix);
    case 'polygon':
      return buildPolygonElement(doc, elementName, id, prefix);
    case 'polyline':
      return buildPolylineElement(doc, elementName, id, prefix);
    case 'path':
      return buildPathElement(doc, elementName, id, prefix);
    case 'text':
      return buildTextElement(doc, elementName, id, prefix, i18n);
    case 'img':
      return buildImageElement(doc, elementName, id, prefix, i18n);
    case 'barcode':
      return buildBarcodeElement(doc, elementName, id, prefix, i18n);
    case 'field':
      return buildFieldElement(doc, elementName, id, prefix, i18n);
    case 'region':
      return buildRegionElement(doc, elementName, id, prefix, i18n);
    default:
      return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometric Element Builders
// ─────────────────────────────────────────────────────────────────────────────

function buildLineElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string
): LineElement {
  return {
    type: 'line',
    name,
    id,
    x1: getNumberValue(doc, `${prefix}x1`) ?? 0,
    y1: getNumberValue(doc, `${prefix}y1`) ?? 0,
    x2: getNumberValue(doc, `${prefix}x2`) ?? 0,
    y2: getNumberValue(doc, `${prefix}y2`) ?? 0,
    ...extractStroked(doc, prefix),
  };
}

function buildRectElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string
): RectElement {
  return {
    type: 'rect',
    name,
    id,
    x: getNumberValue(doc, `${prefix}x`) ?? 0,
    y: getNumberValue(doc, `${prefix}y`) ?? 0,
    w: getNumberValue(doc, `${prefix}w`) ?? 0,
    h: getNumberValue(doc, `${prefix}h`) ?? 0,
    ...(getNumberValue(doc, `${prefix}rx`) !== undefined && { rx: getNumberValue(doc, `${prefix}rx`) }),
    ...(getNumberValue(doc, `${prefix}ry`) !== undefined && { ry: getNumberValue(doc, `${prefix}ry`) }),
    ...extractStroked(doc, prefix),
    ...extractFilled(doc, prefix),
  } as RectElement;
}

function buildCircleElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string
): CircleElement {
  return {
    type: 'circle',
    name,
    id,
    cx: getNumberValue(doc, `${prefix}cx`) ?? 0,
    cy: getNumberValue(doc, `${prefix}cy`) ?? 0,
    r: getNumberValue(doc, `${prefix}r`) ?? 0,
    ...extractStroked(doc, prefix),
    ...extractFilled(doc, prefix),
  };
}

function buildEllipseElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string
): EllipseElement {
  return {
    type: 'ellipse',
    name,
    id,
    cx: getNumberValue(doc, `${prefix}cx`) ?? 0,
    cy: getNumberValue(doc, `${prefix}cy`) ?? 0,
    rx: getNumberValue(doc, `${prefix}rx`) ?? 0,
    ry: getNumberValue(doc, `${prefix}ry`) ?? 0,
    ...extractStroked(doc, prefix),
    ...extractFilled(doc, prefix),
  };
}

function buildPolygonElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string
): PolygonElement {
  return {
    type: 'polygon',
    name,
    id,
    points: getStringValue(doc, `${prefix}points`) ?? '',
    ...extractStroked(doc, prefix),
    ...extractFilled(doc, prefix),
  };
}

function buildPolylineElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string
): PolylineElement {
  return {
    type: 'polyline',
    name,
    id,
    points: getStringValue(doc, `${prefix}points`) ?? '',
    ...extractStroked(doc, prefix),
  };
}

function buildPathElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string
): PathElement {
  return {
    type: 'path',
    name,
    id,
    d: getStringValue(doc, `${prefix}d`) ?? '',
    ...extractStroked(doc, prefix),
    ...extractFilled(doc, prefix),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Content Element Builders
// ─────────────────────────────────────────────────────────────────────────────

function buildTextElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string,
  i18n: Record<string, string> | undefined
): TextElement {
  return {
    type: 'text',
    name,
    id,
    content: getLabelValue(doc, `${prefix}content`, i18n) ?? '',
    x: getNumberValue(doc, `${prefix}x`) ?? 0,
    y: getNumberValue(doc, `${prefix}y`) ?? 0,
    ...(getNumberValue(doc, `${prefix}rotate`) !== undefined && {
      rotate: getNumberValue(doc, `${prefix}rotate`),
    }),
    ...extractFonted(doc, prefix),
  } as TextElement;
}

function buildImageElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string,
  i18n: Record<string, string> | undefined
): ImageElement {
  const background = getBooleanValue(doc, `${prefix}background`);
  return {
    type: 'img',
    name,
    id,
    src: getBinaryLiteral(doc, `${prefix}src`) ?? '',
    alt: getLabelValue(doc, `${prefix}alt`, i18n) ?? '',
    x: getNumberValue(doc, `${prefix}x`) ?? 0,
    y: getNumberValue(doc, `${prefix}y`) ?? 0,
    w: getNumberValue(doc, `${prefix}w`) ?? 0,
    h: getNumberValue(doc, `${prefix}h`) ?? 0,
    ...(background !== undefined && { background }),
  };
}

function buildBarcodeElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string,
  i18n: Record<string, string> | undefined
): BarcodeElement {
  const barcodeType =
    getStringValue(doc, `${prefix}type`) ?? getStringValue(doc, `${prefix}barcode-type`) ?? 'code128';
  const validTypes = ['code39', 'code128', 'qr', 'datamatrix', 'pdf417'] as const;
  const resolvedType = validTypes.includes(barcodeType as (typeof validTypes)[number])
    ? (barcodeType as BarcodeElement['barcodeType'])
    : 'code128';

  return {
    type: 'barcode',
    name,
    id,
    barcodeType: resolvedType,
    content: getLabelValue(doc, `${prefix}content`, i18n) ?? '',
    alt: getLabelValue(doc, `${prefix}alt`, i18n) ?? '',
    x: getNumberValue(doc, `${prefix}x`) ?? 0,
    y: getNumberValue(doc, `${prefix}y`) ?? 0,
    w: getNumberValue(doc, `${prefix}w`) ?? 0,
    h: getNumberValue(doc, `${prefix}h`) ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Element Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildFieldElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string,
  i18n: Record<string, string> | undefined
): FormElement | undefined {
  const fieldType = getStringValue(doc, `${prefix}type`) ?? 'text';
  const baseField = extractBaseField(doc, name, id, prefix, i18n);

  switch (fieldType) {
    case 'text':
      return buildTextField(doc, prefix, baseField);
    case 'checkbox':
      return buildCheckboxField(doc, prefix, baseField);
    case 'radio':
      return buildRadioField(doc, prefix, baseField);
    case 'select':
      return buildSelectField(doc, prefix, baseField);
    case 'multiselect':
      return buildMultiselectField(doc, prefix, baseField);
    case 'date':
      return buildDateField(doc, prefix, baseField);
    case 'signature':
      return buildSignatureField(doc, prefix, baseField);
    default:
      // Unknown field type — return as text field
      return buildTextField(doc, prefix, baseField);
  }
}

/** Properties shared across all field types */
interface BaseFieldProps {
  name: string;
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bind: string;
  required?: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: string | number;
  max?: string | number;
  'aria-label'?: string;
  tabindex?: number;
  readonly?: boolean;
}

function extractBaseField(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string,
  i18n: Record<string, string> | undefined
): BaseFieldProps {
  const required = getBooleanValue(doc, `${prefix}required`);
  const tabindex = getNumberValue(doc, `${prefix}tabindex`);
  const minLength = getNumberValue(doc, `${prefix}minLength`);
  const maxLength = getNumberValue(doc, `${prefix}maxLength`);
  const min = getNumberValue(doc, `${prefix}min`) ?? getScalarString(doc, `${prefix}min`);
  const max = getNumberValue(doc, `${prefix}max`) ?? getScalarString(doc, `${prefix}max`);
  const ariaLabel = getLabelValue(doc, `${prefix}aria-label`, i18n);
  const readonlyVal = getBooleanValue(doc, `${prefix}readonly`);
  const bindRef = getReferenceValue(doc, `${prefix}bind`);

  return {
    name,
    id,
    label: getLabelValue(doc, `${prefix}label`, i18n) ?? '',
    x: getNumberValue(doc, `${prefix}x`) ?? 0,
    y: getNumberValue(doc, `${prefix}y`) ?? 0,
    w: getNumberValue(doc, `${prefix}w`) ?? 0,
    h: getNumberValue(doc, `${prefix}h`) ?? 0,
    bind: bindRef !== undefined ? `@${bindRef}` : '',
    ...(required !== undefined && { required }),
    ...(tabindex !== undefined && { tabindex }),
    ...(minLength !== undefined && { minLength }),
    ...(maxLength !== undefined && { maxLength }),
    ...(min !== undefined && { min }),
    ...(max !== undefined && { max }),
    ...(ariaLabel !== undefined && { 'aria-label': ariaLabel }),
    ...(readonlyVal !== undefined && { readonly: readonlyVal }),
  };
}

function buildTextField(
  doc: OdinDocument,
  prefix: string,
  base: BaseFieldProps
): TextFieldElement {
  const value = getScalarString(doc, `${prefix}value`);
  const inputType = getStringValue(doc, `${prefix}inputType`);
  const mask = getStringValue(doc, `${prefix}mask`);
  const placeholder = getStringValue(doc, `${prefix}placeholder`);
  const multiline = getBooleanValue(doc, `${prefix}multiline`);
  const maxLines = getNumberValue(doc, `${prefix}maxLines`);

  const validInputTypes = ['text', 'email', 'tel', 'password', 'number', 'url'] as const;
  const resolvedInputType = validInputTypes.includes(
    inputType as (typeof validInputTypes)[number]
  )
    ? (inputType as TextFieldElement['inputType'])
    : undefined;

  return {
    type: 'field.text',
    ...base,
    ...(value !== undefined && { value }),
    ...(resolvedInputType !== undefined && { inputType: resolvedInputType }),
    ...(mask !== undefined && { mask }),
    ...(placeholder !== undefined && { placeholder }),
    ...(multiline !== undefined && { multiline }),
    ...(maxLines !== undefined && { maxLines }),
  };
}

function buildCheckboxField(
  doc: OdinDocument,
  prefix: string,
  base: BaseFieldProps
): CheckboxElement {
  const checked = getBooleanValue(doc, `${prefix}checked`);
  return { type: 'field.checkbox', ...base, ...(checked !== undefined && { checked }) };
}

function buildRadioField(
  doc: OdinDocument,
  prefix: string,
  base: BaseFieldProps
): RadioElement {
  return {
    type: 'field.radio',
    ...base,
    group: getStringValue(doc, `${prefix}group`) ?? '',
    value: getStringValue(doc, `${prefix}value`) ?? '',
  };
}

function buildSelectField(
  doc: OdinDocument,
  prefix: string,
  base: BaseFieldProps
): SelectElement {
  const selected = getStringValue(doc, `${prefix}selected`);
  const placeholder = getStringValue(doc, `${prefix}placeholder`);

  return {
    type: 'field.select',
    ...base,
    options: extractOptions(doc, prefix),
    ...(selected !== undefined && { selected }),
    ...(placeholder !== undefined && { placeholder }),
  };
}

function buildMultiselectField(
  doc: OdinDocument,
  prefix: string,
  base: BaseFieldProps
): MultiselectElement {
  const selected = extractFieldArray(doc, prefix, 'selected');
  const minSelect = getNumberValue(doc, `${prefix}minSelect`);
  const maxSelect = getNumberValue(doc, `${prefix}maxSelect`);

  return {
    type: 'field.multiselect',
    ...base,
    options: extractOptions(doc, prefix),
    ...(selected !== undefined && { selected }),
    ...(minSelect !== undefined && { minSelect }),
    ...(maxSelect !== undefined && { maxSelect }),
  };
}

function buildDateField(
  doc: OdinDocument,
  prefix: string,
  base: BaseFieldProps
): DateElement {
  const value = getScalarString(doc, `${prefix}value`);
  return { type: 'field.date', ...base, ...(value !== undefined && { value }) };
}

function buildSignatureField(
  doc: OdinDocument,
  prefix: string,
  base: BaseFieldProps
): SignatureElement {
  const value = getBinaryLiteral(doc, `${prefix}value`);
  const dateField = getStringValue(doc, `${prefix}date_field`);
  return {
    type: 'field.signature',
    ...base,
    ...(value !== undefined && { value }),
    ...(dateField !== undefined && { date_field: dateField }),
  };
}

/** Extract a field's `options` array. */
function extractOptions(doc: OdinDocument, prefix: string): readonly string[] {
  return extractFieldArray(doc, prefix, 'options') ?? [];
}

/**
 * Extract a field's tabular string array (`options` / `selected`). Because a
 * relative tabular header (`{.field.x.options[] : ~}`) resolves against the
 * field's own path, the array lands at `<prefix><field>.<name>[n]` rather than
 * `<prefix><name>[n]`. Search for it regardless of that extra segment.
 */
function extractFieldArray(
  doc: OdinDocument,
  prefix: string,
  name: string
): string[] | undefined {
  // Direct location first.
  const direct = collectIndexed(doc, `${prefix}${name}`);
  if (direct.length > 0) return direct;

  // Fall back: any `*.<name>[n]` directly under this field's prefix.
  const re = new RegExp(`^${escapeRegExp(prefix)}(?:[^.]+\\.)*${escapeRegExp(name)}\\[(\\d+)\\]$`);
  const indices: { idx: number; path: string }[] = [];
  for (const p of doc.paths()) {
    const m = re.exec(p);
    if (m) indices.push({ idx: parseInt(m[1]!, 10), path: p });
  }
  if (indices.length === 0) return undefined;
  indices.sort((a, b) => a.idx - b.idx);
  const out: string[] = [];
  for (const { path } of indices) {
    const v = getStringValue(doc, path);
    if (v !== undefined) out.push(v);
  }
  return out;
}

/** Collect a contiguous indexed string array at `base[0]`, `base[1]`, ... */
function collectIndexed(doc: OdinDocument, base: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (doc.has(`${base}[${i}]`)) {
    const v = getStringValue(doc, `${base}[${i}]`);
    if (v !== undefined) out.push(v);
    i++;
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────────────────────
// Region Element Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildRegionElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string,
  i18n: Record<string, string> | undefined
): RegionElement {
  const bind = getReferenceValue(doc, `${prefix}bind`);
  const max = getNumberValue(doc, `${prefix}max`);
  const overflow =
    getReferenceValue(doc, `${prefix}overflow`) ?? getStringValue(doc, `${prefix}overflow`);

  const children = extractRegionChildren(doc, prefix, i18n);

  return {
    type: 'region',
    name,
    id,
    x: getNumberValue(doc, `${prefix}x`) ?? 0,
    y: getNumberValue(doc, `${prefix}y`) ?? 0,
    w: getNumberValue(doc, `${prefix}w`) ?? 0,
    h: getNumberValue(doc, `${prefix}h`) ?? 0,
    ...(bind !== undefined && { bind: `@${bind}` }),
    ...(max !== undefined && { max }),
    ...(overflow !== undefined && {
      overflow: getReferenceValue(doc, `${prefix}overflow`) !== undefined ? `@${overflow}` : overflow,
    }),
    children,
  };
}

/**
 * Collect a region's child elements. Children live under
 * `<regionPrefix><childType>.<childName>.*` (e.g. `...region.vehicles.field.vin.x`).
 * Region own-properties (x/y/w/h/bind/max/overflow) are skipped.
 */
function extractRegionChildren(
  doc: OdinDocument,
  prefix: string,
  i18n: Record<string, string> | undefined
): readonly RegionChild[] {
  const ownProps = new Set(['x', 'y', 'w', 'h', 'bind', 'max', 'overflow']);
  const childTypes = new Set(['text', 'field', 'img', 'barcode']);

  const keysSeen = new Set<string>();
  const keysOrdered: string[] = [];
  for (const path of doc.paths()) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const parts = rest.split('.');
    if (parts.length < 2) continue;
    if (ownProps.has(parts[0]!)) continue;
    if (!childTypes.has(parts[0]!)) continue;
    const key = `${parts[0]}.${parts[1]}`;
    if (!keysSeen.has(key)) {
      keysSeen.add(key);
      keysOrdered.push(key);
    }
  }

  let idCounter = 0;
  const children: RegionChild[] = [];
  for (const key of keysOrdered) {
    const [childType, childName] = key.split('.') as [string, string];
    const childPrefix = `${prefix}${key}.`;
    const built = buildElement(doc, childType, childName, childPrefix, idCounter++, i18n);
    if (built === undefined) continue;
    const yOffset = getNumberValue(doc, `${childPrefix}y-offset`);
    const xOffset = getNumberValue(doc, `${childPrefix}x-offset`);
    const child = {
      ...built,
      ...(yOffset !== undefined && { 'y-offset': yOffset }),
      ...(xOffset !== undefined && { 'x-offset': xOffset }),
    } as RegionChild;
    children.push(child);
  }
  return children;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style Mixin Extractors
// ─────────────────────────────────────────────────────────────────────────────

function extractStroked(
  doc: OdinDocument,
  prefix: string
): Partial<{
  stroke: string;
  'stroke-width': number;
  'stroke-opacity': number;
  'stroke-dasharray': string;
  'stroke-linecap': 'butt' | 'round' | 'square';
  'stroke-linejoin': 'miter' | 'round' | 'bevel';
}> {
  const result: Record<string, unknown> = {};

  const stroke = getStringValue(doc, `${prefix}stroke`);
  if (stroke !== undefined) result['stroke'] = stroke;

  const strokeWidth = getNumberValue(doc, `${prefix}stroke-width`);
  if (strokeWidth !== undefined) result['stroke-width'] = strokeWidth;

  const strokeOpacity = getNumberValue(doc, `${prefix}stroke-opacity`);
  if (strokeOpacity !== undefined) result['stroke-opacity'] = strokeOpacity;

  const strokeDasharray = getStringValue(doc, `${prefix}stroke-dasharray`);
  if (strokeDasharray !== undefined) result['stroke-dasharray'] = strokeDasharray;

  const strokeLinecap = getStringValue(doc, `${prefix}stroke-linecap`);
  if (strokeLinecap !== undefined) result['stroke-linecap'] = strokeLinecap;

  const strokeLinejoin = getStringValue(doc, `${prefix}stroke-linejoin`);
  if (strokeLinejoin !== undefined) result['stroke-linejoin'] = strokeLinejoin;

  return result;
}

function extractFilled(
  doc: OdinDocument,
  prefix: string
): Partial<{ fill: string; 'fill-opacity': number }> {
  const result: Record<string, unknown> = {};

  const fill = getStringValue(doc, `${prefix}fill`);
  if (fill !== undefined) result['fill'] = fill;

  const fillOpacity = getNumberValue(doc, `${prefix}fill-opacity`);
  if (fillOpacity !== undefined) result['fill-opacity'] = fillOpacity;

  return result;
}

function extractFonted(
  doc: OdinDocument,
  prefix: string
): Partial<{
  'font-family': string;
  'font-size': number;
  'font-weight': 'normal' | 'bold';
  'font-style': 'normal' | 'italic';
  'text-align': 'left' | 'center' | 'right';
  color: string;
}> {
  const result: Record<string, unknown> = {};

  const fontFamily = getStringValue(doc, `${prefix}font-family`);
  if (fontFamily !== undefined) result['font-family'] = fontFamily;

  const fontSize = getNumberValue(doc, `${prefix}font-size`);
  if (fontSize !== undefined) result['font-size'] = fontSize;

  const fontWeight = getStringValue(doc, `${prefix}font-weight`);
  if (fontWeight !== undefined) result['font-weight'] = fontWeight;

  const fontStyle = getStringValue(doc, `${prefix}font-style`);
  if (fontStyle !== undefined) result['font-style'] = fontStyle;

  const textAlign = getStringValue(doc, `${prefix}text-align`);
  if (textAlign !== undefined) result['text-align'] = textAlign;

  const color = getStringValue(doc, `${prefix}color`);
  if (color !== undefined) result['color'] = color;

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Value Accessors
// ─────────────────────────────────────────────────────────────────────────────

function getStringValue(doc: OdinDocument, path: string): string | undefined {
  const val = doc.get(path);
  if (val === undefined) return undefined;
  if (val.type === 'string') return val.value;
  return undefined;
}

/**
 * Resolve a string property that may instead be an `@$.i18n.*` reference.
 * i18n keys are stored without the `$.i18n.` prefix.
 */
function getLabelValue(
  doc: OdinDocument,
  path: string,
  i18n: Record<string, string> | undefined
): string | undefined {
  const val = doc.get(path);
  if (val === undefined) return undefined;
  if (val.type === 'string') return val.value;
  if (val.type === 'reference') {
    const ref = val.path;
    if (ref.startsWith('$.i18n.')) {
      const key = ref.slice('$.i18n.'.length);
      return i18n?.[key] ?? ref;
    }
    return ref;
  }
  return undefined;
}

/**
 * Read a scalar value as a string, preserving the raw source form for dates
 * and timestamps (e.g. `1900-01-01`).
 */
function getScalarString(doc: OdinDocument, path: string): string | undefined {
  const val = doc.get(path);
  if (val === undefined) return undefined;
  switch (val.type) {
    case 'string':
      return val.value;
    case 'date':
    case 'timestamp':
      return (val as { raw?: string }).raw ?? String(val.value);
    default:
      return undefined;
  }
}

/** Reconstruct an ODIN binary literal (`^algorithm:base64`) for a binary value. */
function getBinaryLiteral(doc: OdinDocument, path: string): string | undefined {
  const val = doc.get(path);
  if (val === undefined) return undefined;
  if (val.type === 'binary') {
    const base64 = Buffer.from(val.data).toString('base64');
    return val.algorithm ? `^${val.algorithm}:${base64}` : `^${base64}`;
  }
  if (val.type === 'string') return val.value;
  return undefined;
}

function getNumberValue(doc: OdinDocument, path: string): number | undefined {
  const val = doc.get(path);
  if (val === undefined) return undefined;
  if (val.type === 'number' || val.type === 'integer') return val.value;
  return undefined;
}

function getBooleanValue(doc: OdinDocument, path: string): boolean | undefined {
  const val = doc.get(path);
  if (val === undefined) return undefined;
  if (val.type === 'boolean') return val.value;
  return undefined;
}

function getReferenceValue(doc: OdinDocument, path: string): string | undefined {
  const val: OdinValue | undefined = doc.get(path);
  if (val === undefined) return undefined;
  if (val.type === 'reference') return val.path;
  return undefined;
}
