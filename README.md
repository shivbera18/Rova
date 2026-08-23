# Chalo-X

Production-ready ride-hailing platform with **negotiated pricing**: riders can negotiate the fare they want to pay (down to ₹0), drivers receive 100% of their agreed offer as pure take-home pay, and the platform fee is billed separately on the rider's invoice with a transparent `ℹ` explainer.

---

## Workspace Layout

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

## 30-Second Quickstart (Zero-Config Development)

The platform runs in **zero-config mode out of the box** using embedded WASM PostgreSQL (`PGlite`) with no external database or Docker setup required.

```bash
# 1. Install dependencies
pnpm install

# 2. Run migrations & seed pilot city data (Bengaluru + demo accounts)
pnpm --filter @chalo/core db:migrate
pnpm --filter @chalo/core seed

# 3. Start services in separate terminal windows:
pnpm --filter @chalo/core dev     # Backend API + WS on :8080
pnpm --filter rider-web dev       # Rider Console on :5173
pnpm --filter driver-web dev      # Driver Console on :5174
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
  - Docker Compose setup with PostgreSQL 16 & Redis
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
