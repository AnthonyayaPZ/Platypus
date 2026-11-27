export const MAX_WORD_NOTE_LENGTH = 20_000;
export type VideoNoteContext = { title: string; time: string; english: string; chinese: string };
const missingTranslation = "（本句暂无中文翻译）";

/** Append readable source notes without rewriting manual text or duplicating pairs. */
export function appendVideoNotes(existing: string, contexts: VideoNoteContext[]) {
  let note = existing;
  for (const context of contexts) {
    const english = context.english.trim();
    const chinese = context.chinese.trim();
    if (!english) continue;
    const body = `${english}\n${chinese || missingTranslation}`;
    const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
    if (normalized(note).includes(normalized(body))) continue;
    const pendingBody = `${english}\n${missingTranslation}`;
    if (chinese && note.includes(pendingBody)) {
      note = note.replace(pendingBody, body);
    } else {
      const label = ["视频学习", context.title.replace(/\s+/g, " ").trim(), context.time.trim()].filter(Boolean).join(" · ");
      note = `${note}${note ? "\n\n" : ""}【${label}】\n${body}`;
    }
  }
  if (note !== existing && note.length > MAX_WORD_NOTE_LENGTH) throw new RangeError("笔记已超过20000字，请整理该词笔记后重试收藏；原笔记不会被截断");
  return note;
}
