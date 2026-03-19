# Meilisearch Search Engine

The `stoa-plugin-meilisearch` plugin replaces the built-in PostgreSQL full-text search with [Meilisearch](https://www.meilisearch.com) — providing typo-tolerant, fast, and relevant search with multi-locale support. It implements the `sdk.SearchPlugin` interface, so the switch is fully transparent: the existing `/api/v1/store/search` endpoint works unchanged, and the Storefront search page requires no modifications.

## How it works

```
Frontend → GET /api/v1/store/search → search.Handler → search.Engine
                                                          ↓
                                          ┌───────────────┼──────────────┐
                                          │ PostgresEngine │ SDKAdapter  │
                                          │ (default)      │ → Plugin    │
                                          └────────────────┴─────────────┘
```

When the Meilisearch plugin is installed, Stoa detects it at startup and routes all search queries through Meilisearch instead of PostgreSQL. When the plugin is removed, search automatically falls back to PostgreSQL — no downtime, no code changes.

### Automatic Sync

Product and category changes are automatically synchronized to Meilisearch via entity lifecycle hooks:

- **Product create/update** → all locale variants indexed
- **Product delete** → all locale variants removed
- **Category create/update** → all locale variants indexed
- **Category delete** → all locale variants removed

Hook handlers run asynchronously (background goroutine with 30s timeout) so they never block the API request.

### Document Design

Each entity is stored as one document per locale:

- **Document ID**: `{entity_id}_{locale}` (e.g. `550e8400-e29b_de-DE`)
- **Products Index**: `{prefix}_products`
- **Categories Index**: `{prefix}_categories`

| Index | Searchable | Filterable | Sortable |
|-------|-----------|------------|----------|
| `{prefix}_products` | name, description, sku | locale, active, category_ids, price_gross | price_gross, created_at, name |
| `{prefix}_categories` | name, description | locale, active, parent_id | position, name |

## Prerequisites

- Meilisearch server v1.6+ running and accessible from the Stoa instance

Quick start with Docker:

```bash
docker run -d --name meilisearch \
  -p 7700:7700 \
  -e MEILI_MASTER_KEY=master-key \
  -v meili-data:/meili_data \
  getmeili/meilisearch:latest
```

## Installation

```bash
stoa plugin install meilisearch
```

Or manually via Go:

```bash
go get github.com/stoa-hq/stoa-plugins/meilisearch@latest
```

## Configuration

Add a `meilisearch` section to your `config.yaml`:

```yaml
plugins:
  meilisearch:
    host: "http://localhost:7700"
    api_key: "master-key"
    index_prefix: "stoa"        # optional, default: stoa
    sync_on_start: true         # optional, default: true
    batch_size: 500             # optional, default: 500
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `host` | string | — (required) | Meilisearch server URL |
| `api_key` | string | — (required) | Meilisearch API key (master or search key) |
| `index_prefix` | string | `stoa` | Prefix for Meilisearch index names |
| `sync_on_start` | bool | `true` | Run a full sync when Stoa starts |
| `batch_size` | int | `500` | Documents per batch during bulk indexing |

::: tip Index Prefix
Use a unique prefix per environment (e.g. `stoa_dev`, `stoa_prod`) if multiple Stoa instances share the same Meilisearch server.
:::

## Admin API

### Trigger Full Reindex

Re-indexes all active products and categories. Useful after bulk imports or schema changes.

```
POST /api/v1/admin/meilisearch/reindex
Authorization: Bearer <admin-token>
```

**Response**: `202 Accepted`

```json
{
  "data": {
    "status": "accepted",
    "message": "reindex started"
  }
}
```

The reindex runs asynchronously in the background. Progress is logged to the server console.

## Docker Compose

```yaml
services:
  stoa:
    image: ghcr.io/stoa-hq/stoa:latest
    ports:
      - "8080:8080"
    volumes:
      - ./config.yaml:/app/config.yaml
    depends_on:
      - postgres
      - meilisearch

  meilisearch:
    image: getmeili/meilisearch:latest
    ports:
      - "7700:7700"
    environment:
      MEILI_MASTER_KEY: "master-key"
    volumes:
      - meili-data:/meili_data

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: stoa
      POSTGRES_USER: stoa
      POSTGRES_PASSWORD: stoa
    volumes:
      - pg-data:/var/lib/postgresql/data

volumes:
  meili-data:
  pg-data:
```

## Verification

After starting Stoa with the plugin:

1. Check the logs for `"using plugin search engine"` and `"meilisearch plugin initialised"`
2. If `sync_on_start` is enabled, look for `"initial sync completed"`
3. Test the search endpoint:

```bash
curl "http://localhost:8080/api/v1/store/search?q=test&locale=de-DE"
```

4. Create or update a product — it should appear in search results within seconds

## Uninstalling

Remove the plugin and restart Stoa. Search automatically falls back to PostgreSQL full-text search.

```bash
stoa plugin remove meilisearch
```

::: info Meilisearch data
Removing the plugin does not delete data from Meilisearch. To clean up, either delete the Meilisearch indexes manually or remove the Docker volume.
:::

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `missing config section "meilisearch"` | Add the `meilisearch` block under `plugins:` in config.yaml |
| `connection refused` in logs | Verify that Meilisearch is running and reachable at the configured `host` |
| Search returns empty results | Trigger a manual reindex via the admin API |
| Stale results after product update | Check that the hook handlers are running (look for sync logs) |
