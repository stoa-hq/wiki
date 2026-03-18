# Orders

## Order Lifecycle

Orders move through a defined set of statuses. Transitions are strictly enforced — only the arrows below are valid.

```
pending → confirmed → processing → shipped → delivered → refunded
    ↓           ↓            ↓
 cancelled  cancelled    cancelled
```

| Status | Meaning |
|--------|---------|
| `pending` | Order placed, awaiting confirmation |
| `confirmed` | Confirmed, not yet being processed |
| `processing` | Being prepared / packed |
| `shipped` | Handed to carrier |
| `delivered` | Received by customer |
| `cancelled` | Cancelled (terminal) |
| `refunded` | Refunded (terminal) |

Every status change is recorded in `OrderStatusHistory` with an optional comment.

## Order Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `order_number` | string | Human-readable order number |
| `customer_id` | UUID? | Link to customer (null for guest orders) |
| `status` | string | Current status |
| `currency` | string | ISO 4217 code |
| `subtotal_net` | int | Net subtotal in cents |
| `subtotal_gross` | int | Gross subtotal in cents |
| `shipping_cost` | int | Shipping cost in cents |
| `tax_total` | int | Total tax in cents |
| `total` | int | Grand total in cents |
| `billing_address` | object | Billing address snapshot |
| `shipping_address` | object | Shipping address snapshot |
| `payment_method_id` | UUID? | Selected payment method |
| `shipping_method_id` | UUID? | Selected shipping method |
| `notes` | string | Customer or admin notes |
| `custom_fields` | object | Free-form extra data |

## Order Items

Each `OrderItem` is a snapshot of what was purchased at the time of the order. Product name, SKU, and prices are copied so that later changes to the product catalogue do not affect historical orders.

| Field | Description |
|-------|-------------|
| `product_id` / `variant_id` | Reference to the original product/variant |
| `sku` | Snapshot of SKU at time of order |
| `name` | Snapshot of product name |
| `quantity` | Units ordered |
| `unit_price_net` / `unit_price_gross` | Price per unit in cents |
| `total_net` / `total_gross` | Line total in cents |
| `tax_rate` | Tax rate in basis points (e.g. `1900` = 19%) |

## Guest Orders

`customer_id` is nullable. Orders from non-registered customers have no customer link — billing and shipping addresses are stored directly on the order.

### Guest Token

Every guest order receives a cryptographically strong `guest_token` (32 random bytes, hex-encoded to 64 characters) at checkout. This token serves two purposes:

1. **Ownership verification** — the storefront uses it to let guests view their order and complete payment without an account.
2. **Payment reconciliation** — admins can use the token to match orders to payment provider sessions (e.g. Stripe Payment Intents).

The guest token is **not included in the checkout API response body**. Instead, it is delivered as an **HTTP-only cookie** (`stoa_guest_token`) with `SameSite=Lax` and `Secure` (when HTTPS is enabled). The browser sends this cookie automatically on subsequent API requests, making the token invisible to JavaScript and resistant to XSS attacks.

The store API response includes an `is_guest_order` boolean flag instead of the raw token:

```json
{
  "data": {
    "id": "uuid",
    "order_number": "ORD-20260315-A1B2C",
    "is_guest_order": true,
    "status": "pending"
  }
}
```

The guest token is still displayed in the **Admin Panel** on the order detail page and returned in the Admin API response (`guest_token` field). Admins can copy it with one click and search for it in the payment provider's dashboard.

::: tip
When refunding a guest order via Stripe, use the guest token from the Admin Panel to locate the corresponding Payment Intent in the Stripe Dashboard.
:::

## Payment Transactions

Payment transactions are recorded per order and track the lifecycle of each payment attempt. They are created by payment plugins (e.g. Stripe) via webhooks.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Transaction identifier |
| `order_id` | UUID | Associated order |
| `payment_method_id` | UUID | Which payment method was used |
| `status` | string | `pending`, `completed`, `succeeded`, `failed`, `refunded`, `cancelled` |
| `currency` | string | ISO 4217 code |
| `amount` | int | Amount in cents |
| `provider_reference` | string | External provider reference (e.g. Stripe PaymentIntent ID) |
| `created_at` | datetime | When the transaction was recorded |

Transactions are visible in the Admin Panel under each order's detail page. The endpoint is read-only — transactions are created by plugins, not manually.

## Payment Validation at Checkout

The checkout endpoint validates payment method selection based on your shop's configuration:

- **No active payment methods configured** — checkout works without `payment_method_id` (invoice-only shops).
- **Active payment methods exist** — `payment_method_id` is required and must reference a valid, active method.

This follows a **synchronous validation, asynchronous payment** model: the order is created as `pending`, and actual payment processing happens afterwards via plugin flows (e.g. Stripe Payment Intents → webhooks → `confirmed`).

| Scenario | Result |
|----------|--------|
| No active payment methods, no `payment_method_id` | 201 Created |
| Active methods exist, no `payment_method_id` | 422 `payment_method_required` |
| Active methods exist, invalid/inactive `payment_method_id` | 422 `invalid_payment_method` |
| Active methods exist, valid `payment_method_id` | 201 Created |

### Checkout Hooks

Plugins can intercept the checkout flow via hooks:

| Hook | Timing | Behavior |
|------|--------|----------|
| `checkout.before` | Before order creation | Can reject checkout (returns 422 `checkout_rejected`) |
| `checkout.after` | After order creation | Non-fatal — errors are logged but the order is preserved |

::: tip
Payment plugins like Stripe use `checkout.after` to create Payment Intents linked to the new order ID.
:::

## Updating Order Status

Via the Admin API:

```bash
curl -X PATCH http://localhost:8080/api/v1/admin/orders/<id>/status \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"status": "shipped", "comment": "Tracking: DHL 12345"}'
```

Invalid transitions (e.g. `delivered` → `pending`) are rejected with a 422 error.
