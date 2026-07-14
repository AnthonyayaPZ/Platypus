import {
  answerReviewTask,
  beginReviewSession,
  cancelReviewSession,
  DEMO_USER_ID,
  ensureDatabase,
  getD1,
  loadState,
  today,
} from "../../../db/runtime";

type Action =
  | { action: "createGroup"; name: string }
  | { action: "saveWord"; word: string; groupId: string }
  | { action: "updateNote"; word: string; note: string }
  | { action: "beginReview"; groupId: string }
  | { action: "cancelReview"; sessionId: string }
  | { action: "answerTask"; sessionId: string; taskId: string; selectedAnswer: string };

export async function GET() {
  return Response.json(await loadState());
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const payload = (await request.json()) as Action;
    const db = getD1();
    const now = new Date().toISOString();

    if (payload.action === "createGroup") {
      const name = payload.name?.trim();
      if (!name) return Response.json({ error: "请输入分组名称" }, { status: 400 });
      await db.prepare(`INSERT INTO word_groups
        (id, user_id, name, color, is_default, created_at) VALUES (?, ?, ?, ?, 0, ?)`)
        .bind(`group-${crypto.randomUUID()}`, DEMO_USER_ID, name.slice(0, 24), "#d7a545", now).run();
      return Response.json(await loadState());
    }

    if (payload.action === "saveWord") {
      const [entry, group] = await Promise.all([
        db.prepare("SELECT word FROM dictionary_entries WHERE word = ?").bind(payload.word).first(),
        db.prepare("SELECT id FROM word_groups WHERE id = ? AND user_id = ?")
          .bind(payload.groupId, DEMO_USER_ID).first(),
      ]);
      if (!entry) return Response.json({ error: "词汇不存在" }, { status: 404 });
      if (!group) return Response.json({ error: "单词分组不存在" }, { status: 404 });
      await db.batch([
        db.prepare(`INSERT INTO user_words
          (user_id, word, note, first_saved_at, updated_at, next_review)
          VALUES (?, ?, '', ?, ?, ?) ON CONFLICT(user_id, word) DO UPDATE SET updated_at = excluded.updated_at`)
          .bind(DEMO_USER_ID, payload.word, now, now, today()),
        db.prepare(`INSERT INTO group_words (user_id, group_id, word, added_at)
          VALUES (?, ?, ?, ?) ON CONFLICT(user_id, group_id, word) DO NOTHING`)
          .bind(DEMO_USER_ID, payload.groupId, payload.word, now),
      ]);
      return Response.json(await loadState());
    }

    if (payload.action === "updateNote") {
      const entry = await db.prepare("SELECT word FROM dictionary_entries WHERE word = ?")
        .bind(payload.word).first();
      if (!entry) return Response.json({ error: "词汇不存在" }, { status: 404 });
      const note = String(payload.note ?? "").slice(0, 2000);
      await db.prepare(`INSERT INTO user_words
        (user_id, word, note, first_saved_at, updated_at, next_review)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, word)
        DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`)
        .bind(DEMO_USER_ID, payload.word, note, now, now, today()).run();
      return Response.json(await loadState());
    }

    if (payload.action === "beginReview") {
      const session = await beginReviewSession(payload.groupId);
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
    const message = error instanceof Error ? error.message : "操作失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
