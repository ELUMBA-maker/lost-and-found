import { Router } from "express";
import pool from "../db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.post("/", authenticate, async (req, res) => {
  try {
    const { item_id, message } = req.body;

    if (!item_id || !message) {
      return res.status(400).json({
        message: "item_id and message are required"
      });
    }

    const itemResult = await pool.query(
      "SELECT * FROM items WHERE id = $1",
      [item_id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    const item = itemResult.rows[0];

    if (item.status !== "found") {
      return res.status(400).json({
        message: "Claims can only be made on items with status 'found'"
      });
    }

    if (item.user_id === req.user.id) {
      return res.status(400).json({
        message: "You cannot claim an item you reported"
      });
    }

    const result = await pool.query(
      `INSERT INTO claims (item_id, claimant_id, message)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [item_id, req.user.id, message.trim()]
    );

    res.status(201).json({
      message: "Claim submitted successfully",
      claim: result.rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "You already submitted a claim for this item"
      });
    }

    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/my", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         c.*,
         i.title AS item_title,
         i.description AS item_description,
         i.location AS item_location,
         u.name AS reporter_name
       FROM claims c
       JOIN items i ON i.id = c.item_id
       JOIN users u ON u.id = i.user_id
       WHERE c.claimant_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    res.json({
      count: result.rows.length,
      claims: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/item/:itemId", authenticate, async (req, res) => {
  try {
    const ownerCheck = await pool.query(
      "SELECT user_id FROM items WHERE id = $1",
      [req.params.itemId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({
        message: "Only the item reporter can view its claims"
      });
    }

    const result = await pool.query(
      `SELECT
         c.*,
         u.name AS claimant_name,
         u.email AS claimant_email,
         u.phone AS claimant_phone
       FROM claims c
       JOIN users u ON u.id = c.claimant_id
       WHERE c.item_id = $1
       ORDER BY c.created_at DESC`,
      [req.params.itemId]
    );

    res.json({
      count: result.rows.length,
      claims: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/:id", authenticate, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "status must be approved or rejected"
      });
    }

    const claimResult = await pool.query(
      `SELECT
         c.*,
         i.user_id AS item_owner_id,
         i.id AS item_id
       FROM claims c
       JOIN items i ON i.id = c.item_id
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (claimResult.rows.length === 0) {
      return res.status(404).json({ message: "Claim not found" });
    }

    const claim = claimResult.rows[0];

    if (claim.item_owner_id !== req.user.id) {
      return res.status(403).json({
        message: "Only the item reporter can approve or reject a claim"
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const updatedClaim = await client.query(
        `UPDATE claims
         SET status = $1
         WHERE id = $2
         RETURNING *`,
        [status, req.params.id]
      );

      if (status === "approved") {
        await client.query(
          "UPDATE items SET status = 'claimed' WHERE id = $1",
          [claim.item_id]
        );

        await client.query(
          `UPDATE claims
           SET status = 'rejected'
           WHERE item_id = $1
             AND id <> $2
             AND status = 'pending'`,
          [claim.item_id, req.params.id]
        );
      }

      await client.query("COMMIT");

      res.json({
        message: `Claim ${status}`,
        claim: updatedClaim.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;