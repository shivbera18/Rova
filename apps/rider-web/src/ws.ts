import { useEffect, useReducer, useRef } from "react";
import type { RiderWsMessage } from "@chalo/protocol";
import { getToken } from "./api";

/** Opens the rider WS (via vite proxy); retries until a token exists, reconnects with backoff. */
export function useRiderSocket(onMessage: (m: RiderWsMessage) => void): void {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let sock: WebSocket | null = null;
    let closed = false;
    let backoff = 1000;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    function connect(): void {
      if (closed) return;
      const token = getToken();
      // login may happen after mount — keep waiting for a token instead of giving up
      if (!token) {
        timerId = setTimeout(connect, 800);
        return;
      }
      const proto = location.protocol === "https:" ? "wss" : "ws";
      sock = new WebSocket(`${proto}://${location.host}/ws/rider?token=${token}`);
      sock.onmessage = (ev) => {
        try {
          handlerRef.current(JSON.parse(ev.data as string) as RiderWsMessage);
        } catch {
          // ignore malformed frames
        }
      };
      sock.onopen = () => {
        backoff = 1000;
      };
      sock.onclose = () => {
        if (closed) return;
        timerId = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 15000);
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(timerId);
      sock?.close();
    };
  }, []);
}

/** Ticking countdown: seconds until ISO timestamp (clamped at 0), re-renders every second. */
export function useCountdown(expiresAt: string | undefined): number | null {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!expiresAt) return;
    const iv = setInterval(force, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000));
}
