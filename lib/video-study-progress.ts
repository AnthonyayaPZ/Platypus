import type { SubtitleSentence, VideoStudyDocument } from "./video-study";

export type SubtitleStage = "queued" | "fetching" | "parsing" | "segmenting" | "translating" | "ready" | "partial" | "failed";
export type SubtitleProgress = { stage: SubtitleStage; total: number; processed: number; succeeded: number; failed: number; updatedAt: string };
export type SubtitleProgressResponse = { id: string; status: VideoStudyDocument["status"]; progress: SubtitleProgress; error: string; updatedAt: string };
export const subtitleStageLabels: Record<SubtitleStage, string> = { queued: "任务已提交，等待后台处理", fetching: "正在获取英文字幕", parsing: "正在解析字幕文件", segmenting: "正在切分阅读段落", translating: "正在翻译字幕", ready: "翻译完成", partial: "处理结束，部分翻译未完成", failed: "字幕处理失败" };

export function makeSubtitleProgress(stage: SubtitleStage, sentences: SubtitleSentence[], updatedAt = new Date().toISOString()): SubtitleProgress {
  let succeeded = 0, failed = 0;
  for (const sentence of sentences) {
    if (sentence.chinese?.trim()) succeeded++;
    else if (sentence.translationStatus === "failed") failed++;
  }
  return { stage, total: sentences.length, processed: succeeded + failed, succeeded, failed, updatedAt };
}

export function subtitlePercent(progress: SubtitleProgress): number | null {
  if (!["translating", "ready", "partial"].includes(progress.stage) || progress.total <= 0) return null;
  return Math.max(0, Math.min(100, Math.floor(progress.processed * 100 / progress.total)));
}

export function needsSubtitleSnapshot(revision: string, metadata: SubtitleProgressResponse | null, elapsedMs: number) {
  return !revision || !metadata || metadata.updatedAt !== revision && (["ready", "partial", "failed"].includes(metadata.status ?? "") || elapsedMs >= 10_000);
}
