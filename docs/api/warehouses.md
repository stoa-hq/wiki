# Warehouses API

The Warehouses API provides endpoints for managing warehouses and their stock. All endpoints require admin authentication.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/warehouses` | List warehouses |
| `POST` | `/api/v1/admin/warehouses` | Create warehouse |
| `GET` | `/api/v1/admin/warehouses/{id}` | Get warehouse |
| `PUT` | `/api/v1/admin/warehouses/{id}` | Update warehouse |
| `DELETE` | `/api/v1/admin/warehouses/{id}` | Delete warehouse |
| `GET` | `/api/v1/admin/warehouses/{id}/stock` | Get stock by warehouse |
| `PUT` | `/api/v1/admin/warehouses/{id}/stock` | Set stock entries |
| `GET` | `/api/v1/admin/products/{productID}/stock` | Get stock by product |

## List Warehouses

```bash
curl http://localhost:8080/api/v1/admin/warehouses?page=1&limit=20 \
  -H 'Authorization: Bearer <token>'
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Items per page (max 200) |
| `active` | bool | — | Filter by active status |

**Response:**

```json
{
  "data": [
    {
      "id": "00000000-0000-0000-0000-000000000001",
      "name": "Default Warehouse",
      "code": "DEFAULT",
      "active": true,
      "allow_negative_stock": false,
      "priority": 0,
      "address_line1": "",
      "city": "",
      "country": "",
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "pages": 1 }
}
```

## Create Warehouse

```bash
curl -X POST http://localhost:8080/api/v1/admin/warehouses \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Berlin Warehouse",
    "code": "WH-BER",
    "active": true,
    "priority": 1,
    "allow_negative_stock": false,
    "address_line1": "Alexanderplatz 1",
    "city": "Berlin",
    "postal_code": "10178",
    "country": "DE"
  }'
```

**Required fields:** `name`, `code`

**Response:** `201 Created` with the created warehouse object.

::: warning Unique Code
The `code` field must be unique across all warehouses. A `409 Conflict` is returned if the code already exists.
:::

## Get Warehouse

```bash
curl http://localhost:8080/api/v1/admin/warehouses/{id} \
  -H 'Authorization: Bearer <token>'
```

## Update Warehouse

```bash
curl -X PUT http://localhost:8080/api/v1/admin/warehouses/{id} \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Berlin Warehouse (Main)",
    "code": "WH-BER",
    "active": true,
    "priority": 0,
    "allow_negative_stock": true
  }'
```

## Delete Warehouse

```bash
curl -X DELETE http://localhost:8080/api/v1/admin/warehouses/{id} \
  -H 'Authorization: Bearer <token>'
```

Returns `204 No Content` on success. Deleting a warehouse also removes all its stock entries (cascade).

## Get Stock by Warehouse

Returns all stock entries for a specific warehouse.

```bash
curl http://localhost:8080/api/v1/admin/warehouses/{id}/stock \
  -H 'Authorization: Bearer <token>'
```

**Response:**

```json
{
  "data": [
    {
      "id": "...",
      "warehouse_id": "...",
      "product_id": "...",
      "variant_id": null,
      "quantity": 50,
      "warehouse_name": "Berlin Warehouse",
      "warehouse_code": "WH-BER",
      "product_sku": "PROD-001",
      "product_name": "Example Product",
      "variant_sku": "",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

Stock entries include human-readable identifiers alongside UUIDs:

| Field | Type | Description |
|-------|------|-------------|
| `product_sku` | string | SKU of the product |
| `product_name` | string | Name of the product |
| `variant_sku` | string | SKU of the variant (empty if product-level stock) |

## Set Stock

Upsert stock quantities for products at a warehouse. Also records adjustment movements.

```bash
curl -X PUT http://localhost:8080/api/v1/admin/warehouses/{id}/stock \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "items": [
      {
        "product_id": "abc-123",
        "quantity": 100,
        "reference": "Initial stock"
      },
      {
        "product_id": "abc-123",
        "variant_id": "var-456",
        "quantity": 25,
        "reference": "Variant stock"
      }
    ]
  }'
