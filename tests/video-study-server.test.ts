import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { saveWordWithClient } from "../db/learning";
import { DictionaryGenerationError, generateDictionaryEntries, translateSubtitleSentences } from "../lib/llm";
import { getOrGenerateDictionaryEntries } from "../lib/server/dictionary-service";
import type { WordEntry } from "../lib/dictionary";
import { cuesToSentences, parseSubtitleFile } from "../lib/subtitles";
import { youtubeVideoId } from "../lib/server/captions-client";
import { readJsonBody } from "../lib/server/video-study-http";
import { processVideoStudyJob } from "../lib/server/video-study-processing";
import { validateImportWords, VideoStudyStore } from "../lib/server/video-study-store";
import type { SqlExecutor } from "../lib/server/sql";
import { historyItem, mergeStudyHistory } from "../lib/video-study-history";
import { exampleDocuments } from "../lib/video-study-examples";

async function database() {
  const db = new PGlite();
  const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  const sql: SqlExecutor = { query: async (text, values) => ({ rows: (await db.query<Record<string, unknown>>(text, values)).rows }) };
  await sql.query("INSERT INTO word_groups(id,user_id,name,color,is_default,created_at) VALUES('test-group','local-demo','视频学习','#f28c52',1,$1)", [new Date().toISOString()]);
  const ensureWord = async (word: string) => {
    await sql.query(`INSERT INTO dictionary_entries(word,phonetic,part,meaning,summary,example,example_zh,synonyms,antonyms,source,created_at,updated_at)
      VALUES($1,'/test/','adj.','释义','解释','Example.','例句','[]','[]','test','now','now') ON CONFLICT DO NOTHING`, [word]);
  };
  const saveWord = async (word: string, groupId: string, sources: Parameters<typeof saveWordWithClient>[3]) => {
    await sql.query("BEGIN");
    try { await saveWordWithClient(sql, word, groupId, sources); await sql.query("COMMIT"); }
    catch (error) { await sql.query("ROLLBACK"); throw error; }
  };
  const ensureWords = async (words: string[]) => {
    for (const word of words) await ensureWord(word);
    return new Map(words.map((word) => [word, null]));
  };
  return { db, sql, store: new VideoStudyStore(sql), ensureWord, ensureWords, saveWord };
}

test("history includes every stored article and built-in articles without duplicating or resetting them", async () => {
  const { db, store } = await database();
  try {
    const saved = await store.enqueueDocument({ source: "upload", title: "Previously opened", subtitle: "1\n00:00:00,000 --> 00:00:02,000\nRead this article.\n" });
    const first = await store.history();
    const second = await store.history();
    assert.equal(first.length, 3);
    assert.equal(second.length, 3);
    assert.equal(first[0].id, saved.id);
    for (const example of exampleDocuments) {
      const document = (await store.document(example.id))!;
      assert.equal(document.status, "ready");
      assert.deepEqual(document.sentences, example.sentences);
    }
    const opened = historyItem(exampleDocuments[1], new Date(Date.now() + 60_000).toISOString());
    const local = mergeStudyHistory(first, [opened]);
    const refreshed = mergeStudyHistory(local, second);
    assert.equal(refreshed[0].id, opened.id);
    assert.equal(refreshed[0].lastOpenedAt, opened.lastOpenedAt);
    assert.equal(refreshed.length, 3);
  } finally { await db.close(); }
});

test("VTT and rolling captions become ordered, non-duplicated sentences", () => {
  const cues = parseSubtitleFile("WEBVTT\n\n00:00.000 --> 00:02.000\n<c>We learn</c>\n\n00:01.000 --> 00:03.000\nWe learn every day.\n\n00:04.000 --> 00:06.000\nDon’t stop being curious!\n");
  const sentences = cuesToSentences(cues);
  assert.deepEqual(sentences.map((item) => item.english), ["We learn every day.", "Don’t stop being curious!"]);
  assert.deepEqual(sentences.map((item) => item.time), ["00:00", "00:04"]);
  assert.throws(() => parseSubtitleFile("not a subtitle"));
  assert.throws(() => cuesToSentences([{ startMs: 0, endMs: 4_000_000, text: "Too long." }]));
});

