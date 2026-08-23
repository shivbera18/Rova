# Chalo-X

Production-ready ride-hailing platform with **negotiated pricing**: riders can negotiate the fare they want to pay (down to ₹0), drivers receive 100% of their agreed offer as pure take-home pay, and the platform fee is billed separately on the rider's invoice with a transparent `ℹ` explainer.

---

## Monorepo Architecture

The platform is structured as a high-performance **Monorepo** managed with **Turborepo** and **pnpm workspaces**:

```
chalo-x/
├── apps/
│   ├── rider-web/       # Rider SPA (React 18 + Vite + Leaflet)       -> :5173
│   └── driver-web/      # Driver SPA (React 18 + Vite + Leaflet)      -> :5174
├── services/
│   └── core/            # Fastify API, WebSocket Gateway & Ledger    -> :8080
├── packages/
│   └── protocol/        # Shared money math, FSMs, API/WS contracts
├── GUIDE.md             # Complete Local Development & Production Run Guide
└── plan.md              # Full 22-week Architecture & Production Specification
```

---

## Development Experience: Do You Need Docker?

### ❌ **NO Docker Required During Development**
You **never need to build or rebuild Docker images** while developing or testing features.

| Feature | How It Works in Dev (Zero Docker) | Reload / Feedback Speed |
|---|---|---|
| **Database** | Embedded WASM PostgreSQL (`PGlite`) runs in-process | **Zero setup**, instant startup |
| **Backend Code** | `tsx watch src/server.ts` automatically watches `.ts` files | **< 100ms** instant reload |
| **Rider Web App** | Vite Hot Module Replacement (HMR) | **< 50ms** instant browser update |
| **Driver Web App** | Vite Hot Module Replacement (HMR) | **< 50ms** instant browser update |
| **Shared Protocol** | TypeScript workspace source alias | **Instant** across all apps |

> **Where is Docker used?** Docker (`docker-compose.yml`) is provided **only** for production staging to run a standalone PostgreSQL 16 server and Redis 7 broker. Even in Docker mode, it only runs the database service — your application code is never trapped in slow image rebuild loops.

---

## Single-Command Quickstart

```bash
# 1. Install dependencies across the entire monorepo
pnpm install

# 2. Run migrations & seed pilot city data (Bengaluru + demo accounts)
pnpm --filter @chalo/core db:migrate
pnpm --filter @chalo/core seed

# 3. Start the ENTIRE platform with a single command (Turborepo):
pnpm dev
```

Turborepo runs all three services concurrently in one terminal with color-coded live logs:
```
@chalo/core:dev: [core] listening on :8080 (storage: pglite)
rider-web:dev:   ➜  Local:   http://localhost:5173/
driver-web:dev:  ➜  Local:   http://localhost:5174/
```

### Pre-Seeded Test Logins (Dev OTP: `123456`)

| Role | Phone | Vehicle Class | URL |
|---|---|---|---|
| **Rider** | `+919900000001` | — | http://localhost:5173/ |
| **Driver 1** | `+919900000101` | `BIKE` | http://localhost:5174/ |
| **Driver 2** | `+919900000102` | `AUTO` | http://localhost:5174/ |
| **Driver 3** | `+919900000103` | `CAB_MINI` | http://localhost:5174/ |

---

## Full Guides & Documentation

- 📖 **[GUIDE.md](./GUIDE.md)**: Exhaustive manual for:
  - Docker vs. No-Docker development comparison
  - Step-by-step multi-client negotiation walkthrough
  - Production deployment, environment variables & Nginx reverse proxy configs
  - Automated testing & troubleshooting
- 📐 **[plan.md](./plan.md)**: Full system design covering double-entry accounting ledger, state machine invariants, compliance, security, and migration paths.

---

## Automated Verification Suite

```bash
# Run 64-assertion comprehensive invariant & live scenario test suite
pnpm --filter @chalo/core test:verify

# Run protocol unit tests (money clamping, FSM transitions)
pnpm --filter @chalo/protocol test

# Full monorepo typecheck & production build
pnpm typecheck
pnpm build
```
