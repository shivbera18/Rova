/**
 * In-process event bus with a Kafka-shaped interface (publish/subscribe by topic).
 * The plan's Redpanda spine collapses into this for the single-node v1; consumers
 * are already written as `topic → handler` so extraction is a transport swap.
 */
type Handler = (payload: unknown) => void | Promise<void>;

const handlers: Record<string, Handler[]> = {};

export function subscribe(topic: string, handler: Handler): () => void {
  (handlers[topic] ??= []).push(handler);
  return () => {
    handlers[topic] = (handlers[topic] ?? []).filter((h) => h !== handler);
  };
}

export async function publish(topic: string, payload: unknown): Promise<void> {
  for (const h of handlers[topic] ?? []) {
    try {
      await h(payload);
    } catch (err) {
      console.error(`[bus] handler failed on ${topic}`, err);
    }
  }
}

export const TOPICS = {
  negotiationEvent: "nego.events",
  requestExpired: "request.expired",
  tripStateChanged: "trip.state",
  ledgerPosted: "ledger.posted",
} as const;
