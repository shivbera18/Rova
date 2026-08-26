# Chalo-X — Full Code & Product Review (25 August 2026)

**Scope:** entire monorepo — `packages/protocol`, `services/core`, `apps/rider-web`, `apps/driver-web`, docs, build tooling, and ops posture.
**Method:** full source read of every tracked file, cross-checked against git history and the three prior review documents (`ARCHITECTURE-REVIEW.md`, `UI-UX-GAP-REVIEW.md`, `FEATURE-GAPS.md`, `BUG-REPORT-driver-offer-not-delivered.md`). Every finding cites file + line evidence.
**Verdict up front:** the **backend engine is genuinely solid for a pilot** (FSMs, ledger transactions, quote-replay guard, WS tickets, sweeper all real), but the product took **two steps backward this week**: the 2026-08-23 UI redesign commits silently **deleted most of the rider hardening features that were shipped the same week**, and there are **three live money-integrity holes** (unsettleable completed trips, cash-trip double payment, quote tokens not binding route geometry). A stranger using today's build gets a demo, not the audited product.

---

## 1. Executive Summary

| Area | State | One-line verdict |
|---|---|---|
| Backend domain engine (FSM, ledger, dispatch) | 🟢 Strong | The best part of the codebase; keep and extend |
| Money/settlement integrity | 🟠 3 holes | Complete→settle gap, CASH double-pay, unbound quote geometry |
| Rider app | 🔴 Regressed | Styling commits deleted tips, cancel-after-match, OTP recovery, ratings UI, wallet display |
| Driver app | 🟡 Functional but fragile | Works end-to-end; offer lifecycle bugs cause dead-ends and ghost offers |
| Auth & security posture | 🟡 Good bones, gaps | Tickets/replay/teleport fixed; password brute-force, dev-hint leak, ticket-map leak remain |
| Product honesty | 🟠 Mixed | Real rolling ratings ship, but fabricated plates/ratings/stats still render |
| Ops / CI / testing | 🔴 Missing | No CI at all, no frontend typecheck gate in rider-web, no load tests |

---

## 2. Verification of the 2026-08-23 "remediation" claims

The remediation table at the bottom of `UI-UX-GAP-REVIEW.md` claims all P0/P1 items shipped. Verified status at HEAD:

### Backend claims

