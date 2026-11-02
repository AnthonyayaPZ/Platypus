import { youtubeVideoId } from "../../../../lib/server/captions-client";
import { VideoStudyError } from "../../../../lib/server/sql";
import { readJsonBody, textField, videoStudyResponse } from "../../../../lib/server/video-study-http";
import { videoStudyStore } from "../../../../lib/server/video-study-store";

export async function POST(request: Request) {
  return videoStudyResponse(async () => {
    const body = await readJsonBody(request);
    if (body.source === "upload") {
      return { document: await videoStudyStore.enqueueDocument({ source: "upload", title: textField(body, "title", 200), subtitle: textField(body, "subtitle", 500_000) }) };
    }
    const id = youtubeVideoId(textField(body, "videoId", 300));
    if (!id) throw new VideoStudyError("无效的 YouTube 视频 ID");
    return { document: await videoStudyStore.enqueueDocument({ source: "youtube", videoId: id }) };
  }, 202);
}
