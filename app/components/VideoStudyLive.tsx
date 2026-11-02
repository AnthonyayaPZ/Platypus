"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addDraftWord, normalizeStudyWord, renameDraftWord, restoreDraft, tokenizeSubtitle,
  type DraftWord, type VideoCandidate, type VideoStudyDocument, type VideoStudyJob } from "../../lib/video-study";

type Group = { id: string; name: string };
type PendingImport = { requestId: string; groupId: string; words: DraftWord[] };
type Saved = { draft: DraftWord[]; documentId: string; jobId: string; acknowledged: string[]; pending: PendingImport | null };
const key = "platypus.video-study.live.v1";
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
  const [document, setDocument] = useState<VideoStudyDocument | null>(null);
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const value = JSON.parse(window.localStorage.getItem(key) || "null");
        if (value) setSaved({ ...emptySaved, ...value, draft: restoreDraft(JSON.stringify(value.draft)), acknowledged: Array.isArray(value.acknowledged) ? value.acknowledged : [] });
      } catch { setMessage("无法恢复本机草稿，请检查浏览器存储权限。"); }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
    if (!restored || !saved.documentId) return;
    let cancelled = false;
    let timer: number;
    const poll = async () => {
      try {
        const data = await api<{ document: VideoStudyDocument }>(`documents/${encodeURIComponent(saved.documentId)}`);
        if (cancelled) return;
        setDocument(data.document);
        if (documentActive(data.document)) timer = window.setTimeout(() => void poll(), 1800);
      } catch (error) {
        if (!cancelled) { setMessage(`${(error as Error).message}，正在尝试恢复字幕进度。`); timer = window.setTimeout(() => void poll(), 8000); }
      }
    };
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [restored, saved.documentId]);

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
  const perform = async (label: string, action: () => Promise<void>) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(label); setMessage("");
    try { await action(); } catch (error) { setMessage((error as Error).message); }
    finally { submitting.current = false; setBusy(""); }
  };
  const openDocument = async (body: unknown) => perform("正在提交字幕任务…", async () => {
    const data = await api<{ document: VideoStudyDocument }>("documents", body);
    setDocument(data.document); setCandidates(null); setSelectedOnly(false); setUpload(false);
    change((current) => ({ ...current, documentId: data.document.id }));
  });
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

  return <div className="video-study-page">
    <header className="video-study-heading"><div><span className="eyebrow">LEARN FROM EVERY SENTENCE</span><h1>把视频，变成你的词库。</h1><p>读一段字幕，捡起值得记住的单词。</p></div><span className="video-demo-badge">真实视频</span></header>
    <div className="video-demo-notice" role="status"><span>✦</span><p>{health}</p></div>
    <form className="video-title-form" onSubmit={(event) => { event.preventDefault(); void perform("正在查找视频…", async () => { const data = await api<{ candidates: VideoCandidate[] }>("search", { query }); setCandidates(data.candidates); }); }}>
      <span aria-hidden="true">▶</span><input aria-label="YouTube 视频标题或链接" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入 YouTube 视频标题或链接" required maxLength={200}/><button type="submit" disabled={!!busy}>查找视频</button>
    </form>
    <button type="button" className="video-upload-toggle" onClick={() => setUpload(!upload)}>已有字幕？导入 SRT / VTT →</button>
    {upload && <section className="video-upload-panel"><label>字幕标题<input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="例如：我的英语视频" maxLength={200}/></label>
      <label>字幕文件<input type="file" accept=".srt,.vtt,text/vtt,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 500_000) { setMessage("字幕文件不能超过 500 KB。"); return; } void file.text().then(setSubtitle).catch(() => setMessage("无法读取字幕文件")); if (!uploadTitle) setUploadTitle(file.name.replace(/\.(srt|vtt)$/i, "")); }}/></label>
      <textarea aria-label="字幕内容" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="或在这里粘贴带时间轴的 SRT / VTT 字幕" maxLength={500_000}/>
      <button type="button" className="video-primary-button" disabled={!subtitle.trim() || !!busy} onClick={() => void openDocument({ source: "upload", title: uploadTitle || "导入字幕", subtitle })}>整理字幕并翻译</button></section>}
    {busy && <p role="status">{busy}</p>}
    {candidates && <section className="video-candidates" aria-label="视频候选"><div className="video-section-title"><b>确认你想学习的视频</b><button type="button" onClick={() => setCandidates(null)}>收起</button></div>{!candidates.length && <p>没有找到结果，请尝试视频链接。</p>}{candidates.map((candidate, index) => <button type="button" disabled={!!busy} key={candidate.id} onClick={() => void openDocument({ videoId: candidate.id })}><span className={`video-candidate-art art-${index % 2}`}>▶</span><span><b>{candidate.title}</b><small>{candidate.channel} · {candidate.duration}</small></span><span>载入 →</span></button>)}</section>}
    <div className="video-study-grid">
      <section className="video-transcript-panel" aria-label="字幕阅读区">
        <div className="video-document-header"><span className="video-mini-art">▶</span><div><span className="eyebrow">YOUR TRANSCRIPT</span><h2>{document?.title || "从一个感兴趣的视频开始"}</h2><p>{document ? `${document.channel} · ${document.duration}` : "搜索标题、粘贴链接，或导入英文字幕。"}</p></div></div>
        {documentActive(document) && <div className="video-demo-notice" role="status"><p>{document?.status === "translating" ? `英文已就绪，正在翻译 ${document.sentences.filter((sentence) => sentence.translationStatus === "ready").length}/${document.sentences.length} 句… 现在就可以选词。` : "字幕任务已排队，正在获取英文字幕…"}</p></div>}
        {document?.error && <div className="video-error"><p>{document.error}</p>{["failed", "partial"].includes(document.status || "") && <button type="button" disabled={!!busy} onClick={() => void retryDocument()}>重试未完成部分</button>}</div>}
        <div className="video-reading-toolbar"><span>{document?.sentences.length ?? 0} 句字幕</span><label><input type="checkbox" checked={showTranslation} onChange={(event) => setShowTranslation(event.target.checked)}/>中文翻译</label><label><input type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)}/>只看已选</label></div>
        <div className="video-sentences">{sentences.map((sentence, index) => <article className="video-sentence" key={sentence.id}><div className="video-sentence-meta"><span>{sentence.time}</span><small>{String(index + 1).padStart(2, "0")}</small></div><div className="video-word-flow" aria-label={sentence.english}>{tokenizeSubtitle(sentence.english).map((token, index) => token.word ? <button type="button" key={index} aria-label={`选择单词 ${token.text}`} aria-pressed={selected.has(token.word)} disabled={running || !restored} className={selected.has(token.word) ? "selected" : ""} onClick={() => change((current) => ({ ...current, draft: selected.has(token.word!) ? current.draft.filter((item) => item.word !== token.word) : addDraftWord(current.draft, token.word!, { documentId: document!.id, title: document!.title, sentenceId: sentence.id, time: sentence.time, english: sentence.english }) }))}>{token.text}{selected.has(token.word) && <span aria-hidden="true">✓</span>}</button> : token.text.trim() ? <span className="video-punctuation" key={index}>{token.text.trim()}</span> : null)}</div>{showTranslation && <p className="video-translation">{sentence.chinese || (sentence.translationStatus === "failed" ? "本句翻译失败，可在上方重试。" : "中文翻译等待中…")}</p>}</article>)}{!sentences.length && <div className="video-loading">{document ? selectedOnly ? "没有已选单词的句子，关闭‘只看已选’试试。" : "字幕将在这里逐句显示。" : "每个英文单词都是可点击的卡片，选中的生词会暂存在右侧。"}</div>}</div>
        <div className="video-reading-tip">点一下选词，再点一下取消。跨视频保留草稿；只有手动提交后才生成并收藏。</div>
      </section>
      {drawer && <button type="button" className="video-drawer-backdrop" aria-label="关闭待收藏区" onClick={() => setDrawer(false)}/>}
      <aside className={`video-draft-panel ${drawer ? "open" : ""}`} aria-label="待收藏区"><div className="video-draft-handle"/><div className="video-section-title"><div><span className="eyebrow">YOUR WORD POCKET</span><h2>待收藏区 <em>{saved.draft.length}</em></h2></div><button type="button" className="video-drawer-close" onClick={() => setDrawer(false)}>关闭</button></div><p className="video-draft-description">草稿保存在当前设备。提交后任务在服务器继续。</p>
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
      </aside>
    </div><div className="video-mobile-dock"><button type="button" onClick={() => setDrawer(true)}><span className="video-dock-icon">▧<b>{saved.draft.length}</b></span><span><b>待收藏 {saved.draft.length} 词</b><small>{running ? "后台处理中，点此查看" : "查看、编辑与批量提交"}</small></span><span>展开 ↑</span></button></div>
    {message && <div className="video-inline-message" role="status"><span>{message}</span><button type="button" aria-label="关闭提示" onClick={() => setMessage("")}>×</button></div>}
  </div>;
}
