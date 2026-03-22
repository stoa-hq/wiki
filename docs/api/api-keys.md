# API Keys

API keys provide programmatic access for MCP servers, integrations, and scripts. Each key is **user-bound** — it belongs to the admin who created it and acts with that user's identity.

## Authentication

Use the `ApiKey` authorization scheme:

```bash
curl http://localhost:8080/api/v1/admin/products \
  -H 'Authorization: ApiKey ck_your_api_key_here'
```

When a request is authenticated via API key, the system uses the **creator's user ID** — not the key ID. This means audit logs, ownership checks, and all identity-dependent features work as if the creating user made the request directly.

::: info CSRF Exempt
Requests with an `Authorization` header (including API keys) are exempt from CSRF checks.
:::

## Key Format

API keys use the prefix `ck_` followed by 64 hex characters:

```
ck_a1b2c3d4e5f6...  (67 characters total)
```

Keys are hashed with SHA-256 before storage — the raw key is only returned once at creation time.

## Managing API Keys

### Access

All staff roles can manage their own API keys:

| Role | Can Create | Can See | Can Revoke |
|------|-----------|---------|------------|
| `super_admin` | Yes (all permissions) | Own keys + all keys (`?all=true`) | Any key |
| `admin` | Yes (all permissions) | Own keys only | Own keys only |
| `manager` | Yes (subset of role permissions) | Own keys only | Own keys only |

### Create

```bash
curl -X POST http://localhost:8080/api/v1/admin/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "MCP Admin Server",
    "permissions": ["products.read", "orders.read", "orders.update"]
  }'
```

**Response (201):**

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "MCP Admin Server",
    "key": "ck_a1b2c3d4e5f6...",
    "permissions": ["products.read", "orders.read", "orders.update"],
    "created_by": "user-uuid",
    "created_at": "2026-03-20T12:00:00Z"
  }
}
```

::: warning Save the key immediately
The raw key (`ck_...`) is returned **only once**. Store it securely — it cannot be retrieved later.
:::

### List

```bash
# List own keys
curl http://localhost:8080/api/v1/admin/api-keys \
  -H "Authorization: Bearer $TOKEN"

# Super admin: list all keys
curl http://localhost:8080/api/v1/admin/api-keys?all=true \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "MCP Admin Server",
      "permissions": ["products.read", "orders.read", "orders.update"],
      "active": true,
      "created_by": "user-uuid",
      "last_used_at": "2026-03-20T14:30:00Z",
      "created_at": "2026-03-20T12:00:00Z"
    }
  ]
}
```

### Revoke

```bash
curl -X DELETE http://localhost:8080/api/v1/admin/api-keys/{id} \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**

```json
{
  "data": {
    "message": "API key revoked"
  }
}
```

Revoking a key sets it to inactive. It cannot be reactivated.

## Available Permissions

| Scope | Permissions |
|-------|-------------|
| Products | `products.create`, `products.read`, `products.update`, `products.delete` |
| Categories | `categories.create`, `categories.read`, `categories.update`, `categories.delete` |
| Customers | `customers.create`, `customers.read`, `customers.update`, `customers.delete` |
| Orders | `orders.create`, `orders.read`, `orders.update`, `orders.delete` |
| Media | `media.create`, `media.read`, `media.delete` |
| Discounts | `discounts.create`, `discounts.read`, `discounts.update`, `discounts.delete` |
| Shipping | `shipping.create`, `shipping.read`, `shipping.update`, `shipping.delete` |
| Payment | `payment.create`, `payment.read`, `payment.update`, `payment.delete` |
| Tax | `tax.create`, `tax.read`, `tax.update`, `tax.delete` |
| Settings | `settings.read`, `settings.update` |
| Plugins | `plugins.manage` |
| Audit | `audit.read` |
| API Keys | `api_keys.manage` |

## Security

### Permission Subset

Managers can only create API keys with permissions they themselves have. For example, a manager with `products.read` and `orders.read` cannot create a key with `settings.update`. Admins and super admins can assign any permission.

### Key Limit

Each user can have a maximum of **10 active API keys**. Revoked keys do not count toward this limit.

### Ownership

Users can only see and revoke their own keys. Super admins can view all keys by passing `?all=true` on the list endpoint, and can revoke any key regardless of ownership.

Existing API keys created before the user-binding migration have `created_by = NULL` and are only visible to super admins via `?all=true`.

## MCP Server Usage

