import { Router } from "express";
import pool from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { get_claim_on_item_by_id, my_claims, post_claim, update_claim_status } from "../Controllers/ClaimCtrl.js";

const router = Router();

router.post("/", authenticate, post_claim);
router.get("/my", authenticate, my_claims);
router.get("/item/:itemId", authenticate, get_claim_on_item_by_id);
router.patch("/:id", authenticate, update_claim_status);

export default router;