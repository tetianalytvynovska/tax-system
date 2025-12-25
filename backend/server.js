const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const path = require("path");
const crypto = require("crypto");

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
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="tax_declaration_${report.id}.pdf"`
  );
  doc.pipe(res);

  // --- Fonts (UA Unicode) ---
  const fontRegular = path.join(__dirname, "assets", "fonts", "DejaVuSans.ttf");
  const fontBold = path.join(__dirname, "assets", "fonts", "DejaVuSans-Bold.ttf");
  doc.registerFont("DejaVu", fontRegular);
  doc.registerFont("DejaVuBold", fontBold);

  // ================= HEADER =================
  // ================= HEADER =================
  doc.font("DejaVuBold").fontSize(16).text("TaxAgent", { align: "center" });
  doc
    .font("DejaVu")
    .fontSize(11)
    .text("Електронний податковий сервіс", { align: "center" });

  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();

  // ================= TITLE =================
  doc.moveDown(1);
  doc.font("DejaVuBold").fontSize(15).text("ПОДАТКОВА ДЕКЛАРАЦІЯ", {
    align: "center"
  });

  // Line under title: "з податку на ..." (from admin dictionary / stored tax_type)
  const taxNameRaw = String(report.tax_type || report.title || "").trim();
  let taxNameForTitle = taxNameRaw;
  // Convert "Податок на ..." -> "податку на ..." (simple UA grammar tweak)
  if (/^Податок\s+на\s+/i.test(taxNameRaw)) {
    taxNameForTitle = taxNameRaw.replace(/^Податок\s+на\s+/i, "податку на ");
  } else if (/^Податок\s+з\s+/i.test(taxNameRaw)) {
    taxNameForTitle = taxNameRaw.replace(/^Податок\s+з\s+/i, "податку з ");
  } else if (/^податок\s+/i.test(taxNameRaw)) {
    taxNameForTitle = taxNameRaw.replace(/^податок\s+/i, "податку ");
  }
  // Ensure starts with lowercase (Ukrainian style in sentence)
  taxNameForTitle = taxNameForTitle
    ? taxNameForTitle.charAt(0).toLowerCase() + taxNameForTitle.slice(1)
    : "податку";
  doc.font("DejaVu").fontSize(11).text(`з ${taxNameForTitle}`, {
    align: "center"
  });

  doc.moveDown(0.8);
  doc.font("DejaVu").fontSize(11);
  doc.text(`Номер декларації: ${report.declaration_number || "—"}`);
  doc.text(
    `Дата формування: ${new Date().toLocaleDateString("uk-UA")}`
  );

  // ================= USER INFO =================
  doc.moveDown(1);
  doc.font("DejaVuBold").text("Відомості про платника податку:");
  doc.moveDown(0.4);
  doc.font("DejaVu");
  doc.text(`ПІБ: ${user.name}`);
  doc.text(`РНОКПП / ІПН: ${user.ipn}`);
  doc.text(`Email: ${user.email}`);
  // Address removed by requirements (do not print address in the PDF)

  // ================= TABLE =================
  doc.moveDown(1);
  doc.font("DejaVuBold").text("Відомості про зобовʼязання:");
  doc.moveDown(0.6);

  const tableX = 50;
  const tableY = doc.y;
  const rowH = 26;

  const colW = [30, 190, 80, 60, 80, 80];
  const headers = [
    "№",
    "Назва податку",
    "База, грн",
    "Ставка, %",
    "Податок",
    "Разом"
  ];

  const tableWidth = colW.reduce((a, b) => a + b, 0);

  // Header background (light)
  doc
    .fillColor("#f1f5f9")      // світло-сірий фон
    .rect(tableX, tableY, tableWidth, rowH)
    .fill();

  doc
    .strokeColor("#000000")    // чорна рамка
    .rect(tableX, tableY, tableWidth, rowH)
    .stroke();

  doc.fillColor("#334155");    // темно-сірий для назв колонок


  doc.font("DejaVuBold").fontSize(9);
  let x = tableX;
  headers.forEach((h, i) => {
    doc.text(h, x + 4, tableY + 8, {
      width: colW[i] - 8,
      align: i >= 2 ? "right" : "left"
    });
    x += colW[i];
  });

  // Row
  const rowY = tableY + rowH;
  doc.rect(tableX, rowY, tableWidth, rowH).stroke();

  doc.font("DejaVu").fontSize(9);
  const row = [
    "1",
    report.tax_type || report.title,
    report.base_amount.toFixed(2),
    report.tax_rate.toFixed(2),
    report.tax_amount.toFixed(2),
    report.total_amount.toFixed(2)
  ];

  x = tableX;
  row.forEach((v, i) => {
    doc.text(String(v), x + 4, rowY + 8, {
      width: colW[i] - 8,
      align: i >= 2 ? "right" : "left"
    });
    x += colW[i];
  });

  doc.y = rowY + rowH + 10;

  // ================= TOTAL =================
  const rightX = 350;
  doc.font("DejaVuBold").fontSize(11);
  doc.text("Усього до сплати:", rightX);
  doc.font("DejaVu").fontSize(11);
  doc.text(`${report.total_amount.toFixed(2)} грн`, rightX);
  if (report.due_date) {
    doc.fontSize(9).text(`Термін сплати: ${report.due_date}`, rightX);
  }

  // ================= QR =================
  try {
    const qrPayload = {
      declaration: report.declaration_number,
      user: user.email
    };
    const qrData = await QRCode.toDataURL(JSON.stringify(qrPayload));
    const img = Buffer.from(qrData.split(",")[1], "base64");

    const qrX = 380;
    const qrY = doc.y + 20;
    doc.image(img, qrX, qrY, { width: 120 });
    doc
      .fontSize(8)
      .text(
        "QR-код для перевірки достовірності декларації в системі TaxAgent",
        qrX,
        qrY + 125,
        { width: 120, align: "center" }
      );
  } catch (e) {
    console.error("QR error:", e.message);
  }

  // ================= FOOTER =================
  doc.moveDown(5);
  doc.font("DejaVuBold").fontSize(11);
  doc.text("Відповідальний за подання декларації:");
  doc.moveDown(1.5);
  doc.text(`__________________________ / ${user.name} /`);
  doc.moveDown(0.8);
  doc.font("DejaVu").fontSize(9);
  doc.text(`Дата: ${new Date().toLocaleDateString("uk-UA")}`);
  doc.moveDown(1);
  doc.text("Затверджено електронною системою TAXAGENT", { oblique: true });

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

  // Unicode fonts (UA Cyrillic)
  const fontRegular = path.join(__dirname, "assets", "fonts", "DejaVuSans.ttf");
  const fontBold = path.join(__dirname, "assets", "fonts", "DejaVuSans-Bold.ttf");
  doc.registerFont("DejaVu", fontRegular);
  try { doc.registerFont("DejaVuBold", fontBold); } catch (e) { /* fallback */ }
  doc.font("DejaVu");

  doc.font("DejaVuBold").fontSize(14).text("МІНІСТЕРСТВО ФІНАНСІВ УКРАЇНИ", {
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
    // Accept both camelCase and snake_case params (frontend compatibility)
    const taxDefinitionId = req.query.taxDefinitionId ?? req.query.tax_definition_id;
    const { fromDate, toDate } = req.query;
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
    // Accept both camelCase and snake_case payloads
    if (taxDefinitionId == null && req.body.tax_definition_id != null) {
      taxDefinitionId = req.body.tax_definition_id;
    }
    if (baseAmount == null && req.body.base_amount != null) {
      baseAmount = req.body.base_amount;
    }
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

// --- Update/delete tax reports (user side) ---

app.patch("/api/tax/reports/:id", authMiddleware, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.getTaxReportById(id);
    if (!existing) return res.status(404).json({ error: "Звіт не знайдено" });

    // Access control
    if (req.user.role !== "Administrator" && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: "Доступ заборонено" });
    }
    if (existing.status !== "заплановано") {
      return res.status(400).json({ error: "Редагування доступне лише для статусу \"заплановано\"" });
    }

    // Accept both camelCase and snake_case payloads
    let taxDefinitionId = req.body.taxDefinitionId ?? req.body.tax_definition_id ?? existing.tax_definition_id;
    let baseAmount = req.body.baseAmount ?? req.body.base_amount ?? existing.base_amount;
    const address = (req.body.address ?? existing.address) || null;
    const title = req.body.title ?? null;

    if (!taxDefinitionId || baseAmount == null) {
      return res.status(400).json({ error: "Оберіть податок і введіть базову суму" });
    }

    baseAmount = Number(baseAmount);
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return res.status(400).json({ error: "Базова сума має бути числом більше 0" });
    }

    const def = db.getTaxDefinitionById(Number(taxDefinitionId));
    if (!def) {
      return res.status(400).json({ error: "Обраний податок не знайдено" });
    }

    const taxRate = Number(def.rate || 0);
    const taxAmount = Number(((baseAmount * taxRate) / 100).toFixed(2));
    const totalAmount = Number((baseAmount + taxAmount).toFixed(2));

    let dueDate = null;
    if (def.due_days != null) {
      const d = new Date();
      d.setDate(d.getDate() + Number(def.due_days));
      dueDate = d.toISOString().slice(0, 10);
    }

    db.updateTaxReport(id, {
      title: title || def.name,
      tax_type: def.name,
      tax_definition_id: def.id,
      base_amount: baseAmount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      due_date: dueDate,
      address
    });

    audit(req.user.id, "TAX_REPORT_UPDATE", JSON.stringify({ reportId: id }));
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

app.delete("/api/tax/reports/:id", authMiddleware, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.getTaxReportById(id);
    if (!existing) return res.status(404).json({ error: "Звіт не знайдено" });

    if (req.user.role !== "Administrator" && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: "Доступ заборонено" });
    }
    if (existing.status !== "заплановано") {
      return res.status(400).json({ error: "Видалення доступне лише для статусу \"заплановано\"" });
    }

    db.deleteTaxReport(id);
    audit(req.user.id, "TAX_REPORT_DELETE", JSON.stringify({ reportId: id }));
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Помилка сервера" });
  }
});

// --- Mock: "Підписати та відправити" ---
// НІКУДИ НЕ НАДСИЛАЄТЬСЯ. Лише:
// 1) перевіряємо ключ (номінально)
// 2) рахуємо SHA-256 (імітація підпису)
// 3) міняємо статус на "подано"
// 4) повертаємо хеш для відображення на фронті
app.post("/api/tax/reports/:id/sign-send", authMiddleware, (req, res) => {
  try {
    const id = Number(req.params.id);
    const key = String(req.body?.key || "").trim();

    if (!key || key.length < 6) {
      return res
        .status(400)
        .json({ error: "Введіть тестовий ключ (мінімум 6 символів)" });
    }

    const existing = db.getTaxReportById(id);
    if (!existing) return res.status(404).json({ error: "Звіт не знайдено" });

    if (req.user.role !== "Administrator" && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: "Доступ заборонено" });
    }

    if (existing.status !== "заплановано") {
      return res
        .status(400)
        .json({ error: "Підписання доступне лише для статусу \"заплановано\"" });
    }

    const signatureHash = crypto
      .createHash("sha256")
      .update(key)
      .digest("hex");

    // Generate a nominal declaration number (for demo + better traceability)
    const declNumber =
      existing.declaration_number ||
      `TA-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${id}`;

    // Update status to "подано" (so UI blocks edit/delete)
    db.raw
      .prepare("UPDATE tax_reports SET status = ?, declaration_number = ? WHERE id = ?")
      .run("подано", declNumber, id);

    audit(
      req.user.id,
      "TAX_REPORT_SIGN_SEND",
      JSON.stringify({ reportId: id, signatureHash, declaration_number: declNumber })
    );
    res.json({ success: true, status: "подано", signatureHash, declaration_number: declNumber });
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
