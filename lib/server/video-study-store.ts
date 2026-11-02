import { createHash, randomUUID } from "node:crypto";
import { pool } from "../../db/index";
import { DEMO_USER_ID } from "../../db/runtime";
import { normalizeStudyWord, type DraftWord, type ImportItem, type SubtitleSentence, type VideoStudyDocument, type VideoStudyJob, type WordSource } from "../video-study";
import { VideoStudyError, type SqlExecutor } from "./sql";
import { exampleDocuments } from "../video-study-examples";
import type { StudyHistoryItem } from "../video-study-history";

export type DocumentInput = { source: "youtube"; videoId: string } | { source: "upload"; title: string; subtitle: string };
export type ClaimedJob = { id: string; kind: "document" | "import"; documentId: string; payload: Record<string, unknown>; workerId: string };
const now = () => new Date().toISOString();
const hash = (payload: unknown) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");

export class VideoStudyStore {
  constructor(readonly sql: SqlExecutor = pool) {}
  private exampleSeed: Promise<void> | null = null;

  async ensureExamples() {
    if (!this.exampleSeed) this.exampleSeed = (async () => {
      for (const document of exampleDocuments) {
        await this.sql.query(
          `INSERT INTO video_study_documents(id,title,channel,duration,status,sentences,created_at,updated_at)
           VALUES($1,$2,$3,$4,'ready',$5::jsonb,$6,$6) ON CONFLICT(id) DO NOTHING`,
          [document.id, document.title, document.channel, document.duration, JSON.stringify(document.sentences), now()],
        );
      }
    })().catch((error) => { this.exampleSeed = null; throw error; });
    await this.exampleSeed;
  }

  async history(): Promise<StudyHistoryItem[]> {
    await this.ensureExamples();
    const { rows } = await this.sql.query(`SELECT id,title,channel,duration,status,updated_at,jsonb_array_length(sentences) AS sentence_count
      FROM video_study_documents ORDER BY (id LIKE 'demo-%') ASC,updated_at DESC,id ASC`);
    return rows.map((row) => ({ id: String(row.id), title: String(row.title), channel: String(row.channel), duration: String(row.duration),
      status: row.status as VideoStudyDocument["status"], updatedAt: String(row.updated_at), sentenceCount: Number(row.sentence_count), isExample: String(row.id).startsWith("demo-") }));
  }

  async document(id: string): Promise<VideoStudyDocument | null> {
    if (exampleDocuments.some((document) => document.id === id)) await this.ensureExamples();
    const { rows } = await this.sql.query("SELECT * FROM video_study_documents WHERE id=$1", [id]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: String(row.id), videoId: String(row.video_id), title: String(row.title), channel: String(row.channel),
      duration: String(row.duration), url: String(row.url), thumbnail: String(row.thumbnail),
      status: row.status as VideoStudyDocument["status"], sentences: row.sentences as SubtitleSentence[],
      error: String(row.error), updatedAt: String(row.updated_at),
    };
  }

  async enqueueDocument(input: DocumentInput) {
    const id = input.source === "youtube" ? `youtube-${input.videoId}-en` : `upload-${hash(input).slice(0, 32)}`;
    const timestamp = now();
    await this.sql.query(
      `WITH document AS (
         INSERT INTO video_study_documents (id,video_id,title,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$4) ON CONFLICT(id) DO UPDATE SET id=EXCLUDED.id RETURNING id
       ) INSERT INTO video_study_jobs (id,request_key,kind,document_id,payload,payload_hash,created_at,updated_at)
       SELECT $5,$6,'document',id,$7::jsonb,$8,$4,$4 FROM document ON CONFLICT(request_key) DO NOTHING`,
      [id, input.source === "youtube" ? input.videoId : "", input.source === "upload" ? input.title : "正在获取字幕", timestamp, randomUUID(), `document:${id}`, JSON.stringify(input), hash(input)],
    );
    return (await this.document(id))!;
  }

  async retryDocument(id: string) {
    await this.sql.query(
      `WITH job AS (UPDATE video_study_jobs SET status='queued',error='',worker_id='',lease_until='',updated_at=$2
       WHERE document_id=$1 AND kind='document' AND status IN ('failed','partial') RETURNING document_id)
       UPDATE video_study_documents SET status='queued',error='',updated_at=$2 WHERE id IN (SELECT document_id FROM job)`, [id, now()],
    );
    const document = await this.document(id);
    if (!document) throw new VideoStudyError("字幕文档不存在", 404);
    return document;
  }

