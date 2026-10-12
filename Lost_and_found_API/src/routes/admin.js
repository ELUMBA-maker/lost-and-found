import { Router } from "express";
import pool from "../db.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();
const itemStatuses = ["lost", "found", "claimed", "returned"];
const claimStatuses = ["pending", "approved", "rejected"];

// Every endpoint in this router is restricted to authenticated administrators.
router.use(authenticate, requireAdmin);

// Shared pagination helper for admin dashboard lists.
function pagination(query) {
  return {
    limit: Math.min(Math.max(Number.parseInt(query.limit, 10) || 25, 1), 100),
    offset: Math.max(Number.parseInt(query.offset, 10) || 0, 0),
  };
}

// Summary metrics for the admin dashboard, including pending claims and item counts.
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
      [limit, offset],
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
      conditions.push(
        `(i.title ILIKE $${values.length} OR u.email ILIKE $${values.length})`,
      );
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
      values,
    );

    res.json({ count: result.rows.length, limit, offset, items: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin review queue for all claim submissions and their current verification state.
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
      `SELECT c.id, c.item_id, c.claimant_id, c.message, c.status, c.created_at,
              c.evidence_name, c.verification_status, c.payment_status,
              c.payment_amount, c.payment_instructions, c.verified_at, c.paid_at,
              i.title AS item_title, i.status AS item_status,
              reporter.name AS reporter_name, claimant.name AS claimant_name,
              claimant.email AS claimant_email
       FROM claims c
       JOIN items i ON i.id = c.item_id
       JOIN users reporter ON reporter.id = i.user_id
       JOIN users claimant ON claimant.id = c.claimant_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY c.created_at DESC
       LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      values,
    );

    res.json({ count: result.rows.length, limit, offset, claims: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Fetches uploaded proof so the admin can verify the claimant's identity before approval.
router.get("/claims/:id/evidence", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, evidence_data, evidence_name FROM claims WHERE id = $1",
      [req.params.id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Claim not found" });
    if (!result.rows[0].evidence_data)
      return res.status(404).json({ message: "No proof was uploaded" });
    res.json({
      evidence_data: result.rows[0].evidence_data,
      evidence_name: result.rows[0].evidence_name,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Requests a finder reward after a claim has been successfully verified.
router.patch("/claims/:id/payment", async (req, res) => {
  const { amount, instructions } = req.body;
  const parsedAmount = Number(amount);
  if (
    !Number.isFinite(parsedAmount) ||
    parsedAmount < 1000 ||
    parsedAmount > 50000 ||
    !/^\d+$/.test(String(amount))
  ) {
    return res.status(400).json({
      message:
        "The finder reward must be a whole amount between 1,000 and 50,000 XAF",
    });
  }
  if (
    typeof instructions !== "string" ||
    !instructions.trim() ||
    instructions.length > 1000
  ) {
    return res.status(400).json({
      message: "Payment instructions are required (up to 1000 characters)",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE claims SET payment_status = 'requested', payment_amount = $1,
         payment_instructions = $2
       WHERE id = $3 AND verification_status = 'verified'
         AND payment_status = 'not_requested' AND status <> 'rejected'
       RETURNING id, payment_status, payment_amount, payment_instructions`,
      [parsedAmount, instructions.trim(), req.params.id],
    );
    if (result.rows.length === 0) {
      return res
        .status(409)
        .json({ message: "Verify this claim before requesting payment" });
    }
    res.json({ claim: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Records payment completion and closes the claim cycle for the winning claimant.
router.patch("/claims/:id/payment-confirmation", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimResult = await client.query(
      `SELECT c.item_id FROM claims c WHERE c.id = $1
       AND c.verification_status = 'verified' AND c.payment_status = 'requested'
       FOR UPDATE`,
      [req.params.id],
    );
    if (claimResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "No outstanding payment request for this verified claim",
      });
    }
    const itemId = claimResult.rows[0].item_id;
    const updated = await client.query(
      `UPDATE claims SET payment_status = 'paid', paid_at = CURRENT_TIMESTAMP,
         status = 'approved'
       WHERE id = $1 RETURNING id, payment_status, paid_at`,
      [req.params.id],
    );
    await client.query("UPDATE items SET status = 'claimed' WHERE id = $1", [
      itemId,
    ]);
    await client.query(
      `UPDATE claims SET status = 'rejected', verification_status = 'rejected'
       WHERE item_id = $1 AND id <> $2 AND payment_status <> 'paid' AND status <> 'rejected'`,
      [itemId, req.params.id],
    );
    await client.query("COMMIT");
    res.json({ claim: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

router.patch("/items/:id", async (req, res) => {
  const { status } = req.body;
  if (!itemStatuses.includes(status)) {
    return res
      .status(400)
      .json({ message: `status must be one of: ${itemStatuses.join(", ")}` });
  }

  try {
    const result = await pool.query(
      "UPDATE items SET status = $1 WHERE id = $2 RETURNING *",
      [status, req.params.id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Item not found" });
    res.json({ message: "Item status updated", item: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/claims/:id", async (req, res) => {
  const { status } = req.body;
  if (!claimStatuses.includes(status)) {
    return res
      .status(400)
      .json({ message: `status must be one of: ${claimStatuses.join(", ")}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimResult = await client.query(
      "SELECT item_id, verification_status FROM claims WHERE id = $1 FOR UPDATE",
      [req.params.id],
    );
    if (claimResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Claim not found" });
    }

    const itemId = claimResult.rows[0].item_id;
    if (claimResult.rows[0].verification_status !== "pending") {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ message: "This claim has already been reviewed" });
    }
    const updated = await client.query(
      `UPDATE claims SET status = CASE WHEN $1 = 'rejected' THEN 'rejected' ELSE status END,
         verification_status = CASE WHEN $1 = 'approved' THEN 'verified' ELSE 'rejected' END,
         verified_at = CASE WHEN $1 = 'approved' THEN CURRENT_TIMESTAMP ELSE verified_at END
       WHERE id = $2 RETURNING *`,
      [status, req.params.id],
    );
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
