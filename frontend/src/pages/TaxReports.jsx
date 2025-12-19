import api from "../api";
import { useEffect, useState, useMemo } from "react";


const API_URL = "http://localhost:5000";

export default function TaxReportsPage() {
  const [reports, setReports] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [selectedTaxId, setSelectedTaxId] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  const [filterTaxId, setFilterTaxId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const token = localStorage.getItem("taxagent_token");
  const authHeaders = {
    Authorization: `Bearer ${token}`
  };

  const datesInvalid = useMemo(() => {
    return filterFrom && filterTo && filterFrom > filterTo;
  }, [filterFrom, filterTo]);

  const loadTaxes = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/taxes`, {
        headers: authHeaders
      });
      setTaxes(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadReports = async () => {
    try {
      const params = {};
      if (filterTaxId) params.taxDefinitionId = filterTaxId;
      if (filterFrom) params.fromDate = filterFrom;
      if (filterTo) params.toDate = filterTo;

      const res = await axios.get(`${API_URL}/api/tax/reports`, {
        headers: authHeaders,
        params
      });
      setReports(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (token) {
      loadTaxes();
      loadReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const recalc = (base, rate) => {
    const b = Number(base);
    const r = Number(rate);
    if (Number.isNaN(b) || Number.isNaN(r)) {
      setTaxAmount(0);
      setTotalAmount(0);
      return;
    }
    const t = Number(((b * r) / 100).toFixed(2));
    const total = Number((b + t).toFixed(2));
    setTaxAmount(t);
    setTotalAmount(total);
  };

  const handleChangeTaxNew = (e) => {
    const id = e.target.value;
    setSelectedTaxId(id);
    const def = taxes.find((t) => String(t.id) === id);
    if (def) {
      setTaxRate(def.rate);
      recalc(baseAmount, def.rate);
    } else {
      setTaxRate(0);
      recalc(baseAmount, 0);
    }
  };

  const handleChangeBase = (e) => {
    const value = e.target.value;
    setBaseAmount(value);
    recalc(value, taxRate);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!selectedTaxId) {
      setError("Оберіть тип податку");
      return;
    }
    if (!baseAmount) {
      setError("Введіть базову суму");
      return;
    }
    try {
      await axios.post(
        `${API_URL}/api/tax/reports`,
        {
          taxDefinitionId: Number(selectedTaxId),
          baseAmount: Number(baseAmount),
          address: address || undefined
        },
        { headers: authHeaders }
      );
      setBaseAmount("");
      setTaxRate(0);
      setTaxAmount(0);
      setTotalAmount(0);
      setSelectedTaxId("");
      setAddress("");
      await loadReports();
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Не вдалося створити декларацію");
      }
    }
  };

  const handleApplyFilters = async (e) => {
    e.preventDefault();
    if (datesInvalid) return;
    await loadReports();
  };

  const handleResetFilters = async () => {
    setFilterTaxId("");
    setFilterFrom("");
    setFilterTo("");
    await loadReports();
  };

  const handleExportOfficialPdf = (id) => {
    const t = localStorage.getItem("taxagent_token");
    if (!t) return;
    const url = `${API_URL}/api/tax/reports/${id}/pdf?token=${encodeURIComponent(
      t
    )}`;
    window.open(url, "_blank");
  };

  return (
    <div className="page">
      <div className="card">
        <div className="card-title">Нова декларація</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Тип податку</label>
            <select
              className="form-input"
              value={selectedTaxId}
              onChange={handleChangeTaxNew}
              required
            >
              <option value="">Оберіть податок</option>
              {taxes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.rate}%)
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Базова сума</label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={baseAmount}
              onChange={handleChangeBase}
              placeholder="Наприклад: 100000"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              Адреса об&apos;єкта оподаткування (опційно)
            </label>
            <input
              className="form-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="м. Київ, вул. Прикладна, 1"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Ставка, %</label>
            <input
              className="form-input"
              type="number"
              value={taxRate}
              readOnly
            />
          </div>
          <div className="form-group">
            <label className="form-label">Сума податку</label>
            <input
              className="form-input"
              type="number"
              value={taxAmount}
              readOnly
            />
          </div>
          <div className="form-group">
            <label className="form-label">Усього до сплати</label>
            <input
              className="form-input"
              type="number"
              value={totalAmount}
              readOnly
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          <button type="submit" className="btn btn-primary">
            Зберегти декларацію
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Фільтри</div>
        <form onSubmit={handleApplyFilters}>
          <div className="filters-row">
            <div className="form-group">
              <label className="form-label">Тип податку</label>
              <select
                className="form-input"
                value={filterTaxId}
                onChange={(e) => setFilterTaxId(e.target.value)}
              >
                <option value="">Усі</option>
                {taxes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Дата з</label>
              <input
                className="form-input"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Дата по</label>
              <input
                className="form-input"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>
            <div className="form-group">
              <button type="submit" className="btn btn-primary">
                Застосувати
              </button>
            </div>
            <div className="form-group">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleResetFilters}
              >
                Скинути
              </button>
            </div>
          </div>
        </form>
        {datesInvalid && (
          <div className="error-text" style={{ marginTop: 6 }}>
            Дата &quot;до&quot; не може бути раніше, ніж дата &quot;з&quot;.
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Мої декларації</div>
        {reports.length === 0 ? (
          <div className="muted-text">Поки що немає декларацій</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>№ декларації</th>
                <th>Тип податку</th>
                <th>База</th>
                <th>Ставка</th>
                <th>Сума податку</th>
                <th>Усього</th>
                <th>Термін сплати</th>
                <th>Статус</th>
                <th>Дата створення</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.declaration_number || r.id}</td>
                  <td>{r.tax_type}</td>
                  <td>{r.base_amount}</td>
                  <td>{r.tax_rate}%</td>
                  <td>{r.tax_amount}</td>
                  <td>{r.total_amount}</td>
                  <td>{r.due_date || "-"}</td>
                  <td>{r.status}</td>
                  <td>{r.created_at}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleExportOfficialPdf(r.id)}
                    >
                      Офіційний PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}