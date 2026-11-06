import { pool } from "../../../db/index";
import { saveWordToGroup } from "../../../db/learning";
import { VideoStudyError } from "../../../lib/server/sql";
import { parseReviewOptions } from "../../../lib/server/review-options";
import { isPhrase, normalizeDictionaryTerm, phraseGroupId } from "../../../lib/terms";
import {
  answerReviewTask,
  beginReviewSession,
  cancelReviewSession,
  DEMO_USER_ID,
  ensureDatabase,
  loadState,
  today,
} from "../../../db/runtime";

type Action =
  | { action: "createGroup"; name: string }
  | { action: "deleteGroup"; groupId: string }
  | { action: "setDefaultGroup"; groupId: string }
  | { action: "saveWord"; word: string; groupId?: string }
  | { action: "removeWord"; word: string; groupId: string }
  | { action: "updateNote"; word: string; note: string }
  | { action: "beginReview"; groupId: string; includeAudio?: boolean; priorityWords?: string[] }
  | { action: "cancelReview"; sessionId: string }
  | { action: "answerTask"; sessionId: string; taskId: string; selectedAnswer: string };

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function GET() {
  return Response.json(await loadState());
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const payload = (await request.json()) as Action;
    const now = new Date().toISOString();

    if (payload.action === "createGroup") {
      const name = payload.name?.trim();
      if (!name) return Response.json({ error: "请输入分组名称" }, { status: 400 });
      await pool.query(
        `INSERT INTO word_groups
          (id, user_id, name, color, is_default, created_at) VALUES ($1, $2, $3, $4, 0, $5)`,
        [`group-${crypto.randomUUID()}`, DEMO_USER_ID, name.slice(0, 24), "#d7a545", now],
      );
      return Response.json(await loadState());
    }

    if (payload.action === "setDefaultGroup") {
      if (payload.groupId === phraseGroupId(DEMO_USER_ID)) throw new HttpError("短语收藏夹有独立默认用途，请选择普通词库作为单词默认收藏夹", 409);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [DEMO_USER_ID]);
        const { rows } = await client.query(
          "SELECT id FROM word_groups WHERE user_id = $1 ORDER BY id FOR UPDATE",
          [DEMO_USER_ID],
        );
        if (!rows.some((group: { id: string }) => group.id === payload.groupId)) {
          throw new HttpError("单词分组不存在", 404);
        }
        await client.query("UPDATE word_groups SET is_default = 0 WHERE user_id = $1", [DEMO_USER_ID]);
        await client.query(
          "UPDATE word_groups SET is_default = 1 WHERE id = $1 AND user_id = $2",
          [payload.groupId, DEMO_USER_ID],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return Response.json(await loadState());
    }

    if (payload.action === "deleteGroup") {
      if (payload.groupId === phraseGroupId(DEMO_USER_ID)) throw new HttpError("短语收藏是内置收藏夹，可以移出其中的内容，但不能删除", 409);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [DEMO_USER_ID]);
        const { rows: groups } = await client.query(
          `SELECT id, is_default FROM word_groups
          WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC FOR UPDATE`,
          [DEMO_USER_ID],
        );
        const target = groups.find((group: { id: string }) => group.id === payload.groupId);
        if (!target) throw new HttpError("单词分组不存在", 404);
        if (groups.length === 1) throw new HttpError("至少需要保留一个词库", 409);

        await client.query("DELETE FROM word_groups WHERE id = $1 AND user_id = $2", [
          payload.groupId,
          DEMO_USER_ID,
        ]);
        if (Number(target.is_default) === 1) {
          const fallback = groups.find((group: { id: string }) => group.id !== payload.groupId);
          await client.query("UPDATE word_groups SET is_default = 1 WHERE id = $1", [fallback.id]);
        }
        await client.query(
          `DELETE FROM user_words AS uw
          WHERE uw.user_id = $1 AND NOT EXISTS (
            SELECT 1 FROM group_words AS gw
            WHERE gw.user_id = uw.user_id AND gw.word = uw.word
          )`,
          [DEMO_USER_ID],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return Response.json(await loadState());
    }

    if (payload.action === "saveWord") {
      if (payload.groupId !== undefined && typeof payload.groupId !== "string") throw new HttpError("收藏分组无效", 400);
      const word = normalizeDictionaryTerm(payload.word);
      if (!word) throw new HttpError("请输入有效的英文单词或短语", 400);
      const groupId = payload.groupId?.trim() || (isPhrase(word) ? phraseGroupId(DEMO_USER_ID)
        : (await pool.query("SELECT id FROM word_groups WHERE user_id=$1 AND is_default=1", [DEMO_USER_ID])).rows[0]?.id);
      const [entryRes, groupRes] = await Promise.all([
        pool.query("SELECT word FROM dictionary_entries WHERE word = $1", [word]),
        pool.query("SELECT id FROM word_groups WHERE id = $1 AND user_id = $2", [
          groupId,
          DEMO_USER_ID,
        ]),
      ]);
      if (!entryRes.rows.length) return Response.json({ error: "词汇不存在" }, { status: 404 });
      if (!groupRes.rows.length) return Response.json({ error: "单词分组不存在" }, { status: 404 });

      await saveWordToGroup(word, groupId);
      return Response.json(await loadState());
    }

    if (payload.action === "removeWord") {
      const word = payload.word?.trim().toLowerCase();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `DELETE FROM group_words
          WHERE user_id = $1 AND group_id = $2 AND word = $3
          RETURNING word`,
          [DEMO_USER_ID, payload.groupId, word],
        );
        if (!rows.length) throw new HttpError("该单词未收藏在当前词库", 404);
        await client.query(
          `DELETE FROM user_words AS uw
          WHERE uw.user_id = $1 AND uw.word = $2 AND NOT EXISTS (
            SELECT 1 FROM group_words AS gw
            WHERE gw.user_id = uw.user_id AND gw.word = uw.word
          )`,
          [DEMO_USER_ID, word],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return Response.json(await loadState());
    }

    if (payload.action === "updateNote") {
      const entryRes = await pool.query("SELECT word FROM dictionary_entries WHERE word = $1", [
        payload.word,
      ]);
      if (!entryRes.rows.length) return Response.json({ error: "词汇不存在" }, { status: 404 });
      const note = String(payload.note ?? "").slice(0, 2000);
      await pool.query(
        `INSERT INTO user_words
          (user_id, word, note, first_saved_at, updated_at, next_review)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(user_id, word)
          DO UPDATE SET note = EXCLUDED.note, updated_at = EXCLUDED.updated_at`,
        [DEMO_USER_ID, payload.word, note, now, now, today()],
      );
      return Response.json(await loadState());
    }

    if (payload.action === "beginReview") {
      if (typeof payload.groupId !== "string" || !payload.groupId.trim()) throw new HttpError("请选择词库", 400);
      const session = await beginReviewSession(payload.groupId, parseReviewOptions(payload));
      return Response.json({ ...(await loadState()), session });
    }

    if (payload.action === "answerTask") {
      if (!payload.selectedAnswer) return Response.json({ error: "请选择答案" }, { status: 400 });
      const result = await answerReviewTask(payload.sessionId, payload.taskId, payload.selectedAnswer);
      return Response.json({ ...result.state, session: result.session });
    }

    if (payload.action === "cancelReview") {
      return Response.json({ ...(await cancelReviewSession(payload.sessionId)), session: null });
    }

    return Response.json({ error: "不支持的操作" }, { status: 400 });
  } catch (error) {
    if (error instanceof VideoStudyError) return Response.json({ error: error.message }, { status: error.status });
    if ((error as { constraint?: string }).constraint === "word_groups_user_name_idx") {
      return Response.json({ error: "已存在同名词库" }, { status: 409 });
    }
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("State API operation failed", error);
    return Response.json({ error: "服务器暂时无法完成操作" }, { status: 500 });
  }
}
