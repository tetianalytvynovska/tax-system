const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");

const dbPath = path.join(__dirname, "taxagent.db");
const db = new Database(dbPath);

// --- Tables ---

db.prepare(`CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  ipn TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'User'
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS tax_definitions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  rate REAL NOT NULL,
  due_days INTEGER,
  description TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS tax_reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  tax_type TEXT,
  tax_definition_id INTEGER,
  base_amount REAL NOT NULL,
  tax_rate REAL NOT NULL,
  tax_amount REAL NOT NULL,
  total_amount REAL NOT NULL,
  due_date TEXT,
  status TEXT DEFAULT 'заплановано',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  declaration_number TEXT,
  address TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS admin_2fa(
  user_id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
)`).run();

// --- Default admin ---

const ADMIN_EMAIL = "tetianalytvynovska@gmail.com";
const existingAdmin = db.prepare("SELECT * FROM users WHERE email = ?").get(ADMIN_EMAIL);
if (!existingAdmin) {
  const hash = bcrypt.hashSync("0987654321", 10);
  db.prepare("INSERT INTO users(name, email, ipn, password_hash, role) VALUES (?, ?, ?, ?, ?)")
    .run("System Admin", ADMIN_EMAIL, "0000000000", hash, "Administrator");
}

// --- Helper for filters ---

function buildReportsFilter(whereParts, params, opts) {
  if (opts.userId && !opts.isAdminView) {
    whereParts.push("r.user_id = ?");
    params.push(opts.userId);
  }

  if (opts.taxDefinitionId) {
    whereParts.push("r.tax_definition_id = ?");
    params.push(opts.taxDefinitionId);
  }

  if (opts.fromDate && opts.fromDate.trim() !== "") {
    whereParts.push("date(r.created_at) >= date(?)");
    params.push(opts.fromDate);
  }

  if (opts.toDate && opts.toDate.trim() !== "") {
    whereParts.push("date(r.created_at) <= date(?)");
    params.push(opts.toDate);
  }
}


