import { Router } from "express";
import pool from "../db.js";
import { me } from "../../Controllers/userCtrl.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/me", authenticate, me)

export default router;