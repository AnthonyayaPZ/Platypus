import { pool } from "./index";
import { DEMO_USER_ID, ensureDatabase, today } from "./runtime";
import type { SubtitleSentence, WordSource } from "../lib/video-study";
import { VideoStudyError, type SqlExecutor } from "../lib/server/sql";

/** The caller owns the transaction. Existing notes and spaced-repetition state are preserved. */
export async function saveWordWithClient(client: SqlExecutor, word: string, groupId: string, sources: WordSource[] = []) {
  const group = await client.query("SELECT id FROM word_groups WHERE id = $1 AND user_id = $2 FOR KEY SHARE", [groupId, DEMO_USER_ID]);
  if (!group.rows.length) throw new VideoStudyError("目标词库不存在或已经删除", 404);
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO user_words (user_id, word, note, first_saved_at, updated_at, next_review)
     VALUES ($1, $2, '', $3, $3, $4) ON CONFLICT(user_id, word) DO NOTHING`,
    [DEMO_USER_ID, word, now, today()],
  );
  await client.query("INSERT INTO group_words (user_id, group_id, word, added_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [DEMO_USER_ID, groupId, word, now]);
  for (const source of sources.slice(0, 10)) {
    const { rows } = await client.query("SELECT title, sentences FROM video_study_documents WHERE id = $1", [source.documentId]);
    const sentence = (rows[0]?.sentences as SubtitleSentence[] | undefined)?.find((item) => item.id === source.sentenceId);
    if (!sentence) continue;
    await client.query(
      `INSERT INTO video_word_sources (group_id, word, document_id, sentence_id, title, time, english)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [groupId, word, source.documentId, sentence.id, rows[0].title, sentence.time, sentence.english],
    );
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
