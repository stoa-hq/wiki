# Plugin API Reference

## Plugin Interface

```go
type Plugin interface {
    Name() string        // Unique name, e.g. "order-email"
    Version() string     // Semver, e.g. "1.0.0"
    Description() string // Short description
    Init(app *AppContext) error
    Shutdown() error
}
```

## AppContext

```go
type AppContext struct {
    DB     *pgxpool.Pool           // PostgreSQL connection pool
    Router chi.Router              // HTTP router for custom endpoints
    Hooks  *HookRegistry           // Event system
    Config map[string]interface{}  // Plugin-specific config from config.yaml
    Logger zerolog.Logger          // Structured logger
    Auth   *AuthHelper             // Authentication middleware and context helpers
}
```

## AuthHelper

The `Auth` field provides authentication middleware and context helpers so plugins can protect their HTTP endpoints without importing internal Stoa packages:

```go
type AuthHelper struct {
    OptionalAuth func(http.Handler) http.Handler  // Extracts auth if present, never blocks
    Required     func(http.Handler) http.Handler  // Requires valid token, returns 401 otherwise
    UserID       func(ctx context.Context) uuid.UUID // Authenticated user ID from context
    UserType     func(ctx context.Context) string    // "admin", "customer", or "api_key"
}
```

### Usage

```go
func (p *Plugin) Init(app *sdk.AppContext) error {
    app.Router.Route("/api/v1/store/myplugin", func(r chi.Router) {
        r.Use(app.Auth.Required)  // All routes require authentication
        r.Post("/action", p.handleAction(app.Auth))
    })
    return nil
}

func (p *Plugin) handleAction(auth *sdk.AuthHelper) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        userID := auth.UserID(r.Context())
        // Use userID to verify ownership...
    }
}
```

::: tip Use auth for store-facing routes
The plugin router is the root Chi router — it does **not** inherit the `OptionalAuth` middleware from Stoa's `/api/v1/store/*` group. Always apply `app.Auth.Required` or `app.Auth.OptionalAuth` explicitly to your plugin's store-facing routes.
:::

## HookRegistry

### Registering a handler

```go
app.Hooks.On(sdk.HookAfterOrderCreate, func(ctx context.Context, event *sdk.HookEvent) error {
    // ...
    return nil
})
```

### Dispatching a hook (from webhook handlers, etc.)

```go
app.Hooks.Dispatch(ctx, &sdk.HookEvent{
    Name:   sdk.HookAfterPaymentComplete,
    Entity: transaction,
})
```

## HookEvent

```go
type HookEvent struct {
    Name     string                 // Hook name constant
    Entity   interface{}            // The affected entity (type depends on hook)
    Changes  map[string]interface{} // Changed fields (before-update hooks)
    Metadata map[string]interface{} // Arbitrary extra data
}
```

Cast `Entity` to the concrete type for the hook you are handling:

```go
o := event.Entity.(*order.Order)
p := event.Entity.(*product.Product)
c := event.Entity.(*customer.Customer)
```

## Hook Constants

All constants are in `pkg/sdk/hooks.go`.

### Products

| Constant | Value | Entity type | Can cancel |
|----------|-------|-------------|------------|
| `HookBeforeProductCreate` | `product.before_create` | `*product.Product` | Yes |
| `HookAfterProductCreate` | `product.after_create` | `*product.Product` | No |
| `HookBeforeProductUpdate` | `product.before_update` | `*product.Product` | Yes |
| `HookAfterProductUpdate` | `product.after_update` | `*product.Product` | No |
| `HookBeforeProductDelete` | `product.before_delete` | `*product.Product` | Yes |
| `HookAfterProductDelete` | `product.after_delete` | `*product.Product` | No |

### Categories

