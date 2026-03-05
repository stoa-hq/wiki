# MCP Overview

Stoa ships with two **Model Context Protocol (MCP)** servers that allow AI agents — such as Claude — to interact with the shop programmatically.

## What is MCP?

[Model Context Protocol](https://modelcontextprotocol.io) is an open standard that allows AI models to interact with external tools and systems in a structured way.

## Two servers, two roles

| Server | Binary | Tools | Purpose |
|--------|--------|-------|---------|
| **Store MCP** | `stoa-store-mcp` | 16 | Shopping: browse products, manage cart, checkout |
| **Admin MCP** | `stoa-admin-mcp` | 33 | Management: products, orders, discounts, customers |

## What agents can do

### Store MCP Tools (16)

| Category | Tools |
|----------|-------|
| **Products** | `store_list_products`, `store_get_product`, `store_search`, `store_get_categories` |
| **Cart** | `store_create_cart`, `store_get_cart`, `store_add_to_cart`, `store_update_cart_item`, `store_remove_from_cart` |
| **Checkout** | `store_get_shipping_methods`, `store_get_payment_methods`, `store_checkout` |
| **Account** | `store_register`, `store_login`, `store_get_account`, `store_list_orders` |

### Admin MCP Tools (33)

| Category | Tools |
|----------|-------|
| **Products** (8) | `admin_list_products`, `admin_get_product`, `admin_create_product`, `admin_update_product`, `admin_delete_product`, `admin_create_variant`, `admin_update_variant`, `admin_delete_variant` |
| **Orders** (3) | `admin_list_orders`, `admin_get_order`, `admin_update_order_status` |
| **Discounts** (5) | `admin_list_discounts`, `admin_get_discount`, `admin_create_discount`, `admin_update_discount`, `admin_delete_discount` |
| **Customers** (4) | `admin_list_customers`, `admin_get_customer`, `admin_update_customer`, `admin_delete_customer` |
| **Categories** (4) | `admin_list_categories`, `admin_get_category`, `admin_create_category`, `admin_update_category` |
| **Tags** (3) | `admin_list_tags`, `admin_create_tag`, `admin_delete_tag` |
| **Media** (2) | `admin_list_media`, `admin_delete_media` |
| **Config** (3) | `admin_list_shipping_methods`, `admin_list_tax_rules`, `admin_list_payment_methods` |
| **Audit** (1) | `admin_list_audit_log` |

## Example: An agent completes a purchase

```
User: "Buy me the cheapest wireless headphones you have."

Agent → store_search({ query: "wireless headphones", sort: "price_asc" })
     ← [{ id: "prod_xk9f2", name: "AirBuds Pro", price: 49.99 }, ...]

Agent → store_create_cart()
     ← { cart_id: "cart_abc123" }

Agent → store_add_to_cart({ cart_id: "cart_abc123", product_id: "prod_xk9f2", quantity: 1 })
     ← { total: 49.99 }

Agent → store_checkout({ cart_id: "cart_abc123", ... })
     ← { order_id: "ord_789", status: "confirmed" }

Agent: "Done! I ordered the AirBuds Pro for €49.99. Order #ord_789."
```

## Next Steps

- [MCP Setup](/mcp/setup) — build, run, and connect the MCP servers
