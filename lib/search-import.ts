import { normalizeStudyWord, type VideoStudyJob } from "./video-study";

export type SearchImportSession = {
  words: string[];
  jobId: string;
  acknowledged: string[];
  pending: { requestId: string; groupId: string; words: { word: string; sources: [] }[] } | null;
};
export const emptySearchImport: SearchImportSession = { words: [], jobId: "", acknowledged: [], pending: null };

export function parseImportWords(raw: string) {
  const tokens = raw.trim().split(/[\s,，;；、]+/).filter(Boolean);
  const invalid = tokens.filter((word) => !normalizeStudyWord(word));
  return { words: [...new Set(tokens.map(normalizeStudyWord).filter((word): word is string => !!word))], invalid };
}

export function appendImportWords(current: string[], raw: string) {
  const parsed = parseImportWords(raw);
  const words = [...new Set([...current, ...parsed.words])];
  const error = raw.length > 10000 ? "输入内容过长，请每批添加不超过30个单词" : parsed.invalid.length
    ? `请检查无效内容：${parsed.invalid.slice(0, 3).map((word) => word.slice(0, 48)).join("、")}`
    : words.length > 30 ? "每批最多30个单词，请分批添加；当前输入已保留" : "";
  return { words: error ? current : words, error };
}

export function activeImportPrefix(raw: string) { return raw.split(/[\s,，;；、]+/).at(-1) ?? ""; }
export function completeImportPrefix(raw: string, word: string) { return raw.replace(/[^\s,，;；、]*$/, word); }
export function acknowledgeSearchImport(session: SearchImportSession, job: VideoStudyJob): SearchImportSession {
  if (session.jobId !== job.id) return session;
  const successes = job.items.filter((item) => item.status === "success" && !session.acknowledged.includes(item.word)).map((item) => item.word);
  return { ...session, words: session.words.filter((word) => !successes.includes(word)), acknowledged: [...session.acknowledged, ...successes] };
}

export function restoreSearchImport(raw: string | null): SearchImportSession {
  if (!raw) return emptySearchImport;
  const value = JSON.parse(raw);
  if (!value || !Array.isArray(value.words) || value.words.length > 30
    || value.words.some((word: unknown) => typeof word !== "string" || normalizeStudyWord(word) !== word)) throw new Error("无效的批量草稿");
  const pending = value.pending;
  if (pending && (typeof pending.requestId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(pending.requestId)
    || typeof pending.groupId !== "string" || !Array.isArray(pending.words) || !pending.words.length || pending.words.length > 30
    || pending.words.some((item: { word?: unknown }) => typeof item?.word !== "string" || normalizeStudyWord(item.word) !== item.word))) throw new Error("无效的待提交批次");
  return { words: [...new Set<string>(value.words)], jobId: typeof value.jobId === "string" ? value.jobId : "",
    acknowledged: Array.isArray(value.acknowledged) ? value.acknowledged.filter((word: unknown) => typeof word === "string") : [],
    pending: pending ? { requestId: pending.requestId, groupId: pending.groupId, words: pending.words.map((item: { word: string }) => ({ word: item.word, sources: [] })) } : null };
}
