import { VideoStudyError } from "../../../../../lib/server/sql";
import { videoStudyResponse } from "../../../../../lib/server/video-study-http";
import { videoStudyStore } from "../../../../../lib/server/video-study-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return videoStudyResponse(async () => {
    const job = await videoStudyStore.job((await context.params).id);
    if (!job || job.kind !== "import") throw new VideoStudyError("收藏批次不存在", 404);
    return { job };
  });
}
