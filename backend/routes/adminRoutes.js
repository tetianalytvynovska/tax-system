const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/admin/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const usersTotal = await db.get("SELECT COUNT(*) AS total FROM users");
    const reportsActive = await db.get("SELECT COUNT(*) AS total FROM tax_reports WHERE status = 'active'");
    const reportsPending = await db.get("SELECT COUNT(*) AS total FROM tax_reports WHERE status = 'pending'");
    const reportsCompleted = await db.get("SELECT COUNT(*) AS total FROM tax_reports WHERE status = 'completed'");

    const latestUsers = await db.all("SELECT id, email FROM users ORDER BY id DESC LIMIT 5");
    const latestReports = await db.all(`
      SELECT t.id, t.declaration_number, u.email AS user_email, t.status
      FROM tax_reports t
      LEFT JOIN users u ON u.id = t.user_id
      ORDER BY t.id DESC
      LIMIT 5
    `);

    res.json({
      users_total: usersTotal.total,
      reports_active: reportsActive.total,
      reports_pending: reportsPending.total,
      reports_completed: reportsCompleted.total,
      latest_users: latestUsers,
      latest_reports: latestReports
    });

  } catch (err) {
    console.error("ADMIN DASHBOARD ERROR:", err);
    res.status(500).json({ error: "Dashboard failed", details: err.message });
  }
});

// EXPORT
module.exports = router;
