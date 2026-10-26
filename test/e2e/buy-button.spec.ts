import { expect, test, type Page } from '@playwright/test';
// @ts-expect-error: a plain JS module, shared with the demo server
import { createMockApi, MOCK_KEY } from '../mock/mock-api.mjs';

type MockApi = ReturnType<typeof createMockApi>;
type Request = { method: string; path: string; headers: Record<string, string>; body?: { [k: string]: unknown } };

const BASE = '/sf/storefront/v1';
const button = (attrs = '', product = 'raw-honey-500g') =>
  `<loom21-buy-button key="${MOCK_KEY}" product="${product}" api-base="${BASE}" ${attrs}></loom21-buy-button>`;

/** The fixture page with buttons, and the API answered by the mock with these options. */
async function setup(page: Page, options: object = {}, html = button()): Promise<MockApi> {
  const api = createMockApi(options);
  await page.route(`**${BASE}/**`, async route => {
    const req = route.request();
    const answer = api.handle({
      method: req.method(),
      path: new URL(req.url()).pathname,
      headers: await req.allHeaders(),
      body: req.postData() ? JSON.parse(req.postData()!) : undefined,
    });
    await route.fulfill({ status: answer.status, headers: answer.headers, body: answer.body == null ? '' : JSON.stringify(answer.body) });
  });
  await page.goto('/test/e2e/fixture.html');
  await addButtons(page, html);
  return api;
}

async function addButtons(page: Page, html: string): Promise<void> {
  await page.evaluate(h => (document.getElementById('host')!.innerHTML = h), html);
}

const requests = (api: MockApi, method: string, path: RegExp | string): Request[] =>
  (api.state.requests as Request[]).filter(r => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)));
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: { name: string; detail: Record<string, unknown> }[] }).__events);
const dialog = (page: Page) => page.getByRole('dialog');

async function fillForm(page: Page): Promise<void> {
  await dialog(page).getByLabel(/^Email/).fill('maria@example.com');
  await dialog(page).getByLabel('Name', { exact: true }).fill('Maria Petrova');
}

const noShipping = { shippingMethods: [] };

