# Stripe Payment Provider

The `stoa-plugin-stripe` plugin integrates [Stripe](https://stripe.com) as a payment provider for Stoa. It handles PaymentIntent creation, Stripe webhook processing, and automatic order status transitions — fully compatible with the Stoa MCP server so AI agents (Claude, etc.) can complete purchases autonomously.

## How it works

```
Agent / Frontend
    │
    │  1. store_checkout → creates Order (status: pending)
    │  2. store_stripe_create_payment_intent → creates Stripe PaymentIntent
    │
    ▼
Stripe
    │  Customer confirms payment (Stripe.js / mobile SDK)
    │
    ▼
POST /plugins/stripe/webhook (payment_intent.succeeded)
    │
    ▼
stoa-plugin-stripe
    ├── Creates payment_transaction (status: completed)
    ├── Transitions Order: pending → confirmed
    └── Fires payment.after_complete hook
```

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
```

| Key | Required | Description |
|-----|----------|-------------|
| `secret_key` | Yes | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `publishable_key` | Yes | Stripe publishable key (`pk_live_...` or `pk_test_...`) |
| `webhook_secret` | Yes | Webhook signing secret from the Stripe Dashboard (`whsec_...`) |
| `currency` | No | Default ISO 4217 currency code (default: `EUR`) |

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

Creates a Stripe PaymentIntent for a pending order. Call this after `store_checkout` to initiate payment.

**Request body:**
```json
{
  "order_id": "018e1b2c-...",
  "payment_method_id": "018e1b2c-..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `order_id` | UUID | ID of the pending order (from `store_checkout`) |
| `payment_method_id` | UUID | ID of the Stoa PaymentMethod with `provider = "stripe"` |

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

## MCP Tool

The plugin adds a new tool to the Store MCP server:

### `store_stripe_create_payment_intent`

Creates a Stripe PaymentIntent for a pending order. Returns the `client_secret` needed to confirm payment.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `order_id` | string (UUID) | Yes | ID of the pending order |
| `payment_method_id` | string (UUID) | Yes | ID of the Stoa PaymentMethod (provider = stripe) |

**Returns:**
```json
{
  "id": "pi_3ABC...",
  "client_secret": "pi_3ABC..._secret_xyz",
  "publishable_key": "pk_live_...",
  "amount": 4999,
  "currency": "eur"
}
```

## Agentic checkout flow

Full end-to-end purchase with Claude (or any MCP-compatible agent):

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

7. store_checkout(cart_id, shipping_method_id, payment_method_id, shipping_address)
   → returns order_id (status: pending)

8. store_stripe_create_payment_intent(order_id, payment_method_id)
   → returns client_secret

9. User confirms payment via Stripe.js / mobile SDK using client_secret

10. Stripe sends webhook → order transitions to status: confirmed
```

::: info Saved payment methods
For a fully autonomous agent flow without user interaction, use [Stripe's off-session payments](https://stripe.com/docs/payments/save-and-reuse) with a saved payment method ID. The agent can confirm the PaymentIntent server-side using the Stripe API directly.
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

## Order status transitions

| Event | From | To |
|-------|------|----|
| `payment_intent.succeeded` | `pending` | `confirmed` |
| `payment_intent.payment_failed` | — | no change (transaction recorded) |

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

## Error behaviour

- **Signature verification failure**: returns `401 Unauthorized`. Stripe will retry the webhook.
- **Missing order metadata**: logged as error, webhook returns `204` (acknowledged). Stripe will not retry.
- **DB errors** (transaction insert, status update): logged as error, webhook returns `204`. Monitor logs for failures.
- **Stripe API errors** (creating PaymentIntent): returns `502 Bad Gateway` to the client.

Failed payment processing never rolls back the order — the order remains `pending` and can be retried by the customer.

Monitor failures via Stoa application logs:

```
{"level":"error","plugin":"stripe","order_id":"...","message":"stripe webhook: failed to update order status"}
```

## Local development

Use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhook events to your local Stoa instance:

```bash
stripe listen --forward-to http://localhost:8080/plugins/stripe/webhook
```

The CLI prints a test webhook secret (`whsec_...`) — use this as `webhook_secret` in `config.yaml` during development.

For test card numbers, see the [Stripe testing documentation](https://stripe.com/docs/testing).
