"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addDraftWord, normalizeStudyWord, renameDraftWord, restoreDraft, tokenizeSubtitle,
  type DraftWord, type VideoCandidate, type VideoStudyDocument, type VideoStudyJob } from "../../lib/video-study";
import { exampleDocuments } from "../../lib/video-study-examples";
import { historyItem, mergeStudyHistory, type StudyHistoryItem } from "../../lib/video-study-history";
import VideoStudySheet, { StudyActionIcon } from "./VideoStudySheet";
import { MAX_SUBTITLE_BYTES } from "../../lib/video-study-limits";

type Group = { id: string; name: string };
type PendingImport = { requestId: string; groupId: string; words: DraftWord[] };
type Saved = { draft: DraftWord[]; documentId: string; jobId: string; acknowledged: string[]; pending: PendingImport | null; examplesMigrated?: boolean };
const key = "platypus.video-study.live.v1";
const historyKey = "platypus.video-study.history.v1";
const articleKey = "platypus.video-study.article.";
const emptySaved: Saved = { draft: [], documentId: "", jobId: "", acknowledged: [], pending: null };
const jobActive = (job: VideoStudyJob | null) => !!job && ["queued", "running"].includes(job.status);
const documentActive = (document: VideoStudyDocument | null) => !!document && ["queued", "fetching", "translating"].includes(document.status ?? "");
const states = { waiting: "等待中", processing: "生成词条中…", success: "已收藏", failed: "处理失败" };
class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/video-study/${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new RequestError(typeof data.error === "string" ? data.error : `服务暂不可用（${response.status}）`, response.status);
  return data as T;
}

