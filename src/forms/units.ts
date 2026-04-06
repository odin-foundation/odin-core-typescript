const DPI = 96;
const CONVERSIONS: Record<string, number> = {
  inch: DPI,           // 1 inch = 96px
  cm: DPI / 2.54,      // 1 cm ≈ 37.795px
  mm: DPI / 25.4,      // 1 mm ≈ 3.7795px
  pt: DPI / 72,        // 1 pt ≈ 1.333px
};

export function toPixels(value: number, unit: string): number {
  const factor = CONVERSIONS[unit];
  if (!factor) throw new Error(`Unknown unit: ${unit}`);
  return Math.round(value * factor * 1000) / 1000;
}

export function fromPixels(px: number, unit: string): number {
  const factor = CONVERSIONS[unit];
  if (!factor) throw new Error(`Unknown unit: ${unit}`);
  return Math.round((px / factor) * 1000) / 1000;
}
