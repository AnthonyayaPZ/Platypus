"use client";

import { useEffect, useRef, useState } from "react";
import sample from "../../shared/video-study-demo.json";
import {
  addDraftWord, normalizeStudyWord, renameDraftWord, restoreDraft, tokenizeSubtitle,
  type DraftWord, type ImportItem, type VideoStudyDocument,
} from "../../lib/video-study";

const documents: VideoStudyDocument[] = sample.documents;
const storageKey = "platypus.video-study.demo.draft.v1";
const fallbackGroups = [{ id: "demo-default", name: "默认收藏（演示）" }, { id: "demo-video", name: "视频生词（演示）" }];
const statusLabels: Record<ImportItem["status"], string> = { waiting: "等待中", processing: "生成词条中…", success: "已模拟收藏", failed: "处理失败（演示）" };
const pause = (time: number) => new Promise<void>((resolve) => window.setTimeout(resolve, time));

export default function VideoStudyDemo({ groups = fallbackGroups }: { groups?: { id: string; name: string }[] }) {
  const targets = groups.length ? groups : fallbackGroups;
  const [document, setDocument] = useState<VideoStudyDocument>(documents[0]);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState(false);
  const [loading, setLoading] = useState("");
  const [draft, setDraft] = useState<DraftWord[]>([]);
  const [restored, setRestored] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [manualWord, setManualWord] = useState("");
  const [editing, setEditing] = useState("");
  const [editValue, setEditValue] = useState("");
  const [groupId, setGroupId] = useState("");
  const [batchGroup, setBatchGroup] = useState("");
  const [batch, setBatch] = useState<ImportItem[]>([]);
  const [running, setRunning] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const processing = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => {
      try { setDraft(restoreDraft(window.localStorage.getItem(storageKey))); }
      catch { setMessage("无法读取本机草稿，本次选词仍可正常使用。"); }
      setRestored(true);
    }, 0);
    return () => { mounted.current = false; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!restored) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(draft)); }
    catch { setTimeout(() => setMessage("本机存储不可用，关闭页面后草稿可能丢失。"), 0); }
  }, [draft, restored]);

  const selected = new Set(draft.map((item) => item.word));
  const selectedTarget = targets.find((group) => group.id === groupId) ?? targets[0];
  const sentences = selectedOnly
    ? document.sentences.filter((sentence) => tokenizeSubtitle(sentence.english).some((token) => token.word && selected.has(token.word)))
    : document.sentences;

  const openDocument = async (next: VideoStudyDocument) => {
    if (loading) return;
    setCandidates(false);
    setLoading("整理演示字幕…");
    await pause(500);
    if (!mounted.current) return;
    setDocument(next);
    setSelectedOnly(false);
    setLoading("");
    setMessage("演示字幕已载入，已有待收藏词会继续保留。");
  };

  const toggleWord = (word: string, sentence: VideoStudyDocument["sentences"][number]) => {
    if (running || !restored) return;
    setDraft((current) => selected.has(word)
      ? current.filter((item) => item.word !== word)
      : addDraftWord(current, word, { documentId: document.id, title: document.title, sentenceId: sentence.id, time: sentence.time, english: sentence.english }));
  };

  const addManualWord = () => {
    if (!normalizeStudyWord(manualWord)) { setMessage("请输入一个英文单词，支持连字符和撇号，最多 48 个字符。"); return; }
    setDraft((current) => addDraftWord(current, manualWord));
    setManualWord("");
    setMessage("已加入待收藏区。");
  };

  const saveEdit = () => {
    if (!normalizeStudyWord(editValue)) { setMessage("请输入有效的单个英文单词。"); return; }
    setDraft((current) => renameDraftWord(current, editing, editValue));
    setEditing("");
  };

  const startImport = async (retry = false) => {
    if (processing.current) return;
    const words = retry ? batch.filter((item) => item.status === "failed").map((item) => item.word) : draft.map((item) => item.word);
    if (!words.length) return;
    if (words.length > 30) { setMessage("演示批次最多处理 30 个词，请先减少数量。"); return; }
    processing.current = true;
    setRunning(true);
    setBatchGroup(retry ? batchGroup : selectedTarget.name);
    setEditing("");
    setDrawer(true);
    const update = (word: string, status: ImportItem["status"]) => setBatch((current) => current.map((item) => item.word === word ? { ...item, status } : item));
    if (retry) setBatch((current) => current.map((item) => item.status === "failed" ? { ...item, status: "waiting" } : item));
    else setBatch(words.map((word) => ({ word, status: "waiting" })));

    for (const [index, word] of words.entries()) {
      if (!mounted.current) break;
      update(word, "processing");
      await pause(550);
      if (!mounted.current) break;
      const failed = !retry && simulateFailure && index === 0;
      update(word, failed ? "failed" : "success");
      if (!failed) {
        // Successful simulated items leave the draft, while failed items remain retryable.
        setDraft((current) => current.filter((item) => item.word !== word));
      }
    }
    processing.current = false;
    if (mounted.current) {
      setRunning(false);
      setMessage("演示批次已结束，没有写入真实词库。");
    }
  };

  const closeDrawer = () => { setDrawer(false); setEditing(""); };

  return <div className="video-study-page">
    <header className="video-study-heading"><div><span className="eyebrow">LEARN FROM EVERY SENTENCE</span><h1>把视频，变成你的词库。</h1><p>读一段字幕，捡起值得记住的单词。</p></div><span className="video-demo-badge">交互 Demo</span></header>
    <div className="video-demo-notice"><span>✦</span><p>当前使用自编示例字幕。视频搜索、翻译和收藏均为演示，不调用 YouTube / LLM，也不写入真实词库。</p></div>
    <form className="video-title-form" onSubmit={(event) => { event.preventDefault(); setCandidates(true); }}>
      <span aria-hidden="true">▶</span><input aria-label="YouTube 视频标题或链接" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入 YouTube 视频标题或链接" /><button type="submit">查找视频</button>
    </form>
    {candidates && <section className="video-candidates" aria-label="演示视频候选"><div className="video-section-title"><b>选择一个示例视频</b><button type="button" onClick={() => setCandidates(false)}>收起</button></div><p>你输入了“{query || "未填写标题"}”。当前展示内置示例，用于体验确认视频和加载字幕的流程。</p>{documents.map((candidate, index) => <button type="button" key={candidate.id} onClick={() => void openDocument(candidate)}><span className={`video-candidate-art art-${index}`}>▶</span><span><b>{candidate.title}</b><small>{candidate.channel} · {candidate.duration}</small></span><span>载入 →</span></button>)}</section>}

    <div className="video-study-grid">
      <section className="video-transcript-panel" aria-label="字幕阅读区">
        <div className="video-document-header"><span className="video-mini-art">▶</span><div><span className="eyebrow">DEMO TRANSCRIPT</span><h2>{document.title}</h2><p>{document.channel} · {document.duration}</p></div><button type="button" onClick={() => setCandidates(true)}>更换</button></div>
        <div className="video-reading-toolbar"><span>{document.sentences.length} 句字幕</span><label><input type="checkbox" checked={showTranslation} onChange={(event) => setShowTranslation(event.target.checked)} />中文翻译</label><label><input type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)} />只看已选</label></div>
        {loading ? <div className="video-loading" role="status">{loading}</div> : <div className="video-sentences">{sentences.map((sentence, index) => <article className="video-sentence" key={sentence.id}><div className="video-sentence-meta"><span>{sentence.time}</span><small>{String(index + 1).padStart(2, "0")}</small></div><div className="video-word-flow" aria-label={sentence.english}>{tokenizeSubtitle(sentence.english).map((token, tokenIndex) => token.word
          ? <button type="button" key={tokenIndex} aria-label={`选择单词 ${token.text}`} aria-pressed={selected.has(token.word)} disabled={running || !restored} className={selected.has(token.word) ? "selected" : ""} onClick={() => toggleWord(token.word!, sentence)}>{token.text}{selected.has(token.word) && <span aria-hidden="true">✓</span>}</button>
          : token.text.trim() ? <span className="video-punctuation" key={tokenIndex}>{token.text.trim()}</span> : null)}</div>{showTranslation && <p className="video-translation">{sentence.chinese}</p>}</article>)}{!sentences.length && <div className="video-loading">还没有选词。关闭“只看已选”，点击一个词试试。</div>}</div>}
        <div className="video-reading-tip">点一下加入待收藏区，再点一下取消。词块高亮在相同单词之间同步。</div>
      </section>

      {drawer && <button type="button" className="video-drawer-backdrop" aria-label="关闭待收藏区" onClick={closeDrawer} />}
      <aside className={`video-draft-panel ${drawer ? "open" : ""}`} aria-label="待收藏区">
        <div className="video-draft-handle" /><div className="video-section-title"><div><span className="eyebrow">YOUR WORD POCKET</span><h2>待收藏区 <em>{draft.length}</em></h2></div><button type="button" className="video-drawer-close" onClick={closeDrawer}>关闭</button></div>
        <p className="video-draft-description">先收集，再一起学习。草稿保存在当前设备。</p>
        <div className="video-draft-body">
          {!draft.length && <div className="video-draft-empty"><span>▧</span><b>把遇见的生词放进来</b><p>点选左侧字幕中的单词，或者手动添加。</p></div>}
          <ul className="video-draft-list">{draft.map((item) => <li key={item.word}>{editing === item.word ? <div className="video-word-edit"><input aria-label={`修改单词 ${item.word}`} value={editValue} onChange={(event) => setEditValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveEdit(); }} /><button type="button" onClick={saveEdit}>保存</button><button type="button" onClick={() => setEditing("")}>取消</button></div> : <><div><b>{item.word}</b><small>{item.sources.length ? `${item.sources[0].time} · ${item.sources[0].title}` : "手动添加"}</small></div><button type="button" disabled={running} aria-label={`编辑 ${item.word}`} onClick={() => { setEditing(item.word); setEditValue(item.word); }}>编辑</button><button type="button" disabled={running} aria-label={`移除 ${item.word}`} onClick={() => setDraft((current) => current.filter((word) => word.word !== item.word))}>×</button></>}{item.sources.length > 0 && <details><summary>查看来源句</summary><p>{item.sources[0].english}</p></details>}</li>)}</ul>
          <form className="video-manual-add" onSubmit={(event) => { event.preventDefault(); addManualWord(); }}><input aria-label="手动添加单词" value={manualWord} disabled={running || !restored} onChange={(event) => setManualWord(event.target.value)} placeholder="手动补充一个单词" /><button type="submit" disabled={running || !restored}>＋</button></form>
          {draft.length > 0 && <button type="button" className="video-clear-draft" disabled={running} onClick={() => { if (window.confirm("清空当前设备的待收藏草稿？")) setDraft([]); }}>清空待收藏区</button>}
          {batch.length > 0 && <section className="video-batch" aria-label="模拟收藏进度"><div className="video-section-title"><b>演示批次 · {batchGroup}</b><span>{batch.filter((item) => item.status === "success").length}/{batch.length}</span></div><progress max={batch.length} value={batch.filter((item) => item.status === "success" || item.status === "failed").length} /><ul>{batch.map((item) => <li key={item.word} className={item.status}><b>{item.word}</b><span>{statusLabels[item.status]}</span></li>)}</ul>{!running && batch.some((item) => item.status === "failed") && <button type="button" onClick={() => void startImport(true)}>仅重试失败项</button>}<p>这是模拟结果，真实词库没有变化。</p></section>}
        </div>
        <div className="video-draft-footer"><label>收藏到<select aria-label="目标词库" value={selectedTarget.id} disabled={running} onChange={(event) => setGroupId(event.target.value)}>{targets.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="video-simulate-option"><input type="checkbox" checked={simulateFailure} disabled={running} onChange={(event) => setSimulateFailure(event.target.checked)} />体验一次失败与重试</label><button type="button" className="video-primary-button" disabled={running || draft.length === 0 || !restored} onClick={() => void startImport()}>{running ? "模拟处理中…" : `模拟生成并收藏 ${draft.length} 词`}<span>→</span></button><small>只在点击提交后处理，单次最多 30 词。</small></div>
      </aside>
    </div>
    <div className="video-mobile-dock"><button type="button" onClick={() => setDrawer(true)}><span className="video-dock-icon">▧<b>{draft.length}</b></span><span><b>待收藏 {draft.length} 词</b><small>{running ? "批次处理中，点此查看" : "查看、编辑与批量提交"}</small></span><span>展开 ↑</span></button></div>
    {message && <div className="video-inline-message" role="status"><span>{message}</span><button type="button" onClick={() => setMessage("")} aria-label="关闭提示">×</button></div>}
  </div>;
}
