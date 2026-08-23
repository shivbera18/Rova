/**
 * Chalo-X Landing Page — Sleek Neo-Brutalism Design.
 * Clean boundaries, modern indigo accents, crisp cards, zero harsh yellow.
 */
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

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--paper)", display: "flex", flexDirection: "column" }}>
      {/* ============ NAVBAR ============ */}
      <nav
        className="spread"
        style={{
          padding: "16px 32px",
          background: "#ffffff",
          borderBottom: "var(--brut-border)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div className="row" style={{ gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            CHALO<span className="brand-accent" style={{ background: "var(--primary)", color: "#fff", padding: "1px 6px", borderRadius: "var(--radius-xs)", border: "var(--brut-border-thin)", boxShadow: "var(--shadow-xs)" }}>-X</span>
          </span>
          <span className="brut-badge brut-badge-primary">
            {isRider ? "RIDER" : "DRIVER"}
          </span>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <a
            href="#how"
            className="brut-btn brut-btn-white"
            style={{ padding: "8px 16px", fontSize: 13, boxShadow: "none" }}
          >
            How it works
          </a>
          {onSwitchPortal && (
            <button
              type="button"
              onClick={onSwitchPortal}
              className="brut-btn brut-btn-white"
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              {isRider ? "🛵 Driver Portal" : "🚗 Rider Portal"}
            </button>
          )}
          <button
            type="button"
            onClick={onGetStarted}
            className="brut-btn brut-btn-primary"
            style={{ padding: "8px 20px", fontSize: 13 }}
          >
            {isRider ? "Book a Ride" : "Driver Login"}
          </button>
        </div>
      </nav>

      {/* ============ MARQUEE STRIP ============ */}
      <div
        style={{
          overflow: "hidden",
          background: "var(--ink)",
          color: "#ffffff",
          padding: "10px 0",
          borderBottom: "var(--brut-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "max-content",
            animation: "brut-marquee 22s linear infinite",
            gap: 40,
            fontWeight: 700,
            textTransform: "uppercase",
            fontSize: 12.5,
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {[0, 1].map((copy) => (
            <span key={copy} className="row" style={{ gap: 40 }}>
              <span>⚡ You set the price</span>
              <span style={{ color: "var(--primary-light)" }}>★</span>
              <span>Transparent Platform Fee</span>
              <span style={{ color: "var(--primary-light)" }}>★</span>
              <span>Drivers keep 100% of negotiated fare</span>
              <span style={{ color: "var(--primary-light)" }}>★</span>
              <span>Bikes · Autos · Cabs</span>
              <span style={{ color: "var(--primary-light)" }}>★</span>
              <span>Zero Surge Algorithm</span>
              <span style={{ color: "var(--primary-light)" }}>★</span>
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
          padding: "64px 32px 56px",
          maxWidth: 1200,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div style={{ flex: "1 1 500px", maxWidth: 640 }}>
          <span
            className="brut-badge brut-badge-primary"
            style={{ marginBottom: 20, display: "inline-flex" }}
          >
            ✨ The Fair Price Ride Marketplace
          </span>

          <h1 style={{ fontSize: "clamp(40px, 5.5vw, 64px)", lineHeight: 1.05, margin: "16px 0 22px" }}>
            You Name <br />
            <span
              style={{
                display: "inline-block",
                background: "var(--primary)",
                color: "#ffffff",
                padding: "2px 16px",
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

          <p style={{ fontSize: 17, maxWidth: 520, fontWeight: 500, color: "var(--ink-soft)", marginBottom: 32, lineHeight: 1.6 }}>
            Say goodbye to algorithmic surge price spikes. Choose what you want to pay, see our tiny upfront platform fee, and negotiate directly with nearby verified drivers.
          </p>

          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary"
              style={{ fontSize: 15, padding: "14px 28px", boxShadow: "var(--shadow-md)" }}
            >
              {isRider ? "🚀 Book Your Ride Now" : "🚀 Open Driver Console"}
            </button>
            <a
              href="#how"
              className="brut-btn brut-btn-white"
              style={{ fontSize: 15, padding: "14px 24px" }}
            >
              Learn More ↓
            </a>
          </div>

          <div className="row" style={{ gap: 10, marginTop: 32, flexWrap: "wrap" }}>
            <span className="brut-badge">🏍️ Bike Quick Rides</span>
            <span className="brut-badge">🛺 Auto Rickshaws</span>
            <span className="brut-badge">🚗 Prime Cabs</span>
            <span className="brut-badge">🛡️ Verified Safety OTP</span>
          </div>
        </div>

        {/* Hero Visual Card */}
        <div style={{ flex: "0 1 340px", margin: "0 auto" }}>
          <div
            className="brut-card"
            style={{
              padding: 24,
              boxShadow: "var(--shadow-lg)",
              background: "#ffffff",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div className="spread" style={{ marginBottom: 16 }}>
              <span className="brut-badge brut-badge-green">● LIVE TRIP BIDDING</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-muted)" }}>BANGALORE</span>
            </div>

            <div
              className="brut-card brut-card-primary"
              style={{ padding: 18, marginBottom: 16 }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Rider's Offer
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 900, color: "var(--ink)" }}>
                ₹65 <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-soft)" }}>+ ₹10 fee</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                Estimated distance: 4.8 km · Indiranagar
              </div>
            </div>

            <div className="col" style={{ gap: 10 }}>
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
                  <span className={`brut-badge ${item.badge}`} style={{ fontSize: 11 }}>
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

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" style={{ padding: "64px 32px", background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span className="brut-badge brut-badge-primary" style={{ marginBottom: 12 }}>SIMPLE PRINCIPLES</span>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>How Chalo-X Works</h2>
            <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 8, fontSize: 16 }}>
              No hidden commissions. No surge penalties. Just honest direct connection.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 24,
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
                  padding: 28,
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div className="spread" style={{ marginBottom: 16 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 32,
                        fontWeight: 900,
                        color: "var(--primary)",
                      }}
                    >
                      {card.step}
                    </span>
                    <span className="brut-badge brut-badge-primary">{card.badge}</span>
                  </div>
                  <h3 style={{ fontSize: 19, marginBottom: 12 }}>{card.title}</h3>
                  <p style={{ color: "var(--ink-soft)", fontSize: 14, lineHeight: 1.6 }}>{card.desc}</p>
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
          padding: "24px 32px",
          background: "var(--paper)",
          marginTop: "auto",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>
          © {new Date().getFullYear()} Chalo-X. Open Fair-Price Ride Platform.
        </div>
        <div className="row" style={{ gap: 16 }}>
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
