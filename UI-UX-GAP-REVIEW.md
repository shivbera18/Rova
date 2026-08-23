# Chalo-X — UI/UX Gap Review

> Scope: `apps/rider-web`, `apps/driver-web`, and the client-facing surface of `services/core`.
> Method: full source read of every screen/component against the current backend (post Neon migration, post full-flow E2E hardening). Every finding cites file + line evidence.
> Verdict up front: **the backend contract is now ahead of the UI.** The negotiation/dispatch/settlement engine is genuinely solid, but both consoles are still *demo-grade*: one headline feature (tipping) is dead UI, riders cannot cancel after a driver is assigned, ratings never actually move, and neither app would survive a real phone screen or a dropped socket. Nothing here blocks the engine — all of it blocks a stranger using the product.

---

## 1. Where things stand (context for this review)

The heavy backend risks from the previous architecture review are closed: expiry sweeper ships (1s interval in `server.ts`), rounds increment and are enforced (`negotiation.ts:109,239`), ledger writes run inside transactions (`ledger.ts:32-53`), KYC/role gates exist, quote tokens are verified, settlement is idempotent, and a 66-check full-flow E2E suite (`src/e2e-fullflow.ts`) runs against real Postgres. **Engine: done for v1. Client surface: not done.**

What exists today, client-side:

| Surface | Ships today |
|---|---|
| rider-web | Map click → quotes → offer sheet (₹0 floor) → WS matching + counter modal → OTP display → fare breakdown → star rating → history list |
| driver-web | Login → online toggle → hotspot position pills → live offer cards w/ chime + counter → trip panel (ARRIVING→ARRIVED→OTP entry→complete) → earnings drawer |

---

## 2. P0 — broken promises a real user hits on day one

### U1. Tipping is dead UI (rider) — and always-zero by construction (driver)
`Book.tsx:442` renders tip chips (`No tip / +₹10 / +₹20 / +₹50`) that only call `setTipPaise(...)` — **no API call ever carries the rider's tip**. Meanwhile the only completion path is `TripPanel.tsx:161`: `api.completeTrip(trip.id, 0)` — the driver always settles with tip 0. Net effect: the `FareLines` "Driver Tip" row (`Book.tsx:517`) can never render, and the product's goodwill moment silently does nothing.
**Fix:** either add `POST /v1/trips/:id/tip` (rider-side; posts an idempotent TIP txn pair — the ledger already supports reason `TIP` in `settlementLines`) with a confirmation state, or delete the chips until it exists. Shipping the current UI is worse than shipping none: users think they tipped.

### U2. A matched rider cannot cancel the trip — there is no such endpoint
`/v1/requests/:id/cancel` only fires pre-agreement (`server.ts:335` gates on `state IN ('MATCHING','NEGOTIATING')`). The trip FSM allows `CANCELLED_RIDER` from every pre-COMPLETED state (`protocol/negotiation.ts:87-89`), but **no route implements it** — only `/v1/trips/:id/cancel-driver` exists. Once `driver.assigned` lands, the rider's only options are to take the ride or close the tab while the driver drives over.
**Fix (backend + UI):** add `POST /v1/trips/:id/cancel-rider` using the driver-cancel route as the template (transition + `releaseClaim` + push both sockets), optionally free-before-`ARRIVED`, and put a Cancel button on the rider trip panel.

