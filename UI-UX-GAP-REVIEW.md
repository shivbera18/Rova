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
