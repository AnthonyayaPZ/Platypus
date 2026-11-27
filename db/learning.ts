import { pool } from "./index";
import { DEMO_USER_ID, ensureDatabase, today } from "./runtime";
import type { SubtitleSentence, WordSource } from "../lib/video-study";
import { VideoStudyError, type SqlExecutor } from "../lib/server/sql";
import { resolveOriginalSentence } from "../lib/subtitle-segmentation";
import { appendVideoNotes, type VideoNoteContext } from "../lib/word-notes";

/** The caller owns the transaction. Manual notes and review state are preserved. */
export async function saveWordWithClient(client: SqlExecutor, word: string, groupId: string, sources: WordSource[] = []) {
  const group = await client.query("SELECT id FROM word_groups WHERE id = $1 AND user_id = $2 FOR KEY SHARE", [groupId, DEMO_USER_ID]);
  if (!group.rows.length) throw new VideoStudyError("目标词库不存在或已经删除", 404);
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO user_words (user_id, word, note, first_saved_at, updated_at, next_review)
     VALUES ($1, $2, '', $3, $3, $4) ON CONFLICT(user_id, word) DO NOTHING`,
    [DEMO_USER_ID, word, now, today()],
  );
  // Serialize note merges with other imports and manual note saves. Never append
  // using a stale client-supplied note, which could overwrite existing text.
  const saved = sources.length ? await client.query("SELECT note FROM user_words WHERE user_id=$1 AND word=$2 FOR UPDATE", [DEMO_USER_ID, word]) : null;
  const contexts: VideoNoteContext[] = [];
  await client.query("INSERT INTO group_words (user_id, group_id, word, added_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [DEMO_USER_ID, groupId, word, now]);
  for (const source of sources.slice(0, 10)) {
    const { rows } = await client.query("SELECT title, sentences FROM video_study_documents WHERE id = $1", [source.documentId]);
    const sentences = (rows[0]?.sentences as SubtitleSentence[] | undefined) ?? [];
    const original = resolveOriginalSentence(source.sentenceId, sentences);
    if (!original) continue;
    // The clicked reading block has its own aligned translation. Keep canonical
    // full-sentence context in video_word_sources, but use the visible bilingual
    // pair in notes so a long sentence's translation cannot be mismatched.
    const visible = sentences.find((sentence) => sentence.id === source.sentenceId) ?? original;
    contexts.push({ title: String(rows[0].title), time: visible.time, english: visible.english, chinese: visible.chinese });
    await client.query(
      `INSERT INTO video_word_sources (group_id, word, document_id, sentence_id, title, time, english)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [groupId, word, source.documentId, original.id, rows[0].title, original.time, original.english],
    );
  }
  if (saved?.rows.length) {
    const previous = String(saved.rows[0].note ?? "");
    let note: string;
    try { note = appendVideoNotes(previous, contexts); }
    catch (error) { if (error instanceof RangeError) throw new VideoStudyError(error.message, 422); throw error; }
    if (note !== previous) await client.query("UPDATE user_words SET note=$3,updated_at=$4 WHERE user_id=$1 AND word=$2", [DEMO_USER_ID, word, note, now]);
  }
}

export async function saveWordToGroup(word: string, groupId: string, sources: WordSource[] = []) {
  await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await saveWordWithClient(client, word, groupId, sources);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
