import sample from "../shared/video-study-demo.json" with { type: "json" };
import type { VideoStudyDocument } from "./video-study";

export const exampleDocuments: VideoStudyDocument[] = sample.documents.map((document) => ({
  ...document, channel: "内置文章", status: "ready",
  sentences: document.sentences.map((sentence) => ({ ...sentence, translationStatus: "ready" })),
}));
