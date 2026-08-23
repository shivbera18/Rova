/**
 * Core API server — REST + WS per plan §9.
 *   /v1/auth/*                       phone-OTP login (dev OTP 123456)
 *   /v1/quotes|requests|negotiations|trips   rider + driver flows
 *   /ws/rider /ws/driver             realtime channels (token in query string)
 * Storage: PG when DATABASE_URL set, else embedded PGlite auto-migrated on boot.
 */
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import type { FastifyRequest } from "fastify";
import type { DriverWsMessage, RiderWsMessage, VehicleClass } from "@chalo/protocol";
import { VEHICLE_CLASSES } from "@chalo/protocol";
import { openStorage } from "./db/storage.ts";
import type { Storage } from "./db/storage.ts";
import { runMigrations } from "./db/migrate.ts";
import { logger } from "./logger.ts";
import { seedData } from "./db/seed.ts";
import { DEV_OTP, issueToken, upsertUser, upsertUserWithPassword, verifyToken } from "./auth.ts";
import { estimateDistanceKm, issueQuoteToken, quoteTrip, verifyQuoteToken } from "./pricing.ts";
import {
  cancelByRider,
  createNegotiation,
  driverAccept,
  driverCounter,
  getNegotiation,
  NegotationError,
  riderAcceptCounter,
  riderDecline,
  riderFinalOffer,
  sweepExpiredNegotiations,
} from "./negotiation.ts";
import {
  broadcastOffer,
  cancelBroadcast,
  claimRequest,
  claimedDriver,
  getLiveDriver,
  registerDriver,
  releaseClaim,
  setDriverPos,
  setDriverVehicleClass,
  unregisterDriver,
} from "./dispatch.ts";
import {
  createTripFromAgreement,
  getTrip,
  readFareJson,
  regenerateTripOtp,
  settleTrip,
  transitionTrip,
  TripError,
  verifyStartOtp,
} from "./trips.ts";
import { walletBalance } from "./ledger.ts";
import type { LatLon } from "./types.ts";
import type { TripRow } from "./db/rows.ts";
import { enforceRateLimit, validateDriverGps, validateRideRequest } from "./security.ts";
import { removePushSubscription, savePushSubscription, sendPush, vapidPublicKey } from "./push.ts";

const PORT = Number(process.env.PORT ?? 8080);
const CITY_ID = 1;

type RiderConn = { socket: WebSocket };
type DriverConn = { socket: WebSocket };
const riderConns: Record<string, RiderConn> = {};
const driverConns: Record<string, DriverConn> = {};

function pushRider(riderId: string, msg: RiderWsMessage): void {
  const c = riderConns[riderId];
  if (c && c.socket.readyState === 1) c.socket.send(JSON.stringify(msg));
}

function pushDriver(driverId: string, msg: DriverWsMessage): boolean {
  const c = driverConns[driverId];
  if (!c || c.socket.readyState !== 1) return false;
  c.socket.send(JSON.stringify(msg));
  return true;
}

interface Session {
  userId: string;
  role: "RIDER" | "DRIVER";
}

function fail(statusCode: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { statusCode, code });
}

