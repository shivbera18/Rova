/**
 * Web Push notifications using the standard Push API and VAPID.
 * Production must set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY so subscriptions survive restarts.
 */
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import type { SqlRowClient } from "./types.ts";
import { logger } from "./logger.ts";

const generated = webpush.generateVAPIDKeys();
const publicKey = process.env.VAPID_PUBLIC_KEY || generated.publicKey;
const privateKey = process.env.VAPID_PRIVATE_KEY || generated.privateKey;
const subject = process.env.VAPID_SUBJECT || "mailto:support@chalox.app";
webpush.setVapidDetails(subject, publicKey, privateKey);

interface StoredSubscription {
  id: string;
  user_id: string;
  subscription_json: unknown;
}

export function vapidPublicKey(): string {
  return publicKey;
}

export async function savePushSubscription(
  sql: SqlRowClient,
  userId: string,
  subscription: webpush.PushSubscription,
): Promise<void> {
  await sql.query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, subscription_json, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (endpoint) DO UPDATE SET user_id=$2, subscription_json=$4, updated_at=now()`,
    [randomUUID(), userId, subscription.endpoint, JSON.stringify(subscription)],
  );
}

export async function removePushSubscription(sql: SqlRowClient, endpoint: string): Promise<void> {
  await sql.query("DELETE FROM push_subscriptions WHERE endpoint=$1", [endpoint]);
}

export async function sendPush(
  sql: SqlRowClient,
  userId: string,
  notification: { title: string; body: string; url?: string; tag?: string },
): Promise<number> {
  const rows = await sql.query<StoredSubscription>(
    "SELECT id, user_id, subscription_json FROM push_subscriptions WHERE user_id=$1",
    [userId],
  );
  let sent = 0;
  for (const row of rows.rows) {
    try {
      const subscription =
        typeof row.subscription_json === "string"
          ? (JSON.parse(row.subscription_json) as webpush.PushSubscription)
          : (row.subscription_json as webpush.PushSubscription);
      await webpush.sendNotification(subscription, JSON.stringify(notification), { TTL: 60 });
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await sql.query("DELETE FROM push_subscriptions WHERE id=$1", [row.id]);
      } else {
        logger.warn("PUSH", `Delivery failed user=${userId.slice(0, 8)}`, err);
      }
    }
  }
  return sent;
}