| Constant | Value | Can cancel |
|----------|-------|------------|
| `HookBeforeCategoryCreate` | `category.before_create` | Yes |
| `HookAfterCategoryCreate` | `category.after_create` | No |
| `HookBeforeCategoryUpdate` | `category.before_update` | Yes |
| `HookAfterCategoryUpdate` | `category.after_update` | No |
| `HookBeforeCategoryDelete` | `category.before_delete` | Yes |
| `HookAfterCategoryDelete` | `category.after_delete` | No |

### Orders

| Constant | Value | Entity type | Can cancel |
|----------|-------|-------------|------------|
| `HookBeforeOrderCreate` | `order.before_create` | `*order.Order` | Yes |
| `HookAfterOrderCreate` | `order.after_create` | `*order.Order` | No |
| `HookBeforeOrderUpdate` | `order.before_update` | `*order.Order` | Yes |
| `HookAfterOrderUpdate` | `order.after_update` | `*order.Order` | No |

### Cart

| Constant | Value | Can cancel |
|----------|-------|------------|
| `HookBeforeCartAdd` | `cart.before_add_item` | Yes |
| `HookAfterCartAdd` | `cart.after_add_item` | No |
| `HookBeforeCartUpdate` | `cart.before_update_item` | Yes |
| `HookAfterCartUpdate` | `cart.after_update_item` | No |
| `HookBeforeCartRemove` | `cart.before_remove_item` | Yes |
| `HookAfterCartRemove` | `cart.after_remove_item` | No |

### Customers

| Constant | Value | Can cancel |
|----------|-------|------------|
| `HookBeforeCustomerCreate` | `customer.before_create` | Yes |
| `HookAfterCustomerCreate` | `customer.after_create` | No |
| `HookBeforeCustomerUpdate` | `customer.before_update` | Yes |
| `HookAfterCustomerUpdate` | `customer.after_update` | No |

### Checkout & Payment

| Constant | Value | Can cancel |
|----------|-------|------------|
| `HookBeforeCheckout` | `checkout.before` | Yes |
| `HookAfterCheckout` | `checkout.after` | No |
| `HookAfterPaymentComplete` | `payment.after_complete` | No |
| `HookAfterPaymentFailed` | `payment.after_failed` | No |

## BaseEntity

Shared fields available on all entities via `sdk.BaseEntity`:

```go
type BaseEntity struct {
    ID           uuid.UUID
    CreatedAt    time.Time
    UpdatedAt    time.Time
    CustomFields JSONB     // map[string]interface{}
    Metadata     JSONB
}
```

## MCPStorePlugin

Plugins can register additional tools on the **Store MCP server** by implementing the optional `MCPStorePlugin` interface:

```go
type MCPStorePlugin interface {
    Plugin
    RegisterStoreMCPTools(server any, client StoreAPIClient)
}
```

`RegisterStoreMCPTools` is called once at Store MCP server startup, after the built-in core tools are registered. The `server` parameter satisfies the `AddTool(mcp.Tool, server.ToolHandlerFunc)` method — use an interface assertion (see example below). The `client` parameter implements `StoreAPIClient`.

### Tool name convention

Tool names **must** use the prefix `store_{pluginName}_`. The MCP server enforces this at registration time — tools with incorrect prefixes are rejected and the plugin is skipped.

| Plugin name | Valid tool name |
|-------------|----------------|
| `stripe` | `store_stripe_create_payment_intent` |
| `paypal` | `store_paypal_checkout` |

### StoreAPIClient

A store-scoped HTTP client interface for making calls to the Stoa store API:

```go
type StoreAPIClient interface {
    Get(path string) ([]byte, error)
    Post(path string, body interface{}) ([]byte, error)
}
```

The client is restricted to `/api/v1/store/*` paths. Path validation rejects any attempt to reach admin or other endpoints. The validation pipeline applied to every path argument is:

