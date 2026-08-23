import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { getToken, setToken } from "./api";
import Login from "./screens/Login";
import { Landing } from "./components/Landing";
import Book from "./screens/Book";
import History from "./screens/History";

export default function App(): React.ReactElement {
  const [token, setTok] = useState<string | null>(getToken());
  const [showLanding, setShowLanding] = useState(true);
  const navigate = useNavigate();

  // Returning users skip the landing page
  useEffect(() => {
    if (localStorage.getItem("chalox.rider.seenLanding")) setShowLanding(false);
  }, []);

  const sync = (): void => setTok(getToken());
  useEffect(() => {
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function logout(): void {
    setToken(null);
    setTok(null);
    navigate("/login");
  }

  function markLandingSeen(): void {
    localStorage.setItem("chalox.rider.seenLanding", "1");
    setShowLanding(false);
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <Login onAuth={() => setTok(getToken())} />}
      />
      <Route
        path="*"
        element={
          !token && showLanding ? (
            <Landing
              audience="RIDER"
              onGetStarted={() => {
                markLandingSeen();
                navigate("/login");
              }}
              onDriverLogin={() => window.open("http://localhost:5174/", "_blank")}
            />
          ) : token ? (
            <div className="shell" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <header className="topbar">
                <div className="brand">
                  CHALO<span style={{ color: "#fff", WebkitTextStroke: "1px var(--ink)" }}>-X</span> RIDER
                </div>
                <nav className="row" style={{ marginLeft: "auto" }}>
                  <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
                    🚗 Ride
                  </NavLink>
                  <NavLink to="/history" className={({ isActive }) => (isActive ? "active" : "")}>
                    🧾 History
                  </NavLink>
                  <button className="navlink" onClick={logout}>
                    Log out
                  </button>
                </nav>
              </header>
              <main className="main-area" style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                <Routes>
                  <Route path="/history" element={<History />} />
                  <Route path="*" element={<Book />} />
                </Routes>
              </main>
            </div>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
