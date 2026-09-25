import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { login,register,refresh, my } from "../../Controllers/authCtrl.js";
import { loginLimiter, refreshLimiter } from "../middleware/rateLimiter.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/token.js";


const router = Router();

router.post("/register", register); 
router.post("/login", loginLimiter, login); 
router.post("/refresh",refreshLimiter, refresh); 
router.get("/me", my);

export default router;