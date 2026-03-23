# Stripe Payment Provider

The `stoa-plugin-stripe` plugin integrates [Stripe](https://stripe.com) as a payment provider for Stoa. It handles PaymentIntent creation, Stripe webhook processing, and automatic order status transitions — fully compatible with the Stoa MCP server so AI agents (Claude, etc.) can complete purchases autonomously.

## How it works

The Stripe plugin supports two checkout flows:

### Pay-First Flow (recommended) {#pay-first}

Payment is **authorized** before the order is created. Stoa then captures the funds once the order reaches the configured capture status. This prevents unpaid orders and eliminates refund-on-failure scenarios.

```
Agent / Frontend
    │
    │  1. store_stripe_create_preorder_payment_intent(amount, currency, payment_method_id)
    │     → creates Stripe PaymentIntent (capture_method: manual)
    │
    ▼
Stripe
    │  Customer authorizes payment (Stripe.js / mobile SDK)
    │  → PaymentIntent status: requires_capture  (funds held, not charged)
    │
    ▼
Agent / Frontend
    │
    │  2. store_checkout(..., payment_reference: "pi_xxx")
    │     → checkout.before: validates PI status (requires_capture ✓)
    │     → creates Order (status: pending)
    │     → checkout.after: captures PI + creates TX + pending → confirmed
    │
    ▼
Order status: confirmed, payment_transaction: completed
```

If checkout fails (e.g. insufficient stock), the PaymentIntent is **cancelled** — no money was ever charged, so no refund is needed.

### Legacy Flow (post-order) {#legacy-flow}

Order is created first, then payment is initiated. Still supported for backward compatibility.

```
Agent / Frontend
    │
    │  1. store_checkout → creates Order (status: pending)
    │  2. store_stripe_create_payment_intent(order_id, payment_method_id)
    │
    ▼
Stripe → webhook → confirmed
```

::: warning Pay-First is recommended
The legacy flow allows orders without payment. With the pay-first flow, the `payment_reference` is validated via the `checkout.before` hook — the Stripe plugin verifies the PaymentIntent status is `requires_capture` (or `succeeded`) before the order is created.
:::

## Installation

```bash
stoa plugin install stripe
```

Or manually via Go:

```bash
go get github.com/stoa-hq/stoa-plugins/stripe@latest
```

## Configuration

Add a `stripe` section to your `config.yaml`:

```yaml
plugins:
  stripe:
    secret_key:      "sk_live_..."      # or sk_test_... for development
    publishable_key: "pk_live_..."      # or pk_test_...
    webhook_secret:  "whsec_..."        # from Stripe Dashboard → Webhooks
    currency:        "EUR"              # optional, default: EUR
    capture_on:      "confirmed"        # optional, default: "confirmed" — see Authorize & Capture
```

| Key | Required | Description |
|-----|----------|-------------|
| `secret_key` | Yes | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `publishable_key` | Yes | Stripe publishable key (`pk_live_...` or `pk_test_...`) |
| `webhook_secret` | Yes | Webhook signing secret from the Stripe Dashboard (`whsec_...`) |
| `currency` | No | Default ISO 4217 currency code (default: `EUR`) |
| `capture_on` | No | Order status that triggers payment capture (default: `"confirmed"`). Set to any valid order status, e.g. `"shipped"`, for deferred capture. See [Authorize & Capture](#authorize-capture). |

::: warning Keep your secret key private
Never expose `secret_key` in frontend code or commit it to version control. Use environment variables: `STOA_PLUGINS_STRIPE_SECRET_KEY=sk_live_...`
:::

## Stripe Dashboard setup

In the [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks), add an endpoint:

- **URL**: `https://your-store.example.com/plugins/stripe/webhook`
- **Events to listen for**:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`

Copy the **Signing secret** (`whsec_...`) and put it in `webhook_secret`.

## API Endpoints

### Create PaymentIntent

```
POST /api/v1/store/stripe/payment-intent
```

Creates a Stripe PaymentIntent. This endpoint supports two modes:

#### Pre-Order Mode (pay first)

Create a PaymentIntent before placing an order. Use this with the [pay-first flow](#pay-first).

**Request body:**
```json
{
  "amount": 4999,
  "currency": "EUR",
  "payment_method_id": "018e1b2c-..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | int | Yes | Total amount in cents (e.g. `4999` = €49.99) |
| `currency` | string | Yes | ISO 4217 currency code (e.g. `EUR`) |
| `payment_method_id` | UUID | Yes | ID of the Stoa PaymentMethod with `provider = "stripe"` |

After payment confirmation, pass the returned `id` as `payment_reference` to the checkout endpoint.

#### Post-Order Mode (legacy)

Create a PaymentIntent for an existing pending order.

**Request body:**
```json
{
  "order_id": "018e1b2c-...",
  "payment_method_id": "018e1b2c-...",
  "guest_token": "a1b2c3d4-..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `order_id` | UUID | Yes | ID of the pending order (from `store_checkout`) |
| `payment_method_id` | UUID | Yes | ID of the Stoa PaymentMethod with `provider = "stripe"` |
| `guest_token` | UUID | Guest only | Token returned by checkout for guest orders |

This mode supports both authenticated and guest checkout. Authenticated users need a Bearer token; the plugin verifies `customer_id` ownership. Guest checkout requires the `guest_token`.

**Response (`201 Created`):**
```json
{
  "data": {
    "id": "pi_3ABC...",
    "client_secret": "pi_3ABC..._secret_xyz",
    "publishable_key": "pk_live_...",
    "amount": 4999,
    "currency": "eur"
  }
}
```

Use `client_secret` with Stripe.js or the Stripe Mobile SDKs to confirm payment on the client side.

::: tip Prices are integers
`amount` follows Stoa's convention: integer cents. `4999` = €49.99.
:::

### Stripe Webhook Receiver

```
POST /plugins/stripe/webhook
```

Receives signed Stripe webhook events. All requests are verified with HMAC-SHA256 using your `webhook_secret` before processing. **Do not call this endpoint manually** — it is only for Stripe.

### Health Check

```
GET /plugins/stripe/health
```

Requires authentication. Returns the plugin status and the publishable key.

**Response (`200 OK`):**
```json
{
  "status": "ok",
  "plugin": "stripe",
  "version": "0.1.0",
  "publishable_key": "pk_live_...",
  "checked_at": "2026-03-12T10:00:00Z"
}
```

## MCP Tools

The plugin adds four tools to the Store MCP server:

### `store_stripe_create_preorder_payment_intent`

Creates a Stripe PaymentIntent before placing an order (pay-first flow). Returns the `id` to pass as `payment_reference` to `store_checkout`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `amount` | number | Yes | Total in cents (e.g. `4999` for €49.99) |
| `currency` | string | Yes | ISO 4217 code (e.g. `EUR`) |
| `payment_method_id` | string (UUID) | Yes | ID of the Stoa PaymentMethod (provider = stripe) |

### `store_stripe_create_payment_intent`

Creates a Stripe PaymentIntent for an existing pending order (legacy flow). Returns the `client_secret` for Stripe.js.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `order_id` | string (UUID) | Yes | ID of the pending order |
| `payment_method_id` | string (UUID) | Yes | ID of the Stoa PaymentMethod (provider = stripe) |

**Returns (both tools):**
```json
{
  "id": "pi_3ABC...",
  "client_secret": "pi_3ABC..._secret_xyz",
  "publishable_key": "pk_live_...",
  "amount": 4999,
  "currency": "eur"
}
```

### `store_stripe_create_payment_link`

Creates a payment link URL that the customer can open in a browser to enter card details. Use this in chat/MCP contexts where Stripe.js is not available. The link expires after 30 minutes. The server calculates the total automatically from cart items and the selected shipping method — no amount is required from the caller.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cart_id` | string (UUID) | Yes | Cart ID |
| `payment_method_id` | string (UUID) | Yes | Stoa PaymentMethod UUID for Stripe |
| `shipping_method_id` | string (UUID) | Yes | Shipping method UUID |
| `shipping_address` | object | Yes | `{ first_name, last_name, street, city, zip, country }` |
| `billing_address` | object | No | Same fields. If omitted, shipping address is used |
| `email` | string | No | Customer email for receipt |

**Returns:**
```json
{
  "payment_url": "/plugins/stripe/pay/abc123...",
  "payment_intent_id": "pi_3ABC...",
  "expires_at": "2026-03-22T15:30:00Z"
}
```

### `store_stripe_check_payment_status`

Checks the current status of a Stripe payment. Use this to poll whether the customer has completed payment after receiving a payment link.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `payment_intent_id` | string | Yes | Stripe PaymentIntent ID to check |

**Returns:**
```json
{
  "status": "requires_capture",
  "payment_link_status": "completed"
}
```

## Storefront Integration

The Stripe plugin ships a built-in Web Component (`stoa-stripe-checkout`) that renders the Stripe Payment Element directly in the Storefront checkout. No custom frontend code required — the plugin handles everything via the [UI Extension System](/plugins/ui-extensions).

### Checkout flow

The Storefront checkout uses a **pay-first** flow when a provider-based payment method (e.g. Stripe) is selected:

```
1. Customer fills in address, selects shipping & payment method
2. Customer clicks "Place Order"
   → If payment method has a provider (e.g. "stripe"):
     → Stripe component appears BEFORE order creation
     → Creates a pre-order PaymentIntent with total amount
     → Renders Stripe Payment Element (card, SEPA, etc.)
3. Customer enters card details and clicks "Pay"
   → Stripe.js confirms the payment
4. On success:
   → Checkout creates order with payment_reference = PaymentIntent ID
   → Stripe plugin validates the reference via checkout.before hook
   → Order is created → redirect to confirmation
   On failure → Error message, customer can retry
```

For **manual payment methods** (no provider), the order is created immediately without showing the Stripe component.

Both registered customers and guest users can complete the checkout.

::: tip Automatic payment methods
The plugin uses Stripe's [Automatic Payment Methods](https://stripe.com/docs/payments/payment-methods/integration-options#using-automatic-payment-methods), which means all payment methods enabled in your Stripe Dashboard (cards, SEPA, Klarna, etc.) are automatically available — no extra configuration needed.
:::

### Context data

The checkout page passes the following context to the Stripe component:

| Property | Type | Description |
|----------|------|-------------|
| `orderId` | string (UUID) | ID of the pending order |
| `orderNumber` | string | Human-readable order number |
| `paymentMethodId` | string (UUID) | Selected Stoa PaymentMethod ID |
| `amount` | number | Total in cents |
| `currency` | string | ISO 4217 currency code |
| `guestToken` | string (UUID) | Guest order ownership token (empty for authenticated users) |

### Plugin events

The component dispatches `plugin-event` CustomEvents:

| Event type | When | Detail |
|------------|------|--------|
| `payment-success` | Payment confirmed | `{ paymentIntentId: "pi_..." }` |
| `payment-error` | Payment failed | `{ message: "Card declined" }` |

### 3D Secure

For payment methods requiring 3D Secure authentication, Stripe.js handles the redirect automatically. The `return_url` is set to `/checkout/success?order={orderNumber}`. After authentication, the customer is redirected back and the webhook confirms the payment.

### UI Extension declaration

The plugin registers itself for the `storefront:checkout:payment` slot:

```go
func (p *Plugin) UIExtensions() []sdk.UIExtension {
    return []sdk.UIExtension{
        {
            ID:   "stripe_checkout",
            Slot: "storefront:checkout:payment",
            Type: "component",
            Component: &sdk.UIComponent{
                TagName:         "stoa-stripe-checkout",
                ScriptURL:       "/plugins/stripe/assets/checkout.js",
                Integrity:       sriHash("frontend/dist/checkout.js"),
                ExternalScripts: []string{
                    "https://js.stripe.com/v3/",
                    "https://api.stripe.com",
                },
            },
        },
    }
}
```

The `ExternalScripts` entries are added to `script-src`, `frame-src`, and `connect-src` in the Content-Security-Policy header. Stripe requires all three: `js.stripe.com` for loading Stripe.js and rendering the Payment Element iframe, and `api.stripe.com` for API calls.

::: info Light DOM rendering
The Stripe component renders in the Light DOM (not Shadow DOM) because Stripe's Payment Element requires direct DOM access for its iframes. CSS isolation is achieved via scoped class prefixes (`.stoa-stripe-checkout`). Card data is secured by Stripe's cross-origin iframe — it never touches the host page's DOM.
:::

## Agentic checkout flow

Full end-to-end purchase with Claude (or any MCP-compatible agent):

### Pay-First Flow (recommended)

```
1. store_login(email, password)
   → returns access token

2. store_list_products(...)
   → agent picks a product variant

3. store_create_cart()
   → returns cart_id

4. store_add_to_cart(cart_id, variant_id, quantity)

5. store_get_shipping_methods()
   → agent selects a shipping method

6. store_get_payment_methods()
   → agent finds the Stripe payment method (provider = "stripe")

7. store_stripe_create_preorder_payment_intent(amount, currency, payment_method_id)
   → returns payment_intent_id + client_secret
   → PI status: requires_capture (funds held, not yet charged)

8. User authorizes payment via Stripe.js / mobile SDK using client_secret

9. store_checkout(cart_id, shipping_method_id, payment_method_id, shipping_address,
                  payment_reference: payment_intent_id)
   → Stripe plugin validates PI is "requires_capture" via checkout.before hook
   → Order created → capture triggered → order confirmed
```

::: tip Payment Links for Chat-based Agents
If the agent is chatting with the customer (e.g. via MCP) and Stripe.js is not available, use `store_stripe_create_payment_link` instead of `store_stripe_create_preorder_payment_intent`. This generates a URL the customer can open in their browser to complete payment. See [Payment Links](#payment-links).
:::

### Legacy Flow

```
1-6. Same as above

7. store_checkout(cart_id, shipping_method_id, payment_method_id, shipping_address)
   → returns order_id (status: pending)

8. store_stripe_create_payment_intent(order_id, payment_method_id)
   → returns client_secret

9. User confirms payment → webhook → confirmed
```

::: info Saved payment methods
For a fully autonomous agent flow without user interaction, use [Stripe's off-session payments](https://stripe.com/docs/payments/save-and-reuse) with a saved payment method ID. The agent can confirm the PaymentIntent server-side using the Stripe API directly.
:::

## Payment Links (for MCP Agents) {#payment-links}

When an AI agent chats with a customer via MCP, the agent can create a cart and collect shipping details — but the customer cannot enter card details in a chat. The **Payment Links** feature bridges this gap by generating a URL the agent can share.

### Flow

```
Agent: [store_create_cart, store_add_to_cart, collects address]
Agent: [store_stripe_create_payment_link] → gets URL
Agent: "Please click here to pay: https://shop.example.com/plugins/stripe/pay/abc123..."
Customer: [clicks link, enters card, pays]
         → Browser calls /complete → payment confirmed
Agent: [store_stripe_check_payment_status] → "Payment confirmed!"
```

### How it works

1. The agent calls `store_stripe_create_payment_link` with cart, shipping, and payment details. The server calculates the total from cart items + shipping costs.
2. The plugin calculates the total server-side by querying product/variant prices and the shipping method price from the database, then creates a Stripe PaymentIntent with the correct amount (`capture_method: manual`) and generates a 256-bit random token
3. A payment link record is stored in `stripe_payment_links` with 30-minute expiry
4. The agent shares the returned URL with the customer
5. The customer opens the URL → the plugin serves a standalone HTML payment page at `/plugins/stripe/pay/{token}`
6. The page fetches payment data via `GET /api/v1/store/stripe/payment-link/{token}` and mounts Stripe Elements
7. After successful payment, the browser calls `POST /api/v1/store/stripe/payment-link/{token}/complete`
8. The agent polls `store_stripe_check_payment_status` to confirm

::: info Server-side price enforcement
The payment link total is always calculated server-side from the current product/variant prices and shipping method price in the database. This prevents price manipulation — the `amount` cannot be specified by the client. The currency is taken from the plugin configuration (`currency` in `config.yaml`).
:::

### API Endpoints

**`POST /api/v1/store/stripe/payment-link`** (OptionalAuth)

Creates a payment link. Request body:
```json
{
  "cart_id": "018e1b2c-...",
  "payment_method_id": "018e1b2c-...",
  "shipping_method_id": "018e1b2c-...",
  "shipping_address": { "first_name": "Max", "last_name": "Mustermann", "street": "Musterstr. 1", "city": "Berlin", "zip": "10115", "country": "DE" },
  "email": "max@example.com"
}
```

Response (`201 Created`):
```json
{
  "data": {
    "payment_url": "/plugins/stripe/pay/abc123...",
    "payment_intent_id": "pi_3ABC...",
    "expires_at": "2026-03-22T15:30:00Z"
  }
}
```

**`GET /api/v1/store/stripe/payment-link/{token}`** (No auth — token is capability)

Returns public payment data. No sensitive data (addresses) exposed.

Response (`200 OK`):
```json
{
  "data": {
    "client_secret": "pi_3ABC..._secret_xyz",
    "publishable_key": "pk_test_...",
    "amount": 2489,
    "currency": "EUR",
    "email": "max@example.com"
  }
}
```

Error responses: `404` if token not found, `410 Gone` if expired or already used.

**`POST /api/v1/store/stripe/payment-link/{token}/complete`** (No auth)

Validates payment and triggers a full server-side checkout. On completion, the server runs `CheckoutFn`, which creates the order, deducts stock, and processes all registered hooks (including payment capture). The link is then marked as completed and cannot be reused.

Request:
```json
{ "payment_intent_id": "pi_3ABC..." }
```

Response (`200 OK`):
```json
{
  "data": {
    "status": "completed",
    "payment_intent_id": "pi_3ABC...",
    "order_id": "018e1b2c-..."
  }
}
```

Validates: token exists + pending + not expired + PI ID matches + Stripe PI status is `requires_capture` or `succeeded`.

**`GET /api/v1/store/stripe/payment-status/{paymentIntentID}`** (OptionalAuth)

Returns current Stripe PI status and associated payment link status (if any).

Response:
```json
{
  "data": {
    "status": "requires_capture",
    "payment_link_status": "completed"
  }
}
```

### Payment Page

The plugin serves a standalone HTML payment page at `/plugins/stripe/pay/{token}`. This page:
- Is self-contained — no SvelteKit or Core dependency
- Loads Stripe.js dynamically
- Renders Stripe Payment Element for card input
- Handles the full confirm → complete → redirect flow
- Shows appropriate error states for expired/used/invalid links

::: info No Core dependency
The payment page is embedded in the Stripe plugin binary via Go's `embed.FS`. Stoa Core has zero knowledge of Stripe — the loose coupling is fully maintained.
:::

### Security

- **Token = 256-bit entropy** (32 bytes, base64url-encoded, 43 characters) — not guessable
- **30-minute expiry** — the agent should inform the customer about the time limit
- **Single-use** — `UPDATE WHERE status='pending'` prevents reuse (atomic)
- **PI verification** — the `/complete` endpoint verifies the PaymentIntent ID matches and checks Stripe PI status
- **No addresses in browser** — shipping/billing addresses stay server-side, never sent to the payment page
- **CSRF safe** — the token-based endpoints don't use cookies for auth
- **Race condition prevention** — The `/complete` endpoint uses an atomic `UPDATE ... WHERE status = 'pending'` as a distributed lock before running the checkout. Only one concurrent request can claim a payment link. If the checkout fails, the link is reverted to `pending` for retry.
- **IDOR protection on payment status** — `GET /payment-status/{paymentIntentID}` verifies ownership: authenticated users must match the `stoa_customer_id` in PaymentIntent metadata; guests must provide a matching `stoa_guest_token` via header or cookie. Unauthorized requests receive `404`.
- **Error sanitization** — Checkout errors return a generic `"checkout failed"` message to the client. Internal error details (database messages, stack traces) are only written to the server log.
- **Amount mismatch detection** — After checkout, the server compares the order total with the PaymentIntent amount. If they differ (e.g. due to a price change between link creation and completion), a warning is logged for manual review.

### Complete Agent Example

```
1. store_create_cart() → cart_id
2. store_add_to_cart(cart_id, variant_id, 1)
3. store_get_shipping_methods() → pick shipping_method_id
4. store_get_payment_methods() → find Stripe payment_method_id
5. store_stripe_create_payment_link(
     cart_id,
     payment_method_id, shipping_method_id,
     shipping_address: { first_name: "Max", ... },
     email: "max@example.com"
   )
   → payment_url: "/plugins/stripe/pay/abc123..."
   → payment_intent_id: "pi_3ABC..."

   Agent sends URL to customer in chat.

6. Customer clicks link → enters card → pays
7. store_stripe_check_payment_status(payment_intent_id: "pi_3ABC...")
   → status: "requires_capture", payment_link_status: "completed"
   → Agent confirms: "Payment received! Your order will be processed."
```

::: tip Test cards
Use `4242 4242 4242 4242` with any future expiry date and any CVC in test mode.
:::

## Payment event hooks

The plugin fires standard Stoa hooks that other plugins (e.g. n8n) can listen to:

| Hook | When |
|------|------|
| `payment.after_complete` | `payment_intent.succeeded` processed successfully |
| `payment.after_failed` | `payment_intent.payment_failed` received |

Hook event entity payload:

```json
{
  "order_id": "018e1b2c-...",
  "payment_transaction_id": "018e1b2d-...",
  "provider_reference": "pi_3ABC...",
  "amount": 4999,
  "currency": "eur"
}
```

## Authorize & Capture {#authorize-capture}

The pay-first flow uses Stripe's **manual capture** model (`capture_method: manual`). The customer's card is **authorized** (funds held) but **not charged** until Stoa explicitly captures the payment. This has two benefits:

1. **No refunds on failure** — if checkout fails (e.g. stock runs out), the authorization is simply cancelled. No money was moved, so no refund is needed.
2. **Deferred capture** — you can delay the actual charge until a later order status (e.g. `shipped`), which is the industry standard for physical goods.

### capture_on configuration

The `capture_on` config key controls when Stoa captures the payment:

| Value | Behaviour |
|-------|-----------|
| `"confirmed"` (default) | Captured immediately in the `checkout.after` hook, right after the order is created |
| Any order status string (e.g. `"shipped"`) | Captured when the order is transitioned to that status via `UpdateStatus` |

```yaml
plugins:
  stripe:
    capture_on: "shipped"   # charge the card only when the order ships
```

### How deferred capture works

```
CaptureOn = "shipped":

1. store_stripe_create_preorder_payment_intent(...)
   → PI status: requires_capture  (funds held, not charged)

2. store_checkout(..., payment_reference: "pi_xxx")
   → PI status validated ✓ (requires_capture accepted)
   → Order created → payment_transaction: pending → order: confirmed
   → No capture yet — card not charged

3. Admin transitions order to "shipped"
   → HookAfterOrderUpdate fires
   → Stripe plugin: CapturePaymentIntent("pi_xxx")
   → payment_transaction status → completed
```

::: info Stripe authorization window
Stripe authorizations expire after **7 days** by default. If your fulfillment process can take longer than 7 days, consider extending it in the Stripe Dashboard or using `"confirmed"` capture to charge immediately at order time.
:::

## Checkout Failure & Payment Cancellation

When the [pay-first flow](#pay-first) is used and checkout fails — for example because an item ran out of stock — the PaymentIntent is **cancelled** rather than refunded. Since `capture_method: manual` is always used, **no money was ever moved**, so a refund is unnecessary.

Stoa fires a `checkout.after_failed` hook when `POST /api/v1/store/checkout` returns `422 insufficient_stock`. The Stripe plugin listens to this hook and automatically **cancels** the PaymentIntent.

### Flow

```
1. store_stripe_create_preorder_payment_intent(...)
   → PaymentIntent created, customer authorizes → status: "requires_capture"

2. store_checkout(..., payment_reference: "pi_xxx")
   → checkout.before hook: PI status validated ✓
   → service.Create(): stock check fails → ErrInsufficientStock
   → checkout.after_failed hook fires
       └─ Stripe plugin: CancelPaymentIntent("pi_xxx")
              → authorization released, card never charged
   → handler returns 422 insufficient_stock to the client
```

### Behaviour

- The cancellation is **non-blocking**: if the Stripe API call fails, the error is logged but the `422` response to the customer is still sent normally.
- The hook only triggers for `provider = "stripe"` — other payment methods are unaffected.
- If `payment_reference` is empty (manual payment method), no cancellation attempt is made.
- Partial stock failures (some items unavailable) also trigger the full cancellation, since the entire order is rejected.

::: tip Check your Stripe Dashboard
After a failed checkout, the cancelled authorization appears in your [Stripe Dashboard → Payments](https://dashboard.stripe.com/payments) immediately. No funds were moved — the hold on the customer's card is released.
:::

::: warning Monitoring
Cancellation failures are logged at `ERROR` level:
```
{"level":"error","plugin":"stripe","payment_intent_id":"pi_xxx","message":"stripe: failed to cancel payment intent after checkout failure"}
```
Monitor your application logs or set up alerting for this message pattern.
:::

## Metadata & Cross-Referencing

Every PaymentIntent created by the Stripe plugin is enriched with human-readable order data for easy cross-referencing between Stoa and the Stripe Dashboard.

### PaymentIntent metadata

**Post-order PaymentIntents:**

| Key | Example | Description |
|-----|---------|-------------|
| `stoa_order_id` | `018e1b2c-...` | Stoa order UUID |
| `stoa_payment_method_id` | `018e1b2c-...` | Stoa PaymentMethod UUID |
| `stoa_order_number` | `ORD-20260315-A1B2C` | Human-readable order number |

**Pre-order PaymentIntents:**

| Key | Example | Description |
|-----|---------|-------------|
| `stoa_mode` | `pre_order` | Indicates this PI was created before the order |
| `stoa_payment_method_id` | `018e1b2c-...` | Stoa PaymentMethod UUID |

Pre-order PaymentIntents do not have `stoa_order_id` or `stoa_order_number` — the order is created after payment. The webhook handler recognizes `stoa_mode: "pre_order"` and skips order status updates.

### Description & receipt email

The plugin also sets:

- **`description`**: `"Stoa Order ORD-20260315-A1B2C"` — visible in the Stripe Dashboard payment detail view.
- **`receipt_email`**: The email from the order's billing address (if available). Stripe sends an automatic payment receipt to this address.

::: tip Automatic receipts
To receive Stripe payment receipts, ensure that the billing address in your checkout form includes an email field. If no email is provided, Stripe skips the receipt — no error occurs.
:::

### Admin Panel — Dashboard link

In the Stoa Admin Panel, the `provider_reference` column in the order transaction table is rendered as a clickable link for Stripe PaymentIntents (`pi_...`). The link opens the corresponding payment directly in the Stripe Dashboard.

- **Test mode**: `https://dashboard.stripe.com/test/payments/pi_xxx`
- **Live mode**: `https://dashboard.stripe.com/payments/pi_xxx`

The plugin auto-detects the mode from the configured `publishable_key`. If the Stripe plugin is not installed, the reference is shown as plain text (graceful degradation).

### Transaction lifecycle

The transaction lifecycle depends on the configured `capture_on` value.

**`capture_on: "confirmed"` (default):**

| Event | Transaction status |
|-------|--------------------|
| `checkout.after` hook (order confirmed) | `completed` |
| `checkout.after_failed` hook | No transaction created; PI cancelled |

**`capture_on: "shipped"` (or any other status):**

| Event | Transaction status |
|-------|--------------------|
| `checkout.after` hook (order confirmed) | `pending` (authorization held) |
| Order transitions to `"shipped"` | `completed` (captured) |
| `checkout.after_failed` hook | No transaction created; PI cancelled |

The upsert uses `ON CONFLICT DO UPDATE` on `provider_reference` to safely update an existing pending transaction rather than creating a duplicate.

::: info Webhook vs. checkout.after
For pre-order (pay-first) PaymentIntents, the transaction and order confirmation are handled in the `checkout.after` hook — not via webhook. The `payment_intent.succeeded` webhook recognizes `stoa_mode: "pre_order"` and skips the order update to avoid double-processing.
:::

::: info Existing transactions
Only new PaymentIntents are enriched with metadata, description, and receipt email. Previously created transactions are not retroactively updated.
:::

## Order status transitions

| Event | From | To |
|-------|------|----|
| `checkout.after` hook (pay-first) | `pending` | `confirmed` |
| `payment_intent.succeeded` webhook (legacy flow) | `pending` | `confirmed` |
| `payment_intent.payment_failed` webhook | — | no change (transaction recorded as failed) |

## Prerequisites

Before accepting payments you must create a **PaymentMethod** entity in Stoa with `provider = "stripe"`:

```bash
curl -X POST /api/v1/admin/payment-methods \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "provider": "stripe",
    "active": true,
    "translations": [
      { "locale": "en", "name": "Credit / Debit Card", "description": "Pay with Stripe" }
    ]
  }'
```

The returned `id` is the `payment_method_id` used in checkout and PaymentIntent creation.

## Security

### Authentication and authorization

The `POST /api/v1/store/stripe/payment-intent` endpoint supports both authenticated and guest checkout:

- **Authenticated customers**: The plugin verifies that the order's `customer_id` matches the authenticated user. This prevents IDOR attacks where a malicious user could initiate payment for another customer's order.
- **Guest checkout**: The plugin verifies the `guest_token` from the request body against the token stored in the orders table. Each guest order receives a unique token at checkout time. Without this token, a guest cannot access any order — even other guest orders.

### Webhook idempotency

Stripe may deliver webhook events more than once (retries on network errors, timeouts, or 5xx responses). The plugin uses a `UNIQUE` constraint on the `provider_reference` column in `payment_transactions` to guarantee idempotency. Duplicate events are detected and skipped automatically — no duplicate transaction records are created.

### Webhook signature verification

All webhook requests are verified using HMAC-SHA256 with the `webhook_secret` before any processing occurs. The raw request body is used for verification (not re-serialized JSON), which is required for correct signature matching.

### CSRF exemption

Stoa's global CSRF middleware (Double Submit Cookie pattern) automatically exempts all paths under `/plugins/`. Plugin webhook endpoints authenticate via provider-specific signatures (e.g. Stripe HMAC-SHA256), not cookies or CSRF tokens. This exemption is necessary because external services like Stripe cannot send CSRF tokens or cookies with webhook requests.

Requests with an `Authorization` header (Bearer / ApiKey) are also exempt from CSRF by design, as cross-origin requests cannot inject custom headers.

## Error behaviour

- **Guest without token**: returns `401 Unauthorized`.
- **Order not owned by user / invalid guest token**: returns `404 Not Found` (does not reveal existence).
- **Non-positive order total**: returns `422 Unprocessable Entity`.
- **Signature verification failure**: returns `401 Unauthorized`. Stripe will retry the webhook.
- **Duplicate webhook event**: logged as info, returns `204` (acknowledged). No duplicate records created.
- **Missing order metadata**: logged as error, webhook returns `204` (acknowledged). Stripe will not retry.
- **DB errors** (transaction insert, status update): logged as error, webhook returns `204`. Monitor logs for failures.
- **Stripe API errors** (creating PaymentIntent): returns `502 Bad Gateway` to the client.

Failed payment processing never rolls back the order — the order remains `pending` and can be retried by the customer.

Monitor failures via Stoa application logs:

```
{"level":"error","plugin":"stripe","order_id":"...","message":"stripe webhook: failed to update order status"}
```

## Local development

Stripe kann `localhost` nicht direkt erreichen. Verwende die [Stripe CLI](https://stripe.com/docs/stripe-cli), um Webhook-Events an deine lokale Stoa-Instanz weiterzuleiten.

### Stripe CLI installieren

::: code-group

```bash [Linux]
# Debian / Ubuntu
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | \
  gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | \
  sudo tee /etc/apt/sources.list.d/stripe.list
sudo apt update && sudo apt install stripe

# Arch
yay -S stripe-cli
```

```bash [macOS]
brew install stripe/stripe-cli/stripe
```

```bash [Windows]
scoop install stripe
```

:::

### Test-API-Keys abrufen

Nach dem Login findest du deine Sandbox-Keys im [Stripe Dashboard → API Keys](https://dashboard.stripe.com/test/apikeys) (stelle sicher, dass der **Test mode**-Toggle aktiv ist):

- **Publishable key** (`pk_test_...`) — direkt sichtbar
- **Secret key** (`sk_test_...`) — klicke auf "Reveal test key"

Oder direkt per CLI:

```bash
stripe config --list
```

### Anmelden und Webhooks weiterleiten

```bash
# 1. Bei Stripe anmelden (öffnet den Browser)
stripe login

# 2. Webhooks an lokale Stoa-Instanz weiterleiten
stripe listen --forward-to http://localhost:8080/plugins/stripe/webhook
```

Die CLI gibt ein temporäres Webhook-Signing-Secret aus:

```
> Ready! Your webhook signing secret is whsec_1234abc... (^C to quit)
```

Trage dieses Secret in deine `config.yaml` ein:

```yaml
plugins:
  stripe:
    secret_key:      "sk_test_..."
    publishable_key: "pk_test_..."
    webhook_secret:  "whsec_1234abc..."   # ← von stripe listen
    currency:        "EUR"
```

::: warning Neues Secret bei jedem Start
`stripe listen` generiert bei jedem Aufruf ein neues `whsec_...`-Secret. Aktualisiere deine `config.yaml` entsprechend oder verwende einen festen Webhook-Endpoint im Stripe Dashboard (siehe unten).
:::

### Test-Events manuell auslösen

Während `stripe listen` läuft, kannst du in einem zweiten Terminal Events triggern:

```bash
# Erfolgreiche Zahlung simulieren
stripe trigger payment_intent.succeeded

# Fehlgeschlagene Zahlung simulieren
stripe trigger payment_intent.payment_failed

# Alle verfügbaren Events anzeigen
stripe trigger --list
```

### Alternative: Tunnel-Tools

Wenn du einen permanenten Webhook-Endpoint bevorzugst (z.B. für Team-Entwicklung), kannst du einen Tunnel verwenden:

```bash
# ngrok
ngrok http 8080

# cloudflared
cloudflared tunnel --url http://localhost:8080
```

Trage die generierte URL im [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks) ein:

```
https://<tunnel-id>.ngrok.io/plugins/stripe/webhook
```

::: tip Stripe CLI ist einfacher
Für die lokale Einzelentwicklung ist die Stripe CLI der schnellste Weg — kein Dashboard-Eintrag nötig, Events können manuell getriggert werden, und das Signing-Secret wird automatisch bereitgestellt.
:::

### Testkarten

Verwende diese Kartennummern im Testmodus:

| Nummer | Verhalten |
|--------|-----------|
| `4242 4242 4242 4242` | Zahlung erfolgreich |
| `4000 0000 0000 3220` | 3D Secure erforderlich |
| `4000 0000 0000 9995` | Zahlung abgelehnt |

Beliebiges Ablaufdatum in der Zukunft und beliebige CVC. Weitere Testkarten in der [Stripe Testing-Dokumentation](https://stripe.com/docs/testing).

### Webhook Troubleshooting

Wenn Webhooks in der lokalen Entwicklung nicht ankommen, prüfe folgende Punkte:

| Symptom | Ursache | Lösung |
|---------|---------|--------|
| `[403]` im `stripe listen` Output | CSRF-Middleware blockt den Request | Stoa Version mit `/plugins/`-CSRF-Exemption verwenden |
| `[415]` im `stripe listen` Output | Content-Type `application/json; charset=utf-8` wird abgelehnt | Stoa aktualisieren — Content-Type-Prüfung akzeptiert jetzt `charset`-Parameter |
| `[401]` + `signature verification failed` in Logs | `webhook_secret` stimmt nicht mit `stripe listen` Secret überein | Secret aus `stripe listen`-Output in `config.yaml` übernehmen und Stoa neu starten |
| Kein POST in Stoa-Logs | `stripe listen` läuft nicht oder falscher Port | `stripe listen --forward-to http://localhost:8080/plugins/stripe/webhook` starten |
| Transaction bleibt `pending` | Webhook kommt nicht durch | `stripe listen`-Output auf HTTP-Statuscode prüfen (muss `[204]` sein) |

::: warning Webhook-Secret synchron halten
`stripe listen` generiert bei **jedem Start** ein neues `whsec_...`-Secret. Dieses muss exakt mit dem `webhook_secret` in deiner `config.yaml` übereinstimmen. Nach jedem Neustart von `stripe listen`:
1. Secret aus dem Terminal-Output kopieren
2. In `config.yaml` unter `plugins.stripe.webhook_secret` eintragen
3. Stoa-Server neu starten
:::
