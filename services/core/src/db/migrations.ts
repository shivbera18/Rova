/**
 * Schema DDL — plan §6.2, trimmed to v1 web scope (no PostGIS: plain lat/lng + haversine;
 * upgrade path stays in the plan). Idempotent; safe to run repeatedly.
 */
export const MIGRATIONS = [
  {
    id: "0001_init",
    sql: `
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      phone_bidx text UNIQUE NOT NULL,
      full_name text NOT NULL,
      role text NOT NULL CHECK (role IN ('RIDER','DRIVER')),
      status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','BLOCKED','DELETED')),
      rating_rolling numeric(3,2),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS driver_profiles (
      user_id uuid PRIMARY KEY REFERENCES users(id),
      vehicle_class text NOT NULL,
      plate text NOT NULL,
      kyc_status text NOT NULL DEFAULT 'PENDING_DOCS'
        CHECK (kyc_status IN ('PENDING_DOCS','IN_REVIEW','APPROVED','REJECTED')),
      online boolean NOT NULL DEFAULT false,
      on_trip boolean NOT NULL DEFAULT false,
      last_lat double precision,
      last_lng double precision,
      accept_count integer NOT NULL DEFAULT 0,
      decline_count integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_drivers_online ON driver_profiles (vehicle_class) WHERE online;

    CREATE TABLE IF NOT EXISTS fare_cards (
      id uuid PRIMARY KEY,
      city_id smallint NOT NULL,
      vehicle_class text NOT NULL,
      base_paise bigint NOT NULL,
      per_km_paise bigint NOT NULL,
      per_min_paise bigint NOT NULL,
      min_fare_paise bigint NOT NULL,
      platform_fee_pct numeric(6,4) NOT NULL,
      platform_fee_min_paise bigint NOT NULL,
      platform_fee_cap_paise bigint NOT NULL,
      night_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
      UNIQUE (city_id, vehicle_class)
    );

    CREATE TABLE IF NOT EXISTS negotiation_rules (
      city_id smallint PRIMARY KEY,
      max_rounds smallint NOT NULL DEFAULT 3,
      soft_floor_ratio numeric(4,2) NOT NULL DEFAULT 0.6,
      hard_floor_paise bigint NOT NULL DEFAULT 0,
      cash_offer_cap_paise bigint NOT NULL DEFAULT 50000
    );

    CREATE TABLE IF NOT EXISTS ride_requests (
      id uuid PRIMARY KEY,
      rider_id uuid NOT NULL REFERENCES users(id),
      city_id smallint NOT NULL,
      vehicle_class text NOT NULL,
      mode text NOT NULL CHECK (mode IN ('LIST','NEGOTIATED')),
      state text NOT NULL CHECK (state IN ('MATCHING','NEGOTIATING','AGREED','EXPIRED','DECLINED','CANCELLED')),
      payment_method text NOT NULL CHECK (payment_method IN ('WALLET','UPI','CASH')),
      pickup_lat double precision NOT NULL,
      pickup_lng double precision NOT NULL,
      drop_lat double precision NOT NULL,
      drop_lng double precision NOT NULL,
      list_price bigint NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_requests_rider ON ride_requests (rider_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS negotiations (
      id uuid PRIMARY KEY,
      request_id uuid NOT NULL REFERENCES ride_requests(id),
      rider_id uuid NOT NULL REFERENCES users(id),
      city_id smallint NOT NULL,
      vehicle_class text NOT NULL,
      state text NOT NULL CHECK (state IN ('BROADCASTING','COUNTERED_DRIVER','COUNTERED_RIDER','AGREED','EXPIRED','DECLINED','CANCELLED')),
      round smallint NOT NULL DEFAULT 1,
      current_offer bigint NOT NULL,
      offered_by text NOT NULL CHECK (offered_by IN ('RIDER','DRIVER')),
      list_price bigint NOT NULL,
      platform_fee bigint,
      expires_at timestamptz NOT NULL,
      version integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_negotiations_request ON negotiations (request_id);

    CREATE TABLE IF NOT EXISTS negotiation_events (
      id bigserial PRIMARY KEY,
      negotiation_id uuid NOT NULL REFERENCES negotiations(id),
      actor text NOT NULL,
      action text NOT NULL,
      amount_paise bigint,
      round smallint NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS trips (
      id uuid PRIMARY KEY,
      request_id uuid NOT NULL REFERENCES ride_requests(id),
      rider_id uuid NOT NULL REFERENCES users(id),
      driver_id uuid NOT NULL REFERENCES users(id),
      city_id smallint NOT NULL,
      vehicle_class text NOT NULL,
      state text NOT NULL CHECK (state IN ('DRIVER_ASSIGNED','ARRIVING','ARRIVED','ONGOING','COMPLETED','CANCELLED_RIDER','CANCELLED_DRIVER')),
      pickup_lat double precision NOT NULL,
      pickup_lng double precision NOT NULL,
      drop_lat double precision NOT NULL,
      drop_lng double precision NOT NULL,
      otp_hash text NOT NULL,
      fare_json jsonb NOT NULL,
      started_at timestamptz,
      ended_at timestamptz,
      version integer NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips (driver_id, ended_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trips_rider ON trips (rider_id, ended_at DESC);

    -- double-entry ledger: append-only; corrections are new balanced entries
    CREATE TABLE IF NOT EXISTS journal_entries (
      id bigserial PRIMARY KEY,
      txn_id uuid NOT NULL,
      debit_account text NOT NULL,
      credit_account text NOT NULL,
      amount_paise bigint NOT NULL CHECK (amount_paise > 0),
      reason text NOT NULL,
      trip_id uuid REFERENCES trips(id),
      idempotency_key text UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_journal_debit ON journal_entries (debit_account, created_at);
    CREATE INDEX IF NOT EXISTS idx_journal_credit ON journal_entries (credit_account, created_at);
    CREATE INDEX IF NOT EXISTS idx_journal_trip ON journal_entries (trip_id);

    CREATE TABLE IF NOT EXISTS otp_codes (
      trip_id uuid PRIMARY KEY REFERENCES trips(id),
      code_hash text NOT NULL,
      attempts smallint NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL
    );

    ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS pickup_label text;
    ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS drop_label text;

    -- live journey sharing: opaque per-trip token, minted on demand
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

    CREATE TABLE IF NOT EXISTS safety_contacts (
      user_id uuid NOT NULL REFERENCES users(id),
      name text NOT NULL,
      phone text NOT NULL,
      position smallint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, phone)
    );
    -- CREATE IF NOT EXISTS is a no-op on databases that predate this table's
    -- position column — backfill it the same way as the label columns above.
    ALTER TABLE safety_contacts ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS favorite_drivers (
      rider_id uuid NOT NULL REFERENCES users(id),
      driver_id uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (rider_id, driver_id)
    );

    -- "ride again" requests route to exactly this driver instead of broadcasting
    ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS requested_driver_id uuid REFERENCES users(id);

    -- v1.1: persist per-request expiry and rider platform contribution for LIST mode
    ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS platform_fee bigint;
    ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS expires_at timestamptz;
    CREATE INDEX IF NOT EXISTS idx_requests_expires ON ride_requests (expires_at) WHERE state = 'MATCHING';
    `,
  },
];
