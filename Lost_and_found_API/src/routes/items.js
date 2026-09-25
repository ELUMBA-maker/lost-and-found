import { Router } from "express";
import pool from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { delete_items, get_all_items, get_item_by_id, my_items, post_item, update_item_status } from "../Controllers/ItemCtrl.js";

const router = Router();

const allowedStatuses = ["lost", "found", "claimed", "returned"];

router.post("/", authenticate, post_item);
router.get("/", get_all_items);
router.get("/my", authenticate, my_items);
router.get("/:id", get_item_by_id);
router.put("/:id", authenticate, update_item_status);
router.delete("/:id", authenticate, delete_items);

export default router;