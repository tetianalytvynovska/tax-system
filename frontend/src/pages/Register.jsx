import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const API_URL = "http://localhost:5000";

export default function RegisterPage({ onAuth }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ipn, setIpn] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await axios.post(`${API_URL}/api/register`, {
        name,
        email,
        ipn,
        password
      });
      if (res.data.error) {
        setError(res.data.error);
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
        setError("Не вдалося зареєструватися. Спробуйте ще раз.");
      }
    }
  };

  return (
    <div className="page" style={{ alignItems: "center" }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <div className="card-title">Реєстрація користувача</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">ПІБ</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">РНОКПП / ІПН</label>
            <input
              className="form-input"
              value={ipn}
              onChange={(e) => setIpn(e.target.value)}
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
            Зареєструватися
          </button>
        </form>
        <div className="muted-text" style={{ marginTop: 8 }}>
          Вже маєте акаунт? <Link to="/login">Увійти</Link>
        </div>
      </div>
    </div>
  );
}