import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";

import HomePage from "./pages/Home";
import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import Admin2FAPage from "./pages/Admin2FA";
import AdminDashboardPage from "./pages/AdminDashboard";
import AdminPage from "./pages/Admin";
import DashboardPage from "./pages/Dashboard";
import TaxReportsPage from "./pages/TaxReports";

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
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = localStorage.getItem("taxagent_token");
    const u = localStorage.getItem("taxagent_user");
    if (t && u) {
      setToken(t);
      try {
        setUser(JSON.parse(u));
      } catch {
        setUser(null);
      }
    }
  }, []);

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
      navigate("/dashboard");
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("taxagent_token");
    localStorage.removeItem("taxagent_user");
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-logo">TaxAgent</div>
        <nav className="app-nav">
          <NavLink to="/">Головна</NavLink>
          {user && user.role === "Administrator" && (
            <>
              <NavLink to="/admin">Адмін дашборд</NavLink>
              <NavLink to="/admin-taxes">Довідники та звітність</NavLink>
            </>
          )}
          {user && user.role !== "Administrator" && (
            <>
              <NavLink to="/dashboard">Кабінет</NavLink>
              <NavLink to="/reports">Звіти</NavLink>
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
            <>
              <span style={{ fontSize: 12, marginRight: 8 }}>
                {user.email} ({user.role === "Administrator" ? "адмін" : "користувач"})
              </span>
              <button className="btn btn-secondary" onClick={handleLogout}>
                Вийти
              </button>
            </>
          )}
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage user={user} />} />
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
        </Routes>
      </main>
      <footer className="app-footer">
        TaxAgent · демоверсія для дипломного проєкту
      </footer>
    </div>
  );
}