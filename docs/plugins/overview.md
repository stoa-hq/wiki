# Plugin System

Stoa has a built-in plugin system that lets you extend the platform without modifying core code.

Plugins can:

- **React to events** — e.g. send an email after an order
- **Prevent operations** — e.g. validate before a cart change
- **Provide custom API endpoints**
- **Access the database directly**

::: tip Claude Code Skill
Stoa includes a Claude Code skill for plugin development. Run `/plugin` in Claude Code to activate it — it provides the full SDK reference, all hook constants, entity types, and ready-to-use templates.
:::

## Plugin Interface

Every plugin implements the `sdk.Plugin` interface from `pkg/sdk`:

```go
type Plugin interface {
    Name() string
    Version() string
    Description() string
    Init(app *AppContext) error
    Shutdown() error
}
```

The `Init` method receives an `AppContext` with everything the plugin needs:

```go
type AppContext struct {
    DB     *pgxpool.Pool
    Router chi.Router
    Hooks  *HookRegistry
    Config map[string]interface{}
    Logger zerolog.Logger
}
```

## Example: Email on New Order

```go
package orderemail

import (
    "context"
    "github.com/epoxx-arch/stoa/internal/domain/order"
    "github.com/epoxx-arch/stoa/pkg/sdk"
)

type Plugin struct{ logger zerolog.Logger }

func New() *Plugin { return &Plugin{} }

func (p *Plugin) Name() string        { return "order-email" }
func (p *Plugin) Version() string     { return "1.0.0" }
func (p *Plugin) Description() string { return "Sends confirmation emails after orders" }
func (p *Plugin) Shutdown() error     { return nil }

func (p *Plugin) Init(app *sdk.AppContext) error {
    p.logger = app.Logger
    app.Hooks.On(sdk.HookAfterOrderCreate, func(ctx context.Context, event *sdk.HookEvent) error {
        o := event.Entity.(*order.Order)
        p.logger.Info().Str("order", o.OrderNumber).Msg("sending confirmation email")
        // send email here
        return nil
    })
    return nil
}
```

## Example: Minimum Order Value

Before-hooks can **prevent operations** by returning an error:

```go
func (p *Plugin) Init(app *sdk.AppContext) error {
    app.Hooks.On(sdk.HookBeforeCheckout, func(ctx context.Context, event *sdk.HookEvent) error {
        o := event.Entity.(*order.Order)
        if o.Total < 1000 { // prices in cents
            return fmt.Errorf("minimum order value: 10.00 EUR")
        }
        return nil
    })
    return nil
}
```

## Example: Custom API Endpoints

```go
func (p *Plugin) Init(app *sdk.AppContext) error {
    app.Router.Route("/api/v1/wishlist", func(r chi.Router) {
        r.Get("/", p.handleList)
        r.Post("/", p.handleAdd)
        r.Delete("/{id}", p.handleRemove)
    })
    return nil
}
```

## Installing a Plugin

Stoa provides a CLI command to install plugins. Run it from the Stoa source directory:

```bash
stoa plugin install n8n
# or with a full import path:
stoa plugin install github.com/stoa-hq/stoa-plugins/n8n
```

The command fetches the package, adds it to the auto-generated imports file, and rebuilds the binary. Restart Stoa afterwards to activate the plugin.

```bash
stoa plugin list    # show installed plugins
stoa plugin remove n8n  # uninstall
```

See [Installing Plugins](/plugins/installing) for the full reference.

## Self-registration

Plugins register themselves via `init()` — no changes to `app.go` are needed:

```go
func init() {
    sdk.Register(New())
}
```

Stoa automatically initialises every plugin that called `sdk.Register()` on startup.

## Available Hooks

| Hook | Timing | Can cancel? |
|------|--------|-------------|
| `product.before_create` | Before product creation | Yes |
| `product.after_create` | After product creation | No |
| `product.before_update` | Before product update | Yes |
| `product.after_update` | After product update | No |
| `product.before_delete` | Before product deletion | Yes |
| `product.after_delete` | After product deletion | No |
| `order.before_create` | Before order creation | Yes |
| `order.after_create` | After order creation | No |
| `order.before_update` | Before status change | Yes |
| `order.after_update` | After status change | No |
| `cart.before_add_item` | Before adding to cart | Yes |
| `cart.after_add_item` | After adding to cart | No |
| `cart.before_update_item` | Before quantity change | Yes |
| `cart.after_update_item` | After quantity change | No |
| `cart.before_remove_item` | Before item removal | Yes |
| `cart.after_remove_item` | After item removal | No |
| `customer.before_create` | Before customer registration | Yes |
| `customer.after_create` | After customer registration | No |
| `customer.before_update` | Before customer update | Yes |
| `customer.after_update` | After customer update | No |
| `category.before_create` | Before category creation | Yes |
| `category.after_create` | After category creation | No |
| `category.before_update` | Before category update | Yes |
| `category.after_update` | After category update | No |
| `category.before_delete` | Before category deletion | Yes |
| `category.after_delete` | After category deletion | No |
| `checkout.before` | Before checkout completion | Yes |
| `checkout.after` | After checkout completion | No |
| `payment.after_complete` | After successful payment | No |
| `payment.after_failed` | After failed payment | No |
| `warehouse.before_create` | Before warehouse creation | Yes |
| `warehouse.after_create` | After warehouse creation | No |
| `warehouse.before_update` | Before warehouse update | Yes |
| `warehouse.after_update` | After warehouse update | No |
| `warehouse.before_delete` | Before warehouse deletion | Yes |
| `warehouse.after_delete` | After warehouse deletion | No |
| `warehouse.before_stock_update` | Before manual stock change | Yes |
| `warehouse.after_stock_update` | After manual stock change | No |
| `warehouse.after_stock_deduct` | After order stock deduction | No |

**Before-hooks** execute before the database operation and can cancel it by returning an error. **After-hooks** execute afterwards — errors are only logged and do not abort the operation.

## Next Steps

- [Payment Integration](/plugins/payment) — integrate a payment service provider
