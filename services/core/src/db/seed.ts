/** Seed: Bengaluru fare cards, negotiation rules, demo rider + drivers with wallets.
 *  Run `pnpm db:migrate` first. */
import { randomUUID } from "node:crypto";
import { openStorage } from "./storage.ts";
import { upsertUser } from "../auth.ts";
import type { SqlRowClient } from "../types.ts";

export async function seedData(sql: SqlRowClient): Promise<void> {
  // ---- fare cards (city 1 = Bengaluru pilot) ----------------------------------
  // platform fee: pct of trip fare, min ₹5, cap ₹40 — the honest floor behind the ℹ️
  const cards: Array<[string, number, number, number, number, string, number, number]> = [
    // class, base₹, perKm₹, perMin₹, minFare₹, feePct, feeMinPaise, feeCapPaise
    ["BIKE", 15, 6.5, 0.8, 25, "0.10", 500, 4000],
    ["BIKE_LITE", 12, 5.5, 0.7, 20, "0.10", 500, 3000],
    ["AUTO", 30, 12, 1.2, 40, "0.12", 800, 6000],
    ["CAB_MINI", 50, 15, 1.5, 80, "0.15", 1000, 9000],
    ["CAB_PRIME", 60, 18, 1.8, 100, "0.15", 1200, 12000],
    ["CAB_XL", 80, 22, 2, 130, "0.15", 1500, 15000],
  ];
  for (const [vc, base, km, min, minFare, pct, fmin, fcap] of cards) {
    await sql.query(
      `INSERT INTO fare_cards
         (id, city_id, vehicle_class, base_paise, per_km_paise, per_min_paise, min_fare_paise,
          platform_fee_pct, platform_fee_min_paise, platform_fee_cap_paise)
       VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (city_id, vehicle_class) DO UPDATE SET
         base_paise=EXCLUDED.base_paise, per_km_paise=EXCLUDED.per_km_paise,
         per_min_paise=EXCLUDED.per_min_paise, min_fare_paise=EXCLUDED.min_fare_paise,
         platform_fee_pct=EXCLUDED.platform_fee_pct,
         platform_fee_min_paise=EXCLUDED.platform_fee_min_paise,
         platform_fee_cap_paise=EXCLUDED.platform_fee_cap_paise`,
      [randomUUID(), vc, base * 100, Math.round(km * 100), Math.round(min * 100), minFare * 100, pct, fmin, fcap],
    );
  }

  await sql.query(
    `INSERT INTO negotiation_rules (city_id, max_rounds, soft_floor_ratio)
     VALUES (1, 3, 0.6)
     ON CONFLICT (city_id) DO UPDATE SET max_rounds=EXCLUDED.max_rounds`,
  );

  // ---- demo people -------------------------------------------------------------
  // riders/driver phones; dev OTP 123456 for everyone
  const riderPhone = "+919900000001";
  const rider = await upsertUser(sql, riderPhone, "RIDER", "Demo Rider");
  await sql.query("UPDATE users SET rating_rolling = 4.9 WHERE id=$1", [rider.id]);

  // seed rider wallet ₹500 so UPI-less demo can pay digitally
  async function topup(account: string, paise: number): Promise<void> {
    await sql.query(
      `INSERT INTO journal_entries (txn_id, debit_account, credit_account, amount_paise, reason, idempotency_key)
       VALUES ($1,'platform:BANK',$2,$3,'TOPUP',$4) ON CONFLICT (idempotency_key) DO NOTHING`,
      [randomUUID(), account, paise, `seed-topup:${account}`],
    );
  }
  await topup(`user:${rider.id}:WALLET`, 50000);

  const drivers: Array<[string, string, string, number, number]> = [
    ["+919900000101", "Ravi Kumar", "BIKE", 12.9352, 77.6245], // Koramangala
    ["+919900000102", "Suresh M", "AUTO", 12.9279, 77.6271],
    ["+919900000103", "Anil P", "CAB_MINI", 12.9611, 77.6387], // Indiranagar
  ];
  for (const [phone, name, vc, lat, lng] of drivers) {
    const d = await upsertUser(sql, phone, "DRIVER", name);
    await sql.query(
      `INSERT INTO driver_profiles (user_id, vehicle_class, plate, kyc_status, online, last_lat, last_lng)
       VALUES ($1,$2,$3,'APPROVED',false,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET vehicle_class=EXCLUDED.vehicle_class, plate=EXCLUDED.plate,
         kyc_status='APPROVED', last_lat=EXCLUDED.last_lat, last_lng=EXCLUDED.last_lng`,
      [d.id, vc, `KA01${phone.slice(-4)}XY`, lat, lng],
    );
    await topup(`driver:${d.id}:WALLET`, 10000); // float so payouts demo works
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("seed.ts")) {
  const storage = await openStorage();
  await seedData(storage.sql);
  console.log("seeded: city=1 Bengaluru, 6 fare cards, rider + 3 approved drivers");
  console.log("login phones — rider: +919900000001 | drivers: +919900000101, +919900000102, +919900000103");
  console.log("dev OTP for everyone: 123456");
  await storage.close();
}
