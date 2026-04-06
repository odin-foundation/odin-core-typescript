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
  const doc = Odin.parse(text);

  const metadata = extractMetadata(doc);
  const pageDefaults = extractPageDefaults(doc);
  const screen = extractScreen(doc);
  const odincode = extractOdincode(doc);
  const i18n = extractI18n(doc);
  const pages = extractPages(doc);

  return {
    metadata,
    ...(pageDefaults !== undefined && { pageDefaults }),
    ...(screen !== undefined && { screen }),
    ...(odincode !== undefined && { odincode }),
    ...(i18n !== undefined && { i18n }),
    pages,
  };
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
  const margin = getNumberValue(doc, '$.page.margin');

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
function extractPages(doc: OdinDocument): readonly FormPage[] {
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
    pages.push(extractPage(doc, index));
  }

  return pages;
}

/**
 * Extract a single page by collecting all element keys from paths like
 * page[N].{elementType}.{elementName}.{property}
 */
function extractPage(doc: OdinDocument, pageIndex: number): FormPage {
  const prefix = `page[${pageIndex}].`;
  const allPaths = doc.paths().filter((p) => p.startsWith(prefix));

  // Collect unique element keys in document order (preserve insertion order)
  // An element key is "{elementType}.{elementName}" e.g. "text.title"
  const elementKeysSeen = new Set<string>();
  const elementKeysOrdered: string[] = [];

  for (const path of allPaths) {
    const rest = path.slice(prefix.length); // e.g. "text.title.content"
    const parts = rest.split('.');
    if (parts.length >= 2) {
      const elementKey = `${parts[0]}.${parts[1]}`; // "text.title"
      if (!elementKeysSeen.has(elementKey)) {
        elementKeysSeen.add(elementKey);
        elementKeysOrdered.push(elementKey);
      }
    }
  }

  // Build elements in order
  let idCounter = 0;
  const elements: FormElement[] = [];
  for (const elementKey of elementKeysOrdered) {
    const [elementType, elementName] = elementKey.split('.') as [string, string];
    const elementPrefix = `${prefix}${elementKey}.`;
    const element = buildElement(doc, elementType, elementName, elementPrefix, idCounter++);
    if (element !== undefined) {
      elements.push(element);
    }
  }

  return { elements };
}

// ─────────────────────────────────────────────────────────────────────────────
// Element Builder Dispatch
// ─────────────────────────────────────────────────────────────────────────────

