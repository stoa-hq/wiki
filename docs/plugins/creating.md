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
    DB     *pgxpool.Pool    // PostgreSQL connection pool
    Router chi.Router       // HTTP router for custom endpoints
    Hooks  *HookRegistry    // Event system
    Config map[string]interface{} // Plugin-specific config from config.yaml
    Logger zerolog.Logger   // Structured logger
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
    // ...
    return nil
}
```

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

// RegisterStoreMCPTools implements sdk.MCPStorePlugin.
// Called once at Store MCP server startup after core tools are registered.
func (p *Plugin) RegisterStoreMCPTools(srv any, client sdk.StoreAPIClient) {
    s := srv.(*server.MCPServer)

    tool := mcp.NewTool("store_my_plugin_action",
        mcp.WithDescription("Describe what the agent can do with this tool"),
        mcp.WithString("order_id",
            mcp.Description("UUID of the order"),
            mcp.Required(),
        ),
    )
    s.AddTool(tool, func(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
        data, err := client.Post("/plugins/myplugin/action", map[string]interface{}{
            "order_id": req.GetString("order_id", ""),
        })
        if err != nil {
            return mcp.NewToolResultError(err.Error()), nil
        }
        return mcp.NewToolResultText(string(data)), nil
    })
}
```

The `client` parameter (`sdk.StoreAPIClient`) makes authenticated HTTP requests to the Stoa API — the same server your plugin registered routes on in `Init`. No internal packages need to be imported.

::: info No changes to the MCP server binary needed
The Store MCP binary discovers `MCPStorePlugin` implementations automatically at startup. Installing your plugin with `stoa plugin install` is enough.
:::

## Error handling

If `Init` returns an error, the plugin is not registered and the error is propagated — Stoa will not start.

If an **after-hook** handler returns an error, it is logged but does not abort the operation. Use **before-hooks** if you need to cancel an operation.

## Next Steps

- [Installing Plugins](/plugins/installing) — install plugins via CLI
- [Plugin API](/plugins/api) — full reference for hooks, entities, and HookEvent
- [Payment Integration](/plugins/payment) — integrate a payment service provider
- [Shipping Providers](/plugins/shipping) — add custom shipping logic
