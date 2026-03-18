# Security

Stoa ships with security defaults that protect both the Admin Panel and the Storefront against common web vulnerabilities.

## Content Security Policy (CSP)

Stoa enforces a **nonce-based Content Security Policy** on every HTML page response. This prevents cross-site scripting (XSS) by ensuring only explicitly trusted scripts can execute.

### How it works

Each time the Admin Panel or Storefront serves `index.html`, Stoa:

1. Generates a cryptographically random **128-bit nonce** (base64-encoded)
2. Injects the nonce into the `Content-Security-Policy` response header
3. Adds a `nonce` attribute to every `<script>` tag in the HTML

The resulting CSP header looks like:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-<random>' 'strict-dynamic';
  style-src 'self' 'unsafe-inline'
```

### `'strict-dynamic'`

The `'strict-dynamic'` directive means that any script loaded by a nonced (trusted) script automatically inherits trust. This is critical for the plugin system — plugins load Web Components and external scripts (e.g. Stripe's `js.stripe.com/v3/`) dynamically via `document.createElement('script')`, and `'strict-dynamic'` ensures these work without maintaining an explicit allowlist in `script-src`.

::: tip Plugin compatibility
Plugin developers do not need to do anything special for CSP. Scripts loaded dynamically from a trusted (nonced) bootstrap script inherit trust automatically via `'strict-dynamic'`.
:::

### Plugin external scripts

Plugins that declare `ExternalScripts` in their UI extensions still have their domains added to `script-src`, `frame-src`, and `connect-src` as a **CSP Level 2 fallback** for older browsers that don't support `'strict-dynamic'`.

### What stays `'unsafe-inline'`

`style-src` retains `'unsafe-inline'` because:

- Many CSS-in-JS patterns and framework-generated inline styles require it
- Inline styles do not pose the same XSS risk as inline scripts
- Noncing every `<style>` tag would add complexity without meaningful security gain

### API routes

API routes (`/api/v1/*`) use a separate, stricter CSP (`default-src 'self'`) since they return JSON, not HTML.

## File Upload Validation

Stoa validates uploaded files server-side using **magic byte detection**, preventing attackers from bypassing restrictions by spoofing the `Content-Type` header.

### How it works

When a file is uploaded via `POST /api/v1/admin/media`:

1. The first 512 bytes of the file are read
2. Go's [`http.DetectContentType`](https://pkg.go.dev/net/http#DetectContentType) inspects the magic bytes to determine the actual MIME type
3. The detected type is checked against an **allowlist** of permitted MIME types
4. If the type is not allowed, the request is rejected with `415 Unsupported Media Type`

The client-provided `Content-Type` header is **ignored** for type determination — the server always trusts the file content over the header.

### Allowed MIME types

| MIME Type | Description |
|-----------|-------------|
| `image/jpeg` | JPEG images |
| `image/png` | PNG images |
| `image/gif` | GIF images |
| `image/webp` | WebP images |
| `image/svg+xml` | SVG vector graphics |
| `application/pdf` | PDF documents |

::: tip Extending the allowlist
To allow additional file types, add entries to the `allowedMIMETypes` map in `internal/domain/media/handler.go`.
:::

### SVG handling

SVGs are detected by `http.DetectContentType` as `text/xml` or `text/plain` since they are XML-based text files. Stoa applies a special fallback: if the client header declares `image/svg+xml` and the detected type is `text/xml` or `text/plain`, the file is accepted as SVG.

### Error response

Rejected uploads return:

```json
{
  "errors": [
    {
      "code": "unsupported_media_type",
      "detail": "file type not allowed"
    }
  ]
}
```

## Database Connection Security

Stoa defaults to `sslmode=require` for PostgreSQL connections, ensuring credentials and query data are encrypted in transit. At startup, Stoa checks the connection's TLS configuration and logs a warning if SSL is disabled:

```
WRN database connection uses sslmode=disable — not recommended for production
```

For local development with Docker Compose, `sslmode=disable` is set via the `STOA_DATABASE_URL` environment variable — this is safe because traffic stays within Docker's internal bridge network.

See [Database SSL/TLS](/guide/configuration#database-ssl-tls) for all available SSL modes.

## Token Blacklisting

Stoa maintains an **in-memory blacklist** for revoked JWT access tokens. When a user logs out, the access token's JTI (unique token ID) is added to the blacklist, making it immediately unusable — even before the token's natural expiry.

### How it works

1. On logout, the access token from the `Authorization` header is parsed and its JTI + expiry time are stored in the blacklist
2. Both `Authenticate` and `OptionalAuth` middleware check the blacklist before accepting a Bearer token
3. Blacklisted tokens in `Authenticate` return `401 Unauthorized` with `"token has been revoked"`
4. Blacklisted tokens in `OptionalAuth` are treated as anonymous (the request continues without auth context)
5. A background goroutine cleans up expired entries every minute — since access tokens live at most 15 minutes, memory usage stays minimal

### Why in-memory?

Access tokens have a maximum lifetime of 15 minutes. An in-memory data structure with TTL-based cleanup is sufficient — there's no need for Redis or database storage. The blacklist is protected by a read-write mutex for concurrent access.

::: info Scaling note
In a multi-instance deployment, each instance maintains its own blacklist. A token blacklisted on one instance won't be rejected by another. For single-instance deployments (the typical Stoa setup), this is not an issue. For multi-instance setups, consider placing a shared cache (e.g. Redis) behind a custom middleware.
:::

## Rate Limiting

Stoa applies rate limiting at two levels:

### Global rate limit

A global IP-based rate limit applies to all API requests. The default is **300 requests per minute** per IP with a burst allowance of 50.

### Endpoint-specific rate limits

Sensitive endpoints have **dedicated, stricter rate limits** on top of the global limit. These protect against credential stuffing, account enumeration, and checkout abuse:

| Endpoint | Default Limit | Description |
|----------|--------------|-------------|
| `POST /api/v1/auth/login` | 10 req/min per IP | Prevents brute-force login attempts |
| `POST /api/v1/store/register` | 5 req/min per IP | Prevents mass account creation |
| `POST /api/v1/store/checkout` | 10 req/min per IP | Prevents checkout abuse |
| `GET /api/v1/store/orders/:id/transactions` | 10 req/min per IP | Prevents guest token guessing |

When the limit is exceeded, the server responds with `429 Too Many Requests` and includes a `Retry-After` header indicating how many seconds to wait before retrying.

```json
HTTP/1.1 429 Too Many Requests
Retry-After: 42

{
  "error": "Too Many Requests"
}
```

### Configuration

All rate limits are configurable in `config.yaml`:

```yaml
security:
  rate_limit:
    requests_per_minute: 300  # Global limit
    burst: 50
    login:
      requests_per_minute: 10
    register:
      requests_per_minute: 5
    checkout:
      requests_per_minute: 10
    guest_order:
      requests_per_minute: 10
```

Or via environment variables:

```bash
STOA_SECURITY_RATE_LIMIT_LOGIN_REQUESTS_PER_MINUTE=10
STOA_SECURITY_RATE_LIMIT_REGISTER_REQUESTS_PER_MINUTE=5
STOA_SECURITY_RATE_LIMIT_CHECKOUT_REQUESTS_PER_MINUTE=10
STOA_SECURITY_RATE_LIMIT_GUEST_ORDER_REQUESTS_PER_MINUTE=10
```

::: tip
Endpoint-specific limits are independent — exhausting the login limit does not affect `/refresh` or `/logout`. Each IP address has its own counter.
:::

::: info Brute-force protection
In addition to IP-based rate limiting, Stoa has **email-based brute-force protection** on the login endpoint: after 5 failed attempts for the same email, the account is locked for 60 minutes. This works in tandem with rate limiting — rate limits protect against credential stuffing across different emails, while brute-force protection guards individual accounts.
:::

## Guest Token Security

Guest orders use a cryptographically strong token for ownership verification. The token is never exposed in the API response body — it is delivered exclusively via an **HTTP-only cookie**.

### Token generation

Each guest checkout generates a **32-byte random token** using `crypto/rand`, hex-encoded to 64 characters. This provides 256 bits of entropy, making brute-force guessing infeasible.

### Cookie delivery

The guest token is set as the `stoa_guest_token` cookie on the checkout response:

| Attribute | Value | Reason |
|-----------|-------|--------|
| `HttpOnly` | `true` | Prevents JavaScript access (XSS protection) |
| `SameSite` | `Lax` | Allows payment provider redirects (e.g. Stripe 3D Secure) |
| `Secure` | Matches CSRF config | Set when serving over HTTPS |
| `Path` | `/api/v1/store` | Scoped to store API routes |
| `MaxAge` | 30 days | Covers typical order lifecycle |

The browser automatically includes this cookie on subsequent store API requests (e.g. fetching payment transactions), so guest ownership verification works transparently without exposing the token to client-side JavaScript.

### Store vs. Admin API

- **Store API** — The checkout response includes `"is_guest_order": true` instead of the raw token. The guest token cookie handles authentication.
- **Admin API** — Returns the full `guest_token` field for debugging and payment reconciliation.

## Authentication

See [Authentication](/api/authentication) for details on JWT access/refresh tokens, RBAC roles, and CSRF protection.

## CSRF Protection

Stoa uses the **Double Submit Cookie** pattern. State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) must include an `X-CSRF-Token` header matching the `csrf_token` cookie value. Requests with a `Bearer` token in the `Authorization` header are exempt.

## Password Hashing

All passwords are hashed with **Argon2id**, the recommended algorithm for password storage per OWASP guidelines.