export default function VideoStudyLive({ initialGroups = [], onImported }: { initialGroups?: Group[]; onImported?: () => void }) {
  const [saved, setSaved] = useState<Saved>(emptySaved);
  const [restored, setRestored] = useState(false);
  const [document, setDocument] = useState<VideoStudyDocument | null>(exampleDocuments[0]);
  const [history, setHistory] = useState<StudyHistoryItem[]>(exampleDocuments.map((document) => historyItem(document)));
  const [panel, setPanel] = useState<"search" | "history" | "">("");
  const [historyError, setHistoryError] = useState("");
  const [documentVersion, setDocumentVersion] = useState(0);
  const [job, setJob] = useState<VideoStudyJob | null>(null);
  const [groups, setGroups] = useState(initialGroups);
  const [groupId, setGroupId] = useState("");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<VideoCandidate[] | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [health, setHealth] = useState("正在连接服务…");
  const [drawer, setDrawer] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [pageChoice, setPageChoice] = useState({ key: "", page: 0 });
  const [manualWord, setManualWord] = useState("");
  const [editing, setEditing] = useState("");
  const [editValue, setEditValue] = useState("");
  const [upload, setUpload] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const submitting = useRef(false);
  const importedCallback = useRef(onImported);
  useEffect(() => { importedCallback.current = onImported; }, [onImported]);
  const change = useCallback((fn: (value: Saved) => Saved) => setSaved((value) => {
    const next = fn(value);
    // Persist job identity and acknowledged successes together with the remaining draft.
    try { window.localStorage.setItem(key, JSON.stringify(next)); }
    catch { window.setTimeout(() => setMessage("本机存储不可用，本次可以继续，但关闭页面后草稿和进度入口可能无法恢复。"), 0); }
    return next;
  }), []);
  const rememberDocument = useCallback((document: VideoStudyDocument, opened = false) => {
    setHistory((current) => {
      const next = mergeStudyHistory(current, [historyItem(document, opened ? new Date().toISOString() : undefined)]);
      try { window.localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* Reading still works without browser persistence. */ }
      return next;
    });
    if (!document.id.startsWith("demo-")) try { window.localStorage.setItem(articleKey + document.id, JSON.stringify(document)); } catch { /* Server retains the full article even when local cache is full. */ }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const data = await api<{ documents: StudyHistoryItem[] }>("history");
      setHistory((current) => {
        const next = mergeStudyHistory(current, data.documents);
        try { window.localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* Server history remains available. */ }
        return next;
      });
      setHistoryError("");
    } catch { setHistoryError("暂时无法同步云端记录，仍可打开本机保存的文章。"); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const value = JSON.parse(window.localStorage.getItem(key) || "null");
        const restored: Saved = { ...emptySaved, ...value, documentId: value?.documentId || exampleDocuments[0].id,
          draft: restoreDraft(JSON.stringify(value?.draft)), acknowledged: Array.isArray(value?.acknowledged) ? value.acknowledged : [] };
        if (!restored.examplesMigrated) {
          for (const item of restoreDraft(window.localStorage.getItem("platypus.video-study.demo.draft.v1"))) {
            restored.draft = addDraftWord(restored.draft, item.word);
            for (const source of item.sources) restored.draft = addDraftWord(restored.draft, item.word, source);
          }
          restored.examplesMigrated = true;
        }
        setSaved(restored);
        window.localStorage.setItem(key, JSON.stringify(restored));
        const entries = JSON.parse(window.localStorage.getItem(historyKey) || "[]");
        if (Array.isArray(entries)) setHistory(mergeStudyHistory(exampleDocuments.map((document) => historyItem(document)), entries));
        const cached = exampleDocuments.find((document) => document.id === restored.documentId) || JSON.parse(window.localStorage.getItem(articleKey + restored.documentId) || "null");
        if (cached?.id === restored.documentId && Array.isArray(cached.sentences)) setDocument(cached);
      } catch { setMessage("无法恢复本机草稿，请检查浏览器存储权限。"); }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => void refreshHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [restored, refreshHistory]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const value = await api<{ groups: Group[]; workerReady: boolean; captionsConfigured: boolean }>("status");
        if (cancelled) return;
        setGroups(value.groups);
        setHealth(!value.workerReady ? "后台处理服务尚未就绪；任务会保留在队列中，请启动 video-worker。" : !value.captionsConfigured ? "字幕下载服务未配置，可先导入 SRT / VTT 字幕。" : "后台服务已连接 · 选词不会自动调用 LLM");
      } catch (error) { if (!cancelled) setHealth((error as Error).message); }
    };
    void check();
    const timer = window.setInterval(() => void check(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!restored || !saved.documentId || saved.documentId.startsWith("demo-")) return;
    let cancelled = false;
    let timer: number;
    const poll = async () => {
      try {
        const data = await api<{ document: VideoStudyDocument }>(`documents/${encodeURIComponent(saved.documentId)}`);
        if (cancelled) return;
        setDocument(data.document);
        rememberDocument(data.document);
        if (documentActive(data.document)) timer = window.setTimeout(() => void poll(), data.document.sentences.length > 600 ? 10_000 : 1800);
      } catch (error) {
        if (!cancelled) { setHealth(`${(error as Error).message}，联网后会恢复字幕同步。`); timer = window.setTimeout(() => void poll(), 8000); }
      }
    };
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [restored, saved.documentId, rememberDocument, documentVersion]);

  const acceptJob = useCallback((next: VideoStudyJob) => {
    setJob(next);
    change((current) => {
      if (current.jobId !== next.id) return current;
      const successes = next.items.filter((item) => item.status === "success" && !current.acknowledged.includes(item.word)).map((item) => item.word);
      return { ...current, draft: current.draft.filter((item) => !successes.includes(item.word)), acknowledged: [...current.acknowledged, ...successes] };
    });
  }, [change]);

  useEffect(() => {
    if (!restored || !saved.jobId) return;
    let cancelled = false;
    let timer: number;
    const poll = async () => {
      try {
        const data = await api<{ job: VideoStudyJob }>(`imports/${encodeURIComponent(saved.jobId)}`);
        if (cancelled) return;
        acceptJob(data.job);
        if (jobActive(data.job)) timer = window.setTimeout(() => void poll(), 1800);
        else if (data.job.items.some((item) => item.status === "success")) importedCallback.current?.();
      } catch (error) {
        if (!cancelled) { setMessage(`${(error as Error).message}，收藏任务仍在服务器继续，可稍后回来查看。`); timer = window.setTimeout(() => void poll(), 8000); }
      }
    };
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [restored, saved.jobId, acceptJob]);

  useEffect(() => {
    if (!restored || !saved.pending) return;
    const pending = saved.pending;
    let cancelled = false;
    let timer: number;
    const send = async () => {
      try {
        const data = await api<{ job: VideoStudyJob }>("imports", pending);
        if (cancelled) return;
        change((current) => ({ ...current, pending: null, jobId: data.job.id, acknowledged: [] }));
        setJob(data.job);
        setMessage("收藏任务已提交，关闭页面也会继续处理。");
      } catch (error) {
        if (!cancelled) {
          if (error instanceof RequestError && error.status >= 400 && error.status < 500) {
            change((current) => ({ ...current, pending: null })); setMessage(`${error.message}。草稿已保留，请修改后再提交。`);
          } else { setMessage(`${(error as Error).message}。草稿已保留，正在使用同一批次编号重连，避免重复提交。`); timer = window.setTimeout(() => void send(), 8000); }
        }
      }
    };
    void send();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [restored, saved.pending, change]);

  const running = !!saved.pending || jobActive(job) || (!!saved.jobId && !job);
  const target = groups.find((group) => group.id === groupId) ?? groups[0];
  const selected = new Set(saved.draft.map((item) => item.word));
  const sentences = (document?.sentences ?? []).filter((sentence) => !selectedOnly || tokenizeSubtitle(sentence.english).some((token) => token.word && selected.has(token.word)));
  const readingKey = `${document?.id}:${selectedOnly}`;
  const pageCount = Math.max(1, Math.ceil(sentences.length / 100));
  const readingPage = Math.min(pageChoice.key === readingKey ? pageChoice.page : 0, pageCount - 1);
  const pageSentences = sentences.slice(readingPage * 100, (readingPage + 1) * 100);
  const perform = async (label: string, action: () => Promise<void>) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(label); setMessage("");
    try { await action(); } catch (error) { setMessage((error as Error).message); }
    finally { submitting.current = false; setBusy(""); }
  };
  const openDocument = async (body: unknown) => perform("正在提交字幕任务…", async () => {
    const data = await api<{ document: VideoStudyDocument }>("documents", body);
    setDocument(data.document); setCandidates(null); setSelectedOnly(false); setUpload(false);
    rememberDocument(data.document, true); setPanel("");
    change((current) => ({ ...current, documentId: data.document.id }));
  });
  const openHistory = (id: string) => {
    const example = exampleDocuments.find((document) => document.id === id);
    let cached: VideoStudyDocument | null = example || null;
    if (!cached) try { cached = JSON.parse(window.localStorage.getItem(articleKey + id) || "null"); } catch { /* Fetch below. */ }
    if (cached?.id === id && Array.isArray(cached.sentences)) {
      setDocument(cached); rememberDocument(cached, true); change((current) => ({ ...current, documentId: id })); setDocumentVersion((value) => value + 1); setSelectedOnly(false); setPanel("");
    } else void perform("正在打开文章…", async () => {
      const data = await api<{ document: VideoStudyDocument }>(`documents/${encodeURIComponent(id)}`);
      setDocument(data.document); rememberDocument(data.document, true); change((current) => ({ ...current, documentId: id })); setSelectedOnly(false); setPanel("");
    });
  };
  const retryDocument = () => perform("正在重试字幕…", async () => {
    if (!document) return;
    const data = await api<{ document: VideoStudyDocument }>(`documents/${document.id}/retry`, {});
    setDocument(data.document);
    // Remount polling even when the document identifier is unchanged.
    change((current) => ({ ...current, documentId: "" }));
    window.setTimeout(() => change((current) => ({ ...current, documentId: data.document.id })), 0);
  });
  const startImport = () => {
    if (running || !target || !saved.draft.length) return;
    if (saved.draft.length > 30) { setMessage("每批最多 30 词，请先减少待收藏词数量。"); return; }
    const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
    change((current) => ({ ...current, pending: { requestId, groupId: target.id, words: current.draft } }));
    setDrawer(true); setEditing("");
  };
  const addManual = () => {
    if (!normalizeStudyWord(manualWord)) { setMessage("请输入一个有效英文单词，支持连字符和撇号。"); return; }
    change((current) => ({ ...current, draft: addDraftWord(current.draft, manualWord) })); setManualWord("");
  };

  return <div className="video-study-page video-reader">
    <header className="video-reader-header"><div><h1>{document?.title || "视频学词"}</h1>{document?.duration && <small>{document.duration}</small>}</div>
      <button type="button" className="video-history-button" onClick={() => { setDrawer(false); setPanel("history"); void refreshHistory(); }}><StudyActionIcon kind="history"/><span>学习记录</span></button></header>
    {panel === "search" && <VideoStudySheet title="查找文章" onClose={() => setPanel("")}>
    <p className="video-service-hint">{health}</p>
    <form className="video-title-form" onSubmit={(event) => { event.preventDefault(); void perform("正在查找视频…", async () => { const data = await api<{ candidates: VideoCandidate[] }>("search", { query }); setCandidates(data.candidates); }); }}>
      <span aria-hidden="true">▶</span><input aria-label="YouTube 视频标题或链接" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入 YouTube 视频标题或链接" required maxLength={200}/><button type="submit" disabled={!!busy}>查找视频</button>
    </form>
    <button type="button" className="video-upload-toggle" onClick={() => setUpload(!upload)}>已有字幕？导入 SRT / VTT →</button>
    {upload && <section className="video-upload-panel"><label>字幕标题<input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="例如：我的英语视频" maxLength={200}/></label>
      <label>字幕文件<input type="file" accept=".srt,.vtt,text/vtt,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > MAX_SUBTITLE_BYTES) { setMessage("字幕文件不能超过 4 MiB，支持3小时以内字幕。"); return; } void file.text().then(setSubtitle).catch(() => setMessage("无法读取字幕文件")); if (!uploadTitle) setUploadTitle(file.name.replace(/\.(srt|vtt)$/i, "")); }}/></label>
      <textarea aria-label="字幕内容" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="支持3小时以内、4 MiB以内的 SRT / VTT 字幕" maxLength={MAX_SUBTITLE_BYTES}/>
      <button type="button" className="video-primary-button" disabled={!subtitle.trim() || !!busy} onClick={() => void openDocument({ source: "upload", title: uploadTitle || "导入字幕", subtitle })}>整理字幕并翻译</button></section>}
    {busy && <p role="status">{busy}</p>}
    {candidates && <section className="video-candidates" aria-label="视频候选"><div className="video-section-title"><b>选择视频</b><button type="button" onClick={() => setCandidates(null)}>收起</button></div>{!candidates.length && <p>没有找到结果，请尝试视频链接。</p>}{candidates.map((candidate, index) => <button type="button" disabled={!!busy} key={candidate.id} onClick={() => void openDocument({ videoId: candidate.id })}><span className={`video-candidate-art art-${index % 2}`}>▶</span><span><b>{candidate.title}</b><small>{candidate.channel} · {candidate.duration}</small></span><span>载入 →</span></button>)}</section>}
    </VideoStudySheet>}
    {panel === "history" && <VideoStudySheet title="学习记录" onClose={() => setPanel("")}>
      {historyError && <p className="video-service-hint">{historyError}</p>}
      <div className="video-history-list">{history.map((item) => <button type="button" key={item.id} disabled={!!busy} aria-label={`打开文章 ${item.title}`} onClick={() => openHistory(item.id)} className={item.id === document?.id ? "current" : ""}>
        <span className="video-history-mark">{item.isExample ? "内置" : item.status === "failed" ? "未完成" : "文章"}</span><span><b>{item.title}</b><small>{item.sentenceCount} 句{item.duration ? ` · ${item.duration}` : ""}{item.lastOpenedAt ? ` · ${new Date(item.lastOpenedAt).toLocaleDateString("zh-CN")}` : ""}</small></span><span aria-hidden="true">↗</span>
      </button>)}</div>
    </VideoStudySheet>}
    <div className="video-study-grid video-reader-grid">
      <section className="video-transcript-panel" aria-label="字幕阅读区">
        {documentActive(document) && <div className="video-demo-notice" role="status"><p>{document?.status === "translating" ? `英文已就绪，正在翻译 ${document.sentences.filter((sentence) => sentence.translationStatus === "ready").length}/${document.sentences.length} 句… 现在就可以选词。` : "字幕任务已排队，正在获取英文字幕…"}</p></div>}
        {document?.error && <div className="video-error"><p>{document.error}</p>{["failed", "partial"].includes(document.status || "") && <button type="button" disabled={!!busy} onClick={() => void retryDocument()}>重试未完成部分</button>}</div>}
        <div className="video-reading-toolbar"><span>{document?.sentences.length ?? 0} 句字幕</span><label><input type="checkbox" checked={showTranslation} onChange={(event) => setShowTranslation(event.target.checked)}/>中文翻译</label><label><input type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)}/>只看已选</label></div>
        {pageCount > 1 && <nav className="video-reading-toolbar" aria-label="字幕分页"><button disabled={readingPage === 0} onClick={() => setPageChoice({ key: readingKey, page: readingPage - 1 })}>上一页</button><span>{readingPage + 1} / {pageCount} 页 · 每页100句</span><button disabled={readingPage + 1 >= pageCount} onClick={() => setPageChoice({ key: readingKey, page: readingPage + 1 })}>下一页</button></nav>}
        <div className="video-sentences">{pageSentences.map((sentence, index) => <article className="video-sentence" key={sentence.id}><div className="video-sentence-meta"><span>{sentence.time}</span><small>{String(readingPage * 100 + index + 1).padStart(2, "0")}</small></div><div className="video-word-flow" aria-label={sentence.english}>{tokenizeSubtitle(sentence.english).map((token, index) => token.word ? <button type="button" key={index} aria-label={`选择单词 ${token.text}`} aria-pressed={selected.has(token.word)} disabled={running || !restored} className={selected.has(token.word) ? "selected" : ""} onClick={() => change((current) => ({ ...current, draft: selected.has(token.word!) ? current.draft.filter((item) => item.word !== token.word) : addDraftWord(current.draft, token.word!, { documentId: document!.id, title: document!.title, sentenceId: sentence.id, time: sentence.time, english: sentence.english }) }))}>{token.text}{selected.has(token.word) && <span aria-hidden="true">✓</span>}</button> : token.text.trim() ? <span className="video-punctuation" key={index}>{token.text.trim()}</span> : null)}</div>{showTranslation && <p className="video-translation">{sentence.chinese || (sentence.translationStatus === "failed" ? "本句翻译失败，可在上方重试。" : "中文翻译等待中…")}</p>}</article>)}{!sentences.length && <div className="video-loading">{document ? selectedOnly ? "没有已选单词的句子，关闭‘只看已选’试试。" : "字幕将在这里逐句显示。" : "每个英文单词都是可点击的卡片，选中的生词会暂存在右侧。"}</div>}</div>
      </section>
      {drawer && <VideoStudySheet title="缓存区" draft onClose={() => setDrawer(false)}><aside className="video-draft-panel open" aria-label="缓存区"><div className="video-section-title"><h2>缓存区 <em>{saved.draft.length}</em></h2><button type="button" className="video-drawer-close" onClick={() => setDrawer(false)}>关闭</button></div>
        <div className="video-draft-body">{!saved.draft.length && <div className="video-draft-empty"><span>▧</span><b>把遇见的生词放进来</b><p>点选字幕中的单词，或者手动添加。</p></div>}
          <ul className="video-draft-list">{saved.draft.map((item) => <li key={item.word}>{editing === item.word ? <div className="video-word-edit"><input aria-label={`修改单词 ${item.word}`} value={editValue} onChange={(event) => setEditValue(event.target.value)}/><button type="button" onClick={() => { if (!normalizeStudyWord(editValue)) { setMessage("请输入有效英文单词"); return; } change((current) => ({ ...current, draft: renameDraftWord(current.draft, editing, editValue) })); setEditing(""); }}>保存</button><button type="button" onClick={() => setEditing("")}>取消</button></div> : <><div><b>{item.word}</b><small>{item.sources[0] ? `${item.sources[0].time} · ${item.sources[0].title}` : "手动添加"}</small></div><button type="button" disabled={running} aria-label={`编辑 ${item.word}`} onClick={() => { setEditing(item.word); setEditValue(item.word); }}>编辑</button><button type="button" disabled={running} aria-label={`移除 ${item.word}`} onClick={() => change((current) => ({ ...current, draft: current.draft.filter((word) => word.word !== item.word) }))}>×</button></>}{item.sources[0] && <details><summary>查看来源句</summary><p>{item.sources[0].english}</p></details>}</li>)}</ul>
          <form className="video-manual-add" onSubmit={(event) => { event.preventDefault(); addManual(); }}><input aria-label="手动添加单词" value={manualWord} disabled={running || !restored} onChange={(event) => setManualWord(event.target.value)} placeholder="手动补充一个单词"/><button type="submit" disabled={running || !restored}>＋</button></form>
          {!!saved.draft.length && <button type="button" className="video-clear-draft" disabled={running} onClick={() => { if (window.confirm("清空当前设备的待收藏草稿？")) change((current) => ({ ...current, draft: [] })); }}>清空待收藏区</button>}
          {job && <section className="video-batch" aria-label="收藏进度">
            <div className="video-section-title"><b>收藏批次 · {job.groupName}</b><span>{job.items.filter((item) => item.status === "success").length}/{job.items.length}</span></div>
            <progress max={job.items.length || 1} value={job.items.filter((item) => ["success", "failed"].includes(item.status)).length}/>
            <ul>{job.items.map((item) => <li key={item.word} className={item.status}><b>{item.word}</b><span title={item.error}>{item.error || states[item.status]}</span></li>)}</ul>
            {job.error && <p>{job.error}</p>}
            {!running && ["failed", "partial"].includes(job.status) && <button type="button" disabled={!!busy} onClick={() => void perform("正在重试未完成词…", async () => {
              const data = await api<{ job: VideoStudyJob }>(`imports/${job.id}/retry`, {});
              setJob(data.job);
              change((current) => ({ ...current, jobId: "" }));
              window.setTimeout(() => change((current) => ({ ...current, jobId: data.job.id })), 0);
            })}>仅重试失败项</button>}
            <p>成功词已从草稿移除，失败词保留。重复提交不会覆盖已有笔记和复习进度。</p>
          </section>}
          {saved.pending && <p role="status">正在确认提交结果，请勿清除浏览器存储。相同批次会自动恢复。</p>}
        </div><div className="video-draft-footer"><label>收藏到<select aria-label="目标词库" value={target?.id || ""} disabled={running} onChange={(event) => setGroupId(event.target.value)}>{!groups.length && <option value="">连接服务后选择词库</option>}{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><button type="button" className="video-primary-button" disabled={running || !target || !saved.draft.length || !restored} onClick={startImport}>{running ? "后台处理中…" : `生成并收藏 ${saved.draft.length} 词`}<span>→</span></button><small>复用对比学习词条规则，单次最多 30 词。</small></div>
      </aside></VideoStudySheet>}
    </div><div className="video-reader-actions">
      <button type="button" aria-label="查找文章" aria-expanded={panel === "search"} onClick={() => { setDrawer(false); setPanel("search"); }}><StudyActionIcon kind="search"/></button>
      <button type="button" aria-label={`缓存区，${saved.draft.length} 个单词`} aria-expanded={drawer} onClick={() => { setPanel(""); setDrawer(true); }}><StudyActionIcon kind="draft"/>{saved.draft.length > 0 && <b>{saved.draft.length > 99 ? "99+" : saved.draft.length}</b>}{running && <i aria-label="处理中"/>}</button>
    </div>
    {message && <div className="video-inline-message" role="status"><span>{message}</span><button type="button" aria-label="关闭提示" onClick={() => setMessage("")}>×</button></div>}
  </div>;
}
