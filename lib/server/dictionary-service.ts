import { searchDictionary, saveDictionaryEntry, ensureDatabase } from "../../db/runtime";
import { generateDictionaryEntry } from "../llm";

export async function getOrGenerateDictionaryEntry(word: string) {
  await ensureDatabase();
  const cached = await searchDictionary(word);
  if (cached) return { ...cached, source: "server-dictionary" };
  // The same lock is used by the web process and background workers.
  // Reserve it in a separate connection so small application pools do not deadlock.
  const { Client } = await import("pg");
  const lock = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
  await lock.connect();
  try {
    await lock.query("SET statement_timeout = '45000'");
    await lock.query("SELECT pg_advisory_lock(hashtext($1))", [`dictionary:${word}`]);
    const existing = await searchDictionary(word);
    if (existing) return { ...existing, source: "server-dictionary" };
    const entry = await generateDictionaryEntry(word);
    await saveDictionaryEntry(entry);
    return { entry, meta: null, source: "llm-generated" };
  } finally {
    await lock.end();
  }
}
