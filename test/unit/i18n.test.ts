import { describe, expect, it } from 'vitest';
import { resolveLocale, t } from '../../src/i18n';

describe('resolveLocale', () => {
  it('takes the attribute first, then the page language, then English', () => {
    expect(resolveLocale('bg', 'en')).toBe('bg');
    expect(resolveLocale(null, 'bg-BG')).toBe('bg');
    expect(resolveLocale('', 'en-US')).toBe('en');
    expect(resolveLocale('de', 'fr')).toBe('en');
    expect(resolveLocale('fr', 'bg')).toBe('bg');
    expect(resolveLocale('BG', '')).toBe('bg');
  });
});

describe('t', () => {
  it('fills placeholders', () => {
    expect(t('en', 'pay', { amount: '€12.00' })).toBe('Pay €12.00');
    expect(t('bg', 'paid', { order: '0000000042' })).toBe('Плащането е получено. Поръчка 0000000042.');
  });

  it('has the default labels the plan gives', () => {
    expect(t('en', 'buy')).toBe('Buy now');
    expect(t('bg', 'buy')).toBe('Купи');
    expect(t('en', 'unavailable')).toBe('Currently unavailable');
  });
});
