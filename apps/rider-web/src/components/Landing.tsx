/**
 * Chalo-X Landing Page — shared neo-brutalism marketing screen.
 * Rendered pre-auth on both rider and driver consoles.
 */
export function Landing({
  audience,
  onGetStarted,
  onDriverLogin,
}: {
  audience: "RIDER" | "DRIVER";
  onGetStarted: () => void;
  onDriverLogin?: () => void;
}): React.ReactElement {
  const isRider = audience === "RIDER";

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--paper)" }}>
      {/* ============ NAVBAR ============ */}
      <nav
        className="spread"
        style={{
          padding: "14px 28px",
          background: "var(--yellow)",
          borderBottom: "3px solid var(--ink)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div className="row" style={{ gap: 10 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
            }}
          >
            CHALO-X
          </span>
          <span className="brut-badge brut-badge-green">BETA</span>
        </div>
        <div className="row">
          <a
            href="#how"
            className="brut-btn brut-btn-white"
            style={{ padding: "9px 16px", fontSize: 12.5, boxShadow: "none" }}
          >
            How it works
          </a>
          {isRider && onDriverLogin && (
            <button
              type="button"
              onClick={onDriverLogin}
              className="brut-btn brut-btn-dark"
              style={{ padding: "9px 16px", fontSize: 12.5 }}
            >
              🛵 Drive with us
            </button>
          )}
          <button
            type="button"
            onClick={onGetStarted}
            className="brut-btn brut-btn-primary"
            style={{ padding: "9px 18px", fontSize: 12.5 }}
          >
            {isRider ? "🚗 Book a ride" : "🔑 Sign in"}
          </button>
        </div>
      </nav>

      {/* ============ MARQUEE STRIP ============ */}
      <div
        style={{
          overflow: "hidden",
          background: "var(--ink)",
          color: "#fff",
          padding: "8px 0",
          borderBottom: "3px solid var(--ink)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "max-content",
            animation: "brut-marquee 22s linear infinite",
            gap: 40,
            fontWeight: 800,
            textTransform: "uppercase",
            fontSize: 13,
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {[0, 1].map((copy) => (
            <span key={copy} className="row" style={{ gap: 40 }}>
              <span>⚡ You set the price</span>
              <span style={{ color: "var(--yellow)" }}>★</span>
              <span>Even ₹0 offers welcome</span>
              <span style={{ color: "var(--yellow)" }}>★</span>
              <span>Drivers earn 100% of the deal</span>
              <span style={{ color: "var(--yellow)" }}>★</span>
              <span>Bikes · Autos · Cabs</span>
              <span style={{ color: "var(--yellow)" }}>★</span>
              <span>No hidden charges</span>
              <span style={{ color: "var(--yellow)" }}>★</span>
            </span>
          ))}
        </div>
      </div>

      {/* ============ HERO ============ */}
      <section
        className="spread"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 32,
          flexWrap: "wrap",
          padding: "56px 28px 48px",
        }}
      >
        <div style={{ flex: "1 1 460px", maxWidth: 620 }}>
          <span
            className="brut-badge brut-badge-yellow"
            style={{ marginBottom: 18, display: "inline-flex", transform: "rotate(-2deg)" }}
          >
            🔥 India's first name-your-price ride app
          </span>
          <h1 style={{ fontSize: "clamp(38px, 6vw, 68px)", lineHeight: 1.02, margin: "14px 0 20px" }}>
            You Name{" "}
            <span
              style={{
                display: "inline-block",
                background: "var(--blue)",
                color: "#fff",
                padding: "0 14px",
                border: "3px solid var(--ink)",
                borderRadius: 12,
                boxShadow: "5px 5px 0 var(--ink)",
                transform: "rotate(-2deg)",
              }}
            >
              The Price.
            </span>
            <br />
            We Get You{" "}
            <span
              style={{
                display: "inline-block",
                background: "var(--pink)",
                color: "#fff",
                padding: "0 14px",
                border: "3px solid var(--ink)",
                borderRadius: 12,
                boxShadow: "5px 5px 0 var(--ink)",
                transform: "rotate(1.5deg)",
              }}
            >
              Moving.
            </span>
          </h1>
          <p style={{ fontSize: 17, maxWidth: 480, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 26 }}>
            Skip surge pricing forever. Tell drivers exactly what you'll pay — even ₹0 — and let them decide.
            The platform fee is always transparent, upfront, and tiny.
          </p>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={onGetStarted} className="brut-btn brut-btn-primary brut-shadow-lg"
              style={{ fontSize: 16, padding: "15px 26px", boxShadow: "var(--shadow-md)" }}>
              {isRider ? "🚀 Start Riding Free" : "🚀 Start Driving"}
            </button>
            {!isRider && (
              <a href="#how" className="brut-btn brut-btn-white" style={{ fontSize: 16, padding: "15px 26px" }}>
                See how payouts work ↓
              </a>
            )}
            {isRider && onDriverLogin && (
              <button type="button" onClick={onDriverLogin} className="brut-btn brut-btn-white" style={{ fontSize: 16, padding: "15px 26px" }}>
                🛵 I want to drive instead
              </button>
            )}
          </div>
          <div className="row" style={{ gap: 14, marginTop: 24, flexWrap: "wrap" }}>
            <span className="brut-badge">🏍️ Bikes</span>
            <span className="brut-badge">🛺 Autos</span>
            <span className="brut-badge">🚗 Cabs</span>
            <span className="brut-badge">📦 Parcels soon</span>
          </div>
        </div>

        {/* Hero visual: fake phone mock */}
        <div style={{ flex: "0 1 320px", margin: "0 auto" }} aria-hidden>
          <div
            style={{
              width: 280,
              border: "3px solid var(--ink)",
              borderRadius: 30,
              background: "var(--paper-alt)",
              boxShadow: "10px 10px 0 var(--ink)",
              padding: 16,
              animation: "brut-bob 3s ease-in-out infinite",
            }}
          >
            <div
              style={{
                height: 10,
                width: 90,
                background: "var(--ink)",
                borderRadius: 999,
                margin: "0 auto 14px",
              }}
            />
            <div className="brut-card" style={{ padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Your offer
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 1.1 }}>₹45</div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                List price was ₹72 — you save 37%
              </div>
            </div>
            {[
              { icon: "🏍️", label: "Bike · 4 min", pay: "₹41", bg: "var(--green)" },
              { icon: "🛺", label: "Auto · 6 min", pay: "₹58", bg: "var(--teal)" },
              { icon: "🚗", label: "Mini · 7 min", pay: "₹76", bg: "var(--blue)" },
            ].map((v) => (
              <div
                key={v.label}
                className="spread"
                style={{
                  border: "2.5px solid var(--ink)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  marginBottom: 8,
                  background: "#fff",
                }}
              >
                <span className="row" style={{ gap: 8, fontWeight: 700, fontSize: 13 }}>
                  <span>{v.icon}</span> {v.label}
                </span>
                <span
                  style={{
                    background: v.bg,
                    border: "2px solid var(--ink)",
                    borderRadius: 6,
                    padding: "1px 8px",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {v.pay}
                </span>
              </div>
            ))}
            <div className="brut-btn brut-btn-primary brut-btn-full" style={{ marginTop: 4, pointerEvents: "none" }}>
              Find my driver →
            </div>
          </div>
        </div>
      </section>

      {/* ============ FEATURE CARDS ============ */}
      <section id="how" style={{ padding: "36px 28px 52px" }}>
        <h2 style={{ fontSize: "clamp(26px, 4vw, 42px)", textAlign: "center", marginBottom: 8 }}>
          Why riders & drivers love us
        </h2>
        <p style={{ textAlign: "center", fontWeight: 700, color: "var(--ink-soft)", marginBottom: 30 }}>
          Three rules. Zero surprises.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 22,
            maxWidth: 1080,
            margin: "0 auto",
          }}
        >
          {[
            {
              n: "01",
              title: isRider ? "Name your fare" : "Your rate, your call",
              body: isRider
                ? "Type any amount you're comfortable paying — even zero. Drivers see your offer instantly and choose to accept or counter."
                : "See every offer before accepting. Counter if it's too low. Every rupee you agree on goes straight to your wallet.",
              bg: "var(--yellow)",
              rotate: "-1.5deg",
            },
            {
              n: "02",
              title: "Transparent platform fee",
              body: isRider
                ? "One small, visible fee keeps the lights on — servers, support, insurance. It's shown upfront with an ⓘ, never buried."
                : "The platform fee is billed to the rider separately. What they offer is what you keep. No commissions eating your earnings.",
              bg: "var(--teal)",
              rotate: "1deg",
            },
            {
              n: "03",
              title: isRider ? "Real-time everything" : "Fair dispatch, always",
              body: isRider
                ? "Watch your driver approach on a live map, verify with an OTP, share your trip, and pay how you like — UPI, wallet or cash."
                : "Offers match your vehicle class and distance. No opaque algorithms deciding your day — just clean, nearby requests.",
              bg: "var(--pink)",
              rotate: "-1deg",
            },
          ].map((f) => (
            <div
              key={f.n}
              className="brut-card"
              style={{
                background: f.bg,
                transform: `rotate(${f.rotate})`,
                transition: "transform 150ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "rotate(0deg) scale(1.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = `rotate(${f.rotate})`)}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 44,
                  lineHeight: 1,
                  marginBottom: 10,
                  textShadow: "3px 3px 0 rgba(17,17,17,0.25)",
                }}
              >
                {f.n}
              </div>
              <h3 style={{ fontSize: 19, marginBottom: 10 }}>{f.title}</h3>
              <p style={{ fontWeight: 600, color: "var(--ink-soft)", fontSize: 13.5 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ STATS BAND ============ */}
      <section
        style={{
          background: "var(--ink)",
          color: "#fff",
          padding: "34px 28px",
          borderTop: "3px solid var(--ink)",
          borderBottom: "3px solid var(--ink)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 20,
            maxWidth: 900,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          {[
            { big: "100%", small: "of offer goes to driver" },
            { big: "₹0", small: "minimum rider offer" },
            { big: "< 60s", small: "average match time" },
            { big: "24×7", small: "support & SOS line" },
          ].map((s) => (
            <div key={s.small}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 40,
                  color: "var(--yellow)",
                  textShadow: "3px 3px 0 rgba(255,255,255,0.15)",
                }}
              >
                {s.big}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {s.small}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ CTA FOOTER ============ */}
      <section style={{ padding: "48px 28px 64px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(26px, 4vw, 44px)", marginBottom: 14 }}>
          Ready to stop paying surge?
        </h2>
        <p style={{ fontWeight: 700, color: "var(--ink-soft)", marginBottom: 26 }}>
          Join thousands of riders and drivers already on Chalo-X.
        </p>
        <div className="row" style={{ justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onGetStarted}
            className="brut-btn brut-btn-dark"
            style={{ fontSize: 16, padding: "16px 30px", boxShadow: "var(--shadow-md)" }}
          >
            {isRider ? "🚕 Get started as Rider" : "🛵 Get started as Driver"}
          </button>
          {!isRider && onDriverLogin && (
            <button type="button" onClick={onDriverLogin} className="brut-btn brut-btn-white" style={{ fontSize: 16, padding: "16px 30px" }}>
              Switch to Rider app →
            </button>
          )}
        </div>
        <div style={{ marginTop: 40, fontWeight: 700, fontSize: 12, color: "var(--ink-soft)" }}>
          © 2026 Chalo-X · Made with ⚡ in Bengaluru · Grievance officer: support@chalox.app
        </div>
      </section>
    </div>
  );
}
