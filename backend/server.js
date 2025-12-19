const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");

const db = require("./db");

let mailConfig;
try {
  mailConfig = require("./config");
} catch (e) {
  mailConfig = require("./config.example");
}

const ADMIN_EMAIL = "tetianalytvynovska@gmail.com";
const JWT_SECRET = "taxagent-secret";

const transporter = nodemailer.createTransport({
  host: mailConfig.smtp.host,
  port: mailConfig.smtp.port,
  secure: mailConfig.smtp.secure,
  auth: {
    user: mailConfig.smtp.user,
    pass: mailConfig.smtp.pass
  }
});

const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: "*", credentials: false }));
app.use("/api/admin", require("./routes/adminRoutes"));

// --- Helpers ---

function createToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "1d" });
}

function authMiddleware(req, res, next) {
  let token = null;
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2) token = parts[1];
  }
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }
  if (!token) return res.status(401).json({ error: "Немає токена" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.getUserById(payload.id);
    if (!user) return res.status(401).json({ error: "Користувача не знайдено" });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Невірний токен" });
  }
}

function audit(userId, action, details) {
  try {
    if (!userId) return;
    db.raw.prepare(
      "INSERT INTO audit_log(user_id, action, details) VALUES (?, ?, ?)"
    ).run(userId, action, details || null);
  } catch (e) {
    console.error("Audit error:", e.message);
  }
}

async function generateUserOfficialPdf(res, user, report) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="tax_declaration_${report.id}.pdf"`
  );
  doc.pipe(res);

  // Header
  doc.font("Helvetica-Bold").fontSize(14).text("МІНІСТЕРСТВО ФІНАНСІВ УКРАЇНИ", {
    align: "center"
  });
  doc.fontSize(12).text(
    "ІНФОРМАЦІЙНА СИСТЕМА TAXAGENT – супровід податкової звітності фізичних осіб",
    { align: "center" }
  );
  doc
    .fontSize(10)
    .text("Код ЄДРПОУ: 00000000 · м. Київ, вул. Хрещатик, 1, 01001", {
      align: "center"
    });
  doc.moveDown();
  doc
    .moveTo(50, doc.y)
    .lineTo(550, doc.y)
    .stroke();

  doc.moveDown();
  doc.fontSize(14).text("ПОДАТКОВА ДЕКЛАРАЦІЯ", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Номер декларації: ${report.declaration_number || "—"}`);
  doc.text(`Дата формування: ${new Date().toLocaleDateString("uk-UA")}`);
  doc.moveDown();

  // Taxpayer info
  doc.fontSize(11).text("Відомості про платника податку:", { underline: true });
  doc.moveDown(0.5);
  doc.text(`ПІБ: ${user.name}`);
  doc.text(`РНОКПП / ІПН: ${user.ipn}`);
  doc.text(`Email: ${user.email}`);
  doc.text(`Адреса: ${report.address || "—"}`);
  doc.moveDown();

  // Table
  doc.fontSize(11).text("Відомості про зобов'язання:", { underline: true });
  doc.moveDown(0.5);

  const startX = 50;
  let y = doc.y;
  const col = (text, x, width) => {
    doc.text(String(text), x, y, { width });
  };

  doc.font("Helvetica-Bold");
  col("№", startX, 20);
  col("Назва податку", startX + 25, 180);
  col("База, грн", startX + 210, 80);
  col("Ставка, %", startX + 295, 60);
  col("Податок, грн", startX + 360, 80);
  col("Разом, грн", startX + 445, 80);
  y += 16;
  doc.font("Helvetica");
  col(1, startX, 20);
  col(report.tax_type || report.title, startX + 25, 180);
  col(report.base_amount.toFixed(2), startX + 210, 80);
  col(report.tax_rate.toFixed(2), startX + 295, 60);
  col(report.tax_amount.toFixed(2), startX + 360, 80);
  col(report.total_amount.toFixed(2), startX + 445, 80);
  y += 18;
  doc.moveDown(3);

  doc
    .fontSize(11)
    .text(`Усього до сплати: ${report.total_amount.toFixed(2)} грн`);
  if (report.due_date) {
    doc.text(`Термін сплати: ${report.due_date}`);
  }
  doc.moveDown(2);

  try {
    const payload = {
      id: report.id,
      declaration_number: report.declaration_number,
      user_email: user.email,
      ipn: user.ipn
    };
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload));
    const base64 = qrDataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");
    const qrX = 380;
    const qrY = doc.y;
    doc.image(buffer, qrX, qrY, { width: 120 });
    doc
      .fontSize(8)
      .text(
        "QR-код для перевірки достовірності декларації в системі TAXAGENT",
        qrX,
        qrY + 125,
        { width: 120, align: "center" }
      );
  } catch (e) {
    console.error("QR error", e);
  }

  doc.moveDown(6);
  doc.fontSize(11).text("Відповідальний за подання декларації:", {
    underline: true
  });
  doc.moveDown(2);
  doc.text(`__________________________ /${user.name}/`);
  doc.moveDown();
  doc.text(`Дата: ${new Date().toLocaleDateString("uk-UA")}`);
  doc.moveDown(2);
  doc.fontSize(9).text("Затверджено електронною системою TAXAGENT", {
    oblique: true
  });

  doc.end();
}

