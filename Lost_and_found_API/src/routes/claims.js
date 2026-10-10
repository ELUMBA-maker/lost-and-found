import { Router } from "express";
import pool from "../db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Claim creation, ownership checks, and evidence validation for reported items.
router.post("/", authenticate, async (req, res) => {
  try {
    const { item_id, message, evidence_data, evidence_name } = req.body;

    if (!item_id || !message) {
      return res.status(400).json({
        message: "item_id and message are required",
      });
    }

    const itemResult = await pool.query("SELECT * FROM items WHERE id = $1", [
      item_id,
    ]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    const item = itemResult.rows[0];

    if (item.status !== "found") {
      return res.status(400).json({
        message: "Claims can only be made on items with status 'found'",
      });
    }

    if (item.user_id === req.user.id) {
      return res.status(400).json({
        message: "You cannot claim an item you reported",
      });
    }

    if (
      evidence_data &&
      (typeof evidence_data !== "string" ||
        !/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(
          evidence_data,
        ) ||
        Buffer.byteLength(evidence_data, "utf8") > 11 * 1024 * 1024)
    ) {
      return res.status(400).json({
        message: "Proof must be a JPG, PNG, WebP, or PDF smaller than 8 MB",
      });
    }

    if (evidence_name && typeof evidence_name !== "string") {
      return res.status(400).json({ message: "Invalid proof filename" });
    }

    const result = await pool.query(
      `INSERT INTO claims (item_id, claimant_id, message, evidence_data, evidence_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        item_id,
        req.user.id,
        message.trim(),
        evidence_data || null,
        evidence_name || null,
      ],
    );

    res.status(201).json({
      message: "Claim submitted successfully",
      claim: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "You already submitted a claim for this item",
      });
    }

    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Returns all claims created by the signed-in user, including review and payment states.
router.get("/my", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        c.id, c.item_id, c.claimant_id, c.message, c.status, c.created_at,
        c.evidence_name, c.verification_status, c.payment_status,
         c.payment_amount, c.payment_instructions, c.verified_at, c.paid_at,
         i.title AS item_title,
         i.description AS item_description,
         i.location AS item_location,
         u.name AS reporter_name,
         CASE WHEN c.payment_status = 'paid' THEN u.email END AS reporter_email,
         CASE WHEN c.payment_status = 'paid' THEN COALESCE(i.contact_phone, u.phone) END AS reporter_phone
       FROM claims c
       JOIN items i ON i.id = c.item_id
       JOIN users u ON u.id = i.user_id
       WHERE c.claimant_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.id],
    );

    res.json({
      count: result.rows.length,
      claims: result.rows,
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
      [req.params.itemId],
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({
        message: "Only the item reporter can view its claims",
      });
    }

    const result = await pool.query(
      `SELECT
        c.id, c.item_id, c.claimant_id, c.message, c.status, c.created_at,
        c.evidence_name, c.verification_status, c.payment_status,
        c.payment_amount, c.payment_instructions, c.verified_at, c.paid_at,
        u.name AS claimant_name,
        CASE WHEN c.payment_status = 'paid' THEN u.email END AS claimant_email,
        CASE WHEN c.payment_status = 'paid' THEN u.phone END AS claimant_phone
       FROM claims c
       JOIN users u ON u.id = c.claimant_id
       WHERE c.item_id = $1
       ORDER BY c.created_at DESC`,
      [req.params.itemId],
    );

    res.json({
      count: result.rows.length,
      claims: result.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Restricts conversation access to the two participants only after payment is confirmed.
async function loadChatClaim(claimId, user) {
  const result = await pool.query(
    `SELECT c.id, c.claimant_id, c.payment_status, i.user_id AS reporter_id
     FROM claims c JOIN items i ON i.id = c.item_id WHERE c.id = $1`,
    [claimId],
  );
  const claim = result.rows[0];
  if (!claim) return { response: { status: 404, message: "Claim not found" } };
  const isClaimant =
    claim.claimant_id === user.id && claim.payment_status === "paid";
  const isReporter =
    claim.reporter_id === user.id && claim.payment_status === "paid";
  if (user.role === "admin" || (!isClaimant && !isReporter)) {
    return {
      response: {
        status: 403,
        message: "You cannot access this claim conversation",
      },
    };
  }
  return { claim };
}

router.get("/:id/messages", authenticate, async (req, res) => {
  try {
    const access = await loadChatClaim(req.params.id, req.user);
    if (access.response)
      return res
        .status(access.response.status)
        .json({ message: access.response.message });
    const result = await pool.query(
      `SELECT m.id, m.claim_id, m.sender_id, m.message, m.created_at, u.name AS sender_name, u.role AS sender_role
       FROM claim_messages m JOIN users u ON u.id = m.sender_id
       WHERE m.claim_id = $1 ORDER BY m.created_at ASC`,
      [req.params.id],
    );
    res.json({ messages: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/messages", authenticate, async (req, res) => {
  try {
    const message =
      typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!message || message.length > 2000) {
      return res
        .status(400)
        .json({ message: "Message must be between 1 and 2000 characters" });
    }
    const access = await loadChatClaim(req.params.id, req.user);
    if (access.response)
      return res
        .status(access.response.status)
        .json({ message: access.response.message });
    const result = await pool.query(
      "INSERT INTO claim_messages (claim_id, sender_id, message) VALUES ($1, $2, $3) RETURNING id, claim_id, sender_id, message, created_at",
      [req.params.id, req.user.id, message],
    );
    res.status(201).json({
      message: {
        ...result.rows[0],
        sender_name: req.user.name,
        sender_role: req.user.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/:id", authenticate, async (req, res) => {
  try {
    const { status } = req.body;

    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only an administrator can review claims" });
    }

    if (status !== "rejected") {
      return res.status(400).json({
        message: "Only an administrator can verify a claim",
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
      [req.params.id],
    );

    if (claimResult.rows.length === 0) {
      return res.status(404).json({ message: "Claim not found" });
    }

    const claim = claimResult.rows[0];

    if (claim.item_owner_id !== req.user.id) {
      return res.status(403).json({
        message: "Only the item reporter can approve or reject a claim",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const updatedClaim = await client.query(
        `UPDATE claims
           SET status = 'rejected', verification_status = 'rejected'
         WHERE id = $1
         RETURNING *`,
        [req.params.id],
      );

      await client.query("COMMIT");

      res.json({
        message: "Claim rejected",
        claim: updatedClaim.rows[0],
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
router.post("/", authenticate, post_claim);
router.get("/my", authenticate, my_claims);
router.get("/item/:itemId", authenticate, get_claim_on_item_by_id);
router.patch("/:id", authenticate, update_claim_status);

export default router;
