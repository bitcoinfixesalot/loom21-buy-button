import { ApiError, type StorefrontApi } from './api';
import {
  clearCheckout, newIdempotencyKey, Poller, saveCheckout, type SavedCheckout,
} from './checkout-session';
import { clampQuantity, formatCountdown, formatFiat, formatPrice, formatSats, withVat, type PriceDisplay } from './format';
import { errorText, t, type Locale, type TextKey } from './i18n';
import { escapeHtml as e, qrSvg } from './qr';
import type { Address, CheckoutStatus, Payment, PaymentMethod, Product, Quote, Store } from './types';

/** What the modal needs from its button. */
export interface ModalHost {
  readonly api: StorefrontApi;
  readonly store: Store;
  readonly product: Product;
  /** The `product` attribute: the sessionStorage key and the events' `product`. */
  readonly productKey: string;
  readonly locale: Locale;
  readonly display: PriceDisplay;
  readonly showQuantity: boolean;
  readonly quantity: number;
  emit(name: string, detail: object): void;
  focusButton(): void;
}

type View = 'form' | 'pay' | 'paid' | 'expired' | 'confirm';

const COUNTRIES = 'AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK GB CH NO IS LI RS MK AL ME BA MD UA TR US CA AU'.split(' ');

/** The checkout dialog: form → payment → paid or expired, plus "Cancel this order?" when closed while paying. */
export class Modal {
  #d: HTMLDialogElement;
  #view: View = 'form';
  #qty: number;
  #method: PaymentMethod;
  #shipping: number | null = null;
  #quote: Quote | null = null;
  #quoteTimer: ReturnType<typeof setTimeout> | undefined;
  #quoteSeq = 0;
  #checkout: SavedCheckout | null = null;
  #payment: Payment | null = null;
  #idemKey: string | null = null;
  #poller: Poller | null = null;
  #tick: ReturnType<typeof setInterval> | undefined;
  #paid: CheckoutStatus | null = null;
  #busy = false;
  #blockedUrl: string | null = null;

