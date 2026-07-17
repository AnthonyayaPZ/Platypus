import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && !process.argv.includes("generate")) {
  throw new Error("DATABASE_URL is required for database migrations");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // `generate` does not connect; migration and push should always provide DATABASE_URL.
    url: databaseUrl ?? "postgresql://postgres@127.0.0.1:5432/platypus_words",
  },
});
