import { useEffect, useReducer, useRef, useState } from "react";
import type { RiderWsMessage } from "@chalo/protocol";
import { getToken } from "./api";

export function useRiderSocket(
  onMessage: (m: RiderWsMessage) => void,
  onStatus?: (connected: boolean) => void,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  const statusRef = useRef(onStatus);
  handlerRef.current = onMessage;
  statusRef.current = onStatus;

  useEffect(() => {
    let sock: WebSocket | null = null;
    let closed = false;
    let backoff = 1000;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    async function connect(): Promise<void> {
      if (closed) return;
      const token = getToken();
      if (!token) {
        timerId = setTimeout(() => void connect(), 800);
        return;
      }
      try {
        const response = await fetch("/v1/ws/ticket", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("ticket failed");
        const { ticket } = (await response.json()) as { ticket: string };
        if (closed) return;
        const proto = location.protocol === "https:" ? "wss" : "ws";
        sock = new WebSocket(`${proto}://${location.host}/ws/rider?ticket=${encodeURIComponent(ticket)}`);
        sock.onmessage = (event) => {
          try {
            handlerRef.current(JSON.parse(event.data as string) as RiderWsMessage);
          } catch {}
        };
        sock.onopen = () => {
          backoff = 1000;
          setConnected(true);
          statusRef.current?.(true);
        };
        sock.onclose = () => {
          setConnected(false);
          statusRef.current?.(false);
          if (!closed) timerId = setTimeout(() => void connect(), backoff);
        };
      } catch {
        setConnected(false);
        statusRef.current?.(false);
        if (!closed) timerId = setTimeout(() => void connect(), backoff);
        backoff = Math.min(backoff * 2, 15000);
      }
    }

    void connect();
    return () => {
      closed = true;
      clearTimeout(timerId);
      sock?.close();
    };
  }, []);

  return { connected };
}

export function useCountdown(expiresAt: string | undefined): number | null {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(force, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000)) : null;
}