  constructor(private readonly h: ModalHost, parent: HTMLElement) {
    const { store, product } = h;
    this.#qty = clampQuantity(h.quantity, product.availability.maxQuantity);
    this.#method = store.paymentMethods[0];
    const goods = store.shippingMethods.length && !product.isService;
    if (goods && store.shippingMethods.length === 1) this.#shipping = store.shippingMethods[0].id;

    this.#d = document.createElement('dialog');
    this.#d.setAttribute('part', 'modal');
    this.#d.setAttribute('aria-labelledby', 'l21t');
    const image = product.images[0]?.normal;
    this.#d.innerHTML = `<div class="hd">${image ? `<img src="${e(image)}" alt="">` : ''}<div><h2 id="l21t">${e(product.name)}</h2><p class="sub" id="l21p"></p></div><button type="button" class="x" data-a="close" aria-label="${this.#t('close')}">×</button></div><div class="bd"></div><p class="err" role="alert" style="padding:0 16px 12px"></p>${store.showPoweredBy ? `<p class="ft"><a href="https://loom21.com" target="_blank" rel="noopener">${this.#t('powered')}</a></p>` : ''}`;
    parent.append(this.#d);

    this.#d.addEventListener('click', ev => {
      if (ev.target === this.#d) return this.requestClose(); // the backdrop
      const action = (ev.target as Element).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (action) void this.#act(action, (ev.target as Element).closest<HTMLElement>('[data-a]')!);
    });
    this.#d.addEventListener('cancel', ev => {
      ev.preventDefault(); // Esc: our own close, which may ask first
      this.requestClose();
    });
    // Every close ends here, including the browser's own: a second Esc without a click or key in between closes a
    // dialog without a cancelable event (Chrome's close watcher rules). The checkout is kept, as with "Keep order".
    this.#d.addEventListener('close', () => this.#onClosed());
    this.#d.addEventListener('input', ev => this.#onInput(ev.target as HTMLInputElement));
    this.#d.addEventListener('change', ev => this.#onInput(ev.target as HTMLInputElement));
    this.#d.addEventListener('submit', ev => {
      ev.preventDefault();
      void this.#pay(this.#method);
    });
  }

  /** The button's click: a new form, or back to the payment still waiting. */
  open(): void {
    if (this.#checkout) return this.#show('pay');
    this.#show('form');
    this.h.emit('loom21:open', { product: this.h.productKey });
  }

  /** After a reload: back on the payment step, or the success screen once. */
  async resume(saved: SavedCheckout): Promise<void> {
    let status: CheckoutStatus;
    try {
      status = await this.h.api.status(saved.token);
    } catch (err) {
      if ((err as ApiError).code !== 'network') clearCheckout(this.h.productKey);
      return;
    }
    if (status.status === 'awaiting_payment') {
      this.#checkout = saved;
      const live = saved.payment?.expiresAt && Date.parse(saved.payment.expiresAt) > Date.now();
      this.#payment = live ? saved.payment! : null;
      this.#show('pay');
    } else {
      clearCheckout(this.h.productKey);
      if (status.status === 'paid') this.#onPaid(status);
    }
  }

  /** The button is gone or reloading: stop polling and remove the dialog. The saved checkout stays for a reload. */
  destroy(): void {
    clearTimeout(this.#quoteTimer);
    clearInterval(this.#tick);
    this.#poller?.stop();
    this.#d.remove();
  }

  /** Close (×, Esc, backdrop): while a payment is waiting, ask first. */
  requestClose(): void {
    if (this.#view === 'pay' && this.#checkout) return this.#show('confirm');
    if (this.#view === 'confirm') return this.#show('pay');
    this.#close();
  }

  #t = (key: TextKey, params?: Record<string, string | number>) => t(this.h.locale, key, params);

  #close(): void {
    this.#d.close();
  }

  #onClosed(): void {
    this.#poller?.stop();
    this.#poller = null;
    clearInterval(this.#tick);
    this.h.emit('loom21:closed', { orderNumber: this.#paid?.orderNumber ?? undefined });
    if (this.#view === 'paid' || this.#view === 'expired') {
      this.#paid = null;
      this.#view = 'form';
    }
    this.h.focusButton();
  }

  #error(text = ''): void {
    this.#d.querySelector('.err')!.textContent = text;
  }

  #show(view: View): void {
    this.#view = view;
    clearInterval(this.#tick);
    this.#error();
    const body = this.#d.querySelector<HTMLElement>('.bd')!;
    body.className = view === 'form' ? 'bd' : 'bd cen';
    body.innerHTML = this.#render(view);
    this.#d.querySelector('#l21p')!.textContent = view === 'form' ? this.#unitPrice() : '';
    if (!this.#d.open) this.#d.showModal();
    if (view === 'form') this.#requestQuote(0);
    if (view === 'pay') {
      this.#startPolling();
      this.#startCountdown();
    }
    (body.querySelector<HTMLElement>('input,select,.btn,a') ?? this.#d.querySelector<HTMLElement>('.x'))!.focus();
  }

  #unitPrice(): string {
    const { product, store, display, locale } = this.h;
    const sats = product.priceSats == null ? null : withVat(product.priceSats, store.vat);
    return formatPrice(display, withVat(product.price, store.vat), product.currency, sats, locale);
  }

  #render(view: View): string {
    switch (view) {
      case 'form': return this.#formHtml();
      case 'pay': return this.#payHtml();
      case 'paid': {
        const s = this.#paid!;
        return `<p class="ok" style="font-size:18px">✓ ${this.#t('paidTitle')}</p><p>${e(this.#t('paid', { order: s.orderNumber ?? '' }))}</p>${s.buyerEmail ? `<p class="sub">${e(this.#t('receiptTo', { email: s.buyerEmail }))}</p>` : ''}<div class="acts" style="width:100%">${s.receiptUrl ? `<a class="btn sec full" href="${e(s.receiptUrl)}" target="_blank" rel="noopener">${this.#t('receipt')}</a>` : ''}<button type="button" class="btn full" data-a="close">${this.#t('done')}</button></div>`;
      }
      case 'expired':
        return `<p style="font-weight:600">${this.#t('expiredTitle')}</p><p class="sub">${this.#t('checkout_expired')}</p><button type="button" class="btn full" data-a="again">${this.#t('startAgain')}</button>`;
      case 'confirm':
        return `<p style="font-weight:600">${this.#t('cancelTitle')}</p><p class="sub">${this.#t('cancelText')}</p><div class="acts" style="width:100%"><button type="button" class="btn full" data-a="keep">${this.#t('cancelNo')}</button><button type="button" class="btn sec full" data-a="cancel">${this.#t('cancelYes')}</button></div>`;
    }
  }

  #formHtml(): string {
    const { store, product, showQuantity, locale } = this.h;
    const max = product.availability.maxQuantity;
    let html = '<form novalidate class="bd" style="padding:0">';
    if (showQuantity && max > 1)
      html += `<div><span class="sub" id="l21q">${this.#t('quantity')}</span><div class="qty"><button type="button" data-a="dec" aria-label="${this.#t('less')}">−</button><input name="qty" type="number" inputmode="numeric" min="1" max="${max}" value="${this.#qty}" aria-labelledby="l21q"><button type="button" data-a="inc" aria-label="${this.#t('more')}">+</button></div></div>`;
    html += `<label>${this.#t('email')} · ${this.#t('emailHint')}<input name="email" type="email" autocomplete="email" required maxlength="256"></label>`;
    html += `<label>${this.#t('name')}<input name="name" autocomplete="name" maxlength="200"></label>`;

    const methods = product.isService ? [] : store.shippingMethods;
    if (methods.length > 1)
      html += `<label>${this.#t('shipping')}<select name="ship" required><option value=""></option>${methods.map(m => `<option value="${m.id}"${m.id === this.#shipping ? ' selected' : ''}>${e(m.name)} · ${e(formatFiat(withVat(m.price, store.vat), store.currency, locale))}</option>`).join('')}</select></label>`;
    html += '<div id="l21addr"></div>';

    if (store.paymentMethods.length > 1)
      html += `<fieldset><legend>${this.#t('payWith')}</legend>${store.paymentMethods.map(m => `<label class="opt"><input type="radio" name="method" value="${m}"${m === this.#method ? ' checked' : ''}>${this.#t(m)}</label>`).join('')}</fieldset>`;
    html += `<div class="sum" aria-live="polite"></div><button type="submit" class="btn full" part="pay">${this.#t('pay', { amount: '' })}</button></form>`;
    queueMicrotask(() => this.#renderAddress());
    return html;
  }

  #renderAddress(): void {
    const box = this.#d.querySelector<HTMLElement>('#l21addr');
    if (!box) return;
    const needs = this.h.store.shippingMethods.find(m => m.id === this.#shipping)?.requiresAddress && !this.h.product.isService;
    if (!needs) return void (box.innerHTML = '');
    if (box.childElementCount) return;
    const names = new Intl.DisplayNames([this.h.locale], { type: 'region' });
    const pageRegion = (navigator.language.split('-')[1] || '').toUpperCase();
    const preset = this.h.locale === 'bg' ? 'BG' : COUNTRIES.includes(pageRegion) ? pageRegion : '';
    const options = COUNTRIES.map(c => [c, names.of(c) ?? c]).sort((a, b) => a[1].localeCompare(b[1], this.h.locale))
      .map(([c, n]) => `<option value="${c}"${c === preset ? ' selected' : ''}>${e(n)}</option>`).join('');
    box.className = 'bd';
    box.style.padding = '0';
    box.innerHTML = `<label>${this.#t('address')}<input name="line1" autocomplete="address-line1" required maxlength="200"></label><label>${this.#t('line2')}<input name="line2" autocomplete="address-line2" maxlength="200"></label><div class="two"><label>${this.#t('city')}<input name="city" autocomplete="address-level2" required maxlength="100"></label><label>${this.#t('postcode')}<input name="postcode" autocomplete="postal-code" maxlength="20"></label></div><label>${this.#t('country')}<select name="country" autocomplete="country" required><option value=""></option>${options}</select></label>`;
  }

  #onInput(el: HTMLInputElement): void {
    el.removeAttribute('aria-invalid');
    if (el.name === 'qty') {
      if (el.value === '') return;
      this.#qty = clampQuantity(el.value, this.h.product.availability.maxQuantity);
      this.#requestQuote();
    } else if (el.name === 'ship') {
      this.#shipping = el.value ? Number(el.value) : null;
      this.#renderAddress();
      this.#requestQuote();
    } else if (el.name === 'method') {
      this.#method = el.value as PaymentMethod;
    }
  }

  #setQty(qty: number): void {
    this.#qty = clampQuantity(qty, this.h.product.availability.maxQuantity);
    const input = this.#d.querySelector<HTMLInputElement>('[name=qty]');
    if (input) input.value = String(this.#qty);
  }

  /** POST /quotes, 300 ms after the last change. Only the newest answer is shown. */
  #requestQuote(delay = 300): void {
    clearTimeout(this.#quoteTimer);
    this.#quoteTimer = setTimeout(async () => {
      const seq = ++this.#quoteSeq;
      try {
        const quote = await this.h.api.quote({ items: [{ productId: this.h.product.id, quantity: this.#qty }], shippingMethodId: this.#shipping });
        if (seq !== this.#quoteSeq || this.#view !== 'form') return;
        this.#quote = quote;
        const over = quote.warnings.find(w => w.code === 'quantity_over_max');
        const line = quote.lines[0];
        if (over && line) this.#setQty(line.maxQuantity);
        const gone = !line || quote.warnings.some(w => w.code === 'out_of_stock' || w.code === 'product_unavailable');
        this.#renderSummary(gone);
        if (gone) this.#error(this.#t('not_found'));
      } catch (err) {
        if (seq === this.#quoteSeq) this.#error(errorText(this.h.locale, err as ApiError));
      }
    }, delay);
  }

  #renderSummary(soldOut = false): void {
    const q = this.#quote;
    const sum = this.#d.querySelector('.sum');
    const pay = this.#d.querySelector<HTMLButtonElement>('[part=pay]');
    if (!q || !sum || !pay) return;
    const { locale, display } = this.h;
    const money = (n: number) => formatFiat(n, q.currency, locale);
    const total = formatPrice(display, q.total, q.currency, q.totalSats, locale) || money(q.total);
    const rows: [string, string][] = [];
    if (q.shipping > 0 || q.vat.amount > 0) rows.push([this.#t('subtotal'), money(q.subtotal)]);
    if (q.shipping > 0) rows.push([this.#t('shipping'), money(q.shipping)]);
    if (q.vat.amount > 0) rows.push([this.#t('vat', { n: q.vat.rate }), money(q.vat.amount)]);
    rows.push([this.#t('total'), total]);
    sum.innerHTML = rows.map(([k, v], i) => `<div${i === rows.length - 1 ? ' class="tot"' : ''}><span>${e(k)}</span><span>${e(v)}</span></div>`).join('');
    pay.textContent = this.#t('pay', { amount: display === 'sats' && q.totalSats ? formatSats(q.totalSats, locale) : money(q.total) });
    pay.disabled = soldOut;
  }

  /** Every required field filled and valid; the first wrong one is marked and focused. */
  #validate(): boolean {
    const form = this.#d.querySelector('form');
    if (!form) return true;
    const bad = [...form.querySelectorAll<HTMLInputElement>('input,select')].filter(el => !el.checkValidity());
    bad.forEach(el => el.setAttribute('aria-invalid', 'true'));
    if (bad.length) {
      this.#error(this.#t('validation_failed'));
      bad[0].focus();
    }
    return !bad.length;
  }

  #value(name: string): string {
    return this.#d.querySelector<HTMLInputElement>(`[name=${name}]`)?.value.trim() ?? '';
  }

  /**
   * Pay: creates the checkout once (its Idempotency-Key kept until an answer, so a retry after a dropped connection
   * gets the same checkout), then opens the payment. A card payment's tab is opened here, in the click, before any
   * await, or popup blockers stop it.
   */
  async #pay(method: PaymentMethod): Promise<void> {
    if (this.#busy) return;
    if (!this.#checkout && !this.#validate()) return;
    const popup = method === 'card' ? window.open('about:blank', '_blank') : null;
    if (popup) popup.opener = null;
    this.#busy = true;
    this.#error();
    const button = this.#d.querySelector<HTMLButtonElement>('[part=pay]');
    if (button) button.disabled = true;
    try {
      if (!this.#checkout) await this.#createCheckout();
      const payment = await this.h.api.pay(this.#checkout!.token, method);
      this.#payment = payment;
      this.#method = method;
      saveCheckout(this.h.productKey, { ...this.#checkout!, payment });
      this.#checkout!.payment = payment;
      const hosted = method === 'card' || (method === 'lightning' && !payment.bolt11) || (method === 'onchain' && !payment.onchainAddress);
      this.#blockedUrl = null;
      if (hosted && payment.hostedPaymentUrl) {
        if (popup) popup.location.href = payment.hostedPaymentUrl;
        else this.#blockedUrl = payment.hostedPaymentUrl;
      } else popup?.close();
      this.#show('pay');
    } catch (err) {
      popup?.close();
      await this.#payFailed(err as ApiError);
    } finally {
      this.#busy = false;
      if (button?.isConnected) button.disabled = false;
    }
  }

  async #createCheckout(): Promise<void> {
    const { api, product, store } = this.h;
    const needsAddress = !product.isService && store.shippingMethods.find(m => m.id === this.#shipping)?.requiresAddress;
    const address: Address | undefined = needsAddress
      ? { line1: this.#value('line1'), line2: this.#value('line2'), city: this.#value('city'), postcode: this.#value('postcode'), country: this.#value('country') }
      : undefined;
    const body = {
      items: [{ productId: product.id, quantity: this.#qty }],
      shippingMethodId: this.#shipping,
      buyer: { email: this.#value('email'), name: this.#value('name') || undefined, shippingAddress: address },
    };
    this.#idemKey ??= newIdempotencyKey();
    let checkout;
    try {
      checkout = await api.checkout(body, this.#idemKey);
    } catch (err) {
      if ((err as ApiError).code === 'network') throw err; // keep the key: the retry gets the same checkout
      this.#idemKey = null;
      if ((err as ApiError).code !== 'idempotency_conflict') throw err;
      checkout = await api.checkout(body, (this.#idemKey = newIdempotencyKey()));
    }
    this.#idemKey = null;
    this.#checkout = { token: checkout.checkoutToken, expiresAt: checkout.expiresAt, total: checkout.total, currency: checkout.currency };
    saveCheckout(this.h.productKey, this.#checkout);
    this.h.emit('loom21:checkout-created', { orderNumber: checkout.orderNumber, total: checkout.total, currency: checkout.currency });
  }

  async #payFailed(err: ApiError): Promise<void> {
    if (err.code === 'checkout_expired') return this.#onEnded();
    if (err.code === 'checkout_paid' && this.#checkout) {
      try {
        return this.#onPaid(await this.h.api.status(this.#checkout.token));
      } catch {
        // Fall through to the message.
      }
    }
    if (err.code === 'insufficient_stock') {
      const left = err.problem?.lines?.[0]?.available ?? 0;
      if (left >= 1) this.#setQty(left);
      this.#requestQuote(0);
    }
    if (err.code === 'validation_failed') this.#markServerErrors(err);
    if (this.#checkout && this.#view !== 'pay') {
      this.#payment = null;
      this.#show('pay');
    }
    this.#error(errorText(this.h.locale, err));
  }

  /** The API's field names (buyer.email, buyer.shippingAddress.city, items[0].quantity) on our inputs. */
  #markServerErrors(err: ApiError): void {
    for (const field of Object.keys(err.problem?.errors ?? {})) {
      const last = field.split('.').pop()!.replace(/\[\d+\]/, '').toLowerCase();
      const name = ({ quantity: 'qty', shippingmethodid: 'ship', shippingaddress: 'line1' } as Record<string, string>)[last] ?? last;
      this.#d.querySelector(`[name=${name}]`)?.setAttribute('aria-invalid', 'true');
    }
  }

  #payHtml(): string {
    const p = this.#payment;
    const { store, locale } = this.h;
    const other = store.paymentMethods.length > 1 && p ? `<button type="button" class="lnk" data-a="other">${this.#t('otherWay')}</button>` : '';
    const countdown = `<p class="sub"><span class="cd" aria-hidden="true"></span><span class="sr" aria-live="polite"></span></p><p class="sub">${this.#t('waiting')}</p>`;
    if (!p) // choose a method (first try failed, "Pay another way", or the invoice ran out before a reload)
      return `<p>${formatFiat(this.#checkout!.total, this.#checkout!.currency, locale)}</p><div class="acts" style="width:100%">${store.paymentMethods.map(m => `<button type="button" class="btn${m === this.#method ? '' : ' sec'} full" data-a="pay" data-m="${m}">${this.#t('payWith')} ${this.#t(m)}</button>`).join('')}</div>${countdown}`;

    if (p.method === 'lightning' && p.bolt11) {
      const invoice = p.bolt11.toUpperCase();
      return `<div class="qrb cen"><p class="sub">${this.#t('scan')}</p><div class="qr">${qrSvg('LIGHTNING:' + invoice, this.#t('qr'))}</div></div><div class="acts" style="width:100%"><a class="btn full" href="lightning:${e(p.bolt11)}">${this.#t('openWallet')}</a><button type="button" class="btn sec full" data-a="copy" data-v="${e(p.bolt11)}">${this.#t('copy')}</button></div>${countdown}${other}`;
    }
    if (p.method === 'onchain' && p.onchainAddress) {
      const amount = p.amountSats ? formatSats(p.amountSats, locale) : '';
      return `<div class="qrb cen"><p class="sub">${e(this.#t('scanOnchain', { amount }))}</p><div class="qr">${qrSvg(p.bip21 || p.onchainAddress, this.#t('qrOnchain'))}</div><p class="mono">${e(p.onchainAddress)}</p></div><div class="acts" style="width:100%"><a class="btn full" href="${e(p.bip21 || 'bitcoin:' + p.onchainAddress)}">${this.#t('openWallet')}</a><button type="button" class="btn sec full" data-a="copy" data-v="${e(p.onchainAddress)}">${this.#t('copyAddress')}</button></div>${countdown}${other}`;
    }
    // Card, or a processor that gave only its pay page: the page is in another tab, we poll here.
    const url = p.hostedPaymentUrl ?? '';
    return `<p>${this.#blockedUrl ? '' : this.#t('newTab')}</p><a class="btn${this.#blockedUrl ? '' : ' sec'} full" href="${e(url)}" target="_blank" rel="noopener">${this.#t('openPage')}</a>${countdown}${other}`;
  }

  async #act(action: string, el: HTMLElement): Promise<void> {
    switch (action) {
      case 'close': return this.requestClose();
      case 'inc': case 'dec':
        this.#setQty(this.#qty + (action === 'inc' ? 1 : -1));
        return this.#requestQuote();
      case 'copy':
        try {
          await navigator.clipboard.writeText(el.dataset.v!);
          el.textContent = this.#t('copied');
        } catch {
          // No clipboard (insecure page): the QR code and the wallet link still work.
        }
        return;
      case 'other':
        this.#payment = null;
        return this.#show('pay');
      case 'pay':
        return this.#pay(el.dataset.m as PaymentMethod);
      case 'keep':
        return this.#close();
      case 'cancel': {
        const token = this.#checkout?.token;
        this.#forget();
        this.#view = 'form';
        this.#close();
        if (token) await this.h.api.cancel(token).catch(() => {});
        return;
      }
      case 'again':
        this.#forget();
        return this.#show('form');
    }
  }

  #forget(): void {
    this.#poller?.stop();
    this.#poller = null;
    this.#checkout = null;
    this.#payment = null;
    this.#idemKey = null;
    clearCheckout(this.h.productKey);
  }

  #startPolling(): void {
    if (this.#poller || !this.#checkout) return;
    this.#poller = new Poller(this.h.api, this.#checkout.token, status => {
      if (status.status === 'paid') this.#onPaid(status);
      else if (status.status !== 'awaiting_payment') this.#onEnded();
    }, err => {
      if (err.code === 'not_found') this.#onEnded();
    });
    this.#poller.start();
  }

  /** The visible countdown each second; the screen reader's at most once a minute. */
  #startCountdown(): void {
    const ends = Date.parse(this.#payment?.expiresAt ?? this.#checkout!.expiresAt);
    let lastMinute = -1;
    const update = () => {
      const left = ends - Date.now();
      const cd = this.#d.querySelector('.cd');
      if (!cd) return clearInterval(this.#tick);
      cd.textContent = this.#t('expiresIn', { time: formatCountdown(left) });
      const minutes = Math.ceil(left / 60000);
      if (minutes !== lastMinute && left > 0) {
        lastMinute = minutes;
        this.#d.querySelector('.sr')!.textContent = this.#t('minutesLeft', { n: minutes });
      }
    };
    update();
    this.#tick = setInterval(update, 1000);
  }

  #onPaid(status: CheckoutStatus): void {
    const first = !this.#paid;
    this.#forget();
    this.#paid = status;
    this.#show('paid');
    if (first)
      this.h.emit('loom21:paid', { orderNumber: status.orderNumber, method: status.method, total: status.total, currency: status.currency });
  }

  #onEnded(): void {
    this.#forget();
    this.#show('expired');
    this.h.emit('loom21:expired', {});
  }
}
