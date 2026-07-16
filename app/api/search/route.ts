import { saveDictionaryEntry, searchDictionary } from "../../../db/runtime";
import { DictionaryGenerationError, generateDictionaryEntry } from "../../../lib/llm";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!query) return Response.json({ error: "请输入要检索的单词" }, { status: 400 });
  if (!/^[a-z][a-z'-]{0,47}$/.test(query)) {
    return Response.json({ error: "请输入单个英文单词，仅支持字母、连字符和撇号" }, { status: 400 });
  }
  const cached = await searchDictionary(query);
  if (cached) return Response.json({ ...cached, source: "server-dictionary" });
  try {
    const entry = await generateDictionaryEntry(query);
    await saveDictionaryEntry(entry);
    const saved = await searchDictionary(query);
    return Response.json({ ...(saved ?? { entry, meta: null }), source: "llm-generated" });
  } catch (error) {
    if (error instanceof DictionaryGenerationError && error.code === "configuration") {
      return Response.json({ error: "词典生成服务尚未配置完整" }, { status: 503 });
    }
    return Response.json({ error: "暂时无法生成这个单词的解释，请稍后重试" }, { status: 502 });
  }
}
