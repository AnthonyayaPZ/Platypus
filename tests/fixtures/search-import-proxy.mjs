// UI-only fixture. All API routes are intercepted; never forwards database or
// LLM calls. Run the production frontend on 127.0.0.1:3101 first.
import { createServer, request } from "node:http";
const jobs = new Map();
const groups = [{ id: "default", name: "默认收藏", is_default: 1, word_count: 0, due_count: 0 }];
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3102");
  const json = (data, code = 200) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/state") return json({ groups, savedWords: [], wordMeta: [] });
    if (url.pathname === "/api/search") return json({ entry: { word: url.searchParams.get("q"), phonetic: "/test/", part: "n.", meaning: "测试释义", summary: "界面测试，不访问真实词库。", example: "This is a test.", exampleZh: "这是测试。", synonyms: [], antonyms: [], relations: [] } });
    if (url.pathname === "/api/video-study/imports" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      if (!jobs.has(input.requestId)) jobs.set(input.requestId, { id: input.requestId, kind: "import", status: "queued", groupId: input.groupId, groupName: "默认收藏", items: input.words.map(({ word }) => ({ word, status: "waiting", error: "" })), created: Date.now() });
      return json({ job: jobs.get(input.requestId) }, 202);
    }
    const path = url.pathname.match(/^\/api\/video-study\/imports\/([^/]+)(\/retry)?$/);
    if (path) {
      const job = jobs.get(path[1]); if (!job) return json({ error: "批次不存在" }, 404);
      if (path[2] && req.method === "POST") { job.status = "completed"; job.items = job.items.map((item) => ({ ...item, status: "success", error: "" })); }
      else if (job.status === "queued" && Date.now() - job.created > 2500) { job.status = "partial"; job.items = job.items.map((item, index) => ({ ...item, status: index ? "failed" : "success", error: index ? "测试失败项，可重试" : "" })); }
      return json({ job });
    }
    return json({ error: "UI fixture blocks all other APIs" }, 404);
  }
  const upstream = request({ hostname: "localhost", port: 3101, method: req.method, path: req.url, headers: req.headers }, (response) => { res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res); });
  upstream.on("error", () => { res.writeHead(502); res.end("Start the frontend on port 3101 first"); });
  req.pipe(upstream);
}).listen(3102, "127.0.0.1", () => console.log("Isolated search UI fixture: http://127.0.0.1:3102 (no real API writes)"));
