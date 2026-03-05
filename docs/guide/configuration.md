# Configuration

All settings are stored in `config.yaml`. Copy the example to get started:

```bash
cp config.example.yaml config.yaml
```

Settings can also be overridden via environment variables with the `STOA_` prefix:

```bash
STOA_DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=disable"
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
| `payment.encryption_key` | *(required)* | AES-256 key for payment config encryption (32 bytes or 64 hex chars) |

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
