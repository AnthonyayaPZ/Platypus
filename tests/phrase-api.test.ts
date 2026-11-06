import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pool } from "../db/index";
import { loadState, saveDictionaryEntry } from "../db/runtime";
import { GET as search } from "../app/api/search/route";
import { POST as action } from "../app/api/state/route";
import { phraseGroupId } from "../lib/terms";

test("real API routes cache a complete phrase, use separate defaults, honor manual selection and preserve notes", async () => {
  const db = new PGlite();
  const previousUrl = process.env.DATABASE_URL;
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  process.env.DATABASE_URL = "postgresql://unused-for-pglite/fixture";
  const query = async (text: string, values?: unknown[]) => db.query(text, values);
  Object.defineProperty(pool, "query", { value: query, configurable: true, writable: true });
  Object.defineProperty(pool, "connect", { value: async () => ({ query, release() {} }), configurable: true, writable: true });
  const post = (body: object) => action(new Request("http://localhost/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  try {
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
    const initial = await loadState();
    const phraseId = phraseGroupId("local-demo");
    assert.equal(initial.groups.filter((group) => group.kind === "phrases").length, 1);
    assert.equal(initial.dictionaryFeatures.phrases, true);
    const word = "look forward to";
    await saveDictionaryEntry({ word, phonetic: "", part: "phr. v.", meaning: "期待", summary: "to 后接名词或动名词。", example: "I look forward to seeing you.", exampleZh: "我期待见到你。", synonyms: [], antonyms: [], relations: [] });
    const cached = await search(new Request(`http://localhost/api/search?q=${encodeURIComponent(" LOOK  forward TO ")}`));
    assert.equal(cached.status, 200);
    const result = await cached.json() as { entry: { word: string }; source: string };
    assert.equal(result.entry.word, word); assert.equal(result.source, "server-dictionary");
    const invalid = await search(new Request("http://localhost/api/search?q=one,two")); assert.equal(invalid.status, 400);
    assert.equal((await post({ action: "saveWord", word })).status, 200);
    assert.equal((await post({ action: "saveWord", word })).status, 200);
    const saved = await loadState();
    assert.deepEqual(saved.savedWords.filter((item) => item.word === word).map((item) => item.group_id), [phraseId]);
    assert.equal((await post({ action: "updateNote", word, note: "保留这条短语笔记" })).status, 200);
    const before = (await db.query("SELECT * FROM user_words WHERE word=$1", [word])).rows;
    assert.equal((await post({ action: "saveWord", word, groupId: "work" })).status, 200);
    assert.deepEqual((await db.query("SELECT * FROM user_words WHERE word=$1", [word])).rows, before);
    assert.equal((await post({ action: "deleteGroup", groupId: phraseId })).status, 409);
    assert.equal((await post({ action: "setDefaultGroup", groupId: phraseId })).status, 409);
    assert.equal((await post({ action: "saveWord", word: "resilient" })).status, 200);
    assert.equal((await post({ action: "saveWord", word, groupId: "other-user-group" })).status, 404);
    const final = await loadState();
    assert.equal(final.groups.find((group) => group.is_default)?.id, "default");
    assert.ok(final.savedWords.some((item) => item.word === "resilient" && item.group_id === "default"));
    assert.equal(final.wordMeta.find((item) => item.word === word)?.note, "保留这条短语笔记");
  } finally {
    Object.defineProperty(pool, "query", { value: originalQuery });
    Object.defineProperty(pool, "connect", { value: originalConnect });
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    await db.close(); await pool.end();
  }
});
