import { videoStudyResponse } from "../../../../../../lib/server/video-study-http";
import { videoStudyStore } from "../../../../../../lib/server/video-study-store";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return videoStudyResponse(async () => ({ document: await videoStudyStore.retryDocument((await context.params).id) }), 202);
}
