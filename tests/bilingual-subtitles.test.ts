import test from "node:test";
import assert from "node:assert/strict";
import { parseSubtitleFile, cuesToSentences } from "../lib/subtitles";
import { needsReadingSegmentation, readingRefinementRequests, segmentSubtitlesForReading } from "../lib/subtitle-segmentation";

test("SRT language lines in either order retain tags, names, English wrapping and timestamps correctly", () => {
  const cues = parseSubtitleFile("1\r\n00:00:01,000 --> 00:00:03,000\r\n<i>Learn with</i>\r\nAndrew &amp; friends.\r\n和 Andrew 及朋友一起学习。\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\n保持好奇心。\r\nStay curious.");
  const sentences = cuesToSentences(cues);
  assert.equal(sentences.length, 2);
  assert.equal(sentences[0].english, "Learn with Andrew & friends.");
  assert.equal(sentences[0].chinese, "和 Andrew 及朋友一起学习。");
  assert.equal(sentences[0].startMs, 1000); assert.equal(sentences[0].endMs, 3000);
  assert.equal(sentences[1].english, "Stay curious.");
  assert.equal(sentences[1].chinese, "保持好奇心。");
});

test("VTT bilingual HTML breaks and explicit inline bilingual separators are recognized", () => {
  const sentences = cuesToSentences(parseSubtitleFile("WEBVTT\n\n00:00.000 --> 00:02.000\nLearn every day.<br>每天学习。\n\n00:03.000 --> 00:05.000\nStay curious. 保持好奇心。\n\n00:06.000 --> 00:08.000\nKeep learning / 继续学习。"));
  assert.deepEqual(sentences.map((s) => [s.english, s.chinese]), [["Learn every day.", "每天学习。"], ["Stay curious.", "保持好奇心。"], ["Keep learning", "继续学习。"]]);
});

test("separate Chinese and English cues pair only at identical time intervals, in either order", () => {
  const subtitle = ["00:00:00,000 --> 00:00:02,000\nHello there.", "00:00:00,000 --> 00:00:02,000\n你好。", "00:00:03,000 --> 00:00:05,000\n保持好奇心。", "00:00:03,000 --> 00:00:05,000\nStay curious.", "00:00:06,000 --> 00:00:07,000\n不匹配的中文。", "00:00:08,000 --> 00:00:09,000\nEnglish only."].join("\n\n");
  const sentences = cuesToSentences(parseSubtitleFile(subtitle));
  assert.deepEqual(sentences.map((s) => [s.english, s.chinese]), [["Hello there.", "你好。"], ["Stay curious.", "保持好奇心。"], ["English only.", ""]]);
  assert.equal(sentences[2].translationStatus, "pending");
});

test("imported long bilingual cues retain alignment without refinement, resegmentation, or lost Chinese", () => {
  const english = "We want to preserve all the original English words and their corresponding Chinese translation without pretending that arbitrary Chinese character cuts can align with English words correctly.";
  const sentences = cuesToSentences(parseSubtitleFile(`1\n00:00:00,000 --> 00:00:10,000\n${english}\n保留原始中英文对应关系。`));
  assert.equal(needsReadingSegmentation(sentences), false);
  assert.deepEqual(readingRefinementRequests(sentences), []);
  assert.deepEqual(segmentSubtitlesForReading(sentences), sentences);
  assert.deepEqual(segmentSubtitlesForReading(JSON.parse(JSON.stringify(sentences))), sentences);
});

test("Chinese-only uploads are not treated as English requiring translation", () => {
  assert.throws(() => cuesToSentences(parseSubtitleFile("1\n00:00:00,000 --> 00:00:02,000\n只有中文字幕。")), /字幕为空/);
});

test("resegmentation defaults on and splits only reliably aligned bilingual sentences", () => {
  const cues = parseSubtitleFile("1\n00:00:00,000 --> 00:00:05,000\nKeep learning. Stay curious.\n继续学习。保持好奇心。");
  assert.deepEqual(cuesToSentences(cues).map((s) => [s.english, s.chinese]), [["Keep learning.", "继续学习。"], ["Stay curious.", "保持好奇心。"]]);
  const preserved = cuesToSentences(cues, 3600, false);
  assert.equal(preserved.length, 1); assert.equal(preserved[0].preserveCueBreaks, true);
  assert.equal(preserved[0].english, "Keep learning. Stay curious.");
  assert.equal(preserved[0].chinese, "继续学习。保持好奇心。");
  assert.deepEqual(segmentSubtitlesForReading(preserved), preserved);
  assert.equal(cuesToSentences([{ ...cues[0], chinese: "继续学习，保持好奇心。" }]).length, 1);
});

test("disabling resegmentation also preserves English-only cue breaks across retries and reading upgrades", () => {
  const cues = parseSubtitleFile("1\n00:00:00,000 --> 00:00:02,000\nKeep learning. Stay curious.\n\n2\n00:00:02,000 --> 00:00:04,000\nAnd stay curious.");
  const preserved = cuesToSentences(cues, 3600, false);
  assert.equal(preserved.length, 2);
  assert.equal(preserved[0].english, "Keep learning. Stay curious.");
  assert.equal(preserved[1].english, "And stay curious.");
  assert.equal(preserved[0].translationStatus, "pending");
  assert.deepEqual(segmentSubtitlesForReading(preserved), preserved);
  assert.deepEqual(readingRefinementRequests(preserved), []);
  assert.equal(needsReadingSegmentation(preserved), false);
});
