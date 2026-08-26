# Chalo-X Platform Run Guide

Complete operational guide to running, developing, testing, and deploying the Chalo-X ride-hailing platform with price negotiation.

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Monorepo Architecture & Hot Reloading](#2-monorepo-architecture--hot-reloading)
3. [Do You Need Docker for Development? (No Rebuilds)](#3-do-you-need-docker-for-development-no-rebuilds)
4. [Local Development: Single-Command Quickstart](#4-local-development-single-command-quickstart)
5. [Local Development: Using Docker for PostgreSQL & Redis](#5-local-development-using-docker-for-postgresql--redis)
6. [End-to-End Multi-Client Walkthrough Guide](#6-end-to-end-multi-client-walkthrough-guide)
7. [Production Deployment Mode](#7-production-deployment-mode)
8. [Automated Testing & Verification Suite](#8-automated-testing--verification-suite)
9. [Troubleshooting & FAQ](#9-troubleshooting--faq)

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

## 2. Monorepo Architecture & Hot Reloading

The project is configured as an integrated **Monorepo** managed with **Turborepo** (`turbo.json`) and **pnpm workspaces** (`pnpm-workspace.yaml`).

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

### How Hot-Reloading Works Across Workspaces

| Workspace | Technology | Feedback Loop | How Changes Are Handled |
|---|---|---|---|
| **Backend Core** (`services/core`) | `tsx watch src/server.ts` | **< 100ms** | Watches TypeScript files and restarts instantaneously on file save. |
| **Rider Web** (`apps/rider-web`) | Vite React HMR | **< 50ms** | Instant updates in the browser without losing component state. |
| **Driver Web** (`apps/driver-web`) | Vite React HMR | **< 50ms** | Instant updates in the browser. |
| **Shared Protocol** (`packages/protocol`) | TypeScript Source Alias | **Instant** | Editing a shared type, money formula, or FSM transition updates both web apps and the backend with **zero rebuilds**. |

---

## 3. Do You Need Docker for Development? (No Rebuilds)

### ❌ **NO Docker Required During Development**
You **never need to build or rebuild Docker images** while developing or testing features.

#### Why You Don't Need Docker in Development:
1. **Zero-Config Embedded Database**: We engineered the backend with a dual-mode storage engine (`storage.ts`). When `DATABASE_URL` is unset, the backend runs **embedded WASM PostgreSQL (`PGlite`)** directly inside the Node process.
   - All database tables, SQL queries, constraints, and migrations run natively on your machine without a database server or container.
2. **In-Memory Messaging & Presence**: Dispatch ring search and WebSocket channels run directly in memory.
3. **Where Docker IS Used (Optional / Production Only)**:
   - Docker is provided in `docker-compose.yml` for **production staging** (running a standalone PostgreSQL 16 server and Redis instance on Linux/AWS).
   - Even in Docker mode, it only runs the database service — your application code is never packaged into containers during development.

---

## 4. Local Development: Single-Command Quickstart

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

### Step 3: Start the Entire Platform with Turborepo

Run a single command:
```bash
pnpm dev
```

Turborepo concurrently starts all three services in parallel with color-coded live logs:
```
@chalo/core:dev: [core] listening on :8080 (storage: pglite)
rider-web:dev:   ➜  Local:   http://localhost:5173/
driver-web:dev:  ➜  Local:   http://localhost:5174/
```

> **Individual Services:** If you prefer running services in separate terminals, you can run:
> - Backend: `pnpm --filter @chalo/core dev`
> - Rider App: `pnpm --filter rider-web dev`
> - Driver App: `pnpm --filter driver-web dev`

---

## 5. Local Development: Using Docker for PostgreSQL & Redis

If you prefer testing against real PostgreSQL 16 and Redis containers:

### Step 1: Launch Containers
```bash
docker compose up -d
```

### Step 2: Set Environment Variables
Create `services/core/.env` (or copy from `services/core/.env.example`):
```env
PORT=8080
DATABASE_URL=postgres://chalo:chalo@localhost:5432/chalox
JWT_SECRET=super-secret-dev-key-rotate-in-production
NODE_ENV=development
ENABLE_DEV_ENDPOINTS=1
```
> `ENABLE_DEV_ENDPOINTS=1` is **required for dev OTP logins (123456)** and the
> wallet top-up button. Without it, login returns `OTP_UNAVAILABLE`. Never set
> it on a deployed environment.

### Step 3: Migrate & Seed PostgreSQL
```bash
pnpm --filter @chalo/core db:migrate
pnpm --filter @chalo/core seed
```

### Step 4: Start Platform
```bash
pnpm dev
```

---

## 6. End-to-End Multi-Client Walkthrough Guide

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

## 7. Production Deployment Mode

### Environment Variables

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
NODE_ENV=production DATABASE_URL=postgres://... pnpm start
```

---

### Reverse Proxy Configuration (Nginx Example)

```nginx
upstream core_backend {
    server 127.0.0.1:8080;
    keepalive 32;
}

# Rider Console (rider.chalo-x.com)
server {
    listen 443 ssl http2;
    server_name rider.chalo-x.com;

    ssl_certificate /etc/letsencrypt/live/rider.chalo-x.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rider.chalo-x.com/privkey.pem;

    root /var/www/chalo-x/apps/rider-web/dist;
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

# Driver Console (driver.chalo-x.com)
server {
    listen 443 ssl http2;
    server_name driver.chalo-x.com;

    ssl_certificate /etc/letsencrypt/live/driver.chalo-x.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/driver.chalo-x.com/privkey.pem;

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

## 8. Automated Testing & Verification Suite

```bash
# 1. Full 64-assertion verification suite (covers all invariants, state transitions, ledger balance, and live API flows)
pnpm --filter @chalo/core test:verify

# 2. Protocol unit tests (money clamping, ₹0 formulas, legal/illegal FSM transitions)
pnpm --filter @chalo/protocol test

# 3. Monorepo TypeScript check & production build verification
pnpm typecheck
pnpm build
```

---

## 9. Troubleshooting & FAQ

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
