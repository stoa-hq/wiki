# Products API

## Admin API

All admin endpoints require JWT authentication or an API key with `products.*` permissions.

### List Products

```http
GET /api/v1/admin/products
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | int | Page number (default: 1) |
| `limit` | int | Items per page (default: 25, max: 100) |
| `sort` | string | Sort field (e.g. `created_at`, `price_gross`) |
| `order` | string | `asc` or `desc` (default: `desc`) |
| `search` | string | Full-text search across product names |
| `category_id` | UUID | Filter by category |
| `filter[active]` | bool | Filter by active status (`true` or `false`) |

**Response:**

```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "sku": "TSHIRT-BLK-M",
        "active": true,
        "price_net": 1680,
        "price_gross": 1999,
        "currency": "EUR",
        "tax_rule_id": "uuid",
        "stock": 42,
        "weight": 200,
        "has_variants": true,
        "custom_fields": {},
        "metadata": {},
        "created_at": "2026-03-15T10:00:00Z",
        "updated_at": "2026-03-15T10:00:00Z",
        "translations": [
          {
            "locale": "en",
            "name": "Black T-Shirt",
            "description": "A classic black t-shirt.",
            "slug": "black-t-shirt",
            "meta_title": "Black T-Shirt",
            "meta_description": "A classic black t-shirt."
          }
        ],
        "categories": ["uuid"],
        "tags": ["uuid"],
        "media": [
          { "media_id": "uuid", "position": 0, "url": "/media/tshirt.jpg" }
        ],
        "variants": []
      }
    ]
  },
  "meta": { "total": 120, "page": 1, "limit": 25, "pages": 5 }
}
```

::: info Prices
All prices are integers in the smallest currency unit (cents). `1999` = €19.99. Tax rates are in basis points: `1900` = 19.00%.
:::

### Get Product

```http
GET /api/v1/admin/products/:id
```

Returns the full product including translations, categories, tags, media, and variants with their options.

### Create Product

```http
POST /api/v1/admin/products
```

**Request Body:**

```json
{
  "sku": "TSHIRT-BLK-M",
  "active": true,
  "price_net": 1680,
  "price_gross": 1999,
  "currency": "EUR",
  "tax_rule_id": "uuid",
  "stock": 100,
  "weight": 200,
  "custom_fields": {},
  "metadata": {},
  "translations": [
    {
      "locale": "en",
      "name": "Black T-Shirt",
      "description": "A classic black t-shirt.",
      "slug": "black-t-shirt",
      "meta_title": "Black T-Shirt",
      "meta_description": "A classic black t-shirt for everyday wear."
    }
  ],
  "category_ids": ["uuid"],
  "tag_ids": ["uuid"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sku` | string | No | Stock keeping unit (max 100 chars) |
| `active` | bool | No | Whether the product is visible (default: `false`) |
| `price_net` | int | No | Net price in cents |
| `price_gross` | int | No | Gross price in cents |
| `currency` | string | Yes | ISO 4217 currency code (3 chars, e.g. `EUR`) |
| `tax_rule_id` | UUID | No | Tax rule to apply |
| `stock` | int | No | Available stock (default: 0) |
| `weight` | int | No | Weight in grams |
| `custom_fields` | object | No | User-facing custom data (JSONB) |
| `metadata` | object | No | Internal metadata (JSONB) |
| `translations` | array | Yes | At least one translation required |
| `category_ids` | UUID[] | No | Categories to assign |
| `tag_ids` | UUID[] | No | Tags to assign |

**Translation fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `locale` | string | Yes | BCP 47 language tag (e.g. `en`, `de`) |
| `name` | string | Yes | Product name (max 255 chars) |
| `description` | string | No | Product description |
| `slug` | string | Yes | URL slug (max 255 chars) |
| `meta_title` | string | No | SEO title (max 255 chars) |
| `meta_description` | string | No | SEO description |

**Response:** `201 Created` with the full product object.

### Update Product

```http
PUT /api/v1/admin/products/:id
```

All fields are optional — only provided fields are updated. The request body uses the same fields as [Create Product](#create-product), with an additional `media_ids` field:

| Field | Type | Description |
|-------|------|-------------|
| `media_ids` | UUID[] | Ordered list of media to attach (replaces existing) |

**Response:** `200 OK` with the updated product object.

### Delete Product

```http
DELETE /api/v1/admin/products/:id
```

**Response:** `204 No Content`

---

## Variants

Variants represent different configurations of a product (e.g. size, color). Each variant can override the parent product's price, SKU, and stock.

### Create Variant

```http
POST /api/v1/admin/products/:id/variants
```

**Request Body:**

```json
{
  "sku": "TSHIRT-BLK-S",
  "price_gross": 1999,
  "price_net": 1680,
  "stock": 25,
  "active": true,
  "option_ids": ["uuid-size-s", "uuid-color-black"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sku` | string | No | Variant-specific SKU |
| `price_gross` | int | No | Override gross price (inherits from parent if omitted or 0) |
| `price_net` | int | No | Override net price (inherits from parent if omitted or 0) |
| `stock` | int | No | Variant stock |
| `active` | bool | No | Whether variant is active |
| `option_ids` | UUID[] | No | Property option IDs for this variant |

**Response:** `201 Created`

### Generate Variants (Cartesian Product)

To generate all combinations from multiple option groups, use the same endpoint with `option_groups` instead:

```http
POST /api/v1/admin/products/:id/variants
```

```json
{
  "option_groups": [
    ["uuid-size-s", "uuid-size-m", "uuid-size-l"],
    ["uuid-color-red", "uuid-color-blue"]
  ]
}
```

This creates 6 variants (3 sizes × 2 colors). Each inner array represents one property axis.

**Response:** `201 Created` with an array of all generated variants.

### Update Variant

```http
PUT /api/v1/admin/products/:id/variants/:variantId
```

Same body as [Create Variant](#create-variant).

**Response:** `200 OK`

### Delete Variant

```http
DELETE /api/v1/admin/products/:id/variants/:variantId
```

**Response:** `204 No Content`

---

## Property Groups & Options

Property groups define the axes for variants (e.g. "Size", "Color"). Options are the values within a group (e.g. "S", "M", "L").

### List Property Groups

```http
GET /api/v1/admin/property-groups
```

Returns all property groups with their options and translations. Each item includes the `identifier` field.

**Response example:**

```json
{
  "data": [
    {
      "id": "uuid",
      "identifier": "shoe-size",
      "position": 0,
      "created_at": "2026-03-15T10:00:00Z",
      "updated_at": "2026-03-15T10:00:00Z",
      "translations": [
        { "locale": "en", "name": "Size" },
        { "locale": "de", "name": "Größe" }
      ],
      "options": []
    }
  ]
}
```

### Get Property Group

```http
GET /api/v1/admin/property-groups/:id
```

Returns a single property group including `identifier`, translations, and all options.

### Create Property Group

```http
POST /api/v1/admin/property-groups
```

```json
{
  "identifier": "shoe-size",
  "position": 0,
  "translations": [
    { "locale": "en", "name": "Size" },
    { "locale": "de", "name": "Größe" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `identifier` | string | Yes | Unique slug: lowercase alphanumeric, hyphens, underscores (e.g. `color`, `shoe-size`). Pattern: `^[a-z0-9][a-z0-9_-]*$` |
| `position` | int | No | Sort order |
| `translations` | array | Yes | At least one translation required |

**Response:** `201 Created` with the full property group object, including `identifier`.

**Error responses:**

| Status | Error code | Condition |
|--------|-----------|-----------|
| `409 Conflict` | `duplicate_identifier` | Another property group already uses this identifier |
| `422 Unprocessable Entity` | `invalid_identifier` | Identifier does not match the required pattern |

### Update Property Group

```http
PUT /api/v1/admin/property-groups/:id
```

Same body as [Create Property Group](#create-property-group). All fields including `identifier` are required. **Response:** `200 OK`

### Delete Property Group

```http
DELETE /api/v1/admin/property-groups/:id
```

**Response:** `204 No Content`

### Create Property Option

```http
POST /api/v1/admin/property-groups/:id/options
```

```json
{
  "position": 0,
  "color_hex": "#000000",
  "translations": [
    { "locale": "en", "name": "Black" },
    { "locale": "de", "name": "Schwarz" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `position` | int | Sort order |
| `color_hex` | string | Optional hex color code for visual display |
| `translations` | array | At least one translation required |

**Response:** `201 Created`

### Update Property Option

```http
PUT /api/v1/admin/property-groups/:id/options/:optId
```

### Delete Property Option

```http
DELETE /api/v1/admin/property-groups/:id/options/:optId
```

---

## Bulk Import

### JSON Bulk Create

```http
POST /api/v1/admin/products/bulk
```

Creates up to 250 products in a single request. Each product can include inline variants.

```json
{
  "products": [
    {
      "sku": "HOODIE-GRY",
      "active": true,
      "price_net": 3361,
      "price_gross": 3999,
      "currency": "EUR",
      "translations": [
        { "locale": "en", "name": "Grey Hoodie", "slug": "grey-hoodie" }
      ],
      "variants": [
        {
          "sku": "HOODIE-GRY-S",
          "active": true,
          "stock": 50,
          "price_net": 3361,
          "price_gross": 3999,
          "options": [
            { "group_name": "Size", "option_name": "S", "locale": "en" }
          ]
        }
      ]
    }
  ]
}
```

Variant options are resolved by name — property groups and options are created automatically if they don't exist.

**Response:** `207 Multi-Status`

```json
{
  "data": {
    "results": [
      { "index": 0, "sku": "HOODIE-GRY", "success": true, "id": "uuid" }
    ],
    "total": 1,
    "succeeded": 1,
    "failed": 0
  }
}
```

### CSV Import

```http
POST /api/v1/admin/products/import
```

Upload a CSV file as `multipart/form-data` (field name: `file`, max 10 MB).

Download the CSV template first:

```http
GET /api/v1/admin/products/import/template
```

**Response:** `207 Multi-Status` with the same bulk result format.

---

## Store API

Store endpoints return only **active** products. No authentication required.

### List Products

```http
GET /api/v1/store/products
```

Same query parameters as [admin list](#list-products), except `filter[active]` is not available — only active products are returned.

**Response:** Same format as admin list.

### Get Product by Slug

```http
GET /api/v1/store/products/:slug
```

Looks up a product by its translated slug. The slug is matched against the locale from the `Accept-Language` header (defaults to `en`).

```bash
curl http://localhost:8080/api/v1/store/products/black-t-shirt \
  -H 'Accept-Language: en'
```

### Get Product by ID

```http
GET /api/v1/store/products/id/:id
```

Alternative lookup by UUID. Useful when the storefront already has the product ID (e.g. from a cart).
