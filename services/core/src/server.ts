/**
 * Core API server — REST + WS per plan §9.
 *   /v1/auth/*                       phone-OTP login (dev OTP 123456)
 *   /v1/quotes|requests|negotiations|trips   rider + driver flows
 *   /ws/rider /ws/driver             realtime channels (token in query string)
 * Storage: PG when DATABASE_URL set, else embedded PGlite auto-migrated on boot.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
import { DEV_OTP, issueToken, setUserPassword, upsertUser, upsertUserWithPassword, verifyToken } from "./auth.ts";
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
  unregisterDriver,
} from "./dispatch.ts";
import {
  createTripFromAgreement,
  getTrip,
  OTP_MAX_ATTEMPTS,
  readFareJson,
  regenerateTripOtp,
  settleTrip,
  transitionTrip,
  TripError,
  verifyStartOtp,
} from "./trips.ts";
import { InsufficientFundsError, postTransaction, walletBalance } from "./ledger.ts";
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

const wsTickets = new Map<string, { session: Session; expiresAt: number }>();

function consumeWsTicket(ticket: string, role: Session["role"]): Session | null {
  const entry = wsTickets.get(ticket);
  wsTickets.delete(ticket);
  if (!entry || entry.expiresAt < Date.now() || entry.session.role !== role) return null;
  return entry.session;
}
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
  if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes("dev-only"))) {
    throw new Error("JWT_SECRET must be a strong explicit production secret");
  }
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
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  await app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)),
    credentials: false,
  });
  await app.register(websocket);

  app.addHook("onRequest", async (req) => {
    (req as any)._startTime = performance.now();
  });
  app.get("/healthz", async () => {
    await sql.query("SELECT 1");
    return { ok: true, storage: storage.kind, time: new Date().toISOString() };
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
    if (vehicleClass && p.vehicle_class !== vehicleClass) {
      fail(403, "VEHICLE_CLASS_MISMATCH", `Driver vehicle (${p.vehicle_class}) does not match ride (${vehicleClass})`);
    }
  }

  async function ensureDriverVehicle(driverId: string, requested?: string): Promise<string> {
    const existing = await sql.query<{ vehicle_class: string }>(
      "SELECT vehicle_class FROM driver_profiles WHERE user_id=$1",
      [driverId],
    );
    if (existing.rows[0]) return existing.rows[0].vehicle_class;
    const allowed = ["BIKE", "AUTO", "CAB_MINI", "CAB_PRIME", "CAB_XL"];
    if (!requested || !allowed.includes(requested)) {
      fail(400, "VEHICLE_REQUIRED", "Select one valid vehicle when registering as a driver");
    }
    await sql.query(
      `INSERT INTO driver_profiles
       (user_id, vehicle_class, plate, kyc_status, online, on_trip)
       VALUES ($1,$2,$3,'PENDING_DOCS',false,false)`,
      [driverId, requested, `PENDING-${driverId.slice(0, 6).toUpperCase()}`],
    );
    return requested;
  }

  // ---- auth ------------------------------------------------------------------
  // The shared dev code must never authenticate anyone outside an explicitly
  // enabled non-production environment: unset NODE_ENV + no flag stays closed.
  function devAuthEnabled(): boolean {
    return process.env.NODE_ENV === "test" || process.env.ENABLE_DEV_ENDPOINTS === "1";
  }

  app.post("/v1/auth/otp/send", async (req) => {
    const { phone } = req.body as { phone?: string };
    if (!phone || !/^\+[0-9]{10,15}$/.test(phone)) fail(400, "BAD_PHONE", "E.164 required");
    enforceRateLimit(`otp-ip:${req.ip}`, 10, 10 * 60_000);
    enforceRateLimit(`otp-phone:${phone}`, 5, 10 * 60_000);
    return { sent: true, ...(devAuthEnabled() ? { devHint: `use ${DEV_OTP}` } : {}) };
  });

  app.post("/v1/auth/otp/verify", async (req) => {
    const { phone, otp, role, fullName, vehicleClass, newPassword } = req.body as {
      phone?: string;
      otp?: string;
      role?: "RIDER" | "DRIVER";
      fullName?: string;
      vehicleClass?: string;
      newPassword?: string;
    };
    if (!phone || (role !== "RIDER" && role !== "DRIVER")) fail(400, "BAD_BODY", "phone + role required");
    if (!/^\+[0-9]{10,15}$/.test(phone)) fail(400, "BAD_PHONE", "E.164 required");
    enforceRateLimit(`otpv-ip:${req.ip}`, 20, 10 * 60_000);
    enforceRateLimit(`otpv-phone:${phone}`, 5, 10 * 60_000);
    if (!devAuthEnabled()) {
      // Fail closed: until a real SMS provider is wired (MSG91 slot, plan §5),
      // no OTP login exists outside explicitly enabled dev/test environments.
      if (process.env.NODE_ENV === "production") {
        fail(503, "OTP_UNAVAILABLE", "OTP delivery is not configured for this environment");
      }
      // Detailed remediation only for explicit development — staging/unset
      // deployments should not leak internal paths to end users.
      if (process.env.NODE_ENV !== "development") {
        fail(503, "OTP_UNAVAILABLE", "OTP delivery is not configured for this environment");
      }
      fail(
        503,
        "OTP_UNAVAILABLE",
        "Dev OTP is disabled here — add ENABLE_DEV_ENDPOINTS=1 to services/core/.env and restart the server",
      );
    }
    if (otp !== DEV_OTP) fail(401, "BAD_OTP", "wrong code");
    const user = await upsertUser(sql, phone!, role!, fullName ?? "Chalo user");
    if (role === "DRIVER") await ensureDriverVehicle(user.id, vehicleClass);
    if (newPassword) await setUserPassword(sql, user.id, newPassword);
    return { token: await issueToken(user.id, role!), userId: user.id, role };
  });
  // Password login is available only after OTP-bound password setup.
  app.post("/v1/auth/login/password", async (req) => {
    const { phone, password, role, vehicleClass } = req.body as {
      phone?: string;
      password?: string;
      role?: "RIDER" | "DRIVER";
      vehicleClass?: string;
    };
    if (!phone || !/^\+[0-9]{10,15}$/.test(phone)) fail(400, "BAD_PHONE", "E.164 required");
    if (!password || typeof password !== "string" || password.length < 4) {
      fail(400, "WEAK_PASSWORD", "password must be at least 4 characters");
    }
    enforceRateLimit(`pw-ip:${req.ip}`, 10, 10 * 60_000);
    enforceRateLimit(`pw-phone:${phone}`, 5, 10 * 60_000);
    const user = await upsertUserWithPassword(sql, phone!, role!, password);
    if (role === "DRIVER") await ensureDriverVehicle(user.id, vehicleClass);
    return { token: await issueToken(user.id, role!), userId: user.id, role };
  });

  app.post("/v1/ws/ticket", async (req) => {
    const sess = requireAuth(await session(req));
    const ticket = randomUUID();
    wsTickets.set(ticket, { session: sess, expiresAt: Date.now() + 60_000 });
    return { ticket, expiresIn: 60 };
  });
  app.post("/v1/quotes", async (req) => {
    const sess = requireRider(await session(req));
    enforceRateLimit(`quotes:${sess.userId}`, 30, 60_000);
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


  app.get("/v1/wallet/me", async (req) => {
    const sess = requireAuth(await session(req));
    const prefix = sess.role === "RIDER" ? "user" : "driver";
    return { balancePaise: await walletBalance(sql, `${prefix}:${sess.userId}:WALLET`) };
  });

  app.post("/v1/wallet/topup", async (req) => {
    const sess = requireRider(await session(req));
    const { amountPaise } = req.body as { amountPaise?: number };
    if (!Number.isSafeInteger(amountPaise) || amountPaise! < 1000 || amountPaise! > 100_000) {
      fail(400, "INVALID_TOPUP", "top-up must be between ₹10 and ₹1,000");
    }
    if (!devAuthEnabled()) {
      // Free money: only explicitly enabled dev/test environments may top up
      // without a real payment gateway behind this endpoint.
      fail(501, "PAYMENT_PROVIDER_REQUIRED", "production top-up requires payment gateway confirmation");
    }
    const txn = await postTransaction(
      sql,
      [{ debitAccount: "platform:BANK", creditAccount: `user:${sess.userId}:WALLET`, amountPaise: amountPaise!, reason: "TOPUP" }],
      null,
      `topup:${sess.userId}:${randomUUID()}`,
    );
    return { ok: true, txnId: txn.txnId, balancePaise: await walletBalance(sql, `user:${sess.userId}:WALLET`) };
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
      pickupLabel?: string;
      dropLabel?: string;
      driverId?: string;
    };
    const payload = body.quoteToken ? verifyQuoteToken(body.quoteToken) : null;
    if (!payload || !body.vehicleClass || !body.paymentMethod || !body.pickup || !body.drop) {
      fail(400, "BAD_BODY", "quoteToken, vehicleClass, paymentMethod, pickup, drop required");
    }
    const clean = (s: string | undefined): string | null =>
      typeof s === "string"
        ? s.replace(/[\u0000-\u001f\u007f\u00ad]/g, "").trim().slice(0, 200) || null
        : null;
    // Direct-to-driver ("ride again") requests skip the open auction.
    let requestedDriverId: string | null = null;
    if (body.driverId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.driverId)) {
        fail(400, "BAD_BODY", "bad driverId");
      }
      // Direct dispatch is a favourites-only feature — arbitrary driver
      // targeting would let riders spam any specific driver with pushes.
      const favourited = await sql.query(
        "SELECT 1 FROM favorite_drivers WHERE rider_id=$1 AND driver_id=$2",
        [sess.userId, body.driverId],
      );
      if (favourited.rows.length === 0) {
        fail(403, "NOT_A_FAVOURITE", "save this driver to request them directly");
      }
      enforceRateLimit(`direct:${sess.userId}:${body.driverId}`, 3, 10 * 60_000);
      const prof = (
        await sql.query<{ kyc_status: string; vehicle_class: string }>(
          "SELECT kyc_status, vehicle_class FROM driver_profiles WHERE user_id=$1",
          [body.driverId],
        )
      ).rows[0];
      if (!prof || prof.kyc_status !== "APPROVED") fail(404, "DRIVER_UNAVAILABLE", "driver is not available");
      if (prof.vehicle_class !== body.vehicleClass!) {
        fail(400, "CLASS_MISMATCH", "favourite driver drives a different vehicle class");
      }
      const live = getLiveDriver(body.driverId);
      if (!live || !live.online || live.onTrip) {
        fail(409, "DRIVER_UNAVAILABLE", "favourite driver is offline right now");
      }
      requestedDriverId = body.driverId;
    }
    const negotiated = typeof body.offerPaise === "number";
    const platformContribution = negotiated ? (body.platformFeePaise ?? payload.pf) : payload.pf;
    if (negotiated && (!Number.isSafeInteger(body.offerPaise) || body.offerPaise! < 0)) {
      fail(400, "INVALID_OFFER", "driver offer must be non-negative integer paise");
    }
    if (!Number.isSafeInteger(platformContribution) || platformContribution < 0) {
      fail(400, "INVALID_PLATFORM_FEE", "platform contribution must be non-negative integer paise");
    }
    await validateRideRequest(sql, sess.userId, {
      offerPaise: body.offerPaise,
      platformFeePaise: body.platformFeePaise,
      paymentMethod: body.paymentMethod,
      pickup: body.pickup,
      drop: body.drop,
    });
    const riderCharge = (negotiated ? body.offerPaise! : payload.tf) + platformContribution;
    if (body.paymentMethod === "WALLET") {
      const balance = await walletBalance(sql, `user:${sess.userId}:WALLET`);
      if (balance < riderCharge) {
        fail(402, "INSUFFICIENT_WALLET", `Wallet needs ₹${(riderCharge / 100).toFixed(2)}; current balance is ₹${(balance / 100).toFixed(2)}`);
      }
    }
    const quoteHash = createHash("sha256").update(body.quoteToken!).digest("hex");
    try {
      await sql.query("INSERT INTO quote_token_uses (token_hash,user_id) VALUES ($1,$2)", [quoteHash, sess.userId]);
    } catch (err: any) {
      if (err?.code === "23505") fail(409, "QUOTE_ALREADY_USED", "This fare quote was already used; request a fresh quote");
      throw err;
    }
    const requestId = randomUUID();
    await sql.query(
      `INSERT INTO ride_requests
         (id, rider_id, city_id, vehicle_class, mode, state, payment_method,
          pickup_lat, pickup_lng, drop_lat, drop_lng, list_price, platform_fee,
          pickup_label, drop_label, requested_driver_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
        clean(body.pickupLabel),
        clean(body.dropLabel),
        requestedDriverId,
      ],
    );

    let negotiationId: string | undefined;
    let expiresAt: Date;
    if (negotiated) {
      const { negotiation, supersededRequestIds } = await createNegotiation(
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
      for (const reqId of supersededRequestIds) {
        releaseClaim(reqId);
        void cancelBroadcast(reqId);
      }
      negotiationId = negotiation.id;
      expiresAt = new Date(negotiation.expires_at);
    } else {
      expiresAt = new Date(Date.now() + 90_000);
    }

    const delivered = await broadcastRequest({
      requestId,
      negotiationId,
      takeHomePaise: negotiated ? body.offerPaise! : payload!.tf,
      pickup: body.pickup!,
      drop: body.drop!,
      pickupLabel: clean(body.pickupLabel),
      dropLabel: clean(body.dropLabel),
      onlyDriverId: requestedDriverId,
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
    pickupLabel?: string | null;
    dropLabel?: string | null;
    onlyDriverId?: string | null;
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
      pickupLabel: o.pickupLabel ?? null,
      dropLabel: o.dropLabel ?? null,
      onlyDriverId: o.onlyDriverId ?? null,
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
    if (paise! > 10_000_000) fail(400, "OFFER_TOO_HIGH", "Driver ask exceeds ₹1,00,000 fraud limit");
    try {
      const neg0 = await getNegotiation(sql, id);
      if (!neg0) fail(404, "NOT_FOUND", "no such negotiation");
      await requireApprovedDriver(sess.userId, neg0.vehicle_class);
      if (!claimRequest(neg0.request_id, sess.userId)) {
        fail(409, "ALREADY_CLAIMED", "another driver is countering");
      }
      const updated = await driverCounter(sql, id, sess.userId, paise as never);
      if (updated.state === "AGREED") {
        // counter ≤ rider's offer carries accept semantics — create the trip now
        // instead of leaking an AGREED negotiation with a permanently held claim.
        const trip = await finalizeAgreement(updated.request_id, updated.id, sess.userId);
        return { state: updated.state, round: updated.round, tripId: trip.tripId };
      }
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
      // Fail while the negotiation is still COUNTERED_DRIVER (recoverable):
      // committing AGREED without a live driver claim would wedge it forever.
      const claimed = claimedDriver(existing.request_id);
      if (claimed === null) fail(409, "NO_DRIVER", "no countering driver to settle with");
      const neg = await riderAcceptCounter(sql, id);
      const trip = await finalizeAgreement(neg.request_id, neg.id, claimed);
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
    if (paise! > 10_000_000) fail(400, "OFFER_TOO_HIGH", "Final offer exceeds ₹1,00,000 fraud limit");
    if (!Number.isSafeInteger(platformFeePaise) || platformFeePaise! < 0) {
      fail(400, "BAD_BODY", "non-negative platform contribution required");
    }
    // Same fraud ceiling creation enforces (security.validateRideRequest).
    if (platformFeePaise! > 1_000_000) {
      fail(400, "PLATFORM_FEE_TOO_HIGH", "Platform contribution exceeds ₹10,000 fraud limit");
    }
    try {
      const existing = await getNegotiation(sql, id);
      if (!existing) fail(404, "NOT_FOUND", "no such negotiation");
      if (existing.rider_id !== sess.userId) fail(403, "FORBIDDEN", "not your negotiation");
      // Fail while the negotiation is still COUNTERED_DRIVER (recoverable):
      // riderFinalOffer may commit AGREED, which must never happen without a
      // live driver claim to finalize against.
      const claimed = claimedDriver(existing.request_id);
      if (claimed === null) fail(409, "NO_DRIVER", "no countering driver to settle with");
      const updated = await riderFinalOffer(sql, id, paise as never);
      // Record the rider's platform contribution before any finalize reads it.
      await sql.query("UPDATE negotiations SET platform_fee=$2 WHERE id=$1", [id, platformFeePaise]);
      await sql.query("UPDATE ride_requests SET platform_fee=$2 WHERE id=$1", [updated.request_id, platformFeePaise]);
      if (updated.state === "AGREED") {
        // final ≥ driver's counter carries accept semantics — the claiming driver
        // wins the trip; never rebroadcast an already-agreed negotiation.
        // The creation-time wallet check is stale by now — re-verify against the
        // final negotiated total before settlement can overdraw it.
        const payRow = (
          await sql.query<{ payment_method: string }>(
            "SELECT payment_method FROM ride_requests WHERE id=$1",
            [updated.request_id],
          )
        ).rows[0];
        if (payRow?.payment_method === "WALLET") {
          const due = updated.current_offer + platformFeePaise!;
          const bal = await walletBalance(sql, `user:${sess.userId}:WALLET`);
          if (bal < due) fail(402, "INSUFFICIENT_WALLET", "wallet balance is too low for this fare");
        }
        const trip = await finalizeAgreement(updated.request_id, updated.id, claimed);
        return { state: updated.state, round: updated.round, platformFeePaise, tripId: trip.tripId };
      }
      const rr = (
        await sql.query<{
          pickup_lat: number;
          pickup_lng: number;
          drop_lat: number;
          drop_lng: number;
          payment_method: string;
          pickup_label: string | null;
          drop_label: string | null;
          requested_driver_id: string | null;
        }>(
          "SELECT pickup_lat, pickup_lng, drop_lat, drop_lng, payment_method, pickup_label, drop_label, requested_driver_id FROM ride_requests WHERE id=$1",
          [updated.request_id],
        )
      ).rows[0]!;
      await broadcastRequest({
        requestId: updated.request_id,
        negotiationId: updated.id,
        takeHomePaise: updated.current_offer,
        pickup: { lat: rr.pickup_lat, lng: rr.pickup_lng },
        drop: { lat: rr.drop_lat, lng: rr.drop_lng },
        pickupLabel: rr.pickup_label,
        dropLabel: rr.drop_label,
        onlyDriverId: rr.requested_driver_id,
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
    const owned = await getTrip(sql, id);
    if (!owned) fail(404, "NOT_FOUND", "no such trip");
    if (owned.driver_id !== sess.userId) fail(403, "FORBIDDEN", "not your trip");
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
    if (trip.rider_id !== sess.userId && trip.driver_id !== sess.userId) fail(403, "FORBIDDEN", "not your trip");
    if (trip.state === "ONGOING") return { state: "ONGOING" };
    // The code is only enterable at the pickup: without this gate a driver could
    // spend the whole attempt budget en route and get a fresh one on arrival.
    if (trip.state !== "ARRIVED") fail(409, "NOT_AT_PICKUP", "mark arrival before entering the start code");
    if (!(await verifyStartOtp(sql, id, otp ?? ""))) fail(401, "BAD_OTP", "wrong OTP");
    const updated = await transitionTrip(sql, id, "ONGOING");
    pushRider(updated.rider_id, { t: "trip.state", state: "ONGOING" });
    pushDriver(updated.driver_id, { t: "trip.state", state: "ONGOING", tripId: updated.id });
    return { state: updated.state };
  });

  app.post("/v1/trips/:id/complete", async (req) => {
    const sess = requireDriver(await session(req));
    const { id } = req.params as { id: string };
    const trip0 = await getTrip(sql, id);
    if (!trip0) fail(404, "NOT_FOUND", "no such trip");
    if (trip0.driver_id !== sess.userId) fail(403, "FORBIDDEN", "not your trip");
    if (trip0.state === "COMPLETED") {
      // Settlement may have failed after the state flip (e.g. wallet guard);
      // settleTrip is idempotent by `settle:<tripId>` — retry it here so a
      // completed trip is never left silently unsettled.
      try {
        const retry = await settleTrip(sql, id, 0);
        const live = getLiveDriver(sess.userId);
        if (live) live.onTrip = false;
        pushRider(trip0.rider_id, { t: "trip.state", state: "COMPLETED" });
        pushDriver(sess.userId, { t: "trip.state", state: "COMPLETED", tripId: id });
        return { state: "COMPLETED", txnId: retry.txnId, duplicate: true };
      } catch (err) {
        if (err instanceof TripError) fail(409, err.code, err.message);
        throw err;
      }
    }
    try {
      await transitionTrip(sql, id, "COMPLETED");
      const settlement = await settleTrip(sql, id, 0);
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

  app.post("/v1/trips/:id/tip", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    const { amountPaise } = req.body as { amountPaise?: number };
    if (!Number.isSafeInteger(amountPaise) || amountPaise! < 100 || amountPaise! > 100_000) {
      fail(400, "INVALID_TIP", "tip must be between ₹1 and ₹1,000");
    }
    const trip = await getTrip(sql, id);
    if (!trip) fail(404, "NOT_FOUND", "no such trip");
    if (trip.rider_id !== sess.userId) fail(403, "FORBIDDEN", "not your trip");
    if (trip.state !== "COMPLETED") fail(409, "NOT_COMPLETED", "tip after trip completion");
    const prior = await sql.query<{ amount_paise: number }>(
      "SELECT amount_paise FROM journal_entries WHERE trip_id=$1 AND reason='TIP' LIMIT 1",
      [id],
    );
    if (prior.rows[0]) {
      if (Number(prior.rows[0].amount_paise) !== amountPaise) fail(409, "TIP_ALREADY_SET", "tip was already submitted");
      return { ok: true, duplicate: true };
    }
    const source = trip.payment_method === "WALLET" ? `user:${sess.userId}:WALLET` : "pg:CLEARING";
    if (trip.payment_method === "WALLET" && (await walletBalance(sql, source)) < amountPaise!) {
      fail(402, "INSUFFICIENT_WALLET", "wallet balance is too low for this tip");
    }
    try {
      // Guard only real wallets — clearing is a netting account that may sit negative.
      const txn = await postTransaction(
        sql,
        [{ debitAccount: source, creditAccount: `driver:${trip.driver_id}:WALLET`, amountPaise: amountPaise!, reason: "TIP" }],
        id,
        `tip:${id}`,
        trip.payment_method === "WALLET" ? [{ account: source, minBalancePaise: amountPaise! }] : [],
      );
      const fare = readFareJson(trip.fare_json);
      fare.tipPaise = amountPaise!;
      await sql.query("UPDATE trips SET fare_json=$2 WHERE id=$1", [id, JSON.stringify(fare)]);
      return { ok: true, txnId: txn.txnId, duplicate: txn.duplicate };
    } catch (err) {
      if (err instanceof InsufficientFundsError) fail(402, "INSUFFICIENT_WALLET", "wallet balance is too low for this tip");
      throw err;
    }
  });

  app.post("/v1/trips/:id/cancel-rider", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    const trip = await getTrip(sql, id);
    if (!trip) fail(404, "NOT_FOUND", "no such trip");
    if (trip.rider_id !== sess.userId) fail(403, "FORBIDDEN", "not your trip");
    if (trip.state === "CANCELLED_RIDER") return { state: trip.state, duplicate: true };
    if (!["DRIVER_ASSIGNED", "ARRIVING", "ARRIVED"].includes(trip.state)) {
      fail(409, "NOT_CANCELLABLE", "trip can only be cancelled before it starts");
    }
    const updated = await transitionTrip(sql, id, "CANCELLED_RIDER");
    const live = getLiveDriver(updated.driver_id);
    if (live) live.onTrip = false;
    pushDriver(updated.driver_id, { t: "trip.state", state: "CANCELLED_RIDER", tripId: id });
    return { state: updated.state, duplicate: false };
  });

  app.get("/v1/trips/:id", async (req) => {
    const sess = requireAuth(await session(req));
    const { id } = req.params as { id: string };
    const trip = await getTrip(sql, id);
    if (!trip) fail(404, "NOT_FOUND", "no such trip");
    if (trip.rider_id !== sess.userId && trip.driver_id !== sess.userId) {
      fail(403, "FORBIDDEN", "not your trip");
    }
    const mine = await sql.query<{ stars: number }>(
      "SELECT stars FROM ratings WHERE trip_id=$1 AND rater_id=$2",
      [id, sess.userId],
    );
    // The start code only becomes a timed challenge once the driver is at the
    // pickup — before that there is no countdown to show and nothing to expire.
    let otpWindow: Record<string, unknown> = {};
    if (["DRIVER_ASSIGNED", "ARRIVING"].includes(trip.state)) {
      otpWindow = { otpWindowOpensOnArrival: true };
    } else if (trip.state === "ARRIVED" && trip.otp_expires_at) {
      otpWindow = {
        otpExpiresAt: new Date(trip.otp_expires_at).toISOString(),
        otpExpiresInMs: Math.max(0, Number(trip.otp_expires_in_ms ?? 0)),
        otpAttemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - (trip.otp_attempts ?? 0)),
        otpAttemptsMax: OTP_MAX_ATTEMPTS,
      };
    }
    return {
      ...tripView(trip),
      riderName: trip.rider_name ?? undefined,
      ...(mine.rows[0] ? { myRatingStars: mine.rows[0].stars } : {}),
      ...otpWindow,
    };
  });

  app.post("/v1/trips/:id/regenerate-otp", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    const trip = await getTrip(sql, id);
    if (!trip) fail(404, "NOT_FOUND", "no such trip");
    if (trip.rider_id !== sess.userId) fail(403, "FORBIDDEN", "not your trip");
    enforceRateLimit(`otp-regen:${id}`, 10, 5 * 60_000);
    try {
      // The window (if any) comes straight from the database — no app-clock math.
      const { otp, expiresInMs } = await regenerateTripOtp(sql, id);
      return {
        otp,
        ...(expiresInMs == null
          ? { otpWindowOpensOnArrival: true }
          : {
              otpExpiresInMs: expiresInMs,
              otpAttemptsLeft: OTP_MAX_ATTEMPTS,
              otpAttemptsMax: OTP_MAX_ATTEMPTS,
            }),
      };
    } catch (err) {
      if (err instanceof TripError) fail(409, err.code, err.message);
      throw err;
    }
  });

  app.post("/v1/trips/:id/share-link", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    const trip = await getTrip(sql, id);
    if (!trip || trip.rider_id !== sess.userId) fail(404, "NOT_FOUND", "no such trip");
    if (["CANCELLED_RIDER", "CANCELLED_DRIVER"].includes(trip.state)) {
      fail(409, "NOT_SHAREABLE", "cancelled trips cannot be shared");
    }
    let token = trip.share_token ?? null;
    if (!token) {
      const minted = randomBytes(16).toString("base64url");
      const upd = await sql.query<{ share_token: string }>(
        "UPDATE trips SET share_token=$2 WHERE id=$1 AND share_token IS NULL RETURNING share_token",
        [id, minted],
      );
      // A concurrent mint may have won the guarded UPDATE — always trust the row.
      token = upd.rows[0]?.share_token
        ?? (await sql.query<{ share_token: string }>("SELECT share_token FROM trips WHERE id=$1", [id])).rows[0]!
          .share_token!;
    }
    const origin = process.env.PUBLIC_ORIGIN;
    if (!origin && process.env.NODE_ENV === "production") {
      fail(500, "SHARE_UNCONFIGURED", "PUBLIC_ORIGIN must be set to build share links");
    }
    return { url: `${origin ?? `${req.protocol}://${req.headers.host ?? "localhost:5173"}`}/share/${token}` };
  });

  // Public, unauthenticated: the whole point of a journey-share link.
  app.get("/v1/share/:token", async (req) => {
    const { token } = req.params as { token: string };
    const r = (
      await sql.query<{
        state: string;
        vehicle_class: string;
        pickup_lat: number;
        pickup_lng: number;
        drop_lat: number;
        drop_lng: number;
        pickup_label: string | null;
        drop_label: string | null;
        started_at: Date | null;
        ended_at: Date | null;
        driver_id: string;
        driver_name: string | null;
        plate: string | null;
      }>(
        `SELECT t.state, t.vehicle_class, t.pickup_lat, t.pickup_lng, t.drop_lat, t.drop_lng,
                r.pickup_label, r.drop_label, t.started_at, t.ended_at,
                t.driver_id, u.full_name AS driver_name, d.plate
         FROM trips t
         JOIN ride_requests r ON r.id=t.request_id
         JOIN users u ON u.id=t.driver_id
         LEFT JOIN driver_profiles d ON d.user_id=t.driver_id
         WHERE t.share_token=$1`,
        [token],
      )
    ).rows[0];
    if (!r) fail(404, "NOT_FOUND", "this journey link is not valid");
    const pos = getLiveDriver(r.driver_id);
    return {
      state: r.state,
      vehicleClass: r.vehicle_class,
      driverFirstName: (r.driver_name ?? "").split(" ")[0] || null,
      driverPlate: r.plate,
      pickup: { lat: Math.round(r.pickup_lat * 1000) / 1000, lng: Math.round(r.pickup_lng * 1000) / 1000 },
      drop: { lat: Math.round(r.drop_lat * 1000) / 1000, lng: Math.round(r.drop_lng * 1000) / 1000 },
      pickupLabel: r.pickup_label,
      dropLabel: r.drop_label,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : undefined,
      endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : undefined,
      driverLivePos: ["ONGOING", "ARRIVING"].includes(r.state) && pos ? { lat: pos.pos.lat, lng: pos.pos.lng } : undefined,
    };
  });

  app.get("/v1/safety/contacts", async (req) => {
    const sess = requireAuth(await session(req));
    const rows = await sql.query<{ name: string; phone: string }>(
      "SELECT name, phone FROM safety_contacts WHERE user_id=$1 ORDER BY position, created_at LIMIT 3",
      [sess.userId],
    );
    return { contacts: rows.rows };
  });

  app.put("/v1/safety/contacts", async (req) => {
    const sess = requireAuth(await session(req));
    const body = req.body as { contacts?: Array<{ name?: string; phone?: string }> };
    const list = Array.isArray(body.contacts) ? body.contacts.slice(0, 3) : [];
    const cleanName = (s: unknown): string =>
      Array.from(String(s ?? ""))
        .filter((ch) => {
          const cp = ch.codePointAt(0) ?? 0;
          return cp > 31 && cp !== 127 && cp !== 173;
        })
        .slice(0, 80)
        .join("")
        .trim();
    const parsed: Array<{ name: string; phone: string }> = [];
    for (const c of list) {
      const name = cleanName(c.name);
      const phone = typeof c.phone === "string" ? c.phone.trim() : "";
      if (!name || !/^\+[0-9]{10,15}$/.test(phone)) {
        fail(400, "BAD_CONTACT", "each contact needs a name and an E.164 phone");
      }
      if (parsed.some((p) => p.phone === phone)) continue;
      parsed.push({ name, phone });
    }
    await sql.tx!(async (txSql) => {
      await txSql.query("DELETE FROM safety_contacts WHERE user_id=$1", [sess.userId]);
      for (const [i, c] of parsed.entries()) {
        await txSql.query("INSERT INTO safety_contacts (user_id, name, phone, position) VALUES ($1,$2,$3,$4)", [
          sess.userId,
          c.name,
          c.phone,
          i,
        ]);
      }
    });
    return { ok: true, contacts: parsed };
  });

  app.get("/v1/rider/favorites", async (req) => {
    const sess = requireRider(await session(req));
    const rows = await sql.query<{
      id: string;
      name: string;
      vehicleClass: string | null;
      plate: string | null;
      rating: number | null;
    }>(
      `SELECT f.driver_id AS id, u.full_name AS name,
              d.vehicle_class AS "vehicleClass", d.plate, u.rating_rolling AS rating
       FROM favorite_drivers f
       JOIN users u ON u.id = f.driver_id
       LEFT JOIN driver_profiles d ON d.user_id = f.driver_id
       WHERE f.rider_id=$1
       ORDER BY f.created_at DESC
       LIMIT 10`,
      [sess.userId],
    );
    return {
      favorites: rows.rows.map((r) => ({ ...r, rating: Number(r.rating ?? 5) })),
    };
  });

  app.put("/v1/drivers/:id/favorite", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    enforceRateLimit(`fav:${sess.userId}`, 30, 60_000);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      fail(400, "BAD_BODY", "driver id required");
    }
    if (id === sess.userId) fail(400, "BAD_BODY", "cannot favourite yourself");
    const target = await sql.query<{ role: string }>("SELECT role FROM users WHERE id=$1", [id]);
    if (target.rows[0]?.role !== "DRIVER") fail(404, "NOT_FOUND", "no such driver");
    // Single conditional insert: the cap is enforced atomically with the write,
    // so concurrent favourites for different drivers cannot exceed ten.
    const ins = await sql.query(
      `INSERT INTO favorite_drivers (rider_id, driver_id)
       SELECT $1, $2
       WHERE (SELECT COUNT(*) FROM favorite_drivers WHERE rider_id=$1) < 10
       ON CONFLICT DO NOTHING`,
      [sess.userId, id],
    );
    if (ins.rows.length === 0) {
      const now = await sql.query(
        "SELECT 1 FROM favorite_drivers WHERE rider_id=$1 AND driver_id=$2",
        [sess.userId, id],
      );
      if (now.rows.length === 0) fail(409, "FAVORITE_LIMIT", "up to 10 favourite drivers");
      return { ok: true, duplicate: true };
    }
    return { ok: true };
  });

  app.delete("/v1/drivers/:id/favorite", async (req) => {
    const sess = requireRider(await session(req));
    const { id } = req.params as { id: string };
    enforceRateLimit(`fav:${sess.userId}`, 30, 60_000);
    await sql.query("DELETE FROM favorite_drivers WHERE rider_id=$1 AND driver_id=$2", [sess.userId, id]);
    return { ok: true };
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
      pickupLabel: trip.pickup_label ?? undefined,
      dropLabel: trip.drop_label ?? undefined,
      fareBreakdown: fare,
      paymentMethod: trip.payment_method ?? "UPI",
      startedAt: trip.started_at ? new Date(trip.started_at).toISOString() : undefined,
      endedAt: trip.ended_at ? new Date(trip.ended_at).toISOString() : undefined,
      driverName: driver?.name ?? "",
      driverPlate: driver?.plate ?? "",
      driverRating: driver?.rating ?? 4.8,
      driverLat: driver?.pos.lat,
      driverLng: driver?.pos.lng,
    };
  }

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
    void cancelBroadcast(requestId);

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
    // No countdown at assignment: the window opens when the driver arrives.
    pushRider(rr.rider_id, {
      t: "driver.assigned",
      trip: { ...view, otp, otpWindowOpensOnArrival: true } as never,
    });
    void sendPush(sql, rr.rider_id, {
      title: "Your driver is confirmed",
      body: `Driver accepted ₹${(agreed / 100).toFixed(2)}. Open Chalo-X for the start OTP.`,
      url: "/",
      tag: `trip-${trip.id}`,
    });
    pushDriver(driverId, { t: "trip.state", state: "DRIVER_ASSIGNED", tripId: trip.id });

    // Re-register presence for tracking without fabricating identity:
    // prefer the connected socket entry, fall back to the DB profile.
    const existingLive = getLiveDriver(driverId);
    const profileRow = (
      await sql.query<{ plate: string; full_name: string; rating_rolling: string | null }>(
        `SELECT d.plate, u.full_name, u.rating_rolling
         FROM driver_profiles d JOIN users u ON u.id=d.user_id WHERE d.user_id=$1`,
        [driverId],
      )
    ).rows[0];
    registerDriver({
      driverId,
      vehicleClass: rr.vehicle_class,
      pos: existingLive?.pos ?? { lat: rr.pickup_lat, lng: rr.pickup_lng },
      online: true,
      onTrip: true,
      name: existingLive?.name ?? profileRow?.full_name ?? "Driver",
      plate: existingLive?.plate ?? profileRow?.plate ?? "",
      rating: existingLive?.rating ?? Number(profileRow?.rating_rolling ?? 4.8),
      push: existingLive?.push ?? ((msg) => pushDriver(driverId, msg)),
    });

    return { tripId: trip.id, otp };
  }

  /** Relay a validated driver position to the rider of their active trip (protocol `trip.location`). */
  async function relayPositionToRider(driverId: string, lat: number, lng: number): Promise<void> {
    const active = await sql.query<{ rider_id: string }>(
      // trips has no created_at; ended_at DESC NULLS FIRST rides idx_trips_driver
      // and prefers never-ended (active) rows when a driver holds several.
      `SELECT rider_id FROM trips
       WHERE driver_id=$1 AND state IN ('DRIVER_ASSIGNED','ARRIVING','ARRIVED','ONGOING')
       ORDER BY ended_at DESC NULLS FIRST
       LIMIT 1`,
      [driverId],
    );
    const row = active.rows[0];
    if (row) pushRider(row.rider_id, { t: "trip.location", lat, lng });
  }

  // ---- websockets -------------------------------------------------------------------

  app.get("/ws/rider", { websocket: true }, (socket, req) => {
    void (async () => {
      const ticket = new URL(req.url ?? "/", "http://x").searchParams.get("ticket") ?? "";
      const sess = consumeWsTicket(ticket, "RIDER");
      if (!sess) { socket.close(4401, "invalid or expired ticket"); return; }
      const user = await sql.query<{ id: string }>("SELECT id FROM users WHERE id=$1 AND status='ACTIVE'", [sess.userId]);
      if (!user.rows[0]) { socket.close(4401, "unauthorized"); return; }
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
      const ticket = new URL(req.url ?? "/", "http://x").searchParams.get("ticket") ?? "";
      const sess = consumeWsTicket(ticket, "DRIVER");
      if (!sess) { socket.close(4401, "invalid or expired ticket"); return; }
      const profile = (
        await sql.query<{
          vehicle_class: string; plate: string; full_name: string; rating_rolling: string | null;
          last_lat: number | null; last_lng: number | null;
        }>(
          `SELECT d.vehicle_class, d.plate, u.full_name, u.rating_rolling, d.last_lat, d.last_lng
           FROM driver_profiles d JOIN users u ON u.id=d.user_id WHERE d.user_id=$1 AND u.status='ACTIVE'`,
          [sess.userId],
        )
      ).rows[0];
      if (!profile) { socket.close(4401, "unauthorized"); return; }

      const oldConnection = driverConns[sess.userId]?.socket;
      if (oldConnection && oldConnection.readyState === 1) oldConnection.close(4009, "Account opened in another tab");
      driverConns[sess.userId] = { socket };
      logger.ws("driver", "Connected", sess.userId);

      registerDriver({
        driverId: sess.userId,
        vehicleClass: profile.vehicle_class,
        pos: { lat: profile.last_lat ?? 12.97, lng: profile.last_lng ?? 77.59 },
        online: true,
        onTrip: false,
        name: profile.full_name,
        plate: profile.plate,
        rating: Number(profile.rating_rolling ?? 4.8),
        push: (msg) => pushDriver(sess.userId, msg),
      });

      socket.on("message", (raw: Buffer) => {
        let msg: { t?: string; lat?: number; lng?: number };
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.t === "pos.update" && typeof msg.lat === "number" && typeof msg.lng === "number") {
          try {
            validateDriverGps(sess.userId, { lat: msg.lat, lng: msg.lng });
            setDriverPos(sess.userId, { lat: msg.lat, lng: msg.lng });
            void sql.query("UPDATE driver_profiles SET last_lat=$2,last_lng=$3 WHERE user_id=$1", [sess.userId, msg.lat, msg.lng]);
            void relayPositionToRider(sess.userId, msg.lat, msg.lng);
          } catch (err) { logger.warn("FRAUD", `Rejected driver GPS update user=${sess.userId.slice(0, 8)}`, err); }
        }
      });

      socket.on("close", () => {
        if (driverConns[sess.userId]?.socket !== socket) return;
        delete driverConns[sess.userId];
        unregisterDriver(sess.userId);
        logger.ws("driver", "Disconnected", sess.userId);
        setTimeout(() => {
          if (driverConns[sess.userId]) return;
          void sql.query<TripRow>(
            `SELECT t.*,r.payment_method FROM trips t JOIN ride_requests r ON r.id=t.request_id
             WHERE t.driver_id=$1 AND t.state IN ('DRIVER_ASSIGNED','ARRIVING','ARRIVED')`,
            [sess.userId],
          ).then(async ({ rows }) => {
            for (const trip of rows) {
              const updated = await transitionTrip(sql, trip.id, "CANCELLED_DRIVER").catch(() => null);
              if (!updated) continue;
              pushRider(updated.rider_id, { t: "trip.state", state: "CANCELLED_DRIVER" });
              void sendPush(sql, updated.rider_id, { title: "Driver disconnected", body: "Your ride was cancelled before pickup. Please search again.", url: "/", tag: `disconnect-${trip.id}` });
            }
          });
        }, 10_000).unref();
      });
    })();
  });
  // ---- dev verification endpoints (never in production) ----
  if (process.env.NODE_ENV === "test" || process.env.ENABLE_DEV_ENDPOINTS === "1") {
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
    if (!Number.isInteger(stars) || stars! < 1 || stars! > 5) fail(400, "BAD_STARS", "integer stars 1..5 required");
    if (comment != null && (typeof comment !== "string" || comment.length > 500)) {
      fail(400, "COMMENT_TOO_LONG", "rating comment is limited to 500 characters");
    }
    const trip = await getTrip(sql, id);
    if (!trip || trip.state !== "COMPLETED") fail(409, "NOT_COMPLETED", "rate after completion");
    if (trip.rider_id !== sess.userId && trip.driver_id !== sess.userId) {
      fail(403, "FORBIDDEN", "not your trip");
    }
    const rateeId = trip.rider_id === sess.userId ? trip.driver_id : trip.rider_id;
    try {
      await sql.query(
        `INSERT INTO ratings (id, trip_id, rater_id, ratee_id, stars, comment)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), id, sess.userId, rateeId, stars, comment ?? null],
      );
      const average = await sql.query<{ avg: string }>(
        "SELECT AVG(stars)::text AS avg FROM ratings WHERE ratee_id=$1",
        [rateeId],
      );
      await sql.query("UPDATE users SET rating_rolling=$2 WHERE id=$1", [
        rateeId,
        Number(average.rows[0]?.avg ?? stars).toFixed(2),
      ]);
    } catch {
      fail(409, "ALREADY_RATED", "already rated this trip");
    }
    return { ok: true };
  });

  app.post("/v1/driver/status", async (req) => {
    const sess = requireDriver(await session(req));
    const body = req.body as { online?: boolean; vehicleClass?: string; lat?: number; lng?: number };
    const current = await sql.query<{ vehicle_class: string }>(
      "SELECT vehicle_class FROM driver_profiles WHERE user_id=$1",
      [sess.userId],
    );
    if (typeof body.vehicleClass === "string" && current.rows[0]?.vehicle_class !== body.vehicleClass) {
      fail(409, "VEHICLE_IMMUTABLE", "Vehicle changes require document review and are not allowed in the driver console");
    }
    if (typeof body.online === "boolean") {
      await sql.query("UPDATE driver_profiles SET online=$2 WHERE user_id=$1", [sess.userId, body.online]);
      const live = getLiveDriver(sess.userId);
      if (live) live.online = body.online;
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
    const owned = await getTrip(sql, id);
    if (!owned) fail(404, "NOT_FOUND", "no such trip");
    if (owned.driver_id !== sess.userId) fail(403, "FORBIDDEN", "not your trip");
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
      `SELECT t.*, r.payment_method, r.pickup_label, r.drop_label FROM trips t
       JOIN ride_requests r ON r.id=t.request_id
       WHERE t.${col}=$1 ORDER BY r.created_at DESC LIMIT 50`,
      [sess.userId],
    );
    return { trips: rows.rows.map(tripView) };
  });

  app.get("/v1/driver/me", async (req) => {
    const sess = requireDriver(await session(req));
    const profile = (
      await sql.query<{ vehicle_class: string; plate: string; kyc_status: string; online: boolean; rating: string | null }>(
        `SELECT d.vehicle_class, d.plate, d.kyc_status, d.online, u.rating_rolling AS rating
         FROM driver_profiles d JOIN users u ON u.id=d.user_id WHERE d.user_id=$1`,
        [sess.userId],
      )
    ).rows[0];
    const account = `driver:${sess.userId}:WALLET`;
    const balance = await walletBalance(sql, account);
    const stats = await sql.query<{ completed: string; today: string; week: string; cash: string; digital: string }>(
      `SELECT
         COUNT(DISTINCT t.id)::text AS completed,
         COALESCE(SUM(CASE WHEN j.created_at >= date_trunc('day',now()) THEN j.amount_paise ELSE 0 END),0)::text AS today,
         COALESCE(SUM(CASE WHEN j.created_at >= now()-interval '7 days' THEN j.amount_paise ELSE 0 END),0)::text AS week,
         COALESCE(SUM(CASE WHEN r.payment_method='CASH' THEN j.amount_paise ELSE 0 END),0)::text AS cash,
         COALESCE(SUM(CASE WHEN r.payment_method<>'CASH' THEN j.amount_paise ELSE 0 END),0)::text AS digital
       FROM trips t
       LEFT JOIN ride_requests r ON r.id=t.request_id
       LEFT JOIN journal_entries j ON j.trip_id=t.id AND j.credit_account=$2 AND j.reason IN ('RIDE_FARE','TIP','INCENTIVE')
       WHERE t.driver_id=$1 AND t.state='COMPLETED'`,
      [sess.userId, account],
    );
    const s = stats.rows[0];
    return {
      profile: profile ?? null,
      rating: Number(profile?.rating ?? 5),
      walletBalancePaise: balance,
      completedTrips: Number(s?.completed ?? 0),
      todayEarningsPaise: Number(s?.today ?? 0),
      weekEarningsPaise: Number(s?.week ?? 0),
      cashEarningsPaise: Number(s?.cash ?? 0),
      digitalEarningsPaise: Number(s?.digital ?? 0),
    };
  });

  app.post("/v1/driver/payout", async (req) => {
    const sess = requireDriver(await session(req));
    const { amountPaise } = req.body as { amountPaise?: number };
    if (!Number.isSafeInteger(amountPaise) || amountPaise! < 20_000) fail(400, "INVALID_PAYOUT", "minimum payout is ₹200");
    const account = `driver:${sess.userId}:WALLET`;
    try {
      // Guard inside the posting tx: concurrent payouts cannot double-spend.
      const txn = await postTransaction(
        sql,
        [{ debitAccount: account, creditAccount: `external:BANK:${sess.userId}`, amountPaise: amountPaise!, reason: "PAYOUT" }],
        null,
        `payout:${sess.userId}:${randomUUID()}`,
        [{ account, minBalancePaise: amountPaise! }],
      );
      return { ok: true, txnId: txn.txnId, balancePaise: await walletBalance(sql, account) };
    } catch (err) {
      if (err instanceof InsufficientFundsError) fail(409, "INSUFFICIENT_BALANCE", "payout exceeds wallet balance");
      throw err;
    }
  });

  app.post("/v1/driver/onboarding", async (req) => {
    const sess = requireDriver(await session(req));
    const { plate } = req.body as { plate?: string };
    const clean = plate?.trim().toUpperCase();
    if (!clean || clean.length < 6 || clean.length > 15) fail(400, "INVALID_PLATE", "enter a valid vehicle plate");
    await sql.query("UPDATE driver_profiles SET plate=$2, kyc_status='IN_REVIEW' WHERE user_id=$1", [sess.userId, clean]);
    return { ok: true, status: "IN_REVIEW" };
  });

  if (process.env.NODE_ENV === "test" || process.env.ENABLE_DEV_ENDPOINTS === "1") {
    app.post("/v1/driver/onboarding/dev-approve", async (req) => {
      const sess = requireDriver(await session(req));
      await sql.query("UPDATE driver_profiles SET kyc_status='APPROVED' WHERE user_id=$1", [sess.userId]);
      return { ok: true, status: "APPROVED" };
    });
  }
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
            negotiationId: exp.id,
            currentOfferPaise: exp.currentOffer as never,
            platformFeePaise: exp.platformFee as never,
            riderTotalPaise: (exp.currentOffer + exp.platformFee) as never,
            round: exp.round,
            maxRounds: 3,
            listPrice: exp.listPrice as never,
          },
        });
      }
    } catch {}
  }, 1000);
  sweeperTimer.unref();

  await app.listen({ port: listenPort, host: "127.0.0.1" });
  console.log(`[core] listening on :${listenPort} (storage: ${storage.kind})`);
  if (process.env.NODE_ENV !== "production" && !devAuthEnabled()) {
    console.warn(
      "[core] Dev conveniences are OFF — OTP logins will fail with OTP_UNAVAILABLE.\n" +
        "       Fix: add ENABLE_DEV_ENDPOINTS=1 to services/core/.env and restart.",
    );
  }
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
  startServer()
    .then((handle) => {
      let closing = false;
      const shutdown = async (signal: string) => {
        if (closing) return;
        closing = true;
        logger.info("SHUTDOWN", `Received ${signal}; draining server`);
        await handle.close();
        process.exit(0);
      };
      process.once("SIGTERM", () => void shutdown("SIGTERM"));
      process.once("SIGINT", () => void shutdown("SIGINT"));
    })
    .catch((err: unknown) => {
      console.error("[core] fatal", err);
      process.exit(1);
    });
}
