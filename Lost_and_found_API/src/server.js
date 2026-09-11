import express from "express";
import "dotenv/config";
import pool from "./db.js";
import init_db from "../database/init_db.js"
import { generalLimiter } from "./middleware/rateLimiter.js";




import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import itemRoutes from "./routes/items.js";
import claimRoutes from "./routes/claims.js";
import createTables from "../database/init_db.js";

const app = express();
const PORT = process.env.PORT || 6000;

app.use(express.json());

app.use(generalLimiter);



app.get("/", (req, res) => {
  res.json({
    message: "Lost and Found API is running",
    version: "1.0.1"
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS database_time");

    res.json({
      server: "ok",
      database: "connected",
      database_time: result.rows[0].database_time
    });
  } catch (error) {
    res.status(500).json({
      server: "ok",
      database: "disconnected"
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/claims", claimRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found"
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    message: "Internal server error"
  });
});

async function startServer() {
  try {
    await createTables()
    await pool.query("SELECT 1");
    console.log("PostgreSQL connected");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Could not connect to PostgreSQL:", error.message);
    process.exit(1);
  }
}

startServer();