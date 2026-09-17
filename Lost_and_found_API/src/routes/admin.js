import { Router } from "express";
import pool from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();
const itemStatuses = ["lost", "found", "claimed", "returned"];
const claimStatuses = ["pending", "approved", "rejected"];

router.use(authenticate, requireAdmin);

function pagination(query) {
  return {
    limit: Math.min(Math.max(Number.parseInt(query.limit, 10) || 25, 1), 100),
    offset: Math.max(Number.parseInt(query.offset, 10) || 0, 0)
  };
}

router.get("/overview", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM items) AS items,
        (SELECT COUNT(*) FROM claims) AS claims,
        (SELECT COUNT(*) FROM claims WHERE status = 'pending') AS pending_claims,
        (SELECT COUNT(*) FROM items WHERE status = 'lost') AS lost_items,
        (SELECT COUNT(*) FROM items WHERE status = 'found') AS found_items,
        (SELECT COUNT(*) FROM items WHERE status = 'returned') AS returned_items
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const { limit, offset } = pagination(req.query);
    const result = await pool.query(
      `SELECT id, name, email, phone, role, created_at,
              (SELECT COUNT(*) FROM items WHERE user_id = users.id) AS item_count,
              (SELECT COUNT(*) FROM claims WHERE claimant_id = users.id) AS claim_count
       FROM users
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ count: result.rows.length, limit, offset, users: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/items", async (req, res) => {
  try {
    const { limit, offset } = pagination(req.query);
    const values = [];
    const conditions = [];

    if (req.query.status) {
      if (!itemStatuses.includes(req.query.status)) {
        return res.status(400).json({ message: "Invalid item status" });
      }
      values.push(req.query.status);
      conditions.push(`i.status = $${values.length}`);
    }

    if (req.query.search) {
      values.push(`%${req.query.search}%`);
      conditions.push(`(i.title ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
    }

    const limitPosition = values.length + 1;
    const offsetPosition = values.length + 2;
    values.push(limit, offset);
    const result = await pool.query(
      `SELECT i.*, u.name AS reporter_name, u.email AS reporter_email
       FROM items i
       JOIN users u ON u.id = i.user_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY i.created_at DESC
       LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      values
    );

    res.json({ count: result.rows.length, limit, offset, items: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/claims", async (req, res) => {
  try {
    const { limit, offset } = pagination(req.query);
    const values = [];
    const conditions = [];

    if (req.query.status) {
      if (!claimStatuses.includes(req.query.status)) {
        return res.status(400).json({ message: "Invalid claim status" });
      }
      values.push(req.query.status);
      conditions.push(`c.status = $${values.length}`);
    }

    const limitPosition = values.length + 1;
    const offsetPosition = values.length + 2;
    values.push(limit, offset);
    const result = await pool.query(
      `SELECT c.*, i.title AS item_title, i.status AS item_status,
              reporter.name AS reporter_name, claimant.name AS claimant_name,
              claimant.email AS claimant_email
       FROM claims c
       JOIN items i ON i.id = c.item_id
       JOIN users reporter ON reporter.id = i.user_id
       JOIN users claimant ON claimant.id = c.claimant_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY c.created_at DESC
       LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      values
    );

    res.json({ count: result.rows.length, limit, offset, claims: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/items/:id", async (req, res) => {
  const { status } = req.body;
  if (!itemStatuses.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${itemStatuses.join(", ")}` });
  }

  try {
    const result = await pool.query(
      "UPDATE items SET status = $1 WHERE id = $2 RETURNING *",
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Item not found" });
    res.json({ message: "Item status updated", item: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/claims/:id", async (req, res) => {
  const { status } = req.body;
  if (!claimStatuses.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${claimStatuses.join(", ")}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimResult = await client.query(
      "SELECT item_id FROM claims WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    if (claimResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Claim not found" });
    }

    const itemId = claimResult.rows[0].item_id;
    const updated = await client.query(
      "UPDATE claims SET status = $1 WHERE id = $2 RETURNING *",
      [status, req.params.id]
    );
    if (status === "approved") {
      await client.query("UPDATE items SET status = 'claimed' WHERE id = $1", [itemId]);
      await client.query(
        "UPDATE claims SET status = 'rejected' WHERE item_id = $1 AND id <> $2 AND status = 'pending'",
        [itemId, req.params.id]
      );
    }
    await client.query("COMMIT");
    res.json({ message: `Claim ${status}`, claim: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

export default router;
