/** v1 follow-ups found during web-console integration. */
export const MIGRATIONS_INTEGRATION = [
  {
    id: "0004_request_platform_fee",
    sql: `
    ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS platform_fee bigint;
    `,
  },
  {
    id: "0005_user_password_hash",
    sql: `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
    `,
  },
  {
    id: "0006_push_subscriptions",
    sql: `
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint text UNIQUE NOT NULL,
      subscription_json jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id);
    `,
  },
];
