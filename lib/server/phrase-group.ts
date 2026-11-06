import { phraseGroupId } from "../terms";
import type { SqlExecutor } from "./sql";

/** Caller owns a transaction. Never repurpose a user's existing folder. */
export async function ensurePhraseGroup(sql: SqlExecutor, userId: string) {
  await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
  const id = phraseGroupId(userId);
  if ((await sql.query("SELECT id FROM word_groups WHERE id=$1 AND user_id=$2", [id, userId])).rows.length) return id;
  const groups = (await sql.query("SELECT name FROM word_groups WHERE user_id=$1", [userId])).rows;
  const names = new Set(groups.map((group) => String(group.name)));
  let name = "短语收藏";
  for (let suffix = 2; names.has(name); suffix++) name = `短语收藏（${suffix}）`;
  await sql.query(`INSERT INTO word_groups(id,user_id,name,color,is_default,created_at)
    VALUES($1,$2,$3,'#6f67a8',0,$4) ON CONFLICT(id) DO NOTHING`, [id, userId, name, new Date().toISOString()]);
  return id;
}
