# Orders API

## List Orders

```http
GET /api/v1/admin/orders
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | int | Page number (default: 1) |
| `limit` | int | Items per page (default: 20, max: 200) |
| `sort` | string | Sort field: `created_at`, `total`, `status`, `order_number` |
| `order` | string | `asc` or `desc` (default: `desc`) |
| `status` | string | Filter by status |
| `customer_id` | UUID | Filter by customer |
| `search` | string | Search by order number (ILIKE) |

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "order_number": "ORD-20260315-A1B2C",
      "customer_id": "uuid",
      "guest_token": "uuid",
      "status": "pending",
      "currency": "EUR",
      "subtotal_net": 1680,
      "subtotal_gross": 1999,
      "shipping_cost": 499,
      "tax_total": 319,
      "total": 2498,
      "created_at": "2026-03-15T10:00:00Z",
      "updated_at": "2026-03-15T10:00:00Z"
    }
  ],
  "meta": { "total": 42, "page": 1, "limit": 20, "pages": 3 }
}
```

::: info
`guest_token` is only present for guest orders (where `customer_id` is null). It is omitted for registered customer orders.
:::

## Get Order

```http
GET /api/v1/admin/orders/:id
```

Returns the full order including `items`, `status_history`, addresses, and `guest_token`.

## Update Order Status

```http
PATCH /api/v1/admin/orders/:id/status
```

**Request Body:**

```json
{
  "status": "shipped",
  "comment": "Tracking: DHL 12345"
}
```

Only valid transitions are accepted (see [Order Lifecycle](/guide/orders#order-lifecycle)). Invalid transitions return `422`.

## List Payment Transactions

```http
GET /api/v1/admin/orders/:orderID/transactions
```

Returns all payment transactions for a given order.

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "order_id": "uuid",
      "payment_method_id": "uuid",
      "status": "completed",
      "currency": "EUR",
      "amount": 2498,
      "provider_reference": "pi_abc123",
      "created_at": "2026-03-15T10:05:00Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 1, "pages": 1 }
}
```

| Status | Meaning |
|--------|---------|
| `pending` | Payment initiated |
| `completed` / `succeeded` | Payment successful |
| `failed` | Payment failed |
| `refunded` | Payment refunded |
| `cancelled` | Payment cancelled |

::: tip
Transactions are created by payment plugins (e.g. Stripe) via webhooks — they cannot be created manually through this API.
:::

## Store API

### List Customer Orders

```http
GET /api/v1/store/account/orders
```

Returns all orders for the authenticated customer. Requires JWT authentication.

### Get Order

```http
GET /api/v1/store/account/orders/:id
```

Returns a single order with ownership verification.

**Authentication:**

- **Authenticated customers** — the order's `customer_id` must match the JWT user ID.
- **Guest orders** — pass the `guest_token` as a query parameter.

```bash
# Authenticated customer
curl http://localhost:8080/api/v1/store/account/orders/<id> \
  -H 'Authorization: Bearer <token>'

# Guest order
curl http://localhost:8080/api/v1/store/account/orders/<id>?guest_token=<token>
```

| Status | Condition |
|--------|-----------|
| `200` | Ownership verified — order returned |
| `403` | Caller does not own this order |
| `404` | Order not found |

::: warning Security
The `guest_token` is never included in the response body. It is only used as an authentication mechanism for guest order lookups.
:::

### List Payment Transactions (Store)

```http
GET /api/v1/store/orders/:orderID/transactions
```

Returns payment transactions for a given order after verifying ownership. Uses the same ownership model as [Get Order](#get-order-1).

**Authentication:**

- **Authenticated customers** — the order's `customer_id` must match the JWT user ID.
- **Guest orders** — pass the `guest_token` as a query parameter.

```bash
# Authenticated customer
curl http://localhost:8080/api/v1/store/orders/<orderID>/transactions \
  -H 'Authorization: Bearer <token>'

# Guest order
curl http://localhost:8080/api/v1/store/orders/<orderID>/transactions?guest_token=<token>
```

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "order_id": "uuid",
      "payment_method_id": "uuid",
      "status": "completed",
      "currency": "EUR",
      "amount": 2498,
      "provider_reference": "pi_abc123",
      "created_at": "2026-03-15T10:05:00Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 1, "pages": 1 }
}
```

| Status | Condition |
|--------|-----------|
| `200` | Ownership verified — transactions returned |
| `403` | Caller does not own this order |
| `404` | Order not found |

### Checkout

```http
POST /api/v1/store/checkout
```

Creates a new order. For guest checkouts, the response includes a `guest_token` that the storefront uses for payment completion and order lookup.

**Request Body:**

```json
{
  "currency": "EUR",
  "billing_address": { "city": "Berlin", "street": "..." },
  "shipping_address": { "city": "Berlin", "street": "..." },
  "payment_method_id": "uuid",
  "shipping_method_id": "uuid",
  "notes": "Ring the doorbell twice",
  "payment_reference": "pi_3ABC...",
  "items": [
    {
      "product_id": "uuid",
      "variant_id": "uuid",
      "quantity": 2
    }
  ]
}
```

**Checkout Items:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `product_id` | UUID | Yes | Product to purchase |
| `variant_id` | UUID | No | Specific variant (size, color, etc.) |
| `quantity` | int | Yes | Number of units (min: 1) |

::: warning Server-Side Price Enforcement
All prices, product names, and SKUs are resolved **server-side** from the database. Any client-supplied price fields (`unit_price_net`, `unit_price_gross`, `tax_rate`, `name`, `sku`) are **ignored**. This prevents price manipulation attacks.

If a variant is specified, variant-specific prices and SKU are used. Otherwise, the base product prices apply.
:::

**Payment Validation:**

If active payment methods are configured in the shop, `payment_method_id` is required and must reference an active method. If no payment methods are configured (invoice-only shops), the field is optional.

**Payment Reference (provider-based methods):**

When the selected payment method has a `provider` (e.g. `"stripe"`), the `payment_reference` field is **required**. This is the provider's payment identifier (e.g. a Stripe PaymentIntent ID like `pi_3ABC...`) that proves payment has been completed before order creation.

For manual payment methods (where `provider` is empty), `payment_reference` is optional and can be omitted.

| Error Code | Status | Description |
|------------|--------|-------------|
| `missing_product_id` | 422 | A line item is missing the required `product_id` |
| `invalid_product` | 422 | The referenced product or variant does not exist |
| `payment_method_required` | 422 | Active payment methods exist but none was selected |
| `invalid_payment_method` | 422 | The selected payment method is inactive or does not exist |
| `payment_reference_required` | 422 | Provider-based payment method selected but no `payment_reference` provided |
| `checkout_rejected` | 422 | A plugin hook rejected the checkout (e.g. Stripe PaymentIntent not succeeded) |

**Checkout Hooks:**

Plugins can register `checkout.before` hooks to validate or reject checkouts. The hook receives metadata including `provider` and `payment_reference`, allowing provider plugins to verify payment completion. After-hooks (`checkout.after`) fire after order creation for post-order actions.

| Hook | Fires when | Fatal? |
|------|------------|--------|
| `checkout.before` | Before `service.Create()` — can abort checkout | Yes (returns error → 422) |
| `checkout.after` | After successful order creation | No (errors are logged) |
| `checkout.after_failed` | After `service.Create()` fails with `insufficient_stock` | No (errors are logged) |

The `checkout.after_failed` hook enables payment plugins to automatically refund a captured payment when stock runs out after the payment was already confirmed. See the [Stripe plugin documentation](/plugins/stripe#checkout-failure-automatic-refund) for an example implementation.
