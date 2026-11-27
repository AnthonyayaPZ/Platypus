import test from "node:test";
import assert from "node:assert/strict";
import { appendVideoNotes, MAX_WORD_NOTE_LENGTH } from "../lib/word-notes";

const context = { title: "A video", time: "00:42", english: "Stay curious.", chinese: "保持好奇心。" };
test("video notes preserve manual text and deduplicate pairs across videos and whitespace variants", () => {
  const manual = "我的笔记  \n原样保留。";
  const note = appendVideoNotes(manual, [context, { ...context, title: "Another video" }]);
  assert.equal(note, `${manual}\n\n【视频学习 · A video · 00:42】\nStay curious.\n保持好奇心。`);
  assert.equal(appendVideoNotes(note, [{ ...context, english: "Stay  curious. " }]), note);
  assert.equal(appendVideoNotes(note, []), note);
});
test("missing Chinese is explicit and a later import fills its placeholder without a second copy", () => {
  const note = appendVideoNotes("", [{ ...context, chinese: "" }]);
  assert.match(note, /本句暂无中文翻译/);
  assert.equal(appendVideoNotes(note, [context]), appendVideoNotes("", [context]));
});
test("multiple source pairs append independently and excessive notes are rejected, never truncated", () => {
  const note = appendVideoNotes("", [context, { ...context, english: "Keep learning.", chinese: "继续学习。" }]);
  assert.match(note, /Stay curious/); assert.match(note, /Keep learning/);
  assert.throws(() => appendVideoNotes("x".repeat(MAX_WORD_NOTE_LENGTH), [context]), /20000/);
  assert.equal(appendVideoNotes("x".repeat(MAX_WORD_NOTE_LENGTH), []), "x".repeat(MAX_WORD_NOTE_LENGTH));
});
