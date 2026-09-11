import { Router } from "express";
import pool from "../db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

const allowedStatuses = ["lost", "found", "claimed", "returned"];

router.post("/", authenticate, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      location,
      item_date,
      status,
      contact_phone
    } = req.body;

    if (!title || !description || !category || !location || !item_date || !status) {
      return res.status(400).json({
        message: "title, description, category, location, item_date and status are required"
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: `status must be one of: ${allowedStatuses.join(", ")}`
      });
    }

    const result = await pool.query(
      `INSERT INTO items
       (user_id, title, description, category, location, item_date, status, contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        req.user.id,
        title.trim(),
        description.trim(),
        category.trim(),
        location.trim(),
        item_date,
        status,
        contact_phone || req.user.phone || null
      ]
    );

    res.status(201).json({
      message: "Item reported successfully",
      item: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status, category, location, search, mine } = req.query;

    const values = [];
    const conditions = [];

    if (status) {
      values.push(status);
      conditions.push(`i.status = $${values.length}`);
    }

    if (category) {
      values.push(category);
      conditions.push(`LOWER(i.category) = LOWER($${values.length})`);
    }

    if (location) {
      values.push(`%${location}%`);
      conditions.push(`i.location ILIKE $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      const p = values.length;
      conditions.push(
        `(i.title ILIKE $${p} OR i.description ILIKE $${p} OR i.location ILIKE $${p})`
      );
    }

    if (mine === "true") {
      return res.status(400).json({
        message: "Use GET /api/items/my for your own reports"
      });
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await pool.query(
      `SELECT
         i.*,
         u.name AS reporter_name,
         u.email AS reporter_email
       FROM items i
       JOIN users u ON u.id = i.user_id
       ${where}
       ORDER BY i.created_at DESC`,
      values
    );

    res.json({
      count: result.rows.length,
      items: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/my", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM items
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      count: result.rows.length,
      items: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         i.*,
         u.name AS reporter_name,
         u.email AS reporter_email,
         u.phone AS reporter_phone
       FROM items i
       JOIN users u ON u.id = i.user_id
       WHERE i.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id", authenticate, async (req, res) => {
  try {
    const itemResult = await pool.query(
      "SELECT * FROM items WHERE id = $1",
      [req.params.id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (itemResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({
        message: "You can only update your own reports"
      });
    }

    const {
      title,
      description,
      category,
      location,
      item_date,
      status,
      contact_phone
    } = req.body;

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: `status must be one of: ${allowedStatuses.join(", ")}`
      });
    }

    const current = itemResult.rows[0];

    const result = await pool.query(
      `UPDATE items
       SET title = $1,
           description = $2,
           category = $3,
           location = $4,
           item_date = $5,
           status = $6,
           contact_phone = $7
       WHERE id = $8
       RETURNING *`,
      [
        title ?? current.title,
        description ?? current.description,
        category ?? current.category,
        location ?? current.location,
        item_date ?? current.item_date,
        status ?? current.status,
        contact_phone ?? current.contact_phone,
        req.params.id
      ]
    );

    res.json({
      message: "Item updated successfully",
      item: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM items WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Item not found or you are not its owner"
      });
    }

    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;