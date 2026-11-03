import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeSearchImport, activeImportPrefix, appendImportWords, completeImportPrefix, emptySearchImport, parseImportWords, restoreSearchImport } from "../lib/search-import";
import type { VideoStudyJob } from "../lib/video-study";

test("pasted word lists normalize separators, contractions, case and duplicates without silently dropping invalid tokens", () => {
  assert.deepEqual(parseImportWords("Bright，bright; can’t\nwell-known、psychology"), { words: ["bright", "can't", "well-known", "psychology"], invalid: [] });
  const original = ["bright"];
  assert.deepEqual(appendImportWords(original, "novel bright").words, ["bright", "novel"]);
  assert.deepEqual(appendImportWords(original, "test 123").words, original);
  assert.match(appendImportWords(original, "test 123").error, /无效/);
  const words = Array.from({ length: 30 }, (_, index) => `word${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`);
  assert.deepEqual(appendImportWords(words, "extra").words, words);
  assert.match(appendImportWords(words, "extra").error, /30/);
});
test("autocomplete replaces only the unfinished word and preserves confirmed/pasted words", () => {
  assert.equal(activeImportPrefix("novel, res"), "res");
  assert.equal(completeImportPrefix("novel, res", "resilient"), "novel, resilient");
  assert.equal(activeImportPrefix("novel, "), "");
});
test("search import success acknowledgements and pending identities survive restart independently from video drafts", () => {
  const session = { ...emptySearchImport, words: ["ready", "retry"], jobId: "job-one", pending: null };
  const job = { id: "job-one", items: [{ word: "ready", status: "success" }, { word: "retry", status: "failed" }] } as VideoStudyJob;
  const next = acknowledgeSearchImport(session, job);
  assert.deepEqual(next.words, ["retry"]);
  const readded = { ...next, words: [...next.words, "ready"] };
  assert.deepEqual(acknowledgeSearchImport(readded, job), readded);
  assert.deepEqual(acknowledgeSearchImport(session, { ...job, id: "different" }), session);
  const pending = { ...session, pending: { requestId: "stable-request-id-123", groupId: "default", words: [{ word: "ready", sources: [] as [] }] } };
  assert.deepEqual(restoreSearchImport(JSON.stringify(pending)), pending);
  assert.throws(() => restoreSearchImport(JSON.stringify({ ...pending, pending: { ...pending.pending, words: [{ word: "not a word" }] } })));
});
