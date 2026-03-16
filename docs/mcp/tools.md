# Available Tools

Stoa ships two MCP servers: **stoa-admin-mcp** (full admin access) and **stoa-store-mcp** (storefront operations). Each tool maps to a REST API endpoint.

## Admin MCP Tools (41)

### Products (8)

| Tool | Description |
|------|-------------|
| `admin_list_products` | List products with pagination, search, and filters |
| `admin_get_product` | Get product details including variants and translations |
| `admin_create_product` | Create a new product |
| `admin_update_product` | Update an existing product |
| `admin_delete_product` | Delete a product |
| `admin_create_variant` | Create a product variant |
| `admin_update_variant` | Update a product variant |
| `admin_delete_variant` | Delete a product variant |

### Orders (3)

| Tool | Description |
|------|-------------|
| `admin_list_orders` | List orders with pagination and status filter |
| `admin_get_order` | Get order details |
| `admin_update_order_status` | Update order status |

### Discounts (5)

| Tool | Description |
|------|-------------|
| `admin_list_discounts` | List discount codes |
| `admin_get_discount` | Get discount details |
| `admin_create_discount` | Create a discount code |
| `admin_update_discount` | Update a discount code |
| `admin_delete_discount` | Delete a discount code |

### Customers (4)

| Tool | Description |
|------|-------------|
| `admin_list_customers` | List customers |
| `admin_get_customer` | Get customer details |
| `admin_update_customer` | Update customer data |
| `admin_delete_customer` | Delete a customer |

### Categories (4)

| Tool | Description |
|------|-------------|
| `admin_list_categories` | List categories |
| `admin_get_category` | Get category details |
| `admin_create_category` | Create a category |
| `admin_update_category` | Update a category |

### Tags (3)

| Tool | Description |
|------|-------------|
| `admin_list_tags` | List tags |
| `admin_create_tag` | Create a tag |
| `admin_delete_tag` | Delete a tag |

### Media (2)

| Tool | Description |
|------|-------------|
| `admin_list_media` | List uploaded files |
| `admin_delete_media` | Delete a file |

### Shipping / Tax / Payment (3)

| Tool | Description |
|------|-------------|
| `admin_list_shipping_methods` | List shipping methods |
| `admin_list_tax_rules` | List tax rules |
| `admin_list_payment_methods` | List payment methods |

### Warehouses (8)

| Tool | Description |
|------|-------------|
| `admin_list_warehouses` | List warehouses with pagination and active filter |
| `admin_get_warehouse` | Get warehouse details |
| `admin_create_warehouse` | Create a new warehouse |
| `admin_update_warehouse` | Update an existing warehouse |
| `admin_delete_warehouse` | Delete a warehouse |
| `admin_get_warehouse_stock` | Get all stock entries for a warehouse (includes product SKU and name) |
| `admin_set_warehouse_stock` | Set stock quantities for products at a warehouse (upsert) |
| `admin_get_product_stock` | Get stock entries for a product across all warehouses |

### Audit (1)

| Tool | Description |
|------|-------------|
| `admin_list_audit_log` | List audit log entries |

## Store MCP Tools (16)

See [Setup](/mcp/setup) for details on configuring the store MCP server. Store tools are scoped to authenticated customer operations and storefront browsing.

## Conventions

- **Prices** are in cents (`1999` = €19.99)
- **Tax rates** are in basis points (`1900` = 19%)
- **Pagination** uses `page` and `limit` parameters
- **UUIDs** are used for all entity IDs
- All tools return JSON matching the REST API response format: `{ "data": ..., "meta": ... }`
