/**
 * API-level end-to-end: rider negotiates under list, driver counters, rider accepts,
 * trip runs ARRIVING→ARRIVED→ONGOING→COMPLETED, settlement balances the ledger.
 * Run while core is up:  npx tsx src/e2e.ts
 */
import WebSocket from "ws";

const BASE = "http://127.0.0.1:8080";
const RIDER_PHONE = "+919900000001";
const DRIVER_PHONE = "+919900000101";
let failures = 0;

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name} ${detail}`);
  }
}

async function api(
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Single-socket message router: collect messages, await specific matches. */
class WsBus {
  private socket: WebSocket;
  private waiters: Array<{ match: (m: Record<string, unknown>) => boolean; resolve: (m: Record<string, unknown>) => void }> = [];
  readonly log: Record<string, unknown>[] = [];

  constructor(url: string, token: string) {
    const { promise, resolve } = Promise.withResolvers<void>();
    this.openPromise = promise;
    this.socket = new WebSocket(`${url}?token=${token}`);
    this.socket.on("open", () => resolve());
    this.socket.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      this.log.push(msg);
      const idx = this.waiters.findIndex((w) => w.match(msg));
      if (idx >= 0) {
        const w = this.waiters[idx];
        if (w) this.waiters.splice(idx, 1);
        w?.resolve(msg);
      }
    });
  }

  private openPromise: Promise<void>;

  async ready(): Promise<void> {
    await this.openPromise;
  }

  send(payload: unknown): void {
    this.socket.send(JSON.stringify(payload));
  }

  waitFor(match: (m: Record<string, unknown>) => boolean, timeoutMs = 15000): Promise<Record<string, unknown>> {
    const { promise, resolve, reject } = Promise.withResolvers<Record<string, unknown>>();
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
    void reject;
    return promise;
  }

  close(): void {
    this.socket.close();
  }
}

async function main(): Promise<void> {
  const riderLogin = await api("/v1/auth/otp/verify", {
    phone: RIDER_PHONE, otp: "123456", role: "RIDER", fullName: "E2E Rider",
  });
  check("rider login", riderLogin.status === 200 && typeof riderLogin.json.token === "string");
  const riderToken = String(riderLogin.json.token);

  const driverLogin = await api("/v1/auth/otp/verify", {
    phone: DRIVER_PHONE, otp: "123456", role: "DRIVER",
  });
  check("driver login", driverLogin.status === 200);
  const driverToken = String(driverLogin.json.token);

  const pickup = { lat: 12.9352, lng: 77.6245 };
  const drop = { lat: 12.9611, lng: 77.6387 };
  const quotesResp = await api("/v1/quotes", { pickup, drop }, riderToken);
  const quotes = (quotesResp.json.quotes ?? []) as Array<{
    vehicleClass: string; listPrice: number; platformFeePaise: number; softFloor: number; quoteToken: string;
  }>;
  check("quotes returned", quotes.length >= 4);
  const bike = quotes.find((q) => q.vehicleClass === "BIKE")!;
  check("bike quote has fee + soft floor", bike.platformFeePaise > 0 && bike.softFloor > 0);
  console.log(
    `      list ₹${bike.listPrice / 100} = fare ₹${(bike.listPrice - bike.platformFeePaise) / 100} + fee ₹${bike.platformFeePaise / 100}`,
  );

  // one socket per side, opened before dispatch so nothing is missed
  const riderSock = new WsBus(`${BASE.replace("http", "ws")}/ws/rider`, riderToken);
  await riderSock.ready();
  const driverSock = new WsBus(`${BASE.replace("http", "ws")}/ws/driver`, driverToken);
  await driverSock.ready();
  driverSock.send({ t: "pos.update", ...pickup });
  await new Promise((r) => setTimeout(r, 400));

  const assignedWait = riderSock.waitFor((m) => m.t === "driver.assigned");
  const offerWait = driverSock.waitFor((m) => m.t === "dispatch.offer");

  // ---- rider low-ball offer: 50% of list ----
  const offer = Math.round(bike.listPrice / 2);
  const created = await api("/v1/requests", {
    quoteToken: bike.quoteToken,
    offerPaise: offer,
    vehicleClass: "BIKE",
    paymentMethod: "UPI",
    pickup,
    drop,
  }, riderToken);
  check("negotiated request created", created.status === 200 && created.json.mode === "NEGOTIATED");
  const negId = String(created.json.negotiationId);

  const offerMsg = await offerWait;
  check(
    "offer broadcast, take-home == rider offer",
    offerMsg.offer !== undefined &&
      (offerMsg.offer as Record<string, unknown>).takeHomePaise === offer,
  );

  // ---- driver counters +₹20 ----
  const counterResp = await api(`/v1/negotiations/${negId}/counter`, { paise: offer + 2000 }, driverToken);
  check("driver counter accepted", counterResp.status === 200);

  // ---- rider accepts counter → trip + OTP over WS ----
  const accept = await api(`/v1/negotiations/${negId}/rider-accept`, {}, riderToken);
  check("rider accepts counter → trip created", accept.status === 200 && typeof accept.json.tripId === "string");
  const tripId = String(accept.json.tripId);

  const assigned = await assignedWait;
  const tripPayload = assigned.trip as Record<string, unknown> | undefined;
  const otp = typeof tripPayload?.otp === "string" ? tripPayload.otp : undefined;
  check("rider got assignment with OTP", !!otp && tripPayload?.id === tripId);

  // ---- lifecycle ----
  await api(`/v1/trips/${tripId}/state`, { to: "ARRIVING" }, driverToken);
  await api(`/v1/trips/${tripId}/state`, { to: "ARRIVED" }, driverToken);

  const wrongStart = await api(`/v1/trips/${tripId}/start`, { otp: "000000" }, riderToken);
  check("wrong OTP rejected", wrongStart.status === 401);
  const started = await api(`/v1/trips/${tripId}/start`, { otp: otp ?? "" }, riderToken);
  check("correct OTP starts ride", started.status === 200 && started.json.state === "ONGOING");
  const completed = await api(`/v1/trips/${tripId}/complete`, {}, driverToken);
  check("trip completes + settles", completed.status === 200 && completed.json.state === "COMPLETED");

  // ---- ledger balance invariant ----
  const recon = await fetch(`${BASE}/v1/dev/reconcile?tripId=${tripId}`).then(
    (r) => r.json() as Promise<{ balanced: boolean; lines: number }>,
  );
  check("journal balanced for trip", recon.balanced === true && recon.lines >= 2);
  riderSock.close();
  driverSock.close();
  console.log(failures === 0 ? "\nALL E2E CHECKS PASSED" : `\n${failures} E2E FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error("e2e crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
