import { VideoStudyError } from "../../../../../lib/server/sql";
import { videoStudyResponse } from "../../../../../lib/server/video-study-http";
import { videoStudyStore } from "../../../../../lib/server/video-study-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return videoStudyResponse(async () => {
    const { id } = await context.params;
    const document = await videoStudyStore.document(id);
    if (!document) throw new VideoStudyError("字幕文档不存在", 404);
    return { document };
  });
}
