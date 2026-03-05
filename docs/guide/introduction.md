# Introduction

**Stoa** is an open-source commerce engine built for the modern web. It is designed to be fast, lightweight, and simple to self-host — while being powerful enough to run real production shops.

The name comes from the ancient Greek *stoa* — the covered walkway where merchants and citizens gathered to trade. Today, Stoa is where developers, businesses, and AI agents come together to build the next generation of commerce.

## Why Stoa?

Most commerce systems are either too heavy (Magento, WooCommerce), too opinionated (Shopify), or too expensive to run at scale. Stoa is different:

- **Single binary** — no runtime dependencies, no complex setup
- **API first** — build any frontend you want, or use the included Svelte demo shop
- **Plugin system** — extend anything without forking the core
- **MCP built-in** — AI agents can shop natively, no custom integration needed

## Core Features

### Go-powered Performance
Stoa is written entirely in Go. It starts in milliseconds, uses a tiny amount of RAM, and handles thousands of concurrent requests without breaking a sweat.

### REST API
A clean, fully documented REST API is the heart of Stoa. Every action you can take in the admin panel, you can also do via the API.

### Svelte Storefront
A beautiful, fast demo storefront built with Svelte is included. Use it as-is or as a starting point for your own frontend.

### Admin Panel
A full-featured admin panel for managing products, orders, customers, and settings — included out of the box.

### Plugin System
Stoa's plugin API lets you hook into every part of the system. Build payment providers, shipping integrations, custom webhooks, or anything else you need.

### MCP Server
Stoa ships with a built-in [Model Context Protocol](https://modelcontextprotocol.io) server. This means any MCP-compatible AI agent (Claude, GPT, etc.) can browse your catalog, add items to a cart, and complete purchases — without any custom code.

## What Stoa is not

- Not a hosted SaaS — you run it yourself
- Not a page builder — it's an engine, not a website builder
- Not a monolith — the API, storefront, and admin are decoupled

## Next Steps

- [Quick Start](/guide/quick-start) — get Stoa running in 5 minutes
- [Architecture](/guide/architecture) — understand how the pieces fit together
- [MCP Overview](/mcp/overview) — learn how agents interact with Stoa
