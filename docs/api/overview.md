# MCP Overview

Stoa ships with a built-in **Model Context Protocol (MCP)** server, making it natively compatible with AI agents and assistants like Claude, GPT, and others.

## What is MCP?

[Model Context Protocol](https://modelcontextprotocol.io) is an open standard that allows AI models to interact with external tools and systems in a structured way. Think of it as a universal API layer between AI agents and the real world.

## What can agents do with Stoa?

Out of the box, a connected agent can:

| Tool | Description |
|------|-------------|
| `stoa_search_products` | Search the product catalog by query, category, price range |
| `stoa_get_product` | Get full details for a specific product |
| `stoa_add_to_cart` | Add a product to a cart |
| `stoa_get_cart` | Get the current cart contents |
| `stoa_remove_from_cart` | Remove an item from the cart |
| `stoa_checkout` | Complete a purchase |
| `stoa_get_order` | Look up an order by ID |
| `stoa_list_categories` | List all product categories |

## Example: An agent completes a purchase

```
User: "Buy me the cheapest wireless headphones you have."

Agent → stoa_search_products({ query: "wireless headphones", sort: "price_asc" })
     ← [{ id: "prod_xk9f2", name: "AirBuds Pro", price: 49.99 }, ...]

Agent → stoa_add_to_cart({ product_id: "prod_xk9f2", quantity: 1 })
     ← { cart_id: "cart_abc123", total: 49.99 }

Agent → stoa_checkout({ cart_id: "cart_abc123", payment: "stripe" })
     ← { order_id: "ord_789", status: "confirmed" }

Agent: "Done! I ordered the AirBuds Pro for €49.99. Order #ord_789."
```

No custom integration code. No scraping. No fragile browser automation.

## Next Steps

- [MCP Setup](/mcp/setup) — enable and configure the MCP server
- [Available Tools](/mcp/tools) — full reference for all MCP tools
- [Agent Examples](/mcp/examples) — real-world agent interaction examples
