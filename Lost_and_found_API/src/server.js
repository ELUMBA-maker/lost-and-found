import express from "express";
import "dotenv/config";
import pool, { validateDatabaseUrl } from "./db.js";
import init_db from "../database/init_db.js";
import { generalLimiter } from "./middleware/rateLimiter.js";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import itemRoutes from "./routes/items.js";
import claimRoutes from "./routes/claims.js";
import adminRoutes from "./routes/admin.js";
import createTables from "../database/init_db.js";

const app = express();
const PORT = process.env.PORT || 6000;

app.use(express.json({ limit: "70mb" }));

app.use(generalLimiter);

app.get("/", (req, res) => {
  res.json({
    message: "Lost and Found API is running",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS database_time");

    res.json({
      server: "ok",
      database: "connected",
      supabase: "accessible",
      database_time: result.rows[0].database_time,
    });
  } catch (error) {
    res.status(500).json({
      server: "ok",
      database: "disconnected",
      supabase: "inaccessible",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/claims", claimRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  if (error.type === "entity.too.large" || error.status === 413) {
    return res.status(413).json({
      message: "Request is too large. Choose a smaller photo and try again.",
    });
  }

  res.status(500).json({
    message: "Internal server error",
  });
});

async function startServer() {
  try {
    validateDatabaseUrl();
    await pool.query("SELECT 1");
    console.log("Supabase database accessible");
    await createTables();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Could not connect to Supabase PostgreSQL:", error.message);
    process.exit(1);
  }
}

startServer();
