import type {
  AuthSession,
  DriverOfferPayload,
  DriverWsMessage,
  TripView,
} from "@chalo/protocol";

const TOKEN_KEY = "cx.driver.token";
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? (method === "GET" ? undefined : "{}") : JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json as { code?: string; message?: string };
    if (res.status === 401 || (res.status === 403 && e.code === "FORBIDDEN")) {
      clearToken();
      window.dispatchEvent(new Event("storage"));
    }
    throw new ApiError(res.status, e.code ?? "INTERNAL", e.message ?? res.statusText);
  }
  return json as T;
}

export const api = {
  sendOtp: (phone: string) =>
    call<{ sent: boolean; devHint?: string }>("/v1/auth/otp/send", "POST", { phone }),
  verifyOtp: (phone: string, otp: string, vehicleClass: string, newPassword?: string) =>
    call<AuthSession>("/v1/auth/otp/verify", "POST", { phone, otp, role: "DRIVER", vehicleClass, ...(newPassword ? { newPassword } : {}) }),
  passwordLogin: (phone: string, password: string, role: "DRIVER" | "RIDER", vehicleClass: string) =>
    call<AuthSession>("/v1/auth/login/password", "POST", { phone, password, role, vehicleClass }),
  driverMe: () =>
    call<{
      profile: { vehicle_class: string; plate: string; kyc_status: string; online: boolean } | null;
      rating: number;
      walletBalancePaise: number;
      completedTrips: number;
      todayEarningsPaise: number;
      weekEarningsPaise: number;
      cashEarningsPaise: number;
      digitalEarningsPaise: number;
    }>("/v1/driver/me", "GET"),
  payout: (amountPaise: number) =>
    call<{ balancePaise: number; txnId: string }>("/v1/driver/payout", "POST", { amountPaise }),
  submitOnboarding: (plate: string) =>
    call<{ status: string }>("/v1/driver/onboarding", "POST", { plate }),
  devApproveOnboarding: () =>
    call<{ status: string }>("/v1/driver/onboarding/dev-approve", "POST"),
  acceptRequest: (id: string) =>
    call<{ tripId: string }>(`/v1/requests/${id}/accept`, "POST"),
  acceptNegotiation: (id: string) =>
    call<{ tripId: string }>(`/v1/negotiations/${id}/accept`, "POST"),
  counterNegotiation: (id: string, paise: number) =>
    call<{ state: string; round: number }>(`/v1/negotiations/${id}/counter`, "POST", { paise }),
  updateStatus: (body: { online?: boolean; vehicleClass?: string; lat?: number; lng?: number }) =>
    call<{ profile: any }>("/v1/driver/status", "POST", body),
  trip: (id: string) => call<TripView>(`/v1/trips/${id}`, "GET"),
  trips: () => call<{ trips: TripView[] }>("/v1/trips", "GET"),
  tripState: (id: string, to: "ARRIVING" | "ARRIVED") =>
    call<{ state: string }>(`/v1/trips/${id}/state`, "POST", { to }),
  startTrip: (id: string, otp: string) =>
    call<{ state: string }>(`/v1/trips/${id}/start`, "POST", { otp }),
  completeTrip: (id: string, tipPaise: number) =>
    call<{ state: string; txnId: string }>(`/v1/trips/${id}/complete`, "POST", { tipPaise }),
};

/** Raw WebSocket to /ws/driver with auto-reconnect. */
export interface DriverSocket {
  send(msg: unknown): void;
  readonly readyState: number;
  close(): void;
}

export function connectDriverSocket(
  token: string,
  onMessage: (msg: DriverWsMessage) => void,
  onStatus: (connected: boolean, closeCode?: number) => void,
): DriverSocket {
  let closed = false;
  let ws: WebSocket | null = null;

  const sock: DriverSocket = {
    send: (msg) => ws?.send(JSON.stringify(msg)),
    get readyState() { return ws?.readyState ?? WebSocket.CLOSED; },
    close: () => { closed = true; ws?.close(); },
  };

  const open = async (): Promise<void> => {
    if (closed) return;
    try {
      const response = await fetch("/v1/ws/ticket", { method: "POST", headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("ticket failed");
      const { ticket } = (await response.json()) as { ticket: string };
      if (closed) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/ws/driver?ticket=${encodeURIComponent(ticket)}`);
      ws.onopen = () => onStatus(true);
      ws.onclose = (event) => {
        // surface close codes so the UI can explain permanent locks (4009)
        onStatus(false, event.code);
        if (!closed && event.code !== 4009) setTimeout(() => void open(), 2000);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (event) => { try { onMessage(JSON.parse(event.data as string) as DriverWsMessage); } catch {} };
    } catch {
      onStatus(false);
      if (!closed) setTimeout(() => void open(), 2000);
    }
  };

  void open();
  return sock;
}
export type Offer = DriverOfferPayload;
