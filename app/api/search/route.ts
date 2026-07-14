import { searchDictionary } from "../../../db/runtime";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!query) return Response.json({ error: "请输入要检索的单词" }, { status: 400 });
  const result = await searchDictionary(query);
  if (!result) return Response.json({ error: "Demo 词库暂未收录这个单词" }, { status: 404 });
  return Response.json({ ...result, source: "server-dictionary" });
}
