import type { VideoStudyDocument } from "./video-study";

export type StudyHistoryItem = Pick<VideoStudyDocument, "id" | "title" | "channel" | "duration" | "status" | "updatedAt"> & {
  sentenceCount: number;
  lastOpenedAt?: string;
  isExample?: boolean;
};

export function historyItem(document: VideoStudyDocument, lastOpenedAt?: string): StudyHistoryItem {
  return { id: document.id, title: document.title, channel: document.channel, duration: document.duration,
    status: document.status, updatedAt: document.updatedAt, sentenceCount: document.sentences.length,
    isExample: document.id.startsWith("demo-"), ...(lastOpenedAt ? { lastOpenedAt } : {}) };
}

export function mergeStudyHistory(current: StudyHistoryItem[], incoming: StudyHistoryItem[]): StudyHistoryItem[] {
  const items = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    if (!item || typeof item.id !== "string" || typeof item.title !== "string") continue;
    const previous = items.get(item.id);
    items.set(item.id, { ...previous, ...item, lastOpenedAt: item.lastOpenedAt || previous?.lastOpenedAt });
  }
  const time = (item: StudyHistoryItem) => Date.parse(item.lastOpenedAt || (item.isExample ? "1970-01-01" : item.updatedAt || "1970-01-01")) || 0;
  return [...items.values()].sort((a, b) => time(b) - time(a) || a.title.localeCompare(b.title));
}
