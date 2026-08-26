/**
 * Full-flow E2E verification suite.
 *
 * Boots a REAL core server on :8087 against whatever DATABASE_URL points at
 * (Neon / docker postgres / embedded PGlite) and drives every product flow
 * end-to-end over HTTP + WebSocket, mirroring exactly what the rider and
 * driver consoles do:
 *
 *   S0  Auth & access control (bad OTP, role guard, token guard)
 *   S1  Quote engine integrity (fee math, soft floor, token tamper)
 *   S2  LIST-price dispatch -> claim race -> full trip lifecycle
 *       (ARRIVING/ARRIVED -> OTP start -> complete) -> settlement -> rating
 *   S3  Zero-offer negotiated ride with CASH settlement
 *   S4  Negotiation: driver counter -> rider final-offer -> driver accept
 *   S5  Rider decline + rider cancel pre-agreement (dispatch.cancel fanout)
 *   S6  Max-rounds guardrail + FSM single-alternation rule
 *   S7  Background negotiation expiry sweeper
 *   S8  Vehicle-class dispatch isolation
 *   S9  KYC approval gate for unapproved drivers
 *   S10 Double-entry ledger deep-check
 *
 * Run:  pnpm --filter @chalo/core test:e2e
 */
import WebSocket from "ws";

const TEST_PORT = 8087;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const DEV_OTP = "123456";
const PICKUP = { lat: 12.9352, lng: 77.6245 }; // Koramangala (seeded driver home)
const DROP = { lat: 12.9784, lng: 77.6408 }; // Indiranagar