| Claim | Status | Evidence |
|---|---|---|
| Expiry sweeper fires FSM EXPIRE | ✅ FIXED | `server.ts:1186–1209` (1s interval); lazy check also in `negotiation.ts:176–190`; truthful expired payloads (`server.ts:1191–1205`) |
| Round increment enforced | ✅ FIXED | `negotiation.ts:241–244` — `RIDER_FINAL` increments round; max-rounds throws |
| Ledger lines inside DB transaction | ✅ FIXED | `ledger.ts:32–52` via `sql.tx`; `db/storage.ts:59–79, 94–105` implements BEGIN/COMMIT for both pg and PGlite |
| Phone+role scoped identity | ✅ FIXED | `auth.ts:63–72` ROLE_MISMATCH on role conflict; KYC + vehicle-class gates via `requireApprovedDriver` (`server.ts:175–187`) |
| OTP hashed only, no plaintext column | ✅ FIXED | `trips.ts:43–45, 101, 106–109`; regenerate resets attempts (`trips.ts:171–183`) |
| Quote token single-use nonce | ✅ FIXED | `quote_token_uses` insert w/ unique violation → `QUOTE_ALREADY_USED` (`server.ts:354–360`) |
| JWT out of WS URLs (one-shot tickets) | ✅ FIXED | `POST /v1/ws/ticket` (`server.ts:250–255`), 60s single-use consumption (`server.ts:72–77`) |
| Rider trip cancel endpoint | ✅ FIXED (API) | `POST /v1/trips/:id/cancel-rider` (`server.ts:764–779`) — but see R-regression below: no UI calls it |
| Idempotent tip endpoint | ✅ FIXED (API) | `server.ts:729–762` with `tip:<tripId>` idempotency key and amount-mismatch rejection — but no UI calls it |
| Rolling rating recompute | ✅ FIXED | `server.ts:1036–1043` recomputes AVG into `users.rating_rolling`; served in `/v1/driver/me` (`server.ts:1133`) |
| Wallet insufficient-funds guard | ✅ FIXED | `server.ts:348–353` returns 402 before booking |
| `/healthz` + graceful shutdown | ✅ FIXED | `server.ts:130–133`, SIGTERM/SIGINT drain (`server.ts:1228–1237`) |
| Production secret boot validation | ✅ FIXED | `server.ts:104–106` refuses weak/default `JWT_SECRET` when NODE_ENV=production |
| CORS allowlist in prod / dev endpoints gated | ✅ FIXED | `server.ts:119–124`, `server.ts:994, 1168` (explicit `ENABLE_DEV_ENDPOINTS=1` or test) |
| Duplicate driver tab rejected 4009 | ✅ FIXED | `server.ts:941–943`; client skips reconnect on 4009 (`apps/driver-web/src/api.ts:117–120`) |
| Disconnected-driver pre-start cleanup | ✅ FIXED | 10s grace then `CANCELLED_DRIVER` sweep + rider push (`server.ts:970–989`) |
| LIST-mode requests swept server-side | ❌ NOT FIXED | Sweeper handles negotiations only (`negotiation.ts:134–166`); LIST `ride_requests` rows stay `MATCHING` forever |
| Re-broadcast offers to late-connecting drivers | ❌ NOT FIXED | Broadcast is one-shot fire-and-forget (`dispatch.ts:94–149`); no recovery endpoint for open offers/negotiations |

### Rider-web claims — **most are FALSE at HEAD**

Git forensics: commit `bd1515e` (Aug 23, 19:48) genuinely implemented tips, cancel-after-match, OTP recovery/regenerate, rating submission, wallet display, OTP copy. Commit `463e5a4` ("fix(ui): fix pickup drop cards styling…", Aug 23, 22:59) rewrote `Book.tsx` and **deleted nearly all of it**, leaving orphaned imports behind. Later redesign commits did not restore them.

| Claim | Status | Evidence |
|---|---|---|
| Tip submission end-to-end | ❌ REGRESSED | `addTripTip` imported (`Book.tsx:11`) but zero call sites; tip chips gone |
| Rider cancel-after-match button | ❌ REGRESSED | `cancelMatchedTrip` imported (`Book.tsx:12`), never called; trip card has no cancel control |
| OTP survives reload / regenerate | ❌ REGRESSED | No mount-time active-trip recovery; phase resets to `pick`; `regenerateTripOtp` imported (`Book.tsx:18`), never called |
| Rating submit UI | ❌ REGRESSED | `rateTrip` imported (`Book.tsx:17`), never called; dead state vars (`Book.tsx:113–115`) |
| Receipts: method/time/detail/share/print | 🟡 PARTIAL | Detail modal + share + method exist (`History.tsx:120–204`); print/invoice absent; `endedAt` never rendered |
| Wallet balance display + top-up | ❌ REGRESSED | Balance fetched (`Book.tsx:117–124`) but never rendered; `topUpWallet` never called |
| Use-my-location | ✅ FIXED | `Book.tsx:358–377` incl. error paths |
| Live driver marker + polyline + ETA | ❌ BROKEN BY BUG | MapView supports it, but Book passes nonexistent prop `driverPos` instead of `driver` (`Book.tsx:309` vs `MapView.tsx:16–26`) → marker/polyline never render. rider-web has **no typecheck script** so nothing catches it |
| Push alerts / reconnect banner / receipt detail / session handling / logout | ✅ FIXED | `push.ts`, `ws.ts:43–57`, `History.tsx:120–204`, `api.ts:39–42`, `App.tsx:42–44` |
| Counter totals preview | 🟡 PARTIAL | OfferSheet shows live totals (`OfferSheet.tsx:229–258`); CounterModal fabricates context — defaults `vehicleClass="BIKE"`, `platformFeePaise=1000` because Book passes neither (`CounterModal.tsx:17–18`, `Book.tsx:565–573`) |
| PWA installable/offline shell | 🟡 PARTIAL | Manifest exists; sw.js fetch handler is pure pass-through (`apps/rider-web/public/sw.js:13–15`) → offline = error page; stale yellow theme colors (`manifest.webmanifest:7–8`) |
| Reduced motion | ❌ MISSING | No `prefers-reduced-motion` rule anywhere; referenced `brut-pulse` keyframes don't exist (`Book.tsx:491`) |
| Dev OTP hint gated | 🟡 PARTIAL | Prefill gated by DEV (`Login.tsx:13`) but server returns `devHint` unconditionally (`server.ts:214`) and client auto-fills whatever arrives (`Login.tsx:42–44`) |
| Cancel confirmation / offer clamp / OTP copy | ❌ NOT FIXED | `showCancelConfirm` dead state (`Book.tsx:118`), cancel fires instantly (`Book.tsx:494–505`); OfferSheet accepts ₹0 driver fee and uncapped platform fee vs Landing's advertised "₹5–₹40 cap" (`OfferSheet.tsx:27–30` vs `Landing.tsx:351–354`); no clipboard usage in Book |

