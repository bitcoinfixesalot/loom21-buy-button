import { describe, expect, it } from 'vitest';
import { clampQuantity } from '../../src/format';
import { textOn } from '../../src/styles';

describe('clampQuantity', () => {
  it('keeps a whole number between 1 and maxQuantity', () => {
    expect(clampQuantity(3, 10)).toBe(3);
    expect(clampQuantity(25, 10)).toBe(10);
    expect(clampQuantity(0, 10)).toBe(1);
    expect(clampQuantity(-4, 10)).toBe(1);
    expect(clampQuantity(2.7, 10)).toBe(2);
    expect(clampQuantity('7', 10)).toBe(7);
    expect(clampQuantity('abc', 10)).toBe(1);
  });

  it('allows one even when maxQuantity is missing or zero', () => {
    expect(clampQuantity(5, 0)).toBe(1);
    expect(clampQuantity(5, NaN)).toBe(1);
  });
});

describe('textOn', () => {
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const lum = (r: number, g: number, b: number) => {
    const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };

  it('picks white on dark accents and black on light ones', () => {
    expect(textOn('rgb(109, 40, 217)')).toBe('#fff');
    expect(textOn('rgb(255, 214, 0)')).toBe('#000');
    expect(textOn('rgb(0, 0, 0)')).toBe('#fff');
    expect(textOn('rgb(255, 255, 255)')).toBe('#000');
  });

  it('reaches 4.5:1 on any accent', () => {
    for (let r = 0; r <= 255; r += 17)
      for (let g = 0; g <= 255; g += 17)
        for (let b = 0; b <= 255; b += 17) {
          const l = lum(r, g, b);
          const text = textOn(`rgb(${r}, ${g}, ${b})`) === '#fff' ? 1 : 0;
          expect(contrast(l, text)).toBeGreaterThanOrEqual(4.5);
        }
  });
});
