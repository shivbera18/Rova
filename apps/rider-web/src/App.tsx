import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { getToken, setToken } from "./api";
import Login from "./screens/Login";
import { Landing } from "./components/Landing";
import Book from "./screens/Book";
import History from "./screens/History";
import { enablePushNotifications, pushSupported } from "./push";
import { SafetyPanel } from "./components/SafetyPanel";

function RiderConsole({
  logout,
  safetyOpen,
  setSafetyOpen,
  pushState,
  setPushState,
  activeTab,
}: {
  logout: () => void;
  safetyOpen: boolean;
  setSafetyOpen: (open: boolean) => void;
  pushState: NotificationPermission;
  setPushState: (state: NotificationPermission) => void;
  activeTab: "book" | "history";
}): React.ReactElement {
  return (
    <div className="shell" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      <header className="topbar">
        <Link to="/" className="brand-badge">
          CHALO<span className="brand-accent">-X</span> RIDER
        </Link>
        <nav className="row" style={{ marginLeft: "auto", gap: 6 }}>
          <NavLink to="/book" className={({ isActive }) => `navlink ${isActive ? "active" : ""}`}>
            🚗 Book
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `navlink ${isActive ? "active" : ""}`}>
            🧾 Trips
          </NavLink>
          <button className="navlink" onClick={() => setSafetyOpen(true)}>
            🛡️ Safety
          </button>
          <button className="navlink" onClick={logout}>
            🚪 Logout
          </button>
        </nav>
        {pushSupported() && pushState !== "granted" && (
          <button
            className="brut-btn brut-btn-white brut-btn-sm desktop-alert"
            onClick={() => void enablePushNotifications().then(setPushState).catch(() => setPushState("denied"))}
          >
            🔔 Alerts
          </button>
        )}
      </header>
      {safetyOpen && <SafetyPanel onClose={() => setSafetyOpen(false)} />}
      <main className="main-area" style={{ flex: 1, position: "relative", overflow: "hidden", height: "100%", width: "100%" }}>
        {activeTab === "history" ? <History /> : <Book />}
      </main>
    </div>
  );
}

export default function App(): React.ReactElement {
  const [token, setTok] = useState<string | null>(getToken());
  const navigate = useNavigate();
  const [pushState, setPushState] = useState<NotificationPermission>(
    () => (pushSupported() ? Notification.permission : "denied"),
  );
  const [safetyOpen, setSafetyOpen] = useState(false);

  const sync = (): void => setTok(getToken());
  useEffect(() => {
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function logout(): void {
    setToken(null);
    setTok(null);
    navigate("/");
  }

  return (
    <Routes>
      {/* Route 1: Public Landing Page */}
      <Route
        path="/"
        element={
          <Landing
            audience="RIDER"
            onGetStarted={() => {
              if (token) {
                navigate("/book");
              } else {
                navigate("/login");
              }
            }}
            onSwitchPortal={() => window.open("http://localhost:5174/", "_blank")}
          />
        }
      />

      {/* Route 2: Login Page */}
      <Route
        path="/login"
        element={
          token ? (
            <Navigate to="/book" replace />
          ) : (
            <Login
              onAuth={() => {
                setTok(getToken());
                navigate("/book");
              }}
            />
          )
        }
      />

      {/* Route 3: Authenticated Rider Workspace (/book, /history) */}
      <Route
        path="/book"
        element={
          token ? (
            <RiderConsole
              logout={logout}
              safetyOpen={safetyOpen}
              setSafetyOpen={setSafetyOpen}
              pushState={pushState}
              setPushState={setPushState}
              activeTab="book"
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/history"
        element={
          token ? (
            <RiderConsole
              logout={logout}
              safetyOpen={safetyOpen}
              setSafetyOpen={setSafetyOpen}
              pushState={pushState}
              setPushState={setPushState}
              activeTab="history"
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