### Driver-web claims

| Claim | Status | Evidence |
|---|---|---|
| Online state restored from profile on refresh | ❌ BROKEN | `App.tsx:25` initializes false; `loadMe()` never calls `setOnline(profile.online)` — refresh takes driver off-grid while DB says online |
| Earnings exclude cancelled + aggregations + real rating | ✅ FIXED | Server aggregates COMPLETED-only (`server.ts:1117–1129`); drawer renders buckets + rating (`EarningsDrawer.tsx:63–94`) |
| ALL vehicle class removed | ✅ FIXED | Selector offers BIKE/AUTO/CAB_MINI/CAB_PRIME (`Login.tsx:95–99`) — note BIKE_LITE / CAB_XL missing from registration though priced in config |
| Chime unlocked by Go Online gesture | 🟡 PARTIAL | Unlock runs in WS offer handler (`App.tsx:80`), not the Go Online click — relies on sticky activation; silent on strict autoplay paths |
| Logout button | ✅ FIXED | `App.tsx:185–187, 291–296` — but doesn't POST `online:false`, leaving DB drift |
| Onboarding/KYC flow | ✅ FIXED | `OnboardingCard.tsx`; approval only via dev endpoint (no production approver exists anywhere) |
| Payout UI | ✅ FIXED | `EarningsDrawer.tsx:29–37, 96–112`; server validates min/balance (`server.ts:1143–1157`) |
| GPS teleport enforced | ✅ server-side | `security.ts:54–66` — but see D-findings: client triggers rejections blindly via hotspot jumps |

---

## 3. Engineering findings — Critical

### C1. Completed trips can become permanently unsettled
`POST /v1/trips/:id/complete` transitions state first, settles second (`server.ts:715–716`). If settlement fails (DB hiccup, crash between the two awaits), the retry path short-circuits: `if (trip0.state === "COMPLETED") return { state:"COMPLETED", duplicate:true }` (`server.ts:713`) — **it never re-runs `settleTrip`**. Driver credited never; rider charged never; invisible unless you reconcile manually.
**Fix:** settle inside the same DB transaction as the final transition, or make the early-return path attempt idempotent settlement (`settleTrip` is already keyed `settle:<tripId>`) before returning duplicate.

