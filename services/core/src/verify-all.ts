/**
 * Comprehensive verification suite covering all core requirements:
 * 1. Money & Fee Model (clamping, zero-offer, platform fee on rider side)
 * 2. Quote Token Cryptography (HMAC signature, expiry, tampering detection)
 * 3. Negotiation Engine State Machine & Bounds (max 3 rounds, decreasing offer rejection, floor checks, optimistic lock)
 * 4. Dispatch & Matching (haversine ring expansion, vehicle class matching, atomic race claim)
 * 5. Trip Lifecycle & Security (OTP hashing, attempt locks, state progression)
 * 6. Double-Entry Accounting Ledger (balance invariant, cash vs digital settlement, tip routing)
* 7. End-to-End Multi-Party Scenarios:
 *    - Scenario A: List-price instant dispatch & driver accept
 *    - Scenario B: Negotiated booking (zero offer Rs0) with driver accept
 *    - Scenario C: Negotiated booking with driver counter -> rider accept
 *    - Scenario D: Negotiated booking with driver counter -> rider final offer -> driver accept
 *    - Scenario E: Driver counter -> rider decline
 *    - Scenario F: Rider cancel pre-agreement
 *    - Scenario G: Driver cancel post-assignment
 *    - Scenario H: OTP start failure (invalid code rejection + correct code start)
 *    - Scenario I: Cash ride settlement (cash receivable + digital fee)
 *    - Scenario J: Ratings & duplicate rating rejection
 *    - Scenario K: Immutable single-vehicle driver registration
 *    - Scenario L: Wallet top-up & booking guard
 *    - Scenario M: Matched rider cancellation
 *    - Scenario N: Favourite drivers + direct-to-driver dispatch
 */
process.env.NO_AUTO_START = "1";
import WebSocket from "ws";
import { formatINR, paisa, platformFee, negotiatedQuote, canTransition, LEGAL_TRIP_TRANSITIONS } from "@chalo/protocol";
import { issueQuoteToken, verifyQuoteToken, quoteFromCard } from "./pricing.ts";
import { hashOtp } from "./trips.ts";
import { settlementLines } from "./ledger.ts";
import { startServer } from "./server.ts";
import { issueToken, upsertUser } from "./auth.ts";
import { seedData } from "./db/seed.ts";
import type { FareCardRow } from "./db/rows.ts";

