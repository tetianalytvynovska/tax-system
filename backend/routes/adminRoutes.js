const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const db = require("../db");

// Server uses the same constant in server.js. We mirror it here to keep this router self-contained.
const JWT_SECRET = "taxagent-secret";

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

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "Administrator") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// GET /api/admin/dashboard
router.get("/dashboard", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const users_total = db.countUsers();

    // Status mapping for UI:
    // - "Активні" : заплановано (draft/ready)
    // - "На перевірці" : подано або на перевірці
    // - "Завершено" : завершено
    const counts = db.raw
      .prepare(
        `SELECT status, COUNT(*) as cnt
         FROM tax_reports
         GROUP BY status`
      )
      .all();

    let reports_active = 0;
    let reports_pending = 0;
    let reports_completed = 0;
    for (const c of counts) {
      const s = String(c.status || "").trim().toLowerCase();
      if (s === "заплановано") reports_active += c.cnt;
      else if (s === "подано" || s === "на перевірці") reports_pending += c.cnt;
      else if (s === "завершено") reports_completed += c.cnt;
    }

    const latest_users = db.getLatestUsers(5).map((u) => ({
      id: u.id,
      email: u.email,
    }));

    // Show latest *submitted* declarations (exclude drafts)
    const latest_reports = db.raw
      .prepare(
        `SELECT r.id, u.email AS user_email, r.status
         FROM tax_reports r
         LEFT JOIN users u ON u.id = r.user_id
         WHERE LOWER(TRIM(r.status)) != 'заплановано'
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT 5`
      )
      .all();

    res.json({
      users_total,
      reports_active,
      reports_pending,
      reports_completed,
      latest_users,
      latest_reports,
    });

  } catch (err) {
    console.error("ADMIN DASHBOARD ERROR:", err);
    res.status(500).json({ error: "Dashboard failed", details: err.message });
  }
});

// EXPORT
module.exports = router;
