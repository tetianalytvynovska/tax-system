import api from "../api";
import { useEffect, useMemo, useState } from "react";

export default function TaxReportsPage() {
  const [reports, setReports] = useState([]);
  const [taxes, setTaxes] = useState([]);

  const [selectedTaxId, setSelectedTaxId] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [address, setAddress] = useState("");

  const [editingReportId, setEditingReportId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [error, setError] = useState("");

  // Sign & send (mock)
  const [signModalReport, setSignModalReport] = useState(null);
  const [signKey, setSignKey] = useState("");
  const [signError, setSignError] = useState("");
  const [signSuccess, setSignSuccess] = useState("");
  const [signLoading, setSignLoading] = useState(false);

  // Filters
  const [filterTaxId, setFilterTaxId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const datesInvalid = useMemo(() => {
    if (!filterFrom || !filterTo) return false;
    return new Date(filterFrom) > new Date(filterTo);
  }, [filterFrom, filterTo]);

  /* ================= LOAD DATA ================= */

  const loadTaxes = async () => {
    try {
      const res = await api.get("/taxes");
      setTaxes(res.data || []);
    } catch (err) {
      console.error("Failed to load taxes:", err);
    }
  };

  const loadReports = async () => {
    try {
      const params = {};
      if (filterTaxId) params.taxDefinitionId = filterTaxId;
      if (filterFrom) params.fromDate = filterFrom;
      if (filterTo) params.toDate = filterTo;

      const res = await api.get("/tax/reports", { params });
      setReports(res.data || []);
    } catch (err) {
      console.error("Failed to load reports:", err);
    }
  };

  useEffect(() => {
    loadTaxes();
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= CALCULATIONS ================= */

  useEffect(() => {
    const t = taxes.find((x) => String(x.id) === String(selectedTaxId));
    setTaxRate(t ? Number(t.rate || 0) : 0);
  }, [selectedTaxId, taxes]);

  useEffect(() => {
    const base = Number(baseAmount || 0);
    const rate = Number(taxRate || 0);
    const amount = (base * rate) / 100;

    setTaxAmount(Number.isFinite(amount) ? amount : 0);
    setTotalAmount(Number.isFinite(base + amount) ? base + amount : 0);
  }, [baseAmount, taxRate]);

  /* ================= MENU CLOSE ================= */

  useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  /* ================= CRUD ================= */

  const handleEditReport = (report) => {
    if (report.status !== "заплановано") return;

    setEditingReportId(report.id);
    setSelectedTaxId(report.tax_definition_id);
    setBaseAmount(report.base_amount);
    setAddress(report.address || "");

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteReport = async (id) => {
    if (!window.confirm("Ви впевнені, що хочете видалити декларацію?")) return;

    try {
      await api.delete(`/tax/reports/${id}`);
      await loadReports();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.error || "Не вдалося видалити декларацію");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedTaxId) {
      setError("Оберіть тип податку");
      return;
    }

    const base = Number(baseAmount);
    if (!Number.isFinite(base) || base <= 0) {
      setError("Введіть базову суму");
      return;
    }

    try {
      if (editingReportId) {
        // UPDATE
        await api.patch(`/tax/reports/${editingReportId}`, {
          taxDefinitionId: Number(selectedTaxId),
          baseAmount: base,
          address: address || null,
        });
      } else {
        // CREATE
        await api.post("/tax/reports", {
          taxDefinitionId: Number(selectedTaxId),
          baseAmount: base,
          address: address || null,
        });
      }

      setSelectedTaxId("");
      setBaseAmount("");
      setAddress("");
      setEditingReportId(null);

      await loadReports();
    } catch (err) {
      console.error(err?.response?.data || err);
      setError(err?.response?.data?.error || "Не вдалося зберегти декларацію");
    }
  };

  /* ================= SIGN & SEND (MOCK) ================= */

  const openSignModal = (report) => {
    if (report.status !== "заплановано") return;
    setSignModalReport(report);
    setSignKey("");
    setSignError("");
    setSignSuccess("");
  };

  const closeSignModal = () => {
    setSignModalReport(null);
    setSignKey("");
    setSignError("");
    setSignSuccess("");
    setSignLoading(false);
  };

  const handleSignSend = async (e) => {
    e.preventDefault();
    if (!signModalReport) return;

    setSignError("");
    setSignSuccess("");

    const key = String(signKey || "").trim();
    if (!key || key.length < 6) {
      setSignError("Введіть тестовий ключ (мінімум 6 символів)");
      return;
    }

    try {
      setSignLoading(true);
      const res = await api.post(`/tax/reports/${signModalReport.id}/sign-send`, {
        key,
      });

      await loadReports();

      const hash = res?.data?.signatureHash;
      setSignSuccess(
        hash
          ? `Успішно підписано та “відправлено”. Хеш підпису: ${hash.slice(0, 16)}…`
          : "Успішно підписано та “відправлено”."
      );
    } catch (err) {
      console.error(err?.response?.data || err);
      setSignError(err?.response?.data?.error || "Не вдалося підписати декларацію");
    } finally {
      setSignLoading(false);
    }
  };

  /* ================= FILTERS ================= */

  const handleApplyFilters = async (e) => {
    e.preventDefault();
    if (!datesInvalid) await loadReports();
  };

  const handleResetFilters = async () => {
    setFilterTaxId("");
    setFilterFrom("");
    setFilterTo("");
    await loadReports();
  };

  /* ================= PDF ================= */

  const handleExportOfficialPdf = (id) => {
    const token = localStorage.getItem("taxagent_token");
    if (!token) return;

    const url = `http://localhost:5000/api/tax/reports/${id}/pdf?token=${encodeURIComponent(
      token
    )}`;
    window.open(url, "_blank");
  };

  /* ================= RENDER ================= */

  return (
    <div className="page">
      {signModalReport && (
        <div className="modal-backdrop" onClick={closeSignModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Підписати та відправити</div>
            <div className="modal-subtitle">
              Декларація від {new Date(signModalReport.created_at).toLocaleDateString("uk-UA")} • {signModalReport.tax_name || signModalReport.tax_type || "—"}
            </div>

            {signError && <div className="error-box">{signError}</div>}
            {signSuccess && <div className="success-box">{signSuccess}</div>}

            <form onSubmit={handleSignSend}>
              <div className="form-group">
                <label className="form-label">Тестовий ключ</label>
                <input
                  className="form-input"
                  type="password"
                  value={signKey}
                  onChange={(e) => setSignKey(e.target.value)}
                  disabled={signLoading || Boolean(signSuccess)}
                  placeholder="Введіть будь-який ключ…"
                />
                <div className="modal-hint">
                  Введіть ключ доступу в стандарті SHA-256
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeSignModal}
                  disabled={signLoading}
                >
                  Закрити
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={signLoading || Boolean(signSuccess)}
                >
                  {signSuccess
                  ? "Підписано"
                  : signLoading
                    ? "Підписання…"
                    : "Підписати"}

                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="tax-reports-layout">

        {/* LEFT */}
        <div className="card_user declaration-form">
          <div className="card-title">Нова декларація</div>

          {error && <div className="error-box">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Тип податку</label>
              <select
                className="form-input"
                value={selectedTaxId}
                onChange={(e) => setSelectedTaxId(e.target.value)}
              >
                <option value="">Оберіть податок</option>
                {taxes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Базова сума (грн)</label>
                <input
                  className="form-input"
                  type="number"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Ставка (%)</label>
                <input className="form-input" value={taxRate} disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Сума податку</label>
                <input className="form-input" value={taxAmount.toFixed(2)} disabled />
              </div>

              <div className="form-group">
                <label className="form-label">Разом до сплати</label>
                <input className="form-input" value={totalAmount.toFixed(2)} disabled />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Адреса (опційно)</label>
              <input
                className="form-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="form-actions-center">
              <button className="btn btn-primary" type="submit">
                {editingReportId ? "Зберегти зміни" : "Створити декларацію"}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT */}
        <div className="card_user declarations-list">
          <div className="card-title">Мої декларації</div>

          <form onSubmit={handleApplyFilters} className="filters">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Податок</label>
                <select
                  className="form-input"
                  value={filterTaxId}
                  onChange={(e) => setFilterTaxId(e.target.value)}
                >
                  <option value="">Всі</option>
                  {taxes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Від</label>
                <input
                  className="form-input"
                  type="date"
                  lang="uk-UA"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">До</label>
                <input
                  className="form-input"
                  type="date"
                  lang="uk-UA"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                />
              </div>
            </div>

            <div className="btn-row">
              <button className="btn btn-secondary" type="submit">Застосувати</button>
              <button className="btn btn-secondary" type="button" onClick={handleResetFilters}>
                Скинути
              </button>
            </div>
          </form>

          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Податок</th>
                <th>База</th>
                <th>Сума</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
                {reports.map((r) => {
                const isSubmitted = r.status === "подано";

                return (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleDateString("uk-UA")}</td>
                  <td>{r.tax_name || r.tax_type || "-"}</td>
                  <td>{Number(r.base_amount).toFixed(2)}</td>
                  <td>{Number(r.tax_amount).toFixed(2)}</td>
                  <td>
                    <span className={`status-pill status-${r.status}`}>{r.status}</span>
                  </td>
                  <td className="actions-cell">
                    <button className="btn btn-primary" onClick={() => handleExportOfficialPdf(r.id)}>
                      PDF
                    </button>

                    <button
                        className={`btn btn-primary btn-outline ${isSubmitted ? "btn-disabled" : ""}`}
                        disabled={isSubmitted}
                        onClick={() => !isSubmitted && openSignModal(r)}
                      >
                        Підписати та відправити
                      </button>

                    <div className="actions-menu-wrapper">
                      <button
                        className="actions-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === r.id ? null : r.id);
                        }}
                      >
                        ⋯
                      </button>

                      {openMenuId === r.id && (
                        <div className="actions-menu">
                          <button
                            className="actions-menu-item"
                            disabled={r.status !== "заплановано"}
                            onClick={() => handleEditReport(r)}
                          >
                            Редагувати
                          </button>
                          <button
                            className="actions-menu-item danger"
                            disabled={r.status !== "заплановано"}
                            onClick={() => handleDeleteReport(r.id)}
                          >
                            Видалити
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) })}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
