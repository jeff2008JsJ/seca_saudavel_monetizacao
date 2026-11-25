const Database = require("better-sqlite3");
const db = new Database("seca-saudavel.sqlite");

const id = "dc66cfdac45d4b7ea5b87bf8967fb5f9";

const result = db.prepare(`
  UPDATE subscriptions
  SET status = ?, updated_at = CURRENT_TIMESTAMP
  WHERE mp_preapproval_id = ? AND user_id = ?
`).run("authorized", id, 1);

console.log("Registros atualizados:", result.changes);

console.log(
  db.prepare("SELECT user_id, status, mp_preapproval_id FROM subscriptions WHERE mp_preapproval_id = ?").get(id)
);

db.close();