1. **URL decoding** — the raw path is decoded with `url.PathUnescape` so that percent-encoded traversal sequences such as `%2e%2e` (`..`) or `%2f` (`/`) are expanded before any check is made.
2. **Path normalization** — `path.Clean` resolves `.`, `..`, and double slashes on the decoded path.
3. **Prefix enforcement** — the cleaned path must start with `/api/v1/store/`; anything else returns `access denied`.
4. **Defense-in-depth** — a final `..` substring check on the cleaned path guards against any remaining traversal attempt.

This prevents double-encoding bypass attacks where a raw path such as `/api/v1/store/%2e%2e/admin/users` would pass a naive prefix check but resolve to `/api/v1/admin/users` after the HTTP server decodes it.

### Plugin isolation

The MCP server applies two isolation layers to prevent plugins from interfering with built-in tools or other plugins:

1. **Tool name prefix enforcement**: plugins can only register tools named `store_{pluginName}_*`.
2. **Store-scoped API client**: the `StoreAPIClient` only allows requests to `/api/v1/store/*` paths.
3. **Panic recovery**: if a plugin panics during registration, the error is logged and the plugin is skipped — the MCP server continues to start.

### Example

```go
package myplugin

import (
    "context"

    "github.com/mark3labs/mcp-go/mcp"
    "github.com/mark3labs/mcp-go/server"
    "github.com/stoa-hq/stoa/pkg/sdk"
)

// toolAdder is satisfied by both *server.MCPServer and *mcp.ScopedMCPServer.
type toolAdder interface {
    AddTool(mcp.Tool, server.ToolHandlerFunc)
}

// RegisterStoreMCPTools implements sdk.MCPStorePlugin.
func (p *Plugin) RegisterStoreMCPTools(srv any, client sdk.StoreAPIClient) {
    s := srv.(toolAdder)

    tool := mcp.NewTool("store_myplugin_action",
        mcp.WithDescription("Does something useful for agents"),
        mcp.WithString("order_id", mcp.Required()),
    )
    s.AddTool(tool, func(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
        data, err := client.Post("/api/v1/store/myplugin/action", map[string]interface{}{
            "order_id": req.GetString("order_id", ""),
        })
        if err != nil {
            // Return a sanitized error — do not leak internal details to agents.
            return mcp.NewToolResultError("action failed"), nil
        }
        return mcp.NewToolResultText(string(data)), nil
    })
}
```

::: warning Use interface assertion, not concrete type
Use `srv.(toolAdder)` instead of `srv.(*server.MCPServer)`. The MCP server passes a scoped wrapper that enforces tool name prefixes. A concrete type assertion would panic.
:::

::: tip Plugin installer keeps both binaries in sync
`stoa plugin install` writes `plugins_generated.go` into both `cmd/stoa/` and `cmd/stoa-store-mcp/`, so your plugin's `init()` runs in the Store MCP server process as well. Both files are gitignored.
:::

## Custom Endpoints

Plugins can register routes on the Chi router:

```go
func (p *Plugin) Init(app *sdk.AppContext) error {
    app.Router.Route("/api/v1/my-plugin", func(r chi.Router) {
        r.Get("/", p.handleList)
        r.Post("/", p.handleCreate)
        r.Delete("/{id}", p.handleDelete)
    })
    return nil
}
```

The router is the same instance used by Stoa core, so global middleware (logging, rate limiting, CSRF) applies to all plugin routes.

### CSRF

Plugin endpoints follow the same CSRF rules as the rest of Stoa:

| Path pattern | CSRF required |
|---|---|
| `/plugins/{name}/webhooks/*` | No — exempt (authenticates via provider signature) |
| `/plugins/{name}/admin/*` | Yes, unless `Authorization` header is present |
| `/plugins/{name}/store/*` | Yes, unless `Authorization` header is present |
| `/api/v1/…` (custom API paths) | Yes, unless `Authorization` header is present |

State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) from cookie-authenticated clients must include the `X-CSRF-Token` header. See [CSRF Protection](/guide/security#csrf-protection) for details.
