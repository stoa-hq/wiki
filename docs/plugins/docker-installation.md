# Docker Plugin Installation

Stoa plugins are compiled into the Go binary at build time. When running Stoa via Docker, use the `PLUGINS` build argument to include plugins in your image.

::: tip When to use this
This page is for **Docker / self-hosting** users. If you're building from source, use the [CLI installer](/plugins/installing) instead.
:::

## Quick Start

Build a Stoa image with plugins:

```bash
docker compose build --build-arg PLUGINS=stripe,n8n
docker compose up -d
```

Or set `STOA_PLUGINS` in your `.env` file:

```env
STOA_PLUGINS=stripe,n8n
```

Then build as usual:

```bash
docker compose build
docker compose up -d
```

## Build Argument

The `PLUGINS` build argument accepts a comma-separated list of plugin names:

```bash
# Short names (official plugins)
docker build --build-arg PLUGINS=stripe,n8n -t stoa .

# Full Go import paths (community plugins)
docker build --build-arg PLUGINS=github.com/example/my-stoa-plugin -t stoa .

# Mixed
docker build --build-arg PLUGINS=stripe,github.com/example/my-plugin -t stoa .
```

Without `PLUGINS`, the image is built without any plugins — identical to the default behavior.

## Local Plugins

If you have a custom plugin in a local directory, place it inside the Stoa source tree and reference it with a relative path:

```
stoa/
├── plugins/
│   └── myplugin/       ← your custom plugin
│       ├── plugin.go
│       └── ...
├── cmd/
├── internal/
└── go.mod
```

```bash
docker build --build-arg PLUGINS=stripe,./plugins/myplugin -t stoa .
```

The script detects local paths (starting with `./`) and handles them differently from remote packages:

- **Same Go module** (no `go.mod` in plugin dir): The import path is derived from the Stoa module path (e.g. `github.com/stoa-hq/stoa/plugins/myplugin`).
- **Separate Go module** (`go.mod` in plugin dir): A `replace` directive is added automatically so the build resolves the module locally.

::: warning Build context
The plugin directory must be inside the Docker build context. Paths outside the Stoa root (e.g. `../my-plugin`) won't work because Docker can't access files outside the context. Copy or symlink the plugin into the source tree before building.
:::

## Official Plugin Short Names

| Short Name | Package |
|------------|---------|
| `stripe` | `github.com/stoa-hq/stoa-plugins/stripe` |
| `n8n` | `github.com/stoa-hq/stoa-plugins/n8n` |

Any name not in this list is treated as a full Go import path.

## Docker Compose

The default `docker-compose.yaml` supports the `STOA_PLUGINS` environment variable:

```yaml
stoa:
  build:
    context: .
    args:
      PLUGINS: "${STOA_PLUGINS:-}"
```

Set `STOA_PLUGINS` in your `.env` file or pass it directly:

```bash
# Via .env file
echo 'STOA_PLUGINS=stripe,n8n' >> .env
docker compose build

# Via environment variable
STOA_PLUGINS=stripe docker compose build

# Via --build-arg (overrides .env)
docker compose build --build-arg PLUGINS=stripe,n8n
```

## Plugin Configuration

After building with plugins, configure them in `config.yaml` or via environment variables:

```yaml
plugins:
  stripe:
    secret_key: "sk_test_..."
    webhook_secret: "whsec_..."
  n8n:
    webhook_base_url: "http://n8n:5678/webhook/stoa"
    secret: "change-me"
```

Or via environment variables:

```bash
STOA_PLUGINS_STRIPE_SECRET_KEY=sk_test_...
STOA_PLUGINS_STRIPE_WEBHOOK_SECRET=whsec_...
```

Refer to individual plugin pages for all configuration options:
- [Stripe Payments](/plugins/stripe)
- [n8n Workflows](/plugins/n8n)

## How It Works

The `PLUGINS` build argument triggers `scripts/docker-plugins.sh` in the Go builder stage. The script:

1. Resolves short names to full Go import paths
2. Runs `go get <package>@latest` for each plugin
3. Generates `plugins_generated.go` with blank imports
4. Runs `go mod tidy` to resolve dependencies

The Go binary is then compiled with the plugins included. The resulting runtime image (Alpine minimal) contains only the binary — no Go toolchain required.

## Troubleshooting

### Plugin not found during build

If `go get` fails, verify the plugin package exists and is accessible:

```bash
go list -m github.com/stoa-hq/stoa-plugins/stripe@latest
```

### Updating plugins

Rebuild the image to pull the latest plugin versions:

```bash
docker compose build --no-cache
```

### Verifying installed plugins

Check the logs on startup — Stoa lists all registered plugins:

```bash
docker compose logs stoa | head -20
```

## Next Steps

- [Installing Plugins (CLI)](/plugins/installing) — for source builds
- [Creating a Plugin](/plugins/creating) — build your own plugin
- [Stripe Payments](/plugins/stripe) — configure the Stripe plugin
- [n8n Workflows](/plugins/n8n) — configure the n8n integration
