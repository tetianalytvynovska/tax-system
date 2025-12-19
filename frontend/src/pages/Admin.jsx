import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000";

export default function AdminPage() {
  const [taxes, setTaxes] = useState([]);
  const [loadingTaxes, setLoadingTaxes] = useState(false);
  const [editing, setEditing] = useState(null);
  const [errorTax, setErrorTax] = useState("");

  const emptyForm = {
    id: null,
    name: "",
    code: "",
    rate: "",
    due_days: "",
    description: ""
  };
  const [form, setForm] = useState(emptyForm);

  const [summary, setSummary] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [filterTaxId, setFilterTaxId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterError, setFilterError] = useState("");

  const token = localStorage.getItem("taxagent_token");

  const authHeaders = {
    Authorization: `Bearer ${token}`
  };

  const datesInvalid = useMemo(() => {
    return filterFrom && filterTo && filterFrom > filterTo;
  }, [filterFrom, filterTo]);

  const loadTaxes = async () => {
    try {
      setLoadingTaxes(true);
      const res = await axios.get(`${API_URL}/api/admin/taxes`, {
        headers: authHeaders
      });
      setTaxes(res.data || []);
    } catch (err) {
      console.error(err);
      setErrorTax("Не вдалося завантажити довідник податків");
    } finally {
      setLoadingTaxes(false);
    }
  };

  const loadSummary = async () => {
    // очищення старої помилки
    setFilterError("");

    try {
      setLoadingSummary(true);
      const params = {};
      if (filterTaxId) params.taxDefinitionId = filterTaxId;
      if (filterFrom) params.fromDate = filterFrom;
      if (filterTo) params.toDate = filterTo;

      const res = await axios.get(`${API_URL}/api/admin/tax-summary`, {
        headers: authHeaders,
        params
      });

      setSummary(res.data || []);
    } catch (err) {
      console.error(err);

      // очищаємо таблицю, щоб не відображалися старі дані
      setSummary([]);

      if (err.response?.data?.error) {
        setFilterError(err.response.data.error);
      } else {
        setFilterError("Помилка сервера. Спробуйте ще раз.");
      }
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    const t = localStorage.getItem("taxagent_token");
    if (t) {
      loadTaxes();
      loadSummary();
    }
  }, []);


  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrorTax("");
  };

  const startEdit = (tax) => {
    setEditing(tax);
    setForm({
      id: tax.id,
      name: tax.name,
      code: tax.code,
      rate: tax.rate,
      due_days: tax.due_days ?? "",
      description: tax.description ?? ""
    });
    setErrorTax("");
  };

  const handleChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorTax("");

    try {
      const payload = {
        name: form.name,
        code: form.code,
        rate: Number(form.rate),
        dueDays: form.due_days !== "" ? Number(form.due_days) : null,
        description: form.description
      };

      if (!form.name || !form.code || form.rate === "") {
        setErrorTax("Назва, код та ставка податку є обов'язковими");
        return;
      }

      if (editing) {
        await axios.put(`${API_URL}/api/admin/taxes/${editing.id}`, payload, {
          headers: authHeaders
        });
      } else {
        await axios.post(`${API_URL}/api/admin/taxes`, payload, {
          headers: authHeaders
        });
      }

      await loadTaxes();
      setForm(emptyForm);
      setEditing(null);
    } catch (err) {
      console.error(err);
      if (err.response?.data?.error) {
        setErrorTax(err.response.data.error);
      } else {
        setErrorTax("Не вдалося зберегти податок");
      }
    }
  };

  const handleDelete = async (tax) => {
    if (!window.confirm(`Видалити податок "${tax.name}"?`)) return;
    try {
      await axios.delete(`${API_URL}/api/admin/taxes/${tax.id}`, {
        headers: authHeaders
      });
      await loadTaxes();
      await loadSummary();
    } catch (err) {
      console.error(err);
      setErrorTax("Не вдалося видалити податок");
    }
  };

  const handleApplyFilters = async (e) => {
    e.preventDefault();
    setFilterError("");

    if (datesInvalid) {
      setFilterError('Дата "до" не може бути раніше, ніж дата "з"');
      return;
    }

    await loadSummary();
  };

  const handleResetFilters = async () => {
    setFilterTaxId("");
    setFilterFrom("");
    setFilterTo("");
    setFilterError("");
    await loadSummary();
  };

  const buildExportUrl = (type) => {
    const base =
      type === "pdf"
        ? `${API_URL}/api/admin/reports/export/pdf`
        : `${API_URL}/api/admin/reports/export/csv`;

    const params = new URLSearchParams();
    if (filterTaxId) params.set("taxDefinitionId", filterTaxId);
    if (filterFrom) params.set("fromDate", filterFrom);
    if (filterTo) params.set("toDate", filterTo);
    if (token) params.set("token", token);

    return `${base}?${params.toString()}`;
  };

  // блокуємо експорт при помилці
  const exportsDisabled = datesInvalid || !!filterError;

  return (
    <div className="page">
      {/* --- НАЛАШТУВАННЯ ПОДАТКІВ --- */}
      <div className="card">
        <div className="card-title">Налаштування податків</div>
        <div className="card-subtitle">
          Довідник типів податків, ставок та термінів сплати.
        </div>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">Назва податку</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Податок на нерухомість"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Код</label>
            <input
              className="form-input"
              value={form.code}
              onChange={(e) => handleChange("code", e.target.value)}
              placeholder="PROPERTY_TAX"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Ставка, %</label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={form.rate}
              onChange={(e) => handleChange("rate", e.target.value)}
              placeholder="Наприклад: 18"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Термін сплати, днів (можна лишити порожнім)
            </label>
            <input
              className="form-input"
              type="number"
              value={form.due_days}
              onChange={(e) => handleChange("due_days", e.target.value)}
              placeholder="Наприклад: 30"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Опис</label>
            <textarea
              className="form-input"
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Коментарі для користувачів"
            />
          </div>

          {errorTax && <div className="error-text">{errorTax}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ marginRight: 8 }}
          >
            {editing ? "Зберегти зміни" : "Додати податок"}
          </button>

          {editing && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={startCreate}
            >
              Скасувати
            </button>
          )}
        </form>
      </div>

      {/* --- СПИСОК ПОДАТКІВ --- */}
      <div className="card">
        <div className="card-title">Список податків</div>

        {loadingTaxes ? (
          <div>Завантаження...</div>
        ) : taxes.length === 0 ? (
          <div className="muted-text">Поки що податків немає</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Назва</th>
                <th>Код</th>
                <th>Ставка, %</th>
                <th>Термін, днів</th>
                <th>Опис</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {taxes.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.code}</td>
                  <td>{t.rate}</td>
                  <td>{t.due_days ?? "-"}</td>
                  <td>{t.description}</td>
                  <td>
                    <button
                      className="btn btn-link"
                      onClick={() => startEdit(t)}
                    >
                      Редагувати
                    </button>
                    <button
                      className="btn btn-link"
                      onClick={() => handleDelete(t)}
                    >
                      Видалити
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* --- АГРЕГОВАНА ЗВІТНІСТЬ --- */}
      <div className="card">
        <div className="card-title">Агрегована звітність по податках</div>
        <div className="card-subtitle">
          Фільтри застосовуються як до таблиці, так і до експорту.
        </div>

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

            <div className="form-group">
              <a
                href={exportsDisabled ? "#" : buildExportUrl("pdf")}
                className="btn btn-secondary"
                style={{
                  textDecoration: "none",
                  opacity: exportsDisabled ? 0.5 : 1,
                  pointerEvents: exportsDisabled ? "none" : "auto"
                }}
              >
                Офіційний PDF-звіт
              </a>
            </div>

            <div className="form-group">
              <a
                href={exportsDisabled ? "#" : buildExportUrl("csv")}
                className="btn btn-secondary"
                style={{
                  textDecoration: "none",
                  opacity: exportsDisabled ? 0.5 : 1,
                  pointerEvents: exportsDisabled ? "none" : "auto"
                }}
              >
                Експорт Excel (CSV)
              </a>
            </div>
          </div>
        </form>

        {/* помилки */}
        {filterError && (
          <div className="error-text" style={{ marginTop: 6 }}>
            {filterError}
          </div>
        )}

        {datesInvalid && !filterError && (
          <div className="error-text" style={{ marginTop: 6 }}>
            Дата "до" не може бути раніше, ніж дата "з".
          </div>
        )}

        {/* таблиця */}
        {loadingSummary ? (
          <div>Завантаження...</div>
        ) : filterError ? null : summary.length === 0 ? (
          <div className="muted-text" style={{ marginTop: 8 }}>
            Немає даних для обраних фільтрів. Очікуйте подані звіти від користувачів.
          </div>
        ) : (
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Тип податку</th>
                <th>Кількість декларацій</th>
                <th>Сума бази</th>
                <th>Сума податку</th>
                <th>Усього</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.tax_type || "Без назви"}</td>
                  <td>{row.report_count}</td>
                  <td>{(row.total_base ?? 0).toFixed(2)}</td>
                  <td>{(row.total_tax ?? 0).toFixed(2)}</td>
                  <td>{(row.total_total ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
