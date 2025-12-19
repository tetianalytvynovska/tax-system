import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000";

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const token = localStorage.getItem("taxagent_token");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/admin/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    if (token) fetchData();
  }, [token]);

  return (
    <div style={{ padding: "30px 40px" }}>
      {/* TITLE */}
      <h1 style={{ fontSize: 32, marginBottom: 4 }}>Адміністративна панель</h1>
      <p style={{ marginBottom: 32, color: "#6b7280" }}>
        Управління користувачами, звітами та налаштуваннями системи.
      </p>

      {/* TOP STATS */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "20px",
        marginBottom: 40
      }}>
        <StatCard value={data?.users_total} label="Користувачі" />
        <StatCard value={data?.reports_active} label="Активні звіти" />
        <StatCard value={data?.reports_pending} label="На перевірці" />
        <StatCard value={data?.reports_completed} label="Завершено" />
      </div>

      {/* GRID 2x2 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "28px"
      }}>
        <UsersCard users={data?.latest_users || []} />
        <ReportsCard reports={data?.latest_reports || []} />
        <SettingsCard />
        <StatsCard />
      </div>
    </div>
  );
}

/* --------------- COMPONENTS ---------------- */

function StatCard({ value = 0, label }) {
  return (
    <div style={styles.card}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function UsersCard({ users }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Користувачі</h2>

      {users.length === 0 && (
        <p style={styles.muted}>Немає зареєстрованих користувачів.</p>
      )}

      <ul style={styles.list}>
        {users.map(u => (
          <li key={u.id} style={styles.listItem}>{u.email}</li>
        ))}
      </ul>

      <a href="#" style={styles.link}>Переглянути всіх</a>
    </div>
  );
}

function ReportsCard({ reports }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Звіти</h2>

      {reports.length === 0 && (
        <p style={styles.muted}>Ще немає поданих декларацій.</p>
      )}

      <ul style={styles.list}>
        {reports.map(r => (
          <li key={r.id} style={styles.listItem}>
            Звіт від {r.user_email}
          </li>
        ))}
      </ul>

      <a href="#" style={styles.link}>Переглянути всі</a>
    </div>
  );
}

function SettingsCard() {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Налаштування</h2>

      <ul style={styles.list}>
        <li style={styles.listItem}>Шаблони звітів</li>
        <li style={styles.listItem}>Безпека</li>
        <li style={styles.listItem}>Сповіщення</li>
      </ul>
    </div>
  );
}

function StatsCard() {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Статистика</h2>

      <p>Звітів на день: <b>5–8</b></p>
      <p>Час обробки: <b>2–3 дні</b></p>
      <p>Якість: <b>94%</b></p>
    </div>
  );
}

/* --------------- STYLES ---------------- */

const styles = {
  card: {
    background: "#fff",
    borderRadius: 20,
    padding: "24px 28px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
  },
  statValue: {
    fontSize: 34,
    fontWeight: 600,
    color: "#111",
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 16,
    color: "#6b7280"
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 12
  },
  muted: {
    color: "#6b7280"
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 16px 0"
  },
  listItem: {
    padding: "6px 0",
    borderBottom: "1px solid #e5e7eb"
  },
  link: {
    color: "#2563eb",
    fontSize: 16,
    textDecoration: "none",
    fontWeight: 500
  }
};
