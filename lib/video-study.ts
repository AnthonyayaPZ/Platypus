export type OriginalSubtitleSentence = { id: string; time: string; english: string; chinese: string; startMs?: number; endMs?: number; readingBreaks?: number[]; aliases?: string[] };
export type SubtitleSentence = OriginalSubtitleSentence & {
  translationStatus?: "pending" | "ready" | "failed";
  translationError?: string;
  readingVersion?: number;
  readingMethod?: "rules" | "assisted";
  sourceSentenceId?: string;
  // Only the first segment stores the original; following segments reference it.
  sourceSentence?: OriginalSubtitleSentence;
};
export type VideoStudyDocument = { id: string; title: string; channel: string; duration: string; sentences: SubtitleSentence[]; videoId?: string; url?: string; thumbnail?: string; status?: "queued" | "fetching" | "translating" | "ready" | "partial" | "failed"; error?: string; updatedAt?: string };
export type VideoCandidate = { id: string; title: string; channel: string; duration: string; thumbnail?: string; url: string };
export type WordSource = { documentId: string; title: string; sentenceId: string; time: string; english: string };
export type DraftWord = { word: string; sources: WordSource[] };
export type SubtitleToken = { text: string; word: string | null };
export type ImportItem = { word: string; status: "waiting" | "processing" | "success" | "failed"; error?: string };
export type VideoStudyJob = { id: string; kind: "document" | "import"; status: "queued" | "running" | "completed" | "partial" | "failed"; groupId: string; groupName: string; documentId: string; items: ImportItem[]; error: string; updatedAt: string };

export function normalizeStudyWord(value: string): string | null {
  const word = value.trim().replace(/[’‘]/g, "'").toLowerCase();
  return /^[a-z][a-z'-]{0,47}$/.test(word) ? word : null;
}

export function tokenizeSubtitle(text: string): SubtitleToken[] {
  const pattern = /[a-zA-Z]+(?:['’‘-][a-zA-Z]+)*/g;
  const tokens: SubtitleToken[] = [];
  let position = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > position) tokens.push({ text: text.slice(position, index), word: null });
    tokens.push({ text: match[0], word: normalizeStudyWord(match[0]) });
    position = index + match[0].length;
  }
  if (position < text.length) tokens.push({ text: text.slice(position), word: null });
  return tokens;
}

export function addDraftWord(draft: DraftWord[], value: string, source?: WordSource): DraftWord[] {
  const word = normalizeStudyWord(value);
  if (!word) return draft;
  const existing = draft.find((item) => item.word === word);
  if (!existing) return [...draft, { word, sources: source ? [source] : [] }];
  if (!source || existing.sources.some((item) => item.documentId === source.documentId && item.sentenceId === source.sentenceId)) return draft;
  return draft.map((item) => item.word === word ? { ...item, sources: [...item.sources, source] } : item);
}

export function renameDraftWord(draft: DraftWord[], previous: string, value: string): DraftWord[] {
  const word = normalizeStudyWord(value);
  const previousItem = draft.find((item) => item.word === previous);
  if (!word || !previousItem || word === previous) return draft;
  let result = draft.filter((item) => item.word !== previous);
  if (previousItem.sources.length === 0) result = addDraftWord(result, word);
  for (const source of previousItem.sources) result = addDraftWord(result, word, source);
  return result;
}

export function restoreDraft(value: string | null): DraftWord[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    let result: DraftWord[] = [];
    for (const item of parsed.slice(0, 300)) {
      if (!item || typeof item.word !== "string") continue;
      result = addDraftWord(result, item.word);
      if (!Array.isArray(item.sources)) continue;
      for (const source of item.sources.slice(0, 30)) {
        if (!source || ![source.documentId, source.title, source.sentenceId, source.time, source.english].every((field) => typeof field === "string")) continue;
        result = addDraftWord(result, item.word, source as WordSource);
      }
    }
    return result;
  } catch {
    return [];
  }
}