  async enqueueImport(requestId: string, groupId: string, words: DraftWord[]): Promise<VideoStudyJob> {
    await this.ensureExamples();
    const { rows: groups } = await this.sql.query("SELECT name FROM word_groups WHERE id=$1 AND user_id=$2", [groupId, DEMO_USER_ID]);
    if (!groups.length) throw new VideoStudyError("请选择有效的目标词库", 404);
    const payload = { groupId, words };
    const payloadHash = hash(payload);
    const requestKey = `import:${requestId}`;
    const timestamp = now();
    const id = randomUUID();
    await this.sql.query(
      `WITH job AS (
         INSERT INTO video_study_jobs (id,request_key,kind,group_id,group_name,payload,payload_hash,created_at,updated_at)
         VALUES ($1,$2,'import',$3,$4,$5::jsonb,$6,$7,$7) ON CONFLICT(request_key) DO NOTHING RETURNING id
       ) INSERT INTO video_study_job_items (job_id,word,sources)
       SELECT job.id, item.word, item.sources FROM job CROSS JOIN jsonb_to_recordset($8::jsonb) AS item(word text,sources jsonb)`,
      [id, requestKey, groupId, groups[0].name, JSON.stringify(payload), payloadHash, timestamp, JSON.stringify(words)],
    );
    const { rows } = await this.sql.query("SELECT id,payload_hash FROM video_study_jobs WHERE request_key=$1", [requestKey]);
    if (rows[0].payload_hash !== payloadHash) throw new VideoStudyError("该提交编号已用于其他内容，请重新创建批次", 409);
    return (await this.job(String(rows[0].id)))!;
  }

  async job(id: string): Promise<VideoStudyJob | null> {
    const { rows } = await this.sql.query("SELECT * FROM video_study_jobs WHERE id=$1", [id]);
    if (!rows[0]) return null;
    const row = rows[0];
    const items = await this.sql.query("SELECT word,status,error FROM video_study_job_items WHERE job_id=$1 ORDER BY word", [id]);
    return {
      id, kind: row.kind as VideoStudyJob["kind"], status: row.status as VideoStudyJob["status"],
      groupId: String(row.group_id), groupName: String(row.group_name), documentId: String(row.document_id ?? ""),
      error: String(row.error), updatedAt: String(row.updated_at),
      items: items.rows.map((item) => ({ word: String(item.word), status: item.status as ImportItem["status"], error: String(item.error) })),
    };
  }

  async retryImport(id: string): Promise<VideoStudyJob> {
    // A single statement prevents another worker claiming the job before failed items reset.
    await this.sql.query(
      `WITH job AS (
         UPDATE video_study_jobs SET status='queued',error='',worker_id='',lease_until='',updated_at=$2
         WHERE id=$1 AND kind='import' AND status IN ('failed','partial') RETURNING id
       ) UPDATE video_study_job_items SET status='waiting',error=''
       WHERE job_id IN (SELECT id FROM job) AND status='failed'`, [id, now()],
    );
    const job = await this.job(id);
    if (!job || job.kind !== "import") throw new VideoStudyError("收藏批次不存在", 404);
    return job;
  }

  async claim(workerId: string): Promise<ClaimedJob | null> {
    const timestamp = now();
    const { rows } = await this.sql.query(
      `UPDATE video_study_jobs SET status='running',worker_id=$1,lease_until=$3,updated_at=$2
       WHERE id=(SELECT id FROM video_study_jobs
         WHERE status='queued' OR (status='running' AND lease_until < $2)
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING id,kind,document_id,payload`,
      [workerId, timestamp, new Date(Date.now() + 120_000).toISOString()],
    );
    if (!rows[0]) return null;
    return { id: String(rows[0].id), kind: rows[0].kind as ClaimedJob["kind"], documentId: String(rows[0].document_id ?? ""), payload: rows[0].payload as Record<string, unknown>, workerId };
  }

