import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://platypus:platypus123@127.0.0.1:5432/platypus",
});

export const db = drizzle(pool, { schema });
export { pool };
