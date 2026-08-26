import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Bike,
  CarFront,
  CarTaxiFront,
  Car,
  Flame,
  Menu,
  Rocket,
  ShieldCheck,
  X,
} from "lucide-react";
import { NeoButton, NeoCard, NeoBadge, NeoAccordion, NeoMarquee } from "./NeoComponents";

export function DriverLanding({
  onGetStarted,
  onSwitchPortal,
}: {
  onGetStarted: () => void;
  onSwitchPortal?: () => void;
}): React.ReactElement {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ridesPerDay, setRidesPerDay] = useState(12);
  const [avgFare, setAvgFare] = useState(110);

  const dailyEarnings = ridesPerDay * avgFare;
  const weeklyEarnings = dailyEarnings * 6;
  const monthlyEarnings = weeklyEarnings * 4;

  const FAQ_ITEMS = [
    {
      id: "dfaq-1",
      title: "How does Chalo-X make money if you don't take driver commissions?",
      content: (
        <p>
          Chalo-X bills riders a small, upfront, transparent platform fee (₹5 - ₹40) to cover cloud servers, maps, and
          24/7 safety operations. The driver's negotiated offer is 100% untouched.
        </p>
      ),
    },
    {
      id: "dfaq-2",
      title: "How do I withdraw my earnings?",
      content: (
        <p>
          Your digital ride earnings accumulate in your Chalo-X partner balance. You can request payouts directly to your
          registered UPI / bank account anytime.
        </p>
      ),
    },
    {
      id: "dfaq-3",
      title: "Can I drive with multiple vehicle types?",
      content: (
        <p>
          During onboarding, you register one primary vehicle class (Bike, Auto, or Cab) tied to your verified
          registration plate.
        </p>
      ),
    },
    {
      id: "dfaq-4",
      title: "How does the counter-offer system work?",
      content: (
        <p>
          When a rider broadcasts a low offer, tap 'Counter' and type your desired fare. If the rider accepts your
          counter, the trip is immediately assigned to you.
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
            <NeoBadge variant="green">DRIVER PARTNER</NeoBadge>
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
              <NeoButton
                variant="white"
                size="sm"
                onClick={onSwitchPortal}
              >
                <CarFront size={14} /> Rider Portal
              </NeoButton>
            )}
            <NeoButton
              variant="primary"
              size="sm"
              onClick={onGetStarted}
            >
              Partner Sign In
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
              <NeoButton
                variant="white"
                fullWidth
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSwitchPortal();
                }}
              >
                <CarFront size={14} /> Rider Portal
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
              Partner Sign In
            </NeoButton>
          </div>
        )}
      </header>

      {/* ============ PRE-BUILT NEOMARQUEE ============ */}
      <NeoMarquee
        items={[
          "0% Driver Commission",
          "Keep 100% of agreed fare",
          "Accept or Counter any offer",
          "Instant Daily settlements",
          "Real-time Radar Dispatch",
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
          <NeoBadge variant="green" style={{ marginBottom: 18, display: "inline-flex" }}>
            <Flame size={13} /> 100% Direct Driver Take-Home
          </NeoBadge>

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
            <NeoButton
              variant="primary"
              size="lg"
              onClick={onGetStarted}
              style={{ boxShadow: "var(--shadow-md)" }}
            >
              <Rocket size={16} /> Launch Driver Radar
            </NeoButton>
            <a
              href="#calc"
              className="brut-btn brut-btn-white"
              style={{ fontSize: 15, padding: "13px 22px" }}
            >
              Calculate Earnings <ArrowDown size={15} />
            </a>
          </div>

          <div className="row" style={{ gap: 8, marginTop: 32, flexWrap: "wrap" }}>
            <NeoBadge><Bike size={12} /> Bike Taxi</NeoBadge>
            <NeoBadge><CarTaxiFront size={12} /> Auto Rickshaw</NeoBadge>
            <NeoBadge><Car size={12} /> Mini & Prime Cabs</NeoBadge>
            <NeoBadge variant="green"><ShieldCheck size={12} /> Instant OTP Verification</NeoBadge>
          </div>
        </div>

        {/* Hero Visual NeoCard */}
        <div style={{ flex: "0 1 360px", width: "100%", margin: "0 auto" }}>
          <NeoCard elevation="lg" style={{ padding: 24, borderRadius: "var(--radius-lg)" }}>
            <div className="spread" style={{ marginBottom: 14 }}>
              <NeoBadge variant="green">RADAR ACTIVE</NeoBadge>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-muted)" }}>BENGALURU</span>
            </div>

            <NeoCard variant="primary" elevation="none" style={{ padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Incoming Ride Offer
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 900, color: "var(--ink)" }}>
                ₹85 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>(100% your earnings)</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>
                Pickup: Koramangala 5th Block · 0.8 km away
              </div>
            </NeoCard>

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

            <NeoButton
              variant="primary"
              fullWidth
              onClick={onGetStarted}
              style={{ marginTop: 18 }}
            >
              Go Online Now <ArrowRight size={15} />
            </NeoButton>
          </NeoCard>
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
          <NeoBadge variant="green" style={{ marginBottom: 10 }}>INCOME ESTIMATOR</NeoBadge>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Calculate Your Monthly Income</h2>
          <p style={{ color: "var(--ink-soft)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>
            See how much you take home when you keep 100% of your fares.
          </p>
        </div>

        <NeoCard variant="primary" elevation="md" style={{ padding: "32px 24px", maxWidth: 700, margin: "0 auto", borderRadius: "var(--radius-lg)" }}>
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
            <NeoCard elevation="none" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-muted)", textTransform: "uppercase" }}>Daily Income</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, marginTop: 4, color: "var(--ink)" }}>₹{dailyEarnings}</div>
            </NeoCard>
            <NeoCard elevation="none" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-muted)", textTransform: "uppercase" }}>Weekly (6 Days)</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, marginTop: 4, color: "var(--primary)" }}>₹{weeklyEarnings}</div>
            </NeoCard>
            <NeoCard variant="dark" elevation="none" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--green)", textTransform: "uppercase" }}>Monthly Total</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, marginTop: 4, color: "#ffffff" }}>₹{monthlyEarnings}</div>
            </NeoCard>
          </div>
        </NeoCard>
      </section>

      {/* ============ WHY CHOOSE CHALO-X ============ */}
      <section id="earnings" style={{ background: "#ffffff", borderTop: "var(--brut-border)", borderBottom: "var(--brut-border)", padding: "64px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <NeoBadge variant="green" style={{ marginBottom: 10 }}>DRIVER ADVANTAGES</NeoBadge>
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
                    <NeoBadge variant="green">{card.badge}</NeoBadge>
                  </div>
                  <h3 style={{ fontSize: 18, marginBottom: 10 }}>{card.title}</h3>
                  <p style={{ color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.6 }}>{card.desc}</p>
                </div>
              </NeoCard>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRE-BUILT NEOACCORDION DRIVER FAQ ============ */}
      <section id="faq" style={{ padding: "64px 24px", maxWidth: 860, margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <NeoBadge variant="primary" style={{ marginBottom: 10 }}>DRIVER PARTNER FAQ</NeoBadge>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>Frequently Asked Questions</h2>
        </div>

        <NeoAccordion items={FAQ_ITEMS} defaultExpandedId="dfaq-1" />
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
            <NeoButton
              variant="primary"
              size="sm"
              onClick={onGetStarted}
            >
              Partner Sign In
            </NeoButton>
          </div>
        </div>
      </footer>
    </div>
  );
}