### C2. CASH trips pay the driver twice
`settlementLines` CASH path debits `CASH_RECEIVABLE` and credits the driver wallet with the full fare (`ledger.ts:77`) — the comment says the receivable "nets against their next payout," but `POST /v1/driver/payout` moves only WALLET → external bank and **never touches the receivable** (`server.ts:1143–1157`). Net effect: driver collects physical cash from the rider *and* can withdraw the same fare from wallet. Receivable debt accrues forever as an uncollectable number.
**Fix:** payout must net receivable first (payout = wallet − receivable floor), or credit cash fares to a pending account that sweeps into wallet only after platform reconciliation.

### C3. Signed quotes do not bind route geometry
`/v1/requests` verifies the quote token for price but accepts any `pickup`/`drop` the client sends (`server.ts:329–346`). A rider can request a quote for a 1 km route, then book pickup/drop 20 km apart and pay the 1 km price — list price, driver take-home anchor, and platform fee all come from the mismatched token.
**Fix:** embed rounded pickup/drop (or distance bucket) in the token payload (`pricing.ts:91–99` already has `km`) and reject bookings whose coordinates differ materially from the quoted ones.

### C4. Mass rider feature regression disguised as styling fixes
Commit `463e5a4` deleted tip submission, cancel-after-match, OTP reload-recovery, regenerate, ratings, wallet display and OTP copy from `Book.tsx` while keeping dead imports (`Book.tsx:11–18`). This was possible because **rider-web has no `typecheck` script** (`apps/rider-web/package.json` — build is bare `vite build`, esbuild strips types without checking) and **there is no CI anywhere** (no `.github/` directory). Unused imports don't fail builds; deleted features don't fail tests.
**Fix:** restore the `bd1515e` flows into the current design system; add `"typecheck": "tsc -b"` to every package; add CI running typecheck + protocol tests + core verify suite on every PR.

### C5. Live-driver tracking dead via prop typo
`<MapView … driverPos={liveDriverPos}>` (`Book.tsx:309`) vs prop named `driver` (`MapView.tsx:16–26`). During an active trip the rider sees no driver marker and no approach polyline — for a safety-positioned product this is the worst possible silent failure. Same root cause as C4 (no typecheck).

---

## 4. Engineering findings — High

**H1. Fabricated driver identity shown to riders.** `finalizeAgreement` overwrites the live driver record with `name:"Driver", plate:"KA01AB1234", rating:4.8` pinned at the pickup coordinates (`server.ts:889–899`); `tripView` serves these fields (`server.ts:806–827`). Riders see a fake plate/rating for the real person arriving. Fix: pass the authenticated driver's real profile through the agreement path.

**H2. Stale LIST requests accept forever.** Nothing expires `ride_requests` in `MATCHING` (sweeper covers negotiation-linked rows only — `negotiation.ts:144–155`); `/v1/requests/:id/accept` checks only `state==='MATCHING'` (`server.ts:526`). An hour-old broadcast can be claimed. Fix: add `expires_at` handling for LIST rows in the sweeper.

**H3. Expiry/cancel paths don't tell drivers.** The sweeper releases claims but never sends `dispatch.cancel` (`server.ts:1188–1206`); `createNegotiation` cancels a rider's prior negotiation with a raw UPDATE — no cancelBroadcast, no claim release, no pushes (`negotiation.ts:42–46`). Drivers keep ghost offer cards. Only explicit rider decline/cancel fans out (`server.ts:509, 667`).

**H4. Driver never learns of assignment if socket blips.** `finalizeAgreement` pushes `sendPush` to the **rider only** (`server.ts:880–885`); the driver gets a single socket message (`server.ts:886`). A driver who counters then reloads misses the rider's acceptance entirely — trip stalls until rider cancels. Fix: push driver on assignment; expose `GET /v1/drivers/me/active-trip|open-negotiations` for reconnect recovery.

