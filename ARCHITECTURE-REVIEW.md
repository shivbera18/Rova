# Chalo-X — Complete Architecture Review

> Scope: entire monorepo — `packages/protocol`, `services/core`, `apps/rider-web`, `apps/driver-web`, build/tooling, and ops posture.
> Method: full source read of every tracked file plus targeted verification of each finding against the code. Every finding cites file + line evidence.
> Verdict up front: **strong v1 foundation with genuinely good money/state-machine hygiene, but not production-ready** — there are two silent-correctness bugs (negotiation expiry never fires; round counting is dead code) and one integrity gap (ledger lines written outside a transaction).

---

## 1. System Overview

```
┌──────────────┐   ┌──────────────┐
│  rider-web   │   │  driver-web  │      React 18 + Vite SPAs
│    :5173     │   │    :5174     │      Leaflet maps, WS + REST via Vite proxy
└──────┬───────┘   └──────┬───────┘
       │  REST /v1/*  +  WebSocket /ws/{rider|driver}
       ▼                  ▼
┌─────────────────────────────────┐
│           services/core         │      Fastify :8080 (single node)
│  auth · pricing · dispatch ·    │      negotiation FSM · trips · double-entry ledger
│  bus (in-proc Kafka-shaped) ·   │      config cache · OTP gate · settlement
└───────────┬─────────────────────┘
            │ SqlRowClient (one interface)
     ┌──────┴──────┐
     │ PG (pg)     │  when DATABASE_URL set
     │ PGlite WASM │  zero-config embedded default (.chalo-data)
┌─────────────────────────────────┐
│        packages/protocol        │  Paise brand · FSM tables · wire types · Haversine
└─────────────────────────────────┘
```

### Domain model (the heart of the product)

The differentiating flow — *rider names a price, drivers counter, platform fee billed separately on top* — is modeled as two explicit state machines shared by server and clients via `@chalo/protocol`:

- **Negotiation FSM** (`packages/protocol/src/negotiation.ts:46-69`): `BROADCASTING → COUNTERED_DRIVER ⇄ COUNTERED_RIDER → AGREED | EXPIRED | DECLINED | CANCELLED`. One transition table, illegal moves throw by construction.
- **Trip FSM** (`negotiation.ts:86-94`): `DRIVER_ASSIGNED → ARRIVING → ARRIVED → ONGOING → COMPLETED`, with rider/driver cancellation edges.
- **Money** (`money.ts`): branded integer `Paise` everywhere; `platformFee = clamp(offer×pct, min, cap)` charged rider-side only; driver take-home ≡ agreed fare, enforced structurally (`settlementLines` credits the driver exactly `agreedPaise`).
- **Ledger** (`services/core/src/ledger.ts`): append-only journal, account-string convention (`user:<id>:WALLET`, `driver:<id>:CASH_RECEIVABLE`, `platform:REVENUE`, `pg:CLEARING`), idempotent settlement keyed `settle:<tripId>`.
---

## 2. What Is Genuinely Good (keep these patterns)

1. **Shared protocol package as single source of truth.** FSM transition tables, negotiation rules, and money math are imported by the server *and* both clients. The server renders state; clients only render. This is the correct cut.
2. **Branded integer money.** `Paise = number & { __paise }` (`money.ts:5`) makes rupee/paise mixups a type error at boundaries. No floats in the money path.
3. **Optimistic locking on every mutation.** `UPDATE … WHERE id=$1 AND version=$3 AND state=$4` + `CONCURRENT_UPDATE` retry semantics (`negotiation.ts:161-166`, `trips.ts:137-143`) — correct concurrency posture without serializable isolation.
4. **Event-sourcing-ish audit trail.** Every negotiation mutation appends a `negotiation_events` row before publishing (`negotiation.ts:169-175`). The bus is Kafka-shaped (`bus.ts`) so the Redpanda migration is a transport swap, as documented.
5. **Signed quote tokens.** List price travels HMAC-signed with TTL (`pricing.ts:100-135`), so `POST /requests` never re-prices or trusts client numbers; `timingSafeEqual` used correctly.
6. **Storage abstraction.** One `SqlRowClient` interface, PG or PGlite behind it (`db/storage.ts`) — the zero-config demo story is excellent and doesn't fork business code.
7. **Honest ponytails.** The `# ponytail:` comments (road factor instead of map API, in-proc presence instead of Redis GEO, plaintext OTP recovery) mark every shortcut with its upgrade path. This is rare and valuable.
8. **64-assertion live verification suite** (`verify-all.ts`) exercising real flows end-to-end, including ledger reconciliation via `/v1/dev/reconcile`.

