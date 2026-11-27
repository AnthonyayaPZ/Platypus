import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SubtitleProgressCard from "../app/components/SubtitleProgressCard";
import { makeSubtitleProgress, subtitlePercent, needsSubtitleSnapshot } from "../lib/video-study-progress";
import { uploadSubtitleDocument } from "../lib/subtitle-upload";
import { VideoStudyStore } from "../lib/server/video-study-store";
import { processVideoStudyJob } from "../lib/server/video-study-processing";
import { DictionaryGenerationError } from "../lib/llm";
import type { SqlExecutor } from "../lib/server/sql";

test("processed percentage counts successes and failures, and unknown stages have no fabricated percentage", () => {
  const sentences = [{ id: "one", time: "00:00", english: "One.", chinese: "一" }, { id: "two", time: "00:01", english: "Two.", chinese: "", translationStatus: "failed" as const }, { id: "three", time: "00:02", english: "Three.", chinese: "" }];
  const progress = makeSubtitleProgress("translating", sentences, "now");
  assert.deepEqual(progress, { stage: "translating", total: 3, processed: 2, succeeded: 1, failed: 1, updatedAt: "now" });
  assert.equal(subtitlePercent(progress), 66);
  assert.equal(subtitlePercent({ ...progress, stage: "parsing" }), null);
  assert.equal(subtitlePercent(makeSubtitleProgress("translating", [])), null);
});

test("compact web card distinguishes upload, processing, failure and successful completion", () => {
  const p = { stage: "translating" as const, total: 2000, processed: 640, succeeded: 620, failed: 20, updatedAt: "now" };
  const html = renderToStaticMarkup(createElement(SubtitleProgressCard, { progress: p }));
  assert.match(html, /32%/); assert.match(html, /成功 620/); assert.match(html, /失败 20/); assert.match(html, /value="32"/);
  const parsing = renderToStaticMarkup(createElement(SubtitleProgressCard, { progress: { ...p, stage: "parsing" } }));
  assert.doesNotMatch(parsing, /value=/); assert.match(parsing, /正在解析/);
  const upload = renderToStaticMarkup(createElement(SubtitleProgressCard, { upload: 100 }));
  assert.match(upload, /等待服务器校验/); assert.doesNotMatch(upload, /翻译完成/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(SubtitleProgressCard, { progress: { ...p, stage: "failed" } })), /<progress/);
});

test("two-second metadata ticks do not download unchanged full articles and final completion refreshes immediately", () => {
  const metadata = { id: "doc", status: "translating" as const, progress: makeSubtitleProgress("translating", []), updatedAt: "new", error: "" };
  assert.equal(needsSubtitleSnapshot("old", metadata, 2000), false);
  assert.equal(needsSubtitleSnapshot("old", metadata, 10000), true);
  assert.equal(needsSubtitleSnapshot("new", metadata, 10000), false);
  assert.equal(needsSubtitleSnapshot("old", { ...metadata, status: "ready" }, 2000), true);
  assert.equal(needsSubtitleSnapshot("old", null, 2000), true);
  assert.equal(needsSubtitleSnapshot("", metadata, 0), true);
});