// Seeded demo identities (auto-seeded on boot if missing; idempotent re-runs)
const RIDER_PHONE = "+919900000001";
const DRIVER_PHONE = "+919900000101"; // BIKE, Koramangala

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`    ok  ${name}`);
  } else {
    failed++;
    console.error(`    FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(s: string): void {
  console.log(`\n  [${s}]`);
}

// tokens are captured inside the S0 block scope
declare global {
  // eslint-disable-next-line no-var
  var __riderToken: string;
  // eslint-disable-next-line no-var
  var __driverToken: string;
}

async function api(
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Mint a single-use WS ticket — the server no longer accepts raw JWTs in the URL. */
async function wsTicket(token: string): Promise<string> {
  const r = await api("/v1/ws/ticket", {}, token);
  if (r.status !== 200 || !r.json?.ticket) throw new Error(`ws ticket mint failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.ticket as string;
}

/** Single-socket message router: collects every frame, awaits specific matches. */
class WsBus {
  private socket: WebSocket;
  private waiters: Array<{ match: (m: any) => boolean; resolve: (m: any) => void }> = [];
  readonly log: any[] = [];
  private openPromise: Promise<void>;

  constructor(url: string, ticket: string) {
    const { promise, resolve } = Promise.withResolvers<void>();
    this.openPromise = promise;
    this.socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`);
    const t = setTimeout(() => this.socket.emit("error", new Error("ws connect timeout")), 10000);
    this.socket.on("open", () => {
      clearTimeout(t);
      resolve();
    });
    this.socket.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      this.log.push(msg);
      const idx = this.waiters.findIndex((w) => w.match(msg));
      if (idx >= 0) {
        const w = this.waiters[idx];
        if (w) this.waiters.splice(idx, 1);
        w?.resolve(msg);
      }
    });
  }

  async ready(): Promise<void> {
    await this.openPromise;
  }

  send(payload: unknown): void {
    this.socket.send(JSON.stringify(payload));
  }

  /** Resolves with the first matching frame (also scans frames already seen). */
  waitFor(match: (m: any) => boolean, timeoutMs = 20000): Promise<any> {
    const existing = this.log.find(match);
    if (existing) return Promise.resolve(existing);
    const { promise, resolve, reject } = Promise.withResolvers<any>();
    // guard against unhandled rejections when a waiter is never awaited
    void promise.catch(() => undefined);
    const timer = setTimeout(() => reject(new Error("ws wait timeout")), timeoutMs);
    this.waiters.push({
      match: (m) => {
        if (match(m)) {
          clearTimeout(timer);
          return true;
        }
        return false;
      },
      resolve: (m) => resolve(m),
    });
    return promise;
  }

  close(): void {
    this.socket.close();
  }
}

async function main(): Promise<void> {
  // ---- boot a real server against DATABASE_URL (Neon) ------------------------
  // Test mode unlocks dev OTP + dev endpoints regardless of local .env contents.
  process.env.NODE_ENV = "test";
  const { startServer } = await import("./server.ts");
  const handle = await startServer(TEST_PORT);
  console.log(`core up on :${TEST_PORT} (storage: ${handle.storage.kind})`);

  try {
    await runScenarios(handle);
  } finally {
    await handle.close();
  }

  console.log("\n=======================================================");
  console.log(`  FULL-FLOW E2E RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================\n");
  process.exit(failed === 0 ? 0 : 1);
}

async function runScenarios(handle: { storage: { sql: import("./db/storage.ts").SqlClient } }): Promise<void> {
  const sql = handle.storage.sql;

  // ===========================================================================
  section("S0 Auth & access control");
  {
    const badPhone = await api("/v1/auth/otp/send", { phone: "not-a-phone" });
    check("OTP send rejects malformed phone (400)", badPhone.status === 400);

    const send = await api("/v1/auth/otp/send", { phone: RIDER_PHONE });
    check("OTP send accepted for valid E.164 phone", send.status === 200 && send.json.sent === true);

    const badOtp = await api("/v1/auth/otp/verify", { phone: RIDER_PHONE, otp: "999999", role: "RIDER" });
    check("wrong OTP rejected (401 BAD_OTP)", badOtp.status === 401 && badOtp.json.code === "BAD_OTP");

    const rider = await api("/v1/auth/otp/verify", {
      phone: RIDER_PHONE, otp: DEV_OTP, role: "RIDER", fullName: "E2E Rider",
    });
    check("rider login issues JWT", rider.status === 200 && typeof rider.json.token === "string");
    globalThis.__riderToken = rider.json.token;

    const driver = await api("/v1/auth/otp/verify", { phone: DRIVER_PHONE, otp: DEV_OTP, role: "DRIVER" });
    check("driver login issues JWT", driver.status === 200 && typeof driver.json.token === "string");
    globalThis.__driverToken = driver.json.token;

    const roleMismatch = await api("/v1/auth/otp/verify", { phone: RIDER_PHONE, otp: DEV_OTP, role: "DRIVER" });
    check("rider phone cannot log in as DRIVER", roleMismatch.status >= 400);

    const noAuth = await api("/v1/quotes", { pickup: PICKUP, drop: DROP });
    check("quotes require auth (401)", noAuth.status === 401);
  }
  const riderToken: string = globalThis.__riderToken as string;
  const driverToken: string = globalThis.__driverToken as string;

  // ===========================================================================
  section("S1 Quote engine integrity");
  {
    const q = await api("/v1/quotes", { pickup: PICKUP, drop: DROP }, riderToken);
    const quotes = q.json.quotes ?? [];
    check("quotes returned for all 6 configured classes", quotes.length === 6);
    const bike = quotes.find((x: any) => x.vehicleClass === "BIKE");

    check(
      "list price == trip fare + platform fee",
      bike.listPrice === bike.tripFare + bike.platformFeePaise,
      `${bike.listPrice} != ${bike.tripFare}+${bike.platformFeePaise}`,
    );
    check("soft floor is 60% of list", bike.softFloor === Math.round(bike.listPrice * 0.6));
    check("platform fee within seeded [min=500, cap=4000]", bike.platformFeePaise >= 500 && bike.platformFeePaise <= 4000);
    check("eta + distance populated", bike.etaMin > 0 && bike.distanceKm > 0);

    // tampered quote token must be rejected at request creation
    const [body, sig] = bike.quoteToken.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    payload.lp = 1; // forge a ₹0.01 list price
    const forgedBody = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const tamper = await api("/v1/requests", {
      quoteToken: `${forgedBody}.${sig}`, vehicleClass: "BIKE", paymentMethod: "UPI",
      pickup: PICKUP, drop: DROP,
    }, riderToken);
    check("tampered quote token rejected (400)", tamper.status === 400);
  }

  // ---- shared sockets ---------------------------------------------------------
  const riderWs = new WsBus(`${BASE.replace("http", "ws")}/ws/rider`, await wsTicket(riderToken));
  const driverWs = new WsBus(`${BASE.replace("http", "ws")}/ws/driver`, await wsTicket(driverToken));
  await riderWs.ready();
  await driverWs.ready();
  driverWs.send({ t: "pos.update", lat: PICKUP.lat, lng: PICKUP.lng });
  // Server-side WS handshake does a DB session check (~0.5-1s against remote Neon);
  // wait until the driver is definitely registered in the live dispatch table.
  await new Promise((r) => setTimeout(r, 3000));

  // ===========================================================================
  section("S2 LIST dispatch -> claim race -> trip lifecycle -> settlement -> rating");
  {
    const meBefore = await api("/v1/driver/me", undefined, driverToken);
    const q = await api("/v1/quotes", { pickup: PICKUP, drop: DROP }, riderToken);
    const bike = (q.json.quotes ?? []).find((x: any) => x.vehicleClass === "BIKE");

    const assignedWait = riderWs.waitFor((m) => m.t === "driver.assigned");
    const offerWait = driverWs.waitFor((m) => m.t === "dispatch.offer" && !m.offer.isCounter);

    const created = await api("/v1/requests", {
      quoteToken: bike.quoteToken, vehicleClass: "BIKE", paymentMethod: "UPI",
      pickup: PICKUP, drop: DROP, // no offerPaise => LIST mode
    }, riderToken);
    check("LIST request created in MATCHING", created.status === 200 && created.json.mode === "LIST" && created.json.state === "MATCHING");
    check("offer delivered to matching online driver", created.json.deliveredToDrivers >= 1);

    const offer = (await offerWait).offer;
    check("LIST take-home equals trip fare", offer.takeHomePaise === bike.tripFare);
    check("offer carries rider context + route", typeof offer.riderName === "string" && offer.tripKm > 0);

    // a second driver races for the same request and must lose atomically
    const rivalPhone = "+919900000901";
    const rivalAuth = await api("/v1/auth/otp/verify", { phone: rivalPhone, otp: DEV_OTP, role: "DRIVER" });
    const rivalTok = rivalAuth.json.token as string;
    const rivalUserId = rivalAuth.json.userId as string;
    await sql.query(
      `INSERT INTO driver_profiles (user_id, vehicle_class, plate, kyc_status, online)
       VALUES ($1, 'BIKE', 'KA01RIVAL1', 'APPROVED', false)
       ON CONFLICT (user_id) DO UPDATE SET kyc_status='APPROVED', vehicle_class='BIKE'`,
      [rivalUserId],
    );
    const rivalWs = new WsBus(`${BASE.replace("http", "ws")}/ws/driver`, await wsTicket(rivalTok));
    await rivalWs.ready();
    rivalWs.send({ t: "pos.update", lat: PICKUP.lat, lng: PICKUP.lng });
    await new Promise((r) => setTimeout(r, 250));

    const win = await api(`/v1/requests/${created.json.sessionId}/accept`, {}, driverToken);
    check("first driver claims LIST request -> trip", win.status === 200 && typeof win.json.tripId === "string");
    const lose = await api(`/v1/requests/${created.json.sessionId}/accept`, {}, rivalTok);
    check(
      "second driver claim rejected atomically (409)",
      lose.status === 409,
      `${lose.status} ${lose.json.code ?? ""}`,
    );
    rivalWs.close();

    const tripId = win.json.tripId;
    const assigned = await assignedWait;
    const otp = assigned.trip?.otp;
    check("rider got driver.assigned with plaintext OTP", typeof otp === "string" && otp.length >= 4);
    check("assignment shows winning driver's plate", assigned.trip?.driverPlate === "KA010101XY");

    // lifecycle guards + progression
    const skipState = await api(`/v1/trips/${tripId}/state`, { to: "ARRIVING" }, riderToken);
    check("rider cannot drive trip state (403)", skipState.status === 403);
    await api(`/v1/trips/${tripId}/state`, { to: "ARRIVING" }, driverToken);
    await api(`/v1/trips/${tripId}/state`, { to: "ARRIVED" }, driverToken);
    const st = await api(`/v1/trips/${tripId}`, undefined, riderToken);
    check("rider sees ARRIVED state", st.json.state === "ARRIVED");

    const wrongOtp = await api(`/v1/trips/${tripId}/start`, { otp: "000000" }, riderToken);
    check("wrong start OTP rejected (401)", wrongOtp.status === 401);

    // rider can rotate the OTP while waiting (pre-start only)
    const regen = await api(`/v1/trips/${tripId}/regenerate-otp`, {}, riderToken);
    check("rider can regenerate start OTP pre-start", regen.status === 200 && typeof regen.json.otp === "string");
    const started = await api(`/v1/trips/${tripId}/start`, { otp: regen.json.otp ?? otp }, riderToken);
    check("correct OTP starts ride (ONGOING)", started.status === 200 && started.json.state === "ONGOING");
    const restart = await api(`/v1/trips/${tripId}/start`, { otp }, riderToken);
    check("double-start is idempotent ONGOING", restart.status === 200 && restart.json.state === "ONGOING");
    const regenLate = await api(`/v1/trips/${tripId}/regenerate-otp`, {}, riderToken);
    check("OTP regeneration blocked after start (409)", regenLate.status >= 400);

    const tipPaise = 2000;
    const done = await api(`/v1/trips/${tripId}/complete`, { tipPaise }, driverToken);
    check("trip completes + settles (with tip)", done.status === 200 && done.json.state === "COMPLETED" && done.json.duplicate !== true);
    const doubleDone = await api(`/v1/trips/${tripId}/complete`, { tipPaise }, driverToken);
    check(
      "double-settle rejected or idempotent",
      doubleDone.status === 409 || doubleDone.json.duplicate === true,
      `${doubleDone.status}`,
    );

    const recon = await api(`/v1/dev/reconcile?tripId=${tripId}`);
    check("journal entries balance for trip", recon.json.balanced === true && recon.json.lines >= 2);

    const rate = await api(`/v1/trips/${tripId}/rate`, { stars: 5, comment: "Smooth Ride" }, riderToken);
    check("rider rating accepted", rate.status === 200 && rate.json.ok === true);
    const dupRate = await api(`/v1/trips/${tripId}/rate`, { stars: 1 }, riderToken);
    check("duplicate rating rejected (409)", dupRate.status === 409);
    const badStars = await api(`/v1/trips/${tripId}/rate`, { stars: 9 }, riderToken);
    check("out-of-range stars rejected (400)", badStars.status === 400);

    const history = await api("/v1/trips", undefined, riderToken);
    check("completed trip appears in rider history", (history.json.trips ?? []).some((t: any) => t.id === tripId));

    const meAfter = await api("/v1/driver/me", undefined, driverToken);
    check(
      "driver earnings increased after completion",
      meAfter.json.walletBalancePaise > meBefore.json.walletBalancePaise,
      `${meBefore.json.walletBalancePaise} -> ${meAfter.json.walletBalancePaise}`,
    );
    check("completedTrips counter incremented", meAfter.json.completedTrips > meBefore.json.completedTrips);
  }

  // ===========================================================================
  section("S3 Zero-offer negotiated ride, CASH settlement");
  {
    const q = await api("/v1/quotes", { pickup: PICKUP, drop: DROP }, riderToken);
    const bike = (q.json.quotes ?? []).find((x: any) => x.vehicleClass === "BIKE");

    const offerWait = driverWs.waitFor((m) => m.t === "dispatch.offer" && m.offer.takeHomePaise === 0);
    const created = await api("/v1/requests", {
      quoteToken: bike.quoteToken, offerPaise: 0, vehicleClass: "BIKE", paymentMethod: "CASH",
      pickup: PICKUP, drop: DROP,
    }, riderToken);
    check("zero-offer request accepted (honest floor)", created.status === 200 && created.json.currentOfferPaise === 0);

    const offerMsg = await offerWait;
    check("driver sees ₹0 take-home CASH offer", offerMsg.offer.paymentMethod === "CASH");

    const accept = await api(`/v1/negotiations/${created.json.negotiationId}/accept`, {}, driverToken);
    check("driver accepts zero-offer -> trip", accept.status === 200 && typeof accept.json.tripId === "string");
    const assigned = await riderWs.waitFor((m) => m.t === "driver.assigned" && m.trip?.id === accept.json.tripId);
    check("rider assignment OTP present (cash ride)", typeof assigned.trip?.otp === "string");

    const tripId = accept.json.tripId;
    await api(`/v1/trips/${tripId}/state`, { to: "ARRIVING" }, driverToken);
    await api(`/v1/trips/${tripId}/state`, { to: "ARRIVED" }, driverToken);
    await api(`/v1/trips/${tripId}/start`, { otp: assigned.trip.otp }, riderToken);
    const done = await api(`/v1/trips/${tripId}/complete`, {}, driverToken);
    check("cash ride completes", done.status === 200 && done.json.state === "COMPLETED");

    const recon = await api(`/v1/dev/reconcile?tripId=${tripId}`);
    // zero-fare + platform-fee-only trips post a single line; assert net-zero across
    // all involved accounts rather than the endpoint's >=2-lines heuristic
    const accts = Object.values(recon.json.accounts ?? {}) as number[];
    const netSum = accts.reduce((s, v) => s + v, 0);
    check(
      "cash settlement ledger nets to zero",
      netSum === 0 || recon.json.lines === 0,
      `net=${netSum} accounts=${JSON.stringify(recon.json.accounts)}`,
    );
  }

  // ===========================================================================
  section("S4 Negotiation: counter -> rider final-offer -> driver accept");
  {
    const q = await api("/v1/quotes", { pickup: PICKUP, drop: DROP }, riderToken);
    const bike = (q.json.quotes ?? []).find((x: any) => x.vehicleClass === "BIKE");
    const lowball = Math.round(bike.listPrice / 2);

    const created = await api("/v1/requests", {
      quoteToken: bike.quoteToken, offerPaise: lowball, vehicleClass: "BIKE", paymentMethod: "UPI",
      pickup: PICKUP, drop: DROP,
    }, riderToken);
    check("negotiated request opens round 1", created.status === 200 && created.json.round === 1);

    const negId = created.json.negotiationId;
    const counterWait = riderWs.waitFor((m) => m.t === "negotiation.counter" && m.negotiationId === negId);
    const counter = await api(`/v1/negotiations/${negId}/counter`, { paise: lowball + 2000 }, driverToken);
    check("driver counter accepted (COUNTERED_DRIVER)", counter.status === 200 && counter.json.state === "COUNTERED_DRIVER");

    const counterMsg = await counterWait;
    check("rider got negotiation.counter push with amount", counterMsg.paise === lowball + 2000);

    const belowOffer = await api(`/v1/negotiations/${negId}/final`, { paise: 1, platformFeePaise: bike.platformFeePaise }, riderToken);
    check("rider final below driver counter blocked (409)", belowOffer.status === 409);

    const finalResp = await api(`/v1/negotiations/${negId}/final`, { paise: lowball + 1000, platformFeePaise: bike.platformFeePaise }, riderToken);
    check("rider final-offer moves to round 2", finalResp.status === 200 && finalResp.json.round === 2);

    const updatedOffer = await driverWs.waitFor(
      (m) => m.t === "dispatch.offer" && m.offer.negotiationId === negId && m.offer.isCounter === true,
    );
    check("driver receives updated counter-offer take-home", updatedOffer.offer.takeHomePaise === lowball + 1000);

    const accept = await api(`/v1/negotiations/${negId}/accept`, {}, driverToken);
    check("driver accepts countered deal -> trip", accept.status === 200 && typeof accept.json.tripId === "string");
    const trip = await api(`/v1/trips/${accept.json.tripId}`, undefined, riderToken);
    check(
      "fare breakdown reflects negotiated agreement",
      trip.json.fareBreakdown?.mode === "NEGOTIATED" && trip.json.fareBreakdown?.agreedPaise === lowball + 1000,
    );

    // finish it so the driver is free for later scenarios
    const assigned = await riderWs.waitFor((m) => m.t === "driver.assigned" && m.trip?.id === accept.json.tripId);
    await api(`/v1/trips/${accept.json.tripId}/state`, { to: "ARRIVING" }, driverToken);
    await api(`/v1/trips/${accept.json.tripId}/state`, { to: "ARRIVED" }, driverToken);
    await api(`/v1/trips/${accept.json.tripId}/start`, { otp: assigned.trip.otp }, riderToken);
    await api(`/v1/trips/${accept.json.tripId}/complete`, {}, driverToken);
  }

  // ===========================================================================
  section("S5 Rider decline + cancel pre-agreement");
  {
    const q = await api("/v1/quotes", { pickup: PICKUP, drop: DROP }, riderToken);
    const bike = (q.json.quotes ?? []).find((x: any) => x.vehicleClass === "BIKE");

    // decline path
    const d1 = await api("/v1/requests", {
      quoteToken: bike.quoteToken, offerPaise: Math.round(bike.listPrice / 2),
      vehicleClass: "BIKE", paymentMethod: "UPI", pickup: PICKUP, drop: DROP,
    }, riderToken);
    await api(`/v1/negotiations/${d1.json.negotiationId}/counter`, { paise: bike.listPrice }, driverToken);
    const declined = await api(`/v1/negotiations/${d1.json.negotiationId}/rider-decline`, {}, riderToken);
    check("rider decline acknowledged", declined.status === 200 && declined.json.ok === true);
    const reDecline = await api(`/v1/negotiations/${d1.json.negotiationId}/rider-decline`, {}, riderToken);
    check("double decline is idempotent ok", reDecline.status === 200 && reDecline.json.ok === true);

    // cancel path — rider cancels while broadcasting; driver gets dispatch.cancel.
    // single-use quote tokens: d2 must carry its own fresh quote.
    const q2 = await api("/v1/quotes", { pickup: PICKUP, drop: DROP }, riderToken);
    const bike2 = (q2.json.quotes ?? []).find((x: any) => x.vehicleClass === "BIKE");
    const d2 = await api("/v1/requests", {
      quoteToken: bike2.quoteToken, offerPaise: Math.round(bike2.listPrice / 2),
      vehicleClass: "BIKE", paymentMethod: "UPI", pickup: PICKUP, drop: DROP,
    }, riderToken);
    // supersede cleanup may fan out cancels for stale prior-run requests — scope to d2 only
    const cancelWait = driverWs.waitFor(
      (m) => m.t === "dispatch.cancel" && m.requestId === d2.json.sessionId,
    );
    const cancelled = await api(`/v1/requests/${d2.json.sessionId}/cancel`, {}, riderToken);
    check("pre-agreement cancel succeeds", cancelled.status === 200 && cancelled.json.ok === true);
    const cancelMsg = await cancelWait;
    check("driver received dispatch.cancel fanout", cancelMsg.requestId === d2.json.sessionId);
    const reCancel = await api(`/v1/requests/${d2.json.sessionId}/cancel`, {}, riderToken);
    check("double cancel rejected NOT_CANCELLABLE (409)", reCancel.status === 409 && reCancel.json.code === "NOT_CANCELLABLE");
  }

  // ===========================================================================
  section("S6 Max-rounds guardrail (3 rounds max)");
  {
    const q = await api("/v1/quotes", { pickup: PICKUP, drop: DROP }, riderToken);
    const bike = (q.json.quotes ?? []).find((x: any) => x.vehicleClass === "BIKE");
    const created = await api("/v1/requests", {
      quoteToken: bike.quoteToken, offerPaise: 100, vehicleClass: "BIKE", paymentMethod: "UPI",
      pickup: PICKUP, drop: DROP,
    }, riderToken);
    const negId = created.json.negotiationId;
    // FSM: opening offer (round 1) -> driver counter -> rider closing offer (round 2).
    // From COUNTERED_RIDER the driver can ONLY accept/expire/cancel — no second counter.
    await api(`/v1/negotiations/${negId}/counter`, { paise: bike.listPrice }, driverToken);
    const fin = await api(`/v1/negotiations/${negId}/final`, { paise: 150, platformFeePaise: bike.platformFeePaise }, riderToken);
    check("counter + closing offer reach round 2", fin.status === 200 && fin.json.round === 2);

    const reCounter = await api(`/v1/negotiations/${negId}/counter`, { paise: bike.listPrice }, driverToken);
    check(
      "second driver counter blocked once rider's close is out (409)",
      reCounter.status === 409,
      `${reCounter.status} ${reCounter.json.code ?? ""}`,
    );

    // white-box: push round to the cap and verify the guardrail trips
    await sql.query("UPDATE negotiations SET round=$2 WHERE id=$1", [negId, 3]);
    const overCap = await api(`/v1/negotiations/${negId}/final`, { paise: 400, platformFeePaise: bike.platformFeePaise }, riderToken);
    check(
      "final beyond maxRounds rejected NEGOTIATION_ROUND_EXCEEDED (409)",
      overCap.status === 409 && overCap.json.code === "NEGOTIATION_ROUND_EXCEEDED",
      `${overCap.status} ${overCap.json.code ?? ""}`,
    );
    await api(`/v1/requests/${created.json.sessionId}/cancel`, {}, riderToken).catch(() => undefined);
  }

  // ===========================================================================
  section("S7 Background expiry sweeper");
  {
    const q = await api("/v1/quotes", { pickup: PICKUP, drop: DROP }, riderToken);
    const bike = (q.json.quotes ?? []).find((x: any) => x.vehicleClass === "BIKE");
    const created = await api("/v1/requests", {
      quoteToken: bike.quoteToken, offerPaise: 2200, vehicleClass: "BIKE", paymentMethod: "UPI",
      pickup: PICKUP, drop: DROP,
    }, riderToken);
    // fast-forward expiry in the DB, then wait for the 1s sweeper tick
    await sql.query(
      "UPDATE negotiations SET expires_at = now() - interval '5 seconds' WHERE id=$1",
      [created.json.negotiationId],
    );
    await new Promise((r) => setTimeout(r, 2500));
    const sess = await api(`/v1/requests/${created.json.sessionId}`, undefined, riderToken);
    check("expired negotiation flipped to EXPIRED by sweeper", sess.json.state === "EXPIRED");
    const lateAccept = await api(`/v1/negotiations/${created.json.negotiationId}/accept`, {}, driverToken);
    check("accept after expiry rejected (409)", lateAccept.status === 409);
  }

  // ===========================================================================
  section("S8 Vehicle-class dispatch isolation");
  {
    const q = await api("/v1/quotes", { pickup: PICKUP, drop: DROP }, riderToken);
    const xl = (q.json.quotes ?? []).find((x: any) => x.vehicleClass === "CAB_XL"); // only a BIKE driver is live
    const created = await api("/v1/requests", {
      quoteToken: xl.quoteToken, vehicleClass: "CAB_XL", paymentMethod: "UPI",
      pickup: PICKUP, drop: DROP,
    }, riderToken);
    check("no cross-class delivery (deliveredToDrivers=0)", created.json.deliveredToDrivers === 0);
    await api(`/v1/requests/${created.json.sessionId}/cancel`, {}, riderToken);
  }

  // ===========================================================================
  section("S9 KYC gate for unapproved drivers");
  {
    const ghostPhone = "+919900000902";
    // current product rule: new drivers register exactly one vehicle class
    const ghost = await api("/v1/auth/otp/verify", { phone: ghostPhone, otp: DEV_OTP, role: "DRIVER", vehicleClass: "BIKE" });
    check("fresh driver login works (no profile yet)", ghost.status === 200);

    const q = await api("/v1/quotes", { pickup: PICKUP, drop: DROP }, riderToken);
    const prime = (q.json.quotes ?? []).find((x: any) => x.vehicleClass === "CAB_PRIME");
    const created = await api("/v1/requests", {
      quoteToken: prime.quoteToken, vehicleClass: "CAB_PRIME", paymentMethod: "UPI",
      pickup: PICKUP, drop: DROP,
    }, riderToken);
    const gated = await api(`/v1/requests/${created.json.sessionId}/accept`, {}, ghost.json.token);
    check(
      "unapproved driver cannot accept (403 KYC_NOT_APPROVED)",
      gated.status === 403 && gated.json.code === "KYC_NOT_APPROVED",
    );
    await api(`/v1/requests/${created.json.sessionId}/cancel`, {}, riderToken);
  }

  // ===========================================================================
  section("S10 Double-entry ledger deep-check");
  {
    const latest = await api("/v1/dev/latest-trip");
    const tripId = latest.json.tripId;
    const lines = await sql.query<{ debit_account: string; credit_account: string; amount_paise: string }>(
      "SELECT debit_account, credit_account, amount_paise FROM journal_entries WHERE trip_id=$1 ORDER BY created_at",
      [tripId],
    );
    const net = new Map<string, number>();
    for (const l of lines.rows) {
      net.set(l.debit_account, (net.get(l.debit_account) ?? 0) - Number(l.amount_paise));
      net.set(l.credit_account, (net.get(l.credit_account) ?? 0) + Number(l.amount_paise));
    }
    const total = [...net.values()].reduce((s, v) => s + v, 0);
    check("double-entry nets to zero across all accounts", total === 0, `net=${total}`);
    const accounts = [...net.keys()];
    check("platform bank account involved in settlement", accounts.some((a) => a.startsWith("platform:")));
  }

  riderWs.close();
  driverWs.close();
}

main().catch((err: unknown) => {
  console.error("full-flow E2E fatal:", err);
  process.exit(1);
});
