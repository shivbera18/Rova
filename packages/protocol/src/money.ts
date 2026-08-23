/**
 * Money is always integer paise (₹1 = 100). Never floats.
 * All amounts crossing a module boundary use this brand so paise/rupee mixups are type errors.
 */
export type Paise = number & { readonly __paise: unique symbol };
export const paisa = (n: number): Paise => n as Paise;
export const rupees = (r: number): Paise => Math.round(r * 100) as Paise;
export const toRupees = (p: Paise): number => p / 100;

/** Platform fee = clamp(offer × pct, min, cap) — RIDER-side, charged on top of the offer. */
export function platformFee(
  offer: Paise,
  feePct: number,
  feeMin: Paise,
  feeCap: Paise,
): Paise {
  const raw = Math.round(offer * feePct);
  return Math.min(Math.max(raw, feeMin), feeCap) as Paise;
}

export interface FareQuote {
  listPrice: Paise;          // suggested total the rider would pay at list
  tripFare: Paise;           // list minus platform fee — what a driver would earn at list
  platformFee: Paise;        // rider-side, shown with ℹ️ explainer
  surgeMultiplier: number;
}

/** quote for a negotiated offer: rider pays offer + fee; driver takes offer. */
export function negotiatedQuote(
  offer: Paise,
  listQuote: FareQuote,
): { riderTotal: Paise; driverTakeHome: Paise; platformFee: Paise } {
  const fee =
    listQuote.platformFee > 0
      ? platformFee(offer, listQuote.platformFee / Math.max(listQuote.tripFare, 1), listQuote.platformFee, listQuote.platformFee)
      : 0 as Paise;
  return {
    riderTotal: (offer + fee) as Paise,
    driverTakeHome: offer,
    platformFee: fee,
  };
}

export const formatINR = (p: Paise): string =>
  `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
