# Quick Start

Get Stoa running locally in under 5 minutes.

## Prerequisites

- [Go 1.22+](https://go.dev/dl/)
- A terminal

## 1. Download

Download the latest binary for your platform from the [GitHub Releases](https://github.com/stoa-hq/stoa/releases) page, or build from source:

```bash
git clone https://github.com/stoa-hq/stoa.git
cd stoa
go build -o stoa .
```

## 2. Run

```bash
./stoa
```

Stoa starts with sensible defaults. By default it listens on `http://localhost:8080`.

```
✓ Stoa is running at http://localhost:8080
✓ Admin panel at  http://localhost:8080/admin
✓ API available at http://localhost:8080/api/v1
```

## 3. Open the Admin Panel

Navigate to [http://localhost:8080/admin](http://localhost:8080/admin) and log in with the default credentials:

| Field | Value |
|-------|-------|
| Email | `admin@stoa.local` |
| Password | `admin` |

::: warning
Change your password immediately after first login.
:::

## 4. Add your first product

In the admin panel, go to **Products → New Product** and fill in the details. Your product is instantly available via the API and the demo storefront.

## 5. Visit the Storefront

Open [http://localhost:8080](http://localhost:8080) to see the Svelte demo storefront with your products.

## Next Steps

- [Configuration](/guide/configuration) — customize Stoa for your environment
- [Self-Hosting](/guide/self-hosting) — deploy to a server
- [Plugin System](/plugins/overview) — extend Stoa with plugins
- [MCP Setup](/mcp/setup) — connect an AI agent to your shop
