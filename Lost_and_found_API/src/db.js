import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

export function validateDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;
  let databaseUrl;

  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error(
      "DATABASE_URL must use the postgres:// or postgresql:// protocol",
    );
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

export default pool;