test('Lightning: quote, checkout, payment, poll, paid; loom21:paid once and no buyer details in events', async ({ page }) => {
  const api = await setup(page, { payAfterPolls: 2 });
  const buy = page.getByRole('button', { name: 'Buy now' });
  await expect(buy).toBeEnabled();
  await expect(page.getByText('€12.00 · 13,200 sats')).toBeVisible(); // 10 + 20% VAT; sats likewise

  await buy.click();
  await expect(dialog(page)).toBeVisible();
  await fillForm(page);

  // Courier needs an address; Pickup doesn't.
  await dialog(page).getByLabel('Delivery').selectOption({ label: 'Courier · €6.00' });
  await expect(dialog(page).getByLabel('City')).toBeVisible();
  await dialog(page).getByLabel('Delivery').selectOption({ label: 'Pickup in Sofia · €0.00' });
  await expect(dialog(page).getByLabel('City')).toHaveCount(0);

  await dialog(page).getByRole('button', { name: 'More' }).click();
  await expect(dialog(page).getByRole('button', { name: 'Pay €24.00' })).toBeVisible();
  const quotes = requests(api, 'POST', '/quotes');
  expect(quotes.at(-1)!.body).toEqual({ items: [{ productId: 7, quantity: 2 }], shippingMethodId: 1 });

  await dialog(page).getByLabel('Lightning').check();
  await dialog(page).getByRole('button', { name: 'Pay €24.00' }).click();
  await expect(dialog(page).getByRole('img', { name: 'Lightning invoice QR code' })).toBeVisible();
  await expect(dialog(page).getByRole('link', { name: 'Open in wallet' })).toHaveAttribute('href', /^lightning:lnbc/);
  await expect(dialog(page).getByText(/Expires in 1[45]:\d\d/)).toBeVisible();

  const checkout = requests(api, 'POST', '/checkouts')[0];
  expect(checkout.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  expect(checkout.body).toMatchObject({ items: [{ productId: 7, quantity: 2 }], shippingMethodId: 1, buyer: { email: 'maria@example.com', name: 'Maria Petrova' } });

  await expect(dialog(page).getByText('Payment received. Order 0000000042.')).toBeVisible();
  await expect(dialog(page).getByText('Receipt sent to m***@example.com')).toBeVisible();
  expect(requests(api, 'GET', /^\/checkouts\//).some(r => r.headers['if-none-match'])).toBe(true);

  await page.waitForTimeout(2500); // no more polls, no second event
  const fired = await events(page);
  expect(fired.map(e => e.name)).toEqual(['loom21:open', 'loom21:checkout-created', 'loom21:paid']);
  expect(fired[2].detail).toEqual({ orderNumber: '0000000042', method: 'lightning', total: 24, currency: 'EUR' });
  expect(JSON.stringify(fired)).not.toMatch(/maria|Petrova/i);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  await dialog(page).getByRole('button', { name: 'Done' }).click();
  await expect(dialog(page)).toBeHidden();
});

test('on-chain is shown inline: QR, address and a bitcoin: link', async ({ page }) => {
  await setup(page, noShipping);
  await page.getByRole('button', { name: 'Buy now' }).click();
  await fillForm(page);
  await dialog(page).getByLabel('Bitcoin (on-chain)').check();
  await dialog(page).getByRole('button', { name: /^Pay/ }).click();
  await expect(dialog(page).getByRole('img', { name: 'Bitcoin address QR code' })).toBeVisible();
  await expect(dialog(page).getByText('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBeVisible();
  await expect(dialog(page).getByRole('link', { name: 'Open in wallet' })).toHaveAttribute('href', /^bitcoin:bc1q.+\?amount=/);
});

test('card: the new tab is opened in the click and sent to the hosted pay page', async ({ page, context }) => {
  await setup(page, noShipping);
  await page.getByRole('button', { name: 'Buy now' }).click();
  await fillForm(page);
  await dialog(page).getByLabel('Card').check();
  const popup = context.waitForEvent('page');
  await dialog(page).getByRole('button', { name: /^Pay/ }).click();
  const tab = await popup;
  await expect(tab).toHaveURL(/\/demo\/hosted-pay\.html\?checkout=chk_mock1/);
  await expect(dialog(page).getByText('Complete payment in the new tab. This window updates automatically.')).toBeVisible();
});

test('card with the popup blocked: a link to the pay page instead', async ({ page }) => {
  await page.addInitScript(() => (window.open = () => null));
  await setup(page, noShipping);
  await page.getByRole('button', { name: 'Buy now' }).click();
  await fillForm(page);
  await dialog(page).getByLabel('Card').check();
  await dialog(page).getByRole('button', { name: /^Pay/ }).click();
  await expect(dialog(page).getByRole('link', { name: 'Open payment page' })).toHaveAttribute('href', /hosted-pay\.html\?checkout=chk_mock1/);
});

test('insufficient_stock: the quantity is corrected and the buyer told', async ({ page }) => {
  await setup(page, { ...noShipping, insufficientStockOnce: 2 });
  await page.getByRole('button', { name: 'Buy now' }).click();
  await fillForm(page);
  await dialog(page).getByRole('spinbutton').fill('5');
  await dialog(page).getByRole('button', { name: 'Pay €60.00' }).click();
  await expect(dialog(page).getByRole('alert')).toHaveText("Only 2 left. We've updated your quantity.");
  await expect(dialog(page).getByRole('spinbutton')).toHaveValue('2');
  await expect(dialog(page).getByRole('button', { name: 'Pay €24.00' })).toBeVisible();
});

test('checkoutAvailable false: the button is disabled, "Currently unavailable", no reason given', async ({ page }) => {
  await setup(page, { checkoutAvailable: false });
  const buy = page.getByRole('button', { name: 'Currently unavailable' });
  await expect(buy).toBeDisabled();
  await expect(page.getByText(/plan/i)).toHaveCount(0);
});

test('sold out: the button is disabled', async ({ page }) => {
  await setup(page, {}, button('', 'beeswax-candle'));
  await expect(page.getByRole('button', { name: 'Sold out' })).toBeDisabled();
});

test('origin_not_allowed: a buyer message, and the console names the origin to add', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await setup(page, { error: [403, 'origin_not_allowed'] });
  await expect(page.getByText('Checkout is not available on this site.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buy now' })).toBeDisabled();
  expect(errors).toContain(`Loom21: add ${new URL(baseURL!).origin} to Allowed websites in Settings → Storefronts → Developer.`);
});

test('a reload during payment reopens the modal on the payment step', async ({ page }) => {
  await setup(page, noShipping);
  await page.getByRole('button', { name: 'Buy now' }).click();
  await fillForm(page);
  await dialog(page).getByRole('button', { name: /^Pay/ }).click();
  await expect(dialog(page).getByRole('img', { name: 'Lightning invoice QR code' })).toBeVisible();

  await page.reload();
  await addButtons(page, button());
  await expect(dialog(page).getByRole('img', { name: 'Lightning invoice QR code' })).toBeVisible();
  await expect(dialog(page).getByText('Waiting for payment…')).toBeVisible();
});

test('expired: Start again makes a new checkout with a new Idempotency-Key', async ({ page }) => {
  const api = await setup(page, { ...noShipping, expireAfterPolls: 1 });
  await page.getByRole('button', { name: 'Buy now' }).click();
  await fillForm(page);
  await dialog(page).getByRole('button', { name: /^Pay/ }).click();
  await expect(dialog(page).getByText('Checkout expired', { exact: true })).toBeVisible();
  expect((await events(page)).map(e => e.name)).toContain('loom21:expired');

  await dialog(page).getByRole('button', { name: 'Start again' }).click();
  await fillForm(page);
  await dialog(page).getByRole('button', { name: /^Pay/ }).click();
  await expect(dialog(page).getByRole('img', { name: 'Lightning invoice QR code' })).toBeVisible();
  const keys = requests(api, 'POST', '/checkouts').map(r => r.headers['idempotency-key']);
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
  expect(api.state.checkouts.size).toBe(2);
});

test('closing while paying asks first; "Cancel order" cancels the checkout', async ({ page }) => {
  const api = await setup(page, noShipping);
  await page.getByRole('button', { name: 'Buy now' }).click();
  await fillForm(page);
  await dialog(page).getByRole('button', { name: /^Pay/ }).click();
  await expect(dialog(page).getByRole('img', { name: 'Lightning invoice QR code' })).toBeVisible();

  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page).getByText('Cancel this order?')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Keep order' }).click();
  await expect(dialog(page)).toBeHidden();

  await page.getByRole('button', { name: 'Buy now' }).click(); // resumes
  await expect(dialog(page).getByRole('img', { name: 'Lightning invoice QR code' })).toBeVisible();
  await page.keyboard.press('Escape');
  await dialog(page).getByRole('button', { name: 'Cancel order' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => requests(api, 'POST', /\/cancel$/).length).toBe(1);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
});

test('two buttons with one key make one GET /store', async ({ page }) => {
  const api = await setup(page, {}, button() + button('locale="bg"', 'tasting-session'));
  await expect(page.getByRole('button', { name: 'Buy now' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Купи' })).toBeEnabled();
  expect(requests(api, 'GET', '/store')).toHaveLength(1);
});

test("the host page's CSS doesn't reach the component", async ({ page }) => {
  await setup(page, noShipping);
  await page.addStyleTag({ content: '* { all: unset } button { display: none !important } dialog { display: none !important }' });
  const buy = page.getByRole('button', { name: 'Buy now' });
  await expect(buy).toBeVisible();
  const box = await buy.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await buy.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel(/^Email/)).toBeVisible();
});

test('keyboard only: open, fill, pay, Esc; focus goes back to the button', async ({ page }) => {
  await setup(page, noShipping);
  await expect(page.getByRole('button', { name: 'Buy now' })).toBeEnabled();
  await page.locator('#before').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('spinbutton')).toBeFocused();
  await page.keyboard.press('Tab'); // +
  await page.keyboard.press('Tab'); // email
  await page.keyboard.type('maria@example.com');
  await page.keyboard.press('Enter'); // submits the form
  await expect(dialog(page).getByRole('img', { name: 'Lightning invoice QR code' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page).getByText('Cancel this order?')).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Keep order' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Buy now' })).toBeFocused();
});

test("a second Esc that the browser closes on its own keeps the checkout, like Keep order", async ({ page }) => {
  const api = await setup(page, noShipping);
  await page.getByRole('button', { name: 'Buy now' }).click();
  await fillForm(page);
  await dialog(page).getByRole('button', { name: /^Pay/ }).click();
  await expect(dialog(page).getByText('Waiting for payment…')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden(); // Chrome closes without a cancelable event after the first
  expect(requests(api, 'POST', /\/cancel$/)).toHaveLength(0);
  expect((await events(page)).map(e => e.name)).toContain('loom21:closed');
  await expect(page.getByRole('button', { name: 'Buy now' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByText('Waiting for payment…')).toBeVisible();
});

test('a missing email is marked and nothing is sent', async ({ page }) => {
  const api = await setup(page, noShipping);
  await page.getByRole('button', { name: 'Buy now' }).click();
  await dialog(page).getByRole('button', { name: /^Pay/ }).click();
  await expect(dialog(page).getByRole('alert')).toHaveText('Please check the highlighted fields.');
  await expect(dialog(page).getByLabel(/^Email/)).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog(page).getByLabel(/^Email/)).toBeFocused();
  expect(requests(api, 'POST', '/checkouts')).toHaveLength(0);
});

test('on a phone the dialog is a full-screen sheet with "Open in wallet" above the QR code', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, noShipping);
  await page.getByRole('button', { name: 'Buy now' }).click();
  await fillForm(page);
  await dialog(page).getByRole('button', { name: /^Pay/ }).click();
  const qr = await dialog(page).getByRole('img', { name: 'Lightning invoice QR code' }).boundingBox();
  const wallet = await dialog(page).getByRole('link', { name: 'Open in wallet' }).boundingBox();
  const sheet = await dialog(page).boundingBox();
  expect(sheet!.width).toBe(390);
  expect(wallet!.y).toBeLessThan(qr!.y);
});
