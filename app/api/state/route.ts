import { env } from "cloudflare:workers";
import { dictionary } from "../../../lib/dictionary";

type Action =
  | { action: "createGroup"; name: string }
  | { action: "saveWord"; word: string; groupId: string }
  | { action: "reviewWord"; word: string; groupId: string; quality: number };

const today = () => new Date().toISOString().slice(0, 10);

async function ensureDatabase() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS word_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#f28c52',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS saved_words (
      word TEXT NOT NULL,
      group_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
      ease INTEGER NOT NULL DEFAULT 250,
      interval_days INTEGER NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      next_review TEXT NOT NULL,
      last_reviewed TEXT,
      PRIMARY KEY (word, group_id),
      FOREIGN KEY (group_id) REFERENCES word_groups(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS saved_words_group_idx ON saved_words(group_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS saved_words_review_idx ON saved_words(next_review)"),
  ]);

  const existing = await db.prepare("SELECT COUNT(*) AS count FROM word_groups").first<{ count: number }>();
  if (!existing?.count) {
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO word_groups (id, name, color, is_default, created_at) VALUES (?, ?, ?, 1, ?)").bind("default", "默认收藏", "#f28c52", now),
      db.prepare("INSERT INTO word_groups (id, name, color, is_default, created_at) VALUES (?, ?, ?, 0, ?)").bind("cet6", "CET-6 冲刺", "#2f6f62", now),
      db.prepare("INSERT INTO word_groups (id, name, color, is_default, created_at) VALUES (?, ?, ?, 0, ?)").bind("work", "工作表达", "#6f67a8", now),
    ]);
    const seed = dictionary.slice(0, 20).map((entry) =>
      db.prepare("INSERT INTO saved_words (word, group_id, added_at, next_review) VALUES (?, 'default', ?, ?)").bind(entry.word, now, today())
    );
    await db.batch(seed);
  }
}

export async function GET() {
  await ensureDatabase();
  const [groups, words] = await Promise.all([
    env.DB.prepare(`SELECT g.*, COUNT(w.word) AS word_count,
      SUM(CASE WHEN w.next_review <= ? THEN 1 ELSE 0 END) AS due_count
      FROM word_groups g LEFT JOIN saved_words w ON w.group_id = g.id
      GROUP BY g.id ORDER BY g.is_default DESC, g.created_at ASC`).bind(today()).all(),
    env.DB.prepare("SELECT * FROM saved_words ORDER BY added_at DESC").all(),
  ]);
  return Response.json({ groups: groups.results, savedWords: words.results });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = (await request.json()) as Action;
  const now = new Date().toISOString();

  if (payload.action === "createGroup") {
    const name = payload.name?.trim();
    if (!name) return Response.json({ error: "请输入分组名称" }, { status: 400 });
    const id = `group-${crypto.randomUUID()}`;
    await env.DB.prepare("INSERT INTO word_groups (id, name, color, is_default, created_at) VALUES (?, ?, ?, 0, ?)")
      .bind(id, name.slice(0, 24), "#d7a545", now).run();
  } else if (payload.action === "saveWord") {
    if (!dictionary.some((item) => item.word === payload.word)) return Response.json({ error: "词汇不存在" }, { status: 404 });
    await env.DB.prepare(`INSERT INTO saved_words (word, group_id, added_at, next_review)
      VALUES (?, ?, ?, ?) ON CONFLICT(word, group_id) DO NOTHING`)
      .bind(payload.word, payload.groupId, now, today()).run();
  } else if (payload.action === "reviewWord") {
    const row = await env.DB.prepare("SELECT * FROM saved_words WHERE word = ? AND group_id = ?")
      .bind(payload.word, payload.groupId).first<{ ease: number; interval_days: number; repetitions: number }>();
    if (row) {
      const quality = Math.max(0, Math.min(5, payload.quality));
      const repetitions = quality < 3 ? 0 : row.repetitions + 1;
      const interval = quality < 3 ? 1 : repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.max(4, Math.round(row.interval_days * (row.ease / 100)));
      const ease = Math.max(130, Math.round(row.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)) * 100));
      const next = new Date();
      next.setDate(next.getDate() + interval);
      await env.DB.prepare(`UPDATE saved_words SET ease = ?, interval_days = ?, repetitions = ?, next_review = ?, last_reviewed = ?
        WHERE word = ? AND group_id = ?`).bind(ease, interval, repetitions, next.toISOString().slice(0, 10), now, payload.word, payload.groupId).run();
    }
  }
  return GET();
}
