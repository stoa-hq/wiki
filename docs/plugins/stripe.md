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

This endpoint supports both authenticated and guest checkout:

- **Authenticated users**: Bearer token required. The plugin verifies that `customer_id` matches the authenticated user.
- **Guest checkout**: No token needed. Pass the `guest_token` returned by the checkout endpoint to prove ownership of the guest order.

Requests for orders belonging to other customers or with an invalid guest token receive `404 Not Found`.

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

## Storefront Integration

The Stripe plugin ships a built-in Web Component (`stoa-stripe-checkout`) that renders the Stripe Payment Element directly in the Storefront checkout. No custom frontend code required — the plugin handles everything via the [UI Extension System](/plugins/ui-extensions).

### Checkout flow

The Storefront checkout uses a two-step payment flow when Stripe is installed:

```
1. Customer fills in address, selects shipping & payment method
2. Customer clicks "Place Order"
   → Order is created with status: pending
   → For guest checkout: a guest_token is returned
3. Stripe component appears automatically
   → Creates a PaymentIntent via backend API (with guest_token for guests)
   → Renders Stripe Payment Element (card, SEPA, etc.)
4. Customer enters card details and clicks "Pay"
   → Stripe.js confirms the payment
5. On success → Redirect to order confirmation page
   On failure → Error message, customer can retry
```

Both registered customers and guest users can complete the checkout. Guest orders are tied to a one-time `guest_token` that is only valid for the specific order.

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

## Metadata & Cross-Referencing

Every PaymentIntent created by the Stripe plugin is enriched with human-readable order data for easy cross-referencing between Stoa and the Stripe Dashboard.

### PaymentIntent metadata

| Key | Example | Description |
|-----|---------|-------------|
| `stoa_order_id` | `018e1b2c-...` | Stoa order UUID |
| `stoa_payment_method_id` | `018e1b2c-...` | Stoa PaymentMethod UUID |
| `stoa_order_number` | `ORD-20260315-A1B2C` | Human-readable order number |

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

When a PaymentIntent is created, the plugin immediately inserts a **pending** transaction into `payment_transactions`. This makes the transaction visible in the Admin Panel right away — even before the customer completes payment.

| Event | Transaction status |
|-------|--------------------|
| PaymentIntent created | `pending` |
| `payment_intent.succeeded` webhook | `completed` |
| `payment_intent.payment_failed` webhook | `failed` |

The webhook uses `ON CONFLICT DO UPDATE` on `provider_reference` to update the existing pending transaction rather than creating a duplicate.

::: info Existing transactions
Only new PaymentIntents are enriched with metadata, description, and receipt email. Previously created transactions are not retroactively updated.
:::

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
