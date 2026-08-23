import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { getToken, setToken } from "./api";
import Login from "./screens/Login";
import Book from "./screens/Book";
import History from "./screens/History";

export default function App(): React.ReactElement {
  const [token, setTok] = useState<string | null>(getToken());
  const navigate = useNavigate();

  useEffect(() => {
    const sync = (): void => setTok(getToken());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function logout(): void {
    setToken(null);
    setTok(null);
    navigate("/login");
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
          token ? (
            <div className="shell">
              <header className="topbar">
                <div className="brand">
                  Chalo<span>-X</span> Rider
                </div>
                <nav className="row">
                  <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
                    Ride
                  </NavLink>
                  <NavLink to="/history" className={({ isActive }) => (isActive ? "active" : "")}>
                    History
                  </NavLink>
                  <button className="btn-ghost" onClick={logout}>
                    Log out
                  </button>
                </nav>
              </header>
              <main className="main-area">
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
