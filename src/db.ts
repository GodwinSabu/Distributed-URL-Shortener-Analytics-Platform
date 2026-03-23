import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                  // max connections in pool
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
export async function connectDB(): Promise<void> {
  const client = await db.connect();
  await client.query("SELECT 1");
  client.release();
  console.log("✅ PostgreSQL connected");
}

export async function disconnectDB(): Promise<void> {
  await db.end();
  console.log("🔌 PostgreSQL disconnected");
}