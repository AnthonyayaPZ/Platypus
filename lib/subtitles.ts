import type { SubtitleSentence } from "./video-study";
import { MAX_SUBTITLE_BYTES, MAX_SUBTITLE_CUES, MAX_SOURCE_SENTENCES, MAX_SUBTITLE_CHARACTERS } from "./video-study-limits";

export type CaptionCue = { startMs: number; endMs: number; text: string; chinese?: string };

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

// Keep language lines separate before whitespace normalization loses the pairing.
function captionLanguages(lines: string[]) {
  const english: string[] = [], chinese: string[] = [];
  for (const raw of lines.flatMap((line) => line.split(/<br\s*\/?\s*>/i))) {
    const line = cleanText(raw);
    if (!line) continue;
    if (!/\p{Script=Han}/u.test(line)) { english.push(line); continue; }
    // Also accept "English sentence. 中文译文" on one line. Require an
    // explicit separator; a Chinese line containing English names stays intact.
    const inline = line.match(/^(.+?[.!?]|.+?\s[|/]\s)\s*([\p{Script=Han}“「《].*)$/u);
    if (inline && /[A-Za-z]/.test(inline[1]) && !/\p{Script=Han}/u.test(inline[1])) {
      english.push(inline[1].replace(/\s[|/]\s*$/, "").trim());
      chinese.push(inline[2]);
    } else chinese.push(line);
  }
  return { text: english.join(" "), chinese: chinese.join(" ") };
}

export function parseSubtitleFile(text: string): CaptionCue[] {
  if (text.length > MAX_SUBTITLE_BYTES || new TextEncoder().encode(text).byteLength > MAX_SUBTITLE_BYTES) throw new Error("字幕文件不能超过 4 MiB");
  const cues: CaptionCue[] = [];
  const unmatched = new Map<string, CaptionCue>();
  let count = 0;
  for (const block of text.replace(/^\uFEFF/, "").replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0]?.trim() ?? "")) continue;
    const index = lines.findIndex((line) => line.includes("-->"));
    if (index < 0) continue;
    const match = lines[index].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (!match) continue;
    const startMs = timestamp(match[1]);
    const endMs = timestamp(match[2]);
    const content = captionLanguages(lines.slice(index + 1));
    if (Number.isFinite(startMs) && endMs > startMs && (content.text || content.chinese)) {
      if (++count > MAX_SUBTITLE_CUES) throw new Error("字幕超过30000个时间轴片段");
      const key = `${startMs}:${endMs}`;
      const partner = unmatched.get(key);
      if (partner && ((!partner.text && content.text && !content.chinese) || (!partner.chinese && !content.text && content.chinese))) {
        partner.text ||= content.text;
        partner.chinese ||= content.chinese;
        unmatched.delete(key);
      } else {
        const cue: CaptionCue = { startMs, endMs, text: content.text, ...(content.chinese ? { chinese: content.chinese } : {}) };
        cues.push(cue);
        if (!content.text || !content.chinese) unmatched.set(key, cue);
      }
    }
  }
  if (!cues.length) throw new Error("没有识别到有效的 SRT / VTT 英文字幕");
  return cues;
}

export function cuesToSentences(cues: CaptionCue[], maximumSeconds = 3600, resegment = true): SubtitleSentence[] {
  if (!cues.length || cues.length > MAX_SUBTITLE_CUES) throw new Error("字幕为空或超过30000个时间轴片段");
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
    if (cue.chinese || !resegment) {
      // Never merge a bilingual pair with neighboring cues or drop its Chinese
      // during sentence/rolling-caption splitting. Unpaired Chinese is not English.
      if (buffer) { emit(buffer, readingBreaks); buffer = ""; readingBreaks = []; }
      previous = null;
      if (!cue.text.trim()) continue;
      const englishParts = Array.from(segmenter.segment(cue.text), (part) => part.segment.trim()).filter(Boolean);
      const chineseParts = cue.chinese?.match(/[^。！？!?]+[。！？!?]+[”’」』"]*|[^。！？!?]+$/gu)?.map((part) => part.trim()).filter(Boolean) ?? [];
      // Only split existing bilingual text when sentence boundaries align exactly.
      // Otherwise retain the original pair rather than inventing alignment.
      const pairs = resegment && englishParts.length > 1 && englishParts.length === chineseParts.length
        ? englishParts.map((english, index) => ({ english, chinese: chineseParts[index] }))
        : [{ english: cue.text, chinese: cue.chinese ?? "" }];
      for (const pair of pairs) sentences.push({ id: `sentence-${sentences.length + 1}`, time: formatTimestamp(cue.startMs), startMs: cue.startMs, endMs: cue.endMs,
        ...pair, translationStatus: pair.chinese ? "ready" : "pending", ...(!resegment ? { preserveCueBreaks: true } : {}), ...(pair.chinese ? { translationSource: "subtitle" as const } : {}) });
      if (sentences.length > MAX_SOURCE_SENTENCES) throw new Error(`字幕超过 ${MAX_SOURCE_SENTENCES} 句限制`);
      continue;
    }
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
    if (sentences.length > MAX_SOURCE_SENTENCES) throw new Error(`字幕超过 ${MAX_SOURCE_SENTENCES} 句限制`);
  }
  if (buffer) emit(buffer, readingBreaks);
  if (sentences.length > MAX_SOURCE_SENTENCES) throw new Error(`字幕超过 ${MAX_SOURCE_SENTENCES} 句限制`);
  if (!sentences.length || sentences.reduce((sum, sentence) => sum + sentence.english.length, 0) > MAX_SUBTITLE_CHARACTERS) throw new Error("字幕为空或英文正文超过600000字符");
  return sentences;
}
