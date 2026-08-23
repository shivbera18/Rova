import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@chalo/protocol";
import type { SqlRowClient } from "./types.ts";

/**
 * Phone-OTP auth per plan §7.1 — dev mode: OTP is always "123456" (MSG91 adapter slot
 * documented in plan §5). Blind index = HMAC(phone) so lookups never scan plaintext.
 * Tokens: JWT 12h. Refresh rotation lands with the ops-lite page (§3.3).
 */

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-only-secret-rotate-in-prod");
const bidxKey = createHash("sha256").update(process.env.JWT_SECRET ?? "dev-only-secret-rotate-in-prod").digest();

export const DEV_OTP = "123456";

export function phoneBlindIndex(phone: string): string {
  return createHash("sha256").update(bidxKey).update(phone).digest("hex");
}

export interface Session {
  userId: string;
  role: Role;
}

export async function issueToken(userId: string, role: Role): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;
    if (payload.role !== "RIDER" && payload.role !== "DRIVER") return null;
    return { userId: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export async function upsertUser(
  sql: SqlRowClient,
  phone: string,
  role: Role,
  fullName: string,
): Promise<{ id: string }> {
  const bidx = phoneBlindIndex(phone);
  const existing = await sql.query<{ id: string }>("SELECT id FROM users WHERE phone_bidx = $1", [bidx]);
  if (existing.rows.length > 0) {
    const row = existing.rows[0]!;
    await sql.query("UPDATE users SET full_name = $2 WHERE id = $1", [row.id, fullName]);
    return row;
  }
  const id = randomUUID();
  await sql.query("INSERT INTO users (id, phone_bidx, full_name, role) VALUES ($1,$2,$3,$4)", [
    id,
    bidx,
    fullName,
    role,
  ]);
  return { id };
}
