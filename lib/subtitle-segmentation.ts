import type { OriginalSubtitleSentence, SubtitleSentence } from "./video-study";

export const READING_SEGMENT_VERSION = 1;
export const MAX_READING_WORDS = 24;
export const MAX_READING_SEGMENTS = 2000;
const SOFT_CHARACTERS = 132;

type Word = { text: string; start: number; end: number };
export type ReadingPiece = { english: string; firstWord: number; endWord: number };
export type ReadingRefinementInput = { id: string; english: string; words: string[]; suggestedCuts: number[] };
const wordsIn = (text: string): Word[] => Array.from(text.matchAll(/[A-Za-z]+(?:['’‘-][A-Za-z]+)*|\d+(?:[.,:]\d+)*/g), (match) => ({ text: match[0], start: match.index!, end: match.index! + match[0].length }));
export const subtitleWordCount = (text: string) => wordsIn(text).length;

function estimatedRows(words: Word[], start = 0, end = words.length) {
  // Conservative estimate for the existing 17sp word cards on a 360dp phone:
  // 360 - list padding 34 - card padding 32 = 294dp. This is not a device
  // measurement, and cannot guarantee fitting every font scale or screen.
  let rows = 1;
  let width = 0;
  for (let index = start; index < end; index++) {
    const card = Math.min(294, 20 + words[index].text.length * 8.5);
    if (width && width + 6 + card > 294) { rows++; width = card; }
    else width += (width ? 6 : 0) + card;
  }
  return rows;
}

export const estimatedReadingRows = (text: string) => estimatedRows(wordsIn(text));

const dependents = new Set("a an the this that these those my your his her its our their some any each every no of in on at to for from with by into onto upon through across between among during without within about against towards toward as than and or nor but not never can could will would shall should may might must am is are was were be been being do does did have has had i you he she it we they who which whose".split(" "));
const clauses = new Set("because although though while whereas unless until when whenever where wherever since if whether however therefore nevertheless".split(" "));
const subjects = new Set("i you he she it we they this that these those there people someone everyone nobody".split(" "));
const abbreviations = new Set("mr mrs ms dr prof sr jr st vs etc e g u s".split(" "));
const phrases = ["in order to", "as well as", "so that", "even though", "even if", "as soon as", "as long as", "rather than", "instead of", "look forward to", "looking forward to", "be able to", "used to", "because of", "according to", "a lot of", "at least", "for example", "on the other hand", "as a result", "take care of", "pay attention to", "not only", "but also", "such as", "in spite of", "due to"].map((phrase) => phrase.split(" "));

function boundaryCosts(text: string, words: Word[], pauses: number[]): number[] {
  const lower = words.map((word) => word.text.toLowerCase().replace(/[’‘]/g, "'"));
  const protectedCuts = new Set<number>();
  for (let index = 0; index < words.length; index++) {
    for (const phrase of phrases) {
      if (phrase.every((word, offset) => lower[index + offset] === word)) {
        for (let offset = 1; offset < phrase.length; offset++) protectedCuts.add(index + offset);
      }
    }
  }
  return words.map((_, index) => {
    if (!index) return 0;
    const previous = lower[index - 1];
    const next = lower[index];
    const between = text.slice(words[index - 1].end, words[index].start);
    const punctuated = /[,;:!?—–]/.test(between) || (/\./.test(between) && !abbreviations.has(previous));
    let cost = 25; // Last-resort whitespace break, not a preferred syntactic cut.
    if (/[.!?;]/.test(between) && !abbreviations.has(previous)) cost = 0;
    else if (/[:,—–]/.test(between)) cost = 3;
    else if (clauses.has(next)) cost = 6;
    else if (["and", "but", "or", "so", "yet"].includes(next) && subjects.has(lower[index + 1])) cost = 7;
    else if (["to", "with", "from", "for", "in", "on", "at", "by", "without", "through"].includes(next)) cost = 16;
    // Pauses are soft evidence only; source subtitle cue boundaries are not
    // sentence boundaries and must not override a tightly bound expression.
    if (pauses.some((offset) => offset > words[index - 1].end - 1 && offset <= words[index].start)) cost = Math.min(cost, 12);
    if (!punctuated && (dependents.has(previous) || /(?:n't|'(?:ll|ve|re|m|d|s))$/.test(previous))) cost += 130;
    const properName = /^[A-Z][a-z]+$/.test(words[index - 1].text) && /^[A-Z][a-z]+$/.test(words[index].text);
    if (!punctuated && (properName || (abbreviations.has(previous) && /\./.test(between)))) cost += 180;
    if (protectedCuts.has(index)) cost += 500;
    return cost;
  });
}

/** Lossless word-boundary segmentation; no LLM rewrites of source English. */
export function splitReadingText(text: string, pauses: number[] = []): ReadingPiece[] {
  const words = wordsIn(text);
  const count = words.length;
  if (count <= MAX_READING_WORDS && estimatedRows(words) <= 6 && (count <= 16 || text.length <= SOFT_CHARACTERS)) return [{ english: text, firstWord: 0, endWord: count }];
  const boundaries = boundaryCosts(text, words, pauses);
  const costs = Array<number>(count + 1).fill(Infinity);
  const previous = Array<number>(count + 1).fill(-1);
  costs[0] = 0;
  for (let end = 1; end <= count; end++) {
    for (let start = Math.max(0, end - MAX_READING_WORDS); start < end; start++) {
      if (start === 0 && end === count) continue; // A long text must actually split.
      const length = end - start;
      const characters = (end === count ? text.length : words[end].start) - words[start].start;
      const lengthCost = length < 10 ? 8 + (10 - length) ** 2 * 3 : length > 18 ? (length - 18) ** 2 * 1.5 : Math.abs(length - 15) * 0.5;
      const characterCost = Math.max(0, characters - 110) ** 2 / 180;
      const layoutCost = Math.max(0, estimatedRows(words, start, end) - 4) ** 2 * 14;
      const cost = costs[start] + 9 + lengthCost + characterCost + layoutCost + (end === count ? 0 : boundaries[end]);
      if (cost < costs[end]) { costs[end] = cost; previous[end] = start; }
    }
  }
  const ranges: { start: number; end: number }[] = [];
  for (let end = count; end > 0;) {
    const start = previous[end];
    if (start < 0) throw new Error("无法切分字幕段落");
    ranges.push({ start, end });
    end = start;
  }
  const pieces = ranges.reverse().map(({ start, end }) => ({
    english: text.slice(start === 0 ? 0 : words[start].start, end === count ? text.length : words[end].start).trim(),
    firstWord: start, endWord: end,
  }));
  if (pieces.map((piece) => piece.english).join("").replace(/\s+/g, "") !== text.replace(/\s+/g, "")) throw new Error("字幕切分校验失败，原文已保留");
  return pieces;
}

export function needsReadingSegmentation(sentences: SubtitleSentence[]) {
  return sentences.some((sentence) => !sentence.readingVersion && splitReadingText(sentence.english, sentence.readingBreaks).length > 1);
}

export function readingRefinementRequests(sentences: SubtitleSentence[]): ReadingRefinementInput[] {
  return sentences.flatMap((sentence) => {
    if (sentence.readingVersion) return [];
    const pieces = splitReadingText(sentence.english, sentence.readingBreaks);
    if (pieces.length < 2) return [];
    const words = wordsIn(sentence.english);
    const costs = boundaryCosts(sentence.english, words, sentence.readingBreaks ?? []);
    const cuts = pieces.slice(0, -1).map((piece) => piece.endWord);
    return cuts.some((cut) => costs[cut] >= 16) ? [{ id: sentence.id, english: sentence.english, words: words.map((word) => word.text), suggestedCuts: cuts }] : [];
  });
}

/** Model output is only integer word positions, never replacement English. */
export function splitReadingTextAtCuts(text: string, cuts: number[]): ReadingPiece[] {
  const words = wordsIn(text);
  if (!Array.isArray(cuts) || !cuts.length || cuts.length >= Math.ceil(words.length / 4)) throw new Error("无效的字幕切点");
  const boundaries = boundaryCosts(text, words, []);
  const points = [0, ...cuts, words.length];
  for (let index = 1; index < points.length; index++) {
    const length = points[index] - points[index - 1];
    if (!Number.isInteger(points[index]) || length < 4 || length > MAX_READING_WORDS || points[index] > words.length
      || (index < points.length - 1 && boundaries[points[index]] >= 130)) throw new Error("字幕切点破坏了词组或长度约束");
  }
  return points.slice(1).map((end, index) => {
    const start = points[index];
    return { english: text.slice(start === 0 ? 0 : words[start].start, end === words.length ? text.length : words[end].start).trim(), firstWord: start, endWord: end };
  });
}

export function segmentSubtitlesForReading(sentences: SubtitleSentence[], refinedCuts: Map<string, number[]> = new Map()): SubtitleSentence[] {
  const usedIds = new Set(sentences.map((sentence) => sentence.id));
  const result: SubtitleSentence[] = [];
  for (const sentence of sentences) {
    if (sentence.readingVersion) { result.push(sentence); continue; }
    let pieces = splitReadingText(sentence.english, sentence.readingBreaks);
    let assisted = false;
    if (refinedCuts.has(sentence.id)) {
      try {
        const refined = splitReadingTextAtCuts(sentence.english, refinedCuts.get(sentence.id)!);
        const allowedRows = Math.max(6, ...pieces.map((piece) => estimatedReadingRows(piece.english)));
        const allowedCharacters = Math.max(160, ...pieces.map((piece) => piece.english.length));
        if (refined.length > pieces.length + 1 || refined.some((piece) => estimatedReadingRows(piece.english) > allowedRows || piece.english.length > allowedCharacters)) throw new Error("语义切点会导致段落过高或过碎");
        pieces = refined;
        assisted = true;
      }
      catch { /* Keep the lossless, bounded rule result if model cuts are invalid. */ }
    }
    if (pieces.length === 1) { result.push(sentence); continue; }
    const original: OriginalSubtitleSentence = { id: sentence.id, time: sentence.time, english: sentence.english, chinese: sentence.chinese,
      ...(sentence.startMs !== undefined ? { startMs: sentence.startMs } : {}), ...(sentence.endMs !== undefined ? { endMs: sentence.endMs } : {}) };
    for (const [index, piece] of pieces.entries()) {
      let id = sentence.id;
      if (index) {
        const base = `${sentence.id.slice(0, 75)}--segment-${piece.firstWord}`;
        id = base;
        for (let suffix = 2; usedIds.has(id); suffix++) id = `${base}-${suffix}`;
        usedIds.add(id);
      }
      result.push({ id, time: sentence.time, startMs: sentence.startMs, endMs: sentence.endMs,
        english: piece.english, chinese: "", translationStatus: "pending", readingVersion: READING_SEGMENT_VERSION, readingMethod: assisted ? "assisted" : "rules",
        sourceSentenceId: sentence.id, ...(index === 0 ? { sourceSentence: original } : {}) });
    }
  }
  if (result.length > MAX_READING_SEGMENTS) {
    if (refinedCuts.size) return segmentSubtitlesForReading(sentences);
    throw new Error(`字幕超过 ${MAX_READING_SEGMENTS} 个阅读段落，请使用较短的视频`);
  }
  return result;
}

export function originalSentenceFor(sentence: SubtitleSentence, sentences: SubtitleSentence[]): OriginalSubtitleSentence {
  return sentence.sourceSentence ?? sentences.find((item) => item.id === sentence.sourceSentenceId)?.sourceSentence ?? sentence;
}
