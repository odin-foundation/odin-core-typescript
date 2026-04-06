/**
 * ODIN Forms — parse and render declarative form definitions.
 * @module
 */

export { parseForm } from './parser.js';
export { renderForm } from './renderer.js';
export { generateFormCSS, generatePrintCSS } from './css.js';
export { toPixels, fromPixels } from './units.js';
export {
  generateFieldId,
  fieldLabelHtml,
  fieldAriaAttrs,
  fieldGroupHtml,
  tabOrderSort,
  skipLinkHtml,
  srOnlyHtml,
  contrastRatio,
  meetsContrastAA,
} from './accessibility.js';

export type {
  OdinForm,
  FormMetadata,
  PageDefaults,
  ScreenSettings,
  OdincodeSettings,
  FormPage,
  ElementType,
  BaseElement,
  Positioned,
  Sized,
  Stroked,
  Filled,
  Fonted,
  Validated,
  Bound,
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
  FormElement,
  RenderFormOptions,
} from './types.js';
