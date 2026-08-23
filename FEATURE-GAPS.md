# Chalo-X Feature Gap Audit

**Compared with:** Uber, Ola, Rapido, and Rappi-style super-app experiences  
**Scope audited:** current rider web, driver web, and core backend  
**Date:** 2026-08-23

This document lists customer-visible capabilities offered by one or more market leaders that are not yet implemented, or only partially implemented, in Chalo-X.

---

## Priority Legend

| Priority | Meaning |
|---|---|
| **P0** | Required before a public production launch |
| **P1** | Core competitive parity after pilot validation |
| **P2** | Growth, convenience, or marketplace expansion |
| **P3** | Long-term super-app expansion |

---

## Rider Experience Gaps

| Feature | Market reference | Current Chalo-X state | Priority |
|---|---|---|---|
| Address autocomplete and POI search | Uber/Ola/Rapido | **Added:** OpenStreetMap/Nominatim search for pickup and drop-off. Production provider fallback and rate-limit proxy still needed. | P0 |
| Saved places (Home, Work, custom labels) | Uber/Ola | Popular route presets only; no account-backed saved places. | P1 |
| Recent destinations and search history | Uber/Ola/Rapido | Not implemented. | P1 |
| Reverse geocoded readable addresses | Uber/Ola/Rapido | Coordinates/pinned labels are used in several places. | P0 |
| Route-based navigation and road distance | Uber/Ola | Uses straight-line/Haversine approximation, not road-network routing. | P0 |
| Accurate pickup ETA from live traffic | Uber/Ola | Static distance-derived estimate only. | P0 |
| Multiple stops | Uber/Ola | Backend schema anticipates stops; rider UI and fare supplements are not implemented. | P1 |
| Schedule a ride | Uber/Ola | Planned only. | P1 |
| Rentals/hourly packages | Ola/Uber | Planned only. | P2 |
| Outstation/intercity trips | Ola/Uber | Planned only. | P2 |
| Bike/auto/cab availability tied to live supply | Uber/Ola/Rapido | Quotes show configured classes even when zero matching drivers are online. | P0 |
| Driver search radius expansion feedback | Uber/Ola | Backend uses one fixed radius; rider sees generic matching state. | P1 |
| Driver arrival notifications | Uber/Ola/Rapido | WebSocket state exists; browser push/background notification is missing. | P0 |
| In-app masked calling | Uber/Ola/Rapido | Not implemented. | P0 |
| Rider-driver chat and quick messages | Uber/Ola/Rapido | Not implemented. | P1 |
| Trip sharing with public live link | Uber/Ola | Not implemented. | P0 |
| Emergency contacts and SOS | Uber/Ola/Rapido | Planned in architecture; no UI or production incident workflow. | P0 |
| Audio recording / safety toolkit | Uber | Not implemented. | P1 |
| Ride PIN / pickup verification | Uber/Ola | Start OTP exists; pickup identity checks are partial. | P0 |
| Women-preferred ride / safety preferences | Ola/Rapido in selected markets | Not implemented. | P2 |
| Accessibility preferences | Uber | Not implemented beyond basic browser semantics. | P1 |
| Promo codes and coupons | Uber/Ola/Rapido | Schema/design planned; no rider UI or settlement rules. | P1 |
| Referral program | Uber/Ola/Rapido | Not implemented. | P2 |
| Membership/subscription plan | Uber One/Ola Select | Not implemented. | P2 |
| Rewards and loyalty points | Ola/Rappi | Not implemented. | P2 |
| Wallet top-up and withdrawal UI | Ola Money/Uber Cash | Ledger exists; no real payment instrument integration or wallet management UI. | P0 |
| UPI/card payment gateway | Uber/Ola/Rapido | Payment method selector exists; Razorpay/UPI/card charging is not connected. | P0 |
| Cash change / QR payment handoff | Rapido/Ola | Not implemented. | P1 |
| GST invoice and downloadable receipt | Uber/Ola | Fare breakdown exists; PDF/GST invoice generation is absent. | P0 |
| Cancellation fee preview and policy | Uber/Ola/Rapido | No cancellation-fee matrix in rider UI. | P0 |
| Fare dispute / refund flow | Uber/Ola | Not implemented. | P0 |
| Lost-item flow | Uber/Ola | Not implemented. | P1 |
| Help centre and support chat | Uber/Ola/Rappi | Not implemented. | P0 |
| Driver/rider blocking after safety incident | Uber | Not implemented. | P1 |
| Parcel delivery | Uber Connect/Rapido Parcel/Rappi | Planned only. | P2 |
| Shared/pool ride | Uber/Ola | Explicitly deferred. | P3 |

---

## Negotiation Marketplace Gaps

