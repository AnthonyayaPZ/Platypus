// Dry-run by default. Run --apply only after backing up the database.
import { pool } from "../../db/index";
import { needsReadingSegmentation } from "../../lib/subtitle-segmentation";
import { videoStudyStore as store } from "../../lib/server/video-study-store";
import type { SubtitleSentence } from "../../lib/video-study";

try {
  const apply = process.argv.includes("--apply");
  let eligible = 0;
  let queued = 0;
  const { rows } = await pool.query("SELECT id,sentences FROM video_study_documents ORDER BY id");
  for (const item of rows) {
    if (!needsReadingSegmentation(item.sentences as SubtitleSentence[])) continue;
    eligible++;
    if (apply && (await store.queueReadingUpgrade(item.id)).queued) queued++;
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", eligible, queued }));
} finally { await pool.end(); }
