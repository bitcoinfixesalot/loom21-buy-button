import { ApiError, DEFAULT_API_BASE, StorefrontApi } from './api';
import { loadCheckout } from './checkout-session';
import { formatPrice, priceDisplay, withVat, type PriceDisplay } from './format';
import { developerHint, errorText, resolveLocale, t, type Locale } from './i18n';
import { Modal, type ModalHost } from './modal';
import { getStore } from './store-cache';
import { css, textOn } from './styles';
import type { Product, Store } from './types';

declare const __VERSION__: string;

type State = 'loading' | 'ready' | 'error';

/**
 * <loom21-buy-button key="l21_pk_live_…" product="raw-honey-500g">: a Buy button for one Loom21 product, with its
 * checkout in a dialog. Everything lives in its Shadow DOM.
 */
export class Loom21BuyButton extends HTMLElement implements ModalHost {
  static readonly version = __VERSION__;
  static observedAttributes = ['key', 'product', 'label', 'quantity', 'show-quantity', 'show-price', 'price-display', 'theme', 'accent', 'locale', 'api-base'];

  #root = this.attachShadow({ mode: 'open' });
  #wrap: HTMLDivElement;
  #button: HTMLButtonElement;
  #info: HTMLSpanElement;
  #state: State = 'loading';
  #error: ApiError | null = null;
  #modal: Modal | null = null;
  #loads = 0;
  api!: StorefrontApi;
  store!: Store;
  product!: Product;

  constructor() {
    super();
    this.#root.innerHTML = `<style>${css}</style><div class="w"><button type="button" class="btn" part="button" disabled></button><span class="pr"></span></div>`;
    this.#wrap = this.#root.querySelector('.w')!;
    this.#button = this.#root.querySelector('button')!;
    this.#info = this.#root.querySelector('.pr')!;
    this.#button.addEventListener('click', () => this.#modal?.open());
  }

  connectedCallback(): void {
    void this.#load();
  }

  disconnectedCallback(): void {
    this.#modal?.destroy();
    this.#modal = null;
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (!this.isConnected || old === value) return;
    if (name === 'key' || name === 'product' || name === 'api-base') void this.#load();
    else this.#render();
  }

  get productKey(): string {
    return (this.getAttribute('product') || '').trim();
  }

  get locale(): Locale {
    return resolveLocale(this.getAttribute('locale'));
  }

  get display(): PriceDisplay {
    return priceDisplay(this.getAttribute('price-display'), this.store?.bitcoin ?? { hidePrices: false, bitcoinOnly: false });
  }

  get showQuantity(): boolean {
    return this.getAttribute('show-quantity') !== 'false';
  }

  get quantity(): number {
    return Number(this.getAttribute('quantity')) || 1;
  }

  emit(name: string, detail: object): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  focusButton(): void {
    this.#button.focus();
  }

  async #load(): Promise<void> {
    const load = ++this.#loads;
    this.#modal?.destroy();
    this.#modal = null;
    this.#state = 'loading';
    this.#render();

    const key = (this.getAttribute('key') || '').trim();
    const product = this.productKey;
    if (!key.startsWith('l21_pk_') || !product) {
      console.error('Loom21: <loom21-buy-button> needs a publishable key (key="l21_pk_…") and a product slug (product="…").');
      return this.#fail(new ApiError('invalid_key', 0));
    }

    this.api = new StorefrontApi(key, this.getAttribute('api-base') || DEFAULT_API_BASE);
    try {
      const [store, item] = await Promise.all([getStore(this.api), this.api.product(product)]);
      if (load !== this.#loads) return;
      this.store = store;
      this.product = item;
    } catch (err) {
      if (load !== this.#loads) return;
      const error = err as ApiError;
      const hint = developerHint(error, location.origin, product)
        ?? (error.code === 'network' ? `Loom21: couldn't reach ${this.api.base}. If the page is online, check that ${location.origin} is in Allowed websites in Settings → Storefronts → Developer.` : null);
      if (hint) console.error(hint);
      return this.#fail(error);
    }

    this.#state = 'ready';
    this.#modal = new Modal(this, this.#wrap);
    this.#render();
    const saved = loadCheckout(product);
    if (saved) void this.#modal.resume(saved);
  }

  #fail(error: ApiError): void {
    this.#state = 'error';
    this.#error = error;
    this.#render();
  }

  #render(): void {
    const theme = this.getAttribute('theme');
    this.#wrap.className = 'w ' + (theme === 'dark' ? 'dark' : theme === 'light' ? '' : 'auto');
    const accent = this.getAttribute('accent');
    if (accent) this.#wrap.style.setProperty('--l21-accent', accent);
    else this.#wrap.style.removeProperty('--l21-accent');
    this.#wrap.style.removeProperty('--l21-on-accent');
    this.#wrap.style.setProperty('--l21-on-accent', textOn(getComputedStyle(this.#button).backgroundColor));

    const locale = this.locale;
    let label = this.getAttribute('label') || t(locale, 'buy');
    let info = '';
    let enabled = false;
    if (this.#state === 'error') {
      info = errorText(locale, this.#error!);
    } else if (this.#state === 'ready') {
      const { store, product } = this;
      if (product.availability.status === 'out_of_stock') label = t(locale, 'soldOut');
      else if (!store.checkoutAvailable || !store.paymentMethods.length) label = t(locale, 'unavailable');
      else enabled = true;
      if (enabled && this.getAttribute('show-price') !== 'false') {
        const sats = product.priceSats == null ? null : withVat(product.priceSats, store.vat);
        info = formatPrice(this.display, withVat(product.price, store.vat), product.currency, sats, locale);
      }
    }
    this.#button.textContent = label;
    this.#button.disabled = !enabled;
    this.#button.setAttribute('aria-busy', String(this.#state === 'loading'));
    this.#info.textContent = info;
  }
}

if (!customElements.get('loom21-buy-button')) customElements.define('loom21-buy-button', Loom21BuyButton);

declare global {
  interface HTMLElementTagNameMap {
    'loom21-buy-button': Loom21BuyButton;
  }
}
