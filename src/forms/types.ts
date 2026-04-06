/**
 * ODIN Forms 1.0 — TypeScript Type Definitions
 *
 * Declarative form definition types for print and screen rendering.
 * Matches the ODIN Forms 1.0 Schema specification exactly.
 *
 * Design: print-first, absolute positioning, bidirectional data binding.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Root Document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Root ODIN Forms document.
 *
 * Corresponds to the top-level structure of a `.odin` forms file, including
 * the `{$}` metadata section, optional settings sections, and `page[n]` pages.
 */
export interface OdinForm {
  /** Document-level metadata (`{$}`). */
  readonly metadata: FormMetadata;
  /** Default page dimensions and margins (`{$.page}`). */
  readonly pageDefaults?: PageDefaults;
  /** Screen rendering options (`{$.screen}`). Optional. */
  readonly screen?: ScreenSettings;
  /** Self-digitizing barcode settings (`{$.odincode}`). Optional. */
  readonly odincode?: OdincodeSettings;
  /** Multi-language label dictionary (`{$.i18n}`). Optional. */
  readonly i18n?: Record<string, string>;
  /** Ordered list of form pages (`page[0]`, `page[1]`, ...). */
  readonly pages: readonly FormPage[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata and Settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Document-level metadata from the `{$}` header.
 */
export interface FormMetadata {
  /** Human-readable form title. */
  readonly title: string;
  /** Unique form identifier. */
  readonly id: string;
  /** Primary language code (e.g. `en`, `es`). */
  readonly lang: string;
  /** ODIN Forms schema version (e.g. `1.0.0`). */
  readonly version?: string;
}

/**
 * Default page dimensions applied to all pages unless overridden.
 * Corresponds to `{$.page}`.
 */
export interface PageDefaults {
  /** Page width in the declared unit. */
  readonly width: number;
  /** Page height in the declared unit. */
  readonly height: number;
  /** Measurement unit for all coordinates and dimensions on the page. */
  readonly unit: 'inch' | 'cm' | 'mm' | 'pt';
  /** Page margin in the declared unit. Optional. */
  readonly margin?: number;
}

/**
 * Optional settings for screen/web rendering.
 * Corresponds to `{$.screen}`.
 */
export interface ScreenSettings {
  /** Default zoom factor. 1.0 = 100% (no scaling). */
  readonly scale: number;
}

/**
 * Self-digitizing barcode settings for the Odincode feature.
 * Corresponds to `{$.odincode}`.
 *
 * When enabled, the renderer generates a PDF417 barcode containing
 * the page's filled field data as raw ODIN text.
 */
export interface OdincodeSettings {
  /** Whether Odincode generation is enabled. */
  readonly enabled: boolean;
  /**
   * Placement zone for the barcode.
   * - `top-center`: 0.25" from the top edge, horizontally centered.
   * - `bottom-center`: 0.25" from the bottom edge, horizontally centered.
   */
  readonly zone: 'top-center' | 'bottom-center';
}

// ─────────────────────────────────────────────────────────────────────────────
// Pages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single form page containing an ordered list of elements.
 * Corresponds to `{page[n]}`.
 */
export interface FormPage {
  /** All elements on this page, in document order. */
  readonly elements: readonly FormElement[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Element Type Union
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All valid ODIN Forms element type strings.
 *
 * Geometric: line, rect, circle, ellipse, polygon, polyline, path
 * Content:   text, img, barcode
 * Fields:    field.text, field.checkbox, field.radio, field.select,
 *            field.multiselect, field.date, field.signature
 */
export type ElementType =
  // Geometric
  | 'line'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'polyline'
  | 'path'
  // Content
  | 'text'
  | 'img'
  | 'barcode'
  // Fields
  | 'field.text'
  | 'field.checkbox'
  | 'field.radio'
  | 'field.select'
  | 'field.multiselect'
  | 'field.date'
  | 'field.signature';

// ─────────────────────────────────────────────────────────────────────────────
// Base Element
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Properties common to every form element.
 */
export interface BaseElement {
  /** Element discriminator — matches the ODIN path segment (e.g. `rect`, `field.text`). */
  readonly type: ElementType;
  /**
   * Element name, taken from the path key (e.g. `section_box` in `{.rect.section_box}`).
   * Unique within the page.
   */
  readonly name: string;
  /**
   * Optional stable identifier for programmatic access and data binding.
   * When omitted the renderer may derive one from `name`.
   */
  readonly id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mixin Interfaces (@type references from the spec)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Absolute position on the page. Origin is the top-left corner.
 * Units are defined by `PageDefaults.unit`. (`@position`)
 */
export interface Positioned {
  /** X coordinate from the left edge of the page. */
  readonly x: number;
  /** Y coordinate from the top edge of the page. */
  readonly y: number;
}

/**
 * Rectangular dimensions. (`@dimensions`)
 */
export interface Sized {
  /** Element width. */
  readonly w: number;
  /** Element height. */
  readonly h: number;
}

/**
 * SVG-style stroke properties for geometric elements. (`@stroke`)
 */
export interface Stroked {
  /** Stroke colour as a 6-digit hex string (e.g. `#000000`). */
  readonly stroke?: string;
  /** Stroke width in the page unit. */
  readonly 'stroke-width'?: number;
  /** Stroke opacity in the range [0, 1]. */
  readonly 'stroke-opacity'?: number;
  /**
   * Stroke dash pattern, matching SVG `stroke-dasharray` syntax
   * (e.g. `"4 2"`).
   */
  readonly 'stroke-dasharray'?: string;
  /** Line cap style. */
  readonly 'stroke-linecap'?: 'butt' | 'round' | 'square';
  /** Line join style. */
  readonly 'stroke-linejoin'?: 'miter' | 'round' | 'bevel';
}

/**
 * SVG-style fill properties for closed shapes. (`@fill`)
 */
export interface Filled {
  /** Fill colour as a 6-digit hex string, or `"none"` for transparent. */
  readonly fill?: string;
  /** Fill opacity in the range [0, 1]. */
  readonly 'fill-opacity'?: number;
}

/**
 * Typography properties for text-bearing elements. (`@font`)
 */
export interface Fonted {
  /** Font family name (e.g. `Helvetica`, `Times New Roman`). Default: `Helvetica`. */
  readonly 'font-family'?: string;
  /** Font size in points. Must be ≥ 1. Default: 12. */
  readonly 'font-size'?: number;
  /** Font weight. Default: `normal`. */
  readonly 'font-weight'?: 'normal' | 'bold';
  /** Font style. Default: `normal`. */
  readonly 'font-style'?: 'normal' | 'italic';
  /** Horizontal text alignment. Default: `left`. */
  readonly 'text-align'?: 'left' | 'center' | 'right';
  /** Text colour as a 6-digit hex string. Default: `#000000`. */
  readonly color?: string;
}

/**
 * Field validation constraints. (`@validation`)
 */
export interface Validated {
  /** Whether the field must have a value before the form can be submitted. */
  readonly required?: boolean;
  /** Regular expression the value must match. */
  readonly pattern?: string;
  /** Minimum string length (integer ≥ 0). */
  readonly minLength?: number;
  /** Maximum string length (integer ≥ 1). */
  readonly maxLength?: number;
  /**
   * Minimum value. Interpreted as a number or ISO date string depending
   * on the field type.
   */
  readonly min?: string | number;
  /**
   * Maximum value. Interpreted as a number or ISO date string depending
   * on the field type.
   */
  readonly max?: string | number;
}

/**
 * Data binding to an ODIN document path. (`@binding`)
 *
 * The value is an ODIN reference expression, e.g. `@insured.ssn` or
 * `@.name` (relative binding inside a region).
 */
export interface Bound {
  /** ODIN path reference for the field's value (e.g. `@policy.coverageLevel`). */
  readonly bind: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete Element Interfaces — Geometric
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A line segment between two explicit endpoints. (`{.line.*}`)
 *
 * Uses endpoint coordinates rather than `@position`/`@dimensions`.
 */
export interface LineElement extends BaseElement, Stroked {
  readonly type: 'line';
  /** X coordinate of the start point. */
  readonly x1: number;
  /** Y coordinate of the start point. */
  readonly y1: number;
  /** X coordinate of the end point. */
  readonly x2: number;
  /** Y coordinate of the end point. */
  readonly y2: number;
}

/**
 * A rectangle, optionally with rounded corners. (`{.rect.*}`)
 */
export interface RectElement extends BaseElement, Positioned, Sized, Stroked, Filled {
  readonly type: 'rect';
  /** Horizontal corner radius. */
  readonly rx?: number;
  /** Vertical corner radius. */
  readonly ry?: number;
}

/**
 * A circle defined by a center point and radius. (`{.circle.*}`)
 */
export interface CircleElement extends BaseElement, Stroked, Filled {
  readonly type: 'circle';
  /** X coordinate of the center. */
  readonly cx: number;
  /** Y coordinate of the center. */
  readonly cy: number;
  /** Radius (must be ≥ 0). */
  readonly r: number;
}

/**
 * An ellipse defined by a center point and two radii. (`{.ellipse.*}`)
 */
export interface EllipseElement extends BaseElement, Stroked, Filled {
  readonly type: 'ellipse';
  /** X coordinate of the center. */
  readonly cx: number;
  /** Y coordinate of the center. */
  readonly cy: number;
  /** Horizontal radius (must be ≥ 0). */
  readonly rx: number;
  /** Vertical radius (must be ≥ 0). */
  readonly ry: number;
}

/**
 * A closed polygon defined by a list of points. (`{.polygon.*}`)
 *
 * Points format: `"x1,y1 x2,y2 x3,y3 ..."` (SVG `points` attribute syntax).
 */
export interface PolygonElement extends BaseElement, Stroked, Filled {
  readonly type: 'polygon';
  /** Space-separated coordinate pairs, e.g. `"0,0 1,0 0.5,1"`. */
  readonly points: string;
}

/**
 * An open polyline defined by a list of points. (`{.polyline.*}`)
 *
 * Points format: `"x1,y1 x2,y2 ..."` (SVG `points` attribute syntax).
 */
export interface PolylineElement extends BaseElement, Stroked {
  readonly type: 'polyline';
  /** Space-separated coordinate pairs, e.g. `"0,0 1,0 2,1"`. */
  readonly points: string;
}

/**
 * An SVG-style arbitrary path. (`{.path.*}`)
 *
 * Path data uses SVG path syntax (M, L, C, Q, A, Z commands).
 */
export interface PathElement extends BaseElement, Stroked, Filled {
  readonly type: 'path';
  /** SVG path data string, e.g. `"M 0,0 L 1,0 L 0.5,1 Z"`. */
  readonly d: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete Element Interfaces — Content
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Static text label. (`{.text.*}`)
 */
export interface TextElement extends BaseElement, Positioned, Fonted {
  readonly type: 'text';
  /** The text string to render. Required. */
  readonly content: string;
  /** Rotation angle in degrees, clockwise from the positive X axis. Optional. */
  readonly rotate?: number;
}

/**
 * Embedded image. (`{.img.*}`)
 *
 * The `src` field contains base64-encoded image data with a format prefix
 * (e.g. `^png:iVBOR...`). The `alt` field is required for accessibility.
 */
export interface ImageElement extends BaseElement, Positioned, Sized {
  readonly type: 'img';
  /** Base64-encoded image data with format prefix. Required. */
  readonly src: string;
  /** Accessibility description for screen readers and Tagged PDF. Required. */
  readonly alt: string;
}

/**
 * 1D or 2D barcode. (`{.barcode.*}`)
 *
 * The `alt` field is required for accessibility — it describes the barcode's
 * purpose for screen readers.
 */
export interface BarcodeElement extends BaseElement, Positioned, Sized {
  readonly type: 'barcode';
  /** Barcode symbology. */
  readonly barcodeType: 'code39' | 'code128' | 'qr' | 'datamatrix' | 'pdf417';
  /** Data to encode in the barcode. Required. */
  readonly content: string;
  /** Accessibility description for screen readers. Required. */
  readonly alt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete Element Interfaces — Fields (shared base)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Properties shared by all field elements (`@field_base`).
 */
export interface BaseFieldElement extends BaseElement, Positioned, Sized, Validated, Bound {
  /** Visible label text. Required. Also used as the default ARIA label. */
  readonly label: string;
  /** Override ARIA label for screen readers when it should differ from `label`. */
  readonly 'aria-label'?: string;
  /** Tab order index (integer ≥ 0). */
  readonly tabindex?: number;
  /** Whether the field is read-only. */
  readonly readonly?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete Element Interfaces — Field Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single-line or multi-line text input field. (`type = text`)
 */
export interface TextFieldElement extends BaseFieldElement {
  readonly type: 'field.text';
  /** Input mask pattern (e.g. `###-##-####`). Optional. */
  readonly mask?: string;
  /** Placeholder text shown when the field is empty. Optional. */
  readonly placeholder?: string;
  /** Whether the field accepts multiple lines of text. Optional. */
  readonly multiline?: boolean;
  /** Maximum number of lines when `multiline` is true. Optional. */
  readonly maxLines?: number;
}

/**
 * Boolean checkbox field. (`type = checkbox`)
 */
export interface CheckboxElement extends BaseFieldElement {
  readonly type: 'field.checkbox';
}

/**
 * Radio button field — part of a mutually exclusive group. (`type = radio`)
 */
export interface RadioElement extends BaseFieldElement {
  readonly type: 'field.radio';
  /** Radio group name. All radios sharing a group are mutually exclusive. Required. */
  readonly group: string;
  /** Value emitted to the bound path when this radio button is selected. Required. */
  readonly value: string;
}

/**
 * Single-selection dropdown field. (`type = select`)
 */
export interface SelectElement extends BaseFieldElement {
  readonly type: 'field.select';
  /** Ordered list of valid option values. Required. */
  readonly options: readonly string[];
  /** Default label shown when no option is selected. Optional. */
  readonly placeholder?: string;
}

/**
 * Multiple-selection list field. (`type = multiselect`)
 */
export interface MultiselectElement extends BaseFieldElement {
  readonly type: 'field.multiselect';
  /** Ordered list of valid option values. Required. */
  readonly options: readonly string[];
  /** Minimum number of selections required (integer ≥ 1). Optional. */
  readonly minSelect?: number;
  /** Maximum number of selections allowed. Optional. */
  readonly maxSelect?: number;
}

/**
 * Date input field. (`type = date`)
 *
 * `min` and `max` from `Validated` are interpreted as ISO 8601 date strings
 * (e.g. `"1900-01-01"`).
 */
export interface DateElement extends BaseFieldElement {
  readonly type: 'field.date';
}

/**
 * Signature capture area. (`type = signature`)
 */
export interface SignatureElement extends BaseFieldElement {
  readonly type: 'field.signature';
  /**
   * ODIN reference to an associated date field that records when the
   * signature was captured. Optional.
   */
  readonly date_field?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated Union
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated union of all concrete form element interfaces.
 *
 * Narrow by checking `element.type` to obtain the specific interface.
 *
 * @example
 * ```typescript
 * function renderElement(el: FormElement) {
 *   switch (el.type) {
 *     case 'rect': return renderRect(el);       // RectElement
 *     case 'field.text': return renderTextField(el); // TextFieldElement
 *     // ...
 *   }
 * }
 * ```
 */
export type FormElement =
  | LineElement
  | RectElement
  | CircleElement
  | EllipseElement
  | PolygonElement
  | PolylineElement
  | PathElement
  | TextElement
  | ImageElement
  | BarcodeElement
  | TextFieldElement
  | CheckboxElement
  | RadioElement
  | SelectElement
  | MultiselectElement
  | DateElement
  | SignatureElement;

// ─────────────────────────────────────────────────────────────────────────────
// Renderer Options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options passed to a form renderer.
 */
export interface RenderFormOptions {
  /**
   * Rendering target.
   * - `html`: Interactive HTML form for screen display.
   * - `print-css`: Static HTML/CSS layout optimised for `@media print` / PDF export.
   */
  readonly target: 'html' | 'print-css';
  /**
   * Language code for i18n label resolution (e.g. `"en"`, `"es"`).
   * Falls back to `FormMetadata.lang` when omitted.
   */
  readonly lang?: string;
  /**
   * Uniform scale factor applied to all page dimensions.
   * Falls back to `ScreenSettings.scale` (or `1.0`) when omitted.
   */
  readonly scale?: number;
  /**
   * Additional CSS class name(s) added to the root rendered element.
   * Useful for theming or test selectors.
   */
  readonly className?: string;
}
