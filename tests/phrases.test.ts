import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { normalizeDictionaryTerm, defaultSearchGroup, phraseGroupId } from "../lib/terms";
import { ensurePhraseGroup } from "../lib/server/phrase-group";
import { generateDictionaryEntry } from "../lib/llm";
import { parseImportWords } from "../lib/search-import";
import { parseReviewOptions, planReviewQuestions, selectReviewRows } from "../lib/server/review-options";
import type { SqlExecutor } from "../lib/server/sql";

test("dictionary keys preserve complete phrases and canonicalize case, whitespace and apostrophes", () => {
  assert.equal(normalizeDictionaryTerm("  Look  Forward\tTo "), "look forward to");
  assert.equal(normalizeDictionaryTerm("at one’s own pace"), "at one's own pace");
  assert.equal(normalizeDictionaryTerm("well-known"), "well-known");
  for (const value of [null, "", "one,two", "hello!", "你好", "https://example.com", "word--word", "'word", Array(9).fill("word").join(" "), "a".repeat(49), `${"a".repeat(48)} ${"b".repeat(48)}`]) assert.equal(normalizeDictionaryTerm(value), null);
  assert.deepEqual(parseImportWords("look forward to").words, ["look", "forward", "to"], "the explicitly separate bulk-word flow retains its original semantics");
});

test("phrase defaults never leak into ordinary-word or global library selection", () => {
  const groups = [{ id: "default", kind: "general", is_default: 1 }, { id: "custom", kind: "general" }, { id: "phrases", kind: "phrases" }];
  assert.equal(defaultSearchGroup(groups, "in terms of", "custom"), "phrases");
  assert.equal(defaultSearchGroup(groups, "word", "custom"), "custom");
  assert.equal(defaultSearchGroup(groups, "word", "phrases"), "default");
  assert.equal(defaultSearchGroup(groups.slice(0, 2), "in terms of"), "");
});

test("LLM handles a whole phrase and phrase relations without splitting or silently rewriting it", async () => {
  const previous = globalThis.fetch;
  const env = { ...process.env };
  process.env.API_KEY = "test-key"; delete process.env["API-KEY"];
  process.env.BASE_URL = "https://example.test/v1"; process.env.MODEL_NAME = "test";
  let key = "look forward to";
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    assert.deepEqual(JSON.parse(request.messages[1].content).words, ["look forward to"]);
    assert.match(request.messages[0].content, /严禁拆成逐个单词翻译/);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ word: key, phonetic: "", part: "phr. v.", meaning: "期待", summary: "to 后接名词或动名词。", example: "I look forward to seeing you.", exampleZh: "我期待见到你。", relations: [{ word: "be eager for", type: "synonym", comparison: "均表示期待，后者更急切。", usage: "后接名词。" }] }) } }] });
  };
  try {
    const result = await generateDictionaryEntry("look forward to");
    assert.equal(result.word, "look forward to"); assert.deepEqual(result.synonyms, ["be eager for"]); assert.deepEqual(result.antonyms, []);
    key = "look"; await assert.rejects(generateDictionaryEntry("look forward to"));
  } finally { globalThis.fetch = previous; process.env = env; }
});

test("dedicated phrase group is idempotent, avoids user name collisions, and phrases enter review intact", async () => {
  const db = new PGlite();
  const sql: SqlExecutor = { query: async (text, values) => ({ rows: (await db.query<Record<string, unknown>>(text, values)).rows }) };
  try {
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
    await sql.query("INSERT INTO word_groups(id,user_id,name,color,is_default,created_at) VALUES('words','local-demo','短语收藏','#abc',1,'now')");
    await sql.query("BEGIN");
    const id = await ensurePhraseGroup(sql, "local-demo");
    assert.equal(await ensurePhraseGroup(sql, "local-demo"), id);
    await sql.query("COMMIT");
    assert.equal(id, phraseGroupId("local-demo"));
    assert.equal((await sql.query("SELECT name FROM word_groups WHERE id=$1", [id])).rows[0].name, "短语收藏（2）");
    assert.equal((await sql.query("SELECT id FROM word_groups WHERE is_default=1")).rows[0].id, "words");
    const term = "look forward to";
    await sql.query(`INSERT INTO dictionary_entries(word,phonetic,part,meaning,summary,example,example_zh,synonyms,antonyms,source,created_at,updated_at)
      VALUES($1,'','phr. v.','期待','用法','Example','例句','[]','[]','test','now','now')`, [term]);
    await sql.query("INSERT INTO user_words(user_id,word,note,first_saved_at,updated_at,next_review) VALUES('local-demo',$1,'保留笔记','now','now','2099-01-01')", [term]);
    await sql.query("INSERT INTO group_words(user_id,group_id,word,added_at) VALUES('local-demo',$1,$2,'now')", [id, term]);
    const options = parseReviewOptions({ priorityWords: [term], includeAudio: false });
    const rows = await selectReviewRows(sql, "local-demo", id, "2026-11-06", options.priorityWords);
    assert.deepEqual(rows.map((row) => row.word), [term]);
    assert.equal((await selectReviewRows(sql, "local-demo", "words", "2026-11-06", options.priorityWords)).length, 0);
    const tasks = planReviewQuestions([{ word: term, meaning: "期待" }], [], options);
    assert.equal(tasks.length, 3); assert.ok(tasks.every((task) => task.word === term && task.type !== "audio-word"));
  } finally { await db.close(); }
});
