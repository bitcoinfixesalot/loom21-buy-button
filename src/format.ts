import type { Locale } from './i18n';
import type { Store } from './types';

export type PriceDisplay = 'fiat' | 'sats' | 'both';

/** The shop's Bitcoin settings win over the attribute: Bitcoin only forces sats, hidden Bitcoin prices force fiat. */
export function priceDisplay(attribute: string | null, bitcoin: Store['bitcoin']): PriceDisplay {
  if (bitcoin.bitcoinOnly) return 'sats';
  if (bitcoin.hidePrices) return 'fiat';
  return attribute === 'fiat' || attribute === 'sats' ? attribute : 'both';
}

/** The buyer's price: the API's prices are before VAT, and VAT is added on the total. */
export function withVat(amount: number, vat: Store['vat']): number {
  return vat.charged ? amount * (1 + vat.rate / 100) : amount;
}

const numberLocale = (locale: Locale) => (locale === 'bg' ? 'bg-BG' : 'en-GB');

export function formatFiat(amount: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(numberLocale(locale), { style: 'currency', currency }).format(amount);
  } catch {
    return amount.toFixed(2) + ' ' + currency;
  }
}

export function formatSats(sats: number, locale: Locale): string {
  return new Intl.NumberFormat(numberLocale(locale)).format(Math.round(sats)) + (locale === 'bg' ? ' сат.' : ' sats');
}

/** The price as shown: fiat, sats or both ("€12.00 · 13,450 sats"). Sats are left out when the API gave none. */
export function formatPrice(
  mode: PriceDisplay, amount: number, currency: string, sats: number | null | undefined, locale: Locale,
): string {
  const fiat = formatFiat(amount, currency, locale);
  if (sats == null || sats <= 0) return mode === 'sats' ? '' : fiat;
  const btc = formatSats(sats, locale);
  return mode === 'fiat' ? fiat : mode === 'sats' ? btc : `${fiat} · ${btc}`;
}

/** A whole quantity between 1 and what one line may order. */
export function clampQuantity(value: unknown, max: number): number {
  const n = Math.floor(Number(value));
  const top = Math.max(1, Math.floor(max) || 1);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), top) : 1;
}

/** "14:05" or "1:02:05" until the given time; "0:00" once it's past. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
