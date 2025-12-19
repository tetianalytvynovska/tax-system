import api from "../api";
import { useEffect, useState } from "react";


const API_URL = "http://localhost:5000";

export default function DashboardPage({ user }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("taxagent_token");
    if (!token) return;
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/tax/reports`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const reports = res.data || [];
        const totalPlanned = reports.reduce(
          (sum, r) => sum + (r.status === "заплановано" ? r.total_amount : 0),
          0
        );
        const totalCount = reports.length;
        setStats({ totalPlanned, totalCount });
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="page">
      <div className="card">
        <div className="card-title">Особистий кабінет</div>
        <p>
          Вітаємо, <b>{user?.name}</b>!
        </p>
        <p className="muted-text">
          Тут відображається коротка інформація про ваші податкові декларації.
        </p>
      </div>
      <div className="card">
        <div className="card-title">Статистика по деклараціях</div>
        {stats ? (
          <>
            <p>
              Кількість декларацій: <b>{stats.totalCount}</b>
            </p>
            <p>
              Сума до сплати (за статусом &quot;заплановано&quot;):{" "}
              <b>{stats.totalPlanned.toFixed(2)} грн</b>
            </p>
          </>
        ) : (
          <p className="muted-text">Завантаження...</p>
        )}
      </div>
    </div>
  );
}