test("worker progress persists by batch, metadata remains small, retries preserve existing successful translations", async () => {
  const db = new PGlite();
  const queries: string[] = [], stages: string[] = [];
  const sql: SqlExecutor = { query: async (text, values) => {
    queries.push(text);
    if (text.includes("progress=$13")) stages.push(JSON.parse(String(values?.[12])).stage);
    return { rows: (await db.query<Record<string, unknown>>(text, values)).rows };
  } };
  try {
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
    const store = new VideoStudyStore(sql);
    const subtitle = Array.from({ length: 21 }, (_, i) => `${i + 1}\n00:00:00,000 --> 00:03:00,000\nOriginal sentence ${i}.`).join("\n\n");
    const doc = await store.enqueueDocument({ source: "upload", title: "Progress", subtitle });
    assert.equal((await store.documentProgress(doc.id)).progress.stage, "queued");
    let calls = 0;
    await processVideoStudyJob(store, (await store.claim("worker"))!, { translate: async (chunk) => {
      const progress = (await store.documentProgress(doc.id)).progress;
      assert.equal(progress.stage, "translating");
      assert.equal(progress.processed, calls * 10);
      calls++; if (calls === 2) throw new DictionaryGenerationError("upstream");
      return new Map(chunk.map((s) => [s.id, "对应译文"]));
    } });
    assert.deepEqual(stages.slice(0, 3), ["parsing", "segmenting", "translating"]);
    queries.length = 0;
    const summary = await new VideoStudyStore(sql).documentProgress(doc.id);
    assert.equal(summary.progress.stage, "partial"); assert.equal(summary.progress.total, 21);
    assert.equal(summary.progress.succeeded, 11); assert.equal(summary.progress.failed, 10); assert.equal(summary.progress.processed, 21);
    assert.equal(subtitlePercent(summary.progress), 100);
    assert.equal(queries.length, 1); assert.doesNotMatch(queries[0], /sentences/);
    assert.ok(JSON.stringify(summary).length < 1000); assert.doesNotMatch(JSON.stringify(summary), /Original sentence/);
    await store.retryDocument(doc.id);
    assert.equal((await store.documentProgress(doc.id)).progress.stage, "queued");
    const ids: string[] = [];
    await processVideoStudyJob(store, (await store.claim("retry-worker"))!, { translate: async (chunk) => {
      ids.push(...chunk.map((s) => s.id));
      assert.equal((await store.documentProgress(doc.id)).progress.succeeded, 11);
      return new Map(chunk.map((s) => [s.id, "补充译文"]));
    } });
    assert.equal(ids.length, 10);
    const completed = (await store.documentProgress(doc.id)).progress;
    assert.equal(completed.stage, "ready"); assert.equal(completed.succeeded, 21); assert.equal(completed.failed, 0);
    // A previous worker version may update the document without updating counters.
    await sql.query("UPDATE video_study_documents SET progress=NULL WHERE id=$1", [doc.id]);
    assert.equal((await store.documentProgress(doc.id)).progress.succeeded, 21);
    await sql.query("UPDATE video_study_documents SET progress=$2::jsonb WHERE id=$1", [doc.id, JSON.stringify({ ...completed, succeeded: 0, updatedAt: "stale" })]);
    assert.equal((await store.documentProgress(doc.id)).progress.succeeded, 21);
    await assert.rejects(store.documentProgress("missing"), /不存在/);
  } finally { await db.close(); }
});

test("progress migration is additive and existing in-progress documents remain recoverable", async () => {
  const db = new PGlite();
  try {
    const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    for (const entry of journal.entries.filter((entry: { idx: number }) => entry.idx < 4)) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
    const sentences = [{ id: "a", time: "00:01", english: "Original text.", chinese: "原有译文" }, { id: "b", time: "00:02", english: "Pending text.", chinese: "", translationStatus: "failed" }];
    await db.query("INSERT INTO video_study_documents(id,title,status,sentences,created_at,updated_at) VALUES('old','Existing','translating',$1::jsonb,'before','before')", [JSON.stringify(sentences)]);
    await db.exec(await readFile(new URL("../drizzle/0004_subtitle_progress.sql", import.meta.url), "utf8"));
    const sql: SqlExecutor = { query: async (text, values) => ({ rows: (await db.query<Record<string, unknown>>(text, values)).rows }) };
    const store = new VideoStudyStore(sql);
    const metadata = await store.documentProgress("old");
    assert.equal(metadata.status, "translating"); assert.equal(metadata.progress.processed, 2);
    assert.equal(metadata.progress.succeeded, 1); assert.equal(metadata.progress.failed, 1);
    assert.deepEqual((await store.document("old"))?.sentences, sentences);
    assert.equal((await store.document("old"))?.updatedAt, "before");
  } finally { await db.close(); }
});

test("upload byte progress reaching 100 does not imply server acknowledgement and errors do not automatically resubmit", async () => {
  const previous = globalThis.XMLHttpRequest;
  class FakeXHR {
    static last: FakeXHR;
    upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null, onload: null as (() => void) | null };
    status = 202; responseText = '{"document":{"id":"doc"}}'; timeout = 0;
    onload: (() => void) | null = null; onerror: (() => void) | null = null; ontimeout: (() => void) | null = null; onabort: (() => void) | null = null;
    sends = 0;
    constructor() { FakeXHR.last = this; }
    open() {} setRequestHeader() {}
    send() { this.sends++; }
  }
  globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
  try {
    const values: (number | null)[] = []; let acknowledged = false;
    const promise = uploadSubtitleDocument({ source: "upload" }, (p) => values.push(p)).then((r) => { acknowledged = true; return r; });
    const xhr = FakeXHR.last;
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 37, total: 100 }); xhr.upload.onload!();
    assert.deepEqual(values, [0, 37, 100]); assert.equal(acknowledged, false);
    xhr.onload!(); assert.equal((await promise).document.id, "doc");
    const failed = uploadSubtitleDocument({}, () => {});
    const rejected = assert.rejects(failed, /上传未确认/);
    FakeXHR.last.onerror!(); await rejected; assert.equal(FakeXHR.last.sends, 1);
  } finally { globalThis.XMLHttpRequest = previous; }
});
