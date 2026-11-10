import test from "node:test";
import assert from "node:assert/strict";
import { cuesToSentences, parseSubtitleFile, formatTimestamp } from "../lib/subtitles";
import { segmentSubtitlesForReading, subtitleWordCount } from "../lib/subtitle-segmentation";
import { MAX_SUBTITLE_BYTES, MAX_UPLOAD_SECONDS, MAX_UPLOAD_JSON_BYTES } from "../lib/video-study-limits";
import { readJsonBody } from "../lib/server/video-study-http";

export function longSubtitle(count = 3600) {
  const stamp = (ms: number) => {
    const full = formatTimestamp(ms);
    return `${full.length === 5 ? "00:" : ""}${full},000`;
  };
  return Array.from({ length: count }, (_, i) => `${i + 1}\n${stamp(i * 3000)} --> ${stamp((i + 1) * 3000)}\nToday we practice clear English sentences while learning about language and sharing useful ideas together ${i}.`).join("\n\n");
}

test("three-hour SRT exceeds old file/text/sentence limits without losing its final cue", () => {
  const file = longSubtitle();
  assert.ok(file.length > 500_000);
  const cues = parseSubtitleFile(file);
  assert.equal(cues.length, 3600); assert.equal(cues.at(-1)?.endMs, 10_800_000);
  const sentences = cuesToSentences(cues, MAX_UPLOAD_SECONDS);
  assert.ok(sentences.length > 600);
  assert.ok(sentences.reduce((sum, s) => sum + s.english.length, 0) > 120_000);
  const reading = segmentSubtitlesForReading(sentences);
  assert.ok(reading.length > 2000);
  assert.ok(reading.every((s) => subtitleWordCount(s.english) <= 24));
  assert.ok(reading.at(-1)?.english.endsWith("3599."));
  assert.equal(formatTimestamp(cues.at(-1)!.endMs), "03:00:00");
});

test("exactly three hours is accepted, one millisecond over and the old automatic-download cap are rejected", () => {
  const cue = { startMs: 10_799_000, endMs: 10_800_000, text: "The final sentence." };
  assert.equal(cuesToSentences([cue], MAX_UPLOAD_SECONDS).length, 1);
  assert.throws(() => cuesToSentences([{ ...cue, endMs: cue.endMs + 1 }], MAX_UPLOAD_SECONDS), /180/);
  assert.throws(() => cuesToSentences([cue]), /60/);
  const vtt = "WEBVTT\n\n02:59:58.000 --> 03:00:00.000\nThe final sentence.";
  assert.equal(cuesToSentences(parseSubtitleFile(vtt), MAX_UPLOAD_SECONDS)[0].time, "02:59:58");
});

test("upload file limits count UTF-8 bytes and the larger JSON body is confined to the upload endpoint", async () => {
  assert.throws(() => parseSubtitleFile("x".repeat(MAX_SUBTITLE_BYTES + 1)), /4 MiB/);
  assert.throws(() => parseSubtitleFile("字".repeat(Math.ceil(MAX_SUBTITLE_BYTES / 3))), /4 MiB/);
  const body = JSON.stringify({ source: "upload", subtitle: longSubtitle() + "\nNOTE\n" + "x".repeat(300_000) });
  assert.ok(new TextEncoder().encode(body).length > 750_000);
  const request = () => new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body });
  assert.equal((await readJsonBody(request(), MAX_UPLOAD_JSON_BYTES)).source, "upload");
  await assert.rejects(readJsonBody(request()), /大小/);
});
