# Chalo-X Review — 26 August 2026

**Scope:** entire monorepo (`packages/protocol`, `services/core`, `apps/rider-web`, `apps/driver-web`, tooling, docs) — code, architecture, and product design.
**Method:** full source read with every finding verified against the current tree (`HEAD 85440e0`); prior reviews (ARCHITECTURE-REVIEW, UI-UX-GAP-REVIEW, FEATURE-GAPS of 2026-08-23) re-checked claim-by-claim rather than trusted.
**Verdict up front:** the engine core (money, FSMs, ledger, concurrency) is genuinely well-built and most August-23 remediations really shipped. But the tree is **not production-ready**: one universal account-takeover backdoor (hardcoded dev OTP), broken live driver tracking on the rider map, several authorization holes on trip endpoints, a self-defeating test suite (`|| true`) and **zero CI**. Product-wise, both consoles are approaching demo-quality, but safety features are decorative, payments are labels without rails, and the differentiator (negotiation) lacks the trust/economics scaffolding that would make it work in a real market.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Is Genuinely Good](#2-what-is-genuinely-good)
3. [Remediation Scorecard (Aug-23 claims vs reality)](#3-remediation-scorecard)
4. [Engineering Findings — Critical](#4-engineering-findings--critical)
5. [Engineering Findings — High](#5-engineering-findings--high)
6. [Engineering Findings — Medium & Low](#6-engineering-findings--medium-low)
7. [Product Gaps — Rider](#7-product-gaps--rider)
8. [Product Gaps — Driver](#8-product-gaps--driver)
9. [Product Gaps — Negotiation Marketplace](#9-product-gaps--negotiation-marketplace)
10. [Platform, Ops & Compliance Gaps](#10-platform-ops--compliance-gaps)
11. [Feature Suggestions (beyond parity)](#11-feature-suggestions-beyond-parity)
12. [Recommended Order of Attack](#12-recommended-order-of-attack)

---

## 1. Executive Summary

| Area | State |
|---|---|
| Money math & ledger | **Strong.** Integer paise, branded types, real DB transactions, unique idempotency keys, append-only journal. Keep. |
| Negotiation/Trip FSMs | **Strong design**, two logic leaks (AGREED-without-trip paths; superseded-negotiation request leak). |
| AuthN/AuthZ | **Weakest layer.** Hardcoded OTP works in every environment; three endpoints skip ownership checks. |
| Rider client | Demo-good; live tracking broken end-to-end (wrong prop + missing WS event); cancel bug destroys screen state. |
| Driver client | Best-in-repo UX momentum; GPS failures ignored; economics lack retention loops. |
| Testing | ~220 assertions exist across protocol/core integration/E2E — **but protocol tests can never fail** (`\|\| true`), rider-web is excluded from typecheck, and there is no CI, no client tests, no load tests. |
| Docs | Honest and mostly accurate; minor drift (Node version, assertion counts). |

The single highest-leverage act available today is **turning on CI** (typecheck + build + all suites on every push); the single highest-risk item is the **ungated dev OTP**.

---

## 2. What Is Genuinely Good

1. **Shared protocol package as the single source of truth** — FSM tables, rules, and money math imported by server *and* both clients; server renders state, clients render pixels. Correct cut.
2. **Branded integer `Paise` everywhere** (`packages/protocol/src/money.ts:5`) — rupee/paise mixups are type errors; no floats in the money path.
3. **Real double-entry discipline** — per-line `CHECK (amount_paise > 0)` (`migrations.ts:129`), DB-level `UNIQUE(idempotency_key)` (`migrations.ts:132`), settlement keyed `settle:<tripId>`, ledger lines inside genuine BEGIN/COMMIT for pg *and* PGlite (`db/storage.ts:59-105`, `ledger.ts:32-52`).
4. **Optimistic-lock CAS on every mutation** (`version`+`state` guards) in both negotiation and trip transitions — correct posture without serializable isolation.
5. **Three-layer expiry defense** — per-stage TTL, lazy check in `requireLive`, 1 s sweeper; events published on each path.
6. **One-shot WS tickets** replacing raw JWTs in URLs; duplicate driver sockets rejected with code `4009`.
7. **Privacy-conscious auth primitives** — HMAC blind-index phone lookup, scrypt + timing-safe compares, per-trip-salted OTP hashes, plaintext OTP column removed.
8. **Storage abstraction** (one `SqlRowClient`, PGlite↔PG swap) keeps the zero-config demo story intact without forking business code.
9. **Honest documentation culture** — ponytail comments mark every shortcut with its upgrade path; in-tree self-critique docs exist and were largely acted upon.
10. **~156-check integration depth** (`verify-all.ts` 90 asserts, `e2e-fullflow.ts` 66 checks) booting real servers, driving multi-party WS flows, races, sweeps, KYC gates, and ledger balance — exceptional for a repo with no CI.

---

## 3. Remediation Scorecard

Status of every fix claimed in the 2026-08-23 reviews:

| Claim | Verdict | Evidence / residual gap |
|---|---|---|
| Expiry sweeper fires FSM EXPIRE | ✅ Present | `server.ts:1195-1218`; **but LIST-mode MATCHING requests still never swept** |
| Round counter increments; max-rounds enforced | ✅ Present | `negotiation.ts:241,110,242-244`; driver counters don't consume a round (fine) |
| Ledger writes inside transactions | ✅ Present | `storage.ts:59-79,94-105`; balance guards exist but see TOCTOU (H4) |
| Role-scoped login + KYC gate + class match | ✅ Present | `auth.ts:49`; `server.ts:163-187,527-557` |
| Plaintext OTP removed; regeneration | ✅ Present | hash-only storage; regen endpoint `server.ts:792-804` |
| Quote tokens single-use | ✅ Present | `quote_token_uses` table, 23505→409 (`server.ts:354-360`) |
| Rate limiting on auth/quotes/requests | ⚠️ Partial | global per-IP 300/min + otp-send buckets; **no limiter on `/v1/auth/otp/verify`, password login, `/v1/quotes`** |
| WS one-shot tickets | ✅ Present | delete-before-validate store `server.ts:70-77` |
| `/healthz` + graceful shutdown + storage close | ✅ Present | `server.ts:130-133,1238-1246,1225-1229` |
| Prod secret guard / CORS allow-list / dev-endpoint flag | ⚠️ Partial | JWT_SECRET guard + CORS allow-list exist; **dev OTP itself is ungated in every env (C1)**; `.env.example` ships `CORS_ORIGIN=*` |
| Wallet guard / tip endpoint / rider cancel | ⚠️ Partial | All exist; **no cancellation fee matrix/free-window tiers**; cancel UI bug (C3) |
| Rolling ratings recompute | ✅ Present | `server.ts:1040-1052`; UI falls back to fake "4.8"/"5.0" defaults |
| Disconnect handling / 4009 / restart recovery | ⚠️ Partial | orphan sweep + grace window + 4009 exist; **no session invalidation** (12 h stateless JWTs survive everything); 4009 leaves driver UI stuck at "CONNECTING…" |
| GPS teleport checks / ceilings / push cleanup | ⚠️ Partial | teleport + offer/fee ceilings + push 404/410 cleanup exist; **counter/final amounts uncapped** |
| PWA manifests/SW + CSP | ⚠️ Partial | manifests + SWs registered; **SW is pass-through (no offline shell)**; CSP is a meta tag allowing `'unsafe-inline' 'unsafe-eval'`; SVG-only icons with combined `any maskable` purpose risk install-prompt rejection |
| Tipping end-to-end | ✅ Present | rider UI → idempotent TIP ledger pair → receipts; driver receipt lacks itemized tip line |

**Score: 10 fully verified, 6 partial, 0 absent.** The Aug-23 remediation wave was real; the residuals are catalogued below.

---

## 4. Engineering Findings — Critical

### C1. Dev OTP backdoor is open in every environment — universal account takeover
`auth.ts:15` defines `DEV_OTP = "123456"`; `server.ts:227` accepts it unconditionally and `server.ts:214` advertises it via `devHint`. Clients auto-fill it (`rider Login.tsx:45`, `driver Login.tsx:33`). The boot guard covers only `JWT_SECRET`. Any deployed instance lets anyone log in as any phone number, choosing either role.
**Fix:** gate the comparison behind the same explicit dev/test flag used for dev endpoints (`NODE_ENV === "test" || ENABLE_DEV_ENDPOINTS === "1"`), stop returning `devHint` outside dev, and stub an SMS-provider interface even if it logs "OTP: NNNNNN".

### C2. Live driver tracking is broken end-to-end on the rider map
Two independent breaks: (a) `Book.tsx:418` passes `driverPos=` while `MapView`'s prop is named `driver` (`MapView.tsx:16-26`) — silently dropped because rider-web is excluded from typecheck (M1); (b) the server **never emits** `trip.location` (zero hits in `services/`), so the WS handler at `Book.tsx:195-197` can never fire. Riders watch a static marker; ETA text comes only from REST snapshots.
**Fix:** rename the prop; relay validated `pos.update`s of the assigned driver to the rider channel as `trip.location`.

### C3. Failed rider cancellation destroys the trip screen
`confirmCancelTrip` sets an error then calls `reset()` unconditionally (`Book.tsx:345-355`), wiping phase and error. A failed cancel dumps the rider onto the booking sheet while the trip continues and polling stops.
**Fix:** reset only on success; keep the user on the trip panel otherwise.

### C4. Trip endpoints missing ownership checks
- `POST /v1/trips/:id/state` (`server.ts:676-690`) and `POST /v1/trips/:id/cancel-driver` (`server.ts:1087-1101`) transition trips without verifying `trip.driver_id` matches the caller — any authenticated driver can move or cancel anyone's trip.
- `POST /v1/trips/:id/rate` (`server.ts:1038`) doesn't verify the rater belongs to the trip — any user can rate any completed trip's participants and skew rolling ratings.
**Fix:** fetch the trip first and enforce membership exactly like the start/complete/OTP routes already do (`server.ts:698,712,769`).

### C5. Protocol test suite can never fail
`packages/protocol/package.json:13`: `"test": "node --test … || true"`. Every money/FSM regression exits 0. Combined with zero CI, the crown jewels of the codebase are unprotected.
**Fix:** remove `|| true`; make CI fail loudly.

### C6. AGREED-without-trip dead ends permanently leak requests and dispatch claims
Counter-as-accept paths return `AGREED` but neither REST handler finalizes: `driverCounter` treats `counter <= offer` as accept (`negotiation.ts:94-97`) and `riderFinalOffer` treats `final >= counter` as accept (`negotiation.ts:119-121`) — yet `server.ts:561-575` and `server.ts:612-631` never call `finalizeAgreement` (the latter even rebroadcasts post-agreement). The sweeper skips non-live rows (`negotiation.ts:146`), so the request stays NEGOTIATING and the driver claim is held forever.
Similarly, `createNegotiation` cancels the rider's prior negotiations (`negotiation.ts:42-46`) without cancelling their `ride_requests` or releasing claims.
**Fix:** call finalize inside accept-by-threshold paths; release claims and expire linked requests for every terminal transition including CANCELLED.

### C7. Platform revenue is rider-controlled on negotiated rides
Negotiated requests accept arbitrary `platformFeePaise >= 0` (`server.ts:333-340`) and `/final` rewrites it again (`server.ts:603-614`). Riders can zero the platform fee on every negotiated ride. This contradicts plan.md §2.1 where the fee is config-derived (`clamp(offer×pct, min, cap)`).
**Fix:** derive the fee server-side from the fare card; ignore client-sent amounts. (Related: `negotiatedQuote`'s clamp makes its percent math dead code — `money.ts:33-36` — so the shared math agrees with nobody.)

### C8. Zero CI, and rider-web isn't even typechecked
No `.github/` directory exists. `apps/rider-web/package.json` has no `typecheck` script, so Turbo silently skips the largest client surface — which is exactly how C2(a)'s prop mismatch survived.
**Fix:** add workflows running `pnpm typecheck && pnpm build && pnpm -r test` + both verification suites; add `typecheck` to rider-web.

---

## 5. Engineering Findings — High

### H1. Money checks are TOCTOU; balances can go negative / double-spend
Wallet bookings check balance at request creation but debit at settlement minutes later (`server.ts:348-352` vs settle path) — concurrent bookings overdraw. Payout reads balance then posts outside a transaction (`server.ts:1157-1164`) — concurrent payouts double-spend. Cash-ride platform fees accumulate on `user:*:POSTPAID` (`ledger.ts:73-78`) with **no collection path anywhere**.
**Fix:** conditional debit inside the posting transaction; payout inside `sql.tx` with balance re-read; design the POSTPAID collection/settlement flow before cash rides ship.

### H2. Missing rate limits on brute-forceable surfaces
`/v1/auth/otp/verify` (OTP guessing), `/v1/auth/login/password` (min length 4, `auth.ts:113`; no limiter beyond the global IP bucket), `/v1/quotes`. SMS-pumping cost hole the moment a real provider lands.
**Fix:** per-phone verify attempts (5/hour), per-IP password limiter with lockout, quotes under the existing ride caps.

### H3. Counter/final offer amounts have no ceiling
Only the initial offer is capped (₹1L, `security.ts:34-36`); counters and finals accept anything (`server.ts:552-553,604`). Junk ₹99-lakh counters flow into broadcasts and fare snapshots.
**Fix:** apply the same ceiling (and sanity ratio vs list price) to counter/final inputs.

### H4. Matching phase has no REST fallback in the rider client
Session state arrives only via WS during matching (`Book.tsx:174-204`); the 3 s poll runs solely in `trip` phase (`Book.tsx:235-250`). A dropped socket during negotiation = missed counters/expiry even though `GET /v1/requests/:id` exists.
**Fix:** poll the request session during `matching` too.

### H5. Late `driver.assigned` hijacks any rider phase
The WS handler unconditionally jumps to trip view (`Book.tsx:188-194`). A straggler acceptance after cancel/expiry yanks a rider back into a phantom trip.
**Fix:** apply only when previous phase is `matching`.

### H6. Production-shipping dev controls (money & KYC)
"+ Add ₹500 (dev)" renders unconditionally (`Book.tsx:557-564`) and `/v1/wallet/topup` is ungated server-side (`server.ts:283-299`) — free money in prod. "Dev Instant Approve" button renders whenever a driver is IN_REVIEW (`OnboardingCard.tsx:109-118`).
**Fix:** wrap in `import.meta.env.DEV`; require the env flag server-side.

### H7. Token storage + CSP = XSS equals wallet theft
Bearer tokens in localStorage (both apps' `api.ts`) while CSP allows `'unsafe-inline' 'unsafe-eval'` via meta tag (`index.html:6` both).
**Fix:** tighten CSP at minimum (drop `unsafe-*`, move style hashes), consider httpOnly cookies + CSRF tokens before public launch.

### H8. Migrations are not versioned
The runner re-executes every DDL blob each boot relying on `IF NOT EXISTS` (`migrate.ts:10-18`); data migration `0007_single_vehicle_cleanup` re-runs every boot (`migrations-integration.ts:29-33`); the `;\n` splitter breaks on embedded semicolons; no safe path for destructive migrations.
**Fix:** schema_migrations table with applied-version tracking; statement splitting via a real parser or one-statement-per-file.

### H9. Postgres TLS does not verify certificates
`ssl:{rejectUnauthorized:false}` (`storage.ts:50`) — remote DB connections are MITM-able. For a Neon-backed money system this is not acceptable at launch.
**Fix:** ship the CA chain and set `rejectUnauthorized: true` (with an explicit opt-out for local dev only).

---

## 6. Engineering Findings — Medium & Low

### Backend
| # | Finding | Evidence |
|---|---|---|
| M1 | LIST-mode MATCHING requests never swept server-side; broadcast dies silently at client-side 90 s | grep: sole expiry write is negotiation-linked (`negotiation.ts:152-155`) |
| M2 | Start-OTP expiry never checked; attempts increment is read-then-write racy past the 5-attempt lock | `trips.ts:156-168` selects only `code_hash, attempts` |
| M3 | Unbounded memory: `wsTickets` evicted only on use; `lastGps` never pruned on unregister | `server.ts:70-77`; `security.ts:12,65` |
| M4 | Event bus has zero subscribers — all `TOPICS.*` publishes are silent no-ops; consumers don't exist yet | `bus.ts:10` sole subscribe match |
| M5 | Auto-seed fires whenever `fare_cards` is empty — demo wallets materialize in an empty prod DB | `server.ts:112-116` |
| M6 | Sync file logging + per-driver-skip logging inside the broadcast loop — hot-path overhead, log flood | `logger.ts:20`; `dispatch.ts:101-145` |
| L1 | Trip history hard-capped `LIMIT 50`, no pagination | `server.ts:1109` |
| L2 | Raw `err.message` returned for 500s; no request body validation (blind casts) → malformed coords become 500s | `server.ts:1184-1193` |
| L3 | Access logs record full URLs including one-shot WS tickets | `server.ts:134-137` |
| L4 | Quote token burned before `ride_request` insert — downstream failure wastes the quote | `server.ts:354-382` |
| L5 | `finalizeAgreement` fabricates driver position at pickup when offline — synthetic GPS shown to riders | `server.ts:898-908` |

### Protocol
| # | Finding | Evidence |
|---|---|---|
| M7 | `sessionTtlS` is a dead knob — documented whole-session cap actually clamps per-stage only; sessions can run 175 s+ vs stated 120 s | `protocol/negotiation.ts:29`; usage `core/negotiation.ts:199` |
| M8 | Dead guard branch admits `DRIVER_COUNTER` from `COUNTERED_RIDER`, contradicting the FSM; fails late as `ILLEGAL_TRANSITION` instead of intended precondition error | `core/negotiation.ts:91` vs table `protocol/negotiation.ts:60-64` |
| M9 | No `Action` union type — typo'd actions compile and fail at runtime; no runtime validation of wire payloads; WS envelopes unversioned; state vocabulary duplicated in three places (api.ts, migrations, rows) | `api.ts:48,134-145`; `migrations.ts:63`; `rows.ts:70` |
| M10 | No `DRIVER_DECLINE` action anywhere — a driver facing a rider's final offer can only accept, expire, or wait; undocumented asymmetry | `protocol/negotiation.ts:53-64` |
| L5 | `rupees()` float-rounding edge (`rupees(1.005)→100`); `paisa()` accepts non-integers; inverted feeMin>feeCap silently resolves to cap | `money.ts:6-18` |

### Clients
| # | Finding | Evidence |
|---|---|---|
| M11 | Driver GPS failures silently swallowed (`() => {}`); denied permission leaves driver at default Koramangala coords receiving bogus offers | `driver App.tsx:123,17-23` |
| M12 | Search/network errors masked as "No matching locations found"; Nominatim called browser-direct (policy-noncompliant, blockable) | `LocationSearch.tsx:81-86,275-279,62-69` |
| M13 | Withdraw flow sends `NaN` for junk input, ignores ₹200 min client-side, failures styled green | `EarningsDrawer.tsx:32,99,112` |
| M14 | Undefined CSS tokens in both themes (`--shadow-xs`, `--paper-subtle`, `--radius-lg/xs`, `--secondary`) — invisible status dots, lost shadows/hovers | rider/driver `styles.css` `:root` blocks |
| M15 | Duplicate-tab 4009 leaves driver UI stuck at "CONNECTING…" forever — reason message never surfaced | `driver api.ts:119`; `App.tsx:171-174` |
| M16 | OfferSheet back-nav discards sibling quotes; countdown timers run off device clock vs server `expiresAt`; hardcoded "of 3" rounds vs configured maxRounds | `Book.tsx:626`; `ws.ts:72-79`; `CounterModal.tsx:103` |
| M17 | Safety panel is decorative: trusted contacts saved to localStorage only (never transmitted), "Share Live Journey" shares bare app URL, copy promises alerts that don't exist | `SafetyPanel.tsx:14-27,58-59` |
| M18 | Hardcoded `localhost:5173/5174` cross-portal links break anywhere but dev machines | `rider App.tsx:99`; `driver App.tsx:314`; `Login.tsx:163` |
| L6 | Faked rating fallbacks "4.8"/"5.0"; duplicated token-key literal; clickable `<div>` quote rows without keyboard semantics; `.desktop-alert` class has no CSS; OTP input says "4-Digit" but slices 6; leftover emoji glyphs `⏱` despite lucide migration | various (see evidence column of agent reports) |
| L7 | English-only UI, zero i18n scaffolding — India-first product | all screens |

### Tooling & docs
| # | Finding | Evidence |
|---|---|---|
| M19 | No lint/format setup anywhere (eslint/prettier/biome/editorconfig) — style drift already visible (emoji remnants) | repo glob |
| L8 | GUIDE.md says Node ≥20 vs engines `>=22`; README/GUIDE say "64-assertion" suite vs actual 90 asserts / 66 checks | `GUIDE.md:25,343`; `README.md:89` |
| L9 | docker-compose positioned as "production staging" yet hardcodes `chalo/chalo` credentials and publishes 5432/6379 on all interfaces; `.env.example` defaults `CORS_ORIGIN=*` | `docker-compose.yml:5-16`; `.env.example:25` |

---

## 7. Product Gaps — Rider

Ordered by what a real Indian rider hits first:

1. **Live tracking is broken (C2)** — the #1 ride-app expectation. Marker static, no polyline animation, ETA from REST snapshots only.
2. **Payment methods are labels, not rails.** "UPI" never fires an intent/collect; no gateway connected; WALLET funded only by a dev button. Cash collection isn't confirmed by the driver at completion.
3. **Insufficient funds discovered at submit time.** Wallet balance sits on the booking sheet but OfferSheet never pre-warns; server 402 arrives after the fact (`OfferSheet.tsx:265-273`).
4. **No live supply signal while matching.** Generic radar card; rivals show nearby-driver counts/bubbles. Compounds C2.
5. **Cancellation is policy-less.** No free-window countdown, no reason capture, no fee communication; cancel confirmation resets the screen on failure (C3).
6. **Safety is brochureware.** No in-trip SOS button, contacts never leave the device, share link isn't a live-trip link, no driver photo/verification display (M17).
7. **Receipts can't be saved/downloaded.** Share copies text; no PDF/print invoice, no SMS/email receipt — GST-era expectation. End timestamp returned by API but never rendered.
8. **Reload during an active trip drops you back to booking.** No active-trip recovery on mount (regenerate-OTP button exists but nothing restores phase).
9. **English-only.** Ola/Rapido lead with Hindi/regional toggles; strings are centralized enough that i18n now is far cheaper than later.
10. **Address quality:** reverse-geocoded readable names for pinned points missing; search depends on browser-direct Nominatim (fragile).

## 8. Product Gaps — Driver

1. **Drivers see raw coordinates, not addresses** — pickup/drop render as `12.9352, 77.6245` (`TripPanel.tsx:98-103`); place labels never travel in offers (`protocol/api.ts:62-76`). A driver cannot find the rider without opening Google Maps.
2. **No contact channel** — no masked call/chat to the rider anywhere; only external Maps deep-link for navigation.
3. **GPS failures silently ignored (M11)** — driver can sit online at default coordinates receiving undeliverable offers.
4. **No driver-initiated cancellation** — `CANCELLED_DRIVER` is reachable only via the disconnect sweep; no reasons, no penalty visibility.
5. **Economics lack retention loops** — four flat numbers in the earnings drawer; no daily/weekly targets, incentive progress, or demand heatmap (five static hotspots).
6. **Online toggle doesn't survive refresh client-side** — server persists it, UI ignores it (`App.tsx:26` vs persisted profile) — silent off-grid mid-shift.
7. **Cash handling undefined** — receivable accrues with no reminder/collection/reconciliation moment at trip end.
8. **Duplicate-tab lockout is a dead end** (M15) — a driver who opens a second tab loses the first with no explanation.

## 9. Product Gaps — Negotiation Marketplace

This is the product's differentiator; it currently has the least supporting scaffolding:

1. **No acceptance-probability guidance.** Soft floor exists server-side; riders get no "low offers rarely accepted" nudge, no success-rate hints per price point.
2. **Single-counterplier lock-in.** First counter captures the rider modal; no multi-bid comparison (Uber-style bidding needs ≥2 visible options to feel like a market).
3. **Driver-side filters absent** — no minimum-offer threshold, no decline-score routing (plan.md §2.5 documented, unimplemented).
4. **No abuse throttling** — always-₹0 riders face zero friction (no discount budget, no throttle ladder).
5. **Zero-offer UX is honest but unsupported economically** — no platform-funded subsidy engine, no incentive stacking, no demand-context ("slow hour — ₹40 beats nothing") messaging.
6. **Expiry fallback missing** — expired negotiation dead-ends instead of offering one-tap "Book at list price" re-dispatch.
7. **Fee explainer inconsistency (C7/H)** — the ℹ️ story promises a transparent computed fee; the API accepts whatever the client claims. The narrative and the math must agree before launch.
8. **Round/expiry truthiness** — UI hardcodes "of 3", device-clock countdowns drift, `sessionTtlS` cap is decorative (M7/M16).

## 10. Platform, Ops & Compliance Gaps

| Gap | Why it blocks | Priority |
|---|---|---|
| CI pipelines (none exist) | Every quality gate is manual; regressions already shipped to main unnoticed (C2a) | **P0** |
| Real OTP/SMS provider slot | Dev OTP backdoor is the launch blocker (C1) | **P0** |
| Session invalidation / refresh rotation | 12 h stateless JWTs survive password change, block, logout | **P0 before scale** |
| Redis-backed presence/claims/rate-limits | In-process everything; single replica ceiling | **P0 before horizontal scale** |
| Admin/ops-lite console (KYC queue, trip inspector) | Drivers currently approve themselves via dev button; disputes unadjudicable | **P0 before pilot** |
| Payment gateway + payouts execution | Labels without rails; drivers work for IOUs | **P0 for pilot** |
| Observability: metrics, traces, SLO alerts, log aggregation to stdout | File logger only; no alerting on business golden signals (match-rate, agreement-rate, take-rate) | **P0** |
| DPDP data export/delete workflow | Planned only | **P0 for compliance** |
| OpenAPI/API reference | None | P1 |
| Load testing (k6/artillery) | Dispatch fan-out and sweeper unvalidated beyond toy volumes | P1 |
| Backup/PITR runbook + failover story for managed PG | Undocumented | P1 |
| Accessibility conformance (WCAG AA audit) | Focus rings ship; screen-reader pass unverified | P1 |

---

## 11. Feature Suggestions (beyond parity)

Grouped by leverage on the core differentiator vs market parity.

### A. Features that weaponize negotiation (differentiate, don't copy)
1. **Acceptance-probability meter** — show riders "≈72% accepted at this hour" per offer using historical discount curves; nudges toward matchable prices and raises match rate without hard floors.
2. **Multi-bid marketplace round** — collect up to 3 driver counters simultaneously for 20 s, show them side-by-side with ETAs/ratings; converts negotiation from haggle to auction and justifies the product's existence visually.
3. **Rider loyalty pricing** — fee-free trips after N paid fees ("your 10th ride fee's on us"), turning the fee explainer from apology into program; ledger-ready (`PROMO_EXPENSE` legs).
4. **Driver "offer memory"** — remember per-driver accept patterns and route offers accordingly (decline-score routing from plan.md §2.5), reducing notification fatigue.
5. **Time-shifted booking with locked price** — "book tonight 10 PM at ₹X (locked)" — negotiation fits scheduled rides better than street-hail urgency; uses idle supply.
6. **Transparent surge inverse** — publish "supply bonus" hours where accepting low offers earns bonus credit; aligns oversupply with the ₹0-offer philosophy.

### B. Trust & safety (prerequisites for women-safety-led adoption, Rapido's actual growth wedge)
7. **Real SOS pipeline** — press-and-hold button, ops alert, emergency-contact SMS, ride-check popups (prolonged stop/off-route detection).
8. **Live trip-share links** — server-issued tokenized pages (auto-expiring, no login) rendering driver/plate/live position; replaces the localStorage theater.
9. **Masked calling / template chat** — number-masking provider or VoIP relay; template-only chat v1 avoids content-moderation surface.
10. **Driver selfie check + rider-visible verification badge** — first-trip-of-day selfie; riders see "Verified" chip with photo, plate, DL-status.

### C. Money & retention loops
11. **UPI collect + AutoPay mandates** — the actual rails behind UPI/WALLET/postpaid; mandates enable subscriptions (saver plans: zero fee on N rides/week).
12. **Driver instant payout (real rails)** — IMPS/UPI pull from nodal balance; the single biggest driver-retention lever.
13. **Referral engine with quality gates** — reward after referee's Nth completed trip (rating/distance thresholds); anti-abuse via device clustering.
14. **GST-compliant invoice PDFs** — async PDF generation + email/SMS delivery; also serves fare-dispute evidence.
15. **Fare-dispute workflow** — freeze payout portion, adjudicate against breadcrumbs, corrective journal entries; support can't exist without it.

### D. Growth surface polish
16. **i18n en/hi (+kn for Bengaluru pilot)** — strings are centralized; regional-language driver app correlates strongly with supply retention in India.
17. **Offline-tolerant PWA shell** — cache app shell + last-known trip state; low-bandwidth mode with reduced polling.
18. **Saved places + recents** — Home/Work presets with map-long-press labeling; highest-frequency tap reducer.
19. **Live supply counts per vehicle class** — kills the "selected class has zero drivers" dead end (also FEATURE-GAPS P0).
20. **Scheduled rides** — scheduler firing T-30 dispatch with pinned price; reuses existing machinery.

---

## 12. Recommended Order of Attack

| Wave | Items | Outcome |
|---|---|---|
| **Wave 0 — this week** (days) | C5 `\|\| true` removal + CI workflow · C8 rider-web typecheck · C1 dev-OTP gating + devHint gating · C4 ownership checks · C3 cancel-reset bug · H6 dev top-up/approve gating | The repo stops lying to itself; worst takeover hole closed |
| **Wave 1 — correctness** (1 wk) | C2 tracking (prop + `trip.location` emit) · C6 finalize-on-accept + claim/request release · C7 server-derived fee · H4/H5 matching REST fallback + assigned-phase guard · H3 counter ceilings · M2 OTP expiry | State machine and money flows become trustworthy end-to-end |
| **Wave 2 — survivability** (1–2 wks) | H1 TOCTOU balance/payout txns · H2 rate limiters · H9 TLS verify · H8 versioned migrations · M11 GPS error surfacing · M15 4009 UX · refresh/session invalidation | Safe to put a real phone in a stranger's hand |
| **Wave 3 — product honesty** (parallel) | Pre-warn insufficient wallet · policy'd cancellations (window + reasons) · real receipts (print/PDF) · active-trip reload recovery · address names in offers/drivers' cards | Users can complete the loop without support tickets |
| **Wave 4 — launch blockers** | SMS provider · payment rails (UPI collect, payouts) · ops-lite KYC/trip console · SOS + trip-share · observability stack | Public pilot eligible |
| **Wave 5 — differentiation** | Acceptance meter · multi-bid round · i18n · supply counts · scheduled rides | The negotiation product becomes defensible |

**Bottom line:** the foundation deserves continued investment — the money and state-machine cores are unusually sound for this stage. But the project's own standard (honesty about money and state) is currently violated by its auth surface, its tracking feature, and its test harness. Wave 0 costs roughly two days and removes every finding in this document that could embarrass the team externally.

---
*Every finding cites file:line evidence verified against the working tree at commit `85440e0` (2026-08-26). Prior-review remediations were re-verified rather than assumed; scorecard in §3.*
