import { VideoStudyError } from "../../../../lib/server/sql";
import { readJsonBody, textField, videoStudyResponse } from "../../../../lib/server/video-study-http";
import { validateImportWords, videoStudyStore } from "../../../../lib/server/video-study-store";

export async function POST(request: Request) {
  return videoStudyResponse(async () => {
    const body = await readJsonBody(request);
    const requestId = textField(body, "requestId", 80);
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) throw new VideoStudyError("无效的批次提交编号");
    return { job: await videoStudyStore.enqueueImport(requestId, textField(body, "groupId", 100), validateImportWords(body.words)) };
  }, 202);
}