| Feature | Current state | Priority |
|---|---|---|
| Live supply count beside each vehicle class | Missing; rider may select a class with zero drivers. | P0 |
| “Likely to be accepted” offer guidance | Soft-floor value exists; no acceptance probability model. | P1 |
| Multiple driver bids visible to rider | Current flow locks to the first driver counter. | P1 |
| Driver counter comparison and selection | Not implemented. | P1 |
| Negotiation history visible in UI | Events are stored; no timeline UI. | P2 |
| Offer abuse scoring and throttling | Documented but not implemented. | P1 |
| Driver low-offer preferences | Driver can skip; no minimum-offer filter. | P1 |
| Platform-funded promotional gap | Ledger supports incentives conceptually; no subsidy engine. | P2 |
| Matching fallback after all drivers decline | Expiry exists, but no automatic list-price fallback dispatch. | P0 |
| Re-broadcast after driver reconnect | In-memory dispatch does not replay open offers to newly connected drivers. | P0 |

---

## Driver Experience Gaps

| Feature | Market reference | Current Chalo-X state | Priority |
|---|---|---|---|
| Complete driver onboarding and document upload | Uber/Ola/Rapido | Demo profiles are seeded as approved; no real onboarding flow. | P0 |
| DL/RC/PAN/Aadhaar verification | Uber/Ola/Rapido | Not integrated. | P0 |
| Selfie/liveness verification | Uber/Ola | Not implemented. | P0 |
| Background checks | Uber/Ola | Not implemented. | P0 |
| Native background location | All | Web foreground tracking only; native app is deferred. | P0 for production driver reliability |
| Turn-by-turn embedded navigation | Uber/Ola/Rapido | Google Maps deep link only. | P1 |
| Heat map and demand hotspots | Uber/Ola | Static hotspot presets only. | P1 |
| Airport/railway queue mode | Uber/Ola | Not implemented. | P2 |
| Destination mode / ride toward home | Uber | Not implemented. | P2 |
| Auto-accept preferences | Uber/Ola | Not implemented. | P1 |
| Offer filters and minimum acceptable fare | Negotiation-specific | Not implemented. | P1 |
| Daily/weekly earnings charts | Uber/Ola/Rapido | Balance and trip count only. | P1 |
| Incentive quests and streaks | Uber/Ola/Rapido | Not implemented. | P2 |
| Instant payout / bank withdrawal | Uber/Ola | Ledger exists; payout execution is absent. | P0 |
| Fuel/electric charging benefits | Uber/Ola | Not implemented. | P3 |
| Driver support and dispute flow | Uber/Ola/Rapido | Not implemented. | P0 |
| Rider conduct reports | Uber | Basic rating endpoint only. | P1 |
| Driver cancellation reasons | Uber/Ola | Cancellation endpoint exists; reason selection and penalty policy are absent. | P0 |
| Duty-time safety reminders | Ola/Uber | Not implemented. | P1 |
| Document expiry reminders | Uber/Ola | Not implemented. | P1 |
| Fleet partner dashboard | Ola/Uber | Not implemented. | P2 |

---

## Rappi-Style Super-App Gaps

Rappi is broader than ride-hailing. The following are not required for ride-market validation, but would be needed for a comparable super-app direction.

| Capability | Current Chalo-X state | Priority |
|---|---|---|
| Restaurant discovery and food delivery | Not implemented. | P3 |
| Grocery and convenience delivery | Not implemented. | P3 |
| Pharmacy delivery | Not implemented. | P3 |
| Retail marketplace | Not implemented. | P3 |
| Courier / “anything” delivery | Parcel mode planned only. | P2 |
| Multi-merchant cart and checkout | Not implemented. | P3 |
| Store inventory and substitutions | Not implemented. | P3 |
| Delivery-partner batching | Not implemented. | P3 |
| Rappi-style subscription bundle | Not implemented. | P3 |
| Advertising and sponsored placement | Not implemented. | P3 |
| Financial services / credit | Explicitly out of scope. | P3 |

---

## Platform and Operational Gaps

| Capability | Current state | Priority |
|---|---|---|
| Admin operations panel | Explicitly deferred; only architecture is documented. | P0 before scale |
| Support agent console | Not implemented. | P0 |
| Safety incident console | Not implemented. | P0 |
| Payment reconciliation UI | Ledger and dev reconciliation endpoint exist; production reconciliation is absent. | P0 |
| Fraud/risk rules engine | Not implemented. | P0 |
| Device fingerprinting and session management | Minimal JWT only. | P0 |
| Refresh-token rotation and remote logout | Not implemented. | P0 |
| Production OTP/SMS provider | Fixed development OTP only. | P0 |
| Rate limiting and abuse protection | Not implemented. | P0 |
| Redis-backed cross-instance driver presence | In-memory only. | P0 before horizontal scaling |
| Durable Kafka/Redpanda event transport | In-process event bus only. | P1 before multiple core replicas |
| Push notifications | Not implemented. | P0 |
| Data deletion/export workflow | Planned only. | P0 for DPDP compliance |
| Audit logging for privileged changes | No admin panel yet. | P0 with admin launch |
| Monitoring alerts and SLO dashboards | File logger exists; metrics/alerts are absent. | P0 |

---

## Recommended Delivery Order

