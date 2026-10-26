import { describe, expect, it } from 'vitest';
import { formatCountdown, formatPrice, priceDisplay, withVat } from '../../src/format';

const normal = { hidePrices: false, bitcoinOnly: false };

describe('priceDisplay', () => {
  it('follows the attribute, both by default', () => {
    expect(priceDisplay(null, normal)).toBe('both');
    expect(priceDisplay('fiat', normal)).toBe('fiat');
    expect(priceDisplay('sats', normal)).toBe('sats');
    expect(priceDisplay('nonsense', normal)).toBe('both');
  });

  it('UseBitcoinOnly forces sats', () => {
    expect(priceDisplay('fiat', { hidePrices: false, bitcoinOnly: true })).toBe('sats');
  });

  it('HideBitcoinPrices forces fiat', () => {
    expect(priceDisplay('sats', { hidePrices: true, bitcoinOnly: false })).toBe('fiat');
    expect(priceDisplay('both', { hidePrices: true, bitcoinOnly: false })).toBe('fiat');
  });
});

describe('formatPrice', () => {
  it('shows fiat, sats or both', () => {
    expect(formatPrice('fiat', 12, 'EUR', 13450, 'en')).toBe('€12.00');
    expect(formatPrice('sats', 12, 'EUR', 13450, 'en')).toBe('13,450 sats');
    expect(formatPrice('both', 12, 'EUR', 13450, 'en')).toBe('€12.00 · 13,450 sats');
  });

  it('writes Bulgarian numbers and units', () => {
    expect(formatPrice('both', 12, 'EUR', 13450, 'bg')).toMatch(/^12,00\s€ · 13\s450 сат\.$/);
  });

  it('falls back to fiat when there are no sats, except in sats-only mode', () => {
    expect(formatPrice('both', 12, 'EUR', null, 'en')).toBe('€12.00');
    expect(formatPrice('sats', 12, 'EUR', null, 'en')).toBe('');
  });
});

describe('withVat', () => {
  it('adds the percentage only when VAT is charged', () => {
    expect(withVat(10, { charged: true, rate: 20 })).toBeCloseTo(12);
    expect(withVat(10, { charged: false, rate: 20 })).toBe(10);
  });
});

describe('formatCountdown', () => {
  it('counts down minutes and seconds, never below zero', () => {
    expect(formatCountdown(14 * 60_000 + 5_000)).toBe('14:05');
    expect(formatCountdown(3_723_000)).toBe('1:02:03');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});
