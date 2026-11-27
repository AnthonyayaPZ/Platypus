import { youtubeVideoId } from "../../../../lib/server/captions-client";
import { VideoStudyError } from "../../../../lib/server/sql";
import { readJsonBody, textField, videoStudyResponse } from "../../../../lib/server/video-study-http";
import { videoStudyStore } from "../../../../lib/server/video-study-store";
import { MAX_UPLOAD_SECONDS, MAX_SUBTITLE_BYTES, MAX_UPLOAD_JSON_BYTES } from "../../../../lib/video-study-limits";
import { cuesToSentences, parseSubtitleFile } from "../../../../lib/subtitles";

export async function POST(request: Request) {
  return videoStudyResponse(async () => {
    const body = await readJsonBody(request, MAX_UPLOAD_JSON_BYTES);
    if (body.source === "upload") {
      const subtitle = textField(body, "subtitle", MAX_SUBTITLE_BYTES);
      if (body.resegment !== undefined && typeof body.resegment !== "boolean") throw new VideoStudyError("重新分句选项必须为布尔值", 400);
      const resegment = body.resegment !== false;
      try { cuesToSentences(parseSubtitleFile(subtitle), MAX_UPLOAD_SECONDS, resegment); }
      catch (error) { throw new VideoStudyError(error instanceof Error ? error.message : "字幕格式无效", 400); }
      return { document: await videoStudyStore.enqueueDocument({ source: "upload", title: textField(body, "title", 200), subtitle, resegment }) };
    }
    const id = youtubeVideoId(textField(body, "videoId", 300));
    if (!id) throw new VideoStudyError("无效的 YouTube 视频 ID");
    return { document: await videoStudyStore.enqueueDocument({ source: "youtube", videoId: id }) };
  }, 202);
}