test("only valid YouTube URLs and bounded import requests are accepted", async () => {
  assert.equal(youtubeVideoId("https://youtu.be/abcdefghijk?t=5"), "abcdefghijk");
  assert.equal(youtubeVideoId("https://www.youtube.com/watch?v=abcdefghijk&list=test"), "abcdefghijk");
  assert.equal(youtubeVideoId("A video title"), null);
  assert.throws(() => youtubeVideoId("http://127.0.0.1:8080/private"));
  assert.throws(() => youtubeVideoId("https://youtube.com.evil.example/watch?v=abcdefghijk"));
  assert.throws(() => validateImportWords([{ word: "two words" }]));
  assert.equal(validateImportWords([{ word: "RUN", sources: [] }, { word: "run", sources: [] }]).length, 1);
  await assert.rejects(() => readJsonBody(new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: "[1]" })));
  await assert.rejects(() => readJsonBody(new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: '"' + "a".repeat(750_001) + '"' })));
});

test("durable import jobs are idempotent, retry failed words only, and preserve learning metadata", async () => {
  const { db, sql, store, ensureWord, saveWord } = await database();
  try {
    await ensureWord("resilient");
    await sql.query("INSERT INTO user_words(user_id,word,note,first_saved_at,updated_at,ease,interval_days,repetitions,next_review) VALUES('local-demo','resilient','我的原笔记','old','old',310,12,4,'2099-01-01')");
    const words = validateImportWords([{ word: "resilient" }, { word: "fragile" }]);
    const first = await store.enqueueImport("request-123456789", "test-group", words);
    assert.equal((await store.enqueueImport("request-123456789", "test-group", words)).id, first.id);
    await assert.rejects(() => store.enqueueImport("request-123456789", "test-group", [{ word: "different", sources: [] }]));
    const calls: string[] = [];
    let fail = true;
    const batches: string[][] = [];
    const generate = async (words: string[]) => {
      batches.push(words);
      const results = new Map<string, string | null>();
      for (const word of words) { calls.push(word); if (word === "fragile" && fail) results.set(word, "LLM 请求失败"); else { await ensureWord(word); results.set(word, null); } }
      return results;
    };
    const job = (await store.claim("worker-one"))!;
    await processVideoStudyJob(store, job, { ensureWords: generate, saveWord });
    assert.equal((await store.job(first.id))?.status, "partial");
    assert.equal((await sql.query("SELECT note,ease,repetitions,next_review FROM user_words WHERE word='resilient'")).rows[0].note, "我的原笔记");
    assert.equal((await sql.query("SELECT repetitions FROM user_words WHERE word='resilient'")).rows[0].repetitions, 4);
    fail = false;
    await store.retryImport(first.id);
    await processVideoStudyJob(store, (await store.claim("worker-two"))!, { ensureWords: generate, saveWord });
    assert.equal((await store.job(first.id))?.status, "completed");
    assert.equal(calls.filter((word) => word === "resilient").length, 1);
    assert.deepEqual(batches, [["fragile", "resilient"], ["fragile"]]);
    assert.equal((await sql.query("SELECT * FROM group_words")).rows.length, 2);
    assert.equal((await sql.query("SELECT COUNT(*)::int AS count FROM video_study_jobs")).rows[0].count, 1);
  } finally { await db.close(); }
});

test("subtitle translation keeps English after partial failure and retries only untranslated sentences", async () => {
  const { db, store } = await database();
  try {
    const document = await store.enqueueDocument({ source: "youtube", videoId: "abcdefghijk" });
    let downloads = 0;
    let calls = 0;
    let fail = true;
    const fetchCaptions = async () => {
      downloads++;
      return { video: { id: "abcdefghijk", title: "Study", channel: "Test", duration: "02:00", url: "https://www.youtube.com/watch?v=abcdefghijk" }, cues: Array.from({ length: 12 }, (_, index) => ({ startMs: index * 3000, endMs: index * 3000 + 2000, text: `Sentence ${index + 1} is original.` })) };
    };
    const translate = async (sentences: { id: string; english: string }[]) => { calls++; if (fail && calls === 2) throw new DictionaryGenerationError("upstream"); return new Map(sentences.map((sentence) => [sentence.id, "对应中文翻译"])); };
    await processVideoStudyJob(store, (await store.claim("translator-one"))!, { fetchCaptions, translate });
    const partial = (await store.document(document.id))!;
    assert.equal(partial.status, "partial");
    assert.equal(partial.sentences.filter((sentence) => !!sentence.chinese).length, 10);
    assert.equal(partial.sentences[11].english, "Sentence 12 is original.");
    fail = false;
    await store.retryDocument(document.id);
    await processVideoStudyJob(store, (await store.claim("translator-two"))!, { fetchCaptions, translate });
    assert.equal((await store.document(document.id))?.status, "ready");
    assert.equal(downloads, 1);
    assert.equal(calls, 3);
  } finally { await db.close(); }
});

