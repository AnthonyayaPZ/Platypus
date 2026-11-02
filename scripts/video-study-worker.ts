import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pool } from "../db/index";
import { ensureDatabase } from "../db/runtime";
import { processVideoStudyJob } from "../lib/server/video-study-processing";
import { videoStudyStore as store } from "../lib/server/video-study-store";

const id = randomUUID();
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function loop(slot: number) {
  while (!stopping) {
    try {
      const job = await store.claim(`${id}:${slot}`);
      if (!job) { await delay(1000); continue; }
      const heartbeat = setInterval(() => { void store.renew(job).catch(() => console.error("Video-study task lease renewal failed")); }, 20_000);
      try { await processVideoStudyJob(store, job); }
      finally { clearInterval(heartbeat); }
    } catch {
      console.error("Video-study worker is waiting for database/service recovery");
      await delay(3000);
    }
  }
}

async function main() {
  await ensureDatabase();
  await store.workerHeartbeat(id);
  const heartbeat = setInterval(() => { void store.workerHeartbeat(id).catch(() => console.error("Video-study worker heartbeat failed")); }, 15_000);
  try {
    const concurrency = Math.max(1, Math.min(Number(process.env.VIDEO_STUDY_CONCURRENCY) || 2, 2));
    await Promise.all(Array.from({ length: concurrency }, (_, slot) => loop(slot)));
  } finally { clearInterval(heartbeat); await pool.end(); }
}

main().catch(() => { console.error("Video-study worker failed to start; check database migrations and environment configuration"); process.exitCode = 1; });
