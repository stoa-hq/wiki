# Storefront

The Storefront is a SvelteKit 5 SPA that provides the customer-facing shopping experience. It communicates with the Store API (`/api/v1/store/*`) and supports optional customer authentication.

## Features

| Feature | Path | Auth Required |
|---------|------|---------------|
| Product browsing | `/` | No |
| Product detail | `/product/:slug` | No |
| Search | `/search` | No |
| Cart | `/cart` | No |
| Checkout | `/checkout` | No (guest checkout supported) |
| Order history | `/account/orders` | Yes |
| API Keys | `/account/api-keys` | Yes |
| Login | `/account/login` | No |
| Register | `/account/register` | No |

## Development

```bash
make storefront-dev   # Vite dev server on :5174 (proxies /api → :8080)
```

The Storefront requires the Stoa backend running on port 8080. Start it with `make run` in a separate terminal.

## Authentication

Customer authentication uses JWT tokens stored in `localStorage`:

| Key | Purpose |
|-----|---------|
| `storefront_access_token` | Short-lived access token (15 min) |
| `storefront_refresh_token` | Long-lived refresh token (7 days) |
| `storefront_cart_id` | Current cart UUID |
| `storefront_locale` | Selected language (`de-DE` or `en-US`) |

Pages that require authentication (orders, API keys) check `authStore.isAuthenticated()` on mount and redirect to `/account/login` if the customer is not logged in.

## Internationalization

The Storefront supports German (`de-DE`) and English (`en-US`) via `svelte-i18n`. Language files are located at:

- `src/lib/i18n/de-DE.json`
- `src/lib/i18n/en-US.json`

Users can switch languages using the globe icon in the header. The selection is persisted in `localStorage`.

## Account Pages

### Order History

The order history page (`/account/orders`) displays all orders placed by the customer, including order number, status, items, and total.

### API Keys

The API Keys page (`/account/api-keys`) allows customers to manage their Store API Keys for AI agent and integration access.

**Features:**

- **Create keys** with a custom name and granular permissions
- **One-time key display** — the raw `sk_*` key is shown once after creation with a copy button
- **Permission selection** — choose which store operations the key can perform:
  - `store.products.read` — Browse products
  - `store.cart.manage` — Manage shopping cart
  - `store.checkout` — Complete purchases
  - `store.account.read` — View account details
  - `store.account.update` — Update account
  - `store.orders.read` — View order history
- **Key list** — cards showing name, creation date, last used date, and permission badges
- **Revoke keys** — permanently disable a key with confirmation
- **5-key limit** — warning banner when the maximum is reached

::: tip Use Case
Store API keys are designed for the [Store MCP Server](/mcp/setup), enabling AI agents like Claude to browse products, manage carts, and complete purchases on the customer's behalf.
:::

For the API reference, see [Store API Keys](/api/api-keys#store-api-keys-customer).
