import { createHash, randomUUID, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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

export class AuthError extends Error {
  public statusCode = 400;
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

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
  const existing = await sql.query<{ id: string; role: Role }>("SELECT id, role FROM users WHERE phone_bidx = $1", [
    bidx,
  ]);
  if (existing.rows.length > 0) {
    const row = existing.rows[0]!;
    if (row.role !== role) {
      throw new AuthError("ROLE_MISMATCH", `Phone number is already registered as a ${row.role.toLowerCase()}`);
    }
    await sql.query("UPDATE users SET full_name = $2 WHERE id = $1", [row.id, fullName]);
    return { id: row.id };
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


/**
 * Password login per plan §7.1 (web-first variant):
 *  - First call for a phone REGISTERS the password (scrypt hash).
 *  - Subsequent calls VERIFY it.
 * Hash stored in users.password_hash: scrypt$<saltHex>$<hashHex>
 */
export async function upsertUserWithPassword(
  sql: SqlRowClient,
  phone: string,
  role: Role,
  password: string,
): Promise<{ id: string; isNew: boolean }> {
  const bidx = phoneBlindIndex(phone);
  const existing = await sql.query<{ id: string; role: Role; password_hash: string | null }>(
    "SELECT id, role, password_hash FROM users WHERE phone_bidx = $1",
    [bidx],
  );
  if (existing.rows.length === 0) {
    const created = await upsertUser(sql, phone, role, "Chalo user");
    const { saltHex, hashHex } = hashPassword(password);
    await sql.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      created.id,
      `scrypt$${saltHex}$${hashHex}`,
    ]);
    return { id: created.id, isNew: true };
  }
  const row = existing.rows[0]!;
  if (row.role !== role) {
    throw new AuthError("ROLE_MISMATCH", `Phone number is already registered as a ${row.role.toLowerCase()}`);
  }
  if (!row.password_hash) {
    // account exists via OTP but has no password yet — register this one
    const { saltHex, hashHex } = hashPassword(password);
    await sql.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      row.id,
      `scrypt$${saltHex}$${hashHex}`,
    ]);
    return { id: row.id, isNew: true };
  }
  if (!verifyPassword(password, row.password_hash)) {
    throw new AuthError("BAD_PASSWORD", "Incorrect password for this phone number");
  }
  return { id: row.id, isNew: false };
}

function hashPassword(password: string): { saltHex: string; hashHex: string } {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return { saltHex: salt.toString("hex"), hashHex: hash.toString("hex") };
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1]!, "hex");
    const expected = Buffer.from(parts[2]!, "hex");
    const actual = scryptSync(password, salt, 32);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}