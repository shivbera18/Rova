/** Shared small types for core internals. */

export interface SqlRowClient {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  tx?<T>(fn: (txSql: SqlRowClient) => Promise<T>): Promise<T>;
}

export interface LatLon {
  lat: number;
  lng: number;
}