**H5. Driver app drops the rider's final offer.** Offers dedupe by `requestId` only (`apps/driver-web/src/App.tsx:83–86`); the RIDER_FINAL re-broadcast carries the same requestId with a higher amount/round+1 and is discarded. Driver sees the stale round-1 amount; accepting settles at the rider's final figure anyway (accept uses `current_offer`). Fix: key offers by `requestId+round` / replace-in-place on round increase.

**H6. Offer countdowns reset on every render — offers effectively never expire client-side.** OfferCard's timer effect depends on `[ttlMs, onSkip]` where `onSkip` is a fresh inline arrow each render (`OfferCard.tsx:56–67`), and continuous GPS re-renders (`App.tsx:112–126`) restart the countdown forever. Ghost stale offers persist and produce confusing INVALID_STATE errors. Queued offers additionally restart full TTL when promoted (arrival-time TTL stored relative, `App.tsx:82`). Fix: store absolute `expiresAt`, stabilize callbacks with `useCallback`.

**H7. Password login brute-forceable.** Min length 4 (`auth.ts:113`, `server.ts:242`), no per-phone/per-route rate limit on `/v1/auth/login/password` (only global IP 300/min). Fix: rate-limit like OTP routes; raise minimum; consider lockout/backoff.

**H8. WS ticket map leaks.** Tickets are deleted only when presented (`consumeWsTicket`, `server.ts:72–77`); minted-but-unused entries stay in the Map forever (60s expiry checked but never swept). Fix: periodic eviction or TTL-sweeping structure.

**H9. "Collect ₹X" shown for digital trips.** TripPanel renders collect-cash copy regardless of `paymentMethod` (`TripPanel.tsx:162–170`); UPI/WALLET fares were already settled digitally — instructs drivers to double-collect. Fix: branch copy on payment method (field exists in payload).

**H10. OTP input format mismatch burns lockout attempts.** Label says "4-Digit Start OTP", enable threshold `< 4` (`TripPanel.tsx:144–155`) vs 6-digit server OTPs (`trips.ts:68`); partial submits guarantee BAD_OTP and consume the 5-attempt budget toward OTP_LOCKED. Fix: require 6, fix label.

**H11. Rider mid-negotiation session breaks.** WS `request.updated` frames are cast straight into a view type expecting `sessionId` while the wire field is `id` (`Book.tsx:135`, protocol `api.ts:46`) → Cancel posts `/v1/requests/undefined/cancel`. Terminal states aren't rendered either: EXPIRED/DECLINED sessions keep showing "RADAR ACTIVE / Connecting…" (`Book.tsx:479–507`). Fix: map fields explicitly; branch matching UI on `session.state`.

**H12. Safety panel promises the code doesn't keep.** "Share Live Journey Link" shares `window.location.href` (app root, not a trackable trip URL); trusted contact stored in localStorage while copy promises alerts (`SafetyPanel.tsx:11–27, 59`). For an India ride-hail product this is a trust/compliance hazard. Fix: implement real share-token trips page + contact alerts or rewrite copy until wired.

---

## 5. Engineering findings — Medium