---

## 3. Findings — Critical (fix before any real usage)

### C1. Negotiation expiry is dead code — nothing ever fires `EXPIRE`
The FSM defines `EXPIRE` transitions and the tests test them, but **no code path ever executes them**. There is no background sweeper (no timer exists in `services/core` outside tests), no lazy check of `expires_at` in `requireLive()` (`negotiation.ts:134-141` only checks `state`), and no `SET state='EXPIRED'` anywhere (repo-wide search confirms zero hits).
**Impact:** an offer broadcast at T+45s stays live forever; drivers can accept a "stale" offer hours later; the rider-side countdown UI (`ws.ts:useCountdown`) lies about server behavior. The whole TTL model in `NegotiationRules` is decorative.
**Fix:** add a 1s interval sweeper in `startServer()` that transitions live negotiations whose `expires_at < now()` via the FSM (`canTransition(state,'EXPIRE')`), releases the dispatch claim, pushes `request.updated` to the rider, and expires stale `ride_requests`. Also add a lazy guard in `requireLive()` for belt-and-braces.

### C2. Negotiation round counter never increments — max-rounds is unenforced
`applyCounter` computes `const nextRound = action === "DRIVER_COUNTER" ? neg.round : neg.round;` (`negotiation.ts:193`) — both branches identical. `round` is inserted as 1 (`negotiation.ts:53`) and never changes. Consequences:
- `NEGOTIATION_ROUND_EXCEEDED` (`negotiation.ts:189`) can only fire when `1 >= 3`, i.e. **never** — rider and driver can counter each other indefinitely.
- The UI "Round X of 3" (`CounterModal.tsx:73`, `Book.tsx:338`) always shows Round 1 of 3.
**Fix:** increment on `RIDER_FINAL` (and arguably on `DRIVER_COUNTER`), e.g. `nextRound = action === "RIDER_FINAL" ? neg.round + 1 : neg.round`, and add a regression test asserting round growth and the exceeded error.

### C3. Ledger lines are inserted outside a database transaction
`postTransaction` loops `INSERT` per line (`ledger.ts:39-49`) through `SqlRowClient`, which exposes only `query` — there is no `BEGIN/COMMIT` anywhere in the ledger path. If the process dies (or PGlite/PG errors) between line 1 and line 2 of a settlement, the journal is **permanently unbalanced**: driver credited without rider debited. For a double-entry ledger this is the one invariant that must be atomic.
Also note: the balance guard at `ledger.ts:33-36` sums the *same* lines twice into `totalDebit`/`totalCredit` — it is tautologically true and provides false confidence.
**Fix:** extend `SqlRowClient` with `tx<T>(fn: (tx) => Promise<T>)` (pg: dedicated client + `BEGIN…COMMIT`; PGlite: `db.transaction()`), wrap line insertion + idempotency pre-check in it, and keep a real unique index on `idempotency_key`.

### C4. Role confusion in OTP verify — any phone can become a driver
`upsertUser` looks users up by `phone_bidx` **only**, ignoring role (`auth.ts:46-66`), and `/v1/auth/otp/verify` accepts whatever `role` the client sends (`server.ts:111-122`). A rider account can therefore log in to the driver console with `role:"DRIVER"` (and vice-versa) and hit role-gated endpoints. There is also **no driver-onboarding gate**: the driver negotiation endpoints never check that the caller has an approved `driver_profiles` row (`kyc_status='APPROVED'`) nor that the driver's `vehicle_class` matches the negotiation's class.
**Fix:** scope identity by `(phone_bidx, role)` and reject role mismatch at login; require approved profile + vehicle-class match in `/v1/negotiations/:id/(accept|counter)`.

### C5. Plaintext OTP at rest
`otp_codes.otp_plain` stores the 6-digit start-OTP next to its hash (`trips.ts:106`, migration `migrations-integration.ts:7`). It's flagged as a ponytail, but the hash exists precisely so a DB leak can't reveal the OTP; the plaintext column defeats that. (The GET endpoint itself scopes delivery correctly to the rider pre-`ONGOING` — `server.ts:511-518`.)
**Fix:** deliver once at assignment (the WS push already does this) and drop the column; rotate on demand if re-delivery is needed.

