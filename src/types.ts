// The Storefront API's answers and requests (storefront/v1, JSON in camelCase), as the button uses them.
// Mirrors https://app.loom21.com/storefront/v1/openapi.json; fields the button doesn't read are left out.

export type PaymentMethod = 'lightning' | 'onchain' | 'card';

export interface ShippingMethod {
  id: number;
  name: string;
  /** Before VAT. */
  price: number;
  requiresAddress: boolean;
}

export interface Store {
  name: string;
  logoUrl: string | null;
  supportEmail: string | null;
  currency: string;
  /** The shop's methods, in its order. */
  paymentMethods: PaymentMethod[];
  shippingMethods: ShippingMethod[];
  bitcoin: { hidePrices: boolean; bitcoinOnly: boolean };
  /** `rate` is a percentage (20 = 20%), added on the order's total. */
  vat: { charged: boolean; rate: number };
  stockDisplay: 'bucket' | 'exact' | 'hidden';
  /** False while the shop isn't taking orders (never says why). */
  checkoutAvailable: boolean;
  showPoweredBy: boolean;
}

export interface ProductImage {
  thumb: string;
  normal: string;
  large: string;
}

export type AvailabilityStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'available';

export interface Availability {
  status: AvailabilityStatus;
  /** Only in the shop's "exact" stock display. */
  quantity: number | null;
  /** What one line may order. */
  maxQuantity: number;
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  isService: boolean;
  /** One unit, before VAT, in `currency`. */
  price: number;
  /** Indicative sats for `price` (before VAT); null when the shop hides Bitcoin prices or has no rate. */
  priceSats?: number | null;
  currency: string;
  images: ProductImage[];
  availability: Availability;
}

export interface CartItem {
  productId: number;
  quantity: number;
}

export interface QuoteRequest {
  items: CartItem[];
  shippingMethodId?: number | null;
}

export interface QuoteWarning {
  code: 'product_unavailable' | 'quantity_over_max' | 'out_of_stock' | 'shipping_method_unknown' | string;
  productId: number | null;
  message: string;
}

export interface Quote {
  currency: string;
  lines: { productId: number; quantity: number; unitPrice: number; lineTotal: number; maxQuantity: number }[];
  subtotal: number;
  shipping: number;
  vat: { rate: number; amount: number };
  /** With VAT. */
  total: number;
  /** Indicative: the rate is fixed when the payment is opened. */
  totalSats: number | null;
  warnings: QuoteWarning[];
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postcode?: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
}

export interface CheckoutRequest extends QuoteRequest {
  buyer: { email: string; name?: string; shippingAddress?: Address };
}

export type CheckoutState = 'awaiting_payment' | 'paid' | 'expired' | 'cancelled';

export interface Checkout {
  /** Given only in the creation answer: it reads and pays the checkout. */
  checkoutToken: string;
  status: CheckoutState;
  orderNumber: string | null;
  expiresAt: string;
  total: number;
  currency: string;
  paymentMethods: PaymentMethod[];
}

export interface Payment {
  paymentId: string;
  method: PaymentMethod;
  amountSats: number | null;
  bolt11: string | null;
  onchainAddress: string | null;
  bip21: string | null;
  expiresAt: string | null;
  hostedPaymentUrl: string | null;
}

export interface CheckoutStatus {
  status: CheckoutState;
  orderNumber: string | null;
  expiresAt: string;
  paidAt: string | null;
  method: PaymentMethod | null;
  total: number;
  currency: string;
  /** Masked, e.g. m***@example.com. */
  buyerEmail: string | null;
  receiptUrl: string | null;
  hostedPaymentUrl: string | null;
}

/** RFC 7807 problem details; `code` is stable. */
export interface Problem {
  status: number;
  code: string;
  detail?: string;
  /** validation_failed: messages per field (e.g. "buyer.email"). */
  errors?: Record<string, string[]>;
  /** insufficient_stock */
  lines?: { productId: number; requested: number; available: number }[];
}
