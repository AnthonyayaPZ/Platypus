import { searchYouTube } from "../../../../lib/server/captions-client";
import { readJsonBody, textField, videoStudyResponse } from "../../../../lib/server/video-study-http";

export async function POST(request: Request) {
  return videoStudyResponse(async () => ({ candidates: await searchYouTube(textField(await readJsonBody(request), "query", 300)) }));
}