| # | Finding | Evidence |
|---|---|---|
| M1 | Multi-write sequences without transactions: trip creation (INSERT trip + UPDATE request + INSERT otp) isn't atomic; `riderFinalOffer` updates `platform_fee` on two tables bypassing optimistic-lock version checks | `trips.ts:85–110`, `server.ts:613–614, 665` |
| M2 | Restart amnesia persists: presence/claims/offers/tickets all in-memory; no `session.reset` message triggers client refetch; `tripView` loses driver position after restart (`getLiveDriver` null) | `dispatch.ts:26–28`, `server.ts:808` |
| M3 | Rate endpoint catch-all mislabels every DB failure as ALREADY_RATED | `server.ts:1044–1046` |
| M4 | Sweeper swallows all errors silently (`catch {}`) — DB outage invisible | `server.ts:1207` |
| M5 | Duplicate-tab 4009 leaves UI in "CONNECTING…" forever (no terminal banner); geolocation permission denial swallowed (silent default pin); hotspot buttons trigger GPS_TELEPORT rejections the client never sees — driver believes they relocated | `App.tsx:171–173, 122, 16–22` |
| M6 | Unthrottled `pos.update` per GPS tick → one DB write each; battery/bandwidth/write amplification | `App.tsx:118–120`, `server.ts:965` |
| M7 | Logout leaves DB `online=true`; WS connect forces presence online regardless of persisted toggle | `App.tsx:291–296`, `server.ts:946–956` |
| M8 | Undefined CSS design tokens strip styling silently in BOTH apps (`--shadow-xs`, `--paper-subtle`, `--radius-lg/xl/xs`, `--secondary`); fonts referenced but never loaded; `brut-pulse` keyframes missing | rider `styles.css:6–38` usages; driver `styles.css:255, 303, 374, 389` |
| M9 | PWA shells are cosmetic: sw.js pass-through caching (both apps), SVG-only icons risk install-prompt failure, stale yellow theme-color vs indigo brand | `*/public/sw.js`, `index.html:7` |
| M10 | Accessibility: clickable divs (vehicle rows, history cards, accordions), dialogs without Esc/focus-trap (except SafetyPanel's Radix dialog), color-only status meaning, no aria-live on OTP | `Book.tsx:441–444`, `History.tsx:82–92`, `NeoComponents.tsx:156–179` |
| M11 | History flat `LIMIT 50`, no cursor pagination; `paymentMethod ?? "UPI"` fabrication on unknown methods | `server.ts:1094–1104`, `History.tsx:40` |
| M12 | Ledger simulation seams undocumented in UI: UPI debits unfunded `pg:CLEARING`; CASH platform fee books to POSTPAID with zero collection mechanism; top-up 501-gated (correct) but no gateway abstraction yet | `ledger.ts:73–84`, `server.ts:289–291` |
| M13 | Tip race window: prior-check then postTransaction; concurrent differing-amount tips can return `duplicate:true` without amount validation | `server.ts:740–757` |
| M14 | Nominatim called browser-direct (policy violation + query privacy leak); should be server-proxied; CSP allows `unsafe-eval` and a Nominatim origin the driver app never uses | `LocationSearch.tsx`, `index.html:6` |
| M15 | Cross-app links hardcode `http://localhost:5173/5174` — break in any deployed env | rider `App.tsx:98`, driver `Login.tsx:156`, `App.tsx:312` |
| M16 | Server binds `127.0.0.1` only — correct behind nginx, silently wrong standalone; `.env.example` ships `CORS_ORIGIN=*` | `server.ts:1211`, `.env.example` |
| M17 | Zero-fare rides skip journal lines entirely (documented, defensible) — but reconciliation endpoints report them as balanced-with-0-lines; ensure finance reporting treats them explicitly | `trips.ts:219–225` |

## 6. Engineering findings — Low

- Dead code cluster: unreachable PASSWORD login mode in both apps' Login screens; `pollRef` never assigned so `stopPoll()` clears nothing; unused `EXPLAINER_COPY`; unused CSS blocks; `completeTrip(id, tipPaise)` body ignored by the endpoint it targets.
- Reconnect loops lack backoff-on-clean-close (rider) / fixed 2s retry forever (driver); logged-out wait polls every 800ms indefinitely.
- Map refits bounds on every self GPS tick while offers show (fights user gestures).
- `EarningsDrawer` defaults: "KYC APPROVED" when profile null, ★5.0 fallbacks; OfferCard hardcodes "0% Cut"/"100% to wallet" marketing regardless of actual config.
- Logger writes sync file I/O per line (rotated at 5MB — good) but stdout+file duplication will fight platform log aggregation in production.
- `verify-all.ts`/`e2e-fullflow.ts` cover backend flows well (68 checks incl. expiry, role mismatch, replay, disconnect) but nothing covers tip/payout/cancel-rider/rider-final edge combos, and **zero automated tests exist for either frontend**.

---

## 7. Product findings & gaps

### 7a. Trust & honesty (highest-order product problem)
A negotiated-pricing marketplace sells fairness. Today the product undermines itself:
1. Riders see a fabricated plate/name/rating for their actual driver (H1).
2. Drivers see fabricated fallback stats (★4.8/5.0, "KYC APPROVED") next to real numbers — the first time two drivers compare screens, trust breaks.
3. Landing pages advertise caps ("₹5–₹40 platform fee") the booking UI does not enforce, FAQ promises card payments that don't exist, and hero sections show mock "live bidding" data as if real.
4. Cancelled rides render honestly now in earnings/receipts (good), but unknown payment methods render as "UPI".
5. Safety features are decorative (H12) — the most dangerous kind of promise in this category.

### 7b. Negotiation loop dead-ends (the core differentiator)
- Rider's counter modal shows fabricated class/fee context at the exact decision moment (§2 table).
- Driver can't see the rider's final offer (H5) and offers never visibly expire (H6) — the negotiation ends in confusion precisely where the product should shine.
- No parallel bids: flow locks to first counter; market leaders show multiple competing offers.
- Expired/dead sessions render as eternal searching (H11) with no "search again" action.
- `deliveredToDrivers` is returned by the API but never surfaced — riders get zero supply feedback ("3 drivers saw your offer").

### 7c. Marketplace mechanics gaps
- Quotes render for classes with zero live drivers; no supply counts beside classes (P0 in FEATURE-GAPS, still open).
- No acceptance-likelihood guidance despite `softFloor` existing in the quote payload.
- No cancellation-fee matrix anywhere (free cancel even after ARRIVED).
- No promo/subsidy engine although the ledger already models incentives (`INCENTIVE` reason consumed by driver stats).
- Single city hardwired (`CITY_ID=1`) — fine for pilot, but city selection plumbing should precede any second-city pilot.

### 7d. Payments reality check
Wallet/UPI/CASH are simulations: no gateway, payouts move internal journal balances without bank rails, receivables never settle (C2), POSTPAID never collected. This is acceptable for a pilot demo but must be labeled internally as simulated so nobody reports "wallet works."

### 7e. Operational product gaps (unchanged from FEATURE-GAPS, confirmed open)
No admin console (KYC approval exists only as a dev endpoint — no production approver path means **no new driver can ever go live in production**), no support/dispute/refund flows, no SOS incident workflow, no masked calling/chat, no lost-item flow, no data-deletion workflow (DPDP), English-only strings, no monitoring/metrics/SLOs, no OpenAPI surface doc.

---

## 8. Feature suggestions (what to build next)

### Wave 1 — Make the existing promises true (days)
1. Restore regressed rider flows from `bd1515e`: tips, cancel-after-match (+confirm), OTP recovery/regenerate + copy, rating UI, wallet display, driver marker fix (`driver` prop).
2. Payment-method-aware completion screen; 6-digit OTP input; terminal-state matching UI with "Search again."
3. Real driver identity in `tripView`; delete hardcoded plate/rating/name.
4. Surface `deliveredToDrivers` count + live supply badges per class.
5. CI: typecheck (all packages), protocol unit tests, core verify suite, Playwright happy-path (rider books → driver accepts → ride completes) — the E2E fixture maps 1:1 to browser flows.
6. Honest-copy pass: remove/soften landing claims, fallback stats, "UPI" fabrication.

### Wave 2 — Negotiation depth (the moat)
1. **Parallel bidding**: allow N drivers to counter concurrently; rider picks from a comparison sheet (backend already stores events; needs multi-claim semantics instead of first-claim-wins).
2. Acceptance-likelihood meter from softFloor ratio + historical acceptance data.
3. Driver preferences: min take-home filter, auto-accept threshold, quiet hours.
4. Offer guidance chips for riders ("offers below ₹X usually expire unaccepted").
5. Negotiation timeline in receipts (events table already has everything).

### Wave 3 — Trust & safety (launch blockers)
1. Real trip-share: signed public token + read-only live map page; expiry on completion.
2. SOS: emergency contacts backend + alert dispatch + ride-context capture; masked calling via provider adapter.
3. Ride PIN alternatives (number-match), women-preferred/verified-driver badges.
4. Cancellation fees with grace window + reason capture both sides; auto-refund logic in ledger.

### Wave 4 — Money for real
1. Razorpay/Cashfree UPI intent + gateway webhook → fund `pg:CLEARING` on success; wallet auto-topup.
2. Payout rails w/ bank verification; net receivable at payout (fixes C2 structurally); instant-payout fee option.
3. GST-compliant invoices (PDF), monthly statements for drivers.
4. Promo/subsidy engine posting platform-funded incentive lines (ledger-ready today).
5. Referral program both sides (attribution + incentive postings).

### Wave 5 — Scale & platform
1. Redis GEO presence + distributed claims/rate limits; Kafka bus swap (seams documented).
2. Native wrappers (Capacitor) for background driver location + reliable push.
3. Admin console: KYC queue, dispute/refund workflows, trip audit viewer (from `negotiation_events`), fleet dashboards.
4. Observability: OTel traces, Prometheus metrics, SLO alerts; feature-flag service; i18n extraction (hi-IN first); WCAG AA audit; load tests (k6 against dispatch fan-out).

---

## 9. What is genuinely good (keep these patterns)

1. Shared protocol package as single source of truth — FSM tables, money brand, wire types used by server and both clients (`packages/protocol`).
2. Branded integer paise everywhere; zero float math in the money path (`money.ts`).
3. Storage abstraction with real transaction support for both pg and PGlite (`db/storage.ts:59–105`) — the pg numeric-parser fix comment (`storage.ts:34–37`) is exactly the kind of trap-catching documentation that saves nights.
4. Quote-token HMAC + single-use nonce table; timingSafeEqual used correctly (`pricing.ts`, `server.ts:354–360`).
5. One-shot WS tickets, duplicate-tab 4009, disconnect-grace trip sweep — the WS lifecycle hardening trio is well designed (`server.ts:70–77, 941–943, 970–989`).
6. Optimistic locking discipline on FSM mutations; append-only negotiation event trail (`negotiation.ts`).
7. Lazy expiry check inside `requireLive()` belt-and-braces alongside the sweeper (`negotiation.ts:176–190`).
8. Honest cancelled-ride receipts ("Not charged", zeroed totals) and cancelled-trip exclusion from earnings aggregation.
9. LocationSearch quality: debounce, AbortController, country scoping, echo-loop suppression (`LocationSearch.tsx`).
10. Log rotation bounded at 5MB; healthz includes storage kind; boot refuses weak production secrets.

---

## 10. Recommended order of attack

| Priority | Items |
|---|---|
| **This week** | C4/C5 (restore regressions + typecheck scripts + minimal CI), C1 (settlement atomicity), H9/H10 (completion/OTP correctness), H1 (real driver identity) |
| **Next sprint** | C2 (receivable netting), C3 (bind geometry to quotes), H2–H6 (lifecycle fan-out + offer dedup/countdown), H7/H8 (brute-force + ticket leak), H11 (session mapping), honest-copy pass |
| **Then** | Wave 2 negotiation depth → Wave 3 safety truth → Wave 4 real payments → Wave 5 scale |

**Bottom line:** stop writing new surfaces until the regression hole (C4) is closed and guarded by CI — the codebase proved this week that a styling commit can silently delete a week of product work. After that, the highest-leverage engineering spend is the money-integrity trio (C1–C3), and the highest-leverage product spend is making the negotiation loop — the actual differentiator — survivable for both sides.
