import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../src/db.js";
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";

export async function register(req, res) {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "name, email and password are  all required"
      });
    }
    if(!/^\d+$/.test(phone)){
      return res.status(400).json({
        message:"Phone must contain numbers only"
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must contain at least 6 characters"
      });
    }
    if(!/[A-Z]/.test(password)){
      return res.status(400).json({
        message:"Password Must Contain At least One Upper Case Letter"
      });
    }
      if(!/[a-z]/.test(password)){
      return res.status(400).json({
        message:"Password Must Contain At least One Lower Case Letter"
      });
    }
      if(!/\d/.test(password)){
      return res.status(400).json({
        message:"Password Must Contain At least One Number"
      });
    }
      if(!/[@$!%*?&]/.test(password)){
      return res.status(400).json({
        message:"Password Must Contain At least One Special Case Letter"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex= /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if(!emailRegex.test(normalizedEmail)){
      return res.status(400).json({
        message:"Use a Valid Email Format"
      });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, created_at`,
      [name.trim(), normalizedEmail, passwordHash, phone || null]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: "Registration successful",
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "email and password are required"
      });
    }
    const emailRegex= /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

     if (!emailRegex.test(email)) {
        return res.status(400).json({
        message: "Invalid email format"
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      },
        accessToken,
       refreshToken
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
export async function refresh(req,res) {
    try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token required"
      });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    const accessToken = generateAccessToken({
      id: decoded.id,
      email: decoded.email
    });

    res.json({
      accessToken
    });

  } catch (error) {
    console.error(error);

    res.status(401).json({
      message: "Invalid or expired refresh token"
    });
  }
};
