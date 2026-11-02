import { videoStudyResponse } from "../../../../lib/server/video-study-http";
import { videoStudyStore } from "../../../../lib/server/video-study-store";

export async function GET() {
  return videoStudyResponse(async () => ({ documents: await videoStudyStore.history() }));
}
