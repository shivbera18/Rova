/** v1 follow-ups found during web-console integration. */
export const MIGRATIONS_INTEGRATION = [
  {
    id: "0004_request_platform_fee",
    sql: `
    ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS platform_fee bigint;
    ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS otp_plain varchar(6);
    `,
  },
];
