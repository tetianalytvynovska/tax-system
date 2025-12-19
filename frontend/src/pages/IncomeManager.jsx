import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_URL = "http://localhost:5000";

export default function IncomeManagerPage() {
  const [categories, setCategories] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // форми
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");

  // фільтри
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMin, setFilterMin] = useState("");
  const [filterMax, setFilterMax] = useState("");

  // для файлів — останнє завантаження
  const [uploadingId, setUploadingId] = useState(null);
  const [filesByIncome, setFilesByIncome] = useState({});

  const token = localStorage.getItem("taxagent_token");

  const api = axios.create({
    baseURL: API_URL,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [cRes, iRes] = await Promise.all([
        api.get("/api/income/categories"),
        api.get("/api/income"),
      ]);
      setCategories(cRes.data);
      setIncomes(iRes.data);
    } catch (e) {
      console.error(e);
      setError("Не вдалося завантажити дані доходів");
    } finally {
      setLoading(false);
    }
  };

  const loadFilesForIncome = async (incomeId) => {
    try {
      const res = await api.get(`/api/income/${incomeId}/files`);
      setFilesByIncome((prev) => ({ ...prev, [incomeId]: res.data }));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await api.post("/api/income/categories", {
        name: newCatName.trim(),
        description: newCatDesc.trim() || undefined,
      });
      setNewCatName("");
      setNewCatDesc("");
      loadData();
    } catch (e) {
      console.error(e);
      setError("Не вдалося створити категорію");
    }
  };

  const handleAddIncome = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/income", {
        title: title.trim(),
        amount: Number(amount),
        date,
        categoryId: categoryId || null,
      });
      setTitle("");
      setAmount("");
      await loadData();
    } catch (e) {
      console.error(e);
      setError("Не вдалося додати запис доходу");
    }
  };

  const handleUploadFile = async (incomeId, file) => {
    if (!file) return;
    try {
      setUploadingId(incomeId);
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/api/income/${incomeId}/files`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadFilesForIncome(incomeId);
    } catch (e) {
      console.error(e);
      alert("Не вдалося завантажити файл");
    } finally {
      setUploadingId(null);
    }
  };

  const handleGeneratePdf = () => {
    window.open(`${API_URL}/api/income/summary/pdf`, "_blank");
  };

  // -------- фільтрація --------
  const filteredIncomes = useMemo(() => {
    return incomes.filter((inc) => {
      const d = inc.date ? inc.date.slice(0, 10) : null;

      if (filterFrom && d && d < filterFrom) return false;
      if (filterTo && d && d > filterTo) return false;

      if (filterCategory && String(inc.category_id || "") !== filterCategory) {
        return false;
      }

      const amt = Number(inc.amount || 0);
      if (filterMin !== "" && amt < Number(filterMin)) return false;
      if (filterMax !== "" && amt > Number(filterMax)) return false;

      return true;
    });
  }, [incomes, filterFrom, filterTo, filterCategory, filterMin, filterMax]);

  const totalsByCategory = useMemo(() => {
    const map = new Map();
    filteredIncomes.forEach((inc) => {
      const key = inc.category_name || "Без категорії";
      const prev = map.get(key) || 0;
      map.set(key, prev + Number(inc.amount || 0));
    });
    return Array.from(map.entries()).map(([name, total]) => ({
      name,
      total,
    }));
  }, [filteredIncomes]);

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title">Менеджер доходів</div>
          <div className="dashboard-subtitle">
            Керування джерелами доходу, категоріями, документами та аналітикою.
          </div>
        </div>
        <button className="btn btn-outline" type="button" onClick={handleGeneratePdf}>
          Згенерувати PDF-зведення
        </button>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}

      {loading ? (
        <p>Завантаження...</p>
      ) : (
        <>
          {/* Фільтри */}
          <div className="admin-box" style={{ marginBottom: 16 }}>
            <div className="section-title">Фільтри</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <label className="form-label">Дата від</label>
                <input
                  type="date"
                  className="form-input"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Дата до</label>
                <input
                  type="date"
                  className="form-input"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Категорія</label>
                <select
                  className="form-input"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="">Усі</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Сума від</label>
                <input
                  type="number"
                  className="form-input"
                  value={filterMin}
                  onChange={(e) => setFilterMin(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Сума до</label>
                <input
                  type="number"
                  className="form-input"
                  value={filterMax}
                  onChange={(e) => setFilterMax(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Верхній блок — суми по категоріях */}
          <div className="admin-grid-top" style={{ marginBottom: 24 }}>
            {totalsByCategory.length > 0 ? (
              totalsByCategory.map((row) => (
                <div key={row.name} className="stat-card">
                  <div className="stat-value">
                    {row.total.toLocaleString("uk-UA")} ₴
                  </div>
                  <div className="stat-label">{row.name}</div>
                </div>
              ))
            ) : (
              <div className="stat-card">
                <div className="stat-value">0 ₴</div>
                <div className="stat-label">Немає записів (після фільтрації)</div>
              </div>
            )}
          </div>

          {/* Дві колонки: форми + список */}
          <div className="admin-grid-bottom">
            {/* Форми */}
            <div className="admin-box">
              <div className="section-title">Додати дохід</div>
              <form onSubmit={handleAddIncome}>
                <div className="form-group">
                  <label className="form-label">Назва / опис</label>
                  <input
                    className="form-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Гонорар за проєкт, роялті..."
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Сума, ₴</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Дата</label>
                  <input
                    className="form-input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Категорія</label>
                  <select
                    className="form-input"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">Без категорії</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: 8 }}
                >
                  Додати запис
                </button>
              </form>

              <hr style={{ margin: "18px 0" }} />

              <div className="section-title">Створити категорію</div>
              <form onSubmit={handleAddCategory}>
                <div className="form-group">
                  <label className="form-label">Назва категорії</label>
                  <input
                    className="form-input"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Фриланс, Зарплата, Дивіденди..."
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Опис (необов'язково)</label>
                  <input
                    className="form-input"
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    placeholder="Коротка примітка"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-outline"
                  style={{ width: "100%" }}
                >
                  Додати категорію
                </button>
              </form>
            </div>

            {/* Список доходів + файли */}
            <div className="admin-box">
              <div className="section-title">Список доходів</div>
              {filteredIncomes.length === 0 && (
                <div className="admin-item">Поки немає записів (з урахуванням фільтра).</div>
              )}
              {filteredIncomes.map((inc) => (
                <div key={inc.id} className="admin-item">
                  <div style={{ fontWeight: 500 }}>{inc.title}</div>
                  <div className="item-meta">
                    {new Date(inc.date).toLocaleDateString("uk-UA")} •{" "}
                    {inc.category_name || "Без категорії"}
                  </div>
                  <div className="item-amount">
                    {Number(inc.amount).toLocaleString("uk-UA")} ₴
                  </div>

                  {/* Файли */}
                  <div style={{ marginTop: 6 }}>
                    <small style={{ display: "block", marginBottom: 4 }}>
                      Документи:
                    </small>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="file"
                        onChange={(e) =>
                          e.target.files &&
                          e.target.files[0] &&
                          handleUploadFile(inc.id, e.target.files[0])
                        }
                      />
                      {uploadingId === inc.id && <span>Завантаження...</span>}
                      <button
                        type="button"
                        className="btn btn-link"
                        onClick={() => loadFilesForIncome(inc.id)}
                      >
                        Оновити список
                      </button>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {(filesByIncome[inc.id] || []).map((f) => (
                        <div key={f.id}>
                          <a href={`${API_URL}${f.url}`} target="_blank" rel="noreferrer">
                            {f.original_name}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
