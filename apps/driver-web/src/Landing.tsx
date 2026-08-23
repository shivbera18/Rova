/**
 * Chalo-X Driver Landing Page — Sleek Neo-Brutalism Design.
 * Clean boundaries, modern indigo accents, crisp cards, zero harsh yellow.
 */
export function DriverLanding({
  onGetStarted,
  onSwitchPortal,
}: {
  onGetStarted: () => void;
  onSwitchPortal?: () => void;
}): React.ReactElement {
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
          <span className="brut-badge brut-badge-primary">DRIVER PARTNER</span>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <a
            href="#earnings"
            className="brut-btn brut-btn-white"
            style={{ padding: "8px 16px", fontSize: 13, boxShadow: "none" }}
          >
            Earnings
          </a>
          {onSwitchPortal && (
            <button
              type="button"
              onClick={onSwitchPortal}
              className="brut-btn brut-btn-white"
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              🚗 Rider Portal
            </button>
          )}
          <button
            type="button"
            onClick={onGetStarted}
            className="brut-btn brut-btn-primary"
            style={{ padding: "8px 20px", fontSize: 13 }}
          >
            Partner Sign In
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
              <span>💰 0% Driver Commission</span>
              <span style={{ color: "var(--primary-light)" }}>★</span>
              <span>Keep 100% of the agreed fare</span>
              <span style={{ color: "var(--primary-light)" }}>★</span>
              <span>Accept or Counter any offer</span>
              <span style={{ color: "var(--primary-light)" }}>★</span>
              <span>Instant Payouts & Daily settlements</span>
              <span style={{ color: "var(--primary-light)" }}>★</span>
              <span>Real-time Radar Dispatch</span>
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
            className="brut-badge brut-badge-green"
            style={{ marginBottom: 20, display: "inline-flex" }}
          >
            🔥 100% Take-Home Earnings
          </span>

          <h1 style={{ fontSize: "clamp(40px, 5.5vw, 64px)", lineHeight: 1.05, margin: "16px 0 22px" }}>
            Drive On Your <br />
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
              Own Terms.
            </span>
            Keep 100%.
          </h1>

          <p style={{ fontSize: 17, maxWidth: 520, fontWeight: 500, color: "var(--ink-soft)", marginBottom: 32, lineHeight: 1.6 }}>
            No platform cuts taken from your earnings. You see the rider's offer, accept immediately, or submit your own counter fare in seconds.
          </p>

          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary"
              style={{ fontSize: 15, padding: "14px 28px", boxShadow: "var(--shadow-md)" }}
            >
              🚀 Launch Driver Radar
            </button>
            <a
              href="#earnings"
              className="brut-btn brut-btn-white"
              style={{ fontSize: 15, padding: "14px 24px" }}
            >
              How Pay Works ↓
            </a>
          </div>

          <div className="row" style={{ gap: 10, marginTop: 32, flexWrap: "wrap" }}>
            <span className="brut-badge">🏍️ Bike Taxi</span>
            <span className="brut-badge">🛺 Auto Rickshaw</span>
            <span className="brut-badge">🚗 Mini & Prime Cabs</span>
            <span className="brut-badge">⚡ Instant OTP Verification</span>
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
              <span className="brut-badge brut-badge-green">● RADAR ACTIVE</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-muted)" }}>BANGALORE</span>
            </div>

            <div
              className="brut-card brut-card-primary"
              style={{ padding: 18, marginBottom: 16 }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Incoming Ride Offer
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 900, color: "var(--ink)" }}>
                ₹85 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>(100% your earnings)</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                Pickup: Koramangala 5th Block · 0.8 km away
              </div>
            </div>

            <div className="col" style={{ gap: 10 }}>
              <div className="spread" style={{ padding: "8px 12px", background: "var(--paper-subtle)", borderRadius: "var(--radius-sm)", border: "var(--brut-border-thin)" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Drop Location</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Indiranagar (5.2 km)</span>
              </div>
              <div className="spread" style={{ padding: "8px 12px", background: "var(--paper-subtle)", borderRadius: "var(--radius-sm)", border: "var(--brut-border-thin)" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Platform Commission</span>
                <span style={{ fontWeight: 800, fontSize: 13, color: "var(--green)" }}>₹0 (Zero Cut)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary brut-btn-full"
              style={{ marginTop: 18 }}
            >
              Go Online Now →
            </button>
          </div>
        </div>
      </section>

      {/* ============ EARNINGS SECTION ============ */}
      <section id="earnings" style={{ padding: "64px 32px", background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span className="brut-badge brut-badge-green" style={{ marginBottom: 12 }}>DRIVER-FIRST PLATFORM</span>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>Why Drivers Choose Chalo-X</h2>
            <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 8, fontSize: 16 }}>
              Full transparency on every single trip. No penalty for rejecting low offers.
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
                title: "Zero Commission Cut",
                desc: "Riders pay the platform fee separately. Every single rupee of the negotiated fare goes straight to your wallet balance.",
                badge: "100% YOURS",
              },
              {
                step: "02",
                title: "Real Counter Bidding",
                desc: "Don't like an offer? Submit your counter price with one tap. If the rider accepts, the trip is immediately booked.",
                badge: "FLEXIBLE",
              },
              {
                step: "03",
                title: "Instant Verification",
                desc: "Seamless OTP onboarding with vehicle registration. Start receiving live trip requests right from your browser.",
                badge: "NO DELAYS",
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
                    <span className="brut-badge brut-badge-green">{card.badge}</span>
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
          © {new Date().getFullYear()} Chalo-X Driver Network.
        </div>
        <div className="row" style={{ gap: 16 }}>
          <button
            type="button"
            onClick={onGetStarted}
            className="brut-btn brut-btn-sm brut-btn-primary"
          >
            Start Driving
          </button>
        </div>
      </footer>
    </div>
  );
}