async function generateAdminOfficialPdf(res, summary, reports, filters) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="tax_reports_summary_official.pdf"'
  );
  doc.pipe(res);

  doc.font("Helvetica-Bold").fontSize(14).text("МІНІСТЕРСТВО ФІНАНСІВ УКРАЇНИ", {
    align: "center"
  });
  doc.fontSize(12).text(
    "ІНФОРМАЦІЙНА СИСТЕМА TAXAGENT – супровід податкової звітності фізичних осіб",
    { align: "center" }
  );
  doc
    .fontSize(10)
    .text("Код ЄДРПОУ: 00000000 · м. Київ, вул. Хрещатик, 1, 01001", {
      align: "center"
    });
  doc.moveDown();
  doc
    .moveTo(50, doc.y)
    .lineTo(550, doc.y)
    .stroke();

  doc.moveDown();
  doc.fontSize(14).text("ЗВІТ ПРО ПОДАТКОВІ НАРАХУВАННЯ (АГРЕГОВАНИЙ)", {
    align: "center"
  });
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .text(`Дата формування: ${new Date().toLocaleDateString("uk-UA")}`);
  if (filters.fromDate || filters.toDate) {
    doc.text(
      `Період: ${filters.fromDate || "—"} по ${filters.toDate || "—"}`
    );
  }
  doc.moveDown();

  doc.fontSize(12).text("1. Агрегована інформація по податках:", {
    underline: true
  });
  doc.moveDown(0.5);

  if (!summary || !summary.length) {
    doc
      .fontSize(11)
      .text(
        "Даних за обраний період не знайдено. Очікуйте подані звіти від користувачів."
      );
  } else {
    summary.forEach((row, idx) => {
      doc
        .fontSize(11)
        .text(
          `${idx + 1}. ${row.tax_type || "Без назви"} — декларацій: ${
            row.report_count
          }, база: ${(row.total_base ?? 0).toFixed(2)} грн, податок: ${
            (row.total_tax ?? 0).toFixed(2)
          } грн, разом: ${(row.total_total ?? 0).toFixed(2)} грн`
        );
    });
  }

  doc.moveDown();

  doc.fontSize(12).text("2. Деталізований перелік декларацій:", {
    underline: true
  });
  doc.moveDown(0.5);

  if (!reports || !reports.length) {
    doc
      .fontSize(11)
      .text(
        "Немає жодного поданого звіту для вказаних фільтрів. Очікуйте подані декларації."
      );
  } else {
    reports.forEach((r, idx) => {
      doc.fontSize(10).text(
        `${idx + 1}. Декларація № ${r.declaration_number || r.id} · користувач: ${
          r.user_email || r.user_id
        }`
      );
      doc.text(
        `   ${r.tax_type || r.title}; база: ${r.base_amount} грн; ставка: ${
          r.tax_rate
        }%; податок: ${r.tax_amount} грн; разом: ${
          r.total_amount
        } грн; термін: ${r.due_date || "-"}; статус: ${r.status}; створено: ${
          r.created_at
        }`
      );
      doc.moveDown(0.3);
    });
  }

  try {
    const payload = {
      filters,
      count: reports ? reports.length : 0
    };
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload));
    const base64 = qrDataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");
    const qrX = 380;
    const qrY = doc.y + 10;
    doc.image(buffer, qrX, qrY, { width: 120 });
    doc
      .fontSize(8)
      .text(
        "QR-код для перевірки зведеного звіту в системі TAXAGENT",
        qrX,
        qrY + 125,
        { width: 120, align: "center" }
      );
  } catch (e) {
    console.error("QR error (admin)", e);
  }

  doc.moveDown(8);
  doc.fontSize(11).text("Відповідальний за формування звіту:", {
    underline: true
  });
  doc.moveDown(2);
  doc.text("__________________________ /System Admin/");
  doc.moveDown();
  doc.text(`Дата: ${new Date().toLocaleDateString("uk-UA")}`);
  doc.moveDown(2);
  doc.fontSize(9).text("Затверджено електронною системою TAXAGENT", {
    oblique: true
  });

  doc.end();
}

