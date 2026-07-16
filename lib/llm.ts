import { env } from "cloudflare:workers";
import type { WordEntry } from "./dictionary";
import type { RelationDetail } from "./relations";

type GenerationErrorCode = "configuration" | "upstream" | "invalid-response";

export class DictionaryGenerationError extends Error {
  constructor(public readonly code: GenerationErrorCode) {
    super(code);
    this.name = "DictionaryGenerationError";
  }
}

type ChatCompletion = {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
};

function runtimeValue(...keys: string[]) {
  const runtime = env as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = runtime[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function completionEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function messageText(content: string | Array<{ text?: string }> | undefined) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item.text ?? "").join("");
  return "";
}

function jsonFromText(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new DictionaryGenerationError("invalid-response");
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new DictionaryGenerationError("invalid-response");
  }
}

function requiredText(value: unknown, maximum: number) {
  if (typeof value !== "string") throw new DictionaryGenerationError("invalid-response");
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new DictionaryGenerationError("invalid-response");
  return normalized;
}

function normalizePart(value: unknown) {
  const part = requiredText(value, 40);
  const normalized = part.toLowerCase().replace(/\.$/, "");
  const abbreviations: Record<string, string> = {
    adjective: "adj.", adj: "adj.", noun: "n.", n: "n.", verb: "v.", v: "v.",
    adverb: "adv.", adv: "adv.", preposition: "prep.", prep: "prep.",
    conjunction: "conj.", conj: "conj.", pronoun: "pron.", pron: "pron.",
    interjection: "interj.", interj: "interj.",
  };
  return abbreviations[normalized] ?? part;
}

function normalizeRelation(value: unknown): RelationDetail {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DictionaryGenerationError("invalid-response");
  }
  const relation = value as Record<string, unknown>;
  const word = requiredText(relation.word, 48).toLowerCase();
  const type = relation.type;
  if (!/^[a-z][a-z'-]*$/.test(word) || (type !== "synonym" && type !== "antonym")) {
    throw new DictionaryGenerationError("invalid-response");
  }
  return {
    word,
    type,
    comparison: requiredText(relation.comparison, 500),
    usage: requiredText(relation.usage, 500),
  };
}

function normalizeEntry(payload: Record<string, unknown>, requestedWord: string): WordEntry {
  const word = requiredText(payload.word, 48).toLowerCase();
  if (word !== requestedWord) throw new DictionaryGenerationError("invalid-response");
  if (!Array.isArray(payload.relations) || payload.relations.length !== 4) {
    throw new DictionaryGenerationError("invalid-response");
  }
  const relations = payload.relations.map(normalizeRelation);
  const synonyms = relations.filter((relation) => relation.type === "synonym");
  const antonyms = relations.filter((relation) => relation.type === "antonym");
  if (synonyms.length !== 2 || antonyms.length !== 2
    || new Set(relations.map((relation) => relation.word)).size !== 4
    || relations.some((relation) => relation.word === word)) {
    throw new DictionaryGenerationError("invalid-response");
  }
  return {
    word,
    phonetic: requiredText(payload.phonetic, 100),
    part: normalizePart(payload.part),
    meaning: requiredText(payload.meaning, 300),
    summary: requiredText(payload.summary, 600),
    example: requiredText(payload.example, 500),
    exampleZh: requiredText(payload.exampleZh, 500),
    synonyms: [synonyms[0].word, synonyms[1].word],
    antonyms: [antonyms[0].word, antonyms[1].word],
    relations,
  };
}

export async function generateDictionaryEntry(word: string): Promise<WordEntry> {
  const apiKey = runtimeValue("API-KEY", "API_KEY");
  const baseUrl = runtimeValue("BASE_URL");
  const model = runtimeValue("MODEL_NAME");
  if (!apiKey || !baseUrl || !model) throw new DictionaryGenerationError("configuration");

  let response: Response;
  try {
    response = await fetch(completionEndpoint(baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "你是严谨的英汉词典编辑。只返回一个 JSON 对象，不要 Markdown、代码块或额外说明。释义、比较和使用场景使用简体中文；英文例句自然准确。",
          },
          {
            role: "user",
            content: `为英文单词 ${JSON.stringify(word)} 生成词典条目。JSON 必须包含 word、phonetic、part、meaning、summary、example、exampleZh、relations，其中 part 使用 adj.、n.、v.、adv. 等词性缩写。relations 必须恰好四项：两个 synonym 和两个 antonym；每项包含英文小写 word、type、中文 comparison、中文 usage。comparison 需要说明与目标词的共同点和细微差异，usage 需要说明各自适用场景。`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new DictionaryGenerationError("upstream");
  }
  if (!response.ok) throw new DictionaryGenerationError("upstream");

  let completion: ChatCompletion;
  try {
    completion = await response.json() as ChatCompletion;
  } catch {
    throw new DictionaryGenerationError("invalid-response");
  }
  const content = messageText(completion.choices?.[0]?.message?.content);
  return normalizeEntry(jsonFromText(content), word);
}