The primary use case for API keys is authenticating the Admin MCP Server:

```bash
# Set the API key as environment variable
export STOA_MCP_API_KEY=ck_your_key_here

# Run the Admin MCP Server
./stoa-admin-mcp
```

For Claude Desktop or other MCP clients, add the key to the server configuration:

```json
{
  "mcpServers": {
    "stoa-admin": {
      "command": "./stoa-admin-mcp",
      "env": {
        "STOA_MCP_API_KEY": "ck_your_key_here"
      }
    }
  }
}
```

::: tip Full Access
When creating a key for the MCP server, use the **MCP Full Access** preset in the Admin Panel to grant all permissions. This ensures the MCP server can perform any admin operation.
:::

## Store API Keys (Customer)

Customers can create their own API keys to allow AI agents and integrations to act on their behalf. Store keys use the prefix `sk_` and are scoped to store-level permissions only.

### Key Format

```
sk_a1b2c3d4e5f6...  (67 characters total)
```

### Authentication

```bash
curl http://localhost:8080/api/v1/store/products \
  -H 'Authorization: ApiKey sk_your_store_key_here'
```

### Create

Requires customer JWT authentication. Maximum **5 active keys** per customer.

```bash
curl -X POST http://localhost:8080/api/v1/store/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "My Shopping Agent",
    "permissions": ["store.products.read", "store.cart.manage", "store.checkout"]
  }'
```

**Response (201):**

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Shopping Agent",
    "key": "sk_a1b2c3d4e5f6...",
    "key_type": "store",
    "permissions": ["store.products.read", "store.cart.manage", "store.checkout"],
    "active": true,
    "customer_id": "customer-uuid",
    "created_at": "2026-03-22T12:00:00Z"
  }
}
```

::: warning Save the key immediately
The raw key (`sk_...`) is returned **only once**. Store it securely — it cannot be retrieved later.
:::

### List

```bash
curl http://localhost:8080/api/v1/store/api-keys \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200):**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "My Shopping Agent",
      "key_type": "store",
      "permissions": ["store.products.read", "store.cart.manage", "store.checkout"],
      "active": true,
      "customer_id": "customer-uuid",
      "last_used_at": "2026-03-22T14:30:00Z",
      "created_at": "2026-03-22T12:00:00Z"
    }
  ]
}
```

### Revoke

```bash
curl -X DELETE http://localhost:8080/api/v1/store/api-keys/{id} \
  -H "Authorization: Bearer $TOKEN"
```

Customers can only revoke their own keys.

### Store Permissions

| Permission | Description |
|-----------|-------------|
| `store.products.read` | Browse products and categories |
| `store.cart.manage` | Create carts, add/remove/update items |
| `store.checkout` | Complete checkout and place orders |
| `store.account.read` | View account details |
| `store.account.update` | Update account information |
| `store.orders.read` | View order history |

### Limits

- Maximum **5 active keys** per customer (admin keys allow 10)
- Store keys can only access `/api/v1/store/*` endpoints
- Permissions are validated against the available store permission set

### MCP Store Server Usage

Store API keys are designed for the Store MCP Server, enabling AI agents to shop on a customer's behalf:

```json
{
  "mcpServers": {
    "stoa-store": {
      "command": "./stoa-store-mcp",
      "env": {
        "STOA_MCP_API_KEY": "sk_your_store_key_here"
      }
    }
  }
}
```

## Admin Panel

The Admin Panel provides a graphical interface for API key management under **API Keys** in the sidebar.

1. **Create**: Click "New API Key", enter a name, select permissions (or use "MCP Full Access"), and click "Create"
2. **Copy**: The raw key is displayed in a success dialog — copy it immediately
3. **View**: The table shows all your keys with name, permission count, status, last used date, and creation date
4. **Revoke**: Click "Revoke" on any active key to permanently disable it
5. **Super Admin**: Toggle "Show all keys" to see keys from all users

## Storefront

Customers can manage their store API keys from the Storefront under **Account → API Keys** (`/account/api-keys`).

1. **Create**: Click "Create New Key", enter a name, select permissions, and click "Create"
2. **Copy**: The raw key is displayed once in a green banner — copy it immediately
3. **View**: Keys are shown as cards with name, creation date, last used date, and permission badges
4. **Revoke**: Click "Revoke" on any key to permanently disable it
5. **Limit**: A warning is shown when the 5-key maximum is reached
