import type { VideoStudyDocument } from "./video-study";

/** Upload bytes and server-side processing are deliberately separate phases. */
export function uploadSubtitleDocument(body: unknown, progress: (percent: number | null) => void): Promise<{ document: VideoStudyDocument }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/video-study/documents");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.timeout = 90_000;
    progress(0);
    xhr.upload.onprogress = (event) => progress(event.lengthComputable && event.total > 0 ? Math.min(100, Math.floor(event.loaded * 100 / event.total)) : null);
    xhr.upload.onload = () => progress(100);
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) { reject(new Error(result.error || `上传失败（${xhr.status}）`)); return; }
        if (!result.document?.id) throw new Error();
        resolve(result);
      } catch { reject(new Error("服务器返回了无效响应，请先检查学习记录确认是否已收到字幕")); }
    };
    const uncertain = () => reject(new Error("上传未确认，服务器可能已收到字幕；请先检查学习记录，再决定是否重传"));
    xhr.onerror = uncertain; xhr.ontimeout = uncertain; xhr.onabort = uncertain;
    xhr.send(JSON.stringify(body));
  });
}
