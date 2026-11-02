import assert from "node:assert/strict";
import test from "node:test";
import { cuesToSentences } from "../lib/subtitles";
import { MAX_READING_WORDS, estimatedReadingRows, needsReadingSegmentation, originalSentenceFor, readingRefinementRequests, segmentSubtitlesForReading, splitReadingText, splitReadingTextAtCuts, subtitleWordCount } from "../lib/subtitle-segmentation";
import type { SubtitleSentence } from "../lib/video-study";

const longSentence = "If you want to remember new words, connect them with situations from your own life, and review them regularly instead of trying to memorize everything in a single sitting.";
const source = (english = longSentence): SubtitleSentence => ({ id: "sentence-1", time: "00:07", startMs: 7000, endMs: 18000, english, chinese: "原有整句译文。", translationStatus: "ready" });
const withoutWhitespace = (text: string) => text.replace(/\s+/g, "");

test("short sentences retain their text, translation, identifiers and timestamps", () => {
  const original = source("Keep learning every day.");
  assert.deepEqual(segmentSubtitlesForReading([original]), [original]);
  assert.equal(needsReadingSegmentation([original]), false);
});

test("long sentences split at clause boundaries without tiny tails or rewritten English", () => {
  const pieces = splitReadingText(longSentence);
  assert.deepEqual(pieces.map((piece) => piece.english), [
    "If you want to remember new words, connect them with situations from your own life,",
    "and review them regularly instead of trying to memorize everything in a single sitting.",
  ]);
  assert.ok(pieces.every((piece) => subtitleWordCount(piece.english) >= 10 && subtitleWordCount(piece.english) <= MAX_READING_WORDS));
  assert.equal(withoutWhitespace(pieces.map((piece) => piece.english).join("")), withoutWhitespace(longSentence));
});

test("unpunctuated text, contractions, numbers and punctuation stay lossless and bounded", () => {
  for (const english of [
    Array(96).fill("learning").join(" "),
    Array(60).fill("alpha").join(","),
    "Don’t stop being curious about long-term learning, because small steps taken at 10:30 every morning can make a lasting difference when you continue to practice with your friends over a period of 3.5 months.",
  ]) {
    const pieces = splitReadingText(english);
    assert.ok(pieces.length > 1);
    assert.ok(pieces.every((piece) => subtitleWordCount(piece.english) <= MAX_READING_WORDS));
    assert.equal(withoutWhitespace(pieces.map((piece) => piece.english).join("")), withoutWhitespace(english));
    assert.ok(!pieces.some((piece) => piece.english.endsWith("3.")));
  }
});

test("common expressions and proper names are protected near potential cut points", () => {
  for (const phrase of ["in order to", "as well as", "instead of", "New York City", "Dr. Smith"]) {
    for (let prefix = 5; prefix <= 25; prefix++) {
      const english = `${Array(prefix).fill("learn").join(" ")} ${phrase} ${Array(28).fill("practice").join(" ")}.`;
      const pieces = splitReadingText(english);
      assert.ok(pieces.some((piece) => piece.english.includes(phrase)), `Split protected phrase: ${phrase}, prefix=${prefix}`);
    }
  }
});

test("a real subtitle pause can improve a cut without turning every cue into a card", () => {
  const english = Array(36).fill("alpha").join(" ");
  const pieces = splitReadingText(english, [18 * 6]);
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0].endWord, 18);
});

test("original context is stored once, old identifiers still work, and retries are idempotent", () => {
  const original = source();
  const segments = segmentSubtitlesForReading([original]);
  assert.equal(segments[0].id, original.id);
  assert.equal(segments.filter((segment) => segment.sourceSentence).length, 1);
  assert.ok(segments.every((segment) => segment.chinese === "" && segment.translationStatus === "pending"));
  assert.equal(original.chinese, "原有整句译文。");
  for (const segment of segments) {
    assert.equal(originalSentenceFor(segment, segments).english, longSentence);
    assert.equal(originalSentenceFor(segment, segments).chinese, original.chinese);
    assert.equal(originalSentenceFor(segment, segments).id, original.id);
    assert.equal(segment.time, original.time);
  }
  assert.equal(needsReadingSegmentation(segments), false);
  assert.deepEqual(segmentSubtitlesForReading(segments), segments);
  const conflict = { ...source("A short sentence."), id: segments[1].id };
  const unique = segmentSubtitlesForReading([original, conflict]);
  assert.equal(new Set(unique.map((segment) => segment.id)).size, unique.length);
  assert.ok(unique.some((segment) => segment.id === conflict.id && segment.english === conflict.english));
  assert.ok(segmentSubtitlesForReading([{ ...original, id: "x".repeat(100) }]).every((segment) => segment.id.length <= 100));
});

test("canonical caption sentences preserve context beyond the previous 320-character cutoff", () => {
  const beginning = Array(50).fill("learning").join(" ");
  const ending = "can remain connected to the rest of this sentence.";
  const sentences = cuesToSentences([{ startMs: 0, endMs: 2000, text: beginning }, { startMs: 2600, endMs: 5000, text: ending }]);
  assert.equal(sentences.length, 1);
  assert.equal(sentences[0].english, `${beginning} ${ending}`);
  assert.deepEqual(sentences[0].readingBreaks, [beginning.length + 1]);
  assert.ok(segmentSubtitlesForReading(sentences).every((segment) => subtitleWordCount(segment.english) <= MAX_READING_WORDS));
});

test("word count alone does not overlook very long words or exceed the document guard", () => {
  const english = Array(18).fill("interdisciplinary").join(" ");
  assert.ok(splitReadingText(english).length > 1);
  assert.ok(splitReadingText(english).every((piece) => estimatedReadingRows(piece.english) <= 6));
  assert.ok(splitReadingText(Array(12).fill("interdisciplinary").join(" ")).length > 1);
  assert.throws(() => segmentSubtitlesForReading(Array.from({ length: 2001 }, (_, index) => ({ ...source("Short."), id: `s-${index}` }))), /2000/);
});

test("only uncertain boundaries ask for semantic help and model cuts cannot rewrite or break constraints", () => {
  assert.equal(readingRefinementRequests([source()]).length, 0);
  const english = Array(40).fill("practice").join(" ");
  const requests = readingRefinementRequests([source(english)]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].words.length, 40);
  assert.equal(splitReadingTextAtCuts(english, [20]).length, 2);
  for (const cuts of [[1], [39], [25], [20, 20], [-1], [100], [10.5]]) assert.throws(() => splitReadingTextAtCuts(english, cuts));
  const valid = segmentSubtitlesForReading([source(english)], new Map([["sentence-1", [14, 27]]]));
  assert.equal(subtitleWordCount(valid[0].english), 14);
  assert.equal(withoutWhitespace(valid.map((segment) => segment.english).join("")), withoutWhitespace(english));
  const fallback = segmentSubtitlesForReading([source(english)], new Map([["sentence-1", [1]]]));
  assert.deepEqual(fallback, segmentSubtitlesForReading([source(english)]));
});
