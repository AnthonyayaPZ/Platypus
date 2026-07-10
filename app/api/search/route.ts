import { dictionary } from "../../../lib/dictionary";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!query) return Response.json({ error: "请输入要检索的单词" }, { status: 400 });
  const entry = dictionary.find((item) => item.word === query) ?? dictionary.find((item) => item.word.includes(query));
  if (!entry) return Response.json({ error: "Demo 词库暂未收录这个单词" }, { status: 404 });
  return Response.json({ entry, source: "demo-dictionary" });
}
