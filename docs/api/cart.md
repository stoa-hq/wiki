# Cart API

The Cart API is part of the **Store API** (`/api/v1/store/*`) and supports both authenticated customers and guest sessions. All cart endpoints enforce ownership verification.

## Ownership & Authorization

Every cart operation (except creation) verifies that the caller owns the cart. The mechanism depends on the caller type:

| Caller | Identification | Ownership check |
|--------|---------------|-----------------|
| Authenticated customer | `Authorization: Bearer <token>` | `cart.customer_id` must match the JWT user ID |
| Guest | `X-Session-ID: <session_id>` header | `cart.session_id` must match the header value |

::: warning
Requests without valid ownership proof receive a `403 Forbidden` response. Guest requests **must** include the `X-Session-ID` header on every call after cart creation.
:::

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/store/cart` | Create a new cart |
| `GET` | `/api/v1/store/cart/:id` | Get a cart by ID |
| `POST` | `/api/v1/store/cart/:id/items` | Add an item to the cart |
| `PUT` | `/api/v1/store/cart/:id/items/:itemId` | Update item quantity |
| `DELETE` | `/api/v1/store/cart/:id/items/:itemId` | Remove item from cart |

## Create Cart

```http
POST /api/v1/store/cart
```

**Request Body:**

```json
{
  "currency": "EUR",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "expires_at": "2026-03-25T00:00:00Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `currency` | string | No | ISO 4217 currency code (default: `"USD"`) |
| `session_id` | string | No | Session identifier for guest carts |
| `expires_at` | datetime | No | Optional cart expiry timestamp |

If the request includes a valid `Authorization` header, the cart is automatically bound to the authenticated customer (`customer_id` is set). Guest carts should include a `session_id` for later ownership verification.

**Response** `201 Created`:

```json
{
  "data": {
    "id": "uuid",
    "customer_id": "uuid",
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "currency": "EUR",
    "expires_at": "2026-03-25T00:00:00Z",
    "created_at": "2026-03-18T10:00:00Z",
    "items": []
  }
}
```

## Get Cart

```http
GET /api/v1/store/cart/:id
```

Requires ownership verification (see [Ownership & Authorization](#ownership-authorization)).

**Response** `200 OK`:

```json
{
  "data": {
    "id": "uuid",
    "customer_id": "uuid",
    "session_id": "session-id",
    "currency": "EUR",
    "created_at": "2026-03-18T10:00:00Z",
    "items": [
      {
        "id": "uuid",
        "cart_id": "uuid",
        "product_id": "uuid",
        "variant_id": "uuid",
        "quantity": 2,
        "custom_fields": {}
      }
    ]
  }
}
```

## Add Item

```http
POST /api/v1/store/cart/:id/items
```

Requires ownership verification. Stock is validated when a stock checker is configured.

**Request Body:**

```json
{
  "product_id": "uuid",
  "variant_id": "uuid",
  "quantity": 2,
  "custom_fields": {}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `product_id` | UUID | Yes | Product to add |
| `variant_id` | UUID | No | Specific variant |
| `quantity` | int | Yes | Must be greater than zero |
| `custom_fields` | object | No | Arbitrary key-value data |

**Response** `201 Created`: Returns the full cart with the new item included.

## Update Item Quantity

```http
PUT /api/v1/store/cart/:id/items/:itemId
```

Requires ownership verification.

**Request Body:**

```json
{
  "quantity": 5
}
```

**Response** `200 OK`: Returns the full updated cart.

## Remove Item

```http
DELETE /api/v1/store/cart/:id/items/:itemId
```

Requires ownership verification.

**Response** `200 OK`: Returns the full cart after removal.

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| `400` | `invalid_request` | Request body is not valid JSON |
| `400` | `invalid_uuid` | Path parameter is not a valid UUID |
| `400` | `validation_error` | Missing `product_id` or invalid quantity |
| `403` | `forbidden` | Ownership check failed |
| `404` | `not_found` | Cart or cart item not found |
| `422` | `insufficient_stock` | Requested quantity exceeds available stock |

## Storefront Integration

The Stoa storefront automatically handles ownership verification:

- **Authenticated customers**: The `Authorization` header is sent with every request. The backend auto-binds `customer_id` on cart creation.
- **Guest sessions**: A `session_id` is generated via `crypto.randomUUID()` on cart creation and stored in `localStorage` (`storefront_session_id`). All subsequent cart requests include an `X-Session-ID` header with this value.

```typescript
// Guest cart request example
fetch('/api/v1/store/cart/' + cartId, {
  headers: {
    'X-Session-ID': localStorage.getItem('storefront_session_id')
  }
});
```

## Hooks

Plugins can hook into cart operations:

| Hook | Fires when | Fatal? |
|------|------------|--------|
| `cart.before_add_item` | Before adding an item | Yes (can reject) |
| `cart.after_add_item` | After item added | No (errors logged) |
| `cart.before_update_item` | Before updating quantity | Yes (can reject) |
| `cart.after_update_item` | After quantity updated | No (errors logged) |
| `cart.before_remove_item` | Before removing an item | Yes (can reject) |
| `cart.after_remove_item` | After item removed | No (errors logged) |
