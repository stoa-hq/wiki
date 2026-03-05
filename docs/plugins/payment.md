# Payment Integration

Stoa provides a flexible payment architecture that separates *payment methods* (stored in the database) from *payment processing* (implemented as plugins).

## Architecture

```
┌──────────────┐       ┌──────────────┐       ┌────────────────────┐
│  Storefront  │──────▶│  Stoa API    │──────▶│  PSP Plugin        │
│  (Checkout)  │       │  /checkout   │       │  (e.g. Stripe)     │
└──────────────┘       └──────┬───────┘       └────────┬───────────┘
                              │                        │
                     ┌────────▼────────┐      ┌────────▼───────────┐
                     │ PaymentMethod   │      │ Stripe API         │
                     │ (DB: config,    │      │ (external)         │
                     │  provider name) │      └────────────────────┘
                     └─────────────────┘
```

1. A **PaymentMethod** record stores the provider name (e.g. `"stripe"`) and encrypted credentials in the `config` field.
2. A **PSP plugin** hooks into checkout, reads the decrypted config, and calls the external API.
3. The plugin creates **PaymentTransaction** records to track the outcome.

## Integration Checklist

| Step | What | Where |
|------|------|-------|
| 1 | Create plugin struct implementing `sdk.Plugin` | `plugins/<provider>/plugin.go` |
| 2 | Define a `Config` struct for provider credentials | Same file |
| 3 | Hook into `checkout.before` to initiate payment | `Init()` method |
| 4 | Parse `PaymentMethod.Config` (auto-decrypted JSON) for API keys | Hook handler |
| 5 | Call the provider API to create a payment intent/session | Hook handler |
| 6 | Create a `payment_transactions` record with status `pending` | Hook handler |
| 7 | Register a `/api/v1/payments/<provider>/webhook` endpoint | `Init()` method |
| 8 | Verify webhook signature and update transaction status | Webhook handler |
| 9 | Dispatch `payment.after_complete` or `payment.after_failed` hook | Webhook handler |
| 10 | Register the plugin in `app.go` | `RegisterPlugins()` |
| 11 | Create the payment method via admin API with provider credentials | Admin API / UI |

## Step 1–2: Plugin Skeleton

```go
package stripe

import (
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/rs/zerolog"
    "github.com/epoxx-arch/stoa/pkg/sdk"
)

const ProviderName = "stripe"

type Config struct {
    SecretKey      string `json:"secret_key"`
    WebhookSecret  string `json:"webhook_secret"`
    PublishableKey string `json:"publishable_key"`
}

type Plugin struct {
    db     *pgxpool.Pool
    logger zerolog.Logger
    hooks  *sdk.HookRegistry
}

func New() *Plugin { return &Plugin{} }

func (p *Plugin) Name() string        { return "stripe-payment" }
func (p *Plugin) Version() string     { return "1.0.0" }
func (p *Plugin) Description() string { return "Stripe payment integration" }
func (p *Plugin) Shutdown() error     { return nil }
```

## Step 3: Hook into Checkout

```go
func (p *Plugin) Init(app *sdk.AppContext) error {
    p.db = app.DB
    p.logger = app.Logger
    p.hooks = app.Hooks

    app.Hooks.On(sdk.HookBeforeCheckout, p.handleBeforeCheckout)

    app.Router.Route("/api/v1/payments/stripe", func(r chi.Router) {
        r.Post("/webhook", p.handleWebhook)
    })

    return nil
}
```

## Step 4–5: Create a Payment Intent

```go
func (p *Plugin) handleBeforeCheckout(ctx context.Context, event *sdk.HookEvent) error {
    o := event.Entity.(*order.Order)

    // Use the payment method service to get decrypted config
    method, err := p.paymentMethodSvc.GetByID(ctx, o.PaymentMethodID)
    if err != nil {
        return fmt.Errorf("stripe: %w", err)
    }
    if method.Provider != ProviderName {
        return nil // not our provider, skip
    }

    var cfg Config
    if err := json.Unmarshal(method.Config, &cfg); err != nil {
        return fmt.Errorf("stripe: invalid config: %w", err)
    }

    return p.createPaymentIntent(ctx, o, &cfg)
}
```

## Step 6: Record the Transaction

```go
func (p *Plugin) createPaymentIntent(ctx context.Context, o *order.Order, cfg *Config) error {
    // Call the Stripe API to create a PaymentIntent...
    // stripePaymentIntentID = "pi_xxx" from the response

    _, err := p.db.Exec(ctx, `
        INSERT INTO payment_transactions
            (id, order_id, payment_method_id, status, currency, amount, provider_reference, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        uuid.New(), o.ID, o.PaymentMethodID, "pending", o.Currency, o.Total, stripePaymentIntentID,
    )
    return err
}
```

## Step 7–9: Webhook Handler

```go
func (p *Plugin) handleWebhook(w http.ResponseWriter, r *http.Request) {
    body, _ := io.ReadAll(r.Body)
    // 1. Verify webhook signature using cfg.WebhookSecret
    // 2. Parse the event type

    _, err := p.db.Exec(r.Context(), `
        UPDATE payment_transactions
        SET status = $1
        WHERE provider_reference = $2`,
        "completed", providerReference,
    )
    if err != nil {
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }

    hookName := sdk.HookAfterPaymentFailed
    if eventType == "payment_intent.succeeded" {
        hookName = sdk.HookAfterPaymentComplete
    }
    _ = p.hooks.Dispatch(r.Context(), &sdk.HookEvent{Name: hookName, Entity: transaction})

    w.WriteHeader(http.StatusOK)
}
```

## Step 10: Register the Plugin

```go
import "github.com/epoxx-arch/stoa/plugins/stripe"

func (a *App) RegisterPlugins() error {
    appCtx := &plugin.AppContext{
        DB:     a.DB.Pool,
        Router: a.Server.Router(),
        Hooks:  a.PluginRegistry.Hooks(),
        Logger: a.Logger,
    }
    return a.PluginRegistry.Register(stripe.New(), appCtx)
}
```

## Step 11: Create the Payment Method via API

```bash
curl -X POST http://localhost:8080/api/v1/admin/payment-methods \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "stripe",
    "active": true,
    "config": {
      "secret_key": "sk_live_...",
      "publishable_key": "pk_live_...",
      "webhook_secret": "whsec_..."
    },
    "translations": [
      {"locale": "en-US", "name": "Credit Card", "description": "Pay with Visa, Mastercard, or Amex"},
      {"locale": "de-DE", "name": "Kreditkarte", "description": "Zahlen Sie mit Visa, Mastercard oder Amex"}
    ]
  }'
```

The `config` object is stored as AES-256-GCM encrypted bytes in the database and never exposed through the public store API.

## Security Notes

- **Config encryption**: All provider credentials are encrypted with AES-256-GCM at rest. Set `STOA_PAYMENT_ENCRYPTION_KEY` before starting the application.
- **Never expose secrets**: The `Config` field is tagged `json:"-"` and never included in API responses.
- **Webhook verification**: Always verify webhook signatures. Never trust unverified webhook payloads.
- **Scope provider access**: Each payment method has its own isolated config. You can run multiple providers simultaneously.
