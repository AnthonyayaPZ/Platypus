import { DEMO_USER_ID } from "../../../../db/runtime";
import { pool } from "../../../../db/index";
import { videoStudyStore } from "../../../../lib/server/video-study-store";
import { videoStudyResponse } from "../../../../lib/server/video-study-http";

export async function GET() {
  return videoStudyResponse(async () => ({ workerReady: await videoStudyStore.workerReady(), captionsConfigured: !!process.env.CAPTIONS_SERVICE_URL && (process.env.CAPTIONS_SERVICE_TOKEN?.length ?? 0) >= 24 && !process.env.CAPTIONS_SERVICE_TOKEN?.startsWith("CHANGE_ME"), groups: (await pool.query("SELECT id,name,color,is_default FROM word_groups WHERE user_id=$1 ORDER BY is_default DESC,created_at ASC", [DEMO_USER_ID])).rows }));
}