function buildElement(
  doc: OdinDocument,
  elementType: string,
  elementName: string,
  prefix: string,
  idCounter: number
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
      return buildTextElement(doc, elementName, id, prefix);
    case 'img':
      return buildImageElement(doc, elementName, id, prefix);
    case 'barcode':
      return buildBarcodeElement(doc, elementName, id, prefix);
    case 'field':
      return buildFieldElement(doc, elementName, id, prefix);
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
  prefix: string
): TextElement {
  return {
    type: 'text',
    name,
    id,
    content: getStringValue(doc, `${prefix}content`) ?? '',
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
  prefix: string
): ImageElement {
  return {
    type: 'img',
    name,
    id,
    src: getStringValue(doc, `${prefix}src`) ?? '',
    alt: getStringValue(doc, `${prefix}alt`) ?? '',
    x: getNumberValue(doc, `${prefix}x`) ?? 0,
    y: getNumberValue(doc, `${prefix}y`) ?? 0,
    w: getNumberValue(doc, `${prefix}w`) ?? 0,
    h: getNumberValue(doc, `${prefix}h`) ?? 0,
  };
}

function buildBarcodeElement(
  doc: OdinDocument,
  name: string,
  id: string,
  prefix: string
): BarcodeElement {
  const barcodeType = getStringValue(doc, `${prefix}barcode-type`) ?? 'code128';
  const validTypes = ['code39', 'code128', 'qr', 'datamatrix', 'pdf417'] as const;
  const resolvedType = validTypes.includes(barcodeType as (typeof validTypes)[number])
    ? (barcodeType as BarcodeElement['barcodeType'])
    : 'code128';

  return {
    type: 'barcode',
    name,
    id,
    barcodeType: resolvedType,
    content: getStringValue(doc, `${prefix}content`) ?? '',
    alt: getStringValue(doc, `${prefix}alt`) ?? '',
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
  prefix: string
): FormElement | undefined {
  const fieldType = getStringValue(doc, `${prefix}type`) ?? 'text';
  const baseField = extractBaseField(doc, name, id, prefix);

  switch (fieldType) {
    case 'text':
      return buildTextField(doc, prefix, baseField);
    case 'checkbox':
      return buildCheckboxField(baseField);
    case 'radio':
      return buildRadioField(doc, prefix, baseField);
    case 'select':
      return buildSelectField(doc, prefix, baseField);
    case 'multiselect':
      return buildMultiselectField(doc, prefix, baseField);
    case 'date':
      return buildDateField(baseField);
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
  prefix: string
): BaseFieldProps {
  const required = getBooleanValue(doc, `${prefix}required`);
  const tabindex = getNumberValue(doc, `${prefix}tabindex`);
  const minLength = getNumberValue(doc, `${prefix}minLength`);
  const maxLength = getNumberValue(doc, `${prefix}maxLength`);
  const min = getNumberValue(doc, `${prefix}min`) ?? getStringValue(doc, `${prefix}min`);
  const max = getNumberValue(doc, `${prefix}max`) ?? getStringValue(doc, `${prefix}max`);
  const ariaLabel = getStringValue(doc, `${prefix}aria-label`);
  const readonlyVal = getBooleanValue(doc, `${prefix}readonly`);
  const bindRef = getReferenceValue(doc, `${prefix}bind`);

  return {
    name,
    id,
    label: getStringValue(doc, `${prefix}label`) ?? '',
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
  const mask = getStringValue(doc, `${prefix}mask`);
  const placeholder = getStringValue(doc, `${prefix}placeholder`);
  const multiline = getBooleanValue(doc, `${prefix}multiline`);
  const maxLines = getNumberValue(doc, `${prefix}maxLines`);

  return {
    type: 'field.text',
    ...base,
    ...(mask !== undefined && { mask }),
    ...(placeholder !== undefined && { placeholder }),
    ...(multiline !== undefined && { multiline }),
    ...(maxLines !== undefined && { maxLines }),
  };
}

function buildCheckboxField(base: BaseFieldProps): CheckboxElement {
  return { type: 'field.checkbox', ...base };
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
  const placeholder = getStringValue(doc, `${prefix}placeholder`);

  return {
    type: 'field.select',
    ...base,
    options: extractOptions(doc, prefix),
    ...(placeholder !== undefined && { placeholder }),
  };
}

function buildMultiselectField(
  doc: OdinDocument,
  prefix: string,
  base: BaseFieldProps
): MultiselectElement {
  const minSelect = getNumberValue(doc, `${prefix}minSelect`);
  const maxSelect = getNumberValue(doc, `${prefix}maxSelect`);

  return {
    type: 'field.multiselect',
    ...base,
    options: extractOptions(doc, prefix),
    ...(minSelect !== undefined && { minSelect }),
    ...(maxSelect !== undefined && { maxSelect }),
  };
}

function buildDateField(base: BaseFieldProps): DateElement {
  return { type: 'field.date', ...base };
}

function buildSignatureField(
  doc: OdinDocument,
  prefix: string,
  base: BaseFieldProps
): SignatureElement {
  const dateField = getStringValue(doc, `${prefix}date_field`);
  return {
    type: 'field.signature',
    ...base,
    ...(dateField !== undefined && { date_field: dateField }),
  };
}

/** Extract an `options` array from indexed paths like `prefix + options[0]`, `options[1]`... */
function extractOptions(doc: OdinDocument, prefix: string): readonly string[] {
  const options: string[] = [];
  let i = 0;
  while (doc.has(`${prefix}options[${i}]`)) {
    const val = getStringValue(doc, `${prefix}options[${i}]`);
    if (val !== undefined) options.push(val);
    i++;
  }
  return options;
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
