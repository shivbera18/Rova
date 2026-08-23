# BUG REPORT — Rider offer stuck at "Round 1 of 3", driver portal never shows the ride

**Date:** 2026-08-23
**Symptom reported:** After the rider submits a negotiated offer, the rider console hangs on *Negotiating… Round 1 of 3* forever, and no offer card ever appears in the driver console.
**Status:** ✅ Root-caused and resolved — 68/68 end-to-end verification assertions now pass, including the exact rider-offer → driver-offer scenario.

---

## TL;DR

The negotiation/dispatch logic was **not** the reason the driver saw nothing. The **core backend was in a boot crash-loop** and never started listening on `:8080`. With no backend there is no WebSocket gateway, so no driver ever registers presence, `broadcastOffer` pushes to an empty connection map, and the rider UI sits in the matching state indefinitely. Two independent boot failures were present in the terminal logs.

---

## Root cause chain

### 1. PRIMARY — Corrupt PGlite data directory → WASM abort on every boot

Every `tsx watch` restart in the terminal log dies with:

```
[core] fatal RuntimeError: Aborted(). Build with -sASSERTIONS for more info.
    at abort (.../@electric-sql+pglite@0.2.17/dist/index.js:1:78499)
    at __abort_js (...)
    at wasm-function[10860] ...
    at Object.Module._pg_initdb (...)
    at async pe._checkReady (...)
```

`_pg_initdb` aborting means the embedded Postgres (PGlite) failed **while initializing its data directory** — i.e. `services/core/.chalo-data/` was left in a half-written state and is now permanently corrupt. Every subsequent boot re-aborts on the same bytes.

**How it got corrupted:** the dev workflow is `turbo run dev --parallel` with `tsx watch` on the core service. The log shows rapid-fire restarts (`change in ./src/db/storage.ts Rerunning…`, `./src/auth.ts Rerunning…`, `./src/negotiation.ts Rerunning…`, …) while several files were being edited in quick succession. `tsx watch` kills the old process without giving PGlite a clean `close()`, and a restart that lands **during** PGlite's first-run `initdb` (which takes tens of seconds on Windows) persists a truncated/corrupt cluster. From that moment the service can never boot again — the watcher just keeps rerunning into the same wall.

**Why this exactly matches the symptom:**
- No server → `ws://…/ws/driver` never accepts → `driverConns` / `liveDrivers` stay empty.
- `broadcastOffer()` (`services/core/src/dispatch.ts`) iterates live drivers and delivers **0** copies — fire-and-forget, no retry, no driver-side recovery endpoint to fall back on.
- The rider's poll of `GET /v1/requests/:id` also fails, so the matching panel never advances: **stuck at "Round 1 of 3" forever** (and the 45s/120s TTLs can't save it because the expiry sweeper lives in the same dead process).

### 2. SECONDARY — Transient broken `server.ts` during the fix commits

Interleaved in the same log:

```
[core] fatal ReferenceError: runMigrations is not defined
    at startServer (.../server.ts:92:3)
...
ERROR: Unexpected end of file  (server.ts:894)
```

While the architecture-review fixes were being wired in (commits `a6fe143…784bf13`), the working tree briefly contained a `server.ts` with a missing import and later a truncated file. `tsx watch` picked these up mid-edit. Both are resolved at HEAD (`784bf13`) — `runMigrations` is imported at `server.ts:18` and the file typechecks cleanly — but they contributed to the crash-loop window during which the data directory got corrupted.

### 3. Contributing (already fixed in recent commits — listed for completeness)

These were genuine logic bugs that would have produced the *same* "stuck at Round 1" symptom even with a healthy backend, and were fixed while this incident was being investigated:

| Bug | Fix commit |
|---|---|
| Negotiation round counter never incremented (`nextRound = neg.round : neg.round` — both branches identical), so `maxRounds` was unenforceable and the UI always showed Round 1 | `af87764` |
| No background sweeper ever fired the FSM `EXPIRE` action — expired negotiations stayed live forever | `af87764` |
| Ledger lines inserted outside a DB transaction (unbalanced-journal risk) | `2441962` / `a6fe143` |
| Cross-role login (rider phone could self-upgrade to `DRIVER`), no KYC/vehicle-class gate on driver actions | `436aac6` / `784bf13` |
| Plaintext OTP column at rest | `b5f74bc` |

---

## Resolution performed

1. Killed the orphaned process holding port `:8080`.
2. Deleted the corrupt embedded cluster: `services/core/.chalo-data/` (gitignored, regenerable — contains no source of truth).
3. Rebuilt it: `pnpm --filter @chalo/core db:migrate` → `applied 1 migration(s)`, then `pnpm --filter @chalo/core seed` → `seeded: city=1 Bengaluru, 6 fare cards, rider + 3 approved drivers`.
4. Ran the full live verification suite: `pnpm --filter @chalo/core test:verify` → **68 PASSED, 0 FAILED**, including:
   - negotiated offer → driver receives `dispatch.offer` → counter → rider accepts → trip created;
   - background expiry sweeper transitions stale negotiations to `EXPIRED`;
   - role-mismatch login rejected (`ROLE_MISMATCH`).
5. `pnpm --filter @chalo/core typecheck` → clean at HEAD.

> **Action needed:** your terminal is still running the old crash-looping watcher. Stop it (`Ctrl+C`) and restart:
> ```bash
> pnpm dev        # or: pnpm --filter @chalo/core dev + the two web apps
> ```
> It will now boot against the freshly seeded data dir.

---

## Prevention recommendations

1. **Close storage cleanly on shutdown.** Register `SIGTERM`/`SIGINT` handlers in `startServer()` to `await storage.close()` so `tsx watch` restarts don't leave PGlite mid-write.
2. **Single-writer guard for the data dir.** Before opening PGlite, take an exclusive lockfile on `.chalo-data/.lock` and fail fast with "another core instance is using .chalo-data" instead of an opaque WASM `Aborted()`.
3. **Detect corruption instead of crash-looping.** On boot, catch the PGlite abort and surface a clear message ("embedded DB appears corrupt — delete `.chalo-data`, re-run migrate + seed"), optionally auto-quarantining the bad dir.
4. **Health endpoint.** `GET /healthz` returning storage kind, so the dev runner can distinguish "booting" from "crash-looping".
5. **Dispatch resilience (defense in depth).** The offer push is fire-and-forget: a driver who connects *after* the broadcast never sees a live offer, and there is no driver-side REST fallback listing open negotiations. Re-broadcast on driver presence registration (or periodically while `BROADCASTING`) would make delivery survive timing races independent of backend health.

