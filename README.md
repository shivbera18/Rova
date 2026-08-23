# Chalo-X

Ride-hailing with **negotiated pricing**: riders offer any amount (even ₹0), drivers see pure take-home and counter, the platform fee is charged rider-side on top of the agreed fare.

Web-first implementation of `plan.md` (§20 defers admin panel + native mobile).

## Layout

```
apps/rider-web     Rider SPA (Vite + React)  :5173
apps/driver-web    Driver SPA (Vite + React) :5174
services/core      API + WS backend (Fastify) :8080
packages/protocol  Shared types: money, negotiation FSM, events, WS messages
```

## Quickstart

```bash
pnpm install
docker compose up -d          # postgres + redis (see note)
pnpm --filter @chalo/core db:migrate
pnpm --filter @chalo/core seed
pnpm dev:rider & pnpm dev:driver   # two terminals; core auto-starts via turbo dev chain
```

**No Docker?** Core falls back to embedded Postgres (PGlite) + in-memory geo/bus automatically when `DATABASE_URL` is unset. Zero-config demo mode.

## The negotiation flow (the product)

1. Rider picks route → sees list price split into trip fare + platform fee (ℹ️ explains the fee keeps lights on).
2. Rider submits an offer (₹0 floor) → broadcast to nearby online drivers.
3. Driver accepts → trip created. Or counters → rider accepts/finals. Max rounds per city config.
4. Expiry/decline → one-tap fallback to list price dispatch.
5. Trip: OTP start → live breadcrumbs → complete → double-entry ledger settlement → invoice.