export async function startServer(listenPort = PORT): Promise<{
  app: ReturnType<typeof Fastify>;
  storage: Storage;
  close: () => Promise<void>;
}> {
  const storage: Storage = await openStorage();
  const sql = storage.sql;
  await runMigrations(sql);

  // Auto-seed pilot city fare cards if database is fresh
  const cardsCheck = await sql.query<{ c: string }>("SELECT COUNT(*) AS c FROM fare_cards");
  if (Number(cardsCheck.rows[0]?.c ?? 0) === 0) {
    logger.info("BOOT", "Auto-seeding Bengaluru pilot fare cards & negotiation rules");
    await seedData(sql);
  }

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.addHook("onRequest", async (req) => {
    (req as any)._startTime = performance.now();
  });
  app.addHook("onResponse", async (req, reply) => {
    const start = (req as any)._startTime ?? performance.now();
    logger.http(req.method, req.url, reply.statusCode, performance.now() - start);
  });
  app.addHook("onRequest", async (req) => {
    // Broad abuse ceiling. Sensitive routes add stricter policies below.
    enforceRateLimit(`ip:${req.ip}`, 300, 60_000);
  });

  async function session(req: FastifyRequest): Promise<Session | null> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    const tokenSess = await verifyToken(header.slice(7));
    if (!tokenSess) return null;
    const u = await sql.query<{ id: string; status: string }>(
      "SELECT id, status FROM users WHERE id=$1",
      [tokenSess.userId],
    );
    if (u.rows.length === 0 || u.rows[0]!.status !== "ACTIVE") {
      return null;
    }
    return tokenSess;
  }

  function requireAuth(sess: Session | null): Session {
    if (!sess) fail(401, "UNAUTHORIZED", "Sign in required");
    return sess;
  }

  function requireRider(sess: Session | null): Session {
    if (!sess) fail(401, "UNAUTHORIZED", "Sign in required");
    if (sess.role !== "RIDER") fail(403, "FORBIDDEN", "Rider account required");
    return sess;
  }

  function requireDriver(sess: Session | null): Session {
    if (!sess) fail(401, "UNAUTHORIZED", "Sign in required");
    if (sess.role !== "DRIVER") fail(403, "FORBIDDEN", "Driver account required");
    return sess;
  }

  async function requireApprovedDriver(driverId: string, vehicleClass?: string): Promise<void> {
    const r = await sql.query<{ kyc_status: string; vehicle_class: string }>(
      "SELECT kyc_status, vehicle_class FROM driver_profiles WHERE user_id=$1",
      [driverId],
    );
    const p = r.rows[0];
    if (!p || p.kyc_status !== "APPROVED") {
      fail(403, "KYC_NOT_APPROVED", "Driver account is not KYC approved");
    }
    if (vehicleClass && p.vehicle_class !== "ALL" && p.vehicle_class !== vehicleClass) {
      fail(403, "VEHICLE_CLASS_MISMATCH", `Driver vehicle (${p.vehicle_class}) does not match ride (${vehicleClass})`);
    }
  }

  // ---- auth ------------------------------------------------------------------
  app.post("/v1/auth/otp/send", async (req) => {
    const { phone } = req.body as { phone?: string };
    if (!phone || !/^\+[0-9]{10,15}$/.test(phone)) fail(400, "BAD_PHONE", "E.164 required");
    enforceRateLimit(`otp-ip:${req.ip}`, 10, 10 * 60_000);
    enforceRateLimit(`otp-phone:${phone}`, 5, 10 * 60_000);
    return { sent: true, devHint: `use ${DEV_OTP}` };
  });

  app.post("/v1/auth/otp/verify", async (req) => {
    const { phone, otp, role, fullName } = req.body as {
      phone?: string;
      otp?: string;
      role?: "RIDER" | "DRIVER";
      fullName?: string;
    };
    if (!phone || (role !== "RIDER" && role !== "DRIVER")) fail(400, "BAD_BODY", "phone + role required");
    if (otp !== DEV_OTP) fail(401, "BAD_OTP", "wrong code");
    const user = await upsertUser(sql, phone!, role!, fullName ?? "Chalo user");
    return { token: await issueToken(user.id, role!), userId: user.id, role };
  });

  // Password login: first sign-up registers the password; later logins verify it.
  app.post("/v1/auth/login/password", async (req) => {
    const { phone, password, role } = req.body as {
      phone?: string;
      password?: string;
      role?: "RIDER" | "DRIVER";
    };
    if (!phone || (role !== "RIDER" && role !== "DRIVER")) fail(400, "BAD_BODY", "phone + role required");
    if (!password || typeof password !== "string" || password.length < 4) {
      fail(400, "WEAK_PASSWORD", "password must be at least 4 characters");
    }
    const user = await upsertUserWithPassword(sql, phone!, role!, password);
    return { token: await issueToken(user.id, role!), userId: user.id, role };
  });

  app.post("/v1/quotes", async (req) => {
    const body = req.body as { pickup?: LatLon; drop?: LatLon; vehicleClasses?: VehicleClass[] };
    if (!body.pickup || !body.drop) fail(400, "BAD_BODY", "pickup and drop required");
    const classes = body.vehicleClasses ?? [...VEHICLE_CLASSES];
    const quotes = [];
    for (const vc of classes) {
      try {
        const q = await quoteTrip(sql, CITY_ID, vc, body.pickup, body.drop);
        quotes.push({
          ...q,
          quoteToken: issueQuoteToken(q, CITY_ID),
          explainerCopyId: "platform-fee-explainer",
        });
      } catch {
        // unconfigured class in this city — skip
      }
    }
    return { quotes };
  });

  app.get("/v1/push/vapid-key", async () => ({ publicKey: vapidPublicKey() }));

  app.post("/v1/push/subscribe", async (req) => {
    const sess = requireAuth(await session(req));
    const { subscription } = req.body as { subscription?: any };
    if (!subscription?.endpoint || !subscription?.keys) fail(400, "BAD_SUBSCRIPTION", "valid push subscription required");
    await savePushSubscription(sql, sess.userId, subscription);
    return { ok: true };
  });

  app.post("/v1/push/unsubscribe", async (req) => {
    requireAuth(await session(req));
    const { endpoint } = req.body as { endpoint?: string };
    if (endpoint) await removePushSubscription(sql, endpoint);
    return { ok: true };
  });
  // ---- ride requests -----------------------------------------------------------

  app.post("/v1/requests", async (req) => {
    const sess = requireRider(await session(req));
    const body = req.body as {
      quoteToken?: string;
      offerPaise?: number;
      platformFeePaise?: number;
      vehicleClass?: VehicleClass;
      paymentMethod?: "WALLET" | "UPI" | "CASH";
      pickup?: LatLon;
      drop?: LatLon;
    };
    const payload = body.quoteToken ? verifyQuoteToken(body.quoteToken) : null;
    if (!payload || !body.vehicleClass || !body.paymentMethod || !body.pickup || !body.drop) {
      fail(400, "BAD_BODY", "quoteToken, vehicleClass, paymentMethod, pickup, drop required");
    }
    const negotiated = typeof body.offerPaise === "number";
    const platformContribution = negotiated ? (body.platformFeePaise ?? payload!.pf) : payload!.pf;
    if (negotiated && (!Number.isSafeInteger(body.offerPaise) || body.offerPaise! < 0)) {
      fail(400, "INVALID_OFFER", "driver offer must be non-negative integer paise");
    }
    if (!Number.isSafeInteger(platformContribution) || platformContribution < 0) {
      fail(400, "INVALID_PLATFORM_FEE", "platform contribution must be non-negative integer paise");
    }
    await validateRideRequest(sql, sess.userId, {
      offerPaise: body.offerPaise,
      platformFeePaise: body.platformFeePaise,
      pickup: body.pickup!,
      drop: body.drop!,
    });
    const requestId = randomUUID();
    await sql.query(
      `INSERT INTO ride_requests
         (id, rider_id, city_id, vehicle_class, mode, state, payment_method,
          pickup_lat, pickup_lng, drop_lat, drop_lng, list_price, platform_fee)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        requestId,
        sess.userId,
        payload!.c,
        body.vehicleClass!,
        negotiated ? "NEGOTIATED" : "LIST",
        negotiated ? "NEGOTIATING" : "MATCHING",
        body.paymentMethod!,
        body.pickup!.lat,
        body.pickup!.lng,
        body.drop!.lat,
        body.drop!.lng,
        payload!.lp,
        platformContribution,
      ],
    );

    let negotiationId: string | undefined;
    let expiresAt: Date;
    if (negotiated) {
      const neg = await createNegotiation(
        sql,
        requestId,
        sess.userId,
        payload!.c,
        body.vehicleClass!,
        body.offerPaise as never,
        payload!.lp as never,
        platformContribution as never,
        body.paymentMethod!,
      );
      negotiationId = neg.id;
      expiresAt = new Date(neg.expires_at);
    } else {
      expiresAt = new Date(Date.now() + 90_000);
    }

    const delivered = await broadcastRequest({
      requestId,
      negotiationId,
      takeHomePaise: negotiated ? body.offerPaise! : payload!.tf,
      pickup: body.pickup!,
      drop: body.drop!,
      expiresAt: expiresAt.toISOString(),
      round: 1,
      isCounter: false,
      paymentMethod: body.paymentMethod!,
    });

    return {
      sessionId: requestId,
      mode: negotiated ? ("NEGOTIATED" as const) : ("LIST" as const),
      state: negotiated ? ("NEGOTIATING" as const) : ("MATCHING" as const),
      expiresAt: expiresAt.toISOString(),
      negotiationId,
      round: 1,
      maxRounds: 3,
      listPrice: payload!.lp,
      currentOfferPaise: negotiated ? body.offerPaise : undefined,
      platformFeePaise: platformContribution,
      riderTotalPaise: (negotiated ? body.offerPaise! : payload!.tf) + platformContribution,
      deliveredToDrivers: delivered,
    };
  });

  /** load rider context and fan an offer out to live drivers of the matching class */
  async function broadcastRequest(o: {
    requestId: string;
    negotiationId?: string;
    takeHomePaise: number;
    pickup: LatLon;
    drop: LatLon;
    expiresAt: string;
    round: number;
    isCounter: boolean;
    paymentMethod: string;
  }): Promise<number> {
    const rr = (
      await sql.query<{
        vehicle_class: string;
        rider_full_name: string;
        rider_rating: number | null;
      }>(
        `SELECT r.vehicle_class, u.full_name AS rider_full_name, u.rating_rolling AS rider_rating
         FROM ride_requests r JOIN users u ON u.id = r.rider_id WHERE r.id=$1`,
        [o.requestId],
      )
    ).rows[0]!;
    const km = Math.round(estimateDistanceKm(o.pickup, o.drop) * 10) / 10;
    return broadcastOffer({
      requestId: o.requestId,
      negotiationId: o.negotiationId,
      takeHomePaise: o.takeHomePaise as never,
      pickup: o.pickup,
      drop: o.drop,
      tripKm: km,
      expiresAt: o.expiresAt,
      round: o.round,
      isCounter: o.isCounter,
      riderName: rr.rider_full_name,
      riderRating: Number(rr.rider_rating ?? 4.8),
      paymentMethod: o.paymentMethod as never,
      vehicleClass: rr.vehicle_class,
      notify: (driverId) => {
        void sendPush(sql, driverId, {
          title: `New ${rr.vehicle_class.replaceAll("_", " ")} request`,
          body: `Earn ₹${(o.takeHomePaise / 100).toFixed(2)} · ${km} km trip · ${o.paymentMethod}`,
          url: "/",
          tag: `ride-${o.requestId}`,
        });
      },
    });
  }
  app.get("/v1/requests/:id", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    const r = await sql.query<Record<string, unknown>>(
      "SELECT * FROM ride_requests WHERE id=$1 AND rider_id=$2",
      [id, sess.userId],
    );
    if (r.rows.length === 0) fail(404, "NOT_FOUND", "no such request");
    const t = await sql.query<{ id: string; state: string }>(
      "SELECT id, state FROM trips WHERE request_id=$1",
      [id],
    );
    return { ...r.rows[0]!, trip: t.rows[0] ?? null };
  });

  app.post("/v1/requests/:id/cancel", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    const upd = await sql.query(
      "UPDATE ride_requests SET state='CANCELLED', version=version+1 WHERE id=$1 AND rider_id=$2 AND state IN ('MATCHING','NEGOTIATING') RETURNING id",
      [id, sess.userId],
    );
    if (upd.rows.length === 0) fail(409, "NOT_CANCELLABLE", "already resolved");
    const negs = await sql.query<{ id: string }>(
      "SELECT id FROM negotiations WHERE request_id=$1 AND state IN ('BROADCASTING','COUNTERED_DRIVER','COUNTERED_RIDER')",
      [id],
    );
    for (const n of negs.rows) await cancelByRider(sql, n.id).catch(() => undefined);
    releaseClaim(id);
    void cancelBroadcast(id);
    return { ok: true };
  });

  // ---- negotiation actions -------------------------------------------------------

  app.post("/v1/requests/:id/accept", async (req) => {
    // DRIVER accepts a LIST-price offer (no negotiation attached)
    const sess = requireDriver(await session(req));
    const { id } = req.params as { id: string };
    const rr = (
      await sql.query<{ mode: string; state: string; vehicle_class: string }>(
        "SELECT mode, state, vehicle_class FROM ride_requests WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!rr) fail(404, "NOT_FOUND", "no such request");
    if (rr.mode !== "LIST" || rr.state !== "MATCHING") fail(409, "NOT_CLAIMABLE", "not an open list request");
    await requireApprovedDriver(sess.userId, rr.vehicle_class);
    const trip = await finalizeAgreement(id, "", sess.userId);
    return { tripId: trip.tripId };
  });

  app.post("/v1/negotiations/:id/accept", async (req) => {
    // DRIVER accepts the rider-side offer
    const sess = requireDriver(await session(req));
    const { id } = req.params as { id: string };
    try {
      const neg0 = await getNegotiation(sql, id);
      if (!neg0) fail(404, "NOT_FOUND", "no such negotiation");
      await requireApprovedDriver(sess.userId, neg0.vehicle_class);
      const neg = await driverAccept(sql, id, sess.userId);
      const trip = await finalizeAgreement(neg.request_id, neg.id, sess.userId);
      return { tripId: trip.tripId };
    } catch (err) {
      if (err instanceof NegotationError) fail(409, err.code, err.message);
      throw err;
    }
  });

  app.post("/v1/negotiations/:id/counter", async (req) => {
    const sess = requireDriver(await session(req));
    const { id } = req.params as { id: string };
    const { paise } = req.body as { paise?: number };
    if (!Number.isSafeInteger(paise) || paise! < 0) fail(400, "BAD_BODY", "non-negative paise required");
    try {
      const neg0 = await getNegotiation(sql, id);
      if (!neg0) fail(404, "NOT_FOUND", "no such negotiation");
      await requireApprovedDriver(sess.userId, neg0.vehicle_class);
      if (!claimRequest(neg0.request_id, sess.userId)) {
        fail(409, "ALREADY_CLAIMED", "another driver is countering");
      }
      const updated = await driverCounter(sql, id, sess.userId, paise as never);
      pushRider(neg0.rider_id, {
        t: "negotiation.counter",
        negotiationId: updated.id,
        paise: paise as never,
        round: updated.round,
        expiresAt: new Date(updated.expires_at).toISOString(),
      });
      void sendPush(sql, neg0.rider_id, {
        title: "Driver sent a counter-offer",
        body: `Driver asks ₹${(paise! / 100).toFixed(2)}. Open Chalo-X to respond.`,
        url: "/",
        tag: `counter-${id}`,
      });
      return { state: updated.state, round: updated.round };
    } catch (err) {
      if (err instanceof NegotationError) fail(409, err.code, err.message);
      throw err;
    }
  });

  app.post("/v1/negotiations/:id/rider-accept", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    try {
      const existing = await getNegotiation(sql, id);
      if (!existing) fail(404, "NOT_FOUND", "no such negotiation");
      if (existing.rider_id !== sess.userId) fail(403, "FORBIDDEN", "not your negotiation");
      const neg = await riderAcceptCounter(sql, id);
      const driverId = claimedDriver(neg.request_id);
      if (!driverId) fail(409, "NO_DRIVER", "countering driver unavailable");
      const trip = await finalizeAgreement(neg.request_id, neg.id, driverId);
      return { tripId: trip.tripId };
    } catch (err) {
      if (err instanceof NegotationError) fail(409, err.code, err.message);
      throw err;
    }
  });

  app.post("/v1/negotiations/:id/final", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    const { paise, platformFeePaise } = req.body as { paise?: number; platformFeePaise?: number };
    if (!Number.isSafeInteger(paise) || paise! < 0) fail(400, "BAD_BODY", "non-negative driver paise required");
    if (!Number.isSafeInteger(platformFeePaise) || platformFeePaise! < 0) {
      fail(400, "BAD_BODY", "non-negative platform contribution required");
    }
    try {
      const existing = await getNegotiation(sql, id);
      if (!existing) fail(404, "NOT_FOUND", "no such negotiation");
      if (existing.rider_id !== sess.userId) fail(403, "FORBIDDEN", "not your negotiation");
      const updated = await riderFinalOffer(sql, id, paise as never);
      await sql.query("UPDATE negotiations SET platform_fee=$2 WHERE id=$1", [id, platformFeePaise]);
      await sql.query("UPDATE ride_requests SET platform_fee=$2 WHERE id=$1", [updated.request_id, platformFeePaise]);
      const rr = (
        await sql.query<{ pickup_lat: number; pickup_lng: number; drop_lat: number; drop_lng: number; payment_method: string }>(
          "SELECT * FROM ride_requests WHERE id=$1",
          [updated.request_id],
        )
      ).rows[0]!;
      await broadcastRequest({
        requestId: updated.request_id,
        negotiationId: updated.id,
        takeHomePaise: updated.current_offer,
        pickup: { lat: rr.pickup_lat, lng: rr.pickup_lng },
        drop: { lat: rr.drop_lat, lng: rr.drop_lng },
        expiresAt: new Date(updated.expires_at).toISOString(),
        round: updated.round,
        isCounter: true,
        paymentMethod: rr.payment_method,
      });
      pushRider(sess.userId, {
        t: "request.updated",
        session: {
          id: updated.request_id,
          mode: "NEGOTIATED",
          state: "NEGOTIATING",
          negotiationId: updated.id,
          currentOfferPaise: updated.current_offer as never,
          platformFeePaise: platformFeePaise as never,
          riderTotalPaise: (updated.current_offer + platformFeePaise!) as never,
          round: updated.round,
          maxRounds: 3,
          expiresAt: new Date(updated.expires_at).toISOString(),
          listPrice: updated.list_price as never,
        },
      });
      return { state: updated.state, round: updated.round, platformFeePaise };
    } catch (err) {
      if (err instanceof NegotationError) fail(409, err.code, err.message);
      throw err;
    }
  });
  app.post("/v1/negotiations/:id/rider-decline", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    const neg0 = await getNegotiation(sql, id);
    if (!neg0) fail(404, "NOT_FOUND", "no such negotiation");
    if (neg0.rider_id !== sess.userId) fail(403, "FORBIDDEN", "not your negotiation");
    if (neg0.state === "DECLINED") {
      return { ok: true };
    }
    try {
      const neg = await riderDecline(sql, id);
      await sql.query("UPDATE ride_requests SET state='DECLINED', version=version+1 WHERE id=$1", [neg.request_id]);
      releaseClaim(neg.request_id);
      void cancelBroadcast(neg.request_id);
      return { ok: true };
    } catch (err) {
      if (err instanceof NegotationError) fail(409, err.code, err.message);
      throw err;
    }
  });

  // ---- trips ----------------------------------------------------------------------

  app.post("/v1/trips/:id/state", async (req) => {
    const sess = requireDriver(await session(req));
    const { id } = req.params as { id: string };
    const { to } = req.body as { to?: "ARRIVING" | "ARRIVED" };
    if (to !== "ARRIVING" && to !== "ARRIVED") fail(400, "BAD_BODY", "to must be ARRIVING|ARRIVED");
    try {
      const trip = await transitionTrip(sql, id, to);
      pushRider(trip.rider_id, { t: "trip.state", state: trip.state as never });
      pushDriver(trip.driver_id, { t: "trip.state", state: trip.state as never, tripId: trip.id });
      return { state: trip.state };
    } catch (err) {
      if (err instanceof TripError) fail(409, err.code, err.message);
      throw err;
    }
  });

  app.post("/v1/trips/:id/start", async (req) => {
    const sess = requireAuth(await session(req));
    const { id } = req.params as { id: string };
    const { otp } = req.body as { otp?: string };
    const trip = await getTrip(sql, id);
    if (!trip) fail(404, "NOT_FOUND", "no such trip");
    if (trip.rider_id !== sess.userId && trip.driver_id !== sess.userId) {
      fail(403, "FORBIDDEN", "not your trip");
    }
    if (trip.state === "ONGOING") {
      return { state: "ONGOING" };
    }
    if (!(await verifyStartOtp(sql, id, otp ?? ""))) fail(401, "BAD_OTP", "wrong OTP");
    const updated = await transitionTrip(sql, id, "ONGOING");
    pushRider(updated.rider_id, { t: "trip.state", state: "ONGOING" });
    pushDriver(sess.userId, { t: "trip.state", state: "ONGOING", tripId: updated.id });
    return { state: updated.state };
  });

  app.post("/v1/trips/:id/complete", async (req) => {
    const sess = requireDriver(await session(req));
    const { id } = req.params as { id: string };
    const { tipPaise } = req.body as { tipPaise?: number };

    const trip0 = await getTrip(sql, id);
    if (!trip0) fail(404, "NOT_FOUND", "no such trip");
    if (trip0.driver_id !== sess.userId) fail(403, "FORBIDDEN", "not your trip");

    if (trip0.state === "COMPLETED") {
      return { state: "COMPLETED", duplicate: true };
    }

    try {
      await transitionTrip(sql, id, "COMPLETED");
      const settlement = await settleTrip(sql, id, tipPaise ?? 0);

      const trip = (await getTrip(sql, id))!;
      const live = getLiveDriver(sess.userId);
      if (live) live.onTrip = false;
      pushRider(trip.rider_id, { t: "trip.state", state: "COMPLETED" });
      pushDriver(sess.userId, { t: "trip.state", state: "COMPLETED", tripId: id });
      return { state: "COMPLETED", txnId: settlement.txnId, duplicate: settlement.duplicate };
    } catch (err) {
      if (err instanceof TripError) fail(409, err.code, err.message);
      throw err;
    }
  });

  app.get("/v1/trips/:id", async (req) => {
    const sess = requireAuth(await session(req));
    const { id } = req.params as { id: string };
    const trip = await getTrip(sql, id);
    if (!trip) fail(404, "NOT_FOUND", "no such trip");
    if (trip.rider_id !== sess.userId && trip.driver_id !== sess.userId) {
      fail(403, "FORBIDDEN", "not your trip");
    }
    return tripView(trip);
  });

  app.post("/v1/trips/:id/regenerate-otp", async (req) => {
    const sess = requireAuth(await session(req));
    const { id } = req.params as { id: string };
    const trip = await getTrip(sql, id);
    if (!trip) fail(404, "NOT_FOUND", "no such trip");
    if (trip.rider_id !== sess.userId) fail(403, "FORBIDDEN", "not your trip");
    try {
      const newOtp = await regenerateTripOtp(sql, id);
      return { otp: newOtp };
    } catch (err) {
      if (err instanceof TripError) fail(409, err.code, err.message);
      throw err;
    }
  });

  function tripView(trip: TripRow & { otpPlain?: string }): Record<string, unknown> {
    const fare = readFareJson(trip.fare_json);
    const driver = getLiveDriver(trip.driver_id);
    return {
      id: trip.id,
      riderId: trip.rider_id,
      driverId: trip.driver_id,
      state: trip.state,
      vehicleClass: trip.vehicle_class,
      pickup: { lat: trip.pickup_lat, lng: trip.pickup_lng },
      drop: { lat: trip.drop_lat, lng: trip.drop_lng },
      fareBreakdown: fare,
      driverName: driver?.name ?? "",
      driverPlate: driver?.plate ?? "",
      driverRating: driver?.rating ?? 4.8,
      driverLat: driver?.pos.lat,
      driverLng: driver?.pos.lng,
    };
  }

  /** agreement → atomic claim → trip creation → notify both sides. Returns OTP for rider. */
  async function finalizeAgreement(
    requestId: string,
    negotiationId: string,
    driverId: string,
  ): Promise<{ tripId: string; otp: string }> {
    const existing = claimedDriver(requestId);
    if (existing === null) {
      if (!claimRequest(requestId, driverId)) fail(409, "ALREADY_CLAIMED", "another driver won this ride");
    } else if (existing !== driverId) {
      fail(409, "ALREADY_CLAIMED", "another driver won this ride");
    }

    const rr = (
      await sql.query<{
        rider_id: string;
        city_id: number;
        vehicle_class: string;
        pickup_lat: number;
        pickup_lng: number;
        drop_lat: number;
        drop_lng: number;
        list_price: number;
        platform_fee: number | null;
        mode: string;
        payment_method: string;
      }>("SELECT * FROM ride_requests WHERE id=$1", [requestId])
    ).rows[0]!;
    const neg = negotiationId ? await getNegotiation(sql, negotiationId) : null;
    const agreed = neg?.current_offer ?? rr.list_price;
    const fee = neg?.platform_fee ?? rr.platform_fee ?? Math.max(1000, Math.round(agreed * 0.12));

    const { trip, otp } = await createTripFromAgreement(sql, {
      requestId,
      riderId: rr.rider_id,
      driverId,
      cityId: rr.city_id,
      vehicleClass: rr.vehicle_class,
      pickupLat: rr.pickup_lat,
      pickupLng: rr.pickup_lng,
      dropLat: rr.drop_lat,
      dropLng: rr.drop_lng,
      agreedPaise: agreed as never,
      platformFeePaise: fee as never,
      listPricePaise: rr.list_price as never,
      mode: rr.mode as "LIST" | "NEGOTIATED",
      paymentMethod: rr.payment_method as "WALLET" | "UPI" | "CASH",
      negotiationId,
    });

    const view = tripView({ ...trip, otpPlain: otp });
    pushRider(rr.rider_id, { t: "driver.assigned", trip: { ...view, otp } as never });
    void sendPush(sql, rr.rider_id, {
      title: "Your driver is confirmed",
      body: `Driver accepted ₹${(agreed / 100).toFixed(2)}. Open Chalo-X for the start OTP.`,
      url: "/",
      tag: `trip-${trip.id}`,
    });
    pushDriver(driverId, { t: "trip.state", state: "DRIVER_ASSIGNED", tripId: trip.id });

    // register live presence for tracking
    registerDriver({
      driverId,
      vehicleClass: rr.vehicle_class,
      pos: { lat: rr.pickup_lat, lng: rr.pickup_lng },
      online: true,
      onTrip: true,
      name: "Driver",
      plate: "KA01AB1234",
      rating: 4.8,
      push: (msg) => pushDriver(driverId, msg),
    });

    return { tripId: trip.id, otp };
  }

  // ---- websockets -------------------------------------------------------------------

  app.get("/ws/rider", { websocket: true }, (socket, req) => {
    void (async () => {
      const token = new URL(req.url ?? "/", "http://x").searchParams.get("token") ?? "";
      const sess = await verifyToken(token);
      if (!sess || sess.role !== "RIDER") {
        socket.close(4401, "unauthorized");
        return;
      }
      const u = await sql.query<{ id: string }>("SELECT id FROM users WHERE id=$1 AND status='ACTIVE'", [sess.userId]);
      if (u.rows.length === 0) {
        socket.close(4401, "unauthorized");
        return;
      }
      riderConns[sess.userId] = { socket };
      logger.ws("rider", "Connected", sess.userId);
      socket.on("close", () => {
        if (riderConns[sess.userId]?.socket === socket) {
          delete riderConns[sess.userId];
          logger.ws("rider", "Disconnected", sess.userId);
        }
      });
    })();
  });

  app.get("/ws/driver", { websocket: true }, (socket, req) => {
    void (async () => {
      const token = new URL(req.url ?? "/", "http://x").searchParams.get("token") ?? "";
      const sess = await verifyToken(token);
      if (!sess || sess.role !== "DRIVER") {
        socket.close(4401, "unauthorized");
        return;
      }
      const profile = (
        await sql.query<{
          vehicle_class: string;
          plate: string;
          full_name: string;
          rating_rolling: string | null;
          last_lat: number | null;
          last_lng: number | null;
        }>(
          `SELECT d.vehicle_class, d.plate, u.full_name, u.rating_rolling, d.last_lat, d.last_lng
           FROM driver_profiles d JOIN users u ON u.id = d.user_id WHERE d.user_id=$1 AND u.status='ACTIVE'`,
          [sess.userId],
        )
      ).rows[0];

      if (!profile) {
        socket.close(4401, "unauthorized");
        return;
      }
      driverConns[sess.userId] = { socket };
      logger.ws("driver", "Connected", sess.userId);

      registerDriver({
        driverId: sess.userId,
        vehicleClass: profile.vehicle_class ?? "BIKE",
        pos: { lat: profile.last_lat ?? 12.97, lng: profile.last_lng ?? 77.59 },
        online: true,
        onTrip: false,
        name: profile.full_name ?? "Driver",
        plate: profile.plate ?? "KA00XX0000",
        rating: Number(profile.rating_rolling ?? 4.8),
        push: (msg) => pushDriver(sess.userId, msg),
      });

      socket.on("message", (raw: Buffer) => {
        let msg: { t?: string; lat?: number; lng?: number };
        try {
          msg = JSON.parse(raw.toString()) as { t?: string; lat?: number; lng?: number };
        } catch {
          return;
        }
        if (msg.t === "pos.update" && typeof msg.lat === "number" && typeof msg.lng === "number") {
          try {
            validateDriverGps(sess.userId, { lat: msg.lat, lng: msg.lng });
            setDriverPos(sess.userId, { lat: msg.lat, lng: msg.lng });
            void sql.query("UPDATE driver_profiles SET last_lat=$2, last_lng=$3 WHERE user_id=$1", [
              sess.userId,
              msg.lat,
              msg.lng,
            ]);
          } catch (err) {
            logger.warn("FRAUD", `Rejected driver GPS update user=${sess.userId.slice(0, 8)}`, err);
          }
        }
      });
      socket.on("close", () => {
        if (driverConns[sess.userId]?.socket === socket) {
          delete driverConns[sess.userId];
          unregisterDriver(sess.userId);
          logger.ws("driver", "Disconnected", sess.userId);
        }
      });
    })();
  });

  // ---- dev verification endpoints (never in production) ----
  if (process.env.NODE_ENV !== "production") {
    app.get("/v1/dev/reconcile", async (req) => {
      const { tripId } = req.query as { tripId?: string };
      const lines = await sql.query<{
        debit_account: string;
        credit_account: string;
        amount_paise: number;
      }>("SELECT debit_account, credit_account, amount_paise FROM journal_entries WHERE trip_id=$1", [tripId]);
      const net: Record<string, number> = {};
      for (const l of lines.rows) {
        net[l.debit_account] = (net[l.debit_account] ?? 0) - l.amount_paise;
        net[l.credit_account] = (net[l.credit_account] ?? 0) + l.amount_paise;
      }
      const platformNet = Object.values(net).reduce((s, v) => s + v, 0);
      return { balanced: Math.abs(platformNet) === 0 && lines.rowCount >= 2, lines: lines.rowCount, accounts: net };
    });
    app.get("/v1/dev/requests", async () => {
      const r = await sql.query("SELECT id, state, mode FROM ride_requests");
      return { rows: r.rows };
    });
    app.get("/v1/dev/latest-trip", async () => {
      const t = await sql.query<{ id: string }>("SELECT id FROM trips WHERE state='COMPLETED' ORDER BY id DESC LIMIT 1");
      return { tripId: t.rows[0]?.id ?? null };
    });
  }

  // ---- ratings, history, driver summary (consumed by the web consoles) ----

  app.post("/v1/trips/:id/rate", async (req) => {
    const sess = requireAuth(await session(req));
    const { id } = req.params as { id: string };
    const { stars, comment } = req.body as { stars?: number; comment?: string };
    if (!stars || stars < 1 || stars > 5) fail(400, "BAD_STARS", "stars 1..5 required");
    const trip = await getTrip(sql, id);
    if (!trip || trip.state !== "COMPLETED") fail(409, "NOT_COMPLETED", "rate after completion");
    const rateeId = trip.rider_id === sess.userId ? trip.driver_id : trip.rider_id;
    try {
      await sql.query(
        `INSERT INTO ratings (id, trip_id, rater_id, ratee_id, stars, comment)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), id, sess.userId, rateeId, Math.round(stars), comment ?? null],
      );
    } catch {
      fail(409, "ALREADY_RATED", "already rated this trip");
    }
    return { ok: true };
  });

  app.post("/v1/driver/status", async (req) => {
    const sess = requireDriver(await session(req));
    const body = req.body as { online?: boolean; vehicleClass?: string; lat?: number; lng?: number };
    if (typeof body.online === "boolean") {
      await sql.query("UPDATE driver_profiles SET online=$2 WHERE user_id=$1", [sess.userId, body.online]);
      const live = getLiveDriver(sess.userId);
      if (live) live.online = body.online;
    }
    if (typeof body.vehicleClass === "string") {
      await sql.query("UPDATE driver_profiles SET vehicle_class=$2 WHERE user_id=$1", [sess.userId, body.vehicleClass]);
      setDriverVehicleClass(sess.userId, body.vehicleClass);
    }
    if (typeof body.lat === "number" && typeof body.lng === "number") {
      await sql.query("UPDATE driver_profiles SET last_lat=$2, last_lng=$3 WHERE user_id=$1", [sess.userId, body.lat, body.lng]);
      setDriverPos(sess.userId, { lat: body.lat, lng: body.lng });
    }
    const updated = (
      await sql.query<{ vehicle_class: string; online: boolean; last_lat: number; last_lng: number }>(
        "SELECT vehicle_class, online, last_lat, last_lng FROM driver_profiles WHERE user_id=$1",
        [sess.userId],
      )
    ).rows[0];
    return { profile: updated };
  });

  app.post("/v1/trips/:id/cancel-driver", async (req) => {
    const sess = requireDriver(await session(req));
    const { id } = req.params as { id: string };
    try {
      const trip = await transitionTrip(sql, id, "CANCELLED_DRIVER");
      releaseClaim(trip.request_id);
      const live = getLiveDriver(sess.userId);
      if (live) live.onTrip = false;
      pushRider(trip.rider_id, { t: "trip.state", state: "CANCELLED_DRIVER" });
      return { state: trip.state };
    } catch (err) {
      if (err instanceof TripError) fail(409, err.code, err.message);
      throw err;
    }
  });

  app.get("/v1/trips", async (req) => {
    const sess = requireAuth(await session(req));
    const col = sess.role === "RIDER" ? "rider_id" : "driver_id";
    const rows = await sql.query<TripRow & Record<string, unknown>>(
      `SELECT * FROM trips WHERE ${col}=$1 ORDER BY id DESC LIMIT 50`,
      [sess.userId],
    );
    return { trips: rows.rows.map(tripView) };
  });

  app.get("/v1/driver/me", async (req) => {
    const sess = requireDriver(await session(req));
    const profile = (
      await sql.query<{ vehicle_class: string; plate: string; kyc_status: string; online: boolean }>(
        "SELECT vehicle_class, plate, kyc_status, online FROM driver_profiles WHERE user_id=$1",
        [sess.userId],
      )
    ).rows[0];
    const balance = await walletBalance(sql, `driver:${sess.userId}:WALLET`);
    const completed = await sql.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM trips WHERE driver_id=$1 AND state='COMPLETED'",
      [sess.userId],
    );
    return { profile: profile ?? null, walletBalancePaise: balance, completedTrips: Number(completed.rows[0]?.n ?? 0) };
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    const errObj = typeof err === "object" && err !== null ? err : {};
    const status = "statusCode" in errObj && typeof errObj.statusCode === "number" ? errObj.statusCode : 500;
    const code = "code" in errObj && typeof errObj.code === "string" ? errObj.code : "INTERNAL";
    const message = err instanceof Error ? err.message : "internal error";
    if (status >= 500) {
      logger.error("500", `${req.method} ${req.url} -> ${status} [${code}] ${message}`, err);
    }
    reply.status(status).send({ code, message });
  });

  const sweeperTimer = setInterval(async () => {
    try {
      const expired = await sweepExpiredNegotiations(sql);
      for (const exp of expired) {
        releaseClaim(exp.requestId);
        pushRider(exp.riderId, {
          t: "request.updated",
          session: {
            id: exp.requestId,
            mode: "NEGOTIATED",
            state: "EXPIRED",
            round: 3,
            maxRounds: 3,
            listPrice: 0 as never,
          },
        });
      }
    } catch {}
  }, 1000);
  sweeperTimer.unref();

  await app.listen({ port: listenPort, host: "127.0.0.1" });
  console.log(`[core] listening on :${listenPort} (storage: ${storage.kind})`);
  return {
    app,
    storage,
    close: async () => {
      clearInterval(sweeperTimer);
      await app.close();
      await storage.close();
    },
  };
}

const isMain = process.argv.some((arg) => arg.replace(/\\/g, "/").endsWith("server.ts") || arg.replace(/\\/g, "/").endsWith("server.js"));
if (isMain) {
  startServer().catch((err: unknown) => {
    console.error("[core] fatal", err);
    process.exit(1);
  });
}
