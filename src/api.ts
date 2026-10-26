import type {
  Checkout, CheckoutRequest, CheckoutStatus, Payment, PaymentMethod, Problem, Product, Quote, QuoteRequest, Store,
} from './types';

export const DEFAULT_API_BASE = 'https://app.loom21.com/storefront/v1';

/** A failed call: the API's problem `code`, or `network` when no answer could be read. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly problem?: Problem,
    readonly retryAfter?: number,
  ) {
    super(problem?.detail || code);
  }
}

/** The Storefront API with one publishable key. No cookies; the key goes in a header, never the URL. */
export class StorefrontApi {
  readonly base: string;
  #status = new Map<string, { etag: string; body: CheckoutStatus }>();

  constructor(readonly key: string, base: string = DEFAULT_API_BASE) {
    this.base = base.replace(/\/+$/, '');
  }

  store = () => this.#call<Store>('GET', '/store');
  product = (idOrSlug: string) => this.#call<Product>('GET', '/products/' + encodeURIComponent(idOrSlug));
  quote = (body: QuoteRequest) => this.#call<Quote>('POST', '/quotes', body);
  checkout = (body: CheckoutRequest, idempotencyKey: string) =>
    this.#call<Checkout>('POST', '/checkouts', body, { 'Idempotency-Key': idempotencyKey });
  pay = (token: string, method: PaymentMethod) =>
    this.#call<Payment>('POST', `/checkouts/${encodeURIComponent(token)}/payments`, { method });
  cancel = (token: string) => this.#call<CheckoutStatus>('POST', `/checkouts/${encodeURIComponent(token)}/cancel`);

  /** Polled every 2 s: sends the last ETag, so an unchanged checkout is a 304 and the last answer is reused. */
  async status(token: string): Promise<CheckoutStatus> {
    const known = this.#status.get(token);
    const response = await this.#fetch('GET', `/checkouts/${encodeURIComponent(token)}`, undefined,
      known ? { 'If-None-Match': known.etag } : {});
    if (response.status === 304 && known) return known.body;
    const body = await this.#read<CheckoutStatus>(response);
    const etag = response.headers.get('ETag');
    if (etag) this.#status.set(token, { etag, body });
    return body;
  }

  async #call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    return this.#read<T>(await this.#fetch(method, path, body, headers));
  }

  async #fetch(method: string, path: string, body: unknown, headers: Record<string, string>): Promise<Response> {
    try {
      return await fetch(this.base + path, {
        method,
        headers: {
          'Loom21-Publishable-Key': this.key,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch {
      // Offline, DNS, or a refusal the browser hid from us (no CORS headers).
      throw new ApiError('network', 0);
    }
  }

  async #read<T>(response: Response): Promise<T> {
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      json = undefined;
    }
    if (response.ok && json !== undefined) return json as T;
    const problem = json as Problem | undefined;
    const retryAfter = Number(response.headers.get('Retry-After')) || undefined;
    throw new ApiError(problem?.code || (response.status === 429 ? 'rate_limited' : 'unknown'), response.status, problem, retryAfter);
  }
}
