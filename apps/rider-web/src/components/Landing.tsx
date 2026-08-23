import { useState } from "react";

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
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [calcOffer, setCalcOffer] = useState(60);

  const calcPlatformFee = Math.max(5, Math.min(40, Math.round(calcOffer * 0.1)));
  const calcTotal = calcOffer + calcPlatformFee;

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
            <span className="brut-badge brut-badge-primary">
              {isRider ? "RIDER PORTAL" : "DRIVER PARTNER"}
            </span>
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
              <button
                type="button"
                onClick={onSwitchPortal}
                className="brut-btn brut-btn-white brut-btn-sm"
              >
                {isRider ? "🛵 Driver Portal" : "🚗 Rider Portal"}
              </button>
            )}
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary brut-btn-sm"
            >
              {isRider ? "Book a Ride" : "Driver Login"}
            </button>
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="brut-btn brut-btn-white brut-btn-sm mobile-only"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? "✕" : "☰"}
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
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSwitchPortal();
                }}
                className="brut-btn brut-btn-white brut-btn-full"
              >
                {isRider ? "🛵 Driver Portal" : "🚗 Rider Portal"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onGetStarted();
              }}
              className="brut-btn brut-btn-primary brut-btn-full"
            >
              {isRider ? "Book a Ride" : "Driver Login"}
            </button>
          </div>
        )}
      </header>

      {/* ============ PROMINENT MARQUEE STRIP ============ */}
      <div
        style={{
          overflow: "hidden",
          background: "var(--ink)",
          color: "#ffffff",
          minHeight: "44px",
          height: "44px",
          display: "flex",
          alignItems: "center",
          borderBottom: "var(--brut-border)",
          position: "relative",
          zIndex: 10,
          whiteSpace: "nowrap",
        }}
      >
        <div
          className="brut-marquee-track"
          style={{
            fontWeight: 800,
            textTransform: "uppercase",
            fontSize: 13,
            letterSpacing: "0.08em",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {[0, 1, 2].map((copy) => (
            <span key={copy} style={{ display: "inline-flex", alignItems: "center", gap: 32, paddingRight: 32 }}>
              <span style={{ color: "#ffffff" }}>⚡ You set the price</span>
              <span style={{ color: "var(--secondary)" }}>★</span>
              <span style={{ color: "#ffffff" }}>Transparent Platform Fee</span>
              <span style={{ color: "var(--secondary)" }}>★</span>
              <span style={{ color: "#ffffff" }}>Drivers keep 100% of deal</span>
              <span style={{ color: "var(--secondary)" }}>★</span>
              <span style={{ color: "#ffffff" }}>Bikes · Autos · Cabs</span>
              <span style={{ color: "var(--secondary)" }}>★</span>
              <span style={{ color: "#ffffff" }}>Zero Surge Pricing</span>
              <span style={{ color: "var(--secondary)" }}>★</span>
            </span>
          ))}
        </div>
      </div>

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
          <span
            className="brut-badge brut-badge-primary"
            style={{ marginBottom: 18, display: "inline-flex" }}
          >
            ✨ India's Open Fair-Price Ride Marketplace
          </span>

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
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary"
              style={{ fontSize: 15, padding: "13px 26px", boxShadow: "var(--shadow-md)" }}
            >
              🚀 Book Your Ride Now
            </button>
            <a
              href="#calculator"
              className="brut-btn brut-btn-white"
              style={{ fontSize: 15, padding: "13px 22px" }}
            >
              Try Fair Calculator ↓
            </a>
          </div>

          <div className="row" style={{ gap: 8, marginTop: 32, flexWrap: "wrap" }}>
            <span className="brut-badge">🏍️ Bike Quick Rides</span>
            <span className="brut-badge">🛺 Auto Rickshaws</span>
            <span className="brut-badge">🚗 Prime Cabs</span>
            <span className="brut-badge">🛡️ Start OTP Verified</span>
          </div>
        </div>

        {/* Hero Visual Card */}
        <div style={{ flex: "0 1 360px", width: "100%", margin: "0 auto" }}>
          <div
            className="brut-card"
            style={{
              padding: 24,
              boxShadow: "var(--shadow-lg)",
              background: "#ffffff",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div className="spread" style={{ marginBottom: 14 }}>
              <span className="brut-badge brut-badge-green">● LIVE TRIP BIDDING</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-muted)" }}>BENGALURU</span>
            </div>

            <div
              className="brut-card brut-card-primary"
              style={{ padding: 16, marginBottom: 14 }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Rider's Offer
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 900, color: "var(--ink)" }}>
                ₹65 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>+ ₹10 fee</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                Route: Koramangala ➔ Indiranagar · 4.8 km
              </div>
            </div>

            <div className="col" style={{ gap: 8 }}>
              {[
                { type: "🏍️ Bike Taxi", eta: "3 min away", bid: "₹65 (Accepted)", badge: "brut-badge-green" },
                { type: "🛺 Auto Meter", eta: "5 min away", bid: "Counter: ₹75", badge: "brut-badge-primary" },
                { type: "🚗 Prime Cab", eta: "6 min away", bid: "Counter: ₹90", badge: "brut-badge-primary" },
              ].map((item) => (
                <div
                  key={item.type}
                  className="spread"
                  style={{
                    padding: "10px 12px",
                    border: "var(--brut-border-thin)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--paper-subtle)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{item.type}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>{item.eta}</div>
                  </div>
                  <span className={`brut-badge ${item.badge}`} style={{ fontSize: 10.5 }}>
                    {item.bid}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary brut-btn-full"
              style={{ marginTop: 18 }}
            >
              Try Negotiation Flow →
            </button>
          </div>
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
          <span className="brut-badge brut-badge-primary" style={{ marginBottom: 10 }}>SIMPLE PRINCIPLES</span>
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
            <div
              key={card.step}
              className="brut-card"
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
                  <span className="brut-badge brut-badge-primary">{card.badge}</span>
                </div>
                <h3 style={{ fontSize: 18, marginBottom: 10 }}>{card.title}</h3>
                <p style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.6 }}>{card.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ INTERACTIVE FAIR FARE CALCULATOR ============ */}
      <section id="calculator" style={{ background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)", padding: "64px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <span className="brut-badge brut-badge-green" style={{ marginBottom: 10 }}>TRANSPARENT BREAKDOWN</span>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Interactive Fair Fare Calculator</h2>
            <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
              Drag the slider to see exactly how your money splits between the driver and Chalo-X.
            </p>
          </div>

          <div
            className="brut-card brut-card-primary"
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
              <div className="brut-card" style={{ padding: 16, background: "#ffffff" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--green)", textTransform: "uppercase" }}>Driver Earns (100%)</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                  ₹{calcOffer}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 2 }}>Direct to driver wallet</div>
              </div>

              <div className="brut-card" style={{ padding: 16, background: "#ffffff" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--primary)", textTransform: "uppercase" }}>Platform Fee</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                  ₹{calcPlatformFee}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 2 }}>Servers, safety & dispatch</div>
              </div>
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
          </div>
        </div>
      </section>

      {/* ============ VEHICLE SELECTION SUITE ============ */}
      <section style={{ padding: "64px 24px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <span className="brut-badge brut-badge-primary" style={{ marginBottom: 10 }}>FLEET OPTIONS</span>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Ride Options for Every Journey</h2>
          <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
            From quick solo commutes to comfortable family sedans.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
          {[
            {
              icon: "🏍️",
              name: "Bike Taxi",
              capacity: "1 Rider",
              desc: "Beat traffic in record time. Perfect for daily quick hops and station drop-offs.",
              tag: "FASTEST",
            },
            {
              icon: "🛺",
              name: "Auto Rickshaw",
              capacity: "3 Passengers",
              desc: "The iconic Indian city ride with upfront meter pricing and direct driver bidding.",
              tag: "POPULAR",
            },
            {
              icon: "🚗",
              name: "Mini Cab",
              capacity: "4 Passengers",
              desc: "Air-conditioned hatchbacks for comfortable, rain-safe city travel.",
              tag: "VALUE",
            },
            {
              icon: "🚘",
              name: "Prime Sedan",
              capacity: "4 Passengers",
              desc: "Top-rated drivers and spacious sedans for airport transfers and meetings.",
              tag: "PREMIUM",
            },
          ].map((v) => (
            <div key={v.name} className="brut-card" style={{ padding: 22 }}>
              <div className="spread" style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 32 }}>{v.icon}</span>
                <span className="brut-badge brut-badge-primary">{v.tag}</span>
              </div>
              <h3 style={{ fontSize: 18, marginBottom: 4 }}>{v.name}</h3>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-muted)", marginBottom: 10 }}>{v.capacity}</div>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ SAFETY & VERIFICATION ============ */}
      <section id="safety" style={{ background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)", padding: "64px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span className="brut-badge brut-badge-green" style={{ marginBottom: 10 }}>SAFETY FIRST</span>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Engineered for Total Ride Security</h2>
            <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
              Security features built right into the core dispatch architecture.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
            <div className="brut-card" style={{ padding: 26 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🔐</div>
              <h3 style={{ fontSize: 19, marginBottom: 8 }}>Cryptographic Start OTP</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.6 }}>
                Every ride generates a unique salted PIN. The driver cannot start the meter until the OTP is verified by the core dispatch server.
              </p>
            </div>

            <div className="brut-card" style={{ padding: 26 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>📍</div>
              <h3 style={{ fontSize: 19, marginBottom: 8 }}>Live Telemetry & GPS Tracking</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.6 }}>
                Real-time driver location stream with anti-teleport checks and automated route anomaly detection throughout the journey.
              </p>
            </div>

            <div className="brut-card" style={{ padding: 26 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🛡️</div>
              <h3 style={{ fontSize: 19, marginBottom: 8 }}>Verified Partner KYC</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.6 }}>
                All drivers register with validated driving licenses, vehicle registration plates, and KYC status approvals before going online.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FAQ SECTION ============ */}
      <section id="faq" style={{ padding: "64px 24px", maxWidth: 860, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span className="brut-badge brut-badge-primary" style={{ marginBottom: 10 }}>QUESTIONS & ANSWERS</span>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Frequently Asked Questions</h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            {
              q: "Can I really negotiate my ride price down to ₹0?",
              a: "Yes! Chalo-X allows riders to enter any offer amount including ₹0 during promotional periods or special deals. Drivers see the exact take-home amount and choose whether to accept.",
            },
            {
              q: "How do driver payouts and commissions work?",
              a: "Drivers take home 100% of the agreed negotiated fare. The platform fee is billed separately to the rider and visible upfront. There are no hidden commission deductions from driver earnings.",
            },
            {
              q: "What happens if no driver accepts my initial offer?",
              a: "If nearby drivers feel the offer is low, they can counter-bid with their own price. You can accept their counter, make a final adjustment, or switch to standard instant booking.",
            },
            {
              q: "Are the vehicles and drivers verified?",
              a: "Yes, every driver partner goes through document verification including driving license, vehicle registration, and active background checks before receiving dispatch offers.",
            },
            {
              q: "What payment methods are supported?",
              a: "Chalo-X supports UPI, digital wallet balance, card payments, and direct cash-to-driver handoffs.",
            },
          ].map((item, idx) => (
            <div
              key={item.q}
              className="brut-card"
              style={{
                padding: "18px 22px",
                cursor: "pointer",
                background: activeFaq === idx ? "var(--primary-soft)" : "#ffffff",
              }}
              onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
            >
              <div className="spread">
                <span style={{ fontWeight: 800, fontSize: 15, color: "var(--ink)" }}>{item.q}</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: "var(--primary)" }}>{activeFaq === idx ? "−" : "+"}</span>
              </div>
              {activeFaq === idx && (
                <p style={{ marginTop: 12, fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  {item.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ============ FINAL CTA BANNER ============ */}
      <section style={{ padding: "0 24px 64px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        <div
          className="brut-card brut-card-dark"
          style={{
            padding: "48px 32px",
            textAlign: "center",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <span className="brut-badge brut-badge-green" style={{ marginBottom: 16 }}>READY TO RIDE?</span>
          <h2 style={{ fontSize: "clamp(30px, 4.5vw, 48px)", color: "#ffffff", marginBottom: 16 }}>
            Take Control of Your Commute Today.
          </h2>
          <p style={{ fontSize: 16, color: "#cbd5e1", maxWidth: 540, margin: "0 auto 28px", lineHeight: 1.6 }}>
            Join thousands of riders and drivers in Bengaluru experiencing fair, negotiated, transparent mobility.
          </p>
          <div className="row center" style={{ gap: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary"
              style={{ fontSize: 16, padding: "14px 32px", boxShadow: "var(--shadow-md)" }}
            >
              🚀 Book Your First Ride Now
            </button>
            {onSwitchPortal && (
              <button
                type="button"
                onClick={onSwitchPortal}
                className="brut-btn brut-btn-white"
                style={{ fontSize: 16, padding: "14px 28px" }}
              >
                Drive & Earn 100% →
              </button>
            )}
          </div>
        </div>
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
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-sm brut-btn-primary"
            >
              {isRider ? "Book Now" : "Driver Portal"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
