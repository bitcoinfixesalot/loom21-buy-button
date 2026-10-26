import type { ApiError } from './api';

export type Locale = 'en' | 'bg';

const en = {
  buy: 'Buy now',
  loading: 'Loading…',
  soldOut: 'Sold out',
  unavailable: 'Currently unavailable',
  close: 'Close',
  quantity: 'Quantity',
  less: 'Fewer',
  more: 'More',
  email: 'Email',
  emailHint: 'For your receipt',
  name: 'Name',
  shipping: 'Delivery',
  address: 'Address',
  line2: 'Address line 2',
  city: 'City',
  postcode: 'Postcode',
  country: 'Country',
  payWith: 'Pay with',
  lightning: 'Lightning',
  onchain: 'Bitcoin (on-chain)',
  card: 'Card',
  subtotal: 'Subtotal',
  vat: 'VAT {n}%',
  total: 'Total',
  pay: 'Pay {amount}',
  scan: 'Scan with a Lightning wallet',
  scanOnchain: 'Send exactly {amount} to this address',
  qr: 'Lightning invoice QR code',
  qrOnchain: 'Bitcoin address QR code',
  openWallet: 'Open in wallet',
  copy: 'Copy invoice',
  copyAddress: 'Copy address',
  copied: 'Copied',
  expiresIn: 'Expires in {time}',
  minutesLeft: '{n} minutes left to pay',
  waiting: 'Waiting for payment…',
  newTab: 'Complete payment in the new tab. This window updates automatically.',
  openPage: 'Open payment page',
  otherWay: 'Pay another way',
  paidTitle: 'Thank you!',
  paid: 'Payment received. Order {order}.',
  receiptTo: 'Receipt sent to {email}',
  receipt: 'View receipt',
  done: 'Done',
  expiredTitle: 'Checkout expired',
  startAgain: 'Start again',
  cancelTitle: 'Cancel this order?',
  cancelText: 'If you have already paid, keep the order: it updates as soon as the payment arrives.',
  cancelYes: 'Cancel order',
  cancelNo: 'Keep order',
  powered: 'Powered by Loom21',
  // Errors (API codes)
  insufficient_stock: "Only {n} left. We've updated your quantity.",
  storefront_unavailable: 'This item is temporarily unavailable. Please contact the seller.',
  checkout_expired: 'This checkout expired. Start again to get a fresh price.',
  checkout_paid: 'This order is already paid.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  validation_failed: 'Please check the highlighted fields.',
  not_available_here: 'Checkout is not available on this site.',
  not_found: 'This item is no longer available.',
  too_many_open_checkouts: 'You have unfinished orders. Finish or cancel one, or try again in a few minutes.',
  reservation_limit: 'Too many orders are waiting for payment right now. Please try again in a few minutes.',
  too_many_payment_attempts: 'Too many payment attempts for this order. Please start again.',
  payment_method_unavailable: 'This payment method is not available. Please choose another.',
  payment_provider_error: "The payment couldn't be started. Please try another way or try again.",
  network: 'Connection problem. Check your internet and try again.',
  unknown: 'Something went wrong. Please try again.',
};

export type TextKey = keyof typeof en;

