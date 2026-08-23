/** Ratings table (plan §7.10) — bidirectional, one per rater per trip. */
export const MIGRATIONS_RATINGS = [
  {
    id: "0003_ratings",
    sql: `
    CREATE TABLE IF NOT EXISTS ratings (
      id uuid PRIMARY KEY,
      trip_id uuid NOT NULL REFERENCES trips(id),
      rater_id uuid NOT NULL,
      ratee_id uuid NOT NULL,
      stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
      comment text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (trip_id, rater_id)
    );
    `,
  },
];
