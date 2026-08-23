import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canTransition, DEFAULT_NEGOTIATION_RULES, LEGAL_TRIP_TRANSITIONS } from "./index.ts";

describe("negotiation FSM", () => {
  it("happy path: broadcast → accept → agreed", () => {
    assert.equal(canTransition("BROADCASTING", "DRIVER_ACCEPT"), "AGREED");
    assert.equal(canTransition("BROADCASTING", "DRIVER_COUNTER"), "COUNTERED_DRIVER");
  });
  it("counter dance: driver counter → rider final → driver accept", () => {
    assert.equal(canTransition("COUNTERED_DRIVER", "RIDER_FINAL"), "COUNTERED_RIDER");
    assert.equal(canTransition("COUNTERED_RIDER", "DRIVER_ACCEPT"), "AGREED");
  });
  it("illegal moves rejected", () => {
    assert.equal(canTransition("AGREED", "DRIVER_COUNTER"), null);
    assert.equal(canTransition("EXPIRED", "DRIVER_ACCEPT"), null);
    assert.equal(canTransition("CANCELLED", "RIDER_FINAL"), null);
    assert.equal(canTransition("BROADCASTING", "RIDER_FINAL"), null);
  });
  it("terminal states are terminal", () => {
    for (const s of ["AGREED", "EXPIRED", "DECLINED", "CANCELLED"] as const) {
      for (const a of ["DRIVER_ACCEPT", "DRIVER_COUNTER", "RIDER_ACCEPT", "RIDER_FINAL", "RIDER_DECLINE", "RIDER_CANCEL", "EXPIRE"]) {
        assert.equal(canTransition(s, a), null);
      }
    }
  });
});

describe("trip FSM", () => {
  it("no resurrection from COMPLETED/CANCELLED", () => {
    assert.deepEqual(LEGAL_TRIP_TRANSITIONS.COMPLETED, []);
    assert.deepEqual(LEGAL_TRIP_TRANSITIONS.CANCELLED_RIDER, []);
    assert.deepEqual(LEGAL_TRIP_TRANSITIONS.CANCELLED_DRIVER, []);
  });
  it("ongoing can only complete", () => {
    assert.deepEqual(LEGAL_TRIP_TRANSITIONS.ONGOING, ["COMPLETED"]);
  });
});