const bg: Record<TextKey, string> = {
  buy: 'Купи',
  loading: 'Зареждане…',
  soldOut: 'Изчерпан',
  unavailable: 'В момента не е наличен',
  close: 'Затвори',
  quantity: 'Количество',
  less: 'По-малко',
  more: 'Повече',
  email: 'Имейл',
  emailHint: 'За касовата бележка',
  name: 'Име',
  shipping: 'Доставка',
  address: 'Адрес',
  line2: 'Адрес, ред 2',
  city: 'Град',
  postcode: 'Пощенски код',
  country: 'Държава',
  payWith: 'Плащане с',
  lightning: 'Lightning',
  onchain: 'Биткойн (on-chain)',
  card: 'Карта',
  subtotal: 'Междинна сума',
  vat: 'ДДС {n}%',
  total: 'Общо',
  pay: 'Плати {amount}',
  scan: 'Сканирайте с Lightning портфейл',
  scanOnchain: 'Изпратете точно {amount} на този адрес',
  qr: 'QR код на Lightning фактурата',
  qrOnchain: 'QR код на биткойн адреса',
  openWallet: 'Отвори в портфейла',
  copy: 'Копирай фактурата',
  copyAddress: 'Копирай адреса',
  copied: 'Копирано',
  expiresIn: 'Изтича след {time}',
  minutesLeft: 'Остават {n} минути за плащане',
  waiting: 'Изчакване на плащането…',
  newTab: 'Завършете плащането в новия раздел. Този прозорец се обновява сам.',
  openPage: 'Отвори страницата за плащане',
  otherWay: 'Плати по друг начин',
  paidTitle: 'Благодарим ви!',
  paid: 'Плащането е получено. Поръчка {order}.',
  receiptTo: 'Касовата бележка е изпратена на {email}',
  receipt: 'Виж касовата бележка',
  done: 'Готово',
  expiredTitle: 'Поръчката изтече',
  startAgain: 'Започни отново',
  cancelTitle: 'Да се откаже ли поръчката?',
  cancelText: 'Ако вече сте платили, запазете поръчката: тя се обновява веднага щом плащането пристигне.',
  cancelYes: 'Откажи поръчката',
  cancelNo: 'Запази поръчката',
  powered: 'Powered by Loom21',
  insufficient_stock: 'Остават само {n}. Обновихме количеството.',
  storefront_unavailable: 'Този продукт временно не е достъпен. Моля, свържете се с търговеца.',
  checkout_expired: 'Поръчката изтече. Започнете отново, за да получите актуална цена.',
  checkout_paid: 'Тази поръчка вече е платена.',
  rate_limited: 'Твърде много опити. Моля, изчакайте малко и опитайте отново.',
  validation_failed: 'Моля, проверете маркираните полета.',
  not_available_here: 'Плащането не е достъпно на този сайт.',
  not_found: 'Този продукт вече не е наличен.',
  too_many_open_checkouts: 'Имате незавършени поръчки. Завършете или откажете някоя, или опитайте след няколко минути.',
  reservation_limit: 'В момента твърде много поръчки чакат плащане. Моля, опитайте след няколко минути.',
  too_many_payment_attempts: 'Твърде много опити за плащане на тази поръчка. Моля, започнете отново.',
  payment_method_unavailable: 'Този начин на плащане не е достъпен. Моля, изберете друг.',
  payment_provider_error: 'Плащането не можа да започне. Опитайте по друг начин или отново.',
  network: 'Проблем с връзката. Проверете интернета си и опитайте отново.',
  unknown: 'Нещо се обърка. Моля, опитайте отново.',
};

const texts: Record<Locale, Record<TextKey, string>> = { en, bg };

/** The `locale` attribute, else the page's `<html lang>`, else English. */
export function resolveLocale(attribute: string | null, pageLang = document.documentElement.lang): Locale {
  for (const value of [attribute, pageLang]) {
    const lang = (value || '').slice(0, 2).toLowerCase();
    if (lang === 'en' || lang === 'bg') return lang;
  }
  return 'en';
}

export function t(locale: Locale, key: TextKey, params: Record<string, string | number> = {}): string {
  return texts[locale][key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
}

/** What the buyer reads for a failed call. Never the raw code or the API's English detail. */
export function errorText(locale: Locale, error: ApiError): string {
  const code = error.code;
  if (code === 'invalid_key' || code === 'origin_not_allowed') return t(locale, 'not_available_here');
  if (code === 'insufficient_stock') return t(locale, code, { n: error.problem?.lines?.[0]?.available ?? 0 });
  if (code in en && code !== 'unknown') return t(locale, code as TextKey);
  return t(locale, 'unknown');
}

/** What the site's developer reads in the console, for the setup mistakes the buyer can't fix. */
export function developerHint(error: ApiError, origin: string, product: string): string | null {
  switch (error.code) {
    case 'origin_not_allowed':
      return `Loom21: add ${origin} to Allowed websites in Settings → Storefronts → Developer.`;
    case 'invalid_key':
      return 'Loom21: the publishable key is missing, revoked or for a disabled storefront. Copy the current key from Settings → Storefronts → Developer.';
    case 'not_found':
      return `Loom21: product "${product}" isn't published on this storefront. Publish it in Products → Storefront, and check its slug.`;
    default:
      return null;
  }
}
