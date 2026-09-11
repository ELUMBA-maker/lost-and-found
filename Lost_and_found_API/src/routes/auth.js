import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { login,register,refresh } from "../../Controllers/authCtrl.js";
import { loginLimiter, refreshLimiter } from "../middleware/rateLimiter.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/token.js";

const router = Router();


router.post("/register", register); 
router.post("/login", loginLimiter, login); 
router.post("/refresh",refreshLimiter, refresh); 

router.get("/me", async (req, res) => {
  res.status(401).json({
    message: "Use the authenticated /api/users/me endpoint"
  });
});

export default router;