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
      "sku": "SHIRT-RED-M",
      "name": "Red T-Shirt (M)",
      "quantity": 2,
      "unit_price_net": 1680,
      "unit_price_gross": 1999,
      "tax_rate": 1900
    }
  ]
}
```

**Payment Validation:**

If active payment methods are configured in the shop, `payment_method_id` is required and must reference an active method. If no payment methods are configured (invoice-only shops), the field is optional.

**Payment Reference (provider-based methods):**

When the selected payment method has a `provider` (e.g. `"stripe"`), the `payment_reference` field is **required**. This is the provider's payment identifier (e.g. a Stripe PaymentIntent ID like `pi_3ABC...`) that proves payment has been completed before order creation.

For manual payment methods (where `provider` is empty), `payment_reference` is optional and can be omitted.

| Error Code | Status | Description |
|------------|--------|-------------|
| `payment_method_required` | 422 | Active payment methods exist but none was selected |
| `invalid_payment_method` | 422 | The selected payment method is inactive or does not exist |
| `payment_reference_required` | 422 | Provider-based payment method selected but no `payment_reference` provided |
| `checkout_rejected` | 422 | A plugin hook rejected the checkout (e.g. Stripe PaymentIntent not succeeded) |

**Checkout Hooks:**

Plugins can register `checkout.before` hooks to validate or reject checkouts. The hook receives metadata including `provider` and `payment_reference`, allowing provider plugins to verify payment completion. After-hooks (`checkout.after`) fire after order creation for post-order actions. See [Orders Guide](/guide/orders#checkout-hooks) for details.
