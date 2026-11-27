import { subtitlePercent, subtitleStageLabels, type SubtitleProgress } from "../../lib/video-study-progress";

export default function SubtitleProgressCard({ progress, upload }: { progress?: SubtitleProgress; upload?: number | null }) {
  if (upload === undefined && !progress) return null;
  const uploading = upload !== undefined;
  const percent = uploading ? upload : subtitlePercent(progress!);
  const label = uploading ? (upload === 100 ? "上传已发送，等待服务器校验" : "正在上传字幕文件") : subtitleStageLabels[progress!.stage];
  const translating = !uploading && ["translating", "partial", "ready"].includes(progress!.stage);
  return <section className="video-task-progress" role="status" aria-live="polite" aria-atomic="true" title={progress?.updatedAt ? `最近更新：${progress.updatedAt}` : undefined}>
    <div><b>{label}</b>{percent !== null && <span>{percent}%</span>}</div>
    {(uploading || progress?.stage !== "failed") && <progress aria-label={uploading ? "字幕上传进度" : "字幕处理进度"} max={100} value={percent ?? undefined}/>}
    {translating && <small>已处理 {progress!.processed} / {progress!.total} 段 · 成功 {progress!.succeeded} · 失败 {progress!.failed}</small>}
    {!uploading && !["ready", "partial", "failed"].includes(progress!.stage) && <small>可以先阅读；离开页面后后台仍会继续处理。</small>}
    {!uploading && progress!.stage === "partial" && <small>英文已保留，可重试未完成的翻译。</small>}
  </section>;
}
