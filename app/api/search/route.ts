import { DictionaryGenerationError } from "../../../lib/llm";
import { getOrGenerateDictionaryEntry } from "../../../lib/server/dictionary-service";
import { normalizeDictionaryTerm } from "../../../lib/terms";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = normalizeDictionaryTerm(params.get("q"));
  if (!query) {
    return Response.json({ error: "请输入英文单词或短语：最多8个词、96个字符，仅支持字母、空格、连字符和撇号；批量单词请使用批量导入" }, { status: 400 });
  }
  try {
    return Response.json(await getOrGenerateDictionaryEntry(query));
  } catch (error) {
    if (error instanceof DictionaryGenerationError && error.code === "configuration") {
      return Response.json({ error: "词典生成服务尚未配置完整" }, { status: 503 });
    }
    return Response.json({ error: "暂时无法生成这个词或短语的解释，请稍后重试" }, { status: 502 });
  }
}
