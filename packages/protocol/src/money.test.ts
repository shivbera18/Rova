import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { platformFee, paisa, rupees, negotiatedQuote, distanceKm } from "./index.ts";

describe("money", () => {
  it("platform fee clamps to min and cap", () => {
    // 10% fee, min ₹2, cap ₹50 (in paise)
    const fee = (offer: number) => platformFee(paisa(offer), 0.10, paisa(200), paisa(5000));
    assert.equal(fee(8600), 860);        // 10% of ₹86
    assert.equal(fee(1000), 200);        // clamped up to min ₹2
    assert.equal(fee(90000), 5000);      // clamped down to cap ₹50
    assert.equal(platformFee(paisa(0), 0.1, paisa(200), paisa(5000)), 200); // min fee even on ₹0 offer
  });

  it("negotiated quote: driver take-home == offer, rider pays offer + fee", () => {
    const list = {
      listPrice: rupees(86),
      tripFare: rupees(76),
      platformFee: rupees(10),
      surgeMultiplier: 1,
    };
    const q = negotiatedQuote(rupees(60), list);
    assert.equal(q.driverTakeHome, rupees(60));
    assert.equal(q.riderTotal, rupees(70));
    // ₹0 offer still carries the min platform fee — the explainer's promise
    const zero = negotiatedQuote(paisa(0), list);
    assert.equal(zero.driverTakeHome, 0);
    assert.equal(zero.platformFee, rupees(10));
  });

  it("haversine sanity", () => {
    // Bengaluru MG Road ↔ Indiranagar ≈ 3.4 km
    const d = distanceKm({ lat: 12.9757, lng: 77.6068 }, { lat: 12.9784, lng: 77.6408 });
    assert.ok(d > 2.5 && d < 4.5, `got ${d}`);
  });
});
