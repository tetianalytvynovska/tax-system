import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";

const API_URL = "http://localhost:5000";
const ADMIN_EMAIL = "tetianalytvynovska@gmail.com";

export default function LoginPage({ onAuth }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await axios.post(`${API_URL}/api/login`, {
        email,
        password
      });
      if (res.data.error) {
        setError(res.data.error);
      } else if (res.data.requires2FA && email === ADMIN_EMAIL) {
        navigate("/admin-2fa");
      } else if (res.data.token) {
        onAuth(res.data);
      } else {
        setError("Невідома відповідь сервера");
      }
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Помилка під час входу. Спробуйте ще раз.");
      }
    }
  };

  return (
    <div className="page" style={{ alignItems: "center" }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <div className="card-title">Вхід до особистого кабінету</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 8 }}
          >
            Увійти
          </button>
        </form>
        <div className="muted-text" style={{ marginTop: 8 }}>
          Немає акаунта? <Link to="/register">Зареєструватися</Link>
        </div>
      </div>
    </div>
  );
}