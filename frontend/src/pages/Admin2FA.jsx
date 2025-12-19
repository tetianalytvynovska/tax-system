import { useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000";
const ADMIN_EMAIL = "tetianalytvynovska@gmail.com";

export default function Admin2FAPage({ onAuth }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(
    "На email адміністратора надіслано код. Введіть його для входу в адмін-панель."
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await axios.post(`${API_URL}/api/admin/verify-2fa`, {
        email: ADMIN_EMAIL,
        code
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
        setError("Не вдалося підтвердити код.");
      }
    }
  };

  return (
    <div className="page" style={{ alignItems: "center" }}>
      <div className="card" style={{ maxWidth: 420, width: "100%" }}>
        <div className="card-title">Підтвердження входу адміністратора</div>
        <p className="muted-text">{info}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Код з email</label>
            <input
              className="form-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 8 }}
          >
            Підтвердити
          </button>
        </form>
      </div>
    </div>
  );
}