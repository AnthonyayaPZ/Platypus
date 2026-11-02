import type { CaptionCue } from "../subtitles";
import type { VideoCandidate } from "../video-study";
import { VideoStudyError } from "./sql";

export function youtubeVideoId(value: string): string | null {
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  if (!/^https?:\/\//i.test(value)) return null;
  let url: URL;
  try { url = new URL(value); } catch { throw new VideoStudyError("请输入有效的 YouTube 视频链接"); }
  if (url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new VideoStudyError("请输入有效的 YouTube 视频链接");
  let id = "";
  if (url.hostname === "youtu.be") id = url.pathname.split("/")[1] ?? "";
  else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) {
    id = url.pathname === "/watch" ? url.searchParams.get("v") ?? "" : /^\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[2] ?? "";
  } else throw new VideoStudyError("仅支持 YouTube 视频链接");
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new VideoStudyError("链接中没有有效的视频 ID");
  return id;
}

async function captionRequest(path: string, body: unknown, timeout: number): Promise<Record<string, unknown>> {
  const base = process.env.CAPTIONS_SERVICE_URL;
  const token = process.env.CAPTIONS_SERVICE_TOKEN;
  if (!base || !token || token.length < 24 || token.startsWith("CHANGE_ME")) throw new VideoStudyError("字幕服务未配置，请设置 CAPTIONS_SERVICE_URL 和 CAPTIONS_SERVICE_TOKEN", 503);
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-caption-token": token }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  } catch { throw new VideoStudyError("无法连接字幕服务，请检查服务状态和服务器网络", 503); }
  const text = await response.text();
  if (text.length > 4_000_000) throw new VideoStudyError("字幕服务返回内容过大", 502);
  let result: Record<string, unknown>;
  try { result = JSON.parse(text); } catch { throw new VideoStudyError("字幕服务返回了无效响应", 502); }
  if (!response.ok) throw new VideoStudyError(typeof result.error === "string" ? result.error : "字幕获取失败", response.status >= 500 ? 502 : response.status);
  return result;
}

export async function searchYouTube(query: string): Promise<VideoCandidate[]> {
  youtubeVideoId(query); // Reject non-YouTube URLs before calling the internal service.
  const result = await captionRequest("/search", { query }, 40_000);
  if (!Array.isArray(result.candidates)) throw new VideoStudyError("视频搜索返回格式异常", 502);
  return result.candidates.filter((item): item is VideoCandidate => !!item && typeof item === "object" && /^[A-Za-z0-9_-]{11}$/.test(item.id) && typeof item.title === "string").slice(0, 5);
}

export async function fetchYouTubeCaptions(videoId: string): Promise<{ video: VideoCandidate; cues: CaptionCue[] }> {
  const result = await captionRequest("/captions", { videoId }, 115_000);
  if (!result.video || typeof result.video !== "object" || !Array.isArray(result.cues)) throw new VideoStudyError("字幕服务返回格式异常", 502);
  return { video: result.video as VideoCandidate, cues: result.cues as CaptionCue[] };
}
