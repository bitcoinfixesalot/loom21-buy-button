# Loom21 Buy button

One line of HTML that sells a [Loom21](https://loom21.com) product on any website: WordPress, Webflow, Squarespace, Ghost, a plain HTML page. Buyers pay with Lightning right on the page, or with on-chain Bitcoin or a card. The order and the stock update in Loom21 the moment it's paid.

```html
<script src="https://app.loom21.com/embed/buy-button/v1/buy-button.js" defer></script>

<loom21-buy-button
  key="l21_pk_live_7Hq2..."
  product="raw-honey-500g">
</loom21-buy-button>
```

- **Your money:** Lightning and on-chain payments settle to your own processor (BTCPay, LNbits, Speed, Glow). Loom21 never holds funds.
- **Your data:** every sale is a normal Loom21 order, which you can export like any other.
- **Your integration:** MIT licensed, on the public [Storefront API](https://app.loom21.com/storefront/v1/openapi.json). Fork it or host the script yourself.
- **Private:** no cookies, no analytics, no third-party requests. The only calls go to the Storefront API.
- **Small:** one file, under 15 KB gzipped, no dependencies.

## Quickstart

1. In Loom21, open **Settings → Storefronts** and create a storefront.
2. Publish the product: **Products**, tick it, then **Publish to storefront**. Its **Storefront** tab shows its slug.
3. In the storefront's **Developer** tab, add your website (e.g. `https://shop.example.com`) to **Allowed websites** and copy the publishable key.
4. Paste the snippet above into your page with your key and product slug.

The Embed dialog in Loom21 (a product's **Embed** button) builds the snippet for you, with a live preview.

## Attributes

| Attribute | Required | Default | Notes |
|---|---|---|---|
| `key` | yes | | Publishable key, `l21_pk_live_…` |
| `product` | yes | | Product slug or id |
| `label` | no | "Buy now" / "Купи" | Button text |
| `quantity` | no | `1` | Starting quantity |
| `show-quantity` | no | `true` | Quantity stepper in the checkout, up to what one order may take |
| `show-price` | no | `true` | Price under the button |
| `price-display` | no | `both` | `fiat`, `sats` or `both`. A shop that shows only Bitcoin prices always gets `sats`; one that hides them always gets `fiat`. |
| `theme` | no | `auto` | `light`, `dark` or `auto` (follows `prefers-color-scheme`) |
| `accent` | no | Loom21 purple | Any CSS colour, for the button and highlights. The text on it is black or white, whichever is readable. |
| `locale` | no | page language, else `en` | `en` or `bg` |
| `api-base` | no | `https://app.loom21.com/storefront/v1` | For a self-hosted Loom21 or staging |

Prices are shown with VAT when the shop charges it. Bitcoin amounts are indicative until the payment is opened.

## Events

Dispatched on the element (`bubbles: true, composed: true`), so you can listen on `document`:

| Event | `detail` |
|---|---|
| `loom21:open` | `{ product }` |
| `loom21:checkout-created` | `{ orderNumber, total, currency }` (`orderNumber` is `null` until paid) |
| `loom21:paid` | `{ orderNumber, method, total, currency }` |
| `loom21:expired` | `{}` |
| `loom21:closed` | `{ orderNumber? }` |

The buyer's details are never in an event.

```js
document.addEventListener('loom21:paid', e => {
  window.location.href = '/thank-you?order=' + e.detail.orderNumber;
});
```

## Styling

The button lives in a Shadow DOM: your page's CSS can't break it, and it can't break your page. Change it with:

```css
loom21-buy-button {
  --l21-accent: #0b7a3e;   /* same as the accent attribute */
  --l21-radius: 999px;     /* corner radius */
  --l21-font: "Inter", sans-serif;
}
loom21-buy-button::part(button) { font-size: 18px; padding: 14px 28px; }
loom21-buy-button::part(modal) { max-width: 520px; }
```

Parts: `button` (the Buy button) and `modal` (the checkout dialog).

## How the checkout works

1. On page load the button reads the shop (`GET /store`, once per key per page) and the product. Out of stock shows "Sold out"; a shop that isn't taking orders shows "Currently unavailable".
2. The checkout asks for an email (for the receipt), a name, the quantity, the delivery method when the shop has more than one, and an address when that method needs one. The total is priced by the API (`POST /quotes`).
3. **Pay** holds the stock (`POST /checkouts`) and opens the payment:
   - **Lightning**: a QR code, "Open in wallet" and Copy, with the time left.
   - **On-chain**: a QR code, the address and the amount.
   - **Card**: Loom21's pay page in a new tab, while this window waits.
4. The button checks every 2 seconds (paused while the tab is hidden) and shows the order number once paid. A reload during payment comes back to the payment step.

Closing the checkout while a payment is open asks whether to cancel the order (which releases the stock) or keep it.

## Self-hosting the script

- **npm:** `npm install @loom21/buy-button`, then `import '@loom21/buy-button'` in your bundle. It defines `<loom21-buy-button>`.
- **jsDelivr:** `https://cdn.jsdelivr.net/npm/@loom21/buy-button@1/dist/buy-button.js`.
- **Your own server:** copy `dist/buy-button.js` from a [release](https://github.com/bitcoinfixesalot/loom21-buy-button/releases).

To pin an exact version with Subresource Integrity, use the release's `buy-button.js.sri`:

```html
<script src="https://app.loom21.com/embed/buy-button/v1.0.0/buy-button.js"
  integrity="sha384-…" crossorigin="anonymous" defer></script>
```

## FAQ

**Why does my button say "Checkout is not available on this site"?**
Almost always, your website isn't in the storefront's **Allowed websites** list (Settings → Storefronts → Developer). Open the browser console: it says exactly which address to add, e.g. `Loom21: add https://shop.example.com to Allowed websites in Settings → Storefronts → Developer.` The address must match exactly, including `https://` and `www.` if you use it. The other cause is a key that was rolled or revoked: copy the current one from the same tab.

**Does it work without JavaScript?** No. It's a Web Component.

**Which browsers?** Current Chrome, Edge, Firefox and Safari (iOS 15.4 and up).

**Test mode?** Not yet. Use a real product at a tiny price.

## Development

```bash
npm install
npm run demo        # http://localhost:5173/demo/ with a mock API
npm test            # unit tests (vitest)
npx playwright install chromium
npm run test:e2e    # end-to-end tests against the mock API
npm run build       # dist/, fails over 15 KB gzipped
```

The QR code encoder is our own (`src/qr.ts`), to stay within the size budget. Its tests decode every version with an independent reader (jsQR).

Storefront API reference: [OpenAPI](https://app.loom21.com/storefront/v1/openapi.json).

## License

MIT
