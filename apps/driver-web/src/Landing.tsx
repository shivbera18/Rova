import { useState } from "react";

export function DriverLanding({
  onGetStarted,
  onSwitchPortal,
}: {
  onGetStarted: () => void;
  onSwitchPortal?: () => void;
}): React.ReactElement {
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
            <span className="brut-badge brut-badge-primary">DRIVER PARTNER</span>
          </div>

          {/* Desktop Nav */}
          <div className="row desktop-nav" style={{ gap: 10 }}>
            <a
              href="#earnings"
              className="brut-btn brut-btn-white brut-btn-sm"
              style={{ boxShadow: "none" }}
            >
              Earnings
            </a>
            {onSwitchPortal && (
              <button
                type="button"
                onClick={onSwitchPortal}
                className="brut-btn brut-btn-white brut-btn-sm"
              >
                🚗 Rider Portal
              </button>
            )}
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary brut-btn-sm"
            >
              Partner Sign In
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
              href="#earnings"
              className="brut-btn brut-btn-white brut-btn-full"
              onClick={() => setMobileMenuOpen(false)}
            >
              Earnings
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
                🚗 Rider Portal
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
              Partner Sign In
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
          }}
        >
          {[0, 1, 2].map((copy) => (
            <span key={copy} style={{ display: "inline-flex", alignItems: "center", gap: 32, paddingRight: 32 }}>
              <span style={{ color: "#ffffff" }}>💰 0% Driver Commission</span>
              <span style={{ color: "var(--green)" }}>★</span>
              <span style={{ color: "#ffffff" }}>Keep 100% of agreed fare</span>
              <span style={{ color: "var(--green)" }}>★</span>
              <span style={{ color: "#ffffff" }}>Accept or Counter any offer</span>
              <span style={{ color: "var(--green)" }}>★</span>
              <span style={{ color: "#ffffff" }}>Instant Daily settlements</span>
              <span style={{ color: "var(--green)" }}>★</span>
              <span style={{ color: "#ffffff" }}>Real-time Radar Dispatch</span>
              <span style={{ color: "var(--green)" }}>★</span>
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
            className="brut-badge brut-badge-green"
            style={{ marginBottom: 18, display: "inline-flex" }}
          >
            🔥 100% Take-Home Earnings
          </span>

          <h1 style={{ fontSize: "clamp(36px, 5.5vw, 60px)", lineHeight: 1.08, margin: "14px 0 20px" }}>
            Drive On Your <br />
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
              Own Terms.
            </span>
            Keep 100%.
          </h1>

          <p style={{ fontSize: 16, maxWidth: 520, fontWeight: 500, color: "var(--ink-soft)", marginBottom: 28, lineHeight: 1.6 }}>
            No platform cuts taken from your earnings. You see the rider's offer, accept immediately, or submit your own counter fare in seconds.
          </p>

          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary"
              style={{ fontSize: 15, padding: "12px 24px", boxShadow: "var(--shadow-md)" }}
            >
              🚀 Launch Driver Radar
            </button>
            <a
              href="#earnings"
              className="brut-btn brut-btn-white"
              style={{ fontSize: 15, padding: "12px 20px" }}
            >
              How Pay Works ↓
            </a>
          </div>

          <div className="row" style={{ gap: 8, marginTop: 28, flexWrap: "wrap" }}>
            <span className="brut-badge">🏍️ Bike Taxi</span>
            <span className="brut-badge">🛺 Auto Rickshaw</span>
            <span className="brut-badge">🚗 Mini & Prime Cabs</span>
            <span className="brut-badge">⚡ Instant OTP Verification</span>
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
              <span className="brut-badge brut-badge-green">● RADAR ACTIVE</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-muted)" }}>BANGALORE</span>
            </div>

            <div
              className="brut-card brut-card-primary"
              style={{ padding: 16, marginBottom: 14 }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Incoming Ride Offer
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 900, color: "var(--ink)" }}>
                ₹85 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>(100% your earnings)</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                Pickup: Koramangala 5th Block · 0.8 km away
              </div>
            </div>

            <div className="col" style={{ gap: 8 }}>
              <div className="spread" style={{ padding: "8px 10px", background: "var(--paper-subtle)", borderRadius: "var(--radius-sm)", border: "var(--brut-border-thin)" }}>
                <span style={{ fontWeight: 600, fontSize: 12.5 }}>Drop Location</span>
                <span style={{ fontWeight: 700, fontSize: 12.5 }}>Indiranagar (5.2 km)</span>
              </div>
              <div className="spread" style={{ padding: "8px 10px", background: "var(--paper-subtle)", borderRadius: "var(--radius-sm)", border: "var(--brut-border-thin)" }}>
                <span style={{ fontWeight: 600, fontSize: 12.5 }}>Platform Commission</span>
                <span style={{ fontWeight: 800, fontSize: 12.5, color: "var(--green)" }}>₹0 (Zero Cut)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary brut-btn-full"
              style={{ marginTop: 16 }}
            >
              Go Online Now →
            </button>
          </div>
        </div>
      </section>

      {/* ============ EARNINGS SECTION ============ */}
      <section id="earnings" style={{ padding: "56px 24px", background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span className="brut-badge brut-badge-green" style={{ marginBottom: 10 }}>DRIVER-FIRST PLATFORM</span>
            <h2 style={{ fontSize: "clamp(26px, 3.5vw, 38px)" }}>Why Drivers Choose Chalo-X</h2>
            <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
              Full transparency on every single trip. No penalty for rejecting low offers.
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
                    <span className="brut-badge brut-badge-green">{card.badge}</span>
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
          © {new Date().getFullYear()} Chalo-X Driver Network.
        </div>
        <div className="row" style={{ gap: 12 }}>
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
