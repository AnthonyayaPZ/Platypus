import type { SubtitleSentence } from "./video-study";

export type CaptionCue = { startMs: number; endMs: number; text: string };

export function formatTimestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return (parts[0] ? parts : parts.slice(1)).map((part) => String(part).padStart(2, "0")).join(":");
}

function timestamp(text: string) {
  const parts = text.replace(",", ".").split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return NaN;
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0) * 1000);
}

function cleanText(text: string) {
  return text.replace(/<[^>]{0,300}>/g, "").replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " " })[entity] ?? entity).replace(/\s+/g, " ").trim();
}

export function parseSubtitleFile(text: string): CaptionCue[] {
  if (text.length > 500_000) throw new Error("字幕文件超过 500KB 限制");
  const cues: CaptionCue[] = [];
  for (const block of text.replace(/^\uFEFF/, "").replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0]?.trim() ?? "")) continue;
    const index = lines.findIndex((line) => line.includes("-->"));
    if (index < 0) continue;
    const match = lines[index].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (!match) continue;
    const startMs = timestamp(match[1]);
    const endMs = timestamp(match[2]);
    const content = cleanText(lines.slice(index + 1).join(" "));
    if (Number.isFinite(startMs) && endMs > startMs && content) cues.push({ startMs, endMs, text: content });
  }
  if (!cues.length) throw new Error("没有识别到有效的 SRT / VTT 英文字幕");
  return cues;
}

export function cuesToSentences(cues: CaptionCue[], maximumSeconds = 3600): SubtitleSentence[] {
  if (!cues.length || cues.length > 20_000) throw new Error("字幕为空或段落数量过多");
  const sorted = cues.filter((cue) => Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs) && cue.endMs >= cue.startMs && typeof cue.text === "string").sort((a, b) => a.startMs - b.startMs);
  if (!sorted.length || sorted.some((cue) => cue.startMs < 0 || cue.endMs > maximumSeconds * 1000)) throw new Error(`请选择 ${Math.floor(maximumSeconds / 60)} 分钟以内的视频或字幕`);
  const sentences: SubtitleSentence[] = [];
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  let buffer = "";
  let startMs = 0;
  let endMs = 0;
  let readingBreaks: number[] = [];
  let previous: CaptionCue | null = null;
  const emit = (english: string, breaks: number[] = []) => {
    if (!english.trim()) return;
    sentences.push({ id: `sentence-${sentences.length + 1}`, time: formatTimestamp(startMs), startMs, endMs, english: english.trim(), chinese: "", translationStatus: "pending", ...(breaks.length ? { readingBreaks: breaks } : {}) });
  };
  for (const cue of sorted) {
    let text = cleanText(cue.text);
    if (!text) continue;
    if (previous && cue.startMs <= previous.endMs + 250) {
      const before = cleanText(previous.text).split(" ");
      const after = text.split(" ");
      let overlap = 0;
      for (let size = 1; size <= Math.min(before.length, after.length, 80); size++) {
        if (before.slice(-size).join(" ") === after.slice(0, size).join(" ")) overlap = size;
      }
      text = after.slice(overlap).join(" ");
    }
    previous = cue;
    if (!text) continue;
    if (buffer && cue.startMs - endMs > 1800) { emit(buffer, readingBreaks); buffer = ""; readingBreaks = []; }
    if (buffer && cue.startMs - endMs >= 450) readingBreaks.push(buffer.length + 1);
    if (!buffer) startMs = cue.startMs;
    endMs = cue.endMs;
    buffer = buffer ? `${buffer} ${text}` : text;
    const parts = Array.from(segmenter.segment(buffer), (part) => ({ text: part.segment.trim(), offset: part.index + part.segment.length - part.segment.trimStart().length })).filter((part) => part.text);
    const pauses = readingBreaks;
    buffer = "";
    readingBreaks = [];
    for (const [index, part] of parts.entries()) {
      const breaks = pauses.filter((offset) => offset > part.offset && offset < part.offset + part.text.length).map((offset) => offset - part.offset);
      // Keep a grammatical sentence intact for context. Extremely long,
      // unpunctuated captions are bounded without reverting to 320-char cuts.
      if (index < parts.length - 1 || /[.!?]["')\]]*$/.test(part.text) || part.text.length > 2400) emit(part.text, breaks);
      else { buffer = part.text; readingBreaks = breaks; }
    }
    if (sentences.length > 600) throw new Error("字幕超过 600 句限制，请使用较短的视频");
  }
  if (buffer) emit(buffer, readingBreaks);
  if (sentences.length > 600) throw new Error("字幕超过 600 句限制，请使用较短的视频");
  if (!sentences.length || sentences.reduce((sum, sentence) => sum + sentence.english.length, 0) > 120_000) throw new Error("字幕为空或文本过长");
  return sentences;
}
