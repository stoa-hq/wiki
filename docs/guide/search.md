# Search

Stoa provides a pluggable search architecture. Out of the box, PostgreSQL full-text search powers the search endpoint. Plugins can transparently replace the search engine with external providers like Meilisearch, Algolia, or Typesense — without any frontend changes.

## Architecture

```
Frontend → GET /api/v1/store/search → search.Handler → search.Engine
                                                          ↓
                                          ┌───────────────┼──────────────┐
                                          │ PostgresEngine │ SDKAdapter  │
                                          │ (default)      │ → Plugin    │
                                          └────────────────┴─────────────┘
```

The `search.Engine` interface defines the contract:

```go
type Engine interface {
    Search(ctx context.Context, req SearchRequest) (*SearchResponse, error)
    Index(ctx context.Context, entityType string, id string, data map[string]interface{}) error
    Remove(ctx context.Context, entityType string, id string) error
}
```

At startup, Stoa checks if any registered plugin implements `sdk.SearchPlugin`. If found, the plugin's engine is used. Otherwise, PostgreSQL full-text search is the default.

## Search API

```
GET /api/v1/store/search?q=laptop&locale=de-DE&page=1&limit=25&type=product
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | — (required) | Search query |
| `locale` | string | `Accept-Language` header | Locale for results |
| `page` | int | `1` | Page number |
| `limit` | int | `25` | Results per page (max 100) |
| `type` | string | all types | Filter by entity type: `product`, `category` |

### Response

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "product",
      "score": 0.95,
      "title": "Gaming Laptop",
      "description": "High-end gaming laptop with...",
      "slug": "gaming-laptop"
    },
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "type": "category",
      "score": 0.72,
      "title": "Electronics",
      "description": "All electronic products",
      "slug": "electronics"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 25,
    "pages": 2
  }
}
```

## Default: PostgreSQL Full-Text Search

The built-in search engine requires no configuration. It uses PostgreSQL's `to_tsvector` / `plainto_tsquery` with locale-aware text search configurations.

**Supported languages**: German, English, French, Spanish, Italian, Portuguese.

The PostgreSQL engine searches the `product_translations` table, matching against product names and descriptions. The `Index()` and `Remove()` methods are no-ops since the data is already in the database.

::: info When to use a search plugin
PostgreSQL full-text search is sufficient for small to medium catalogs. For larger catalogs or when you need typo tolerance, faceted search, or sub-millisecond response times, consider a dedicated search engine like [Meilisearch](/plugins/meilisearch).
:::

## Plugin Search Engines

### SDK Interface

Any plugin implementing `sdk.SearchPlugin` can replace the default search engine:

```go
// SearchPlugin — optional interface for search provider plugins.
type SearchPlugin interface {
    Plugin
    SearchEngine() SearchEngine
}

// SearchEngine mirrors internal/search.Engine for external plugins.
type SearchEngine interface {
    Search(ctx context.Context, req SearchRequest) (*SearchResponse, error)
    Index(ctx context.Context, entityType string, id string, data map[string]interface{}) error
    Remove(ctx context.Context, entityType string, id string) error
}
```

The first registered `SearchPlugin` wins. If multiple search plugins are installed, only the first one (by registration order) is used.

### Available Providers

| Provider | Plugin | Status |
|----------|--------|--------|
| PostgreSQL | Built-in | Default |
| [Meilisearch](/plugins/meilisearch) | `stoa-plugin-meilisearch` | Available |

### Building a Custom Search Plugin

To build your own search provider (e.g. Algolia, Typesense, Elasticsearch):

1. **Create a Go module** implementing `sdk.SearchPlugin`
2. **Implement `SearchEngine()`** returning your `sdk.SearchEngine`
3. **Handle `Search`**: translate `sdk.SearchRequest` to your provider's API, map results back to `sdk.SearchResult`
4. **Handle `Index`**: called by hooks when entities change — update your provider's index
5. **Handle `Remove`**: called on entity deletion — remove documents from your provider
6. **Register** with `sdk.Register(New())` in your `init()` function
7. **Install** with `stoa plugin install ./your-plugin`

```go
package mysearch

import (
    "context"
    "github.com/stoa-hq/stoa/pkg/sdk"
)

type Plugin struct {
    engine *MyEngine
}

func New() *Plugin { return &Plugin{} }
func init()       { sdk.Register(New()) }

func (p *Plugin) Name() string        { return "mysearch" }
func (p *Plugin) Version() string     { return "0.1.0" }
func (p *Plugin) Description() string { return "My custom search engine" }

func (p *Plugin) SearchEngine() sdk.SearchEngine { return p.engine }

func (p *Plugin) Init(app *sdk.AppContext) error {
    // Initialize your search client from app.Config
    p.engine = NewMyEngine(app.Config)
    return nil
}

func (p *Plugin) Shutdown() error { return nil }
```

See the [Meilisearch plugin](/plugins/meilisearch) source code for a complete reference implementation with hook-based synchronization, batch indexing, and admin reindex endpoint.

## Storefront Search

The Storefront search page (`/search`) uses the search API endpoint and supports:

- **Multi-type results**: products and categories in a single query
- **Type filtering**: filter by "All", "Products", or "Categories"
- **Locale-aware**: passes the current locale from svelte-i18n to the API
- **Pagination**: page through results

The search page is provider-agnostic — it works identically with PostgreSQL or any search plugin.