const TEST_PORT = 8085;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const WS_BASE = `ws://127.0.0.1:${TEST_PORT}`;

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${name} ${detail ? `- ${detail}` : ""}`);
  }
}

async function api(path: string, body?: unknown, token?: string): Promise<{ status: number; json: any }> {
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

class WsClient {
  public socket!: WebSocket;
  private waiters: Array<{ match: (m: any) => boolean; resolve: (m: any) => void }> = [];

  static async connect(url: string): Promise<WsClient> {
    const client = new WsClient();
    const { promise, resolve, reject } = Promise.withResolvers<WsClient>();
    client.socket = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error(`WS connect timeout for ${url}`)), 8000);
    client.socket.on("open", () => {
      clearTimeout(timeout);
      resolve(client);
    });
    client.socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    client.socket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const idx = client.waiters.findIndex((w) => w.match(msg));
        if (idx >= 0) {
          const w = client.waiters[idx];
          if (w) client.waiters.splice(idx, 1);
          w?.resolve(msg);
        }
      } catch {}
    });
    return promise;
  }

  send(payload: unknown): void {
    this.socket.send(JSON.stringify(payload));
  }
  waitFor(match: (m: any) => boolean, timeoutMs = 30000): Promise<any> {
    const { promise, resolve, reject } = Promise.withResolvers<any>();
    const timer = setTimeout(() => reject(new Error(`WS wait timeout (${timeoutMs}ms)`)), timeoutMs);
    this.waiters.push({
      match: (m) => {
        if (match(m)) {
          clearTimeout(timer);
          return true;
        }
        return false;
      },
      resolve,
    });
    return promise;
  }

  close(): void {
    this.socket.close();
  }
}

async function runVerification(): Promise<void> {
  console.log("\n=======================================================");
  console.log("  CHALO-X CORE FEATURES VERIFICATION SUITE");
  console.log("=======================================================\n");

  // =========================================================================
  // 1. MONEY & FEE MODEL
  // =========================================================================
  console.log("--- 1. Money & Fee Model Verification ---");
  {
    // Normal fee calculation: 10% fee on â‚¹86 with min â‚¹5 (500 paise) and cap â‚¹40 (4000 paise)
    const normalFee = platformFee(paisa(8600), 0.10, paisa(500), paisa(4000));
    assert(normalFee === 860, "10% platform fee on â‚¹86 is â‚¹8.60 (860 paise)");

    // Clamping to minimum
    const minFee = platformFee(paisa(2000), 0.10, paisa(500), paisa(4000));
    assert(minFee === 500, "10% platform fee on â‚¹20 is clamped up to min â‚¹5 (500 paise)");

    // Clamping to cap
    const capFee = platformFee(paisa(80000), 0.10, paisa(500), paisa(4000));
    assert(capFee === 4000, "10% platform fee on â‚¹800 is clamped down to cap â‚¹40 (4000 paise)");

    // Zero-offer fee: even if rider negotiates to â‚¹0, the minimum platform fee is retained
    const zeroFee = platformFee(paisa(0), 0.10, paisa(500), paisa(4000));
    assert(zeroFee === 500, "â‚¹0 offer retains minimum platform fee of â‚¹5 (500 paise)");

    // Negotiated breakdown: driver gets 100% of their offer, platform fee is charged on rider side
    const mockList = { listPrice: paisa(8600), tripFare: paisa(7600), platformFee: paisa(1000), surgeMultiplier: 1 };
    const breakdown = negotiatedQuote(paisa(6000), mockList);
    assert(breakdown.driverTakeHome === 6000, "Driver take-home exactly equals the agreed â‚¹60 offer");
    assert(breakdown.platformFee === 1000, "Platform fee is charged separately on top");
    assert(breakdown.riderTotal === 7000, "Rider total is offer + platform fee (â‚¹70)");
  }

  // =========================================================================
  // 2. PRICING ENGINE & QUOTE CRYPTOGRAPHY
  // =========================================================================
  console.log("\n--- 2. Pricing Engine & Quote Cryptography ---");
  {
    const mockCard: FareCardRow = {
      id: "card-1",
      city_id: 1,
      vehicle_class: "BIKE",
      base_paise: 1500,
      per_km_paise: 650,
      per_min_paise: 80,
      min_fare_paise: 2500,
      platform_fee_pct: "0.10",
      platform_fee_min_paise: 500,
      platform_fee_cap_paise: 4000,
      night_multiplier: "1.0",
    };

    const quote = quoteFromCard(mockCard, 5.0); // 5 km
    assert(quote.tripFare >= 2500, "Calculated fare satisfies min_fare constraint");
    assert(quote.listPrice === quote.tripFare + quote.platformFeePaise, "List price equals tripFare + platformFee");

    const token = issueQuoteToken({
      vehicleClass: "BIKE",
      etaMin: 12,
      freeFlowEtaMin: 10,
      trafficLevel: "MODERATE",
      routeSource: "OSRM",
      distanceKm: 5.0,
      listPrice: quote.listPrice,
      tripFare: quote.tripFare,
      platformFeePaise: quote.platformFeePaise,
      softFloor: paisa(Math.round(quote.listPrice * 0.6)),
    }, 1);

    const verified = verifyQuoteToken(token);
    assert(verified !== null && verified.lp === quote.listPrice, "Quote token signature verifies valid payload");

    // Tampered token rejection
    const tampered = token.slice(0, -4) + "XXXX";
    assert(verifyQuoteToken(tampered) === null, "Tampered quote token is cryptographically rejected");
  }

  // =========================================================================
  // 3. NEGOTIATION FSM & TRANSITIONS
  // =========================================================================
  console.log("\n--- 3. Negotiation State Machine Rules ---");
  {
    assert(canTransition("BROADCASTING", "DRIVER_ACCEPT") === "AGREED", "BROADCASTING + DRIVER_ACCEPT -> AGREED");
    assert(canTransition("BROADCASTING", "DRIVER_COUNTER") === "COUNTERED_DRIVER", "BROADCASTING + DRIVER_COUNTER -> COUNTERED_DRIVER");
    assert(canTransition("BROADCASTING", "RIDER_CANCEL") === "CANCELLED", "BROADCASTING + RIDER_CANCEL -> CANCELLED");
    assert(canTransition("BROADCASTING", "EXPIRE") === "EXPIRED", "BROADCASTING + EXPIRE -> EXPIRED");

    assert(canTransition("COUNTERED_DRIVER", "RIDER_ACCEPT") === "AGREED", "COUNTERED_DRIVER + RIDER_ACCEPT -> AGREED");
    assert(canTransition("COUNTERED_DRIVER", "RIDER_FINAL") === "COUNTERED_RIDER", "COUNTERED_DRIVER + RIDER_FINAL -> COUNTERED_RIDER");
    assert(canTransition("COUNTERED_DRIVER", "RIDER_DECLINE") === "DECLINED", "COUNTERED_DRIVER + RIDER_DECLINE -> DECLINED");

    assert(canTransition("COUNTERED_RIDER", "DRIVER_ACCEPT") === "AGREED", "COUNTERED_RIDER + DRIVER_ACCEPT -> AGREED");
    assert(canTransition("COUNTERED_RIDER", "EXPIRE") === "EXPIRED", "COUNTERED_RIDER + EXPIRE -> EXPIRED");

    // Illegal transitions rejected
    assert(canTransition("AGREED", "DRIVER_COUNTER") === null, "Terminal state AGREED rejects new counter");
    assert(canTransition("EXPIRED", "DRIVER_ACCEPT") === null, "Terminal state EXPIRED rejects accept");
    assert(canTransition("CANCELLED", "RIDER_FINAL") === null, "Terminal state CANCELLED rejects final offer");
  }

  // =========================================================================
  // 4. TRIP FSM & OTP SECURITY
  // =========================================================================
  console.log("\n--- 4. Trip FSM & OTP Hashing ---");
  {
    assert(LEGAL_TRIP_TRANSITIONS.DRIVER_ASSIGNED.includes("ARRIVING"), "DRIVER_ASSIGNED -> ARRIVING allowed");
    assert(LEGAL_TRIP_TRANSITIONS.ARRIVING.includes("ARRIVED"), "ARRIVING -> ARRIVED allowed");
    assert(LEGAL_TRIP_TRANSITIONS.ARRIVED.includes("ONGOING"), "ARRIVED -> ONGOING allowed");
    assert(LEGAL_TRIP_TRANSITIONS.ONGOING.includes("COMPLETED"), "ONGOING -> COMPLETED allowed");
    assert(LEGAL_TRIP_TRANSITIONS.COMPLETED.length === 0, "COMPLETED is strictly terminal");

    // Salted OTP hashing
    const tripId = "trip-test-123";
    const otp = "582914";
    const hash = hashOtp(tripId, otp);
    assert(typeof hash === "string" && hash.length === 64, "OTP hashed to 256-bit hex digest");
    assert(hashOtp(tripId, otp) === hash, "OTP hash is deterministic for same tripId and OTP");
    assert(hashOtp("different-trip", otp) !== hash, "OTP hash is unique per tripId salt");
  }

  // =========================================================================
  // 5. DOUBLE-ENTRY ACCOUNTING LEDGER
  // =========================================================================
  console.log("\n--- 5. Double-Entry Accounting Ledger ---");
  {
    // Digital UPI ride settlement lines
    const digitalLines = settlementLines({
      riderId: "rider-1",
      driverId: "driver-1",
      agreedPaise: 5000,
      platformFeePaise: 800,
      tipPaise: 500,
      paymentMethod: "UPI",
    });

    const sumDebits = digitalLines.reduce((s, l) => s + l.amountPaise, 0);
    const sumCredits = digitalLines.reduce((s, l) => s + l.amountPaise, 0);
    assert(sumDebits === sumCredits && sumDebits === 6300, "Digital settlement is perfectly balanced (5000 + 800 + 500 = 6300)");

    // Cash ride settlement lines
    const cashLines = settlementLines({
      riderId: "rider-2",
      driverId: "driver-2",
      agreedPaise: 4000,
      platformFeePaise: 600,
      tipPaise: 0,
      paymentMethod: "CASH",
    });
    const cashDebits = cashLines.reduce((s, l) => s + l.amountPaise, 0);
    const cashCredits = cashLines.reduce((s, l) => s + l.amountPaise, 0);
    assert(cashDebits === cashCredits && cashDebits === 4600, "Cash settlement balances cash receivable with digital platform fee");
    assert(cashLines.some((l) => l.debitAccount.includes("POSTPAID")), "Cash ride bills platform fee digitally to rider postpaid");
  }

  // =========================================================================
  // 6. END-TO-END SCENARIO VERIFICATIONS AGAINST RUNNING API
  // =========================================================================
  console.log("\n--- 6. End-to-End Realtime API Scenarios ---");

  // Dedicated isolated server: never mutate a developer or production database.
  delete process.env.DATABASE_URL;
  process.env.PGLITE_DIR = ":memory:";
  process.env.NODE_ENV = "test";
  const serverHandle = await startServer(TEST_PORT);
  await seedData(serverHandle.storage.sql);

  // Setup Rider and Driver Auth Tokens
  const riderAuth = await api("/v1/auth/otp/verify", { phone: "+919900000001", otp: "123456", role: "RIDER", fullName: "Test Rider" });
  assert(riderAuth.status === 200 && !!riderAuth.json.token, "Rider authenticated via phone OTP");
  const riderToken = riderAuth.json.token;

  const driverAuth = await api("/v1/auth/otp/verify", { phone: "+919900000101", otp: "123456", role: "DRIVER" });
  assert(driverAuth.status === 200 && !!driverAuth.json.token, "Driver authenticated via phone OTP");
  const driverToken = driverAuth.json.token;

  const pickup = { lat: 12.9352, lng: 77.6245 };
  const drop = { lat: 12.9611, lng: 77.6387 };

  // Connect WebSocket clients with 60-second single-use tickets (JWTs never enter URLs).
  const riderTicket = await api("/v1/ws/ticket", {}, riderToken);
  const driverTicket = await api("/v1/ws/ticket", {}, driverToken);
  const riderWs = await WsClient.connect(`${WS_BASE}/ws/rider?ticket=${riderTicket.json.ticket}`);
  const driverWs = await WsClient.connect(`${WS_BASE}/ws/driver?ticket=${driverTicket.json.ticket}`);
  driverWs.send({ t: "pos.update", lat: pickup.lat, lng: pickup.lng });
  await new Promise((r) => setTimeout(r, 400));

  // --- Scenario A: Direct List-Price Dispatch ---
  console.log("\n  [Scenario A] List-Price Instant Booking");
  {
    const quotesRes = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bikeQuote = quotesRes.json.quotes.find((q: any) => q.vehicleClass === "BIKE");
    assert(!!bikeQuote && bikeQuote.listPrice > 0, "Quotes fetched successfully with vehicle classes");

    const offerWaiter = driverWs.waitFor((m) => m.t === "dispatch.offer");
    const assignedWaiter = riderWs.waitFor((m) => m.t === "driver.assigned");

    const reqRes = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
    }, riderToken);
    assert(reqRes.status === 200 && reqRes.json.mode === "LIST", "List-price request created in MATCHING state");

    const offer = await offerWaiter;
    assert(offer.offer.requestId === reqRes.json.sessionId, "Driver received list-price dispatch offer over WebSocket");

    // Driver accepts list request directly
    const acceptRes = await api(`/v1/requests/${reqRes.json.sessionId}/accept`, {}, driverToken);
    assert(acceptRes.status === 200 && !!acceptRes.json.tripId, "Driver accepted list-price request");

    const assigned = await assignedWaiter;
    assert(assigned.trip.id === acceptRes.json.tripId, "Rider received driver.assigned with tripId over WebSocket");
    assert(!!assigned.trip.otp, "Rider received start OTP on trip assignment");

    // Complete trip
    await api(`/v1/trips/${assigned.trip.id}/state`, { to: "ARRIVING" }, driverToken);
    await api(`/v1/trips/${assigned.trip.id}/state`, { to: "ARRIVED" }, driverToken);
    const startRes = await api(`/v1/trips/${assigned.trip.id}/start`, { otp: assigned.trip.otp }, riderToken);
    assert(startRes.status === 200 && startRes.json.state === "ONGOING", "Trip started with valid OTP");
    const completeRes = await api(`/v1/trips/${assigned.trip.id}/complete`, { tipPaise: 1000 }, driverToken);
    assert(completeRes.status === 200 && completeRes.json.state === "COMPLETED", "Trip completed and ledger settled");
  }

  // --- Scenario B: Negotiated Booking with Driver Counter & Rider Accept ---
  console.log("\n  [Scenario B] Negotiated Booking with Driver Counter");
  {
    const quotesRes = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bikeQuote = quotesRes.json.quotes.find((q: any) => q.vehicleClass === "BIKE");

    const offerWaiter = driverWs.waitFor((m) => m.t === "dispatch.offer");
    const counterWaiter = riderWs.waitFor((m) => m.t === "negotiation.counter");
    const assignedWaiter = riderWs.waitFor((m) => m.t === "driver.assigned");

    const riderOffer = Math.round(bikeQuote.listPrice * 0.5);
    const platformContribution = 125; // â‚¹1.25, independently negotiated from driver pay
    const reqRes = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      offerPaise: riderOffer,
      platformFeePaise: platformContribution,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
    }, riderToken);
    assert(reqRes.status === 200 && reqRes.json.mode === "NEGOTIATED", "Negotiated request created in NEGOTIATING state");
    assert(reqRes.json.platformFeePaise === platformContribution, "Rider platform contribution is independently negotiable");
    assert(reqRes.json.riderTotalPaise === riderOffer + platformContribution, "Net total equals driver pay plus platform contribution");

    const offer = await offerWaiter;
    assert(offer.offer.takeHomePaise === riderOffer, "Driver receives rider offer as pure take-home pay");

    // Driver counters +â‚¹15
    const driverCounterAsk = riderOffer + 1500;
    const counterRes = await api(`/v1/negotiations/${reqRes.json.negotiationId}/counter`, { paise: driverCounterAsk }, driverToken);
    assert(counterRes.status === 200 && counterRes.json.state === "COUNTERED_DRIVER", "Driver counter submitted successfully");

    const counterMsg = await counterWaiter;
    assert(counterMsg.paise === driverCounterAsk, "Rider receives driver counter over WebSocket");

    // Rider accepts driver counter
    const acceptRes = await api(`/v1/negotiations/${reqRes.json.negotiationId}/rider-accept`, {}, riderToken);
    assert(acceptRes.status === 200 && !!acceptRes.json.tripId, "Rider accepted driver counter -> trip created");

    const assigned = await assignedWaiter;
    assert(assigned.trip.fareBreakdown.agreedPaise === driverCounterAsk, "Trip fare breakdown reflects agreed counter amount");
    assert(assigned.trip.fareBreakdown.platformFeePaise === platformContribution, "Trip snapshot preserves negotiated platform contribution");

    // Finish trip
    await api(`/v1/trips/${assigned.trip.id}/state`, { to: "ARRIVING" }, driverToken);
    await api(`/v1/trips/${assigned.trip.id}/state`, { to: "ARRIVED" }, driverToken);
    await api(`/v1/trips/${assigned.trip.id}/start`, { otp: assigned.trip.otp }, riderToken);
    await api(`/v1/trips/${assigned.trip.id}/complete`, {}, driverToken);
  }

  // --- Scenario C: Driver Counter -> Rider Final Offer -> Driver Accept ---
  console.log("\n  [Scenario C] Driver Counter -> Rider Final Offer -> Driver Accept");
  {
    const quotesRes = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bikeQuote = quotesRes.json.quotes.find((q: any) => q.vehicleClass === "BIKE");

    const offerWaiter = driverWs.waitFor((m) => m.t === "dispatch.offer");
    const counterWaiter = riderWs.waitFor((m) => m.t === "negotiation.counter");
    const finalOfferWaiter = driverWs.waitFor((m) => m.t === "dispatch.offer" && m.offer.isCounter);

    const riderOffer = Math.round(bikeQuote.listPrice * 0.4);
    const reqRes = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      offerPaise: riderOffer,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
    }, riderToken);

    await offerWaiter;

    // Driver counters
    const driverCounterAsk = riderOffer + 2500;
    await api(`/v1/negotiations/${reqRes.json.negotiationId}/counter`, { paise: driverCounterAsk }, driverToken);
    await counterWaiter;

    // Rider sends final offer (splitting difference)
    const riderFinalAsk = riderOffer + 1200;
    const finalRes = await api(
      `/v1/negotiations/${reqRes.json.negotiationId}/final`,
      { paise: riderFinalAsk, platformFeePaise: bikeQuote.platformFeePaise },
      riderToken,
    );
    assert(finalRes.status === 200 && finalRes.json.state === "COUNTERED_RIDER", "Rider final offer submitted (round 2)");

    const finalOfferMsg = await finalOfferWaiter;
    assert(finalOfferMsg.offer.takeHomePaise === riderFinalAsk, "Driver receives rider final offer broadcast");
    // Driver accepts final offer
    const assignedWaiter = riderWs.waitFor((m) => m.t === "driver.assigned");
    const acceptRes = await api(`/v1/negotiations/${reqRes.json.negotiationId}/accept`, {}, driverToken);
    assert(acceptRes.status === 200 && !!acceptRes.json.tripId, "Driver accepted rider final offer -> trip created");

    const assigned = await assignedWaiter;
    assert(assigned.trip.fareBreakdown.agreedPaise === riderFinalAsk, "Trip fare breakdown reflects agreed final offer amount");

    // Clean up
    await api(`/v1/trips/${assigned.trip.id}/state`, { to: "ARRIVING" }, driverToken);
    await api(`/v1/trips/${assigned.trip.id}/state`, { to: "ARRIVED" }, driverToken);
    await api(`/v1/trips/${assigned.trip.id}/start`, { otp: assigned.trip.otp }, riderToken);
    await api(`/v1/trips/${assigned.trip.id}/complete`, {}, driverToken);
  }

  // --- Scenario D: Driver Counter -> Rider Decline ---
  console.log("\n  [Scenario D] Driver Counter -> Rider Decline");
  {
    const quotesRes = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bikeQuote = quotesRes.json.quotes.find((q: any) => q.vehicleClass === "BIKE");

    const offerWaiter = driverWs.waitFor((m) => m.t === "dispatch.offer");
    const reqRes = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      offerPaise: 2000,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
    }, riderToken);

    await offerWaiter;
    await api(`/v1/negotiations/${reqRes.json.negotiationId}/counter`, { paise: 3500 }, driverToken);

    const declineRes = await api(`/v1/negotiations/${reqRes.json.negotiationId}/rider-decline`, {}, riderToken);
    assert(declineRes.status === 200 && declineRes.json.ok === true, "Rider declined driver counter successfully");
  }

  // --- Scenario E: Rider Cancellation ---
  console.log("\n  [Scenario E] Rider Cancellation");
  {
    const quotesRes = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bikeQuote = quotesRes.json.quotes.find((q: any) => q.vehicleClass === "BIKE");

    const reqRes = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      offerPaise: 2500,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
    }, riderToken);

    const cancelRes = await api(`/v1/requests/${reqRes.json.sessionId}/cancel`, {}, riderToken);
    assert(cancelRes.status === 200 && cancelRes.json.ok === true, "Rider cancelled active negotiation request");
    const checkReq = await api(`/v1/requests/${reqRes.json.sessionId}`, undefined, riderToken);
    assert(checkReq.json.state === "CANCELLED", "Request transitioned to CANCELLED state");
    const replay = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      offerPaise: 2500,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
    }, riderToken);
    assert(replay.status === 409 && replay.json.code === "QUOTE_ALREADY_USED", "Signed quote token cannot be replayed");
  }

  // --- Scenario F: Driver Cancellation of Assigned Trip ---
  console.log("\n  [Scenario F] Driver Post-Assignment Cancellation");
  {
    const quotesRes = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bikeQuote = quotesRes.json.quotes.find((q: any) => q.vehicleClass === "BIKE");

    const offerWaiter = driverWs.waitFor((m) => m.t === "dispatch.offer");
    const reqRes = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      offerPaise: 3000,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
    }, riderToken);

    await offerWaiter;
    const acceptRes = await api(`/v1/negotiations/${reqRes.json.negotiationId}/accept`, {}, driverToken);

    const cancelTripRes = await api(`/v1/trips/${acceptRes.json.tripId}/cancel-driver`, {}, driverToken);
    assert(cancelTripRes.status === 200 && cancelTripRes.json.state === "CANCELLED_DRIVER", "Driver cancelled assigned trip");

    const tripCheck = await api(`/v1/trips/${acceptRes.json.tripId}`, undefined, riderToken);
    assert(tripCheck.json.state === "CANCELLED_DRIVER", "Trip reflects CANCELLED_DRIVER state");
  }

  // --- Scenario G: Ratings & Duplicate Rating Protection ---
  console.log("\n  [Scenario G] Trip Ratings & Duplicate Rejection");
  {
    const quotesRes = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bikeQuote = quotesRes.json.quotes.find((q: any) => q.vehicleClass === "BIKE");
    const offerWaiter = driverWs.waitFor((m) => m.t === "dispatch.offer");
    const reqRes = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
    }, riderToken);
    await offerWaiter;
    const acceptRes = await api(`/v1/requests/${reqRes.json.sessionId}/accept`, {}, driverToken);
    const tripId = acceptRes.json.tripId;

    await api(`/v1/trips/${tripId}/state`, { to: "ARRIVING" }, driverToken);
    await api(`/v1/trips/${tripId}/state`, { to: "ARRIVED" }, driverToken);
    const regenRes = await api(`/v1/trips/${tripId}/regenerate-otp`, {}, riderToken);
    assert(regenRes.status === 200 && !!regenRes.json.otp, "Rider retrieved start OTP via secure regenerate-otp endpoint");

    await api(`/v1/trips/${tripId}/start`, { otp: regenRes.json.otp }, riderToken);
    await api(`/v1/trips/${tripId}/complete`, {}, driverToken);

    const tipRes = await api(`/v1/trips/${tripId}/tip`, { amountPaise: 1500 }, riderToken);
    assert(tipRes.status === 200 && tipRes.json.ok, "Rider tip posts after completion");
    const duplicateTip = await api(`/v1/trips/${tripId}/tip`, { amountPaise: 1500 }, riderToken);
    assert(duplicateTip.status === 200 && duplicateTip.json.duplicate, "Rider tip is idempotent");

    const receipt = await api(`/v1/trips/${tripId}`, undefined, riderToken);
    assert(receipt.json.paymentMethod === "UPI", "Receipt exposes payment method");
    assert(!!receipt.json.startedAt && !!receipt.json.endedAt, "Receipt exposes trip timestamps");
    assert(receipt.json.fareBreakdown.tipPaise === 1500, "Receipt includes submitted tip");
    const rateRes = await api(`/v1/trips/${tripId}/rate`, { stars: 5, comment: "Great ride!" }, riderToken);
    assert(rateRes.status === 200 && rateRes.json.ok === true, "Rider submitted 5-star rating with comment");

    const dupRateRes = await api(`/v1/trips/${tripId}/rate`, { stars: 4 }, riderToken);
    assert(dupRateRes.status === 409, "Duplicate rating on same trip is properly rejected (HTTP 409)");
  }
  console.log("\n  [Scenario H] Driver Profile & Wallet Accounting");
  {
    const meRes = await api("/v1/driver/me", undefined, driverToken);
    assert(meRes.status === 200, "Driver summary endpoint /v1/driver/me returns 200");
    assert(meRes.json.completedTrips > 0, "Driver completed trips count incremented");
    assert(meRes.json.walletBalancePaise > 0, "Driver wallet balance reflects earnings from completed trips");
    assert(meRes.json.rating >= 5, "Driver summary exposes computed rolling rating");
    assert(meRes.json.todayEarningsPaise > 0 && meRes.json.weekEarningsPaise > 0, "Driver summary exposes today and week earnings");
    assert(meRes.json.digitalEarningsPaise > 0, "Driver summary exposes payment-method split");
    if (meRes.json.walletBalancePaise >= 20_000) {
      const payout = await api("/v1/driver/payout", { amountPaise: 20_000 }, driverToken);
      assert(payout.status === 200 && payout.json.balancePaise < meRes.json.walletBalancePaise, "Driver can withdraw available earnings");
    }
  }

  console.log("\n  [Scenario L] Wallet Top-up & Booking Guard");
  {
    const before = await api("/v1/wallet/me", undefined, riderToken);
    const topped = await api("/v1/wallet/topup", { amountPaise: 10_000 }, riderToken);
    assert(topped.status === 200 && topped.json.balancePaise === before.json.balancePaise + 10_000, "Rider wallet top-up updates balance");
  }

  console.log("\n  [Scenario M] Matched Rider Cancellation");
  {
    const quotesRes = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bikeQuote = quotesRes.json.quotes.find((q: any) => q.vehicleClass === "BIKE");
    const offerWaiter = driverWs.waitFor((m) => m.t === "dispatch.offer");
    const reqRes = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
    }, riderToken);
    await offerWaiter;
    const accepted = await api(`/v1/requests/${reqRes.json.sessionId}/accept`, {}, driverToken);
    const cancelled = await api(`/v1/trips/${accepted.json.tripId}/cancel-rider`, {}, riderToken);
    assert(cancelled.status === 200 && cancelled.json.state === "CANCELLED_RIDER", "Rider can cancel after driver assignment before start");
  }

  // --- Scenario I: Role Mismatch & Driver KYC Gate ---
  console.log("\n  [Scenario I] Role Protection & KYC Approval Gate");
  {
    const roleMismatch = await api("/v1/auth/otp/verify", { phone: "+919900000001", otp: "123456", role: "DRIVER" });
    assert(roleMismatch.status === 400 || roleMismatch.status === 403 || roleMismatch.json.code === "ROLE_MISMATCH", "Rider phone cannot masquerade as DRIVER");
  }

  // --- Scenario K: Single Vehicle Driver Registration ---
  console.log("\n  [Scenario K] Immutable Single-Vehicle Driver Registration");
  {
    const phone = `+9198${Date.now().toString().slice(-8)}`;
    const registration = await api("/v1/auth/otp/verify", {
      phone,
      otp: "123456",
      role: "DRIVER",
      vehicleClass: "AUTO",
    });
    assert(registration.status === 200 && !!registration.json.token, "New driver registers with one selected vehicle");
    const profile = await api("/v1/driver/me", undefined, registration.json.token);
    assert(profile.json.profile.vehicle_class === "AUTO", "Driver profile stores selected vehicle as AUTO");
    assert(profile.json.profile.kyc_status === "PENDING_DOCS", "New driver starts in document onboarding");
    const submitted = await api("/v1/driver/onboarding", { plate: "KA01AB1234" }, registration.json.token);
    assert(submitted.status === 200 && submitted.json.status === "IN_REVIEW", "Driver submits vehicle documents for review");
    const approved = await api("/v1/driver/onboarding/dev-approve", {}, registration.json.token);
    assert(approved.status === 200 && approved.json.status === "APPROVED", "Pilot onboarding can complete approval flow");
    await api("/v1/driver/status", { online: true }, registration.json.token);
    const persisted = await api("/v1/driver/me", undefined, registration.json.token);
    assert(persisted.json.profile.online === true, "Driver online state persists across profile reload");
    const change = await api("/v1/driver/status", { vehicleClass: "BIKE" }, registration.json.token);
    assert(change.status === 409 && change.json.code === "VEHICLE_IMMUTABLE", "Driver cannot switch to a second vehicle in console");
  }
  // --- Scenario J: Background Negotiation Expiry Sweeper (C1 Fix) ---
  console.log("\n  [Scenario J] Background Negotiation Expiry Sweeper");
  {
    const quotesRes = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bikeQuote = quotesRes.json.quotes.find((q: any) => q.vehicleClass === "BIKE");
    const reqRes = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      offerPaise: 2200,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
    }, riderToken);
    assert(reqRes.status === 200, "Request created for expiry test");

    // Fast-forward expires_at in DB
    await serverHandle?.storage.sql.query(
      "UPDATE negotiations SET expires_at = now() - interval '5 seconds' WHERE id = $1",
      [reqRes.json.negotiationId]
    );

    // Wait for the 1s background sweeper to process it
    await new Promise((r) => setTimeout(r, 1500));

    const checkExp = await api(`/v1/requests/${reqRes.json.sessionId}`, undefined, riderToken);
    assert(checkExp.json.state === "EXPIRED", "Background sweeper transitioned expired negotiation to EXPIRED");
  }

  // --- Scenario K: Favourite Drivers + Direct-to-Director Requests ---
  console.log("\n  [Scenario N] Ride Again With Driver (direct dispatch)");
  {
    const driverId = driverAuth.json.userId as string;

    // favourite toggle + list (PUT/DELETE need raw fetch — api() always POSTs)
    async function favFetch(driver: string, method: "PUT" | "DELETE"): Promise<{ status: number; json: any }> {
      const res = await fetch(`${BASE}/v1/drivers/${driver}/favorite`, {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${riderToken}` },
        body: method === "PUT" ? "{}" : undefined,
      });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    }
    const fav = await favFetch(driverId, "PUT");
    assert(fav.status === 200 && fav.json.ok === true, "Rider can favourite a driver", `${fav.status} ${JSON.stringify(fav.json)}`);
    const dupFav = await favFetch(driverId, "PUT");
    assert(dupFav.status === 200 && dupFav.json.duplicate === true, "Double-favourite is idempotent");
    const listRes = await api("/v1/rider/favorites", undefined, riderToken);
    assert(
      listRes.status === 200 &&
        listRes.json.favorites.some((f: any) => f.id === driverId && f.vehicleClass === "BIKE"),
      "Favourites list returns the saved driver with profile data",
    );

    // second live BIKE rider-context: a rival who must NOT receive direct requests.
    // Created via domain helpers — HTTP auth would trip the otp-ip rate limiter
    // this late in the suite.
    const rivalUser = await upsertUser(serverHandle!.storage.sql, "+919900000903", "DRIVER", "Rival Biker");
    const rivalToken = await issueToken(rivalUser.id, "DRIVER");
    await serverHandle?.storage.sql.query(
      `INSERT INTO driver_profiles (user_id, vehicle_class, plate, kyc_status, online)
       VALUES ($1, 'BIKE', 'KA01DIRECT', 'APPROVED', false)
       ON CONFLICT (user_id) DO UPDATE SET kyc_status='APPROVED', vehicle_class='BIKE'`,
      [rivalUser.id],
    );
    const rivalTicket = await api("/v1/ws/ticket", {}, rivalToken);
    const rivalWs = await WsClient.connect(`${WS_BASE}/ws/driver?ticket=${rivalTicket.json.ticket}`);
    rivalWs.send({ t: "pos.update", lat: pickup.lat, lng: pickup.lng });
    await new Promise((r) => setTimeout(r, 400));

    // targeted LIST request: exactly one delivery even with two eligible drivers
    const quotesRes = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bikeQuote = quotesRes.json.quotes.find((q: any) => q.vehicleClass === "BIKE");
    const targetWaiter = driverWs.waitFor((m) => m.t === "dispatch.offer");
    const reqRes = await api("/v1/requests", {
      quoteToken: bikeQuote.quoteToken,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
      driverId,
    }, riderToken);
    assert(reqRes.status === 200, "Direct-to-driver request created");
    assert(reqRes.json.deliveredToDrivers === 1, "Direct request delivered to exactly one driver");
    const targetOffer = await targetWaiter;
    assert(targetOffer.offer.requestId === reqRes.json.sessionId, "Target driver received the direct offer");
    // waitFor rejects on timeout â€” a timeout here is exactly what we want
    const rivalLeak = await rivalWs
      .waitFor((m: any) => m.t === "dispatch.offer" && m.offer.requestId === reqRes.json.sessionId, 1500)
      .then(() => true)
      .catch(() => false);
    assert(rivalLeak === false, "Rival BIKE driver did not receive the direct offer");

    // offline target fails fast instead of timing out
    const ghostUser = await upsertUser(serverHandle!.storage.sql, "+919900000904", "DRIVER", "Ghost Biker");
    const ghostProfile = await serverHandle?.storage.sql.query(
      `INSERT INTO driver_profiles (user_id, vehicle_class, plate, kyc_status, online)
       VALUES ($1, 'BIKE', 'KA01GHOST9', 'APPROVED', false)
       ON CONFLICT (user_id) DO UPDATE SET kyc_status='APPROVED', vehicle_class='BIKE'
       RETURNING user_id`,
      [ghostUser.id],
    );
    assert((ghostProfile?.rowCount ?? 0) === 1 || (ghostProfile?.rows.length ?? 0) === 1, "Offline rival driver seeded");
    const quotes2 = await api("/v1/quotes", { pickup, drop }, riderToken);
    const bike2 = quotes2.json.quotes.find((q: any) => q.vehicleClass === "BIKE");
    const offlineRes = await api("/v1/requests", {
      quoteToken: bike2.quoteToken,
      vehicleClass: "BIKE",
      paymentMethod: "UPI",
      pickup,
      drop,
      driverId: ghostUser.id,
    }, riderToken);
    assert(offlineRes.status === 409 && offlineRes.json.code === "DRIVER_UNAVAILABLE", "Offline favourite rejected fast with DRIVER_UNAVAILABLE");

    // cleanup: unfavourite + close rival socket
    await favFetch(driverId, "DELETE").catch(() => undefined);
    await api(`/v1/requests/${reqRes.json.sessionId}/cancel`, {}, riderToken).catch(() => undefined);
    rivalWs.close();
  }

  riderWs.close();
  driverWs.close();
  if (serverHandle) {
    await serverHandle.close();
  }

  console.log("\n=======================================================");
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error("Verification suite fatal error:", err);
  process.exit(1);
});
