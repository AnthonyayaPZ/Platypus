import { saveWordToGroup } from "../../db/learning";
import { DictionaryGenerationError, generationErrorMessage, refineSubtitleReadingCuts, translateSubtitleSentences, type SubtitleTranslationInput } from "../llm";
import { cuesToSentences, parseSubtitleFile } from "../subtitles";
import { originalSentenceFor, readingRefinementRequests, segmentSubtitlesForReading } from "../subtitle-segmentation";
import type { SubtitleSentence, WordSource } from "../video-study";
import { fetchYouTubeCaptions } from "./captions-client";
import { getOrGenerateDictionaryEntries } from "./dictionary-service";
import { VideoStudyError } from "./sql";
import { VideoStudyStore, type ClaimedJob, type DocumentInput } from "./video-study-store";

export type ProcessingDependencies = {
  fetchCaptions: typeof fetchYouTubeCaptions;
  translate: (sentences: SubtitleTranslationInput[]) => Promise<Map<string, string>>;
  refineCuts: typeof refineSubtitleReadingCuts;
  ensureWords: (words: string[]) => Promise<Map<string, string | null>>;
  saveWord: (word: string, groupId: string, sources: WordSource[]) => Promise<void>;
};

const defaults: ProcessingDependencies = { fetchCaptions: fetchYouTubeCaptions, translate: translateSubtitleSentences, refineCuts: refineSubtitleReadingCuts, ensureWords: getOrGenerateDictionaryEntries, saveWord: saveWordToGroup };
const errorText = (error: unknown) => error instanceof VideoStudyError ? error.message : generationErrorMessage(error);

async function processDocument(store: VideoStudyStore, job: ClaimedJob, deps: ProcessingDependencies) {
  let document = (await store.document(job.documentId))!;
  const input = job.payload as DocumentInput | { source: "stored" };
  if (!document.sentences.length) {
    await store.updateDocument(job, { status: "fetching", error: "" });
    const maximumSeconds = Math.max(60, Math.min(Number(process.env.VIDEO_STUDY_MAX_SECONDS) || 3600, 7200));
    if (input.source === "youtube") {
      const { video, cues } = await deps.fetchCaptions(input.videoId);
      document = { ...document, title: video.title, channel: video.channel, duration: video.duration, thumbnail: video.thumbnail, url: video.url, sentences: cuesToSentences(cues, maximumSeconds) };
    } else if (input.source === "upload") {
      document = { ...document, title: input.title, channel: "手动导入字幕", sentences: cuesToSentences(parseSubtitleFile(input.subtitle), maximumSeconds) };
    } else throw new VideoStudyError("没有已保存的字幕，请重新选择视频或导入字幕", 422);
  }
  // Validate size before making model requests. Only uncertain cuts need help;
  // clear punctuation/clause boundaries are resolved locally without an LLM.
  segmentSubtitlesForReading(document.sentences);
  const refinement = readingRefinementRequests(document.sentences);
  const refinedCuts = new Map<string, number[]>();
  let refinementFailures = 0;
  for (let index = 0; index < refinement.length; index += 10) {
    await store.renew(job);
    const batches = [refinement.slice(index, index + 5), refinement.slice(index + 5, index + 10)].filter((batch) => batch.length);
    const results = await Promise.allSettled(batches.map((batch) => deps.refineCuts(batch)));
    let stop = false;
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const [id, cuts] of result.value) refinedCuts.set(id, cuts);
        refinementFailures = 0;
      } else {
        console.warn("Subtitle cut refinement unavailable; using rule boundaries");
        refinementFailures++;
        // At most two in-flight requests; do not repeat a timeout for every
        // paragraph if the provider is unavailable.
        if (!(result.reason instanceof DictionaryGenerationError) || result.reason.code !== "invalid-response" || refinementFailures >= 2) stop = true;
      }
    }
    if (stop) break;
  }
  let sentences: SubtitleSentence[] = segmentSubtitlesForReading(document.sentences, refinedCuts).map((sentence) => sentence.chinese ? { ...sentence, translationStatus: "ready" } : { ...sentence, translationStatus: "pending", translationError: "" });
  await store.updateDocument(job, { ...document, status: "translating", sentences, error: "" });
  const pending = sentences.filter((sentence) => !sentence.chinese);
  const translationBatchSize = pending.some((sentence) => sentence.readingVersion) ? 20 : 10;
  for (let index = 0; index < pending.length; index += translationBatchSize) {
    await store.renew(job);
    const chunk = pending.slice(index, index + translationBatchSize);
    try {
      const translations = await deps.translate(chunk.map((sentence) => {
        const index = sentences.findIndex((item) => item.id === sentence.id);
        return { id: sentence.id, english: sentence.english, context: originalSentenceFor(sentence, sentences).english,
          ...(index > 0 ? { previousEnglish: sentences[index - 1].english } : {}),
          ...(index + 1 < sentences.length ? { nextEnglish: sentences[index + 1].english } : {}) };
      }));
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
  const items = await store.pendingItems(job);
  await store.renew(job);
  for (const item of items) await store.updateItem(job, item.word, "processing");
  let prepared: Map<string, string | null>;
  try { prepared = items.length ? await deps.ensureWords(items.map((item) => item.word)) : new Map(); }
  catch (error) { prepared = new Map(items.map((item) => [item.word, errorText(error)])); }
  for (const item of items) {
    await store.renew(job);
    const preparationError = prepared.get(item.word);
    if (!prepared.has(item.word) || preparationError !== null) {
      await store.updateItem(job, item.word, "failed", preparationError || "LLM 未返回该单词的完整词义，请重试");
      continue;
    }
    try {
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