test("expired leases resume processing items without allowing a stale worker to overwrite progress", async () => {
  const { db, sql, store, ensureWords, saveWord } = await database();
  try {
    const job = await store.enqueueImport("resume-1234567890", "test-group", [{ word: "curious", sources: [] }]);
    const stale = (await store.claim("old-worker"))!;
    await store.updateItem(stale, "curious", "processing");
    await sql.query("UPDATE video_study_jobs SET lease_until='1970-01-01T00:00:00.000Z' WHERE id=$1", [job.id]);
    const resumed = (await store.claim("new-worker"))!;
    await processVideoStudyJob(store, resumed, { ensureWords, saveWord });
    await store.updateItem(stale, "curious", "failed", "stale failure");
    assert.equal((await store.job(job.id))?.items[0].status, "success");
    assert.equal((await store.job(job.id))?.status, "completed");
  } finally { await db.close(); }
});

test("collected source context is taken from the stored subtitle, not client-provided text", async () => {
  const { db, sql, store, ensureWords, saveWord } = await database();
  try {
    const document = await store.enqueueDocument({ source: "upload", title: "Original title", subtitle: "1\n00:00:01,000 --> 00:00:03,000\nStay curious.\n" });
    await processVideoStudyJob(store, (await store.claim("translator"))!, { translate: async (sentences) => new Map(sentences.map((sentence) => [sentence.id, "保持好奇心。 "])) });
    const words = validateImportWords([{ word: "curious", sources: [{ documentId: document.id, sentenceId: "sentence-1", title: "forged", english: "forged" }] }]);
    await store.enqueueImport("sources-request-123", "test-group", words);
    await processVideoStudyJob(store, (await store.claim("collector"))!, { ensureWords, saveWord });
    const sources = (await sql.query("SELECT title,time,english FROM video_word_sources")).rows;
    assert.deepEqual(sources, [{ title: "Original title", time: "00:01", english: "Stay curious." }]);
    await saveWord("curious", "test-group", words[0].sources);
    assert.equal((await sql.query("SELECT * FROM video_word_sources")).rows.length, 1);
  } finally { await db.close(); }
});