// --- Auth ---

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, ipn, password } = req.body;
    if (!name || !email || !ipn || !password) {
      return res.status(400).json({ error: "Всі поля є обов'язковими" });
    }
    const existing = db.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "Користувач з таким email вже існує" });
    }
    const hash = await bcrypt.hash(password, 10);
    const userId = db.createUser(name, email, ipn, hash, "User");
    const user = db.getUserById(userId);
    const token = createToken(user);
    audit(user.id, "REGISTER", null);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        ipn: user.ipn,
        role: user.role
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: "Невірний email або пароль" });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(400).json({ error: "Невірний email або пароль" });
    }

    if (user.email === ADMIN_EMAIL && user.role === "Administrator") {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      db.raw.prepare("DELETE FROM admin_2fa WHERE user_id = ?").run(user.id);
      db.raw
        .prepare(
          "INSERT INTO admin_2fa(user_id, code, expires_at) VALUES (?, ?, datetime('now', '+10 minutes'))"
        )
        .run(user.id, code);

      try {
        await transporter.sendMail({
          to: user.email,
          subject: "TaxAgent: код для входу в адмін-панель",
          text: `Ваш код доступу: ${code}`
        });
      } catch (e) {
        console.error("Mail error:", e);
      }

      audit(user.id, "ADMIN_LOGIN_2FA_REQUEST", null);
      return res.json({ requires2FA: true });
    }

    const token = createToken(user);
    audit(user.id, "LOGIN", null);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        ipn: user.ipn,
        role: user.role
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.post("/api/admin/verify-2fa", async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = db.getUserByEmail(email);
    if (!user || user.email !== ADMIN_EMAIL || user.role !== "Administrator") {
      return res.status(400).json({ error: "Невірні дані адміністратора" });
    }
    const row = db.raw
      .prepare(
        "SELECT * FROM admin_2fa WHERE user_id = ? AND code = ? AND expires_at > datetime('now')"
      )
      .get(user.id, code);
    if (!row) {
      return res.status(400).json({ error: "Невірний або прострочений код" });
    }
    db.raw.prepare("DELETE FROM admin_2fa WHERE user_id = ?").run(user.id);
    const token = createToken(user);
    audit(user.id, "ADMIN_LOGIN_2FA_SUCCESS", null);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        ipn: user.ipn,
        role: user.role
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.get("/api/me", authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    ipn: u.ipn,
    role: u.role
  });
});

// --- Admin basic lists ---

