# Configuration

All settings are stored in `config.yaml`. Copy the example to get started:

```bash
cp config.example.yaml config.yaml
```

Settings can also be overridden via environment variables with the `STOA_` prefix:

```bash
STOA_DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=require"
STOA_AUTH_JWT_SECRET="a-secure-secret"
STOA_SERVER_PORT=8080
```

## Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `server.port` | `8080` | HTTP port |
| `database.url` | `postgres://stoa:secret@localhost:5432/stoa` | PostgreSQL connection string |
| `auth.jwt_secret` | `change-me-in-production` | JWT signing key |
| `media.storage` | `local` | Media storage (`local` or `s3`) |
| `media.local_path` | `./uploads` | Local upload path |
| `i18n.default_locale` | `de-DE` | Default language |
| `server.max_body_size` | `1048576` (1 MB) | Max request body size for JSON endpoints (bytes) |
| `server.max_upload_size` | `36700160` (35 MB) | Max request body size for multipart/file uploads (bytes) |
| `payment.encryption_key` | *(required)* | AES-256 key for payment config encryption (32 bytes or 64 hex chars) |

## Request Body Limits

Stoa limits incoming request body sizes to prevent memory exhaustion from oversized payloads. Two tiers are applied automatically based on `Content-Type`:

- **JSON / default** — `server.max_body_size` (default: 1 MB). Applied to all `POST`, `PUT`, `PATCH`, and `DELETE` requests that are not multipart.
- **Multipart / uploads** — `server.max_upload_size` (default: 35 MB). Applied when `Content-Type` starts with `multipart/form-data`.

`GET`, `HEAD`, and `OPTIONS` requests are not affected.

Requests exceeding the limit receive a `413 Request Entity Too Large` response with error code `body_too_large`. HTTP request headers are additionally capped at 1 MB via `MaxHeaderBytes`.

Override via environment variables:

```bash
STOA_SERVER_MAX_BODY_SIZE=2097152    # 2 MB
STOA_SERVER_MAX_UPLOAD_SIZE=52428800 # 50 MB
```

Or in `config.yaml`:

```yaml
server:
  max_body_size: 2097152
  max_upload_size: 52428800
```

## Payment Encryption Key

The `payment.encryption_key` is required to encrypt provider credentials (API keys, secrets) stored in payment methods. Set it before the first run:

```bash
# Generate a random 64-character hex key
openssl rand -hex 32
```

Set via environment variable:

```bash
STOA_PAYMENT_ENCRYPTION_KEY="your-64-char-hex-key"
```

::: warning
Never commit your `config.yaml` to version control if it contains real secrets. Use environment variables in production.
:::

## Database SSL/TLS

The `database.url` connection string supports a `sslmode` parameter that controls whether the connection to PostgreSQL is encrypted:

| Mode | Description |
|------|-------------|
| `disable` | No TLS — credentials and data sent in plaintext |
| `require` | TLS required — connection fails if the server doesn't support it |
| `verify-ca` | TLS + server certificate verified against a CA |
| `verify-full` | TLS + server certificate verified + hostname match |

The default in `config.example.yaml` is `sslmode=require`. Use `sslmode=disable` only for local development (e.g. Docker Compose with a local PostgreSQL container).

```yaml
database:
  url: "postgres://stoa:secret@localhost:5432/stoa?sslmode=require"
```

Stoa logs a warning at startup when `sslmode=disable` is detected:

```
WRN database connection uses sslmode=disable — not recommended for production
```

::: warning
Never use `sslmode=disable` in production. Even within private networks, TLS protects against credential sniffing and man-in-the-middle attacks.
:::

## CLI Reference

```bash
stoa serve                  # Start HTTP server
stoa migrate up             # Run migrations
stoa migrate down           # Roll back last migration
stoa admin create           # Create admin user
  --email admin@example.com
  --password your-password
stoa seed --demo            # Load demo data
stoa plugin list            # List installed plugins
stoa version                # Print version
```
