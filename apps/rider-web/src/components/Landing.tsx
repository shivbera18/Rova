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
              {isRider ? "RIDER" : "DRIVER"}
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="row desktop-nav" style={{ gap: 10 }}>
            <a
              href="#how"
              className="brut-btn brut-btn-white brut-btn-sm"
              style={{ boxShadow: "none" }}
            >
              How it works
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
            <a
              href="#how"
              className="brut-btn brut-btn-white brut-btn-full"
              onClick={() => setMobileMenuOpen(false)}
            >
              How it works
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
          padding: "12px 0",
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

      {/* ============ HERO ============ */}
      <section
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 40,
          flexWrap: "wrap",
          padding: "48px 24px 40px",
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
            ✨ The Fair Price Ride Marketplace
          </span>

          <h1 style={{ fontSize: "clamp(36px, 5.5vw, 60px)", lineHeight: 1.08, margin: "14px 0 20px" }}>
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

          <p style={{ fontSize: 16, maxWidth: 520, fontWeight: 500, color: "var(--ink-soft)", marginBottom: 28, lineHeight: 1.6 }}>
            Say goodbye to algorithmic surge price spikes. Choose what you want to pay, see our tiny upfront platform fee, and negotiate directly with nearby verified drivers.
          </p>

          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary"
              style={{ fontSize: 15, padding: "12px 24px", boxShadow: "var(--shadow-md)" }}
            >
              🚀 Book Your Ride Now
            </button>
            <a
              href="#how"
              className="brut-btn brut-btn-white"
              style={{ fontSize: 15, padding: "12px 20px" }}
            >
              Learn More ↓
            </a>
          </div>

          <div className="row" style={{ gap: 8, marginTop: 28, flexWrap: "wrap" }}>
            <span className="brut-badge">🏍️ Bike Quick Rides</span>
            <span className="brut-badge">🛺 Auto Rickshaws</span>
            <span className="brut-badge">🚗 Prime Cabs</span>
            <span className="brut-badge">🛡️ Verified Safety OTP</span>
          </div>
        </div>

        {/* Hero Visual Card */}
        <div style={{ flex: "0 1 340px", width: "100%", margin: "0 auto" }}>
          <div
            className="brut-card"
            style={{
              padding: 22,
              boxShadow: "var(--shadow-lg)",
              background: "#ffffff",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div className="spread" style={{ marginBottom: 14 }}>
              <span className="brut-badge brut-badge-green">● LIVE TRIP BIDDING</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-muted)" }}>BANGALORE</span>
            </div>

            <div
              className="brut-card brut-card-primary"
              style={{ padding: 16, marginBottom: 14 }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Rider's Offer
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 900, color: "var(--ink)" }}>
                ₹65 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>+ ₹10 fee</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                Estimated distance: 4.8 km · Indiranagar
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
                    padding: "8px 10px",
                    border: "var(--brut-border-thin)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--paper-subtle)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12.5 }}>{item.type}</div>
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
              style={{ marginTop: 16 }}
            >
              Try Negotiation Flow →
            </button>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" style={{ padding: "56px 24px", background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span className="brut-badge brut-badge-primary" style={{ marginBottom: 10 }}>SIMPLE PRINCIPLES</span>
            <h2 style={{ fontSize: "clamp(26px, 3.5vw, 38px)" }}>How Chalo-X Works</h2>
            <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
              No hidden commissions. No surge penalties. Just honest direct connection.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 20,
            }}
          >
            {[
              {
                step: "01",
                title: "Enter Origin & Destination",
                desc: "Choose pickup and drop-off on our interactive live road map. See route length, estimated traffic time, and recommended benchmark fares.",
                badge: "FAST ROUTING",
              },
              {
                step: "02",
                title: "Name Your Offer",
                desc: "Enter what you are willing to pay. You can test lower offers or match list prices. We show you the exact transparent platform charge upfront.",
                badge: "FAIR PRICING",
              },
              {
                step: "03",
                title: "Direct Driver Negotiation",
                desc: "Nearby drivers receive your offer on their radar. They can accept immediately or submit a counter bid in real-time.",
                badge: "ZERO SURGE",
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
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 28,
                        fontWeight: 900,
                        color: "var(--primary)",
                      }}
                    >
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
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer
        className="spread"
        style={{
          padding: "20px 24px",
          background: "var(--paper)",
          marginTop: "auto",
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)" }}>
          © {new Date().getFullYear()} Chalo-X. Open Fair-Price Ride Platform.
        </div>
        <div className="row" style={{ gap: 12 }}>
          <button
            type="button"
            onClick={onGetStarted}
            className="brut-btn brut-btn-sm brut-btn-primary"
          >
            {isRider ? "Book Now" : "Driver Portal"}
          </button>
        </div>
      </footer>
    </div>
  );
}