```

Each item in the `items` array:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `product_id` | UUID | Yes | Product ID |
| `variant_id` | UUID | No | Variant ID (omit for product-level stock) |
| `quantity` | int | Yes | New stock quantity (min 0) |
| `reference` | string | No | Audit reference note |

Setting stock also updates the denormalized `stock` field on the product/variant.

## Get Stock by Product

Returns stock entries across all warehouses for a specific product.

```bash
curl http://localhost:8080/api/v1/admin/products/{productID}/stock \
  -H 'Authorization: Bearer <token>'
```

**Response:**

```json
{
  "data": [
    {
      "id": "...",
      "warehouse_id": "...",
      "product_id": "...",
      "variant_id": null,
      "quantity": 50,
      "warehouse_name": "Berlin Warehouse",
      "warehouse_code": "WH-BER",
      "product_sku": "PROD-001",
      "product_name": "Example Product",
      "variant_sku": ""
    },
    {
      "id": "...",
      "warehouse_id": "...",
      "product_id": "...",
      "variant_id": null,
      "quantity": 30,
      "warehouse_name": "Munich Warehouse",
      "warehouse_code": "WH-MUC",
      "product_sku": "PROD-001",
      "product_name": "Example Product",
      "variant_sku": ""
    }
  ]
}
```

## Stock Deduction (Automatic)

Stock is deducted automatically when an order is created via the Store checkout endpoint. The system:

1. Selects warehouses by priority (ascending)
2. Deducts stock from each warehouse until the order quantity is fulfilled
3. Records `sale` movements with the order reference
4. Updates denormalized product/variant stock

If total available stock is insufficient and no warehouse allows negative stock, the checkout is rejected with a `422 Unprocessable Entity` response:

```json
{
  "errors": [
    {
      "code": "insufficient_stock",
      "detail": "one or more items are out of stock",
      "field": ""
    }
  ]
}
```

## Stock Restoration (Automatic)

When an order status transitions to `cancelled` or `refunded`, all sale movements for that order are reversed automatically. Stock is restored to the original warehouses.

## Negative Stock (`allow_negative_stock`)

By default, warehouses enforce a stock floor of zero — customers cannot add more items to their cart than are available, and checkout is rejected if quantities drop to zero.

Setting `allow_negative_stock: true` on a warehouse removes this restriction for products stored there. This is useful for made-to-order or pre-order products where overselling is intentional.

**How it works:**

- When `StockAvailable` is evaluated (on cart add, cart item update, and checkout), the system first checks whether any active warehouse carries the product with `allow_negative_stock` enabled.
- If at least one such warehouse exists, the stock check is bypassed entirely and the operation is allowed regardless of current quantity.
- During deduction, stock is decremented normally — the quantity field will go negative if demand exceeds supply.

**Enabling on create:**

```bash
curl -X POST http://localhost:8080/api/v1/admin/warehouses \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Pre-Order Warehouse",
    "code": "WH-PREORDER",
    "active": true,
    "allow_negative_stock": true
  }'
```

**Enabling on an existing warehouse:**

```bash
curl -X PUT http://localhost:8080/api/v1/admin/warehouses/{id} \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Pre-Order Warehouse",
    "code": "WH-PREORDER",
    "active": true,
    "allow_negative_stock": true
  }'
```

::: tip Admin Panel
The "Negativer Bestand erlaubt" checkbox in the warehouse create and edit forms maps directly to this field.
:::

::: warning Scope
`allow_negative_stock` is a per-warehouse flag. A product is only exempt from the stock floor when it has a stock entry in at least one warehouse where the flag is `true`. If the product has no stock entry in a negative-stock warehouse, the normal limit still applies.
:::

## Cart Stock Validation

Stock is checked at two points during the cart lifecycle, in addition to checkout:

1. **`POST /api/v1/store/cart/{id}/items`** — When a customer adds a product, the service fetches the quantity already in the cart for that product/variant and checks `existing + requested <= available`. This prevents bypassing the stock limit by adding the same product multiple times in small increments.

2. **`PUT /api/v1/store/cart/{id}/items/{itemId}`** — When a customer changes the quantity of an existing cart line item, the new absolute quantity is checked against available stock.

Both operations return `ErrInsufficientStock` (surfaced as a `422` error to the API consumer) when the check fails, unless the product is in a warehouse with `allow_negative_stock: true`.
