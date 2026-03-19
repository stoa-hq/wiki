# Creating a Plugin

This guide walks through building a plugin from scratch.

## 1. Create the directory

```bash
mkdir -p plugins/myplugin
```

## 2. Implement the Plugin interface

Every plugin must implement `sdk.Plugin` from `pkg/sdk`:

```go
package myplugin

import (
    "github.com/epoxx-arch/stoa/pkg/sdk"
)

type Plugin struct{}

func New() *Plugin { return &Plugin{} }

func (p *Plugin) Name() string        { return "my-plugin" }
func (p *Plugin) Version() string     { return "1.0.0" }
func (p *Plugin) Description() string { return "Does something useful" }
func (p *Plugin) Shutdown() error     { return nil }

func (p *Plugin) Init(app *sdk.AppContext) error {
    app.Logger.Info().Msg("my-plugin initialized")
    return nil
}
```

The `Name()` return value must be unique across all registered plugins.

## 3. Use the AppContext

`Init` receives an `AppContext` with everything your plugin needs:

```go
type AppContext struct {
    DB          *pgxpool.Pool           // PostgreSQL connection pool
    Router      chi.Router              // HTTP router for custom endpoints
    AssetRouter chi.Router              // Mounted at /plugins/{name}/assets/
    Hooks       *HookRegistry           // Event system
    Config      map[string]interface{}  // Plugin-specific config from config.yaml
    Logger      zerolog.Logger          // Structured logger
    Auth        *AuthHelper             // Authentication middleware and context helpers
}
```

Store what you need as fields on your plugin struct:

```go
type Plugin struct {
    db     *pgxpool.Pool
    logger zerolog.Logger
}

func (p *Plugin) Init(app *sdk.AppContext) error {
    p.db = app.DB
    p.logger = app.Logger

    // Protect store-facing routes with authentication.
    app.Router.Route("/api/v1/store/myplugin", func(r chi.Router) {
        r.Use(app.Auth.Required)
        r.Post("/action", p.handleAction(app.Auth))
    })
    return nil
}
```

::: tip Always apply auth middleware
The plugin router is the root Chi router — it does **not** inherit Stoa's store middleware. Use `app.Auth.Required` or `app.Auth.OptionalAuth` on your store-facing routes.
:::

### CSRF and webhooks

Plugin routes follow the same CSRF rules as the rest of Stoa:

- **Admin and store endpoints** (`/plugins/{name}/admin/*`, `/plugins/{name}/store/*`) require the `X-CSRF-Token` header on `POST`, `PUT`, `PATCH`, and `DELETE` requests when the client authenticates via cookie. Clients using an `Authorization` header are exempt.
- **Webhook endpoints** (`/plugins/{name}/webhooks/*`) are CSRF-exempt. Webhooks authenticate via provider-specific signatures (e.g. Stripe HMAC), not cookies.

Register your webhook handler under the `/webhooks/` sub-path to get the exemption automatically:

```go
func (p *Plugin) Init(app *sdk.AppContext) error {
    // Webhook endpoint — CSRF-exempt, authenticated by Stripe HMAC signature.
    app.Router.Post("/plugins/my-plugin/webhooks/stripe", p.handleStripeWebhook)

    // Admin endpoint — requires X-CSRF-Token (or Authorization header).
    app.Router.Route("/plugins/my-plugin/admin", func(r chi.Router) {
        r.Use(app.Auth.Required)
        r.Get("/settings", p.handleGetSettings)
    })
    return nil
}
```

::: danger Do not put webhook handlers outside `/webhooks/`
A webhook handler registered at `/plugins/my-plugin/stripe-hook` (no `webhooks` segment) is **not** CSRF-exempt. Incoming POST requests from payment providers would be rejected with `403 Forbidden` because they carry no `X-CSRF-Token` header.
:::

## 4. Self-register via init()

Add an `init()` function that calls `sdk.Register`. Stoa will automatically initialise your plugin on startup — no changes to `app.go` needed:

```go
func init() {
    sdk.Register(New())
}
```