### Public pilot blockers
1. Real OTP provider, refresh sessions, and rate limiting.
2. Live-supply-aware vehicle availability.
3. Production geocoding/routing provider with accurate road ETA.
4. Real payment collection, payouts, refunds, GST receipts, and reconciliation.
5. SOS, share-trip, masked calling, driver onboarding/KYC, and support workflows.
6. Redis-backed presence and durable dispatch claims.

### Competitive parity
1. Saved places, recents, scheduled rides, multiple stops.
2. Promotions, referrals, memberships, incentives.
3. In-app chat, push notifications, lost items, fare disputes.
4. Rentals, outstation, and parcel delivery.

### Longer-term expansion
1. Pool/shared rides.
2. Fleet partner operations.
3. Rappi-style food, grocery, retail, and courier verticals.

---

## Audit Addendum — code-verified second pass

> Every row above was re-checked against the working tree after the P0/P1 remediation commits (`a10b7e0`…`1153123`). This addendum corrects rows that have gone stale and records newly found gaps with file-level evidence.

### A. Rows now outdated (implemented since this doc was written)

| Row | Actual state |
|---|---|
| Rate limiting and abuse protection — "Not implemented" | **Done**: `security.ts` enforces per-IP global (300/min), OTP per-IP + per-phone buckets, ride-request caps, offer/fee fraud ceilings, GPS jump detection (`server.ts:139,211-212`) |
| Push notifications — "Not implemented" | **Done**: Web Push w/ VAPID, subscriptions persisted, fired on driver-offer, counter, assignment, and driver-disconnect (`push.ts`; `server.ts:470,568,879,985`). Remaining gap is only trip-state pushes |
| Route-based navigation / road distance — "Haversine approximation" | **Done**: OSRM road routing with cached results and deterministic Haversine fallback (`routing.ts`) |
| Accurate pickup ETA from live traffic | **Partially done**: OSRM durations + transparent Bengaluru time-of-day traffic multiplier; no live-traffic feed yet |
| Wallet top-up / withdrawal UI | **Dev-complete**: top-up endpoint + UI live in dev, honestly 501-gated in prod pending gateway; payout moves journal balances, bank rails pending |
| Driver onboarding/KYC | **Flow exists**: `/v1/driver/onboarding` + approval + `OnboardingCard.tsx` UI. Document upload/expiry tracking and a real admin approver still missing — and see addendum B4 below |

### B. Gaps not previously listed in this document

1. **Quote tokens are replayable** — HMAC-only, no single-use nonce (`pricing.ts`). One captured token can spawn unlimited dispatch broadcasts. Mark jti consumed on first use.
2. **Expiry sweeper pushes a fabricated session** — `mode:"NEGOTIATED", round:3, listPrice:0 as never` (sweeper block, `server.ts:1198`). Expired LIST bookings tell the rider UI "Round 3 of 3 · List ₹0".
3. **Stale-driver-card leak paths remain**: `createNegotiation` auto-cancels a rider's prior negotiation without `cancelBroadcast`, and the sweeper's expiry path doesn't fan out either — only explicit cancel/decline do (`server.ts:508,666` are the sole call sites).
4. **LIST-mode `ride_requests` are never swept server-side** — client countdown timers hide permanently-MATCHING rows in the DB.
5. **Duplicate driver tabs silently replace each other** in `driverConns`/`liveDrivers` — tab #1 renders ghost state and can double-accept. Reject duplicates or sync via `BroadcastChannel`.
6. **Trips history is a flat `LIMIT 50`** with no cursor pagination (`server.ts:1099`) — power users lose older history permanently.
7. **No CI workflows** in `.github/` — typecheck, unit tests, the 66-check full-flow suite, and builds are all manual. Highest-leverage one-liner in this addendum.
8. **No load testing** — dispatch fan-out, ring broadcast, and the 1s sweeper are unvalidated beyond toy volumes (k6/artillery against the existing E2E fixture).
9. **No feature-flag mechanism** — night multiplier, dev hints, and new surfaces are compile-time toggles.
10. **No i18n runtime** — English-only strings across both consoles for an India-first product.
11. **Not installable** — no PWA manifest/service worker; add-to-homescreen is table stakes for this market.
12. **JWT_SECRET fallback has no boot guard** — `pricing.ts:14` falls back to a known constant; production must refuse to start on default secrets (forgeable quote tokens, spoofable sessions).
13. **Browser-direct Nominatim geocoding** (`LocationSearch.tsx`) — OSM usage policy prohibits heavy automated use; needs a server-side proxy/cache or a commercial provider before launch.
14. **Driver console still has no logout control** — escape is waiting out the 12h JWT or clearing localStorage.
15. **Neon backup/PITR + failover runbook** undocumented — location history of real users is being written with no stated lifecycle or restore story.
16. **No API surface documentation** (OpenAPI/protocol reference) for future partner or internal consumers.
17. **No accessibility conformance pass** (WCAG AA audit) — semantics are decent but unverified with keyboard/screen reader.

