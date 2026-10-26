// A small in-memory Storefront API (storefront/v1) for the demo page and the e2e tests. Options pick a scenario.
// Not a reference implementation: just enough of the real API's shapes and codes (docs/STOREFRONT_API.md).

export const MOCK_KEY = 'l21_pk_test_demo';

/**
 * @param {{
 *   checkoutAvailable?: boolean, showPoweredBy?: boolean, paymentMethods?: string[], shippingMethods?: object[],
 *   bitcoinOnly?: boolean, hidePrices?: boolean, maxQuantity?: number,
 *   insufficientStockOnce?: number, error?: [number, string], payAfterPolls?: number, expireAfterPolls?: number,
 *   noBolt11?: boolean,
 * }} options
 */
export function createMockApi(options = {}) {
  const o = { payAfterPolls: Infinity, expireAfterPolls: Infinity, ...options };
  const state = { requests: [], checkouts: new Map(), idempotency: new Map(), stockErrorSent: false, next: 1 };

  const store = {
    name: 'Honey & Co',
    logoUrl: null,
    supportEmail: 'shop@example.com',
    currency: 'EUR',
    paymentMethods: o.paymentMethods ?? ['lightning', 'onchain', 'card'],
    shippingMethods: o.shippingMethods ?? [
      { id: 1, name: 'Pickup in Sofia', price: 0, requiresAddress: false },
      { id: 2, name: 'Courier', price: 5, requiresAddress: true },
    ],
    bitcoin: { hidePrices: !!o.hidePrices, bitcoinOnly: !!o.bitcoinOnly },
    vat: { charged: true, rate: 20 },
    stockDisplay: 'bucket',
    checkoutAvailable: o.checkoutAvailable ?? true,
    showPoweredBy: o.showPoweredBy ?? true,
  };
  const image = name => ({ thumb: `/demo/${name}.svg`, normal: `/demo/${name}.svg`, large: `/demo/${name}.svg` });
  const max = o.maxQuantity ?? 10;
  const products = [
    { id: 7, slug: 'raw-honey-500g', name: 'Raw honey 500 g', isService: false, price: 10, priceSats: 11000, images: [image('honey')], status: 'in_stock' },
    { id: 8, slug: 'beeswax-candle', name: 'Beeswax candle', isService: false, price: 6.5, priceSats: 7150, images: [image('candle')], status: 'out_of_stock' },
    { id: 9, slug: 'tasting-session', name: 'Honey tasting (1 hour)', isService: true, price: 25, priceSats: 27500, images: [], status: 'available' },
  ].map(p => ({
    id: p.id, slug: p.slug, name: p.name, isService: p.isService, price: p.price, priceSats: p.priceSats, currency: 'EUR',
    images: p.images, availability: { status: p.status, quantity: null, maxQuantity: p.status === 'out_of_stock' ? 0 : max },
  }));
  const SATS_PER_EUR = 1100;

  const json = (status, body, headers = {}) => ({ status, headers: { 'Content-Type': 'application/json', ...headers }, body });
  const problem = (status, code, extra = {}) => ({
    status,
    headers: { 'Content-Type': 'application/problem+json' },
    body: { type: `https://loom21.com/docs/storefront-api/errors#${code}`, title: 'Error', status, detail: code, code, ...extra },
  });

  function price(items, shippingMethodId) {
    const lines = [];
    const warnings = [];
    for (const item of items ?? []) {
      const p = products.find(x => x.id === item.productId);
      if (!p || p.availability.status === 'out_of_stock') {
        warnings.push({ code: 'product_unavailable', productId: item.productId, message: 'Not available.' });
        continue;
      }
      let quantity = item.quantity;
      if (quantity > p.availability.maxQuantity) {
        quantity = p.availability.maxQuantity;
        warnings.push({ code: 'quantity_over_max', productId: p.id, message: `At most ${quantity}.` });
      }
      lines.push({ productId: p.id, name: p.name, quantity, unitPrice: p.price, lineTotal: p.price * quantity, priceSource: 'base', availability: p.availability.status, maxQuantity: p.availability.maxQuantity });
    }
    const shipping = store.shippingMethods.find(m => m.id === shippingMethodId)?.price ?? 0;
    const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
    const vat = Math.round((subtotal + shipping) * 20) / 100;
    const total = subtotal + shipping + vat;
    return { currency: 'EUR', lines, subtotal, shipping, vat: { rate: 20, amount: vat }, total, totalSats: Math.floor(total * SATS_PER_EUR), btcRate: null, warnings };
  }

  function statusOf(c) {
    return {
      status: c.status, orderNumber: c.status === 'paid' ? '0000000042' : null, expiresAt: c.expiresAt,
      paidAt: c.status === 'paid' ? new Date().toISOString() : null, method: c.method ?? null, total: c.total, currency: 'EUR',
      buyerEmail: c.email.replace(/^(.).*(@.*)$/, '$1***$2'), receiptUrl: c.status === 'paid' ? '/demo/receipt.html' : null,
      hostedPaymentUrl: c.hosted ?? null,
    };
  }

  /** @param {{ method: string, path: string, headers: Record<string, string>, body?: any }} request */
  function handle({ method, path, headers, body }) {
    path = path.replace(/^.*?\/storefront\/v1/, '').split('?')[0];
    state.requests.push({ method, path, headers, body });
    if (o.error) return problem(o.error[0], o.error[1]);
    if (headers['loom21-publishable-key'] !== MOCK_KEY) return problem(401, 'invalid_key');

    if (method === 'GET' && path === '/store') return json(200, store, { 'Cache-Control': 'public, max-age=60' });

    let m = path.match(/^\/products\/([^/]+)$/);
    if (method === 'GET' && m) {
      const p = products.find(x => x.slug === decodeURIComponent(m[1]) || String(x.id) === m[1]);
      return p ? json(200, p) : problem(404, 'not_found');
    }

    if (method === 'POST' && path === '/quotes') return json(200, price(body.items, body.shippingMethodId));

    if (method === 'POST' && path === '/checkouts') {
      const key = headers['idempotency-key'];
      if (!key) return problem(422, 'validation_failed', { errors: { 'Idempotency-Key': ['Required.'] } });
      const known = state.idempotency.get(key);
      if (known) return json(201, known);
      if (o.insufficientStockOnce != null && !state.stockErrorSent) {
        state.stockErrorSent = true;
        const item = body.items[0];
        return problem(409, 'insufficient_stock', { lines: [{ productId: item.productId, requested: item.quantity, available: o.insufficientStockOnce }] });
      }
      if (!body.buyer?.email?.includes('@')) return problem(422, 'validation_failed', { errors: { 'buyer.Email': ['The Email field is not a valid e-mail address.'] } });
      const quote = price(body.items, body.shippingMethodId);
      const token = `chk_mock${state.next++}`;
      const checkout = {
        checkoutToken: token, checkoutId: crypto.randomUUID(), status: 'awaiting_payment', orderNumber: null,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), total: quote.total, currency: 'EUR', paymentMethods: store.paymentMethods,
      };
      state.checkouts.set(token, { ...checkout, email: body.buyer.email, polls: 0, payments: 0 });
      state.idempotency.set(key, checkout);
      return json(201, checkout);
    }

    m = path.match(/^\/checkouts\/([^/]+)(\/payments|\/cancel)?$/);
    const c = m && state.checkouts.get(m[1]);
    if (m && !c) return problem(404, 'not_found');
    if (m && method === 'POST' && m[2] === '/payments') {
      if (c.status === 'paid') return problem(409, 'checkout_paid');
      if (c.status !== 'awaiting_payment') return problem(409, 'checkout_expired');
      if (++c.payments > 5) return problem(409, 'too_many_payment_attempts');
      if (!store.paymentMethods.includes(body.method)) return problem(409, 'payment_method_unavailable');
      c.method = body.method;
      const sats = Math.floor(c.total * SATS_PER_EUR);
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const hosted = `/demo/hosted-pay.html?checkout=${c.checkoutToken}`;
      c.hosted = hosted;
      const payment = { paymentId: `pay_${c.payments}`, method: body.method, processor: 'mock', amountSats: null, bolt11: null, onchainAddress: null, bip21: null, expiresAt, hostedPaymentUrl: hosted };
      if (body.method === 'lightning' && !o.noBolt11)
        Object.assign(payment, { amountSats: sats, bolt11: 'lnbc' + sats + 'n1pjmockpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdqqcqzzsxqyz5vqsp5mock' });
      if (body.method === 'onchain') {
        const address = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
        Object.assign(payment, { amountSats: sats, onchainAddress: address, bip21: `bitcoin:${address}?amount=${(sats / 1e8).toFixed(8)}` });
      }
      return json(201, payment);
    }
    if (m && method === 'POST' && m[2] === '/cancel') {
      if (c.status === 'paid') return problem(409, 'checkout_paid');
      c.status = 'cancelled';
      return json(200, statusOf(c));
    }
    if (m && method === 'GET' && !m[2]) {
      if (c.status === 'awaiting_payment' && c.method) {
        c.polls++;
        if (c.polls >= o.payAfterPolls) c.status = 'paid';
        else if (c.polls >= o.expireAfterPolls) c.status = 'expired';
      }
      const etag = `"${c.status}-${c.method ?? ''}"`;
      if (headers['if-none-match'] === etag) return { status: 304, headers: { ETag: etag }, body: null };
      return json(200, statusOf(c), { ETag: etag, 'Cache-Control': 'no-cache' });
    }
    return problem(404, 'not_found');
  }

  /** Marks a checkout paid now (the demo's "simulate payment"). */
  function payAll() {
    for (const c of state.checkouts.values()) if (c.status === 'awaiting_payment') c.status = 'paid';
  }

  return { handle, state, payAll, options: o };
}
