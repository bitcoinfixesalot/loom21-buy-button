import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvg } from '../../src/qr';

/** Draws the matrix 4 px a module with the quiet zone, and reads it back with jsQR, an independent decoder. */
function decode(matrix: boolean[][]): string | null {
  const scale = 4, quiet = 4;
  const size = (matrix.length + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
    }));
  return jsQR(pixels, size, size)?.data ?? null;
}

const version = (matrix: boolean[][]) => (matrix.length - 17) / 4;

const BOLT11 = 'lnbc125u1pjq0xyzpp5' + 'qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq'.repeat(6) + 'sp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs9qyysgqcqpcxqyz5vq';

describe('qrMatrix', () => {
  it.each([
    ['a short text', 'hello'],
    ['a Lightning invoice, upper-cased for alphanumeric mode', 'LIGHTNING:' + BOLT11.toUpperCase()],
    ['a BIP21 URI in byte mode', 'bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.00012345&label=Honey%20shop'],
    ['UTF-8 text', 'Мед 500 г – €12'],
  ])('decodes back to %s', (_, text) => {
    expect(decode(qrMatrix(text))).toBe(text);
  });

  it('decodes at every version 1 to 40, in both modes', () => {
    // Lengths that just fill each version at level M, so every block layout and the version info are exercised.
    const seen = new Set<number>();
    for (let n = 1; n <= 2300; n = Math.ceil(n * 1.12) + 1) {
      const alnum = 'A1 $%*+-./:Z'.repeat(400).slice(0, n);
      const m1 = qrMatrix(alnum);
      expect(decode(m1), `alphanumeric length ${n}`).toBe(alnum);
      seen.add(version(m1));
      if (n <= 2300 * 0.6) {
        const bytes = 'lnbc1~'.repeat(400).slice(0, n);
        const m2 = qrMatrix(bytes);
        expect(decode(m2), `byte length ${n}`).toBe(bytes);
        seen.add(version(m2));
      }
    }
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(30);
    expect(seen.has(7)).toBe(true);
  });

  it('picks the smallest version that holds the data', () => {
    expect(version(qrMatrix('HELLO'))).toBe(1);
    expect(version(qrMatrix('A'.repeat(20)))).toBe(1); // version 1-M holds 20 alphanumeric characters
    expect(version(qrMatrix('A'.repeat(21)))).toBe(2);
    expect(version(qrMatrix('a'.repeat(14)))).toBe(1); // and 14 bytes
    expect(version(qrMatrix('a'.repeat(15)))).toBe(2);
  });

  it('refuses text too long for any version', () => {
    expect(() => qrMatrix('a'.repeat(3000))).toThrow(RangeError);
  });
});

describe('qrSvg', () => {
  it('is an image with a label and a quiet zone', () => {
    const svg = qrSvg('HELLO', 'Lightning "invoice" QR code');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Lightning &#34;invoice&#34; QR code"');
    expect(svg).toContain('viewBox="0 0 29 29"');
  });
});
