import pool from "../src/db.js";

export async function me(req,res) {
  try {
    const result = await pool.query(
      "SELECT id, name, email, phone, created_at FROM users WHERE id = $1",
      [req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};