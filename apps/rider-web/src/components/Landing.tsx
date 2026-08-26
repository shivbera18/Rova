import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Bike,
  Car,
  CarFront,
  CarTaxiFront,
  KeyRound,
  MapPin,
  Menu,
  Rocket,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { NeoButton, NeoCard, NeoBadge, NeoAccordion, NeoMarquee } from "./NeoComponents";

export function Landing({
  audience,
  onGetStarted,
  onSwitchPortal,
}: {
  audience: "RIDER" | "DRIVER";
  onGetStarted: () => void;
  onSwitchPortal?: () => void;
}): React.ReactElement {
  const isRider = audience === "RIDER";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [calcOffer, setCalcOffer] = useState(60);

  const calcPlatformFee = Math.max(5, Math.min(40, Math.round(calcOffer * 0.1)));
  const calcTotal = calcOffer + calcPlatformFee;

  const FAQ_ITEMS = [
    {
      id: "faq-1",
      title: "Can I really negotiate my ride price down to ₹0?",
      content: (
        <p>
          Yes! Chalo-X allows riders to enter any offer amount including ₹0 during promotional periods or special deals.
          Drivers see the exact take-home amount and choose whether to accept.
        </p>
      ),
    },
    {
      id: "faq-2",
      title: "How do driver payouts and commissions work?",
      content: (
        <p>
          Drivers take home 100% of the agreed negotiated fare. The platform fee is billed separately to the rider and
          visible upfront. There are no hidden commission deductions from driver earnings.
        </p>
      ),
    },
    {
      id: "faq-3",
      title: "What happens if no driver accepts my initial offer?",
      content: (
        <p>
          If nearby drivers feel the offer is low, they can counter-bid with their own price. You can accept their
          counter, make a final adjustment, or switch to standard instant booking.
        </p>
      ),
    },
    {
      id: "faq-4",
      title: "Are the vehicles and drivers verified?",
      content: (
        <p>
          Yes, every driver partner goes through document verification including driving license, vehicle registration,
          and active background checks before receiving dispatch offers.
        </p>
      ),
    },
    {
      id: "faq-5",
      title: "What payment methods are supported?",
      content: (
        <p>
          Chalo-X supports UPI, digital wallet balance, card payments, and direct cash-to-driver handoffs.
        </p>
      ),
    },
  ];

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--paper)", display: "flex", flexDirection: "column" }}>
      {/* ============ TOPBAR ============ */}
      <header
        style={{
          padding: "12px 20px",
          background: "#ffffff",
          borderBottom: "var(--brut-border)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div className="spread" style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
          <div className="row" style={{ gap: 10 }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              CHALO<span className="brand-accent" style={{ display: "inline-block", background: "var(--primary)", color: "#fff", padding: "1px 6px", borderRadius: "var(--radius-xs)", border: "var(--brut-border-thin)", boxShadow: "var(--shadow-xs)", transform: "none", fontSize: 18, lineHeight: "1.2" }}>-X</span>
            </span>
            <NeoBadge variant="primary">
              {isRider ? "RIDER PORTAL" : "DRIVER PARTNER"}
            </NeoBadge>
          </div>

          {/* Desktop Nav */}
          <div className="row desktop-nav" style={{ gap: 10 }}>
            <a href="#how" className="brut-btn brut-btn-white brut-btn-sm" style={{ boxShadow: "none" }}>
              How it works
            </a>
            <a href="#calculator" className="brut-btn brut-btn-white brut-btn-sm" style={{ boxShadow: "none" }}>
              Fair Calculator
            </a>
            <a href="#safety" className="brut-btn brut-btn-white brut-btn-sm" style={{ boxShadow: "none" }}>
              Safety & OTP
            </a>
            <a href="#faq" className="brut-btn brut-btn-white brut-btn-sm" style={{ boxShadow: "none" }}>
              FAQ
            </a>
            {onSwitchPortal && (
              <NeoButton
                variant="white"
                size="sm"
                onClick={onSwitchPortal}
              >
                {isRider
                  ? <><Bike size={14} /> Driver Portal</>
                  : <><CarFront size={14} /> Rider Portal</>}
              </NeoButton>
            )}
            <NeoButton
              variant="primary"
              size="sm"
              onClick={onGetStarted}
            >
              {isRider ? "Book a Ride" : "Driver Login"}
            </NeoButton>
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="brut-btn brut-btn-white brut-btn-sm mobile-only"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={15} /> : <Menu size={15} />}
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div
            className="mobile-only"
            style={{
              paddingTop: 12,
              marginTop: 12,
              borderTop: "var(--brut-border-thin)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <a href="#how" className="brut-btn brut-btn-white brut-btn-full" onClick={() => setMobileMenuOpen(false)}>
              How it works
            </a>
            <a href="#calculator" className="brut-btn brut-btn-white brut-btn-full" onClick={() => setMobileMenuOpen(false)}>
              Fair Calculator
            </a>
            <a href="#safety" className="brut-btn brut-btn-white brut-btn-full" onClick={() => setMobileMenuOpen(false)}>
              Safety & OTP
            </a>
            <a href="#faq" className="brut-btn brut-btn-white brut-btn-full" onClick={() => setMobileMenuOpen(false)}>
              FAQ
            </a>
            {onSwitchPortal && (
              <NeoButton
                variant="white"
                fullWidth
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSwitchPortal();
                }}
              >
                {isRider
                  ? <><Bike size={14} /> Driver Portal</>
                  : <><CarFront size={14} /> Rider Portal</>}
              </NeoButton>
            )}
            <NeoButton
              variant="primary"
              fullWidth
              onClick={() => {
                setMobileMenuOpen(false);
                onGetStarted();
              }}
            >
              {isRider ? "Book a Ride" : "Driver Login"}
            </NeoButton>
          </div>
        )}
      </header>

      {/* ============ PRE-BUILT NEOMARQUEE ============ */}
      <NeoMarquee
        items={[
          "You set the price",
          "Transparent Platform Fee",
          "Drivers keep 100% of deal",
          "Bikes · Autos · Cabs",
          "Zero Surge Pricing",
        ]}
      />

      {/* ============ HERO SECTION ============ */}
      <section
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 40,
          flexWrap: "wrap",
          padding: "60px 24px 48px",
          maxWidth: 1200,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div style={{ flex: "1 1 480px", maxWidth: 640 }}>
          <NeoBadge variant="primary" style={{ marginBottom: 18, display: "inline-flex" }}>
            <Sparkles size={13} /> India's Open Fair-Price Ride Marketplace
          </NeoBadge>

          <h1 style={{ fontSize: "clamp(38px, 5.5vw, 64px)", lineHeight: 1.05, margin: "14px 0 20px" }}>
            You Name <br />
            <span
              style={{
                display: "inline-block",
                background: "var(--primary)",
                color: "#ffffff",
                padding: "2px 14px",
                border: "var(--brut-border)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow-md)",
                marginRight: 8,
              }}
            >
              The Price.
            </span>
            Drivers Decide.
          </h1>

          <p style={{ fontSize: 16.5, maxWidth: 540, fontWeight: 500, color: "var(--ink-soft)", marginBottom: 30, lineHeight: 1.6 }}>
            Say goodbye to algorithmic surge price spikes. Choose what you want to pay, see our tiny upfront platform fee, and negotiate directly with nearby verified drivers in real time.
          </p>

          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <NeoButton
              variant="primary"
              size="lg"
              onClick={onGetStarted}
              style={{ boxShadow: "var(--shadow-md)" }}
            >
              <Rocket size={16} /> Book Your Ride Now
            </NeoButton>
            <a
              href="#calculator"
              className="brut-btn brut-btn-white"
              style={{ fontSize: 15, padding: "13px 22px" }}
            >
              Try Fair Calculator <ArrowDown size={15} />
            </a>
          </div>

          <div className="row" style={{ gap: 8, marginTop: 32, flexWrap: "wrap" }}>
            <NeoBadge><Bike size={12} /> Bike Quick Rides</NeoBadge>
            <NeoBadge><CarTaxiFront size={12} /> Auto Rickshaws</NeoBadge>
            <NeoBadge><Car size={12} /> Prime Cabs</NeoBadge>
            <NeoBadge variant="green"><ShieldCheck size={12} /> Start OTP Verified</NeoBadge>
          </div>
        </div>

        {/* Hero Visual NeoCard */}
        <div style={{ flex: "0 1 360px", width: "100%", margin: "0 auto" }}>
          <NeoCard elevation="lg" style={{ padding: 24, borderRadius: "var(--radius-lg)" }}>
            <div className="spread" style={{ marginBottom: 14 }}>
              <NeoBadge variant="green">LIVE TRIP BIDDING</NeoBadge>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-muted)" }}>BENGALURU</span>
            </div>

            <NeoCard variant="primary" elevation="none" style={{ padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Rider's Offer
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 900, color: "var(--ink)" }}>
                ₹65 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>+ ₹10 fee</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                Route: Koramangala → Indiranagar · 4.8 km
              </div>
            </NeoCard>

            <div className="col" style={{ gap: 8 }}>
              {[
                { icon: Bike, name: "Bike Taxi", eta: "3 min away", bid: "₹65 (Accepted)", badgeVariant: "green" as const },
                { icon: CarTaxiFront, name: "Auto Meter", eta: "5 min away", bid: "Counter: ₹75", badgeVariant: "primary" as const },
                { icon: Car, name: "Prime Cab", eta: "6 min away", bid: "Counter: ₹90", badgeVariant: "primary" as const },
              ].map((item) => {
                const BidIcon = item.icon;
                return (
                  <div
                    key={item.name}
                    className="spread"
                    style={{
                      padding: "10px 12px",
                      border: "var(--brut-border-thin)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--paper-subtle)",
                    }}
                  >
                    <div className="row" style={{ gap: 8 }}>
                      <BidIcon size={16} strokeWidth={2.2} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>{item.eta}</div>
                      </div>
                    </div>
                    <NeoBadge variant={item.badgeVariant} style={{ fontSize: 10.5 }}>
                      {item.bid}
                    </NeoBadge>
                  </div>
                );
              })}
            </div>

            <NeoButton
              variant="primary"
              fullWidth
              onClick={onGetStarted}
              style={{ marginTop: 18 }}
            >
              Try Negotiation Flow <ArrowRight size={15} />
            </NeoButton>
          </NeoCard>
        </div>
      </section>

      {/* ============ STATS COUNTER STRIP ============ */}
      <section style={{ background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)", padding: "40px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, textAlign: "center" }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 900, color: "var(--primary)" }}>0%</div>
            <div style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: "var(--ink)", marginTop: 4 }}>Driver Commission Cut</div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>100% of the agreed fare goes to drivers</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 900, color: "var(--green)" }}>0x</div>
            <div style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: "var(--ink)", marginTop: 4 }}>Surge Multipliers</div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>Fares negotiated naturally by supply & demand</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 900, color: "var(--primary)" }}>₹5 - ₹40</div>
            <div style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: "var(--ink)", marginTop: 4 }}>Capped Platform Fee</div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>Transparent, visible fee shown upfront</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 900, color: "var(--pink)" }}>100%</div>
            <div style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: "var(--ink)", marginTop: 4 }}>Verified Start OTP</div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>Every trip locked until rider gives code</div>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" style={{ padding: "64px 24px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <NeoBadge variant="primary" style={{ marginBottom: 10 }}>SIMPLE PRINCIPLES</NeoBadge>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>How Chalo-X Works</h2>
          <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 8, fontSize: 16 }}>
            No black-box algorithms. No mystery commissions. Direct peer-to-peer ride dispatch.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
          {[
            {
              step: "01",
              title: "Pick Route on Map",
              desc: "Enter pickup and drop-off or pin directly on our interactive Leaflet map. See real road distances and time estimates instantly.",
              badge: "LIVE ROUTING",
            },
            {
              step: "02",
              title: "Set Your Own Offer",
              desc: "Propose what you want to pay. Adjust the driver fare and the separate platform contribution. Even ₹0 promo offers are accepted.",
              badge: "FAIR PRICING",
            },
            {
              step: "03",
              title: "Direct Bidding Radar",
              desc: "Nearby drivers receive your offer simultaneously. They can accept immediately or submit a counter offer in real time.",
              badge: "NO SURGE",
            },
            {
              step: "04",
              title: "Verify Secure OTP & Ride",
              desc: "When matched, receive your private start OTP. Hand it to your driver at pickup to safely initiate the ride on the live map.",
              badge: "SECURE SAFETY",
            },
          ].map((card) => (
            <NeoCard
              key={card.step}
              elevation="sm"
              style={{
                padding: 24,
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div className="spread" style={{ marginBottom: 14 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, color: "var(--primary)" }}>
                    {card.step}
                  </span>
                  <NeoBadge variant="primary">{card.badge}</NeoBadge>
                </div>
                <h3 style={{ fontSize: 18, marginBottom: 10 }}>{card.title}</h3>
                <p style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.6 }}>{card.desc}</p>
              </div>
            </NeoCard>
          ))}
        </div>
      </section>

      {/* ============ INTERACTIVE FAIR FARE CALCULATOR ============ */}
      <section id="calculator" style={{ background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)", padding: "64px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <NeoBadge variant="green" style={{ marginBottom: 10 }}>TRANSPARENT BREAKDOWN</NeoBadge>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Interactive Fair Fare Calculator</h2>
            <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
              Drag the slider to see exactly how your money splits between the driver and Chalo-X.
            </p>
          </div>

          <NeoCard
            variant="primary"
            elevation="md"
            style={{
              padding: "32px 24px",
              maxWidth: 680,
              margin: "0 auto",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div className="spread" style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 800, textTransform: "uppercase", fontSize: 13 }}>Driver Take-Home Offer</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, color: "var(--primary)" }}>
                ₹{calcOffer}
              </span>
            </div>

            <input
              type="range"
              min={20}
              max={300}
              step={5}
              value={calcOffer}
              onChange={(e) => setCalcOffer(Number(e.target.value))}
              style={{
                width: "100%",
                height: 10,
                borderRadius: 5,
                background: "#cbd5e1",
                outline: "none",
                cursor: "pointer",
                accentColor: "var(--primary)",
                marginBottom: 24,
              }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <NeoCard elevation="none" style={{ padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--green)", textTransform: "uppercase" }}>Driver Earns (100%)</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                  ₹{calcOffer}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 2 }}>Direct to driver wallet</div>
              </NeoCard>

              <NeoCard elevation="none" style={{ padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--primary)", textTransform: "uppercase" }}>Platform Fee</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                  ₹{calcPlatformFee}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 2 }}>Servers, safety & dispatch</div>
              </NeoCard>
            </div>

            <div className="spread" style={{ padding: "12px 16px", background: "var(--ink)", color: "#ffffff", borderRadius: "var(--radius-sm)" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--secondary)" }}>Total Rider Pays</div>
                <div style={{ fontSize: 12, color: "#cbd5e1" }}>No surprise taxes or surge multipliers</div>
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, color: "#ffffff" }}>
                ₹{calcTotal}
              </div>
            </div>
          </NeoCard>
        </div>
      </section>

      {/* ============ VEHICLE SELECTION SUITE ============ */}
      <section style={{ padding: "64px 24px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <NeoBadge variant="primary" style={{ marginBottom: 10 }}>FLEET OPTIONS</NeoBadge>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Ride Options for Every Journey</h2>
          <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
            From quick solo commutes to comfortable family sedans.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
          {[
            {
              icon: Bike,
              name: "Bike Taxi",
              capacity: "1 Rider",
              desc: "Beat traffic in record time. Perfect for daily quick hops and station drop-offs.",
              tag: "FASTEST",
            },
            {
              icon: CarTaxiFront,
              name: "Auto Rickshaw",
              capacity: "3 Passengers",
              desc: "The iconic Indian city ride with upfront meter pricing and direct driver bidding.",
              tag: "POPULAR",
            },
            {
              icon: Car,
              name: "Mini Cab",
              capacity: "4 Passengers",
              desc: "Air-conditioned hatchbacks for comfortable, rain-safe city travel.",
              tag: "VALUE",
            },
            {
              icon: CarFront,
              name: "Prime Sedan",
              capacity: "4 Passengers",
              desc: "Top-rated drivers and spacious sedans for airport transfers and meetings.",
              tag: "PREMIUM",
            },
          ].map((v) => {
            const VehicleIcon = v.icon;
            return (
              <NeoCard key={v.name} elevation="sm" style={{ padding: 22 }}>
                <div className="spread" style={{ marginBottom: 14 }}>
                  <span style={{ color: "var(--primary)", display: "grid", placeItems: "center", width: 44, height: 44, border: "var(--brut-border-thin)", borderRadius: "var(--radius-sm)", background: "var(--primary-soft)" }}>
                    <VehicleIcon size={26} strokeWidth={2.1} />
                  </span>
                  <NeoBadge variant="primary">{v.tag}</NeoBadge>
                </div>
                <h3 style={{ fontSize: 18, marginBottom: 4 }}>{v.name}</h3>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-muted)", marginBottom: 10 }}>{v.capacity}</div>
                <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>{v.desc}</p>
              </NeoCard>
            );
          })}
        </div>
      </section>

      {/* ============ SAFETY & VERIFICATION ============ */}
      <section id="safety" style={{ background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)", padding: "64px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <NeoBadge variant="green" style={{ marginBottom: 10 }}>SAFETY FIRST</NeoBadge>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Engineered for Total Ride Security</h2>
            <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
              Security features built right into the core dispatch architecture.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
            <NeoCard elevation="sm" style={{ padding: 26 }}>
              <div style={{ color: "var(--primary)", marginBottom: 12 }}><KeyRound size={26} strokeWidth={2.1} /></div>
              <h3 style={{ fontSize: 19, marginBottom: 8 }}>Cryptographic Start OTP</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.6 }}>
                Every ride generates a unique salted PIN. The driver cannot start the meter until the OTP is verified by the core dispatch server.
              </p>
            </NeoCard>

            <NeoCard elevation="sm" style={{ padding: 26 }}>
              <div style={{ color: "var(--primary)", marginBottom: 12 }}><MapPin size={26} strokeWidth={2.1} /></div>
              <h3 style={{ fontSize: 19, marginBottom: 8 }}>Live Telemetry & GPS Tracking</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.6 }}>
                Real-time driver location stream with anti-teleport checks and automated route anomaly detection throughout the journey.
              </p>
            </NeoCard>

            <NeoCard elevation="sm" style={{ padding: 26 }}>
              <div style={{ color: "var(--green)", marginBottom: 12 }}><ShieldCheck size={26} strokeWidth={2.1} /></div>
              <h3 style={{ fontSize: 19, marginBottom: 8 }}>Verified Partner KYC</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.6 }}>
                All drivers register with validated driving licenses, vehicle registration plates, and KYC status approvals before going online.
              </p>
            </NeoCard>
          </div>
        </div>
      </section>

      {/* ============ PRE-BUILT NEOACCORDION FAQ ============ */}
      <section id="faq" style={{ padding: "64px 24px", maxWidth: 860, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <NeoBadge variant="primary" style={{ marginBottom: 10 }}>QUESTIONS & ANSWERS</NeoBadge>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Frequently Asked Questions</h2>
        </div>

        <NeoAccordion items={FAQ_ITEMS} defaultExpandedId="faq-1" />
      </section>

      {/* ============ FINAL CTA BANNER ============ */}
      <section style={{ padding: "0 24px 64px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <NeoCard
          variant="dark"
          elevation="lg"
          style={{
            padding: "48px 32px",
            textAlign: "center",
            borderRadius: "var(--radius-xl)",
          }}
        >
          <NeoBadge variant="green" style={{ marginBottom: 16 }}>READY TO RIDE?</NeoBadge>
          <h2 style={{ fontSize: "clamp(30px, 4.5vw, 48px)", color: "#ffffff", marginBottom: 16 }}>
            Take Control of Your Commute Today.
          </h2>
          <p style={{ fontSize: 16, color: "#cbd5e1", maxWidth: 540, margin: "0 auto 28px", lineHeight: 1.6 }}>
            Join thousands of riders and drivers in Bengaluru experiencing fair, negotiated, transparent mobility.
          </p>
          <div className="row center" style={{ gap: 14, flexWrap: "wrap" }}>
            <NeoButton
              variant="primary"
              size="lg"
              onClick={onGetStarted}
              style={{ padding: "14px 32px", boxShadow: "var(--shadow-md)" }}
            >
              <Rocket size={16} /> Book Your First Ride Now
            </NeoButton>
            {onSwitchPortal && (
              <NeoButton
                variant="white"
                size="lg"
                onClick={onSwitchPortal}
                style={{ padding: "14px 28px" }}
              >
                Drive & Earn 100% <ArrowRight size={16} />
              </NeoButton>
            )}
          </div>
        </NeoCard>
      </section>

      {/* ============ FOOTER ============ */}
      <footer
        style={{
          padding: "32px 24px",
          background: "#ffffff",
          borderTop: "var(--brut-border)",
          marginTop: "auto",
        }}
      >
        <div className="spread" style={{ maxWidth: 1100, margin: "0 auto", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900 }}>
              CHALO<span className="brand-accent">-X</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>
              © {new Date().getFullYear()} Chalo-X Mobility. Open Fair-Price Ride Platform.
            </div>
          </div>

          <div className="row" style={{ gap: 16 }}>
            <a href="#how" className="navlink" style={{ fontSize: 12 }}>How it works</a>
            <a href="#calculator" className="navlink" style={{ fontSize: 12 }}>Calculator</a>
            <a href="#safety" className="navlink" style={{ fontSize: 12 }}>Safety</a>
            <a href="#faq" className="navlink" style={{ fontSize: 12 }}>FAQ</a>
            <NeoButton
              variant="primary"
              size="sm"
              onClick={onGetStarted}
            >
              {isRider ? "Book Now" : "Driver Portal"}
            </NeoButton>
          </div>
        </div>
      </footer>
    </div>
  );
}
