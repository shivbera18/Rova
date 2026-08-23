# Chalo-X — Ride-Sharing Platform with Negotiated Pricing

**Status:** PLAN — awaiting approval before implementation
**Date:** 2026-08-23
**Market assumption:** India-first (INR, UPI, state aggregator licensing), global-capable.

---

## Table of Contents

1. [Vision & Scope](#1-vision--scope)
3. [Surfaces & Personas (web-first)](#3-surfaces--personas-web-first)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Technology Stack](#5-technology-stack)
6. [Databases & Data Architecture](#6-databases--data-architecture)
7. [Core Subsystem Designs](#7-core-subsystem-designs)
8. [Complete Feature & Flow Catalog](#8-complete-feature--flow-catalog)
9. [API Surface](#9-api-surface)
10. [Scalability & Performance Targets](#10-scalability--performance-targets)
11. [Security & Compliance](#11-security--compliance)
12. [Observability & SRE](#12-observability--sre)
13. [Deployment, Environments & CI/CD](#13-deployment-environments--cicd)
14. [Analytics & Experimentation](#14-analytics--experimentation)
15. [Fraud, Abuse & Trust](#15-fraud-abuse--trust)
16. [Implementation Roadmap](#16-implementation-roadmap)
17. [Testing Strategy](#17-testing-strategy)
18. [Risks & Open Questions](#18-risks--open-questions)
19. [Indicative Infra Cost Model](#19-indicative-infra-cost-model)
20. [Deferred Scope & Migration Path](#20-deferred-scope--migration-path)

---

## 1. Vision & Scope

A production-grade ride-hailing platform (Uber/Rapido/Ola feature parity). Shipping order: rider + driver **web** first; admin panel and native mobile deliberately deferred (§20).

| Surface | Users | Purpose | Status |
|---|---|---|---|
| **Rider web app** | passengers | book, track, pay, rate — any modern phone/desktop browser, PWA-installable | **v1** |
| **Driver web app** | drivers/fleet partners | accept, navigate, earn, payout — built for the driver's phone browser | **v1** |
| Admin panel (back office, spec §3.3) | internal ops | KYC queues, finance, config, support, safety console | **deferred** |
| Native mobile (iOS/Android stores) | riders + drivers | store-distributed apps reusing the same TypeScript domain layer | **deferred** |

**The twist:** riders propose what they want to pay (down to ₹0). The platform fee is shown upfront with an ℹ️ explainer: *"You can negotiate to zero — but this fee keeps the platform running."* Drivers see the net payout and decide.

### In scope (full catalog in §8)
Ride-now, scheduled, rentals, outstation/round-trip, intercity, parcel mode (Rapido-style), vehicle classes (bike, bike-lite, auto, cab-mini, cab-prime, cab-XL), pooling (flagged off at launch), live GPS tracking, OTP-start, SOS + ride-check, wallet/UPI/cards/cash, GST invoices, referral/coupon engine, driver incentives, fleet partner accounts, subscriptions (rider saver plans), ratings, support tickets, disputes, full admin back-office.

### Explicitly out of scope v1
Carpooling social graph features, driver-shift management hardware integrations, own maps stack, lending/credit products, internationalization beyond en/hi.

**Deferred by decision:** the full admin panel and native mobile apps. The backend keeps clean `admin-api` module boundaries so neither deferral creates debt; migration triggers and paths in §20.

---

## 2. Core Differentiator: Negotiated Pricing

This is the product. Everything else is parity. Spec it precisely.

### 2.1 Money model

rider_pays        = negotiated_offer + platform_fee + GST + toll/parking + tips
platform_fee      = max(fee_min, min(offer × fee_pct, fee_cap))       -- RIDER-side, per class & city
driver_take_home  = negotiated_offer + tips                           -- fee NEVER touches driver money;
                                                                      -- a driver's counter IS their pay
platform_loss     = fee shortfall when offer ≈ ₹0                     -- booked to PROMO_EXPENSE, budgeted
toll/parking      = pass-through, added AFTER agreement, shown separately — never negotiable
GST               = 5% (bike/auto) / 12% (cab classes), own invoice line, per prevailing rules
cancellation_fees = credited to driver (driver-caused: waived); no platform fee on cancellations
cash rides        = rider hands the driver the agreed offer in cash; the rider-side FEE is still
                    charged digitally (mandate / postpaid cap ₹200) — see §7.7

**Product decisions locked in this plan** (config-driven, changeable without code):

| Rule | Default | Rationale |
|---|---|---|
| Offer floor | ₹0 | User requirement: "can negotiate down to zero" |
| Soft floor (UI nudge) | `estimate × 0.6` | Below this, warning chip "low offers rarely accepted" |
| Counteroffers per side | 1 each (max 3 rounds incl. initial) | Prevent infinite haggling; bounded state machine |
| Per-stage expiry | 45 s (rider offer→drivers), 20 s (counter responses) | Match street-hailing decision speed |
| Total negotiation window | 120 s → then fallback: dispatch at **list price** (standard flow) | Rider always gets a ride path |
| Cash rides | Allowed, cap ₹500 offer | Risk control |
| Driver sees | Take-home = counter amount — the fee is billed to the rider separately | Drivers quote pure earnings; no gross-vs-net confusion |

### 2.2 Rider UX (the ℹ️ moment)

```
┌─────────────────────────────────────────────┐
│  Bike · ~14 min · 4.2 km                    │
│                                             │
│  Suggested fare            ₹86              │
│  ├─ Trip fare              ₹76              │
│  └─ Platform fee ⓘ         ₹10              │
│     ┌───────────────────────────────────┐   │
│     │ ⓘ You can offer any amount — even │   │
│     │ ₹0. But this small fee keeps      │   │
│     │ Chalo-X running: servers, support,│   │
│     │ insurance. Paying it helps us     │   │
│     │ help you every day.               │   │
│     └───────────────────────────────────┘   │
│                                             │
│  Your offer                                 │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌────────────┐    │
│  │ ₹60 │ │ ₹75 │ │₹86 ✓│ │ custom ___ │    │
│  └─────┘ └─────┘ └─────┘ └────────────┘    │
│                                             │
│  [ Find drivers at my offer ]               │
│                                             │
│  ⓘ Your ₹60 goes to the driver in full.     │
│    Platform fee ₹10 is added at checkout —  │
│    that's what keeps Chalo-X running.       │
└─────────────────────────────────────────────┘
```

### 2.3 Driver UX

Incoming card: **"You earn ₹76 · pickup 900 m · 4.2 km trip"** — Accept / Counter ₹X / Skip. A counter IS take-home: the platform fee is billed to the rider separately, so a driver accepting even a ₹0 offer never loses money to the fee.
Counter sends rider: *"Driver asks ₹95 — you save ₹X vs suggested if you accept"* → Accept / Final offer / Decline.
Any stage expiry or decline → offer dies → fallback to standard dispatch at list price (rider notified once, no nagging).

### 2.4 Negotiation state machine

States: `OPEN → BROADCASTING → COUNTERED_RIDER / COUNTERED_DRIVER → AGREED | EXPIRED | DECLINED | CANCELLED`

```
OPEN ──rider submits offer──▶ BROADCASTING ──driver accepts──▶ AGREED ──▶ dispatch-lock ──▶ TRIP_CREATED
                                   │  ▲
                     driver counter│  │rider accepts counter
                                   ▼  │
                            COUNTERED_DRIVER ──rider final offer──▶ (back to BROADCASTING, round++)
any round > MAX_ROUNDS ──▶ EXPIRED ──▶ FALLBACK_LIST_PRICE_DISPATCH
rider cancels anytime ──▶ CANCELLED
```

Invariants (enforced server-side, never client-side):
- One active negotiation session per rider per city; creating a new one cancels the old.
- Every transition is idempotent (`Idempotency-Key` header) and written to an append-only `negotiation_events` table.
- Agreement atomically reserves the driver in Redis (`SETNX driver_lock:{driver_id}` TTL 90 s) before trip creation.
- Price is immutable after `AGREED`; mid-trip route edits create a **supplement quote**, never mutate the agreed fare.
- Cash offers above `cash_offer_cap` are rejected pre-broadcast (`CASH_CAP_EXCEEDED`); on cash trips the rider-side platform fee is always collected digitally (§7.7) — drivers never hold platform money.

### 2.5 Why drivers would ever accept low offers

Economies that make zero/near-zero offers survivable (all shipped in v1):
- **Demand-shaping:** low-offer requests are broadcast wider (more rings) and shown with demand-context ("slow hour — ₹40 beats nothing").
- **Incentive stacking:** driver quests/target bonuses count low-fare trips toward earnings goals; platform-subsidized gap counts toward streak protection.
- **Surge inverse:** during oversupply, accepting any fare beats deadheading.
- **Guardrails:** riders whose accepted-offer-to-list-price ratio stays < 0.5 over rolling 20 trips get throttled (longer match times), not banned. Drivers who decline >85% of sub-floor offers stop receiving them (decline-score routing).

---

## 3. Surfaces & Personas (web-first)

### 3.1 Rider web app (`/rider`) — v1
Onboarding (phone OTP → profile → emergency contacts), home (map + saved places), search/autocomplete, vehicle class carousel with estimates, negotiation sheet (§2.2), matching status screen, live tracking (driver marker, ETA, share-trip link), OTP start, in-ride controls (add stop, change destination, SOS, share, cancel with policy display), payment selection (wallet/UPI/card/cash/postpaid), rating + tip + complaint, history & GST invoices, referrals, coupons, saver subscription, notification center, support chat, account deletion (DPDP). Browser specifics: geolocation/notification **permission primers** before the OS prompts, PWA install banner, Web Push opt-in.

### 3.2 Driver web app (`/drive`) — v1
Signup (OTP → DL/RC/Aadhaar/PAN upload via file-input + `getUserMedia` capture → liveness selfie → background-check status → optional fleet attach), online/offline toggle with duty hours, heat-map + hotspot hints, request cards (list-price AND negotiated w/ counter affordance), auto-accept setting, navigation handoff (Google Maps deep link/intent URL), arrival → start (rider OTP) → end flow, toll entry, earnings dashboard, payouts timeline + instant withdrawal, ratings received, cancellation-penalty visibility, training pages, document-expiry warnings, SOS. **Browser constraint designed around:** mobile browsers throttle background geolocation — while ONLINE the app holds a **Wake Lock**, shows "keep this tab open", and pings only from the foreground; true background tracking arrives with the native phase (§20).

### 3.3 Admin panel — **DEFERRED (spec frozen below for the future build)**

| Module | Capabilities |
|---|---|
| Dashboard | Live map (all active trips), KPI tiles (trips, GMV, take rate, supply heatmap, cancel %, negotiation avg discount) |
| Users & Riders | Search, block/unblock, wallet adjust (dual-control), device/session revoke |
| Drivers & Fleet | KYC review queue, doc expiry, onboarding funnel, fleet partner mgmt, incentive eligibility |
| Trips | Live trip inspector, manual state repair (audited), fare recalculation, dispute flags |
| Negotiations | Live feed of sessions, discount distribution, rule tuning preview |
| Finance | PG settlements recon, ledger browser, payout batches, refunds, chargebacks, GST reports, TDS |
| Pricing Config | Per-city fare cards, platform fees, surge schedules, negotiation guardrails — versioned, staged rollout |
| Promotions | Coupon builder, referral rules, targeted push campaigns, budget caps |
| Support | Ticket queue, SLAs, macro replies, refund-with-ticket linkage, call-back scheduler |
| Safety | SOS response console, incident reports, blocked-driver actions, ride-check alerts |
| Fraud Console | Rule hits, device fingerprint clusters, velocity alerts, manual reviews |
| Experimentation | Flag toggles, A/B assignment health, metric readouts |
| Audit | Every admin mutation: actor, before/after, reason — immutable |

RBAC roles: `superadmin`, `city_ops`, `finance`, `support`, `compliance`, `marketing`, `read_only`. All destructive ops require reason text + second approver above money thresholds.
Interim until the §20 trigger fires: an **ops-lite** single page (shared internal credential, IP-allowlisted) exposing ONLY the KYC approval queue and a live-trip inspector — deliberately minimal, not the RBAC product above.

---

## 4. High-Level Architecture

**Modular monolith first, service-extraction-ready.** One deployable backend composed of strictly bounded modules (own schema, own tables, communicate via interfaces + outbox events). Extract to independent services only where load demands (location ingest and dispatch first). This gives microservice scalability without distributed-monolith debugging on day one.

```mermaid
flowchart TB
    subgraph Clients
        RW[Rider Web SPA] --- DW[Driver Web SPA]
    end

    subgraph Edge
        LB[LB / WAF] --> GW[API Gateway: auth, rate-limit, routing]
        WSG[WS Gateway sticky]
    end

    GW --> CORE[Chalo-X Core - modular monolith<br/>identity · profiles · kyc · geo · pricing ·<br/>negotiation · dispatch · trips · payments ·<br/>ledger · promotions · ratings · safety · support]
    WSG <--> CORE

    subgroup[Extracted hot services]
    CORE -.extract when hot.-> LOC[loc-ingest svc Go]
    CORE -.-> DISP[dispatch svc]

    subgraph Data
        PG[(PostgreSQL 16<br/>+ PostGIS + logical repl)]
        TS[(TimescaleDB<br/>location pings)]
        RD[(Redis Cluster<br/>geo sets, locks, cache)]
        KF[(Kafka / Redpanda<br/>events, outbox relay)]
        CH[(ClickHouse<br/>analytics)]
        OS[(OpenSearch<br/>search, logs)]
        S3[(S3: docs, invoices)]
    end

    CORE --> PG & RD & KF & OS & S3
    LOC --> TS & KF
    KF --> CH
    subgraph External
        MAPS[Maps: Google + MapmyIndia fallback]
        PAY[Razorpay: UPI/cards + mandates]
        WPN[Web Push VAPID]
        SMS[MSG91 SMS + WhatsApp BSP]
        KYC[Karza/Signzy KYC + background check]
        INSUR[Per-ride insurance API]
    end

    CORE --> MAPS & PAY & WPN & SMS & KYC & INSUR

### Architectural principles
1. **Event-driven spine:** every state change emits a domain event via transactional outbox → Kafka. Consumers build read-models, analytics, notifications. No cross-module synchronous chains deeper than two hops.
2. **Single writer per aggregate:** trip state transitions only through `TripService` with optimistic locking; everything else reacts.
3. **Real-time is a first-class citizen:** all driver/rider screens run on WebSockets with reconnect+resume (event cursor), REST for CRUD only.
4. **Config over code:** fares, fees, negotiation guardrails, surge, penalties — all rows in `config` tables, cached in Redis, version-staged per city.
5. **Money is double-entry or it doesn't exist.** No balance column updates without a ledger pair.

---

## 5. Technology Stack

Chosen for: hiring pool in India, boring reliability, single-language density, exit paths.

| Layer | Choice | Why / notes |
|---|---|---|
| Web apps (×2) | **React 18 SPA (Vite + TypeScript)** — rider + driver, Zustand, TanStack Query, Google Maps JS API, vite-plugin-pwa, Web Push (VAPID), Wake Lock API | Single language end-to-end; logic shared via `packages/`; **Capacitor wrap = cheapest future native path** |
| Rider/Driver realtime | WS (Socket.IO protocol over ws://) with binary protobuf payloads for location frames | Resume tokens, backpressure |
| Backend runtime | **NestJS (Node 22, TypeScript)** monorepo (pnpm workspaces + Turborepo) | DI + modules map 1:1 to our bounded contexts; huge Indian hiring pool |
| Hot-path services | **Go** for loc-ingest (50k pings/s/node) — extracted only when metrics demand | gRPC in, Kafka out |
| Internal RPC | gRPC + protobuf (buf-managed contracts) | typed, evolvable; REST at edge only |
| Gateway | Kong (or AWS ALB + custom gateway svc) | JWT verify, per-key rate limits |
| Primary DB | **PostgreSQL 16 + PostGIS 3** (+TimescaleDB extension) | Relational integrity + geospatial + time-series in one boring box; logical replication for zero-downtime migrations |
| Cache/geo-hotset | **Redis Cluster 7**: `GEO` for live driver sets, streams for WS fanout, RedLock-free atomic Lua for locks | Dispatch latency lives here |
| Event bus | **Redpanda (Kafka API)** | Simpler ops than Kafka/ZK, same ecosystem |
| Analytics OLAP | **ClickHouse** | Trip funnels, negotiation discount curves, driver economics at billions of rows, cheap |
| Search | **OpenSearch** (optional, phase 3) | Address autocomplete fallback, log search; Postgres trigram first |
| Object store | **S3-compatible (MinIO self-host → S3)** | KYC docs (SSE + signed URLs), invoice PDFs |
| Admin web (**deferred**) | Next.js 14 + Ant Design (Pro) + Refine patterns, TanStack Query | Spec in §3.3; build triggered per §20 thresholds |
| Maps/routing | **Google Maps Platform** primary (Directions/Distance Matrix/Places); **MapmyIndia** fallback + cost arbitrage | India coverage; abstraction layer `MapProvider` |
| Payments | **Razorpay**: UPI collect + intents, cards (tokenized per RBI), UPI AutoPay mandates for subscriptions, Route/Settlement for split payouts to drivers | One aggregator v1; Nodal account for driver funds |
| Notifications | **Web Push (VAPID)** for both consoles; MSG91 SMS; WhatsApp Business (Gupshup) for critical templates | Native push replaces Web Push only in the mobile phase |
| KYC/verification | Karza or Signzy APIs: DL, RC, PAN, Aadhaar offline XML, bank-penny, face liveness | Compliance §11 |
| Auth | Phone OTP (primary), JWT access + rotating refresh in httpOnly cookies bound to browser session/fingerprint | No passwords anywhere |
| Infra | **Kubernetes (EKS or k3s on Hetzner for cost)**, Helm, Terraform, Argo CD | Portable, declarative |
| CI/CD | GitHub Actions: typecheck → unit → integration (testcontainers) → build → trivy scan → deploy dev/stage/prod gates | Per-PR preview deploys of both web apps |
| Observability | OpenTelemetry SDKs → Grafana stack (Prometheus/Mimir, Loki, Tempo) + **Sentry browser SDK** | Traces across WS→core→PG |
| Feature flags/experiments | GrowthBook (self-host) | Cheap, warehouse-native |

---

## 6. Databases & Data Architecture

### 6.1 Polyglot layout (and why each exists)

| Store | Owns | Retention |
|---|---|---|
| PostgreSQL | All system-of-record aggregates: users, drivers, trips, negotiations, ledger, configs, tickets | Infinite (partitioned yearly for trips) |
| TimescaleDB (same PG instance, separate DB) | Raw driver location pings, trip breadcrumbs | Raw 30 d → continuous aggregates forever |
| Redis | Live geo sets, dispatch state machine, locks, rate limits, session/cache | Seconds–hours |
| Redpanda | Domain events (source of truth *of changes*, not records) | 7 d compacted topics for keys, 30 d others |
| ClickHouse | Immutable event stream mirror + derived marts | Forever, cheap |
| S3 | KYC docs, invoice PDFs, exported reports | Regulatory: 8 yr financial docs |

### 6.2 Core schema (PostgreSQL — key DDL)

Conventions: `uuid` PKs (v7, time-sortable), `created_at/updated_at timestamptz`, soft-delete only where legally required, all money as `bigint` **paise**. Schema-per-module namespaces (`trip.`, `pay.`, `usr.`) enforced by naming, one physical database v1.

```sql
-- usr.*
CREATE TABLE usr.users (
  phone_enc bytea,                           -- E.164 encrypted (KMS envelope); nulled after DPDP erasure
  phone_bidx bytea UNIQUE NOT NULL,           -- HMAC blind index — the ONLY lookup path (§11)
  email citext UNIQUE,
  full_name text, gender varchar(16),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE|BLOCKED|DELETED
  dpdp_consents jsonb NOT NULL,               -- timestamped consent artifacts
  created_at timestamptz DEFAULT now()
);

CREATE TABLE usr.devices (
  id uuid PRIMARY KEY, user_id uuid REFERENCES usr.users,
  platform varchar(8), push_token text, fingerprint jsonb,
  last_seen_at timestamptz, UNIQUE (user_id, platform, push_token)
);

-- drv.*
CREATE TABLE drv.drivers (
  id uuid PRIMARY KEY REFERENCES usr.users(id),
  status varchar(24) NOT NULL,                -- PENDING_DOCS|IN_REVIEW|APPROVED|SUSPENDED|REJECTED
  dl_number_enc bytea, dl_expiry date, rc_numbers jsonb,
  pan_hash bytea, bank_account_hash bytea, bank_verified boolean DEFAULT false,
  bg_check_status varchar(16), bg_check_vendor_id text,
  vehicle_class_setups jsonb NOT NULL DEFAULT '[]', -- [{class, rc_id, seats}]
  fleet_partner_id uuid, revenue_share_pct numeric(5,4) DEFAULT 0.0,
  duty_stats jsonb DEFAULT '{}'              -- accept_rate, cancel_rate, rating_rolling
);

CREATE TABLE drv.kyc_documents (
  id uuid PRIMARY KEY, driver_id uuid NOT NULL, type varchar(32) NOT NULL,
  s3_key text NOT NULL, ocr_payload jsonb, status varchar(16) NOT NULL,
  reviewed_by uuid, review_notes text, expires_at date,
  created_at timestamptz DEFAULT now(),
  UNIQUE (driver_id, type, created_at)
);

-- trip.*
CREATE TYPE trip.state AS ENUM ('REQUESTED','MATCHING','NEGOTIATING','DRIVER_ASSIGNED',
  'ARRIVING','ARRIVED','ONGOING','COMPLETED','CANCELLED_RIDER','CANCELLED_DRIVER','CANCELLED_OPS','EXPIRED');

CREATE TABLE trip.trips (
  id uuid PRIMARY KEY,
  rider_id uuid NOT NULL, driver_id uuid,
  city_id smallint NOT NULL,
  vehicle_class varchar(16) NOT NULL,         -- BIKE|BIKE_LITE|AUTO|CAB_MINI|CAB_PRIME|CAB_XL|RENTAL_*|OUTSTATION|PARCEL
  booking_type varchar(16) NOT NULL,          -- NOW|SCHEDULED|RENTAL|OUTSTATION|PARCEL
  state trip.state NOT NULL,
  pickup geography(POINT,4326) NOT NULL, drop_geo geography(POINT,4326),
  stops jsonb DEFAULT '[]',                   -- [{loc, seq, reached_at}]
  distance_km_planned numeric, duration_min_planned int,
  otp varchar(6),                             -- hashed; rotated on driver reassign
  pricing_mode varchar(12) NOT NULL,          -- LIST|NEGOTIATED
  fare_breakdown jsonb NOT NULL,              -- frozen at start (see 6.3)
  payment_method varchar(12) NOT NULL,        -- WALLET|UPI|CARD|CASH|POSTPAID
  started_at timestamptz, ended_at timestamptz,
  cancelled_by varchar(8), cancel_reason_code varchar(32), cancel_fee_paise bigint DEFAULT 0,
  route_actual geography(LINESTRING,4326),    -- breadcrumb-derived
  version int NOT NULL DEFAULT 0              -- optimistic lock
);
CREATE INDEX ON trip.trips (rider_id, created_at DESC);
CREATE INDEX ON trip.trips USING GIST (pickup);
CREATE INDEX ON trip.trips (city_id, state) WHERE state IN ('ONGOING','DRIVER_ASSIGNED');
-- monthly range partitions on ended_at

CREATE TABLE trip.trip_events (                 -- append-only lifecycle audit
  id bigserial, trip_id uuid NOT NULL, event varchar(32) NOT NULL,
  actor varchar(12), actor_id uuid, payload jsonb, occurred_at timestamptz NOT NULL,
  PRIMARY KEY (trip_id, occurred_at, id)
);

CREATE TABLE trip.negotiations (
  id uuid PRIMARY KEY, trip_request_id uuid NOT NULL,
  vehicle_class varchar(16), city_id smallint,
  list_price_paise bigint NOT NULL,           -- engine quote at request time
  state varchar(20) NOT NULL,
  current_offer_paise bigint NOT NULL, round smallint DEFAULT 1,
  offered_by varchar(8),                      -- RIDER|DRIVER
  agreed_price_paise bigint,                  -- = driver take-home (fee is rider-side)
  platform_fee_paise bigint,                  -- charged to the RIDER on top of agreed price
  driver_take_home_paise bigint,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE trip.negotiation_events (          -- every offer/counter/expiry, immutable
  id bigserial PRIMARY KEY, negotiation_id uuid NOT NULL,
  actor varchar(8), actor_id uuid, action varchar(24), amount_paise bigint,
  round smallint, payload jsonb, occurred_at timestamptz NOT NULL
);

CREATE INDEX ON trip.negotiations (trip_request_id);
CREATE INDEX ON trip.negotiation_events (negotiation_id, occurred_at);
CREATE INDEX ON trip.trips (driver_id, ended_at DESC);

CREATE TABLE trip.scheduled_bookings (
  id uuid PRIMARY KEY, rider_id uuid, vehicle_class varchar(16),
  pickup geography(POINT,4326), drop_geo geography(POINT,4326),
  scheduled_for timestamptz NOT NULL, status varchar(16),
  pre_negotiate boolean DEFAULT true, created_trip_id uuid
);

-- pay.* — double-entry ledger (append-only; corrections are new entries)
CREATE TABLE pay.accounts (
  id uuid PRIMARY KEY, owner_type varchar(8) NOT NULL,  -- USER|DRIVER|PLATFORM|EXTERNAL
  owner_id uuid, currency char(3) DEFAULT 'INR',
  kind varchar(16) NOT NULL,                  -- WALLET|ESCROW|REVENUE|PG_CLEARING|PROMO_EXPENSE|TAX_PAYABLE|WITHDRAWAL_PENDING
  UNIQUE (owner_type, owner_id, kind)
);

CREATE TABLE pay.journal_entries (
  id bigserial PRIMARY KEY,
  txn_id uuid NOT NULL,                       -- groups balanced entries
  debit_account uuid NOT NULL REFERENCES pay.accounts,
  credit_account uuid NOT NULL REFERENCES pay.accounts,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  trip_id uuid, reason varchar(48) NOT NULL,  -- RIDE_FARE|PLATFORM_FEE|TOPUP|PAYOUT|REFUND|CANCELLATION_FEE|TIP|INCENTIVE...
  idempotency_key text UNIQUE,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON pay.journal_entries (debit_account, created_at);
CREATE INDEX ON pay.journal_entries (credit_account, created_at);
CREATE INDEX ON pay.journal_entries (trip_id);
-- balances ALWAYS computed or maintained in materialized rollup refreshed transactionally

CREATE TABLE pay.payment_instruments (
  id uuid PRIMARY KEY, user_id uuid NOT NULL,
  type varchar(8) NOT NULL,                   -- UPI_VPA|CARD_TOKEN|MANDATE
  provider_ref text NOT NULL,                 -- razorpay token/vpa
  meta jsonb, is_default boolean
);

CREATE TABLE pay.payouts (
  id uuid PRIMARY KEY, driver_id uuid NOT NULL,
  amount_paise bigint NOT NULL, method varchar(12),  -- IMPS|UPI|WEEKLY_SETTLEMENT
  status varchar(16) NOT NULL, provider_payout_id text,
  period_start date, period_end date, failure_reason text
);

-- cfg.* — everything tunable, versioned, per-city
CREATE TABLE cfg.fare_cards (
  id uuid PRIMARY KEY, city_id smallint NOT NULL, vehicle_class varchar(16) NOT NULL,
  base_paise bigint, per_km_paise bigint, per_min_paise bigint, min_fare_paise bigint,
  free_km int, wait_free_min int, wait_per_min_paise bigint,
  platform_fee_pct numeric(5,4), platform_fee_min_paise bigint, platform_fee_cap_paise bigint,
  night_multiplier numeric(4,2), effective_from timestamptz NOT NULL,
  published boolean DEFAULT false,            -- staged: draft → published
  UNIQUE (city_id, vehicle_class, effective_from)
);

CREATE TABLE cfg.negotiation_rules (
  city_id smallint PRIMARY KEY,
  max_rounds smallint DEFAULT 3, offer_stage_ttl_s int DEFAULT 45,
  counter_ttl_s int DEFAULT 20, session_ttl_s int DEFAULT 120,
  soft_floor_ratio numeric(4,2) DEFAULT 0.6, hard_floor_paise bigint DEFAULT 0,
  cash_offer_cap_paise bigint DEFAULT 50000, fallback_to_list boolean DEFAULT true
);

-- safety, ratings, promos, support (abbreviated; same conventions)
CREATE TABLE safety.sos_events (
  id uuid PRIMARY KEY, trip_id uuid, raised_by varchar(8), channel varchar(16), -- POLICE|ADMIN|CONTACTS
  audio_s3_key text, location geography(POINT,4326), resolved_at timestamptz, outcome text
);
CREATE TABLE rt.ratings (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL, rater_id uuid, ratee_id uuid,
  stars smallint CHECK (stars BETWEEN 1 AND 5), tags jsonb, comment text,
  UNIQUE (trip_id, rater_id)
);
```

### 6.3 Fare snapshot contract (`fare_breakdown` jsonb)

Frozen at trip start; every downstream consumer (invoice, payout, recon) reads this, recomputes nothing:

```json
{
  "mode": "NEGOTIATED",
  "agreed_paise": 6500,
  "platform_fee_paise": 1000,
  "driver_take_home_paise": 6500,
  "list_price_paise": 8600,
  "discount_vs_list_pct": 12.8,
  "components": { "toll_paise": 0, "wait_paise": 0, "night_paise": 0 },
  "surge": { "cell": "8c2f…", "multiplier": 1.0 },
  "fare_card_version": "cfg:fare_cards:id",
  "negotiation_id": "…"
}
```

### 6.4 Location pipeline storage

- **Hot:** Redis `GEO` per city per vehicle-class (`geo:{city}:{class}`), member=driver_id, score updated ≤ every 4 s while online; plus `HASH driver:{id}` heading/speed/status. TTL-based eviction when driver goes dark.
- **Warm:** ping stream → Kafka `loc.pings` → Timescale hypertable `loc.pings(driver_id timestamptz lat lon heading speed)` chunked 1 d, compressed after 2 d, dropped after 30 d; continuous aggregates → `loc.driver_minute` kept 1 y for heat-maps.
- **Trip breadcrumbs:** during ONGOING, sampled every 10 s into `trip.breadcrumbs` → snapped to road → `route_actual`.

### 6.5 Data handling rules

- **PII minimization:** rider phone masked to driver (`+91 •••• 4321` + proxy calling via Exotel/Twilio number masking); Aadhaar/DL stored encrypted (pgcrypto/KMS envelope), never logged; blind indexes for equality lookups.
- **Retention & deletion:** DPDP right-to-erasure job anonymizes user rows, retains financial journal (legal hold) with detached references; KYC docs purged 90 d post-rejection.
- **Consistency boundaries:** strong consistency inside one aggregate (trip, ledger txn); eventual everywhere else via events. Dispatch reads are Redis-only — Postgres never in the matching hot path.
- **Migrations:** expand-contract only, gated by CI against shadow DB restored from prod dump (anonymized).
- **Backups:** PITR (WAL) 15-min RPO, nightly full, quarterly restore drill documented in runbook.

---

## 7. Core Subsystem Designs

### 7.1 Identity & Onboarding
- Phone OTP (MSG91) with per-number + per-IP velocity limits; browser fingerprint recorded (FingerprintJS); refresh token bound to browser session (httpOnly cookie), remote logout per session.
- JWT access 15 min / refresh 30 d rotating with reuse-detection; SLA timers for KYC visible in the ops-lite queue until the full admin exists (§3.3).
- Fleet partners onboard drivers under them with revenue-share split configured per partnership.

### 7.2 Geo & Location Service
- Driver web app pushes Geolocation API readings every 4 s moving / 30 s idle (batched protobuf, gzip) over WS → validated (speed-jump rejection) → Redis GEO update + Kafka publish. Foreground-only constraint (§3.2) accepted for v1; Wake Lock keeps the tab active while ONLINE.
- Snap-to-road and breadcrumb stitching happen async (consumer), never inline.
- ETA service: cached Distance-Matrix results (Redis, 60 s TTL, keyed by origin-cell×destination-cell) + historical per-edge medians from ClickHouse as correction factor; expose p50/p90.

### 7.3 Dispatch & Matching (works identically for LIST and NEGOTIATED modes; negotiation only changes the *price* carried in the broadcast)

```
on request(city, class, pickup):
  rings = H3 rings around pickup, r=1..5 (~0.5km..~5km)
  pool  = GEOSEARCH geo:{city}:{class} within rings, filter status=ONLINE && not locked
  score(d) = w1·eta_pickup + w2·(1−d.rating)·100 + w3·d.pending_declines − w4·minutes_since_last_trip_bonus
  broadcast top-K (K≈8) simultaneously over WS; first ACCEPT wins via atomic Lua:
    if SET driver_lock:{d} NX EX 90 and HSETNX req:{id}:assigned d → win; else lose silently
  no accept in 10 s → widen rings, repeat; overall cap 90 s → EXPIRED
```
- Fairness: drivers who just served get cooldown exclusion; airport queues use virtual FIFO tokens instead of proximity.
- Scheduled bookings: scheduler fires T-30 min → normal dispatch with pinned price from original quote/negotiation.

### 7.4 Pricing Engine (pure function service, no IO)
`quote(city, class, points[], when, surge_cell) → FareQuote{list, fee, suggested}` — deterministic from `cfg.fare_cards` version + surge rules (per-H3-cell multiplier from supply/demand ratio with smoothing, caps ±3×, excluded during drought-supply). Night hours multiplier windowed. Rentals: package hours/km + extra slabs. Outstation: per-km both ways + driver allowance + 300 km/day minima.

### 7.5 Negotiation Engine
Implements §2.4 exactly. Extra mechanics:
- **Broadcast targeting:** offer goes first to drivers in inner rings; expands each 10 s. Each delivery carries `expires_at`; client renders countdown.
- **Counter semantics:** driver counter must be ≥ rider offer (else it's an accept); rider final offer must be ≥ previous rider offer (anti-loophole); any violation → 400 with machine-readable code, no state burn.
- **Expiry sweeper:** Kafka-delayed messages (or Redis sorted-set sweeper at 1 s tick) fire `EXPIRE` transitions; clients get WS `negotiation.expired`.
- **Fallback:** on EXPIRED/DECLINED, one-tap "Book at ₹86 (suggested)" → standard dispatch; rider not forced to renegotiate.
- **Analytics hooks:** every event → `nego.events` Kafka topic → ClickHouse (discount curves per cell/class/time → feeds soft-floor tuning).

### 7.6 Trip Lifecycle
State machine (§6.2 enum) with legal transitions table; every transition: validate actor + precondition → persist event + outbox in one TX → WS notify. Key rules:
- Start requires rider-read OTP match (hashed compare), geo-fence sanity (within 500 m of pickup) unless ops override.
- End: distance from actual route (fallback planned), wait charges, toll entered by driver (photo evidence required >₹200) → final fare = agreed + post-components; ledger entries posted atomically; invoice PDF generated async.
- Cancellations: matrix by state × actor × timing (free window 2 min post-accept); fees post to driver wallet (rider-caused after arrival) or platform revenue; repeated offenders → escalating fees + temporary block.
- Mid-trip edits: new stop/destination → re-quote remaining leg via Pricing Engine → rider confirms delta → supplement journal entry; never touches agreed base.

### 7.7 Payments, Wallet & Ledger
- Top-ups: Razorpay order → webhook (signature-verified, idempotent by `razorpay_payment_id`) → journal credit rider WALLET.
- Ride settlement (digital pay): debit rider (wallet first, then UPI collect / card mandate) → credit DRIVER_WALLET (full agreed offer) + REVENUE (rider-side platform fee) + TAX_PAYABLE (GST 5%/12% per class) in one balanced txn.
- Ride settlement (cash): rider hands the driver the agreed offer; the rider-side platform fee is charged digitally (saved mandate, or rider POSTPAID balance capped ₹200 — bookings blocked past cap). Driver's cash obligation nets against the next payout remittance.
- Driver payouts: weekly auto (IMPS bulk) + on-demand instant withdrawal (fee ₹5, min ₹200, max 2/day free); pending-until-settlement window guards refunds.
- Recon: daily job reconciles PG settlements ↔ journal ↔ bank statement (CSV/API); mismatches → finance queue. Chargebacks: reversible journal pairs referencing original txn.
- Subscriptions (rider "Saver"): UPI AutoPay mandate; benefit = zero platform fee on N trips/week or % cashback cap; usage tracked as journal-linked consumption rows.

### 7.8 Notification Service
Channels push/SMS/WhatsApp/in-app; template registry with per-event channel matrix and quiet hours (except safety); dedupe window; user prefs; delivery receipts tracked; SOS bypasses all throttles.

### 7.9 Safety
- SOS button: 3 s press-and-hold → live audio stream to S3 + alert to ops console + SMS to emergency contacts + optional police-API integration (where available) + ride-check popup to driver ("Ops contacting you").
- Automatic ride-checks: prolonged stop >5 min off-route, route deviation >800 m, speed-zero anomaly → push "Are you okay?" with one-tap confirm/SOS.
- Pre-trip: driver selfie verification on first ride of day; number-masked calls; trusted-contact share links (live map page, no login, auto-expire).
- Women-safety: women-driver filter, "women helper" mode, emergency contact auto-notification on ride start (opt-in).
- Insurance: per-ride group accident cover via API enrollment at trip start (e.g., Digit/Iffco-Tokio partner APIs).

### 7.10 Ratings & Trust
Bidirectional, blind until both submit (or 24 h); tags taxonomy; driver rating rolling 100-trip weighted; <4.3 → retraining flow, <4.0 → suspension review. Rider conduct score affects: support priority, cancellation leniency, offer-throttling (§2.5).

### 7.11 Promotions, Referrals, Subscriptions
Coupon engine: rules-as-data (validity, city/class/first-N-rides/min-fare/payment-method caps, budget cap, per-user frequency) applied at settlement (never at quote, to keep negotiation math honest) as `PROMO_EXPENSE` journal legs. Referrals: deep-link install attribution (Adjust/Branch or Play Install Referrer), reward on driver's Nth completed trip with quality gate (rating ≥4.2, distance ≥3 km median), anti-abuse via device/graph clustering.

### 7.12 Support & Disputes
Ticket types (fare, lost-item, driver-conduct, payment, app-bug) with SLAs; fare disputes open a trip-fare-review workflow: freeze payout portion, adjudication UI showing route/breadcrumbs/audio (safety cases), outcomes post corrective journal entries; macros + CSAT.

---

## 8. Complete Feature & Flow Catalog

### 8.1 Booking types & vehicle classes
| Type | Flow summary | Notes |
|---|---|---|
| Ride Now | pick point(s) → class → **offer or list** → match → ride | core loop |
| Schedule | pick slot → quote now (price-lock ±10% policy) → T-30 auto-dispatch | negotiation optional at T-30 via push |
| Rental (1h/4h/8h packages, km caps) | package select → stops unlimited → overtime charges | negotiation on package base |
| Outstation (one-way/round, multi-day) | city-pair → days → driver-allowance shown → 20% advance | itinerary doc generated |
| Intercity (point-to-point between cities) | same as outstation, same-day | |
| Parcel (Rapido-style) | sender/receiver, size class, photo pickup/drop proofs, OTP at both ends | bikes only v1 |
| Pool/Shared (**flagged OFF**) | seat-selling along route overlap; design reserved (seat inventory model) | enable post-launch |

Vehicle classes: BIKE, BIKE_LITE (cheap tier), AUTO, CAB_MINI (hatch), CAB_PRIME (sedan), CAB_XL (6-seat), PARCEL. Class availability per city via `cfg.city_classes`.

### 8.2 Rider journey (exhaustive)
open URL → OTP → permission primers (geolocation, notifications, PWA install) → home map (driver bubbles) → set pickup (GPS/map-pin drag/saved: Home/Work/custom) → destination (autocomplete/recents) → class carousel (ETA + suggested fare + fee line + ℹ️) → **negotiation sheet** → matching screen (animated search, cancel anytime, fallback CTA) → driver assigned (card: photo, plate, rating, masked call, chat templates) → live approach (marker, ETA countdown) → arrive/start OTP → in-ride (polyline, live ETA, share-trip, SOS, add-stop, change-drop with re-confirm) → end → payment (auto-selected method, UPI intent/wallet/card/cash-QR) → receipt + rating (+tip, +complaint) → history/invoices/refunds.

Cross-cutting: multi-language (en/hi), dark mode, accessibility (TalkBack labels, contrast), low-bandwidth mode (reduced polling), referral hub, coupon wall, saver-plan purchase/manage, emergency contacts mgmt, DPDP data-export & delete-account.

### 8.3 Driver journey (exhaustive)
signup → doc upload wizard (file-input + camera capture, OCR feedback loop) → approval SMS/Web-Push → fleet attach (optional) → guided tour → online/offline (break reasons; Wake Lock engages) → duty-time reminders (state aggregator norms cap) → heat-map + hotspot hints → request cards (list or negotiated w/ counter) → auto-accept toggle per class → navigation handoff (Google Maps deep link) → arrival → OTP start → in-ride (breadcrumbs, toll entry, SOS) → end → instant fare breakdown → next-request countdown → daily earnings sheet (take-home/incentives progress bars) → weekly payout statement → instant withdrawal → ratings inbox → training pages → document-expiry nudges → refer-a-driver.

### 8.4 Admin operations runbooks embedded as features
KYC queue SLAs; manual dispatch assist (ops assigns specific driver); trip repair playbook; goodwill credits (dual-approval); city launch checklist (fare cards → zones → supply seeding plan → support macros → monitoring dashboards); incident war-room view (active SOS + failed payments + stuck negotiations in one board).

---

## 9. API Surface

REST (JSON, versioned `/v1`) for CRUD + WS channels for realtime. Samples of the interesting ones:

```
POST /v1/quotes                 {pickup, drops[], class?, when?} → FareQuote[] (per class, incl. platform_fee + explainer copy id)
POST /v1/requests               {quote_id, offer_paise?, payment_method} → RequestSession (mode LIST|NEGOTIATED)
GET  /v1/requests/:id           → session state (polling fallback)
POST /v1/requests/:id/cancel
POST /v1/negotiations/:id/accept            # accepting side: driver takes rider offer / rider takes driver counter
POST /v1/negotiations/:id/counter {paise}   # either side, role-checked
POST /v1/negotiations/:id/final {paise}     # closing round
POST /v1/trips/:id/start       {otp}
POST /v1/trips/:id/complete    {toll_paise?}   # driver; server computes final
POST /v1/trips/:id/rating      {stars, tags, comment?}

WS (authenticated, resumable cursor):
  rider:  request.updated, negotiation.incoming_counter, driver.assigned, trip.location, trip.state
  driver: dispatch.offer {request_id, take_home_paise, pickup_eta, expires_at}, negotiation.counter, trip.command
Headers: Authorization Bearer; Idempotency-Key on all POSTs (stored 24 h).
Errors: RFC-7807 problem+json with stable codes (NEGOTIATION_ROUND_EXCEEDED, OFFER_BELOW_HARD_FLOOR, …).
```

Internal gRPC contracts (buf): `pricing.v1`, `dispatch.v1`, `trip.v1`, `ledger.v1`, `notify.v1` — generated TS/Go bindings in monorepo `packages/proto`.

---

## 10. Scalability & Performance Targets

| Metric | Target |
|---|---|
| Dispatch offer→driver-card p99 | < 700 ms |
| Location ping ingest sustained | 50 k/s per node (Go extractor), Redis GEO update p99 < 5 ms |
| WS concurrent connections | 200 k/cluster (sticky gateway, horizontal) |
| Quote p99 (cache-hit / miss) | 30 ms / 250 ms |
| Ledger posting p99 | < 50 ms (single PG, batched commits) |
| Availability (booking path) | 99.95% monthly; graceful degradation: quotes from cache, dispatch continues if analytics down |
| Peak shape | Friday evening + rain + cricket nights: 10–15× baseline; surge + queue-based shedding on non-critical consumers |

Scaling levers in order: Redis cluster sharding by city → read replicas → extract dispatch+loc services → PG partition + Citus if ever needed (not before 10k cities-scale evidence). Kafka consumer groups give linear scale for everything asynchronous.

---

## 11. Security & Compliance

- **AppSec:** OWASP ASVS L2; secrets in Vault/SSM, rotation automated; dependency scanning (Trivy + Socket) in CI; pen-test before public launch. Interim ops-lite page: IP allowlist + shared credential rotated per reviewer; full SSO+TOTP lands with the RBAC admin (§20).
- **Payments:** RBI card-tokenization handled inside aggregator; no PAN/card data touches our stores (SAQ-A footprint); nodal/settlement account per aggregator guidelines; UPI mandate revocation honored same-session.
- **India regulatory:** State Motor Vehicle Aggregator Licenses (per-state: caps on surge, duty-hour limits, driver welfare levy — encoded as config per city); GST invoicing (per-ride PDF, monthly GSTR export, TDS u/s 194-O on driver payouts); IT Act + DPDP Act 2023 (consent artifacts, grievance officer, data localization for payments data per RBI).
- **Runtime security:** TLS everywhere (mTLS internal via mesh later), JWT audience checks, per-route rate limits (OTP: 3/hour/number), request signing for webhook receivers, WAF + bot rules at edge.
- **Fraud-sensitive endpoints** (topup, withdrawal, referral-claim, negotiation) carry step-up checks (device-binding + behavior velocity).

---

## 12. Observability & SRE

- OTel traces propagated WS→gateway→module→PG; RED + USE dashboards per service; business golden signals: match-rate, avg-match-time, negotiation-agreement-rate, cancel-rate, payment-success-rate — alerting on these beats CPU charts.
- Structured JSON logs → Loki; PII scrubber middleware (deny-list fields).
- Error budgets: booking-path SLO 99.95%; burn-rate alerts (2%/1h fast, 5%/6h slow).
- Runbooks as code in `/runbooks`; game-days quarterly (kill Redis primary, PG failover, Kafka broker loss).
- On-call: PagerDuty/Opsgenie; severity ladder; incident template + blameless postmortems committed to repo.

---

## 13. Deployment, Environments & CI/CD

- Envs: `dev` (per-PR preview deploys of both web apps + shared dev), `stage` (prod-shaped, anonymized data), `prod` (multi-AZ).
- IaC: Terraform (VPC, EKS/k3s, RDS/Aurora-or-self-managed-PG, MSK/Redpanda, ElastiCache/Redis) + Helm charts per deployable; Argo CD GitOps sync; images tagged by commit SHA, promoted never rebuilt.
- DB jobs: migration gate in CI (expand), contract job in deploy (contract) — two-phase.
- Web: Vite static builds → CDN (Cloudflare Pages / S3+CloudFront) served at `/rider` and `/drive`; per-PR preview URLs; service-worker caches versioned with a remote kill-switch flag for bad releases.
- DR: cross-region warm standby for PG (logical replication) + S3 replication; RTO 1 h, RPO 15 min; quarterly restore drills (documented).

---

## 14. Analytics & Experimentation

- ClickHouse marts: `mart.trips_daily`, `mart.negotiation_curves` (discount% × accept-rate by cell/class/hour), `mart.driver_economics`, `mart.funnel_onboarding`, `mart.payments_health`.
- KPI tree: GMV ← completed trips ← match-rate × demand-open-rate; take-rate = platform fees ÷ GMV (watch it sag under negotiation; healthy band guarded by soft-floor experiments).
- GrowthBook experiments: negotiation defaults (chips, copy), soft-floor ratio, counter TTLs, fallback UX. Guardrail metrics: driver churn, cancel-rate, support contacts/ride.
- Dashboards: exec (daily), city-ops (live), finance (settlement lag), growth (funnels).

---

## 15. Fraud, Abuse & Trust

| Vector | Mitigation |
|---|---|
| Collusive rider↔driver (same person, farm offers, refund loops) | device/graph clustering, payment-instrument overlap, route-impossibility checks |
| GPS spoofing (browsers expose no mock-location signal) | plausibility engine: teleport-speed rejection, route-impossibility, IP↔GPS geo mismatch, driver selfie check on first trip of day; Play Integrity/App Attest arrive with the native phase |
| Negotiation gaming (always-₹0 riders) | throttle ladder §2.5; per-user discount-budget; soft floors |
| Referral farming | quality-gated rewards, SIM/device velocity, payout delay |
| Payment abuse (topup → instant withdraw before recon) | withdrawal delay windows, per-new-account limits |
| Driver-side fare inflation (detours) | breadcrumb vs quoted-route drift alarms; excess-fare auto-flag to support review |
| Account takeover | refresh rotation + reuse kill, new-device step-up OTP, admin session revoke |
| Content (names/chat) | profanity + PII filters in in-app chat templates (template-only chat v1 — no free text) |

---

## 16. Implementation Roadmap

Monorepo layout:

```
chalo-x/
  apps/{rider-web,driver-web}
  services/core/{modules: identity,profiles,kyc,geo,pricing,negotiation,dispatch,trips,payments,ledger,promos,ratings,safety,support,notifications}
  services/loc-ingest/            # Go (extraction only when hot)
  packages/{proto,ts-common,ui,map-provider,payment-provider}
  infra/{terraform,helm,argocd}
  tools/{simulator,loadtests,seed}
  tools/sim            # headless city simulator — acceptance harness
```

| Phase | Duration | Deliverables (acceptance-checked) |
|---|---|---|
| **M0 Foundations** | 2 wk | Monorepo, CI, Terraform envs, PG+Redis+Redpanda up, auth (OTP/JWT/devices), health probes, OTel wired |
| **M1 Rider↔Driver happy path (LIST price)** | 4 wk | Quotes, requests, Redis dispatch, WS tracking, trip lifecycle, OTP start/end, cash + UPI settle, basic invoices, minimal driver console, simulator tool driving 500 concurrent fake trips in CI nightly |
| **M2 Negotiation (the product)** | 3 wk | Full §2.4 machine + UIs, guardrail configs, fallback flow, negotiation analytics mart, chaos tests on expiry sweeper |
| **M3 Wallets, ledger, payouts, promos** | 3 wk | Double-entry ledger, topups, instant withdrawal, weekly payouts, coupons, referrals, GST invoices, recon job |
| **M4 Driver onboarding + KYC (ops-lite)** | 3 wk | Vendor integrations (Karza/Razorpay/MSG91/Maps), KYC state machine + ops-lite review page (§3.3 interim), fleet partners, seed-driver funnel |
| **M5 Safety + support + ratings** | 2 wk | SOS pipeline + ride-checks + insurance hookup, ticketing with fare-dispute adjudication, ratings/taxonomy |
| **M6 Scale + scheduling breadth** | 3 wk | Scheduled/rental/outstation/parcel modes, surge engine, heatmaps/hotspots, incentives engine, load test to targets (§10), multi-city config proof (2 cities) |
| **M7 Hardening & launch** | 2 wk | Pen-test fixes, DR drill, aggregator-license config pack, PWA install polish + share links, runbooks, on-call setup, closed beta (1 city, 200 drivers) |

Total ≈ 22 weeks with 4–6 engineers. Post-launch backlog, in order: **full RBAC admin panel (spec §3.3)** → **native mobile (path §20)** → pool mode → women-only program expansion → intercity shuttles → ads platform → driver fuel/telematics partnerships.

Every phase ends with a demo script + the simulator proving the phase's acceptance criteria — no phase exits on "it compiles".

---

## 17. Testing Strategy

- Unit: pricing engine (property-based: fare monotonicity, fee clamps), negotiation machine (every illegal transition rejected), ledger (invariant: Σdebits=Σcredits per txn, per account non-negative where required).
- Integration: testcontainers PG/Redis/Redpanda; webhook signature/idempotency suites.
- Contract: buf breaking-change checks between web apps and core (Pact added when the admin exists).
- E2E: Playwright against BOTH web consoles — rider happy-path + negotiation dance; driver accept/counter flow; and the flagship cross-console scenario (rider books → driver counters → rider accepts → trip completes).
- Load/chaos: k6 dispatch storm (10k requests/min), WS soak (100k conns), Redis-primary kill during matching, sweeper clock skew tests.
- Simulator (`tools/sim`): headless fake city (riders/drivers/roads) replaying real demand curves — the acceptance harness for dispatch and negotiation tuning before beta.

---

## 18. Risks & Open Questions

| Risk | Stance |
|---|---|
| Negotiation erodes take-rate to unsustainability | Soft floors + fee-explainer + discount budgets; monitor take-rate daily from M2 onward |
| Checkout shock: rider-side fee reads as a hidden extra | Fee visible on the offer sheet BEFORE matching, with the ℹ️ explainer; "your total vs list price" badge; copy A/B-tested in M2 |
| Low offers starve supply in thin markets | Wider broadcast + incentive stacking; consider per-cell minimum-offer hint (not hard floor) experiment |
| Aggregator licensing delays city launches | License paperwork starts M0 in parallel; config-pack makes per-state rules data, not code |
| Two-sided cold start | Launch corridor strategy (airport↔tech-park corridors), guaranteed driver hourly minimums during seed weeks |
| Maps cost blowout | Provider abstraction + MapmyIndia arbitrage + aggressive Matrix caching |

Open questions (need your call before/at M1, none block planning):
1. Pool/shared rides — stay flagged-off post-launch or prioritize earlier?
2. ~~Platform-fee treatment~~ **RESOLVED:** the fee is charged rider-side on top of the offer; every driver-facing amount is take-home (§2.1). Revisit only if M2 data shows checkout drop-off.
3. Brand name/store presence, and whether WhatsApp becomes a primary support channel at launch.
4. Wallet top-up: open now (needs more compliance surface) or wallet-funded-by-refunds-only at launch?

---

## 19. Indicative Infra Cost Model (monthly, pilot city)

| Item | Pilot (≤1k drivers) | Scale (50k drivers) |
|---|---|---|
| K8s nodes | $150 | $1.5k |
| Managed/self PG + replica | $80 | $600 |
| Redis cluster | $40 | $350 |
| Redpanda | $60 | $400 |
| ClickHouse | $60 | $500 |
| Maps API (dominant variable) | $300 | $8–15k (cached aggressively) |
| SMS/WhatsApp/KYC per-active costs | $250 | volume-based |
| Observability stack | $0 self-host → $200 managed | $600 |

Third-party per-unit costs (SMS, KYC checks, payment MDR ~2%, insurance ~₹0.5–1/ride) dominate early infra spend — priced into the platform fee model.

---

## 20. Deferred Scope & Migration Path

**Admin panel.** Build trigger (any one): >50 KYC reviews/day, >2 dedicated ops staff, or the first money-moving incident needing dual-control. The build then follows §3.3 verbatim — schemas (`usr.*`, `drv.*`, `pay.*`, audit tables) and the `admin-api` module boundary were designed for it from day one; there is nothing to migrate, only UI to write.

**Native mobile.** Two options, picked by data:
1. **Capacitor wrap** of the existing SPAs (~2–3 wk): native plugins solve the background-geolocation throttle, ships to both stores, reuses ~100% of web code. Right answer when drop-off comes from install friction but the feature set is stable.
2. **React Native (Expo) rewrite** sharing `packages/` (~6–8 wk): better battery/background behavior, native push, smoother maps. Right answer at retention scale.

Trigger signal: mobile-web cohort retention materially below benchmark, or background-tracking support tickets crossing threshold. Neither deferral accrues debt: every schema, event topic, and API contract in this plan is client-agnostic.
