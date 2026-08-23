import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enforceRateLimit, SecurityError, validateDriverGps } from "./security.ts";

describe("rate limiting", () => {
  it("allows requests up to the configured ceiling then returns 429", () => {
    const key = `test:${crypto.randomUUID()}`;
    enforceRateLimit(key, 2, 60_000);
    enforceRateLimit(key, 2, 60_000);
    assert.throws(
      () => enforceRateLimit(key, 2, 60_000),
      (err: unknown) => err instanceof SecurityError && err.statusCode === 429 && err.code === "RATE_LIMITED",
    );
  });
});

describe("GPS fraud controls", () => {
  it("rejects a rapid impossible teleport", () => {
    const driver = `driver:${crypto.randomUUID()}`;
    validateDriverGps(driver, { lat: 12.9352, lng: 77.6245 });
    assert.throws(
      () => validateDriverGps(driver, { lat: 13.1986, lng: 77.7066 }),
      (err: unknown) => err instanceof SecurityError && err.code === "GPS_TELEPORT",
    );
  });

  it("accepts ordinary nearby movement", () => {
    const driver = `driver:${crypto.randomUUID()}`;
    validateDriverGps(driver, { lat: 12.9352, lng: 77.6245 });
    assert.doesNotThrow(() => validateDriverGps(driver, { lat: 12.9354, lng: 77.6247 }));
  });
});
