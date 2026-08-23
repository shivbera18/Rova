/**
 * Double-entry ledger — plan §6.2/§7.7. Append-only journal; balances are derived.
 * Account naming: "user:<id>:WALLET", "driver:<id>:WALLET", "platform:REVENUE",
 * "platform:TAX_PAYABLE", "user:<id>:POSTPAID", "pg:CLEARING", "driver:<id>:CASH_RECEIVABLE".
 * Every txn is atomic via database transactions (C3 fix) and idempotent by key.
 */
import { randomUUID } from "node:crypto";
import type { LedgerReason } from "./db/rows.ts";
import type { SqlRowClient } from "./types.ts";

export interface Line {
  debitAccount: string;
  creditAccount: string;
  amountPaise: number;
  reason: LedgerReason;
}

export async function postTransaction(
  sql: SqlRowClient,
  lines: Line[],
  tripId: string | null,
  idempotencyKey: string | null = null,
): Promise<{ txnId: string; duplicate: boolean }> {
  const key = idempotencyKey ?? `auto:${randomUUID()}`;

  if (lines.length === 0) throw new Error("EMPTY_TXN");
  for (const l of lines) {
    if (l.amountPaise <= 0) throw new Error("NONPOSITIVE_AMOUNT");
    if (!l.debitAccount || !l.creditAccount) throw new Error("INVALID_ACCOUNT");
  }

  const executor = sql.tx ? (fn: (txSql: SqlRowClient) => Promise<{ txnId: string; duplicate: boolean }>) => sql.tx!(fn) : (fn: (txSql: SqlRowClient) => Promise<{ txnId: string; duplicate: boolean }>) => fn(sql);

  return executor(async (txSql: SqlRowClient) => {
    const existing = await txSql.query<{ txn_id: string }>(
      "SELECT txn_id FROM journal_entries WHERE idempotency_key = $1 LIMIT 1",
      [key],
    );
    if (existing.rows.length > 0) return { txnId: existing.rows[0]!.txn_id, duplicate: true };

    const txnId = randomUUID();
    for (const [i, l] of lines.entries()) {
      const lineKey = i === 0 ? key : null;
      await txSql.query(
        `INSERT INTO journal_entries
           (txn_id, debit_account, credit_account, amount_paise, reason, trip_id, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [txnId, l.debitAccount, l.creditAccount, l.amountPaise, l.reason, tripId, lineKey],
      );
    }
    return { txnId, duplicate: false };
  });
}

export function settlementLines(params: {
  riderId: string;
  driverId: string;
  agreedPaise: number;
  platformFeePaise: number;
  tipPaise?: number;
  paymentMethod: "WALLET" | "UPI" | "CASH";
}): Line[] {
  const { riderId, driverId, agreedPaise, platformFeePaise, tipPaise = 0, paymentMethod } = params;
  const riderWallet = `user:${riderId}:WALLET`;
  const driverWallet = `driver:${driverId}:WALLET`;
  const revenue = "platform:REVENUE";
  const postpaid = `user:${riderId}:POSTPAID`;
  const receivable = `driver:${driverId}:CASH_RECEIVABLE`;
  const clearing = "pg:CLEARING";

  const lines: Line[] = [];

  if (paymentMethod === "CASH") {
    // rider hands cash to driver; fare sits in the driver's cash receivable and nets
    // against their next payout. The rider-side platform fee is still collected
    // digitally (mandate / POSTPAID balance) — drivers never hold platform money.
    lines.push({ debitAccount: receivable, creditAccount: driverWallet, amountPaise: agreedPaise, reason: "RIDE_FARE" });
    lines.push({ debitAccount: postpaid, creditAccount: revenue, amountPaise: platformFeePaise, reason: "PLATFORM_FEE" });
  } else {
    // WALLET spends rider balance; UPI/Card draw from gateway clearing (§7.7)
    const fundingSource = paymentMethod === "WALLET" ? riderWallet : clearing;
    lines.push({ debitAccount: fundingSource, creditAccount: driverWallet, amountPaise: agreedPaise, reason: "RIDE_FARE" });
    lines.push({ debitAccount: fundingSource, creditAccount: revenue, amountPaise: platformFeePaise, reason: "PLATFORM_FEE" });
  }

  if (tipPaise > 0) {
    const tipSource = paymentMethod === "CASH" ? receivable : paymentMethod === "WALLET" ? riderWallet : clearing;
    lines.push({ debitAccount: tipSource, creditAccount: driverWallet, amountPaise: tipPaise, reason: "TIP" });
  }
  return lines;
}

export async function walletBalance(sql: SqlRowClient, account: string): Promise<number> {
  const r = await sql.query<{ net: string }>(
    `SELECT
       COALESCE(SUM(CASE WHEN credit_account = $1 THEN amount_paise ELSE 0 END),0)
     - COALESCE(SUM(CASE WHEN debit_account = $1 THEN amount_paise ELSE 0 END),0)
     AS net
     FROM journal_entries`,
    [account],
  );
  return Number(r.rows[0]?.net ?? 0);
}