### U3. The start OTP can vanish mid-wait — riders will miss rides
`GET /v1/trips/:id` deliberately omits `otp` (only the WS `driver.assigned` frame carries it). The rider polls every 3s (`Book.tsx:137-146`) and each refresh replaced the trip object — dropping the OTP from screen while the driver sits at pickup asking for it. *(Patched in commit `f7a4b64` by merging `otp` across poll refreshes — any future refactor of that polling loop must preserve this.)*
**Residual risk:** a page reload during ARRIVING still loses the OTP forever (WS frame gone, GET won't return it). `regenerate-otp` exists but has **no button anywhere in either app**. Add a "Show new OTP" affordance pre-start.

### U4. Ratings are write-only theater
`POST /v1/trips/:id/rate` inserts into `ratings` and nothing else — **`users.rating_rolling` is never recomputed**. Dispatch offers (`server.ts:384`) and trip views (`server.ts:861`) read `rating_rolling`, so every seeded 4.8/4.9 stays frozen no matter what happens. Worse, `EarningsDrawer.tsx:61` doesn't even read it — it hardcodes `★ 4.9` and invents a `100% Keep Rate` stat.
**Fix:** recompute rolling average on rate (simple `AVG(stars)` or exponential decay), expose `rating` in `/v1/driver/me`, render the real number everywhere. Fake stats in a money app destroy trust the first time two drivers compare notes.

### U5. Receipts have no time, no date, no payment method
`tripView()` (`server.ts:569-587`) returns neither `startedAt`/`endedAt` nor `paymentMethod`, even though both sit on the trip row and in the protocol's `TripView`. So rider History (`History.tsx`) is an undated list of identical-looking fares, and the driver's "Recent Trip Receipts" (`EarningsDrawer.tsx:80-92`) can't distinguish a CASH ride (money owed via receivable) from a UPI ride (already settled). For a product whose pitch is honest money, receipts that can't answer *"when?"* and *"paid how?"* are the most visible gap.
**Fix:** extend `tripView` with `paymentMethod`, `startedAt`, `endedAt`; render both surfaces.

---

## 3. P1 — missing features that decide whether the product works

### Rider app

| # | Gap | Why it matters | Suggested cut |
|---|---|---|---|
| R1 | **Wallet has no top-up flow.** `WALLET` is selectable at booking but the balance is whatever seed granted; there's no add-money screen, no balance shown before choosing, and **no server-side balance check** — a ₹0 wallet debits `user:<id>:WALLET` into negative silently via `settlementLines` (`ledger.ts:81`) | A money feature that can't be funded, plus an integrity hole | Show balance next to the WALLET option; reject with `INSUFFICIENT_FUNDS` in `/v1/requests` when `walletBalance < listPrice`; top-up stub later |
| R2 | **No "use my location"** — pickup/drop are manual map clicks or 3 hardcoded routes (`Book.tsx:28`) | First-run friction on mobile is fatal | `navigator.geolocation` button + reverse-geocode placeholder |
| R3 | **No live driver tracking polish** — driver marker moves via 3s poll of an in-memory registry; no route polyline, no pickup ETA countdown even though `etaMin` exists in quotes | The #1 expectation from any ride app | The protocol already defines WS `trip.location` — it is never sent. Emit driver positions on it and render a trail/ETA |
| R4 | **No rider-side alert** when a driver accepts or counters — the driver console plays a chime (`OfferCard.tsx:10`), the rider who is *waiting* gets silence and a tiny text change | Counters expire in 20s; missed = lost ride | Reuse the chime pattern + browser Notification permission |
| R5 | **Silent WS degradation** — `useRiderSocket` reconnects with backoff but renders nothing (`ws.ts:36-40`); a rider whose socket died sees a frozen "Broadcasting…" panel with a ticking countdown | Looks alive while dead | Connection banner wired to socket state (driver app already tracks this — copy it) |
| R6 | Negotiated-total preview missing: CounterModal receives `quote={null}` during matching, so the "≈ total incl. platform fee" line never shows exactly when riders are deciding | Decision-critical info hidden at the decision moment | Persist quote through matching (partially done in `f7a4b64`) and compute the `negotiatedQuote` preview |
| R7 | No receipt detail / share / invoice view from History | Post-ride trust moment | Detail route reusing `FareLines` + timestamps (needs U5) |

### Driver app

| # | Gap | Why it matters | Suggested cut |
|---|---|---|---|
| D1 | **No payout/withdrawal.** Wallet and `CASH_RECEIVABLE` accrue forever; code comments promise receivable "nets against their next payout" — no payout exists anywhere | Drivers won't work for an IOU they can't see settled | Even a manual `POST /v1/driver/payout` moving wallet → `platform:BANK` with a receipt gets v1 there |
| D2 | **No onboarding/KYC path.** New drivers hit the 403 `KYC_NOT_APPROVED` wall with zero UI explaining it; profiles exist only via seed SQL | Growth impossible outside dev | `/v1/driver/onboard` (vehicle class, plate) + pending→approved status screen |
| D3 | **Online state resets on refresh.** The DB persists `online` via `/v1/driver/status`, but `App.tsx:32` initializes `online=false`; a mid-shift page refresh takes the driver off-grid silently | Lost income without noticing | Initialize toggle from `me.profile.online` (already fetched) |
| D4 | Earnings drawer has no aggregation: no today/week totals, no CASH vs digital split — which maps exactly onto `CASH_RECEIVABLE` vs wallet, and that data is already in the journal | "How much did I make today?" is *the* driver question | One grouped query over `journal_entries` by day/reason |
| D5 | `"ALL"` vehicle class ships in the production selector (`App.tsx:28`, "⚡ ALL (Dev)") | Dev artifact invites class-mismatch confusion | Hide behind `import.meta.env.DEV` |
| D6 | Offer chime may be silent: `AudioContext` requires a prior user gesture on mobile browsers (`OfferCard.tsx:12`) | The alert that makes dispatch work may never fire on a phone | Prime the context when toggling online; add vibration fallback |

---

## 4. Cross-cutting UX debt

1. **Session fragility.** Any single 401 wipes the token mid-flow (`api.ts` in both apps) and ejects the user to login — including if the JWT TTL lapses during a long ride. There is no refresh mechanism. Needs sliding expiry or refresh tokens, plus a "session expired, sign back in" interstitial instead of instant ejection.
2. **Mobile form factor.** Both apps are desktop side-panel layouts (fixed-width cards floating over a full map). Riders and drivers are phone-first; without a responsive pass (bottom-sheet pattern, thumb-reachable primary buttons, no hover-dependent interactions) the product is undemoable on the device that matters. Audit each screen with a device toolbar before any external demo.
3. **Not installable.** No PWA manifest / service worker / offline shell. Add-to-homescreen is cheap and high-leverage for this market.
4. **English-only.** Target market is India; driver copy like "Head to Pickup" assumes English literacy. Strings are centralized enough that i18n now is far cheaper than later.
5. **Accessibility gaps.** Tooltips are CSS-hover-only with `tabIndex=0` but no focus/blur wiring or ARIA; status pills carry meaning by color alone; star/chip buttons lack visible focus rings; the OTP display has no copy-to-clipboard or aria-live announcement.
6. **Zero client-side tests.** The engine has 130+ passing checks; the UIs have none. Minimum viable: a Playwright happy path (rider books → driver accepts → ride completes) against the same fixture `test:e2e` boots — the full-flow scenarios map 1:1 to browser flows already.
7. **Night multiplier is invisible.** Pricing applies `night_multiplier` 23:00–05:00 (`pricing.ts:40-41`), but nothing explains why tonight's list price differs from yesterday's. Users already understand surge-style explainers — add one chip.

---

## 5. Explicitly out of scope for v1 (don't pull these forward)

These came up during review and are correctly absent:
- Multi-city support — `city_id` plumbing exists; UI hardcoding Bengaluru is fine for pilot.
- Surge controls, promo codes, referrals, loyalty.
- Chat/call between rider and driver — Google Maps deep-links cover navigation v1.
- Redis GEO dispatch / Redpanda bus swap — single-node in-process dispatch is fine at pilot scale.
- MSG91 SMS integration slot — dev OTP is correct for now. **But hide the `devHint` / "dev: 123456" pill behind `NODE_ENV`** before any external demo; it currently renders unconditionally (`Login.tsx:125`, `/v1/auth/otp/send` response).

---

## 6. Recommended order of attack

| Wave | Items | Outcome |
|---|---|---|
| **1 — honesty fixes** (days) | U1 tip-or-remove · U2 rider cancel endpoint + button · U4 real rolling ratings · U5 receipt fields · regenerate-OTP button · hide dev OTP hint | The product stops lying to its users |
| **2 — survivability** (1–2 wks) | R1 wallet balance check (+display) · R5/D6 connection awareness + alerts · D3 online persistence · session-expiry handling · responsive/mobile pass | Usable on a phone, by a stranger, on flaky networks |
| **3 — growth** (then) | D1 payouts · D2 onboarding/KYC · R2 geolocation · R7 receipt detail · D4 earnings aggregation · i18n · PWA · Playwright suite | Ready for pilots outside the team |

---

## 7. Backend micro-gaps surfaced by this review (small, worth batching)

These are backend fixes discovered while auditing UI expectations — cheap to fix in a single commit batch:
1. `tripView()` missing `paymentMethod` / `startedAt` / `endedAt` (U5).
2. No `cancel-rider` trip route (U2).
3. Rate endpoint never updates `rating_rolling` (U4).
4. `/v1/driver/me` omits rating → forces the hardcoded `★ 4.9`.
5. WS `trip.location` message type defined in protocol, never emitted (R3).
6. No wallet-balance guard on `paymentMethod: WALLET` booking (R1).
7. **Expiry sweeper pushes a fabricated session** — `mode:"NEGOTIATED", round:3, listPrice:0 as never` (sweeper block in `server.ts`) regardless of actual mode; a LIST-price rider's expiry banner literally says "list price ₹0".
8. `createNegotiation` silently cancels the rider's prior live negotiation (`negotiation.ts:41-45`) **without `cancelBroadcast`** — stale driver cards again, same class as the bug fixed in `3806845`.
9. **LIST-mode `ride_requests` are never swept** — the sweeper only expires requests linked to negotiations; orphaned MATCHING rows live forever.
10. Quote tokens are replayable — stateless HMAC, no single-use nonce → one quote can spam unlimited dispatch broadcasts.
11. Zero rate limiting on `/v1/auth/*`, `/v1/quotes`, `/v1/requests` — becomes an SMS-pumping cost hole the moment MSG91 lands.
12. `pos.update` trusts client coordinates blindly (`dispatch.ts`) — drivers can teleport to high-fare pickups.
13. No `/healthz` endpoint and no SIGTERM graceful-shutdown wiring — deploys drop Neon connections abruptly; uptime monitors have nothing to ping.
14. `ioredis` is declared in `package.json` but imported nowhere — dead dependency.
15. Dev endpoints gate on `NODE_ENV !== "production"` — an *unset* NODE_ENV exposes `/v1/dev/*` publicly; invert to an explicit allow-list. CORS likewise reflects any origin (`origin: true`).

---

## 8. Second-pass deep-dive (security, lifecycle, honesty, ops)

### 8a. Trust & security posture

| # | Finding | Impact | Suggested cut |
|---|---|---|---|
| S1 | **WS auth uses the raw JWT in the URL query** (`ws/rider?token=…` on both apps) | Tokens leak into proxy/access logs and browser history; 12h validity (`auth.ts:41`) makes a leaked token long-lived | One-shot WS tickets: `POST /v1/ws/ticket` mints a 60s single-use opaque token for the query string |
| S2 | Tokens live in `localStorage` — readable by any injected script; neither Vite app sets a CSP | Standard XSS → full account theft incl. wallet | Acceptable v1 risk *if documented*; add baseline CSP before real users |
| S3 | **Client GPS is trusted for dispatch** — `pos.update` accepts arbitrary coordinates; a driver can teleport to airport pickups while sitting elsewhere | Corrupts marketplace fairness at its core | Sanity-check jump speed between consecutive updates; flag >200 km/h moves |
| S4 | Quote-token replay (§7.10) lets one client fan out unlimited broadcasts | Dispatch flood DoS against drivers | Mark token consumed (jti) on first successful `/v1/requests` |
| S5 | Password mode auto-registers any fresh phone with "any password ≥ 4 chars" (`Login.tsx:154-156`) — whoever types a claimed phone number first owns it | Account-squatting on a phone-identity system | Require OTP verification to bind the phone before password login activates for it |
| S6 | Demo credentials ship in prod UI: prefilled `+919900000001` (`Login.tsx:11`) and unconditional `dev: 123456` pill | Test creds visible to real users | Gate behind `import.meta.env.DEV` / `NODE_ENV`

### 8b. Lifecycle gaps nobody handles yet

1. **Driver disconnects mid-pickup → orphaned trip.** Presence is in-memory; when the driver's tab closes, the rider's marker freezes silently and the trip sits in ARRIVED forever. No disconnect event, no rider notice, no reassignment. Minimum cut: on driver WS close, sweep their non-terminal trips and push a `driver.offline`/cancellation message to the rider.
2. **Server restart amnesia.** A restart wipes `liveDrivers`, `claims`, and all queued offers; DB trips survive but riders stare at frozen maps. Persist presence/claims — or push a `session.reset` message that triggers a client refetch.
3. **Same driver, two tabs:** the second connection silently replaces the first in `driverConns`/`liveDrivers`; tab #1 keeps rendering stale "online" state and can double-accept. Reject duplicate connections or sync via `BroadcastChannel`.
4. **Riders can stack concurrent LIST requests** — only negotiated requests get auto-cancelled by `createNegotiation`. Three taps = three broadcasts = three drivers' phones ringing. Guard: one unresolved request per rider → `REQUEST_ALREADY_LIVE`.
5. **Expired matching is a dead end:** when the countdown hits zero the panel just sits there; the only exits are Cancel or manual reset. Add "Search again" (re-quote same route) as the primary action.

### 8c. Data-honesty bugs in what the screens display

1. **Cancelled trips render as earnings.** `EarningsDrawer.tsx:80-92` lists every trip with `+{formatINR(agreedPaise)}` — including `CANCELLED_*` ones — and rider `History.tsx` shows full fare rows for cancelled rides with no "not charged" distinction. Drivers will believe they earned money they didn't.
2. **The sweeper's fake payload lies twice** (§7.7): wrong mode AND `round:3, listPrice:₹0` — the rider UI will render "Round 3 of 3 · List ₹0" on an expired LIST booking.
3. `completedTrips` counts only COMPLETED trips, but the receipts list mixes everything — the driver's "rides ↔ receipts" math visibly won't add up.
4. Rate/km stat on zero-offers (`OfferCard.tsx:143`) shows `₹0/km` in the same style as real stats — label zero-offers as "Rider's offer" instead of shaming the number that is the product's whole point.
5. `completedTrips > 0` gating in `/v1/driver/me` aside, there is no way to see *which* payment methods money came from — CASH receivable vs wallet is invisible until payouts exist (D1).

### 8d. Ops & deployment notes

1. File-based logging into `services/core/logs/` with no rotation — disk-fill risk on long-running nodes; log to stdout and let the platform aggregate.
2. No `/healthz` — load balancers, uptime monitors, and Neon wake-up probes all want one.
3. No graceful shutdown: wire `SIGTERM/SIGINT` → the existing `handle.close()` so deploys drain sockets and close the pool cleanly.
4. `JWT_SECRET` silently falls back to a known constant (`pricing.ts:14`, likely `auth.ts` too) — if env is missing in production, quote tokens become forgeable and sessions spoofable. Refuse to boot when `NODE_ENV=production` with default secrets.
5. Single hardcoded Neon endpoint in `.env` — document the failover/branch story before pilots depend on the DB.

### 8e. Rapid-fire polish list

- No copy-to-clipboard / share affordance on the OTP display (riders read digits aloud over street noise).
- Cancel Request fires on a single tap — add a short confirm state; accidental taps kill a live broadcast.
- CounterModal lets you type a final offer below your own last offer, then surfaces the raw `OFFER_MUST_NOT_DECREASE` error — clamp the input instead.
- Expired counter modal claims *"Your original offer is still broadcasting"* (`CounterModal.tsx:131`) — often false: if the negotiation expired, the sweeper killed the entire request. Copy should reflect actual state.
- **Driver console has no logout button at all** — the only escapes are the 12h JWT expiring or clearing localStorage manually.
- Rider "← Back to home" (`Login.tsx:195`) navigates to `/`, which requires auth and bounces straight back to `/login` — a dead button.
- Sub-rupee display is inconsistent between chips and totals (`formatINR` rounding) — pick one rule for lowball offers like ₹37.50.
- Trip ID shown to drivers (`TripPanel.tsx:71`) is meaningless to them — swap for rider name + payment method, both already in the payload.

---
*Evidence policy: every claim cites file + line in the current tree; behavioral claims were verified against the running stack (Neon-backed full-flow suite, 66/66 passing at time of writing). Second-pass items in §7.7–15 and §8 were verified by direct source inspection on the same tree.*


