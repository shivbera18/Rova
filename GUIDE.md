# Chalo-X Platform Run Guide

Complete operational guide to running, developing, testing, and deploying the Chalo-X ride-hailing platform with price negotiation.

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Port Allocation & Architecture](#2-port-allocation--architecture)
3. [Local Development Mode (Zero-Config / Embedded)](#3-local-development-mode-zero-config--embedded)
4. [Local Development Mode (with Docker PostgreSQL & Redis)](#4-local-development-mode-with-docker-postgresql--redis)
5. [End-to-End Walkthrough Guide](#5-end-to-end-walkthrough-guide)
6. [Production Deployment Mode](#6-production-deployment-mode)
7. [Automated Testing & Verification](#7-automated-testing--verification)
8. [Troubleshooting & FAQ](#8-troubleshooting--faq)

---

## 1. System Requirements

| Tool | Minimum Version | Recommended Version | Purpose |
|---|---|---|---|
| **Node.js** | `>= 20.0.0` | `22.x LTS` | JavaScript / TypeScript runtime |
| **pnpm** | `>= 9.0.0` | `10.x` | Monorepo package manager |
| **Git** | `>= 2.30.0` | Latest | Version control |
| **Docker & Compose** | Optional for dev | `24.x+` / `v2.x` | Production PostgreSQL 16 & Redis 7 |

Verify your environment:
```bash
node -v    # v22.x.x
pnpm -v    # 10.x.x
git --version
```

---

## 2. Port Allocation & Architecture

```
                               ┌────────────────────────────────────────┐
                               │              Browser Tab 1             │
                               │   Rider Web Console (React / Vite)     │
                               │          http://localhost:5173         │
                               └───────────────────┬────────────────────┘
                                                   │ Proxy /v1 & /ws/rider
                                                   ▼
┌───────────────────────────────┐      ┌───────────────────────────────┐
│         Browser Tab 2         │      │      Fastify Core Backend     │
│ Driver Web Console (React)    ├─────►│  REST API + WebSocket Gateway │
│     http://localhost:5174     │      │     http://localhost:8080     │
└───────────────────────────────┘      └──────────────┬────────────────┘
      Proxy /v1 & /ws/driver                          │
                                                      ▼
                                       ┌───────────────────────────────┐
                                       │        Storage Layer          │
                                       │   • Dev: PGlite (Embedded)    │
                                       │   • Prod: PostgreSQL 16       │
                                       └───────────────────────────────┘
```

| Service | Workspace Path | Default Port | Description |
|---|---|---|---|
| **Core API & WebSocket** | `services/core` | `8080` | Fastify REST API + WebSocket channels (`/ws/rider`, `/ws/driver`) |
| **Rider Web Console** | `apps/rider-web` | `5173` | Rider Single Page App with Leaflet OSM map & negotiation sheet |
| **Driver Web Console** | `apps/driver-web` | `5174` | Driver Single Page App with presence toggle & offer cards |
| **Protocol Types** | `packages/protocol` | — | Shared types, state machines, and money primitives |
| **PostgreSQL (Optional Dev / Prod)** | `docker-compose.yml` | `5432` | Primary relational store (Docker) |
| **Redis (Optional Dev / Prod)** | `docker-compose.yml` | `6379` | Cache and pub/sub broker (Docker) |

---

## 3. Local Development Mode (Zero-Config / Embedded)

In zero-config mode, the core backend automatically starts with an embedded WASM PostgreSQL instance (`PGlite`), requiring **zero background databases or Docker containers**.

### Step 1: Install Dependencies
From the repository root:
```bash
pnpm install
```

### Step 2: Initialize Database & Seed Pilot City Data
```bash
# Run database schema migrations
pnpm --filter @chalo/core db:migrate

# Seed Bengaluru pilot city, 6 vehicle fare cards, and demo accounts
pnpm --filter @chalo/core seed
```

Output:
```
applied 0001_init (18 statements)
applied 0003_ratings (1 statements)
applied 0004_request_platform_fee (2 statements)
migrations complete
seeded: city=1 Bengaluru, 6 fare cards, rider + 3 approved drivers
login phones — rider: +919900000001 | drivers: +919900000101, +919900000102, +919900000103
dev OTP for everyone: 123456
```

### Step 3: Start Services

Open **three separate terminal windows** (or use your IDE's terminal split):

#### Terminal 1 — Core Backend (Port 8080):
```bash
pnpm --filter @chalo/core dev
```
*Expected log:* `[core] listening on :8080 (storage: pglite)`

#### Terminal 2 — Rider Web Console (Port 5173):
```bash
pnpm --filter rider-web dev
```
*Expected URL:* `http://localhost:5173/`

#### Terminal 3 — Driver Web Console (Port 5174):
```bash
pnpm --filter driver-web dev
```
*Expected URL:* `http://localhost:5174/`

---

## 4. Local Development Mode (with Docker PostgreSQL & Redis)

If you prefer testing against real PostgreSQL 16 and Redis containers:

### Step 1: Launch Containers
```bash
docker compose up -d
```

### Step 2: Set Environment Variables
Create `services/core/.env`:
```env
PORT=8080
DATABASE_URL=postgres://chalo:chalo@localhost:5432/chalox
JWT_SECRET=super-secret-dev-key-rotate-in-production
NODE_ENV=development
```

### Step 3: Migrate & Seed PostgreSQL
```bash
pnpm --filter @chalo/core db:migrate
pnpm --filter @chalo/core seed
```

### Step 4: Start Services
```bash
pnpm --filter @chalo/core dev
pnpm --filter rider-web dev
pnpm --filter driver-web dev
```

---

## 5. End-to-End Walkthrough Guide

Follow this walkthrough across two browser tabs to test the full negotiated ride flow.

### Pre-Seeded Test Credentials

| Role | Phone Number | Vehicle Class | Dev OTP | Initial Wallet Balance |
|---|---|---|---|---|
| **Rider** | `+919900000001` | — | `123456` | ₹500 (Pre-seeded) |
| **Driver 1** | `+919900000101` | `BIKE` | `123456` | ₹100 (Float) |
| **Driver 2** | `+919900000102` | `AUTO` | `123456` | ₹100 (Float) |
| **Driver 3** | `+919900000103` | `CAB_MINI` | `123456` | ₹100 (Float) |

---

### Step-by-Step Flow

#### Phase A: Driver Setup (Tab 1)
1. Open `http://localhost:5174/` in your browser.
2. Enter driver phone `+919900000101` and click **Send OTP**.
3. Enter OTP `123456` and click **Verify & drive**.
4. In the top bar, click the toggle switch to flip from **`OFFLINE`** to **`ONLINE`**.
5. The live green status dot indicates your position is streaming over WebSocket to the dispatch engine.

#### Phase B: Rider Booking & Negotiation (Tab 2)
1. Open `http://localhost:5173/` in a second browser window/tab.
2. Enter rider phone `+919900000001`, click **Send OTP**, enter `123456`, and click **Verify & sign in**.
3. **Set Route on Map:**
   - **Click 1 on map**: Sets **Pickup (P)** marker.
   - **Click 2 on map**: Sets **Drop (D)** marker.
4. The vehicle quotes carousel appears (Bike, Auto, Cab Mini, etc.) showing distance, ETA, and list fare.
5. Click **Bike** to open the **Offer Sheet**:
   - Notice the breakdown: Trip Fare + Platform Fee with the `ℹ` info explainer.
   - Click the **Soft floor** chip, or enter any custom offer (e.g., `₹15`).
   - Click **Offer ₹15 & negotiate**.
6. The matching screen opens with an animated progress bar and live countdown timer.

#### Phase C: Driver Receives & Counters (Tab 1)
1. Switch to the Driver Tab (`http://localhost:5174/`).
2. An incoming offer card instantly slides in:
   - Displays `₹15 your take-home`, distance to pickup, and trip distance.
   - Tap **COUNTER** $\to$ enter `₹40` $\to$ click **Send counter**.

#### Phase D: Rider Accepts Counter (Tab 2)
1. Switch back to the Rider Tab.
2. A counter modal appears: **`Driver countered — ₹40 (Round 1 of 3)`** with a ticking progress ring.
3. Click **Accept ₹40**.
4. The rider screen transitions to **`Driver on the way`**:
   - Displays driver name, vehicle plate (`KA010101XY`), ★ rating, and the **6-digit Start OTP** (e.g., `383102`).
   - Displays the transparent fare breakdown: `Agreed fare ₹40` + `Platform fee ₹5` = `Total ₹45`.

#### Phase E: Trip Lifecycle & OTP Verification (Tab 1 $\to$ Tab 2)
1. In the Driver Tab, click **`I'm on my way (ARRIVING)`**.
2. Click **`I have arrived (ARRIVED)`**.
3. The driver console prompts: *"Ask rider for their 6-digit OTP"*.
4. Enter the 6-digit OTP shown on the Rider's screen $\to$ click **Start ride**.
5. Both screens transition to **`On your ride` / `Ride in progress`**.
6. In the Driver Tab, click **`Complete ride`**.

#### Phase F: Rating & Ledger Reconciliation (Both Tabs)
1. In the Driver Tab:
   - Displays *"Ride complete — earnings updated"*.
   - In the top bar, click the earnings chip to open the drawer: balance reflects **`₹140 · 1 trips`** ($+₹40$ take-home pay earned).
2. In the Rider Tab:
   - Displays the completion summary with % discount saved vs list price.
   - Select a tip (or no tip), tap **★ 5 stars**, and click to submit.

---

## 6. Production Deployment Mode

### Environment Variables

Configure these variables in your production environment or container orchestrator:

| Variable | Type | Default | Production Example | Description |
|---|---|---|---|---|
| `PORT` | `number` | `8080` | `8080` | Core HTTP / WebSocket listening port |
| `DATABASE_URL` | `string` | Unset (PGlite) | `postgres://user:pass@db:5432/chalox?sslmode=require` | PostgreSQL 16 connection string |
| `JWT_SECRET` | `string` | Dev key | `openssl rand -hex 32` | 256-bit secret for auth tokens & HMAC quote tokens |
| `NODE_ENV` | `string` | `development` | `production` | Enables production optimizations & disables dev endpoints |
| `CORS_ORIGIN` | `string` | `*` | `https://rider.chalo-x.com,https://driver.chalo-x.com` | Allowed CORS origins |

---

### Production Build Steps

```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Compile TypeScript and build production static bundles
pnpm build
```

Build outputs:
- `apps/rider-web/dist/` — Optimized production assets for the rider app
- `apps/driver-web/dist/` — Optimized production assets for the driver app

---

### Running Production Core Service

```bash
cd services/core
NODE_ENV=production DATABASE_URL=postgres://... node --experimental-strip-types src/server.ts
# or via tsx:
pnpm --filter @chalo/core start
```

---

### Reverse Proxy Configuration (Nginx Example)

```nginx
# Upstream Fastify Backend
upstream core_backend {
    server 127.0.0.1:8080;
    keepalive 32;
}

# 1. Rider Console (rider.chalo-x.com)
server {
    listen 443 ssl http2;
    server_name rider.chalo-x.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/rider.chalo-x.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rider.chalo-x.com/privkey.pem;

    # Static SPA assets
    root /var/www/chalo-x/apps/rider-web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # REST API Proxy
    location /v1/ {
        proxy_pass http://core_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket Gateway Proxy
    location /ws/ {
        proxy_pass http://core_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}

# 2. Driver Console (driver.chalo-x.com)
server {
    listen 443 ssl http2;
    server_name driver.chalo-x.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/driver.chalo-x.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/driver.chalo-x.com/privkey.pem;

    # Static SPA assets
    root /var/www/chalo-x/apps/driver-web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /v1/ {
        proxy_pass http://core_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://core_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

---

## 7. Automated Testing & Verification

The repository includes three layers of automated test suites:

### 1. Protocol Unit Tests (Money, FSMs, Invariants)
```bash
pnpm --filter @chalo/protocol test
```
*Tests money clamping, ₹0 calculations, legal/illegal FSM transitions, and haversine calculations.*

### 2. Core Full Verification Suite (64 Assertions)
```bash
pnpm --filter @chalo/core test:verify
```
*Tests cryptographic token signing, trip state progression, OTP salted hashing, double-entry ledger balance, and all 10 live API negotiation scenarios.*

### 3. Full Monorepo Typecheck & Production Build
```bash
pnpm typecheck
pnpm build
```

---

## 8. Troubleshooting & FAQ

#### Q1: `Error: listen EADDRINUSE: address already in use 127.0.0.1:8080`
Another instance of `core-api` is already running on port 8080.
- **Windows:**
  ```powershell
  Get-Process node | Where-Object {(Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue).OwningProcess -contains $_.Id} | Stop-Process -Force
  ```
- **macOS / Linux:**
  ```bash
  lsof -ti:8080 | xargs kill -9
  ```

#### Q2: `RuntimeError: Aborted() in PGlite`
This occurs if an embedded PGlite process was terminated mid-write leaving a dirty file lock.
- Reset the local data directory:
  ```bash
  rm -rf services/core/.chalo-data
  pnpm --filter @chalo/core db:migrate
  pnpm --filter @chalo/core seed
  ```

#### Q3: Driver console shows "Using default location"
Desktop browsers may block the HTML5 Geolocation API on non-HTTPS origins or without user permission.
- The driver console automatically falls back to the seeded Bengaluru pickup coordinates (`12.9352, 77.6245`) so dispatch and testing remain fully functional on local desktop browsers.

#### Q4: How do I test with multiple drivers?
Open additional browser tabs on `http://localhost:5174/` and sign in with:
- Driver 2: `+919900000102` (Auto)
- Driver 3: `+919900000103` (Cab Mini)
Both will receive dispatch offers for their respective vehicle classes in real-time.
