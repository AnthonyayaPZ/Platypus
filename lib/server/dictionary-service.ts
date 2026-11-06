import { searchDictionary, saveDictionaryEntry, ensureDatabase } from "../../db/runtime";
import { pool } from "../../db/index";
import type { WordEntry } from "../dictionary";
import { normalizeDictionaryTerm } from "../terms";
import { DictionaryGenerationError, generateDictionaryEntry, generateDictionaryEntries, generationErrorMessage } from "../llm";

export async function getOrGenerateDictionaryEntry(word: string) {
  if (normalizeDictionaryTerm(word) !== word) throw new DictionaryGenerationError("invalid-response");
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

async function withDictionaryLocks(words: string[], action: () => Promise<void>) {
  const { Client } = await import("pg");
  const lock = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
  await lock.connect();
  try {
    await lock.query("SET statement_timeout = '150000'");
    // Use a single canonical lock order, including the actual hash keys, so
    // overlapping batches cannot deadlock, even on a hash collision.
    const keys = await lock.query("SELECT DISTINCT hashtext('dictionary:' || word) AS key FROM unnest($1::text[]) AS words(word) ORDER BY key", [words]);
    for (const { key } of keys.rows) await lock.query("SELECT pg_advisory_lock($1::bigint)", [key]);
    await action();
  } finally { await lock.end(); }
}

export type DictionaryBatchDependencies = {
  initialize: () => Promise<void>;
  existingWords: (words: string[]) => Promise<Set<string>>;
  generate: typeof generateDictionaryEntries;
  persist: (entry: WordEntry) => Promise<void>;
  withLocks: (words: string[], action: () => Promise<void>) => Promise<void>;
};

const batchDefaults: DictionaryBatchDependencies = {
  initialize: ensureDatabase,
  existingWords: async (words) => new Set((await pool.query("SELECT word FROM dictionary_entries WHERE word=ANY($1::text[])", [words])).rows.map((row) => String(row.word))),
  generate: generateDictionaryEntries,
  persist: saveDictionaryEntry,
  withLocks: withDictionaryLocks,
};

/** Null means cached/generated successfully; a string is a safe per-word error. */
export async function getOrGenerateDictionaryEntries(words: string[], overrides: Partial<DictionaryBatchDependencies> = {}): Promise<Map<string, string | null>> {
  const deps = { ...batchDefaults, ...overrides };
  const results = new Map<string, string | null>();
  if (!words.length) return results;
  if (words.length > 30 || new Set(words).size !== words.length || words.some((word) => !/^[a-z][a-z'-]{0,47}$/.test(word))) throw new DictionaryGenerationError("invalid-response");
  try {
    await deps.initialize();
    const cached = await deps.existingWords(words);
    for (const word of words) if (cached.has(word)) results.set(word, null);
    const missing = words.filter((word) => !cached.has(word));
    if (!missing.length) return results;
    await deps.withLocks(missing, async () => {
      // A web request or another batch may have populated the cache meanwhile.
      const nowCached = await deps.existingWords(missing);
      for (const word of missing) if (nowCached.has(word)) results.set(word, null);
      const pending = missing.filter((word) => !nowCached.has(word));
      if (!pending.length) return;
      const entries = await deps.generate(pending); // Exactly one LLM request.
      for (const word of pending) {
        try {
          const entry = entries.get(word);
          if (!entry || entry instanceof DictionaryGenerationError) throw entry ?? new DictionaryGenerationError("invalid-response");
          if (entry.word !== word) throw new DictionaryGenerationError("invalid-response");
          await deps.persist(entry);
          results.set(word, null);
        } catch (error) { results.set(word, generationErrorMessage(error)); }
      }
    });
  } catch (error) {
    // Keep cache hits and any already-persisted successes even if generation or
    // locking failed. Never fall back to one LLM call per word.
    for (const word of words) if (!results.has(word)) results.set(word, generationErrorMessage(error));
  }
  return results;
}
