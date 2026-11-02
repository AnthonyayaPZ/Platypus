import { ensureDatabase } from "../../db/runtime";
import { VideoStudyError } from "./sql";

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new VideoStudyError("仅接受 JSON 请求", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new VideoStudyError("请求内容为空");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 750_000) { await reader.cancel(); throw new VideoStudyError("请求内容超过大小限制", 413); }
    chunks.push(value);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(data)); } catch { throw new VideoStudyError("无效的 JSON 请求"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new VideoStudyError("请求格式错误");
  return body as Record<string, unknown>;
}

export function textField(body: Record<string, unknown>, name: string, maximum: number) {
  const value = typeof body[name] === "string" ? body[name].trim() : "";
  if (!value || value.length > maximum) throw new VideoStudyError(`${name} 为空或超过长度限制`);
  return value;
}

export async function videoStudyResponse(action: () => Promise<unknown>, status = 200) {
  try {
    await ensureDatabase();
    return Response.json(await action(), { status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof VideoStudyError) return Response.json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    console.error("Video-study API operation failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "视频学习服务暂时不可用，请确认数据库迁移和后台任务服务已启动" }, { status: 503 });
  }
}
