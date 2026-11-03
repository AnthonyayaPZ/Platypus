"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { acknowledgeSearchImport, activeImportPrefix, appendImportWords, completeImportPrefix, emptySearchImport, restoreSearchImport, type SearchImportSession } from "../../lib/search-import";
import { getWordSuggestions, type WordSuggestion } from "../../lib/word-suggestions";
import type { VideoStudyJob } from "../../lib/video-study";
import VideoStudySheet from "./VideoStudySheet";

const storageKey = "platypus.search-import.v1";
const active = (job: VideoStudyJob | null) => !!job && ["queued", "running"].includes(job.status);
const labels = { waiting: "等待中", processing: "生成中…", success: "已收藏", failed: "处理失败" };
class ImportRequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function request(path: string, body?: unknown): Promise<VideoStudyJob> {
  const response = await fetch(`/api/video-study/imports${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const data = await response.json().catch(() => ({})) as { error?: unknown; job?: VideoStudyJob };
  if (!response.ok) throw new ImportRequestError(typeof data.error === "string" ? data.error : "暂时无法连接收藏服务", response.status);
  if (!data.job?.id || !Array.isArray(data.job.items)) throw new Error("收藏服务返回异常，请稍后重试");
  return data.job;
}

export default function SearchBatchImport({ groups, selectedGroup, onImported }: {
  groups: { id: string; name: string }[]; selectedGroup: string; onImported: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SearchImportSession>(emptySearchImport);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [group, setGroup] = useState("");
  const [job, setJob] = useState<VideoStudyJob | null>(null);
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<WordSuggestion[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const imported = useRef(onImported);
  useEffect(() => { imported.current = onImported; }, [onImported]);
  const change = useCallback((fn: (value: SearchImportSession) => SearchImportSession) => setSession((current) => {
    const next = fn(current);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { window.setTimeout(() => setMessage("本机存储不可用，请勿刷新页面；服务器已接收的任务仍会继续。"), 0); }
    return next;
  }), []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setSession(restoreSearchImport(window.localStorage.getItem(storageKey))); }
      catch { setMessage("无法恢复批量草稿，请检查浏览器存储权限。"); }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const running = retrying || !!session.pending || (!!session.jobId && !job) || active(job);
  const target = groups.find((item) => item.id === (group || selectedGroup)) ?? groups[0];
  const failedWords = job?.items.filter((item) => item.status === "failed").map((item) => item.word) ?? [];
  const retryMatchesDraft = failedWords.every((word) => session.words.includes(word));
  const prefix = activeImportPrefix(input).toLowerCase();
  const showSuggestions = !running && /^[a-z]{1,48}$/.test(prefix) && suggestions.length > 0;
  useEffect(() => {
    if (!open || !/^[a-z]{1,48}$/.test(prefix)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => { void getWordSuggestions(prefix, 5).then((matches) => {
      if (!cancelled) { setSuggestions(matches); setSuggestionIndex(0); }
    }).catch(() => { if (!cancelled) setSuggestions([]); }); }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, prefix, input]);
  const add = (raw = input) => {
    if (running) return;
    const next = appendImportWords(session.words, raw);
    if (next.error) { setMessage(next.error); return; }
    change((current) => ({ ...current, words: next.words }));
    setInput(""); setSuggestions([]); setMessage("");
  };
  const choose = (word: string) => add(completeImportPrefix(input, word));
  const accept = useCallback((next: VideoStudyJob) => {
    setJob(next);
    change((current) => acknowledgeSearchImport(current, next));
  }, [change]);
  useEffect(() => {
    if (!ready || !session.pending) return;
    const pending = session.pending;
    let cancelled = false;
    let timer: number;
    const send = async () => {
      try {
        const next = await request("", pending);
        if (cancelled) return;
        change((current) => ({ ...current, pending: null, jobId: next.id, acknowledged: [] }));
        setJob(next); setMessage("已提交，关闭面板也会继续处理。");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ImportRequestError && error.status >= 400 && error.status < 500) {
          change((current) => ({ ...current, pending: null })); setMessage(`${error.message}，草稿已保留。`);
        } else {
          setMessage("连接中断，草稿已保留；正在用同一批次编号重连。"); timer = window.setTimeout(() => void send(), 8000);
        }
      }
    };
    void send();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [ready, session.pending, change]);
  useEffect(() => {
    if (!ready || !session.jobId || session.pending) return;
    let cancelled = false;
    let timer: number;
    const poll = async () => {
      try {
        const next = await request(`/${encodeURIComponent(session.jobId)}`);
        if (cancelled) return;
        accept(next);
        if (active(next)) timer = window.setTimeout(() => void poll(), 1800);
        else if (next.items.some((item) => item.status === "success")) {
          try { await imported.current(); } catch { if (!cancelled) setMessage("收藏已完成，稍后重新打开词库即可同步。"); }
        }
      } catch {
        if (!cancelled) { setMessage("暂时无法同步进度，任务仍保留在服务器。"); timer = window.setTimeout(() => void poll(), 8000); }
      }
    };
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [ready, session.jobId, session.pending, accept, pollVersion]);
  const submit = () => {
    if (running || !ready || !target || !session.words.length || input.trim()) return;
    const requestId = `search-${Date.now().toString(36)}-${Array.from(crypto.getRandomValues(new Uint8Array(12)), (value) => value.toString(16).padStart(2, "0")).join("")}`;
    change((current) => ({ ...current, jobId: "", acknowledged: [], pending: { requestId, groupId: target.id,
      words: current.words.map((word) => ({ word, sources: [] })) } }));
    setJob(null); setMessage("");
  };
  const retry = async () => {
    if (!job || running || !retryMatchesDraft) return;
    setRetrying(true);
    try { accept(await request(`/${encodeURIComponent(job.id)}/retry`, {})); setPollVersion((value) => value + 1); }
    catch (error) { setMessage((error as Error).message); }
    finally { setRetrying(false); }
  };

  return <>
    <button className="batch-entry" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}><span aria-hidden="true">＋</span> 批量收藏{session.words.length > 0 && <small>{session.words.length}</small>}{running && <i aria-label="正在处理" />}</button>
    {open && <VideoStudySheet title="批量收藏" onClose={() => setOpen(false)}>
      <div className="search-import-panel">
        <p className="batch-intro">一次整理几个词，准备好后再上传。</p>
        <label className="batch-input-label" htmlFor="batch-word-input">添加单词</label>
        <div className="batch-input-row"><textarea id="batch-word-input" value={input} disabled={running} rows={2} maxLength={10000} placeholder="输入单词，或粘贴用逗号、空格、换行分隔的词表" role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions} aria-controls="batch-word-suggestions" aria-activedescendant={showSuggestions ? `batch-suggestion-${suggestionIndex}` : undefined}
          onChange={(event) => { setInput(event.target.value); setSuggestions([]); }} onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" && showSuggestions) { event.preventDefault(); setSuggestionIndex((value) => (value + 1) % suggestions.length); }
            else if (event.key === "ArrowUp" && showSuggestions) { event.preventDefault(); setSuggestionIndex((value) => (value - 1 + suggestions.length) % suggestions.length); }
            else if (event.key === "Tab" && showSuggestions) { event.preventDefault(); choose(suggestions[suggestionIndex].word); }
            else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (showSuggestions) choose(suggestions[suggestionIndex].word); else add(); }
          }} /><button type="button" onClick={() => add()} disabled={running || !input.trim()}>添加</button></div>
        {showSuggestions && <div id="batch-word-suggestions" className="batch-suggestions" role="listbox" aria-label="当前单词补全">{suggestions.map((suggestion, index) => <button type="button" id={`batch-suggestion-${index}`} role="option" aria-selected={index === suggestionIndex} key={suggestion.word} onClick={() => choose(suggestion.word)}><b>{suggestion.word}</b><small>{suggestion.match === "prefix" ? "自动补全" : "拼写建议"}</small></button>)}</div>}
        <div className="batch-list-heading"><span>待上传 <b>{session.words.length}</b> / 30</span><small>自动去重 · 本机保存</small></div>
        <div className="batch-chips" aria-label="待上传单词">{session.words.length ? session.words.map((word) => <span key={word}>{word}<button type="button" disabled={running} aria-label={`移除 ${word}`} onClick={() => change((current) => ({ ...current, words: current.words.filter((item) => item !== word) }))}>×</button></span>) : <p>还没有待上传的单词</p>}</div>
        <label className="batch-target">收藏到<select aria-label="批量收藏目标词库" value={target?.id ?? ""} disabled={running} onChange={(event) => setGroup(event.target.value)}>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {message && <p className="batch-message" role="status">{message}</p>}
        {input.trim() && <p className="batch-hint">先点击“添加”确认词表，再批量上传。</p>}
        <button type="button" className="batch-submit" disabled={!ready || running || !target || !session.words.length || !!input.trim()} onClick={submit}>{running ? "后台处理中…" : `上传并收藏 ${session.words.length} 个词`}</button>
        {job && <section className="batch-progress" aria-label="批量收藏进度"><div><b>{job.groupName}</b><span>{job.items.filter((item) => item.status === "success").length}/{job.items.length} 已收藏</span></div><progress max={job.items.length} value={job.items.filter((item) => ["success", "failed"].includes(item.status)).length} /><ul>{job.items.map((item) => <li className={item.status} key={item.word}><b>{item.word}</b><span>{item.error || labels[item.status]}</span></li>)}</ul>{!running && failedWords.length > 0 && (retryMatchesDraft ? <button type="button" onClick={() => void retry()}>仅重试失败项</button> : <p className="batch-hint">失败词表已修改，请按当前待上传列表重新提交。</p>)}</section>}
      </div>
    </VideoStudySheet>}
  </>;
}
