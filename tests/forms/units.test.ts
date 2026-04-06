import { describe, it, expect } from 'vitest';
import { toPixels, fromPixels } from '../../src/forms/units.js';

describe('toPixels', () => {
  it('converts 1 inch to 96px', () => {
    expect(toPixels(1, 'inch')).toBe(96);
  });

  it('converts 1 cm to ~37.795px', () => {
    expect(toPixels(1, 'cm')).toBe(37.795);
  });

  it('converts 1 mm to ~3.7795px', () => {
    expect(toPixels(1, 'mm')).toBe(3.78);
  });

  it('converts 1 pt to ~1.333px', () => {
    expect(toPixels(1, 'pt')).toBe(1.333);
  });

  it('converts 8.5 inches to 816px (standard letter width)', () => {
    expect(toPixels(8.5, 'inch')).toBe(816);
  });

  it('converts 11 inches to 1056px (standard letter height)', () => {
    expect(toPixels(11, 'inch')).toBe(1056);
  });

  it('throws on unknown unit', () => {
    expect(() => toPixels(1, 'furlong')).toThrow('Unknown unit: furlong');
  });
});

describe('fromPixels', () => {
  it('round-trips inch: toPixels then fromPixels returns original value', () => {
    const original = 8.5;
    const px = toPixels(original, 'inch');
    expect(fromPixels(px, 'inch')).toBe(original);
  });

  it('round-trips cm: toPixels then fromPixels returns original value', () => {
    const original = 21;
    const px = toPixels(original, 'cm');
    expect(fromPixels(px, 'cm')).toBe(original);
  });

  it('round-trips mm: toPixels then fromPixels returns original value', () => {
    const original = 210;
    const px = toPixels(original, 'mm');
    expect(fromPixels(px, 'mm')).toBe(original);
  });

  it('round-trips pt: toPixels then fromPixels returns original value', () => {
    const original = 72;
    const px = toPixels(original, 'pt');
    expect(fromPixels(px, 'pt')).toBe(original);
  });

  it('throws on unknown unit', () => {
    expect(() => fromPixels(96, 'furlong')).toThrow('Unknown unit: furlong');
  });
});
