import { videoStudyResponse } from "../../../../../../lib/server/video-study-http";
import { videoStudyStore } from "../../../../../../lib/server/video-study-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return videoStudyResponse(async () => videoStudyStore.documentProgress((await context.params).id));
}
