
const db = require("./db");
module.exports = {
  audit(userId, action, details=null){
    db.prepare("INSERT INTO audit_log (user_id, action, details) VALUES (?,?,?)")
      .run(userId, action, details);
  }
};
