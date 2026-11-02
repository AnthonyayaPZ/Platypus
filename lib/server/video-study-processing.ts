import { saveWordToGroup } from "../../db/learning";
import { generationErrorMessage, translateSubtitleSentences } from "../llm";
import { cuesToSentences, parseSubtitleFile } from "../subtitles";
import type { SubtitleSentence, WordSource } from "../video-study";
import { fetchYouTubeCaptions } from "./captions-client";
import { getOrGenerateDictionaryEntry } from "./dictionary-service";
import { VideoStudyError } from "./sql";
import { VideoStudyStore, type ClaimedJob, type DocumentInput } from "./video-study-store";

export type ProcessingDependencies = {
  fetchCaptions: typeof fetchYouTubeCaptions;
  translate: (sentences: { id: string; english: string }[]) => Promise<Map<string, string>>;
  ensureWord: (word: string) => Promise<unknown>;
  saveWord: (word: string, groupId: string, sources: WordSource[]) => Promise<void>;
};

const defaults: ProcessingDependencies = { fetchCaptions: fetchYouTubeCaptions, translate: translateSubtitleSentences, ensureWord: getOrGenerateDictionaryEntry, saveWord: saveWordToGroup };
const errorText = (error: unknown) => error instanceof VideoStudyError ? error.message : generationErrorMessage(error);

async function processDocument(store: VideoStudyStore, job: ClaimedJob, deps: ProcessingDependencies) {
  let document = (await store.document(job.documentId))!;
  const input = job.payload as DocumentInput;
  if (!document.sentences.length) {
    await store.updateDocument(job, { status: "fetching", error: "" });
    const maximumSeconds = Math.max(60, Math.min(Number(process.env.VIDEO_STUDY_MAX_SECONDS) || 3600, 7200));
    if (input.source === "youtube") {
      const { video, cues } = await deps.fetchCaptions(input.videoId);
      document = { ...document, title: video.title, channel: video.channel, duration: video.duration, thumbnail: video.thumbnail, url: video.url, sentences: cuesToSentences(cues, maximumSeconds) };
    } else {
      document = { ...document, title: input.title, channel: "手动导入字幕", sentences: cuesToSentences(parseSubtitleFile(input.subtitle), maximumSeconds) };
    }
  }
  let sentences: SubtitleSentence[] = document.sentences.map((sentence) => sentence.chinese ? { ...sentence, translationStatus: "ready" } : { ...sentence, translationStatus: "pending", translationError: "" });
  await store.updateDocument(job, { ...document, status: "translating", sentences, error: "" });
  const pending = sentences.filter((sentence) => !sentence.chinese);
  for (let index = 0; index < pending.length; index += 10) {
    await store.renew(job);
    const chunk = pending.slice(index, index + 10);
    try {
      const translations = await deps.translate(chunk.map(({ id, english }) => ({ id, english })));
      if (chunk.some((sentence) => !translations.get(sentence.id))) throw new Error("Missing translations");
      sentences = sentences.map((sentence) => translations.has(sentence.id) ? { ...sentence, chinese: translations.get(sentence.id)!, translationStatus: "ready", translationError: "" } : sentence);
    } catch (error) {
      const ids = new Set(chunk.map((sentence) => sentence.id));
      sentences = sentences.map((sentence) => ids.has(sentence.id) ? { ...sentence, translationStatus: "failed", translationError: errorText(error) } : sentence);
    }
    await store.updateDocument(job, { sentences, status: "translating" });
  }
  const failed = sentences.filter((sentence) => !sentence.chinese).length;
  await store.updateDocument(job, { sentences, status: failed ? "partial" : "ready", error: failed ? `${failed} 句翻译失败，英文已保留，可重试翻译` : "" });
  await store.finish(job, failed ? "partial" : "completed");
}

async function processImport(store: VideoStudyStore, job: ClaimedJob, deps: ProcessingDependencies) {
  const groupId = String(job.payload.groupId);
  for (const item of await store.pendingItems(job)) {
    await store.renew(job);
    await store.updateItem(job, item.word, "processing");
    try {
      await deps.ensureWord(item.word);
      await store.renew(job);
      await deps.saveWord(item.word, groupId, item.sources);
      await store.updateItem(job, item.word, "success");
    } catch (error) {
      await store.updateItem(job, item.word, "failed", errorText(error));
    }
  }
  const result = (await store.job(job.id))!;
  const failed = result.items.filter((item) => item.status === "failed").length;
  await store.finish(job, failed === result.items.length ? "failed" : failed ? "partial" : "completed");
}

export async function processVideoStudyJob(store: VideoStudyStore, job: ClaimedJob, overrides: Partial<ProcessingDependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  try {
    if (job.kind === "document") await processDocument(store, job, deps);
    else await processImport(store, job, deps);
  } catch (error) {
    const message = error instanceof Error && job.kind === "document" && !(error instanceof VideoStudyError)
      ? (/字幕|分钟|SRT|VTT/.test(error.message) ? error.message : errorText(error)) : errorText(error);
    if (job.kind === "document") {
      const document = await store.document(job.documentId);
      await store.updateDocument(job, { status: document?.sentences.length ? "partial" : "failed", error: message });
    }
    await store.finish(job, "failed", message);
  }
}
