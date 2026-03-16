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
# Store MCP on port 8090 (default), Admin MCP on port 8091
make mcp-store-run
STOA_MCP_PORT=8091 STOA_MCP_API_KEY=ck_... make mcp-admin-run
```

Both servers expose SSE endpoints:
- **SSE stream:** `http://localhost:<port>/sse`
- **Message endpoint:** `http://localhost:<port>/message`

## Docker Deployment

Both MCP servers are included in the Docker image and available as separate services in `docker-compose.yaml`.

### Services

| Service | Binary | Default Port | Purpose |
|---------|--------|-------------|---------|
| `stoa-store-mcp` | `stoa-store-mcp` | 8090 | Store MCP (browsing, cart, checkout) |
| `stoa-admin-mcp` | `stoa-admin-mcp` | 8091 | Admin MCP (product/order management) |

### docker-compose.yaml

The default compose file includes both MCP services:

```yaml
stoa-store-mcp:
  build:
    context: .
    args:
      PLUGINS: "${STOA_PLUGINS:-}"
  ports:
    - "8090:8090"
  environment:
    STOA_MCP_API_URL: "http://stoa:8080"
    STOA_MCP_API_KEY: "${STOA_MCP_API_KEY:-}"
    STOA_MCP_PORT: "8090"
  depends_on:
    stoa:
      condition: service_started
  entrypoint: ["./stoa-store-mcp"]

stoa-admin-mcp:
  build:
    context: .
    args:
      PLUGINS: "${STOA_PLUGINS:-}"
  ports:
    - "8091:8091"
  environment:
    STOA_MCP_API_URL: "http://stoa:8080"
    STOA_MCP_API_KEY: "${STOA_MCP_API_KEY:-}"
    STOA_MCP_PORT: "8091"
  depends_on:
    stoa:
      condition: service_started
  entrypoint: ["./stoa-admin-mcp"]
```

::: tip Internal networking
`STOA_MCP_API_URL` points to `http://stoa:8080` — the Docker-internal service name. Do not use `localhost` here.
:::

### Environment Variables

Set the API key in your `.env` file:

```env
STOA_MCP_API_KEY=ck_your_api_key_here
```

### Start

```bash
docker compose up -d
```

Verify the services are running:

```bash
curl http://localhost:8090/sse    # Store MCP
curl http://localhost:8091/sse    # Admin MCP
```

### With Plugins

If you use plugins that register MCP tools (e.g. Stripe), both MCP services automatically include them when built with the `STOA_PLUGINS` argument:

```bash
STOA_PLUGINS=stripe docker compose build
docker compose up -d
```

See [Docker Plugin Installation](/plugins/docker-installation) for details.

## Use with Claude Code

Add the MCP servers to your Claude Code configuration (`.claude/settings.json` or project settings):

```json
{
  "mcpServers": {
    "stoa-store": {
      "url": "http://localhost:8090/sse"
    },
    "stoa-admin": {
      "url": "http://localhost:8091/sse"
    }
  }
}
```

Once configured, you can interact with the shop in natural language:

- *"Show me all shoes under 50 EUR"*
- *"Add the leather boots to the cart"*
- *"Create a 20% discount code SUMMER for all orders over 50 EUR"*
- *"What are the last 10 orders?"*