app.get("/api/admin/users", authMiddleware, (req, res) => {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Доступ лише для адміністратора" });
  }
  try {
    const list = db.raw
      .prepare("SELECT id, name, email, ipn, role FROM users ORDER BY id")
      .all();
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.get("/api/admin/audit", authMiddleware, (req, res) => {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Доступ лише для адміністратора" });
  }
  try {
    const logs = db.raw
      .prepare(
        `SELECT a.id, a.user_id, u.email AS user_email, a.action, a.details, a.timestamp
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.id DESC
         LIMIT 200`
      )
      .all();
    res.json(logs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// --- Admin: dashboard combined data ---

app.get("/api/admin/dashboard", authMiddleware, (req, res) => {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Доступ лише для адміністратора" });
  }
  try {
    const usersTotal = db.countUsers();
    const stats = db.getDashboardStats();
    const latestUsers = db.getLatestUsers(5);
    res.json({
      users_total: usersTotal,
      reports_total: stats.reports_total,
      reports_active: stats.reports_active,
      reports_pending: stats.reports_pending,
      reports_completed: stats.reports_completed,
      latest_users: latestUsers,
      latest_reports: stats.latestReports
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// --- Admin: tax definitions ---

app.get("/api/admin/taxes", authMiddleware, (req, res) => {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Доступ лише для адміністратора" });
  }
  try {
    const list = db.getAllTaxDefinitions();
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.post("/api/admin/taxes", authMiddleware, (req, res) => {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Доступ лише для адміністратора" });
  }
  try {
    let { name, code, rate, dueDays, description } = req.body;
    if (!name || !code || rate == null) {
      return res
        .status(400)
        .json({ error: "Назва, код і ставка податку є обов'язковими" });
    }
    rate = Number(rate);
    if (Number.isNaN(rate)) {
      return res.status(400).json({ error: "Ставка має бути числом" });
    }
    const id = db.createTaxDefinition(name, code, rate, dueDays, description);
    audit(req.user.id, "ADMIN_TAX_CREATE", JSON.stringify({ id, code }));
    res.json({ id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.put("/api/admin/taxes/:id", authMiddleware, (req, res) => {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Доступ лише для адміністратора" });
  }
  try {
    const id = Number(req.params.id);
    let { name, code, rate, dueDays, description } = req.body;
    if (!name || !code || rate == null) {
      return res
        .status(400)
        .json({ error: "Назва, код і ставка податку є обов'язковими" });
    }
    rate = Number(rate);
    if (Number.isNaN(rate)) {
      return res.status(400).json({ error: "Ставка має бути числом" });
    }
    db.updateTaxDefinition(id, name, code, rate, dueDays, description);
    audit(req.user.id, "ADMIN_TAX_UPDATE", JSON.stringify({ id, code }));
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.delete("/api/admin/taxes/:id", authMiddleware, (req, res) => {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Доступ лише для адміністратора" });
  }
  try {
    const id = Number(req.params.id);
    db.deleteTaxDefinition(id);
    audit(req.user.id, "ADMIN_TAX_DELETE", JSON.stringify({ id }));
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// --- Tax definitions for users ---

app.get("/api/taxes", authMiddleware, (req, res) => {
  try {
    const list = db.getAllTaxDefinitions();
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// --- Tax reports (user side) ---

app.get("/api/tax/reports", authMiddleware, (req, res) => {
  try {
    const { taxDefinitionId, fromDate, toDate } = req.query;
    if (fromDate && toDate && fromDate > toDate) {
      return res
        .status(400)
        .json({ error: 'Дата "до" не може бути раніше, ніж дата "з"' });
    }
    const opts = {
      taxDefinitionId: taxDefinitionId ? Number(taxDefinitionId) : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined
    };
    const reports = db.getTaxReportsForUserWithFilters(req.user.id, opts);
    res.json(reports);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.get("/api/tax/reports/:id", authMiddleware, (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = db.raw
      .prepare(
        `SELECT r.*, u.name as user_name, u.email as user_email, u.ipn as user_ipn
         FROM tax_reports r
         JOIN users u ON u.id = r.user_id
         WHERE r.id = ?`
      )
      .get(id);
    if (!row) return res.status(404).json({ error: "Звіт не знайдено" });
    if (req.user.role !== "Administrator" && row.user_id !== req.user.id) {
      return res.status(403).json({ error: "Доступ заборонено" });
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.post("/api/tax/reports", authMiddleware, (req, res) => {
  try {
    let { title, taxDefinitionId, baseAmount, address } = req.body;
    if (!taxDefinitionId || baseAmount == null) {
      return res
        .status(400)
        .json({ error: "Оберіть податок і введіть базову суму" });
    }
    baseAmount = Number(baseAmount);
    if (Number.isNaN(baseAmount)) {
      return res.status(400).json({ error: "Базова сума має бути числом" });
    }
    const def = db.getTaxDefinitionById(Number(taxDefinitionId));
    if (!def) {
      return res.status(400).json({ error: "Обраний податок не знайдено" });
    }

    const taxRate = def.rate;
    const taxAmount = Number(((baseAmount * taxRate) / 100).toFixed(2));
    const totalAmount = Number((baseAmount + taxAmount).toFixed(2));

    let dueDate = null;
    if (def.due_days != null) {
      const d = new Date();
      d.setDate(d.getDate() + Number(def.due_days));
      dueDate = d.toISOString().slice(0, 10);
    }

    const year = new Date().getFullYear();
    const row = db.raw
      .prepare(
        "SELECT COUNT(*) as cnt FROM tax_reports WHERE strftime('%Y', created_at) = ?"
      )
      .get(String(year));
    const count = row ? row.cnt : 0;
    const declarationNumber = `${year}/${String(count + 1).padStart(4, "0")}`;

    const reportId = db.createTaxReport(
      req.user.id,
      title || def.name,
      def.name,
      def.id,
      baseAmount,
      taxRate,
      taxAmount,
      totalAmount,
      dueDate,
      "заплановано",
      declarationNumber,
      address || null
    );
    audit(
      req.user.id,
      "TAX_REPORT_CREATE",
      JSON.stringify({ reportId, taxDefinitionId: def.id })
    );
    res.json({ id: reportId, declaration_number: declarationNumber });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// --- Admin: tax summary and exports ---

app.get("/api/admin/tax-summary", authMiddleware, (req, res) => {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Доступ лише для адміністратора" });
  }
  try {
    const { taxDefinitionId, fromDate, toDate } = req.query;
    if (fromDate && toDate && fromDate > toDate) {
      return res
        .status(400)
        .json({ error: 'Дата "до" не може бути раніше, ніж дата "з"' });
    }
    const opts = {
      taxDefinitionId: taxDefinitionId ? Number(taxDefinitionId) : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined
    };
    const summary = db.getAdminTaxSummary(opts);
    res.json(summary);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.get("/api/admin/reports/export/csv", authMiddleware, (req, res) => {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Доступ лише для адміністратора" });
  }
  try {
    const { taxDefinitionId, fromDate, toDate } = req.query;
    if (fromDate && toDate && fromDate > toDate) {
      return res
        .status(400)
        .json({ error: 'Дата "до" не може бути раніше, ніж дата "з"' });
    }
    const opts = {
      taxDefinitionId: taxDefinitionId ? Number(taxDefinitionId) : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined
    };
    const reports = db.getAdminReportsWithFilters(opts);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="tax_reports_export.csv"'
    );

    const header = [
      "id",
      "declaration_number",
      "user_email",
      "title",
      "tax_type",
      "tax_definition_id",
      "base_amount",
      "tax_rate",
      "tax_amount",
      "total_amount",
      "due_date",
      "status",
      "created_at",
      "address"
    ];
    res.write(header.join(";") + "\n");

    if (!reports || !reports.length) {
      res.write(
        'Немає даних за обраний період;Очікуйте подані звіти від користувачів\n'
      );
      return res.end();
    }

    for (const r of reports) {
      const row = [
        r.id,
        r.declaration_number || "",
        r.user_email || "",
        r.title || "",
        r.tax_type || "",
        r.tax_definition_id || "",
        r.base_amount ?? "",
        r.tax_rate ?? "",
        r.tax_amount ?? "",
        r.total_amount ?? "",
        r.due_date || "",
        r.status || "",
        r.created_at || "",
        r.address || ""
      ].map((v) => {
        const s = String(v);
        if (s.includes(";") || s.includes('"')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      });
      res.write(row.join(";") + "\n");
    }
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.get("/api/admin/reports/export/pdf", authMiddleware, async (req, res) => {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Доступ лише для адміністратора" });
  }
  try {
    const { taxDefinitionId, fromDate, toDate } = req.query;
    if (fromDate && toDate && fromDate > toDate) {
      return res
        .status(400)
        .json({ error: 'Дата "до" не може бути раніше, ніж дата "з"' });
    }
    const opts = {
      taxDefinitionId: taxDefinitionId ? Number(taxDefinitionId) : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined
    };
    const reports = db.getAdminReportsWithFilters(opts);
    const summary = db.getAdminTaxSummary(opts);
    await generateAdminOfficialPdf(res, summary, reports, {
      taxDefinitionId: opts.taxDefinitionId || null,
      fromDate: opts.fromDate || null,
      toDate: opts.toDate || null
    });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.status(500).json({ error: "Помилка сервера" });
    }
  }
});

// --- User official PDF ---

app.get("/api/tax/reports/:id/pdf", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = db.raw
      .prepare(
        `SELECT r.*, u.name as user_name, u.email as user_email, u.ipn as user_ipn
         FROM tax_reports r
         JOIN users u ON u.id = r.user_id
         WHERE r.id = ?`
      )
      .get(id);
    if (!row) return res.status(404).json({ error: "Звіт не знайдено" });
    if (req.user.role !== "Administrator" && row.user_id !== req.user.id) {
      return res.status(403).json({ error: "Доступ заборонено" });
    }
    const user = {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      ipn: row.user_ipn
    };
    const report = {
      id: row.id,
      title: row.title,
      tax_type: row.tax_type,
      base_amount: row.base_amount,
      tax_rate: row.tax_rate,
      tax_amount: row.tax_amount,
      total_amount: row.total_amount,
      due_date: row.due_date,
      declaration_number: row.declaration_number,
      address: row.address
    };
    await generateUserOfficialPdf(res, user, report);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.status(500).json({ error: "Помилка сервера" });
    }
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log("Backend listening on http://localhost:" + PORT);
});

// ===== STRICT USER-BOUND TAX REPORTS =====

// Middleware для перевірки токена
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET || "secretkey", (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

// CREATE TAX FORM (DECLARATION)
app.post("/api/tax/reports", authenticateToken, async (req, res) => {
  try {
    const {
      title,
      tax_type,
      base_amount,
      tax_rate,
      tax_amount,
      total_amount,
      due_date,
      declaration_number,
      address
    } = req.body;

    const user_id = req.user.id;

    const result = await db.run(
      `INSERT INTO tax_reports 
      (user_id, title, tax_type, base_amount, tax_rate, tax_amount, total_amount, due_date, status, declaration_number, address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        title || "Нова декларація",
        tax_type,
        base_amount,
        tax_rate,
        tax_amount,
        total_amount,
        due_date || null,
        "pending",
        declaration_number || null,
        address || null
      ]
    );

    res.json({ success: true, id: result.lastID });
  } catch (err) {
    console.error("CREATE REPORT ERROR:", err);
    res.status(500).json({ error: "Failed to create report", details: err.message });
  }
});

// GET ONLY MY DECLARATIONS
app.get("/api/tax/reports", authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id;

    const rows = await db.all(
      `SELECT * FROM tax_reports WHERE user_id = ? ORDER BY created_at DESC`,
      [user_id]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET REPORTS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch reports", details: err.message });
  }
});