test("LLM translation responses align by sentence ID and reject omissions or duplicates", async () => {
  let translations: unknown[] = [{ id: "s2", chinese: "第二句" }, { id: "s1", chinese: "第一句" }];
  const server = createServer((request, response) => {
    assert.equal(request.url, "/v1/chat/completions");
    request.resume();
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translations }) } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const previous = { API_KEY: process.env.API_KEY, BASE_URL: process.env.BASE_URL, MODEL_NAME: process.env.MODEL_NAME };
  const hyphenKey = process.env["API-KEY"];
  delete process.env["API-KEY"];
  process.env.API_KEY = "local-test-key";
  process.env.BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  process.env.MODEL_NAME = "local-test-model";
  try {
    const input = [{ id: "s1", english: "First sentence." }, { id: "s2", english: "Second sentence." }];
    const result = await translateSubtitleSentences(input);
    assert.equal(result.get("s1"), "第一句");
    assert.equal(input[0].english, "First sentence.");
    translations = [{ id: "s1", chinese: "第一句" }, { id: "s1", chinese: "重复句" }];
    await assert.rejects(() => translateSubtitleSentences(input), DictionaryGenerationError);
    translations = [{ id: "s1", chinese: "第一句" }];
    await assert.rejects(() => translateSubtitleSentences(input), DictionaryGenerationError);
  } finally {
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    if (hyphenKey !== undefined) process.env["API-KEY"] = hyphenKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function batchEntry(word: string): WordEntry {
  return {
    word, phonetic: "/test/", part: "n.", meaning: "中文释义", summary: "核心含义", example: "A natural example.", exampleZh: "自然的例句。",
    synonyms: ["near", "close"], antonyms: ["far", "remote"],
    relations: [
      { word: "near", type: "synonym", comparison: "共同点和差异", usage: "适用场景" },
      { word: "close", type: "synonym", comparison: "共同点和差异", usage: "适用场景" },
      { word: "far", type: "antonym", comparison: "相反的含义", usage: "适用场景" },
      { word: "remote", type: "antonym", comparison: "相反的含义", usage: "适用场景" },
    ],
  };
}

test("30 dictionary entries use one HTTP request and malformed words stay isolated", async () => {
  const requests: { max_tokens: number; messages: { content: string }[] }[] = [];
  const words = Array.from({ length: 30 }, (_, index) => `word${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`);
  let entries: unknown[] = words.map(batchEntry).reverse();
  let finishReason = "stop";
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify({ entries }) } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const previous = Object.fromEntries(["API_KEY", "API-KEY", "BASE_URL", "MODEL_NAME"].map((key) => [key, process.env[key]]));
  delete process.env["API-KEY"];
  Object.assign(process.env, { API_KEY: "local-test", BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, MODEL_NAME: "local-test" });
  try {
    const result = await generateDictionaryEntries(words);
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].messages[1].content).words, words);
    assert.equal(requests[0].max_tokens, 30_000);
    assert.equal(result.size, 30);
    for (const [word, entry] of result) { assert.ok(!(entry instanceof Error)); assert.equal(entry.word, word); assert.equal(entry.relations.length, 4); }
    entries = [batchEntry("alpha")];
    const omitted = await generateDictionaryEntries(["alpha", "beta"]);
    assert.ok(!(omitted.get("alpha") instanceof Error));
    assert.ok(omitted.get("beta") instanceof DictionaryGenerationError);
    entries = [batchEntry("alpha"), batchEntry("alpha"), batchEntry("beta")];
    const duplicated = await generateDictionaryEntries(["alpha", "beta"]);
    assert.ok(duplicated.get("alpha") instanceof DictionaryGenerationError);
    assert.ok(!(duplicated.get("beta") instanceof Error));
    entries = [{ ...batchEntry("alpha"), relations: [] }, batchEntry("beta")];
    const invalid = await generateDictionaryEntries(["alpha", "beta"]);
    assert.ok(invalid.get("alpha") instanceof DictionaryGenerationError);
    assert.ok(!(invalid.get("beta") instanceof Error));
    entries = [batchEntry("unexpected")];
    await assert.rejects(() => generateDictionaryEntries(["alpha"]), DictionaryGenerationError);
    entries = [batchEntry("alpha")];
    finishReason = "length";
    await assert.rejects(() => generateDictionaryEntries(["alpha"]), DictionaryGenerationError);
    const count = requests.length;
    await assert.rejects(() => generateDictionaryEntries(["invalid input"]), DictionaryGenerationError);
    assert.equal(requests.length, count);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("bulk imports generate only missing entries once and retry only the failed subset", async () => {
  const { db, sql, store, ensureWord, saveWord } = await database();
  try {
    await ensureWord("cached");
    const requests: string[][] = [];
    const ensureWords = (words: string[]) => getOrGenerateDictionaryEntries(words, {
      initialize: async () => {},
      existingWords: async (input) => new Set((await sql.query("SELECT word FROM dictionary_entries WHERE word=ANY($1::text[])", [input])).rows.map((row) => String(row.word))),
      withLocks: async (_words, action) => action(),
      generate: async (input) => {
        requests.push(input);
        return new Map(input.map((word) => [word, word === "beta" && requests.length === 1 ? new DictionaryGenerationError("invalid-response") : batchEntry(word)]));
      },
      persist: async (entry) => { await ensureWord(entry.word); },
    });
    const first = await store.enqueueImport("bulk-request-123456789", "test-group", ["cached", "alpha", "beta"].map((word) => ({ word, sources: [] })));
    await processVideoStudyJob(store, (await store.claim("bulk-one"))!, { ensureWords, saveWord });
    assert.equal((await store.job(first.id))?.status, "partial");
    assert.deepEqual(requests, [["alpha", "beta"]]);
    assert.equal((await sql.query("SELECT * FROM group_words")).rows.length, 2);
    await store.retryImport(first.id);
    await processVideoStudyJob(store, (await store.claim("bulk-two"))!, { ensureWords, saveWord });
    assert.equal((await store.job(first.id))?.status, "completed");
    assert.deepEqual(requests, [["alpha", "beta"], ["beta"]]);
    assert.equal((await sql.query("SELECT * FROM group_words")).rows.length, 3);
    const cached = await ensureWords(["alpha", "beta", "cached"]);
    assert.ok([...cached.values()].every((value) => value === null));
    assert.equal(requests.length, 2);
  } finally { await db.close(); }
});

test("a failed bulk request preserves cache hits without per-word LLM fallback", async () => {
  let calls = 0;
  const results = await getOrGenerateDictionaryEntries(["cached", "alpha", "beta"], {
    initialize: async () => {}, existingWords: async () => new Set(["cached"]),
    withLocks: async (_words, action) => action(),
    generate: async () => { calls++; throw new DictionaryGenerationError("upstream"); },
    persist: async () => { throw new Error("Should not save missing results"); },
  });
  assert.equal(calls, 1);
  assert.equal(results.get("cached"), null);
  assert.ok(results.get("alpha"));
  assert.ok(results.get("beta"));
});
