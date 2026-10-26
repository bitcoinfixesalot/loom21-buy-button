import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api';
import { developerHint, errorText } from '../../src/i18n';

const err = (code: string, extra: object = {}) => new ApiError(code, 409, { status: 409, code, ...extra });

describe('errorText', () => {
  it.each([
    ['insufficient_stock', "Only 2 left. We've updated your quantity.", 'Остават само 2. Обновихме количеството.'],
    ['storefront_unavailable', 'This item is temporarily unavailable. Please contact the seller.', 'Този продукт временно не е достъпен. Моля, свържете се с търговеца.'],
    ['checkout_expired', 'This checkout expired. Start again to get a fresh price.', 'Поръчката изтече. Започнете отново, за да получите актуална цена.'],
    ['rate_limited', 'Too many attempts. Please wait a moment and try again.', 'Твърде много опити. Моля, изчакайте малко и опитайте отново.'],
    ['validation_failed', 'Please check the highlighted fields.', 'Моля, проверете маркираните полета.'],
    ['invalid_key', 'Checkout is not available on this site.', 'Плащането не е достъпно на този сайт.'],
    ['origin_not_allowed', 'Checkout is not available on this site.', 'Плащането не е достъпно на този сайт.'],
    ['network', 'Connection problem. Check your internet and try again.', 'Проблем с връзката. Проверете интернета си и опитайте отново.'],
  ])('%s reads as the plan says, in English and Bulgarian', (code, enText, bgText) => {
    const error = err(code, { lines: [{ productId: 1, requested: 5, available: 2 }] });
    expect(errorText('en', error)).toBe(enText);
    expect(errorText('bg', error)).toBe(bgText);
  });

  it.each([
    'checkout_paid', 'not_found', 'too_many_open_checkouts', 'reservation_limit', 'too_many_payment_attempts',
    'payment_method_unavailable', 'payment_provider_error',
  ])('%s has its own text, never the code', code => {
    for (const locale of ['en', 'bg'] as const) {
      const text = errorText(locale, err(code));
      expect(text).not.toContain(code);
      expect(text).not.toBe(errorText(locale, err('something_new')));
    }
  });

  it('never shows an unknown code or the API detail', () => {
    const error = new ApiError('something_new', 500, { status: 500, code: 'something_new', detail: 'NullReferenceException at …' });
    expect(errorText('en', error)).toBe('Something went wrong. Please try again.');
    expect(errorText('bg', error)).toBe('Нещо се обърка. Моля, опитайте отново.');
  });
});

describe('developerHint', () => {
  it('names the exact origin to add for origin_not_allowed', () => {
    expect(developerHint(err('origin_not_allowed'), 'https://shop.example.com', 'honey'))
      .toBe('Loom21: add https://shop.example.com to Allowed websites in Settings → Storefronts → Developer.');
  });

  it('explains a bad key and an unpublished product', () => {
    expect(developerHint(err('invalid_key'), 'https://a.example', 'honey')).toContain('Settings → Storefronts → Developer');
    expect(developerHint(err('not_found'), 'https://a.example', 'honey')).toContain('"honey"');
  });

  it('says nothing for what the buyer can fix', () => {
    expect(developerHint(err('insufficient_stock'), 'https://a.example', 'honey')).toBeNull();
  });
});