When users install your plugin with `stoa plugin install`, the blank import triggers this `init()` and your plugin is active after a restart.

## 5. Pass configuration (optional)

Plugin-specific config can be read from `config.yaml` and passed via `AppContext.Config`:

```go
appCtx := &plugin.AppContext{
    // ...
    Config: map[string]interface{}{
        "webhook_url": cfg.Plugins["myplugin"]["webhook_url"],
    },
}
```

Inside the plugin:

```go
func (p *Plugin) Init(app *sdk.AppContext) error {
    url, _ := app.Config["webhook_url"].(string)
    p.webhookURL = url
    return nil
}
```

## 6. Add Store MCP tools (optional)

If your plugin needs to expose tools to AI agents via the **Store MCP server**, implement the `MCPStorePlugin` interface. This is separate from the HTTP routes registered in `Init` — it targets the MCP protocol used by Claude and other agents.

```go
package myplugin

import (
    "context"

    "github.com/mark3labs/mcp-go/mcp"
    "github.com/mark3labs/mcp-go/server"
    "github.com/stoa-hq/stoa/pkg/sdk"
)

// toolAdder is satisfied by both *server.MCPServer and the scoped wrapper.
type toolAdder interface {
    AddTool(mcp.Tool, server.ToolHandlerFunc)
}

// RegisterStoreMCPTools implements sdk.MCPStorePlugin.
// Called once at Store MCP server startup after core tools are registered.
func (p *Plugin) RegisterStoreMCPTools(srv any, client sdk.StoreAPIClient) {
    s := srv.(toolAdder)

    tool := mcp.NewTool("store_myplugin_action",
        mcp.WithDescription("Describe what the agent can do with this tool"),
        mcp.WithString("order_id",
            mcp.Description("UUID of the order"),
            mcp.Required(),
        ),
    )
    s.AddTool(tool, func(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
        data, err := client.Post("/api/v1/store/myplugin/action", map[string]interface{}{
            "order_id": req.GetString("order_id", ""),
        })
        if err != nil {
            return mcp.NewToolResultError("action failed"), nil
        }
        return mcp.NewToolResultText(string(data)), nil
    })
}
```

Key conventions:

- **Tool names** must use the prefix `store_{pluginName}_` (e.g. `store_myplugin_action`). The MCP server enforces this.
- **Interface assertion**: use `srv.(toolAdder)` — not `srv.(*server.MCPServer)`. The server passes a scoped wrapper.
- **Store-scoped client**: the `client` only allows requests to `/api/v1/store/*` paths. Paths are URL-decoded and normalized before the prefix check, so percent-encoded traversal sequences (`%2e%2e`, `%2f`) are also rejected.
- **Sanitize errors**: return generic messages to MCP consumers — do not leak internal details via `err.Error()`.

::: info No changes to the MCP server binary needed
The Store MCP binary discovers `MCPStorePlugin` implementations automatically at startup. Installing your plugin with `stoa plugin install` is enough. If a plugin panics during registration, it is skipped and the server continues to start.
:::

## Error handling

If `Init` returns an error, the plugin is not registered and the error is logged — Stoa skips the plugin and continues starting.

If a plugin panics during registration (in `Name()`, `Init()`, or any other interface method), Stoa recovers the panic, converts it to an error, and skips the plugin. The server continues to start normally and other plugins are not affected.

::: warning Panics are caught — but fix them
Panic recovery is a safety net, not an expected code path. A plugin that panics during registration will not be available at runtime. Check the server logs for `plugin panicked during registration` messages.
:::

If an **after-hook** handler returns an error, it is logged but does not abort the operation. Use **before-hooks** if you need to cancel an operation.

## Next Steps

- [Installing Plugins](/plugins/installing) — install plugins via CLI
- [Plugin API](/plugins/api) — full reference for hooks, entities, and HookEvent
- [UI Extensions](/plugins/ui-extensions) — add custom UI to Admin and Storefront
- [Payment Integration](/plugins/payment) — integrate a payment service provider
- [Shipping Providers](/plugins/shipping) — add custom shipping logic
