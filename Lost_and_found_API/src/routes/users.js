import { Router } from "express";
import pool from "../db.js";
import { me } from "../Controllers/userCtrl.js";
import { authenticate } from "../middleware/auth.js";
import { verify_email } from "../Controllers/userCtrl.js";
const router = Router();
router.get("/me", authenticate, me)

router.post("/verify-email", verify_email);


export default router;

