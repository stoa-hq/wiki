# MCP Setup

Connect AI agents to your Stoa shop.

## Prerequisites

1. A running Stoa instance (see [Quick Start](/guide/quick-start))
2. An API key with the required permissions (for Admin MCP)

## Create an API Key

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"your-password"}' | jq -r '.data.access_token')

curl -X POST http://localhost:8080/api/v1/admin/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "MCP Admin Key",
    "permissions": [
      "products.read", "products.create", "products.update", "products.delete",
      "orders.read", "orders.update",
      "discounts.read", "discounts.create", "discounts.update", "discounts.delete",
      "customers.read", "customers.update", "customers.delete",
      "categories.read", "categories.create", "categories.update",
      "media.read", "media.delete",
      "shipping.read", "payment.read", "tax.read",
      "audit.read"
    ]
  }'

# Save the "key" field from the response — it is shown only once!
```

For the Store MCP server, no API key is needed for public endpoints (browsing, cart).

## Build

```bash
make mcp-store-build    # → bin/stoa-store-mcp
make mcp-admin-build    # → bin/stoa-admin-mcp
```

## Configuration

Both servers are configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `STOA_MCP_API_URL` | `http://localhost:8080` | Stoa backend URL |
| `STOA_MCP_API_KEY` | *(empty)* | API key for authentication |
| `STOA_MCP_PORT` | `8090` | HTTP port for SSE server |
| `STOA_MCP_BASE_URL` | `http://localhost:<port>` | Public base URL (for proxied setups) |

## Run

```bash
# Store MCP on port 8091, Admin MCP on port 8092
STOA_MCP_PORT=8091 make mcp-store-run
STOA_MCP_PORT=8092 STOA_MCP_API_KEY=ck_... make mcp-admin-run
```

Both servers expose SSE endpoints:
- **SSE stream:** `http://localhost:<port>/sse`
- **Message endpoint:** `http://localhost:<port>/message`

## Use with Claude Code

Add the MCP servers to your Claude Code configuration (`.claude/settings.json` or project settings):

```json
{
  "mcpServers": {
    "stoa-store": {
      "url": "http://localhost:8091/sse"
    },
    "stoa-admin": {
      "url": "http://localhost:8092/sse"
    }
  }
}
```

Once configured, you can interact with the shop in natural language:

- *"Show me all shoes under 50 EUR"*
- *"Add the leather boots to the cart"*
- *"Create a 20% discount code SUMMER for all orders over 50 EUR"*
- *"What are the last 10 orders?"*
