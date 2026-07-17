import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const poolMax = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "10", 10);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (error) => console.error("PostgreSQL connection pool error", error));

export function assertDatabaseConfiguration() {
  if (!process.env.DATABASE_URL) {
    throw new Error("缺少 DATABASE_URL，请先配置 PostgreSQL 连接地址");
  }
}

export const db = drizzle(pool, { schema });
export { pool };
