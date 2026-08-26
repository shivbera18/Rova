/** Domain row types — mirror plan §6.2 DDL. Money columns are integer paise. */
export interface UserRow {
  id: string;
  phone_bidx: string; // HMAC blind index — the only lookup path
  full_name: string;
  role: "RIDER" | "DRIVER";
  status: "ACTIVE" | "BLOCKED" | "DELETED";
  rating_rolling: number | null;
  created_at: Date;
}

export interface DriverProfileRow {
  user_id: string;
  vehicle_class: string;
  plate: string;
  kyc_status: "PENDING_DOCS" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  online: boolean;
  on_trip: boolean;
  last_lat: number | null;
  last_lng: number | null;
  accept_count: number;
  decline_count: number;
}

export interface FareCardRow {
  id: string;
  city_id: number;
  vehicle_class: string;
  base_paise: number;
  per_km_paise: number;
  per_min_paise: number;
  min_fare_paise: number;
  platform_fee_pct: string; // numeric arrives as string from pg
  platform_fee_min_paise: number;
  platform_fee_cap_paise: number;
  night_multiplier: string;
}

export type NegotiationStateDb =
  | "BROADCASTING"
  | "COUNTERED_DRIVER"
  | "COUNTERED_RIDER"
  | "AGREED"
  | "EXPIRED"
  | "DECLINED"
  | "CANCELLED";

export interface NegotiationRow {
  id: string;
  request_id: string;
  rider_id: string;
  city_id: number;
  vehicle_class: string;
  state: NegotiationStateDb;
  round: number;
  current_offer: number; // paise
  offered_by: "RIDER" | "DRIVER";
  list_price: number;
  platform_fee: number | null;
  expires_at: Date;
  version: number;
}

export interface RequestRow {
  id: string;
  rider_id: string;
  city_id: number;
  vehicle_class: string;
  mode: "LIST" | "NEGOTIATED";
  state: "MATCHING" | "NEGOTIATING" | "AGREED" | "EXPIRED" | "DECLINED" | "CANCELLED";
  payment_method: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  list_price: number;
  created_at: Date;
  version: number;
}

export interface TripRow {
  id: string;
  request_id: string;
  rider_id: string;
  driver_id: string;
  city_id: number;
  vehicle_class: string;
  state:
    | "DRIVER_ASSIGNED"
    | "ARRIVING"
    | "ARRIVED"
    | "ONGOING"
    | "COMPLETED"
    | "CANCELLED_RIDER"
    | "CANCELLED_DRIVER";
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  otp_hash: string;
  fare_json: string;
  started_at: Date | null;
  ended_at: Date | null;
  version: number;
  payment_method?: "WALLET" | "UPI" | "CASH";
  /** joined from ride_requests for display */
  pickup_label?: string | null;
  drop_label?: string | null;
  /** joined rider display name */
  rider_name?: string | null;
  /** joined start-code window */
  otp_expires_at?: Date | null;
  otp_attempts?: number | null;
  /** db-computed remaining window in ms (never derived from the app clock) */
  otp_expires_in_ms?: string | number | null;
  /** minted on demand for live journey sharing */
  share_token?: string | null;
}

export type LedgerReason =
  | "RIDE_FARE"
  | "PLATFORM_FEE"
  | "CASH_RIDER_RECEIVABLE"
  | "TOPUP"
  | "PAYOUT"
  | "REFUND"
  | "TIP"
  | "INCENTIVE"
  | "GOODWILL";

export interface JournalRow {
  id: number;
  txn_id: string;
  debit_account: string;
  credit_account: string;
  amount_paise: number;
  reason: LedgerReason;
  trip_id: string | null;
  idempotency_key: string | null;
  created_at: Date;
}
