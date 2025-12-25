import api from "../api";
import { useEffect, useMemo, useState } from "react";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round((toNumber(n) + Number.EPSILON) * 100) / 100;
}

function money(n) {
  return `${round2(n).toFixed(2)} грн`;
}

function normStatus(s) {
  const v = String(s || "").trim().toLowerCase();
  if (v.includes("план")) return "заплановано";
  if (v.includes("под")) return "подано";
  if (v.includes("відх")) return "відхилено";
  return v || "невідомо";
}

function parseISODate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDateUA(dt) {
  if (!dt) return "-";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function buildConicGradient(segments) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let acc = 0;
  const parts = segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const from = (acc / total) * 100;
      acc += seg.value;
      const to = (acc / total) * 100;
      return `${seg.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
    });
  return `conic-gradient(${parts.join(", ")})`;
}

function Donut({ title, segments, subtitle }) {
  const gradient = buildConicGradient(segments);
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  return (
    <div className="dash-card">
      <div className="dash-card-head">
        <div>
          <div className="dash-card-title">{title}</div>
          {subtitle ? <div className="dash-card-subtitle">{subtitle}</div> : null}
        </div>
      </div>

      <div className="dash-split">
        <div className="donut-wrap" aria-label={title}>
          <div className="donut" style={{ background: gradient }}>
            <div className="donut-hole">
              <div className="donut-total">{total}</div>
              <div className="donut-caption">усього</div>
            </div>
          </div>
        </div>

        <div className="legend">
          {segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div key={s.label} className="legend-row">
                <span className="legend-dot" style={{ background: s.color }} />
                <span className="legend-label">{s.label}</span>
                <span className="legend-value">{s.value}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function Bars({ title, items, valueFormatter, subtitle }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="dash-card">
      <div className="dash-card-head">
        <div>
          <div className="dash-card-title">{title}</div>
          {subtitle ? <div className="dash-card-subtitle">{subtitle}</div> : null}
        </div>
      </div>
      <div className="bar-chart" role="img" aria-label={title}>
        {items.map((it) => (
          <div key={it.label} className="bar-row">
            <div className="bar-label">{it.label}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(it.value / max) * 100}%` }} />
            </div>
            <div className="bar-value">{valueFormatter(it.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniTimeline({ title, points, subtitle }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="dash-card">
      <div className="dash-card-head">
        <div>
          <div className="dash-card-title">{title}</div>
          {subtitle ? <div className="dash-card-subtitle">{subtitle}</div> : null}
        </div>
      </div>

      <div className="spark-wrap" role="img" aria-label={title}>
        <div className="spark-bars">
          {points.map((p) => (
            <div key={p.label} className="spark-col" title={`${p.label}: ${money(p.value)}`}>
              <div className="spark-bar" style={{ height: `${(p.value / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="spark-axis">
          <span>{points[0]?.label}</span>
          <span>{points.at(-1)?.label}</span>
        </div>
      </div>
    </div>
  );
}

function riskBadge(R, crit = 0.45) {
  if (R < crit * 0.55) return { text: "низький", cls: "badge badge-low" };
  if (R < crit) return { text: "середній", cls: "badge badge-mid" };
  return { text: "високий", cls: "badge badge-high" };
}

function computeRisk(report, weights, now = new Date()) {
  const base = toNumber(report.base_amount, 0);
  const rate = toNumber(report.tax_rate, 0);
  const tax = toNumber(report.tax_amount, 0);
  const total = toNumber(report.total_amount, 0);
  const created = parseISODate(report.created_at) || now;
  const due = parseISODate(report.due_date);

  // --- Nk (heuristics based on available fields) ---
  let N_data = 0;
  if (!report.tax_name && !report.tax_type) N_data += 1;
  if (!Number.isFinite(base)) N_data += 1;
  if (!Number.isFinite(rate)) N_data += 1;
  if (!Number.isFinite(tax)) N_data += 1;
  if (!report.status) N_data += 1;

  let N_arithm = 0;
  const expectedTax = round2((base * rate) / 100);
  if (Math.abs(expectedTax - round2(tax)) > 0.01) N_arithm += 1;
  const expectedTotal = round2(base + tax);
  if (Math.abs(expectedTotal - round2(total)) > 0.01) N_arithm += 1;

  let N_logic = 0;
  if (base < 0) N_logic += 1;
  if (tax < 0) N_logic += 1;
  if (rate < 0 || rate > 100) N_logic += 1;

  let N_reg = 0;
  if (due && due < created) N_reg += 1;
  if (normStatus(report.status) === "заплановано" && due && due < now) N_reg += 1;
  if (!report.declaration_number && normStatus(report.status) === "подано") N_reg += 1;

  // --- Mk (calibration constants) ---
  const M_data = 5;
  const M_arithm = 2;
  const M_logic = 3;
  const M_reg = 3;

  const R_data = clamp01(N_data / M_data);
  const R_arithm = clamp01(N_arithm / M_arithm);
  const R_logic = clamp01(N_logic / M_logic);
  const R_reg = clamp01(N_reg / M_reg);

  const a = toNumber(weights.alpha, 0.25);
  const b = toNumber(weights.beta, 0.25);
  const c = toNumber(weights.gamma, 0.25);
  const d = toNumber(weights.delta, 0.25);
  const wSum = a + b + c + d || 1;

  const R = clamp01((a * R_data + b * R_arithm + c * R_logic + d * R_reg) / wSum);
  return {
    R,
    R_data,
    R_arithm,
    R_logic,
    R_reg,
    expectedTax,
    expectedTotal,
    N_data,
    N_arithm,
    N_logic,
    N_reg
  };
}

export default function DashboardPage({ user }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [effectiveRate, setEffectiveRate] = useState("");

  // Mathematical model inputs (global, demo-friendly)
  const [C, setC] = useState(0); // expenses
  const [A, setA] = useState(0); // benefits
  const [Ymanual, setYmanual] = useState("");

  // Risk weights
  const [weights, setWeights] = useState({
    alpha: 0.25,
    beta: 0.25,
    gamma: 0.25,
    delta: 0.25
  });
  const [Rcrit, setRcrit] = useState(0.45);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/tax/reports");
        setReports(res.data || []);
      } catch (e) {
        console.error("Dashboard load error:", e);
        setError(e?.response?.data?.error || "Не вдалося завантажити дані");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const derived = useMemo(() => {
    const totalCount = reports.length;
    const planned = reports.filter((r) => normStatus(r.status) === "заплановано");
    const submitted = reports.filter((r) => normStatus(r.status) === "подано");

    // ✅ важливо: “сума до сплати” = tax_amount, а НЕ total_amount
    const plannedPayable = planned.reduce((sum, r) => sum + toNumber(r.tax_amount, 0), 0);
    const totalPayableAll = reports.reduce((sum, r) => sum + toNumber(r.tax_amount, 0), 0);
    const totalBaseAll = reports.reduce((sum, r) => sum + toNumber(r.base_amount, 0), 0);
    const avgRate = totalBaseAll > 0 ? (totalPayableAll / totalBaseAll) * 100 : 0;

    // Mathematical model (demo mapping)
const Ytot =
  Ymanual !== ""
    ? toNumber(Ymanual, 0)
    : 0;


const Y = toNumber(Ytot, 0);
const Ci = toNumber(C, 0);
const Ai = toNumber(A, 0);

const Bi = Math.max(0, Y - Ci - Ai);


const rate = toNumber(effectiveRate, 0);

const actualTax = round2((Bi * rate) / 100);



    // Risk
    const now = new Date();
    const perReportRisk = reports.map((r) => ({
      id: r.id,
      tax_name: r.tax_name,
      created_at: r.created_at,
      status: r.status,
      tax_amount: r.tax_amount,
      ...computeRisk(r, weights, now)
    }));

    const avgRisk =
      perReportRisk.length > 0
        ? perReportRisk.reduce((s, x) => s + x.R, 0) / perReportRisk.length
        : 0;

    const topRisk = [...perReportRisk].sort((a, b) => b.R - a.R).slice(0, 3);

    // Status distribution
    const statusCounts = reports.reduce((acc, r) => {
      const s = normStatus(r.status);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    // Colors tuned to your UI
    const statusSegments = [
      { label: "заплановано", value: statusCounts["заплановано"] || 0, color: "#93c5fd" },
      { label: "подано", value: statusCounts["подано"] || 0, color: "#86efac" },
      { label: "відхилено", value: statusCounts["відхилено"] || 0, color: "#fecaca" },
      {
        label: "інші",
        value:
          Object.entries(statusCounts)
            .filter(([k]) => !["заплановано", "подано", "відхилено"].includes(k))
            .reduce((s, [, v]) => s + v, 0) || 0,
        color: "#e5e7eb"
      }
    ];

    // Tax type distribution (payable)
    const byTax = reports.reduce((acc, r) => {
      const key = r.tax_name || r.tax_type || "Без назви";
      acc[key] = (acc[key] || 0) + toNumber(r.tax_amount, 0);
      return acc;
    }, {});
    const taxBars = Object.entries(byTax)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Timeline (last 14 days, payable)
    const days = 14;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const buckets = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }

    for (const r of reports) {
      const dt = parseISODate(r.created_at);
      if (!dt) continue;
      const key = dt.toISOString().slice(0, 10);
      if (buckets.has(key)) {
        buckets.set(key, buckets.get(key) + toNumber(r.tax_amount, 0));
      }
    }

    const timeline = Array.from(buckets.entries()).map(([iso, value]) => {
      const dt = parseISODate(iso);
      return { label: formatDateUA(dt).slice(0, 5), value };
    });

        return {
      totalCount,
      plannedCount: planned.length,
      submittedCount: submitted.length,
      plannedPayable,
      totalPayableAll,
      totalBaseAll,
      avgRate,
      Ytot,
      Bi,
      actualTax, // ✅ додали
      avgRisk,
      topRisk,
      perReportRisk,
      statusSegments,
      taxBars,
      timeline
    };

}, [reports, C, A, Ymanual, effectiveRate, weights]);


  const avgRiskBadge = riskBadge(derived.avgRisk, Rcrit);

  return (
    <div className="page">
      <div className="card">
        <div className="card-title">Аналітика за поточний рік</div>
        <div className="card-subtitle">
          Аналітика декларацій та розрахунок ризик‑індексу
        </div>

        <p className="muted-text">Вітаємо{user?.name ? `, ${user.name}` : ""}!</p>

        {error ? <div className="error-box">{error}</div> : null}

        {loading ? (
          <p className="muted-text">Завантаження...</p>
        ) : (
          <>
            <div className="card-grid" style={{ marginTop: 12 }}>
              <div className="stat-card">
                <div className="stat-label">Кількість декларацій</div>
                <div className="stat-value">{derived.totalCount}</div>
                <div className="stat-caption">за поточний рік</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Заплановано</div>
                <div className="stat-value">{derived.plannedCount}</div>
                <div className="stat-caption">готові до подачі</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Сума до сплати</div>
                <div className="stat-value">{money(derived.plannedPayable)}</div>
                <div className="stat-caption">
                  Загальна сума податків до сплати по запланованим деклараціям
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Середній ризик R</div>
                <div className="stat-value">
                  {(derived.avgRisk * 100).toFixed(0)}%{" "}
                  <span className={avgRiskBadge.cls}>{avgRiskBadge.text}</span>
                </div>
                <div className="stat-caption">інтегральний показник якості</div>
              </div>
            </div>

          <div className="dash-grid-analytics">
            <div className="dash-states">
             <Donut
  title="Стани декларацій"
  subtitle="розподіл за статусами"
  segments={derived.statusSegments}
/>

            </div>

            <div className="dash-tax-sum">
              <Bars
                title="Сума податку за видами"
                subtitle="на основі ваших декларацій"
                items={derived.taxBars}
                valueFormatter={(v) => money(v)}
              />
            </div>
          </div>


            <div className="dash-grid" style={{ marginTop: 14 }}>
              <div className="dash-card dash-card-wide">
                <div className="dash-card-head">
                  <div>
                    <div className="dash-card-title">Податкова математична модель</div>
                    <div className="dash-card-subtitle">
                      Демонстраційне узгодження з вашими даними декларацій
                    </div>
                  </div>
                </div>

                <div className="model-grid">
                 <div className="model-block">
                  <div className="model-label">Валовий дохід</div>

                  <input
                    className="form-input"
                    value={Ymanual}
                    onChange={(e) => setYmanual(e.target.value)}
                    inputMode="decimal"
                    placeholder="Введіть сумарний дохід"
                  />

                  <div className="model-hint">
                    Вкажіть Ваш загальний дохід, який підлягає оподаткуванню
                  </div>
                </div>
                  <div className="model-block">
                    <div className="model-label">Витрати</div>
                    <input
                      className="form-input"
                      value={C}
                      onChange={(e) => setC(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                    />
                    <div className="model-hint">Вкажіть витрати, що можна врахувати для зменшення бази</div>
                  </div>

                  <div className="model-block">
                    <div className="model-label">Пільги/знижки</div>
                    <input
                      className="form-input"
                      value={A}
                      onChange={(e) => setA(e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                    />
                    <div className="model-hint">Додаткове зменшення бази оподаткування (податкові знижки тощо)</div>
                  </div>

                                <div className="model-block">
                <div className="model-label">Ставка податку (%)</div>
                <input
                  className="form-input"
                  value={effectiveRate}
                  onChange={(e) => setEffectiveRate(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                />
                <div className="model-hint">
                  Введіть ставку податку для якої треба розрахувати показники
                </div>
                </div>

                </div>

                <div className="model-summary">
                <div className="model-block">
                  <div className="model-label">База оподаткування</div>
                  <div className="model-value">{money(derived.Bi)}</div>
                  {/* <div className="model-hint">
                   Валовий дохід − Витрати − Пільги
                  </div> */}
                </div>

                <div className="model-block">
                  <div className="model-label">Фактична сума податку</div>
                  <div className="model-value">{money(derived.actualTax)}</div>
                </div>
              </div>

              </div>

              <div className="dash-card dash-card-wide">
                <div className="dash-card-head">
                  <div>
                    <div className="dash-card-title">Ризик‑індекс</div>
                    <div className="dash-card-subtitle">
                      Нормована оцінка якості декларацій та ваги
                    </div>
                  </div>
                </div>

                <div className="risk-grid">
                  <div className="risk-weights">
                    <div className="risk-row">
                      <label className="risk-label">α (Rдані)</label>
                      <input
                        className="form-input"
                        value={weights.alpha}
                        disabled
                      />
                    </div>
                    <div className="risk-row">
                      <label className="risk-label">β (Rарифм)</label>
                      <input
                        className="form-input"
                        value={weights.beta}
                        disabled
                      />
                    </div>
                    <div className="risk-row">
                      <label className="risk-label">γ (Rлогіка)</label>
                      <input
                        className="form-input"
                        value={weights.gamma}
                        disabled
                      />
                    </div>
                    <div className="risk-row">
                      <label className="risk-label">δ (Rрегламент)</label>
                      <input
                        className="form-input"
                        value={weights.delta}
                        disabled
                      />
                    </div>

                    <div className="risk-row" style={{ marginTop: 10 }}>
                      <label className="risk-label">Поріг Rкр</label>
                      <input
                        className="form-input"
                        value={Rcrit}
                        disabled
                      />
                    </div>
                    <div className="risk-hint">
                      Підказка: якщо R ≥ Rкр — декларація вважається “ризиковою”.
                    </div>
                  </div>

                  <div className="risk-summary">
                    <div className="risk-kpi">
                      <div className="risk-kpi-label">Середній R</div>
                      <div className="risk-kpi-value">
                        {(derived.avgRisk * 100).toFixed(1)}%{" "}
                        <span className={avgRiskBadge.cls}>{avgRiskBadge.text}</span>
                      </div>
                    </div>

                    <div className="risk-top">
                      <div className="risk-top-title">Топ ризикових декларацій</div>
                      {derived.topRisk.length === 0 ? (
                        <div className="muted-text">Немає даних</div>
                      ) : (
                        derived.topRisk.map((r) => {
                          const b = riskBadge(r.R, Rcrit);
                          return (
                            <div key={r.id} className="risk-item">
                              <div className="risk-item-main">
                                <div className="risk-item-name">
                                  #{r.id} • {r.tax_name || "Декларація"}
                                </div>
                                <div className="risk-item-meta">
                                  {formatDateUA(parseISODate(r.created_at))} • {normStatus(r.status)}
                                </div>
                              </div>
                              <div className="risk-item-right">
                                <div className={b.cls}>{b.text}</div>
                                <div className="risk-item-score">R={(r.R * 100).toFixed(0)}%</div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
