# Authentication

Stoa supports three authentication methods: **JWT tokens** (for admin and customer sessions), **API keys** (for programmatic access), and **CSRF protection** (for browser-based requests).

## JWT Authentication

### Login

Obtain an access token and refresh token by posting credentials to the login endpoint. Both admin users and customers share the same endpoint.

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "admin@example.com", "password": "your-password"}'
```

**Response:**

```json
{
  "data": {
    "access_token": "eyJhbG...",
    "refresh_token": "eyJhbG...",
    "expires_in": 900,
    "token_type": "Bearer"
  }
}
```

| Field | Description |
|-------|-------------|
| `access_token` | Short-lived token (15 min) for API requests |
| `refresh_token` | Long-lived token (7 days) for obtaining new access tokens |
| `expires_in` | Access token lifetime in seconds |

Use the access token in the `Authorization` header:

```bash
curl http://localhost:8080/api/v1/admin/products \
  -H 'Authorization: Bearer <access_token>'
```

### Refresh Token Rotation

Stoa implements **refresh token rotation** with **reuse detection**. Each refresh token can only be used once. When you refresh, the old token is invalidated and a new token pair is issued.

```bash
curl -X POST http://localhost:8080/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token": "<your_refresh_token>"}'
```

**Response:**

```json
{
  "data": {
    "access_token": "eyJhbG...",
    "refresh_token": "eyJhbG...",
    "expires_in": 900,
    "token_type": "Bearer"
  }
}
```

::: warning Important
Always discard the old refresh token after a successful refresh and use the new one from the response. Attempting to reuse an already-consumed refresh token triggers **reuse detection**, which revokes the entire token family and forces a new login.
:::

#### How Token Families Work

Every login creates a **token family** — a chain of refresh tokens linked to the same session. When a refresh token is used:

1. The server marks it as consumed
2. A new refresh token is issued in the same family
3. New access + refresh tokens are returned

If an attacker steals and replays an old refresh token:

1. The server detects the token was already consumed
2. **All tokens in that family are revoked** (including the legitimate user's current token)
3. Both the attacker and the legitimate user must log in again

This limits the damage window of a stolen refresh token to a single use.

### Logout

Revoke all active tokens for the current session:

```bash
# With refresh token in body (preferred)
curl -X POST http://localhost:8080/api/v1/auth/logout \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token": "<your_refresh_token>"}'

# Or with Authorization header (when logged in)
curl -X POST http://localhost:8080/api/v1/auth/logout \
  -H 'Authorization: Bearer <access_token>'

# Both (recommended — revokes access + refresh tokens)
curl -X POST http://localhost:8080/api/v1/auth/logout \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token": "<your_refresh_token>"}'
```

Logout performs two actions:

1. **Blacklists the access token** — the token's JTI is added to an in-memory blacklist, making it immediately unusable. Both `Authenticate` and `OptionalAuth` middleware reject blacklisted tokens.
2. **Revokes all refresh tokens** for the user, preventing new access tokens from being issued.

::: tip Immediate invalidation
Unlike many JWT implementations where access tokens remain valid until they expire, Stoa blacklists the access token on logout so it is rejected immediately. The blacklist is automatically cleaned up as tokens expire (max 15 minutes).

### JWT Claims

Stoa JWTs contain the following claims:

| Claim | Description |
|-------|-------------|
| `uid` | User UUID |
| `email` | User email |
| `utype` | `admin` or `customer` |
| `role` | RBAC role (`super_admin`, `admin`, `manager`, `customer`) |
| `type` | Token type (`access` or `refresh`) |
| `jti` | Unique token ID |
| `exp` | Expiration timestamp |

### Brute Force Protection

The login endpoint implements rate limiting. After too many failed attempts, the account is temporarily locked. The response includes a `Retry-After` header indicating when the next attempt is allowed.

```json
{
  "errors": [{"code": "account_locked", "detail": "too many failed login attempts, please try again later"}]
}
```

## API Keys

API keys provide programmatic access for MCP servers, integrations, and scripts. They use the `ApiKey` scheme instead of `Bearer`.

```bash
curl http://localhost:8080/api/v1/admin/products \
  -H 'Authorization: ApiKey ck_your_api_key_here'
```

### Managing API Keys

Only `super_admin` and `admin` roles can create and manage API keys.

```bash
# Create a new API key
curl -X POST http://localhost:8080/api/v1/admin/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "My Integration Key",
    "permissions": ["products.read", "orders.read"]
  }'

# List all API keys
curl http://localhost:8080/api/v1/admin/api-keys \
  -H "Authorization: Bearer $TOKEN"

# Revoke an API key
curl -X DELETE http://localhost:8080/api/v1/admin/api-keys/{id} \
  -H "Authorization: Bearer $TOKEN"
```

::: tip
The raw API key is shown only once when created. Store it securely.
:::

### Available Permissions

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

## RBAC Roles

| Role | Access |
|------|--------|
| `super_admin` | Full access, can manage API keys and admin users |
| `admin` | Full access, can manage API keys |
| `manager` | Admin API access with limited management capabilities |
| `customer` | Store API access only |
| `api_client` | Scoped by API key permissions |

## CSRF Protection

Browser-based requests that modify state (POST, PUT, PATCH, DELETE) require CSRF protection using the **Double Submit Cookie** pattern.

Stoa sets a `csrf_token` cookie. Include its value in the `X-CSRF-Token` header:

```javascript
const csrfToken = document.cookie
  .split('; ')
  .find(row => row.startsWith('csrf_token='))
  ?.split('=')[1];

fetch('/api/v1/store/cart/items', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify({ product_id: '...', quantity: 1 })
});
```

::: info
Requests with an `Authorization: Bearer` header are exempt from CSRF checks, since they are not vulnerable to CSRF attacks.
:::

## Two API Surfaces

| Surface | Base Path | Authentication |
|---------|-----------|----------------|
| Admin API | `/api/v1/admin/*` | Required (JWT or API key) |
| Store API | `/api/v1/store/*` | Optional (enriches context for customer features) |
| Auth | `/api/v1/auth/*` | None |

The **Store API** uses optional authentication — unauthenticated requests work for browsing products and managing carts, while authenticated requests enable customer-specific features like order history.

## Error Responses

Authentication errors follow the standard Stoa error format:

```json
{
  "errors": [
    {"code": "invalid_credentials", "detail": "invalid email or password"},
    {"code": "invalid_token", "detail": "invalid refresh token"},
    {"code": "unauthorized", "detail": "missing authorization header"},
    {"code": "unauthorized", "detail": "token has been revoked"},
    {"code": "account_locked", "detail": "too many failed login attempts, please try again later"}
  ]
}
```

| HTTP Status | Meaning |
|-------------|---------|
| `401 Unauthorized` | Missing, invalid, or expired credentials |
| `403 Forbidden` | Valid credentials but insufficient role/permissions |
| `429 Too Many Requests` | Brute force protection triggered |
