# Quick Start

Get Stoa running locally in under 5 minutes.

## Option A: Docker (recommended)

Everything you need is Docker. No Go or Node.js required.

### 1. Clone the repository

```bash
git clone <repository-url>
cd stoa
```

### 2. Create configuration

```bash
cp config.example.yaml config.yaml
```

The default values work out of the box with Docker Compose — no changes required.

### 3. Start everything

```bash
docker compose up -d
```

This starts PostgreSQL and the Stoa application. On the first run the Docker image is built (including admin and storefront frontends), which takes a few minutes.

### 4. Set up the database

```bash
# Run migrations (create tables)
docker compose exec stoa ./stoa migrate up

# Create an admin user
docker compose exec stoa ./stoa admin create --email admin@example.com --password your-password

# Optional: load demo data (products, categories, etc.)
docker compose exec stoa ./stoa seed --demo
```

### 5. Open the app

| What | URL |
|------|-----|
| Storefront | http://localhost:8080 |
| Admin Panel | http://localhost:8080/admin |
| API Health Check | http://localhost:8080/api/v1/health |

Log into the admin panel with the credentials from step 4.

### Stopping and restarting

```bash
docker compose down          # Stop (data is preserved)
docker compose down -v       # Stop and delete all data
docker compose up -d         # Restart
```

---

## Option B: Local Development (without Docker for the app)

For working on the codebase it is more convenient to run only PostgreSQL via Docker and execute the app directly.

### Prerequisites

| Tool | Version |
|------|---------|
| Go | 1.23+ |
| Node.js | 20+ |
| Docker | latest |

### 1. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 2. Create configuration

```bash
cp config.example.yaml config.yaml
```

### 3. Set up the database

```bash
go run ./cmd/stoa migrate up
go run ./cmd/stoa admin create --email admin@example.com --password your-password
go run ./cmd/stoa seed --demo   # optional
```

### 4. Build frontends

Both admin and storefront are SvelteKit applications embedded into the Go binary via `//go:embed`. They must be built before the first run:

```bash
cd admin && npm install && npm run build && cd ..
cd storefront && npm install && npm run build && cd ..
```

> **Important:** After every change to the frontends you must run `npm run build` AND rebuild the Go binary, because the frontends are statically embedded into the binary.

### 5. Start the backend

```bash
go run ./cmd/stoa serve
```

Or as a compiled binary:

```bash
go build -o stoa ./cmd/stoa
./stoa serve
```

### Frontend development with hot-reload

For frontend development you can start the Vite dev servers, which provide hot-reload:

```bash
cd admin && npm run dev       # Admin panel (port 5174)
cd storefront && npm run dev  # Storefront (port 5173)
```

The dev servers communicate with the Go backend on port 8080 via the API. Make sure the backend is running.

---

## Makefile Commands

```bash
make build              # Build frontends + compile Go binary
make run                # build + start
make test               # Run Go tests
make test-race          # Tests with race detector
make lint               # Run linters (golangci-lint + go vet)
make docker-up          # docker compose up -d
make docker-down        # docker compose down
make admin-dev          # Admin frontend dev server
make storefront-dev     # Storefront dev server
make seed               # Load demo data
make mcp-store-build    # Build Store MCP Server binary
make mcp-admin-build    # Build Admin MCP Server binary
```

## Next Steps

- [Configuration](/guide/configuration) — customize Stoa for your environment
- [API Overview](/api/overview) — authentication and endpoints
- [MCP Setup](/mcp/setup) — connect an AI agent to your shop
- [Plugin System](/plugins/overview) — extend Stoa with plugins
