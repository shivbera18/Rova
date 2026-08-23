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
];