module.exports = {
  raw: db,

  // Users
  getUserByEmail(email) {
    return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  },

  getUserById(id) {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  },

  createUser(name, email, ipn, password_hash, role) {
    const userRole = role || "User";
    const info = db.prepare(
      "INSERT INTO users(name, email, ipn, password_hash, role) VALUES (?, ?, ?, ?, ?)"
    ).run(name, email, ipn, password_hash, userRole);
    return info.lastInsertRowid;
  },

  countUsers() {
    const row = db.prepare("SELECT COUNT(*) as cnt FROM users").get();
    return row ? row.cnt : 0;
  },

  getLatestUsers(limit = 5) {
    return db.prepare(
      "SELECT id, name, email FROM users ORDER BY id DESC LIMIT ?"
    ).all(limit);
  },

  // Tax definitions
  getAllTaxDefinitions() {
    return db.prepare(
      "SELECT id, name, code, rate, due_days, description FROM tax_definitions ORDER BY name"
    ).all();
  },

  getTaxDefinitionById(id) {
    return db.prepare("SELECT * FROM tax_definitions WHERE id = ?").get(id);
  },

  createTaxDefinition(name, code, rate, dueDays, description) {
    const info = db.prepare(
      "INSERT INTO tax_definitions(name, code, rate, due_days, description) VALUES (?, ?, ?, ?, ?)"
    ).run(name, code, rate, dueDays || null, description || null);
    return info.lastInsertRowid;
  },

  updateTaxDefinition(id, name, code, rate, dueDays, description) {
    db.prepare(
      "UPDATE tax_definitions SET name = ?, code = ?, rate = ?, due_days = ?, description = ? WHERE id = ?"
    ).run(name, code, rate, dueDays || null, description || null, id);
  },

  deleteTaxDefinition(id) {
    db.prepare("DELETE FROM tax_definitions WHERE id = ?").run(id);
  },

  // Tax reports
  createTaxReport(userId, title, taxType, taxDefinitionId, baseAmount, taxRate, taxAmount, totalAmount, dueDate, status, declarationNumber, address) {
    const info = db.prepare(
      `INSERT INTO tax_reports(
        user_id, title, tax_type, tax_definition_id,
        base_amount, tax_rate, tax_amount, total_amount,
        due_date, status, declaration_number, address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      title,
      taxType,
      taxDefinitionId,
      baseAmount,
      taxRate,
      taxAmount,
      totalAmount,
      dueDate || null,
      status || "заплановано",
      declarationNumber || null,
      address || null
    );
    return info.lastInsertRowid;
  },

  getTaxReportsForUserWithFilters(userId, opts = {}) {
    const whereParts = [];
    const params = [];
    buildReportsFilter(whereParts, params, { userId, ...opts, isAdminView: false });
    const whereSql = whereParts.length ? "WHERE " + whereParts.join(" AND ") : "";
    const sql = `
      SELECT r.id, r.user_id, r.title, r.tax_type, r.tax_definition_id,
             COALESCE(td.name, r.tax_type) AS tax_name,
             r.base_amount, r.tax_rate, r.tax_amount, r.total_amount,
             r.due_date, r.status, r.created_at, r.declaration_number, r.address
      FROM tax_reports r
      LEFT JOIN tax_definitions td ON td.id = r.tax_definition_id
      ${whereSql}
      ORDER BY r.created_at DESC, r.id DESC
    `;
    return db.prepare(sql).all(...params);
  },

  getTaxReportById(id) {
    return db.prepare("SELECT * FROM tax_reports WHERE id = ?").get(id);
  },

  updateTaxReport(id, fields) {
    // Only update allowed columns
    db.prepare(
      `UPDATE tax_reports
       SET title = ?, tax_type = ?, tax_definition_id = ?,
           base_amount = ?, tax_rate = ?, tax_amount = ?, total_amount = ?,
           due_date = ?, address = ?
       WHERE id = ?`
    ).run(
      fields.title,
      fields.tax_type,
      fields.tax_definition_id,
      fields.base_amount,
      fields.tax_rate,
      fields.tax_amount,
      fields.total_amount,
      fields.due_date || null,
      fields.address || null,
      id
    );
  },

  deleteTaxReport(id) {
    db.prepare("DELETE FROM tax_reports WHERE id = ?").run(id);
  },

  getAdminTaxSummary(opts = {}) {
    const whereParts = [];
    const params = [];
    buildReportsFilter(whereParts, params, { ...opts, isAdminView: true });
    const whereSql = whereParts.length ? "WHERE " + whereParts.join(" AND ") : "";
    const sql = `
      SELECT
        r.tax_type,
        r.tax_definition_id,
        COUNT(*) as report_count,
        SUM(r.base_amount) as total_base,
        SUM(r.tax_amount) as total_tax,
        SUM(r.total_amount) as total_total
      FROM tax_reports r
      ${whereSql}
      GROUP BY r.tax_type, r.tax_definition_id
      ORDER BY r.tax_type
    `;
    return db.prepare(sql).all(...params);
  },

  getAdminReportsWithFilters(opts = {}) {
    const whereParts = [];
    const params = [];
    buildReportsFilter(whereParts, params, { ...opts, isAdminView: true });
    const whereSql = whereParts.length ? "WHERE " + whereParts.join(" AND ") : "";
    const sql = `
      SELECT
        r.id, r.user_id, u.email as user_email,
        r.title, r.tax_type, r.tax_definition_id,
        r.base_amount, r.tax_rate, r.tax_amount, r.total_amount,
        r.due_date, r.status, r.created_at,
        r.declaration_number, r.address
      FROM tax_reports r
      LEFT JOIN users u ON u.id = r.user_id
      ${whereSql}
      ORDER BY r.created_at DESC, r.id DESC
    `;
    return db.prepare(sql).all(...params);
  },

  getDashboardStats() {
    // total reports
    const totalRow = db.prepare("SELECT COUNT(*) as cnt FROM tax_reports").get();
    const total = totalRow ? totalRow.cnt : 0;

    const byStatus = db.prepare(
      "SELECT status, COUNT(*) as cnt FROM tax_reports GROUP BY status"
    ).all();

    let active = 0, pending = 0, completed = 0;
    for (const r of byStatus) {
      if (r.status === "заплановано") active = r.cnt;
      else if (r.status === "на перевірці" || r.status === "подано") pending += r.cnt;
      else if (r.status === "завершено") completed = r.cnt;
    }

    const latestReports = db.prepare(
      `SELECT r.id, r.declaration_number, r.tax_type, r.total_amount,
              r.status, r.created_at, u.email as user_email
       FROM tax_reports r
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 5`
    ).all();

    return {
      reports_total: total,
      reports_active: active,
      reports_pending: pending,
      reports_completed: completed,
      latestReports
    };
  }
};