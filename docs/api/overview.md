# API Overview

Stoa exposes a REST API at `/api/v1`. All responses are JSON.

## Endpoints

| Area | Path | Authentication |
|------|------|----------------|
| Admin API | `/api/v1/admin/*` | JWT (admin role) or API key with permissions |
| Store API | `/api/v1/store/*` | Public / customer JWT / API key |
| Auth | `/api/v1/auth/*` | None |
| Health | `/api/v1/health` | None |

## Authentication

### JWT (Admin login)

```bash
# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "admin@example.com", "password": "your-password"}'

# Response contains access_token and refresh_token
# Use access_token in the Authorization header:
curl http://localhost:8080/api/v1/admin/products \
  -H 'Authorization: Bearer <access_token>'
```

### API Keys

API keys are for programmatic access (MCP servers, integrations, scripts).

```bash
# Authenticate with an API key:
curl http://localhost:8080/api/v1/admin/products \
  -H 'Authorization: ApiKey ck_your_api_key_here'
```

API keys are managed through the admin API. Only `super_admin` and `admin` roles can create them.

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"your-password"}' | jq -r '.data.access_token')

curl -X POST http://localhost:8080/api/v1/admin/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "My Integration Key",
    "permissions": [
      "products.read", "orders.read", "customers.read"
    ]
  }'

# Save the "key" field from the response — it is shown only once!
```

## Available Permissions

| Scope | Permissions |
|-------|-------------|
| Products | `products.read`, `products.create`, `products.update`, `products.delete` |
| Orders | `orders.read`, `orders.update` |
| Discounts | `discounts.read`, `discounts.create`, `discounts.update`, `discounts.delete` |
| Customers | `customers.read`, `customers.update`, `customers.delete` |
| Categories | `categories.read`, `categories.create`, `categories.update` |
| Media | `media.read`, `media.delete` |
| Shipping | `shipping.read` |
| Payment | `payment.read` |
| Tax | `tax.read` |
| Audit | `audit.read` |

## Project Structure

```
stoa/
├── cmd/
│   ├── stoa/               # CLI entry point (main.go)
│   ├── stoa-store-mcp/     # Store MCP Server (shopping)
│   └── stoa-admin-mcp/     # Admin MCP Server (management)
├── internal/
│   ├── app/                # Application bootstrapping
│   ├── config/             # Configuration loading
│   ├── server/             # HTTP server, router, middleware
│   ├── auth/               # JWT, RBAC, API keys, permissions
│   ├── database/           # DB connection, migration runner
│   ├── domain/             # Business logic (DDD-style)
│   │   ├── product/        # Products, variants, property groups
│   │   ├── category/       # Categories (tree structure)
│   │   ├── order/          # Orders
│   │   ├── cart/           # Shopping cart
│   │   ├── customer/       # Customer management
│   │   ├── media/          # Media uploads
│   │   ├── discount/       # Discounts
│   │   ├── shipping/       # Shipping methods
│   │   ├── payment/        # Payment methods
│   │   └── ...
│   ├── mcp/                # Shared MCP infrastructure
│   │   ├── store/          # Store MCP tools (16)
│   │   └── admin/          # Admin MCP tools (33)
│   ├── admin/              # Embedded admin frontend (//go:embed)
│   └── storefront/         # Embedded storefront (//go:embed)
├── admin/                  # Admin frontend (SvelteKit)
├── storefront/             # Storefront (SvelteKit)
├── migrations/             # SQL migrations
├── pkg/sdk/                # Plugin SDK
├── Dockerfile
├── docker-compose.yaml
├── Makefile
└── config.example.yaml
```

Every domain follows the same pattern: `entity.go`, `repository.go`, `postgres.go`, `service.go`, `handler.go`, `dto.go`.