  async renew(job: ClaimedJob) {
    const { rows } = await this.sql.query("UPDATE video_study_jobs SET lease_until=$3,updated_at=$4 WHERE id=$1 AND worker_id=$2 AND status='running' RETURNING id", [job.id, job.workerId, new Date(Date.now() + 120_000).toISOString(), now()]);
    if (!rows.length) throw new Error("任务已被其他工作进程接管");
  }

  async finish(job: ClaimedJob, status: VideoStudyJob["status"], error = "") {
    await this.sql.query("UPDATE video_study_jobs SET status=$3,error=$4,lease_until='',updated_at=$5 WHERE id=$1 AND worker_id=$2", [job.id, job.workerId, status, error, now()]);
  }

  async updateDocument(job: ClaimedJob, document: Partial<VideoStudyDocument>) {
    const { rows } = await this.sql.query("SELECT id FROM video_study_jobs WHERE id=$1 AND worker_id=$2 AND status='running'", [job.id, job.workerId]);
    if (!rows.length) throw new Error("任务归属已变更");
    const current = (await this.document(job.documentId))!;
    const next = { ...current, ...document };
    await this.sql.query(
      `UPDATE video_study_documents SET title=$2,channel=$3,duration=$4,url=$5,thumbnail=$6,status=$7,sentences=$8::jsonb,error=$9,updated_at=$10 WHERE id=$1
       AND EXISTS(SELECT 1 FROM video_study_jobs WHERE id=$11 AND worker_id=$12 AND status='running')`,
      [next.id, next.title, next.channel, next.duration, next.url ?? "", next.thumbnail ?? "", next.status, JSON.stringify(next.sentences), next.error ?? "", now(), job.id, job.workerId],
    );
  }

  async pendingItems(job: ClaimedJob): Promise<DraftWord[]> {
    await this.sql.query("UPDATE video_study_job_items SET status='waiting' WHERE job_id=$1 AND status='processing' AND EXISTS(SELECT 1 FROM video_study_jobs WHERE id=$1 AND worker_id=$2 AND status='running')", [job.id, job.workerId]);
    const { rows } = await this.sql.query("SELECT word,sources FROM video_study_job_items WHERE job_id=$1 AND status='waiting' ORDER BY word", [job.id]);
    return rows.map((row) => ({ word: String(row.word), sources: row.sources as WordSource[] }));
  }

  async updateItem(job: ClaimedJob, word: string, status: ImportItem["status"], error = "") {
    await this.sql.query(
      `UPDATE video_study_job_items SET status=$3,error=$4 WHERE job_id=$1 AND word=$2
       AND EXISTS(SELECT 1 FROM video_study_jobs WHERE id=$1 AND worker_id=$5 AND status='running')`,
      [job.id, word, status, error, job.workerId],
    );
  }

  async workerHeartbeat(id: string) {
    await this.sql.query("INSERT INTO video_study_workers(id,last_seen) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET last_seen=EXCLUDED.last_seen", [id, now()]);
  }

  async workerReady() {
    const { rows } = await this.sql.query("SELECT MAX(last_seen) AS last_seen FROM video_study_workers");
    return !!rows[0]?.last_seen && Date.now() - Date.parse(String(rows[0].last_seen)) < 60_000;
  }
}

export function validateImportWords(value: unknown): DraftWord[] {
  if (!Array.isArray(value) || !value.length || value.length > 30) throw new VideoStudyError("每批请选择 1–30 个单词");
  const result: DraftWord[] = [];
  for (const raw of value) {
    const word = normalizeStudyWord(typeof raw?.word === "string" ? raw.word : "");
    if (!word) throw new VideoStudyError("词汇中包含无效内容，请检查后重试");
    const sources: WordSource[] = [];
    if (Array.isArray(raw.sources)) for (const source of raw.sources.slice(0, 10)) {
      if (!source || typeof source.documentId !== "string" || typeof source.sentenceId !== "string") continue;
      sources.push({ documentId: source.documentId.slice(0, 100), sentenceId: source.sentenceId.slice(0, 100), title: "", time: "", english: "" });
    }
    const existing = result.find((item) => item.word === word);
    if (existing) existing.sources.push(...sources);
    else result.push({ word, sources });
  }
  return result.map((item) => ({ ...item, sources: item.sources.slice(0, 10) }));
}

export const videoStudyStore = new VideoStudyStore();
