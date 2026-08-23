import { useState } from "react";

export function DriverLanding({
  onGetStarted,
  onSwitchPortal,
}: {
  onGetStarted: () => void;
  onSwitchPortal?: () => void;
}): React.ReactElement {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [ridesPerDay, setRidesPerDay] = useState(12);
  const [avgFare, setAvgFare] = useState(110);

  const dailyEarnings = ridesPerDay * avgFare;
  const weeklyEarnings = dailyEarnings * 6;
  const monthlyEarnings = weeklyEarnings * 4;

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
            <span className="brut-badge brut-badge-green">DRIVER PARTNER</span>
          </div>

          {/* Desktop Nav */}
          <div className="row desktop-nav" style={{ gap: 10 }}>
            <a href="#earnings" className="brut-btn brut-btn-white brut-btn-sm" style={{ boxShadow: "none" }}>
              Earnings Model
            </a>
            <a href="#calc" className="brut-btn brut-btn-white brut-btn-sm" style={{ boxShadow: "none" }}>
              Income Calculator
            </a>
            <a href="#benefits" className="brut-btn brut-btn-white brut-btn-sm" style={{ boxShadow: "none" }}>
              Partner Benefits
            </a>
            <a href="#faq" className="brut-btn brut-btn-white brut-btn-sm" style={{ boxShadow: "none" }}>
              Driver FAQ
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
            <a href="#earnings" className="brut-btn brut-btn-white brut-btn-full" onClick={() => setMobileMenuOpen(false)}>
              Earnings Model
            </a>
            <a href="#calc" className="brut-btn brut-btn-white brut-btn-full" onClick={() => setMobileMenuOpen(false)}>
              Income Calculator
            </a>
            <a href="#benefits" className="brut-btn brut-btn-white brut-btn-full" onClick={() => setMobileMenuOpen(false)}>
              Partner Benefits
            </a>
            <a href="#faq" className="brut-btn brut-btn-white brut-btn-full" onClick={() => setMobileMenuOpen(false)}>
              Driver FAQ
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
            className="brut-badge brut-badge-green"
            style={{ marginBottom: 18, display: "inline-flex" }}
          >
            🔥 100% Direct Driver Take-Home
          </span>

          <h1 style={{ fontSize: "clamp(38px, 5.5vw, 64px)", lineHeight: 1.05, margin: "14px 0 20px" }}>
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

          <p style={{ fontSize: 16.5, maxWidth: 540, fontWeight: 500, color: "var(--ink-soft)", marginBottom: 30, lineHeight: 1.6 }}>
            No platform cuts taken from your earnings. You see the rider's offer, accept immediately, or submit your own counter fare in seconds.
          </p>

          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-primary"
              style={{ fontSize: 15, padding: "13px 26px", boxShadow: "var(--shadow-md)" }}
            >
              🚀 Launch Driver Radar
            </button>
            <a
              href="#calc"
              className="brut-btn brut-btn-white"
              style={{ fontSize: 15, padding: "13px 22px" }}
            >
              Calculate Earnings ↓
            </a>
          </div>

          <div className="row" style={{ gap: 8, marginTop: 32, flexWrap: "wrap" }}>
            <span className="brut-badge">🏍️ Bike Taxi</span>
            <span className="brut-badge">🛺 Auto Rickshaw</span>
            <span className="brut-badge">🚗 Mini & Prime Cabs</span>
            <span className="brut-badge">⚡ Instant OTP Verification</span>
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
              <span className="brut-badge brut-badge-green">● RADAR ACTIVE</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-muted)" }}>BENGALURU</span>
            </div>

            <div
              className="brut-card brut-card-primary"
              style={{ padding: 16, marginBottom: 14 }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Incoming Ride Offer
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 900, color: "var(--ink)" }}>
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
              style={{ marginTop: 18 }}
            >
              Go Online Now →
            </button>
          </div>
        </div>
      </section>

      {/* ============ STATS STRIP ============ */}
      <section style={{ background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)", padding: "40px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, textAlign: "center" }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 900, color: "var(--green)" }}>100%</div>
            <div style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: "var(--ink)", marginTop: 4 }}>Fare Retained</div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>Zero percentage cut from agreed price</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 900, color: "var(--primary)" }}>3 Rds</div>
            <div style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: "var(--ink)", marginTop: 4 }}>Fast Bidding Window</div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>Counter any offer before accepting</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 900, color: "var(--pink)" }}>Instant</div>
            <div style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: "var(--ink)", marginTop: 4 }}>Wallet Withdrawals</div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>Direct payouts to your bank account</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 900, color: "var(--teal)" }}>0</div>
            <div style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: "var(--ink)", marginTop: 4 }}>Rejection Penalty</div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>Skip low offers freely without shadowbans</div>
          </div>
        </div>
      </section>

      {/* ============ EARNINGS CALCULATOR ============ */}
      <section id="calc" style={{ padding: "64px 24px", maxWidth: 1000, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span className="brut-badge brut-badge-green" style={{ marginBottom: 10 }}>INCOME ESTIMATOR</span>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Calculate Your Monthly Income</h2>
          <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
            See how much you take home when you keep 100% of your fares.
          </p>
        </div>

        <div className="brut-card brut-card-primary" style={{ padding: "32px 24px", maxWidth: 700, margin: "0 auto", borderRadius: "var(--radius-lg)" }}>
          <div style={{ marginBottom: 20 }}>
            <div className="spread" style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 800, textTransform: "uppercase", fontSize: 12.5 }}>Daily Trips: {ridesPerDay} rides</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900 }}>{ridesPerDay} / day</span>
            </div>
            <input
              type="range"
              min={4}
              max={30}
              step={1}
              value={ridesPerDay}
              onChange={(e) => setRidesPerDay(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--primary)", cursor: "pointer" }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <div className="spread" style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 800, textTransform: "uppercase", fontSize: 12.5 }}>Average Fare per Ride: ₹{avgFare}</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900 }}>₹{avgFare}</span>
            </div>
            <input
              type="range"
              min={50}
              max={300}
              step={10}
              value={avgFare}
              onChange={(e) => setAvgFare(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--primary)", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, textAlign: "center" }}>
            <div className="brut-card" style={{ padding: 14, background: "#ffffff" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-muted)", textTransform: "uppercase" }}>Daily Income</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, marginTop: 4, color: "var(--ink)" }}>₹{dailyEarnings}</div>
            </div>
            <div className="brut-card" style={{ padding: 14, background: "#ffffff" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-muted)", textTransform: "uppercase" }}>Weekly (6 Days)</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, marginTop: 4, color: "var(--primary)" }}>₹{weeklyEarnings}</div>
            </div>
            <div className="brut-card" style={{ padding: 14, background: "var(--ink)", color: "#ffffff" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--green)", textTransform: "uppercase" }}>Monthly Total</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, marginTop: 4, color: "#ffffff" }}>₹{monthlyEarnings}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ WHY CHOOSE CHALO-X ============ */}
      <section id="earnings" style={{ background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)", padding: "64px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <span className="brut-badge brut-badge-green" style={{ marginBottom: 10 }}>DRIVER ADVANTAGES</span>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Why Drivers Love Chalo-X</h2>
            <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
              A marketplace built around respecting driver time and autonomy.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
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
              {
                step: "04",
                title: "No Penalty for Refusal",
                desc: "You are an independent partner. Reject low-value offers without fear of algorithmic deprioritization or lockouts.",
                badge: "FREEDOM",
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

      {/* ============ DRIVER FAQ ============ */}
      <section id="faq" style={{ padding: "64px 24px", maxWidth: 860, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span className="brut-badge brut-badge-primary" style={{ marginBottom: 10 }}>DRIVER PARTNER FAQ</span>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Frequently Asked Questions</h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            {
              q: "How does Chalo-X make money if you don't take driver commissions?",
              a: "Chalo-X bills riders a small, upfront, transparent platform fee (₹5 - ₹40) to cover cloud servers, maps, and 24/7 safety operations. The driver's negotiated offer is 100% untouched.",
            },
            {
              q: "How do I withdraw my earnings?",
              a: "Your digital ride earnings accumulate in your Chalo-X partner balance. You can request payouts directly to your registered UPI / bank account anytime.",
            },
            {
              q: "Can I drive with multiple vehicle types?",
              a: "During onboarding, you register one primary vehicle class (Bike, Auto, or Cab) tied to your verified registration plate.",
            },
            {
              q: "How does the counter-offer system work?",
              a: "When a rider broadcasts a low offer, tap 'Counter' and type your desired fare. If the rider accepts your counter, the trip is immediately assigned to you.",
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
              CHALO<span className="brand-accent">-X</span> DRIVER
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 4 }}>
              © {new Date().getFullYear()} Chalo-X Driver Network. 100% Take-Home Mobility.
            </div>
          </div>

          <div className="row" style={{ gap: 16 }}>
            <a href="#earnings" className="navlink" style={{ fontSize: 12 }}>Earnings</a>
            <a href="#calc" className="navlink" style={{ fontSize: 12 }}>Calculator</a>
            <a href="#faq" className="navlink" style={{ fontSize: 12 }}>FAQ</a>
            <button
              type="button"
              onClick={onGetStarted}
              className="brut-btn brut-btn-sm brut-btn-primary"
            >
              Partner Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
