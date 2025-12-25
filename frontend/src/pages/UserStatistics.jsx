import { useEffect, useMemo, useState } from "react";
import api from "../api";

function moneyUAH(v) {
  const n = Number(v) || 0;
  return (
    n
      .toFixed(0)
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₴"
  );
}

function moneyUAH2(v) {
  const n = Number(v) || 0;
  return (
    n
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₴"
  );
}

function formatDateUA(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("uk-UA");
}

function addDays(dateStr, days) {
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return null;
  const x = new Date(dt);
  x.setDate(x.getDate() + (Number(days) || 0));
  return x.toISOString();
}

export default function UserStatisticsPage() {
  const [reports, setReports] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("taxagent_user") || "null");
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [rRes, tRes] = await Promise.all([
          api.get("/tax/reports"),
          api.get("/taxes"),
        ]);
        if (!mounted) return;
        setReports(Array.isArray(rRes.data) ? rRes.data : []);
        setTaxes(Array.isArray(tRes.data) ? tRes.data : []);
      } catch (e) {
        if (!mounted) return;
        setError(e?.response?.data?.error || "Не вдалося завантажити дані");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const derived = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();

    const taxById = new Map();
    taxes.forEach((t) => taxById.set(t.id, t));

    const inYear = (r) => {
      const d = new Date(r.created_at || r.date || r.createdAt || "");
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === year;
    };

    // "Не реджекнуті" — у нас у демо немає rejected, але залишаємо фільтр на майбутнє
    const notRejected = (r) => String(r.status || "").toLowerCase() !== "rejected";

    const yearReports = (reports || []).filter((r) => inYear(r) && notRejected(r));

    const sumAll = yearReports.reduce((acc, r) => acc + (Number(r.tax_amount) || 0), 0);
    const sumSubmitted = yearReports
      .filter((r) => r.status === "подано")
      .reduce((acc, r) => acc + (Number(r.tax_amount) || 0), 0);
    const sumPlanned = yearReports
      .filter((r) => r.status === "заплановано")
      .reduce((acc, r) => acc + (Number(r.tax_amount) || 0), 0);
    const submittedCount = yearReports.filter((r) => r.status === "подано").length;

    const plannedList = yearReports
      .filter((r) => r.status === "заплановано")
      .map((r) => {
        const def = taxById.get(r.tax_definition_id);
        const dueIso = r.due_date
          ? new Date(r.due_date).toISOString()
          : addDays(r.created_at, def?.term_days || 0);
        return { ...r, _taxDef: def, _dueIso: dueIso };
      })
      .sort((a, b) => {
        const da = a._dueIso ? new Date(a._dueIso).getTime() : 0;
        const db = b._dueIso ? new Date(b._dueIso).getTime() : 0;
        return da - db;
      });

    const recentList = [...yearReports]
      .sort((a, b) => {
        const da = new Date(a.created_at || 0).getTime();
        const db = new Date(b.created_at || 0).getTime();
        return db - da;
      })
      .map((r) => ({ ...r, _taxDef: taxById.get(r.tax_definition_id) }));

    // For headline cards we mimic the screenshot semantics:
    // Total taxes for year = sum of tax_amount, Paid = sum of submitted, Due = sum of planned
    return {
      year,
      yearReports,
      sumAll,
      sumSubmitted,
      sumPlanned,
      submittedCount,
      plannedList,
      recentList,
    };
  }, [reports, taxes]);

  return (
    <div className="dash-container user-stats">
      <div className="user-stats-header">
        <h1>Особистий кабінет</h1>
        <p>
          Ласкаво просимо{user?.name ? ", " + user.name : ""}! Нижче — зведена
          інформація про ваші податки.
        </p>
      </div>

      {loading && <div className="hint">Завантаження…</div>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="user-stats-top">
            <div className="user-stat-card">
              <div className="user-stat-value">{moneyUAH(derived.sumAll)}</div>
              <div className="user-stat-label">Загальна сума податків за рік</div>
            </div>
            <div className="user-stat-card">
              <div className="user-stat-value">{moneyUAH(derived.sumSubmitted)}</div>
              <div className="user-stat-label">Сплачено</div>
            </div>
            <div className="user-stat-card">
              <div className="user-stat-value">{moneyUAH(derived.sumPlanned)}</div>
              <div className="user-stat-label">До сплати</div>
            </div>
            <div className="user-stat-card">
              <div className="user-stat-value">{derived.submittedCount}</div>
              <div className="user-stat-label">Звітів подано у {derived.year}</div>
            </div>
          </div>

          <div className="user-stats-columns">
            <div className="user-stats-col">
              <h2>Чекаємо на оплату</h2>
              <div className="user-stats-list">
                {derived.plannedList.length === 0 ? (
                  <div className="hint">Немає декларацій зі статусом “заплановано”.</div>
                ) : (
                  derived.plannedList.slice(0, 3).map((r) => (
                    <div key={r.id} className="user-item-card">
                      <div className="user-item-top">
                        <div className="user-item-title">
                          {r._taxDef?.name || r.tax_type || r.title || "Декларація"}
                        </div>
                        <div className="user-item-badge badge-warn">до сплати</div>
                      </div>
                      <div className="user-item-sub">
                        Строк сплати: {formatDateUA(r._dueIso)}
                      </div>
                      <div className="user-item-amount">{moneyUAH2(r.tax_amount)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="user-stats-col">
              <h2>Останні звіти</h2>
              <div className="user-stats-list">
                {derived.recentList.length === 0 ? (
                  <div className="hint">Немає декларацій за поточний рік.</div>
                ) : (
                  derived.recentList
                    .filter((r) => r.status === "подано")
                    .slice(0, 3)
                    .map((r) => (
                      <div key={r.id} className="user-item-card user-item-card--compact">
                        <div className="user-item-top">
                          <div className="user-item-title">
                            {r.title || r._taxDef?.name || "Звіт"}
                          </div>
                          <div className="user-item-badge badge-ok">прийнята</div>
                        </div>
                        <div className="user-item-amount">{moneyUAH(r.base_amount)}</div>
                      </div>
                    ))
                )}

                {/* fallback: if no submitted in year, show latest any */}
                {derived.recentList.filter((r) => r.status === "подано").length === 0 &&
                  derived.recentList.slice(0, 3).map((r) => (
                    <div key={r.id} className="user-item-card user-item-card--compact">
                      <div className="user-item-top">
                        <div className="user-item-title">
                          {r.title || r._taxDef?.name || "Звіт"}
                        </div>
                        <div
                          className={
                            "user-item-badge " +
                            (r.status === "заплановано" ? "badge-warn" : "badge-neutral")
                          }
                        >
                          {r.status || "—"}
                        </div>
                      </div>
                      <div className="user-item-amount">{moneyUAH(r.base_amount)}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
