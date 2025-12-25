import { useEffect, useState } from "react";
import {
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import axios from "axios";

import HomePage from "./pages/Home";
import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import Admin2FAPage from "./pages/Admin2FA";
import AdminDashboardPage from "./pages/AdminDashboard";
import AdminPage from "./pages/Admin";
import DashboardPage from "./pages/Dashboard";
import TaxReportsPage from "./pages/TaxReports";
import UserStatisticsPage from "./pages/UserStatistics";

const API_URL = "http://localhost:5000";

function NavLink({ to, children }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link to={to} className={isActive ? "active-link" : ""}>
      {children}
    </Link>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem("taxagent_user");
    if (!u) return null;
    try {
      return JSON.parse(u);
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("taxagent_token"));
  const navigate = useNavigate();
  const location = useLocation();

  const isPublicLanding = !user && location.pathname === "/";

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [token]);

  const handleAuth = (payload) => {
    setUser(payload.user);
    setToken(payload.token);
    localStorage.setItem("taxagent_token", payload.token);
    localStorage.setItem("taxagent_user", JSON.stringify(payload.user));
    if (payload.user && payload.user.role === "Administrator") {
      navigate("/admin");
    } else {
      navigate("/statistics");
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("taxagent_token");
    localStorage.removeItem("taxagent_user");
    navigate("/");
  };

  return (
    <div className="app-shell">
      {!isPublicLanding && (
        <header className="app-header">
          <div className="app-logo">TaxAgent</div>
          <nav className="app-nav">
            {!user && <NavLink to="/">Головна</NavLink>}

            {user && user.role === "Administrator" && (
              <>
                <NavLink to="/admin">Адмін дашборд</NavLink>
                <NavLink to="/admin-taxes">Довідники та звітність</NavLink>
              </>
            )}

            {user && user.role !== "Administrator" && (
              <>
                <NavLink to="/statistics">Home</NavLink>
                <NavLink to="/reports">Декларації</NavLink>
                <NavLink to="/dashboard">Дашборди та розрахунки</NavLink>
              </>
            )}

            {!user && (
              <>
                <NavLink to="/login">Вхід</NavLink>
                <NavLink to="/register">Реєстрація</NavLink>
              </>
            )}
          </nav>

          <div>
            {user && (
              <button className="btn btn-secondary" onClick={handleLogout}>
                Вийти
              </button>
            )}
          </div>
        </header>
      )}

      <main className={isPublicLanding ? "landing-main" : "app-main"}>
        <Routes>
          <Route
            path="/"
            element={
              user ? (
                <Navigate
                  to={user.role === "Administrator" ? "/admin" : "/dashboard"}
                  replace
                />
              ) : (
                <HomePage />
              )
            }
          />
          <Route path="/login" element={<LoginPage onAuth={handleAuth} />} />
          <Route path="/register" element={<RegisterPage onAuth={handleAuth} />} />
          <Route
            path="/admin-2fa"
            element={<Admin2FAPage onAuth={handleAuth} />}
          />
          <Route
            path="/admin"
            element={
              user ? (
                user.role === "Administrator" ? (
                  <AdminDashboardPage />
                ) : (
                  <DashboardPage user={user} />
                )
              ) : (
                <LoginPage onAuth={handleAuth} />
              )
            }
          />
          <Route
            path="/admin-taxes"
            element={
              user ? (
                user.role === "Administrator" ? (
                  <AdminPage />
                ) : (
                  <DashboardPage user={user} />
                )
              ) : (
                <LoginPage onAuth={handleAuth} />
              )
            }
          />
          <Route
            path="/dashboard"
            element={
              user ? (
                user.role === "Administrator" ? (
                  <AdminDashboardPage />
                ) : (
                  <DashboardPage user={user} />
                )
              ) : (
                <LoginPage onAuth={handleAuth} />
              )
            }
          />
          <Route
            path="/reports"
            element={
              user ? (
                user.role === "Administrator" ? (
                  <AdminDashboardPage />
                ) : (
                  <TaxReportsPage />
                )
              ) : (
                <LoginPage onAuth={handleAuth} />
              )
            }
          />

          <Route
            path="/statistics"
            element={
              user ? (
                user.role === "Administrator" ? (
                  <AdminDashboardPage />
                ) : (
                  <UserStatisticsPage />
                )
              ) : (
                <LoginPage onAuth={handleAuth} />
              )
            }
          />
        </Routes>
      </main>

      {!isPublicLanding && (
        <footer className="app-footer">TaxAgent · демоверсія інформаційної системи супроводу податкової звітності фізичних осіб</footer>
      )}
    </div>
  );
}