import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { addDraftWord, normalizeStudyWord, renameDraftWord, restoreDraft, tokenizeSubtitle } from "../lib/video-study.ts";

const source = { documentId: "demo-one", title: "Demo", sentenceId: "one", time: "00:04", english: "A resilient learner keeps running." };

test("subtitle tokenization preserves every character and keeps contractions and hyphenated words intact", () => {
  const sentence = "You don’t need a long-term plan; start with one word!";
  const tokens = tokenizeSubtitle(sentence);
  assert.equal(tokens.map((token) => token.text).join(""), sentence);
  assert.deepEqual(tokens.filter((token) => token.word).map((token) => token.word), ["you", "don't", "need", "a", "long-term", "plan", "start", "with", "one", "word"]);
  assert.equal(normalizeStudyWord("两词"), null);
  assert.equal(normalizeStudyWord("two words"), null);
  assert.equal(normalizeStudyWord("a".repeat(49)), null);
});

test("draft editing merges duplicates without losing source sentences", () => {
  let draft = addDraftWord([], "Running", source);
  draft = addDraftWord(draft, "RUNNING", source);
  draft = addDraftWord(draft, "run", { ...source, documentId: "demo-two", sentenceId: "two" });
  assert.equal(draft.length, 2);
  draft = renameDraftWord(draft, "running", "RUN");
  assert.equal(draft.length, 1);
  assert.equal(draft[0].word, "run");
  assert.equal(draft[0].sources.length, 2);
  assert.deepEqual(renameDraftWord(draft, "run", "invalid input"), draft);
  assert.deepEqual(restoreDraft(JSON.stringify(draft)), draft);
});

test("corrupt or stale local drafts do not break the reading view", () => {
  assert.deepEqual(restoreDraft("bad json"), []);
  assert.deepEqual(restoreDraft('{"word":"test"}'), []);
  const restored = restoreDraft(JSON.stringify([null, { word: "RESILIENT", sources: [source, { bad: true }] }, { word: "resilient" }, { word: "invalid input" }]));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].word, "resilient");
  assert.deepEqual(restored[0].sources, [source]);
});

test("shared demo transcripts have stable sentence identifiers and complete bilingual text", async () => {
  const { documents } = JSON.parse(await readFile(new URL("../shared/video-study-demo.json", import.meta.url), "utf8"));
  const ids = new Set();
  for (const document of documents) {
    assert.ok(document.title && document.id);
    for (const sentence of document.sentences) {
      assert.ok(!ids.has(sentence.id));
      ids.add(sentence.id);
      assert.ok(sentence.english && sentence.chinese && sentence.time);
      assert.equal(tokenizeSubtitle(sentence.english).map((token) => token.text).join(""), sentence.english);
    }
  }
});
