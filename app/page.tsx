"use client";

import { useEffect, useMemo, useState } from "react";
import type { WordEntry } from "../lib/dictionary";
import type { RelationDetail } from "../lib/relations";

type View = "search" | "review" | "cards" | "library";
type Group = { id: string; name: string; color: string; is_default: number; word_count: number; due_count: number };
type WordMeta = { word: string; note: string; first_saved_at: string; updated_at: string; repetitions: number; next_review: string; last_reviewed: string | null; group_ids: string[] };
type SavedWord = { word: string; group_id: string; added_at: string; note: string; first_saved_at: string; repetitions: number; next_review: string; last_reviewed: string | null; entry: WordEntry };
type ReviewTask = { id: string; word: string; question_type: "audio-word" | "word-meaning" | "meaning-word"; position: number; options: string[]; correct_answer: string; selected_answer: string | null; is_correct: boolean | null; answered_at: string | null; phonetic: string; meaning: string; summary: string };
type ReviewSession = { id: string; group_id: string; status: "active" | "completed"; word_count: number; total_tasks: number; tasks: ReviewTask[] };
type StatePayload = { groups: Group[]; savedWords: SavedWord[]; wordMeta: WordMeta[]; session?: ReviewSession | null; error?: string };

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "search", label: "查单词", icon: "⌕" },
  { id: "review", label: "今日背诵", icon: "◎" },
  { id: "cards", label: "卡片学习", icon: "◇" },
  { id: "library", label: "我的词库", icon: "▦" },
];

function speak(word: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export default function Home() {
  const [view, setView] = useState<View>("search");
  const [groups, setGroups] = useState<Group[]>([]);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [wordMeta, setWordMeta] = useState<WordMeta[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("default");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<WordEntry | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const applyState = (data: StatePayload) => {
    setGroups(data.groups || []);
    setSavedWords(data.savedWords || []);
    setWordMeta(data.wordMeta || []);
  };

  useEffect(() => {
    fetch("/api/state").then(async (response) => await response.json() as StatePayload).then((data) => applyState(data))
      .catch(() => setToast("暂时无法读取单词本"))
      .finally(() => setLoading(false));
    const timer = window.setTimeout(() => setSidebarCollapsed(window.localStorage.getItem("platypus-sidebar") === "collapsed"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const postAction = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json() as StatePayload;
    if (!response.ok) throw new Error(data.error || "操作失败");
    applyState(data);
    return data;
  };

  const searchWord = async (word: string) => {
    const normalized = word.trim();
    if (!normalized || searching) return;
    setSearching(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`);
      const data = await response.json() as { error?: string; entry: WordEntry };
      if (!response.ok) {
        setToast(data.error || "暂时无法检索这个单词");
        return;
      }
      setResult(data.entry);
      setQuery(data.entry.word);
    } catch {
      setToast("暂时无法检索这个单词");
    } finally {
      setSearching(false);
    }
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("platypus-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  };

  const metaFor = (word: string) => wordMeta.find((item) => item.word === word) ?? null;
  const groupWords = useMemo(() => savedWords.filter((item) => item.group_id === selectedGroup), [savedWords, selectedGroup]);
  const selectedDue = groups.find((group) => group.id === selectedGroup)?.due_count ?? 0;

  return <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <aside className="sidebar">
      <button className="brand" onClick={() => setView("search")} aria-label="鸭嘴兽单词首页">
        <span className="brand-mark"><span className="brand-eye" /></span>
        <span className="brand-uploaded-icon" aria-hidden="true" />
        <span className="brand-copy"><b>鸭嘴兽</b><small>PLATYPUS WORDS</small></span>
      </button>
      <button className="collapse-btn" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}>{sidebarCollapsed ? "›" : "‹"}</button>
      <nav className="side-nav" aria-label="主导航">
        {navItems.map((item) => <button key={item.id} title={item.label} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
          <span>{item.icon}</span><b>{item.label}</b>{item.id === "review" && selectedDue > 0 && <em>{Math.min(99, selectedDue)}</em>}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="streak"><span>✦</span><div><b>按节奏复习</b><small>今日待复习 {groups.reduce((sum, group) => sum + group.due_count, 0)} 词</small></div></div>
        <div className="avatar"><span>PL</span><div><b>学习者</b><small>本地体验账号</small></div></div>
      </div>
    </aside>

    <section className="workspace">
      <header className="mobile-header"><button className="brand" onClick={() => setView("search")}><span className="brand-mark"><span className="brand-eye" /></span><span><b>鸭嘴兽单词</b></span></button><span className="streak-pill">今日 {groups.reduce((sum, group) => sum + group.due_count, 0)} 词</span></header>
      {loading ? <LoadingState /> : view === "search" ?
        <SearchView query={query} setQuery={setQuery} result={result} groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} meta={result ? metaFor(result.word) : null} searching={searching} searchWord={searchWord} postAction={postAction} setToast={setToast} total={new Set(savedWords.map((item) => item.word)).size} due={groups.reduce((sum, group) => sum + group.due_count, 0)} setView={setView} />
        : view === "review" ? <ReviewView key={selectedGroup} groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} postAction={postAction} setToast={setToast} />
        : view === "cards" ? <CardsView key={selectedGroup} groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} words={groupWords} metaFor={metaFor} postAction={postAction} setToast={setToast} />
        : <LibraryView groups={groups} savedWords={savedWords} wordMeta={wordMeta} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} postAction={postAction} setToast={setToast} setView={setView} />}
    </section>

    <nav className="bottom-nav" aria-label="移动端导航">
      {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span><small>{item.label.replace("今日", "")}</small></button>)}
    </nav>
    {toast && <div className="toast" role="status">✓ {toast}</div>}
  </main>;
}

function LoadingState() {
  return <div className="loading-state"><span className="loader-mark" /><p>正在整理今天的单词…</p></div>;
}

function SearchView({ query, setQuery, result, groups, selectedGroup, setSelectedGroup, meta, searching, searchWord, postAction, setToast, total, due, setView }: {
  query: string; setQuery: (value: string) => void; result: WordEntry | null; groups: Group[]; selectedGroup: string; setSelectedGroup: (value: string) => void; meta: WordMeta | null; searching: boolean; searchWord: (word: string) => Promise<void>; postAction: (payload: Record<string, unknown>) => Promise<StatePayload>; setToast: (value: string) => void; total: number; due: number; setView: (view: View) => void;
}) {
  const save = async () => {
    if (!result) return;
    try {
      await postAction({ action: "saveWord", word: result.word, groupId: selectedGroup });
      setToast(`已收藏到「${groups.find((group) => group.id === selectedGroup)?.name || "默认收藏"}」`);
    } catch (error) { setToast(error instanceof Error ? error.message : "收藏失败"); }
  };
  const saveNote = async (note: string) => {
    if (!result) return;
    await postAction({ action: "updateNote", word: result.word, note });
    setToast("笔记已保存");
  };

  return <div className="page search-page">
    <div className="page-title compact-title"><div><span className="eyebrow">EXPLORE A WORD</span><h1>今天想认识哪个词？</h1><p>查清含义，也看看它的近邻与对立面。</p></div></div>
    <div className="search-layout">
      <div className="search-main">
        <div className="search-box"><span>⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && searchWord(query)} placeholder="输入一个英文单词" aria-label="输入英文单词" /><kbd>ENTER</kbd><button disabled={searching} onClick={() => searchWord(query)}>{searching ? "生成中…" : "查一查"}</button></div>
        <div className="quick-words"><span>试试：</span>{["resilient", "ephemeral", "pragmatic", "vivid"].map((word) => <button key={word} onClick={() => searchWord(word)}>{word}</button>)}</div>
        {result ? <article className="word-card">
          <div className="word-card-top"><WordHeading entry={result} /><div className="save-area"><select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} aria-label="选择收藏分组">{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button onClick={save}>＋ 收藏</button></div></div>
          <WordLearningContent key={result.word} entry={result} meta={meta} groups={groups} onSaveNote={saveNote} showMetadata />
        </article> : <div className="search-empty"><span className="brand-mark"><span className="brand-eye" /></span><h2>搜索一个真正想记住的词</h2><p>这里会展示释义、例句、近反义词和你的个人笔记。</p></div>}
      </div>
      <aside className="today-panel"><div className="today-head"><span>今日计划</span><small>按学习节奏安排</small></div><div className="progress-ring" style={{ "--progress": `${Math.min(100, due * 10)}%` } as React.CSSProperties}><div><b>{due}</b><small>待复习</small></div></div><h3>每次专注练习 10 个词</h3><p>完成这一组后，如果还有内容，可以继续下一组。</p><button onClick={() => setView("review")}>查看今日任务 <span>→</span></button><div className="mini-stats"><div><b>{total}</b><small>已收藏</small></div><i /><div><b>{Math.min(10, due)}</b><small>下一组</small></div></div></aside>
    </div>
  </div>;
}

function WordHeading({ entry }: { entry: WordEntry }) {
  return <div><div className="word-heading"><h2>{entry.word}</h2><button className="sound-btn" onClick={() => speak(entry.word)} aria-label={`播放 ${entry.word} 发音`}>◖))</button></div><div className="phonetic"><span>EN</span>{entry.phonetic}<i>{entry.part}</i></div></div>;
}

function RelationCard({ type, tone, relations }: { type: string; tone: string; relations: RelationDetail[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <section className={`relation-card ${tone}`}><div className="relation-card-head"><span className="relation-icon">{tone === "mint" ? "≈" : "↔"}</span><div><small>{type}表达</small><b>{tone === "mint" ? "相似，但不完全相同" : "放在对面理解"}</b></div></div><div className="relation-list">{relations.map((relation) => {
    const open = expanded === relation.word;
    return <div className="relation-item" key={relation.word}><button aria-expanded={open} onClick={() => setExpanded(open ? null : relation.word)}><b>{relation.word}</b><span>{open ? "收起" : "查看区别"}</span><i>{open ? "−" : "+"}</i></button>{open && <div className="relation-detail"><p>{relation.comparison}</p><div><small>使用场景</small><span>{relation.usage}</span></div></div>}</div>;
  })}</div></section>;
}

function WordLearningContent({ entry, meta, groups, onSaveNote, showMetadata = false }: { entry: WordEntry; meta: WordMeta | null; groups: Group[]; onSaveNote: (note: string) => Promise<void>; showMetadata?: boolean }) {
  const [note, setNote] = useState(meta?.note ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); try { await onSaveNote(note); } finally { setSaving(false); } };
  const groupNames = (meta?.group_ids ?? []).map((id) => groups.find((group) => group.id === id)?.name).filter(Boolean);
  const synonymRelations = entry.relations.filter((relation) => relation.type === "synonym");
  const antonymRelations = entry.relations.filter((relation) => relation.type === "antonym");
  return <>
    <div className="meaning"><small>核心含义</small><h3>{entry.meaning}</h3><p>{entry.summary}</p></div>
    <div className="example"><span>“</span><div><p>{entry.example}</p><small>{entry.exampleZh}</small></div></div>
    <div className="detail-grid"><RelationCard type="相近" tone="mint" relations={synonymRelations} /><RelationCard type="相反" tone="peach" relations={antonymRelations} /></div>
    <div className="note-editor"><div><small>MY NOTE</small><b>我的注释</b></div><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录遇到它的场景、搭配或记忆线索…" maxLength={2000} /><button disabled={saving} onClick={save}>{saving ? "保存中…" : "保存笔记"}</button></div>
    {showMetadata && <div className="word-metadata"><span><small>首次记录</small><b>{formatDate(meta?.first_saved_at)}</b></span><span><small>所属单词本</small><b>{groupNames.length ? groupNames.join("、") : "尚未收藏"}</b></span><span><small>下次复习</small><b>{meta ? formatDate(meta.next_review) : "收藏后安排"}</b></span></div>}
  </>;
}

function GroupPicker({ groups, selectedGroup, setSelectedGroup }: { groups: Group[]; selectedGroup: string; setSelectedGroup: (value: string) => void }) {
  return <select className="group-picker" value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.word_count} 词 / 今日 {group.due_count} 词</option>)}</select>;
}

function ReviewView({ groups, selectedGroup, setSelectedGroup, postAction, setToast }: { groups: Group[]; selectedGroup: string; setSelectedGroup: (value: string) => void; postAction: (payload: Record<string, unknown>) => Promise<StatePayload>; setToast: (value: string) => void }) {
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const group = groups.find((item) => item.id === selectedGroup);

  const begin = async () => {
    setBusy(true);
    try {
      const data = await postAction({ action: "beginReview", groupId: selectedGroup });
      const nextSession = data.session ?? null;
      setSession(nextSession);
      setStarted(true);
      setShowComplete(false);
      setIndex(nextSession ? Math.max(0, nextSession.tasks.findIndex((task) => !task.answered_at)) : 0);
    } catch (error) { setToast(error instanceof Error ? error.message : "无法开始复习"); }
    finally { setBusy(false); }
  };

  if (!started) return <div className="page focus-page"><div className="focus-top"><div><span className="eyebrow">TODAY&apos;S REVIEW</span><h1>今日复习</h1><p>根据收藏时间和学习进度，为你安排今天的内容。</p></div><GroupPicker groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} /></div><div className="review-start"><span>{group?.due_count ?? 0}</span><small>个单词今天需要复习</small><h2>{group?.name}</h2><p>每次专注完成最多 10 个词，学完可以继续下一组。</p><button disabled={busy || !group?.due_count} onClick={begin}>{busy ? "正在准备…" : group?.due_count ? `开始这一组 · ${Math.min(10, group.due_count)} 词` : "今天已完成"}</button></div></div>;
  if (!session) return <div className="page focus-page"><div className="focus-top"><h1>今天的任务完成了</h1><GroupPicker groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} /></div><div className="empty-state"><span>✓</span><h2>这个分组今天已经完成</h2><p>下一次复习会根据你的收藏时间和答题表现自动安排。</p></div></div>;

  const correctCount = session.tasks.filter((task) => task.is_correct).length;
  if (showComplete) return <div className="page focus-page"><div className="complete-card"><span>✓</span><p className="eyebrow">SESSION COMPLETE</p><h1>这一组完成了</h1><p>你完成了 {session.total_tasks} 道题，答对 {correctCount} 道。每个单词已经根据三次综合表现重新安排。</p><button onClick={begin}>继续下一组</button></div></div>;

  const task = session.tasks[index];
  const answered = Boolean(task?.answered_at);
  const answer = async (option: string) => {
    if (answered || busy) return;
    setBusy(true);
    try {
      const data = await postAction({ action: "answerTask", sessionId: session.id, taskId: task.id, selectedAnswer: option });
      if (data.session) setSession(data.session);
    } catch (error) { setToast(error instanceof Error ? error.message : "答案暂未保存"); }
    finally { setBusy(false); }
  };
  const next = () => {
    if (index >= session.tasks.length - 1) setShowComplete(true);
    else setIndex(index + 1);
  };
  const title = task.question_type === "audio-word" ? "听发音，选择正确的单词" : task.question_type === "word-meaning" ? "选择最准确的中文释义" : "根据中文释义，选择正确的单词";
  const label = task.question_type === "audio-word" ? "发音辨词" : task.question_type === "word-meaning" ? "英译中" : "中译英";

  return <div className="page focus-page"><div className="focus-top"><div><span className="eyebrow">TODAY&apos;S REVIEW</span><h1>今日复习</h1></div><GroupPicker groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} /></div><div className="session-progress"><div><span style={{ width: `${((index + (answered ? 1 : 0)) / session.total_tasks) * 100}%` }} /></div><p><b>{index + 1}</b> / {session.total_tasks} 题</p></div><article className="quiz-card"><div className="quiz-type"><span>{label}</span><small>这一组共 {session.word_count} 个词</small></div><h2>{title}</h2>{task.question_type === "audio-word" ? <button className="audio-orb" onClick={() => speak(task.word)}><span>◖))</span><small>点击播放</small></button> : <div className="quiz-prompt">{task.question_type === "word-meaning" ? task.word : task.meaning}<small>{task.question_type === "word-meaning" ? task.phonetic : "选择最匹配的英文单词"}</small></div>}<div className="option-grid">{task.options.map((option, optionIndex) => <button key={option} disabled={busy} onClick={() => answer(option)} className={answered ? option === task.correct_answer ? "correct" : option === task.selected_answer ? "wrong" : "muted" : ""}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{answered && <div className={`feedback ${task.is_correct ? "good" : "bad"}`}><span>{task.is_correct ? "✓" : "!"}</span><div><b>{task.is_correct ? "回答正确" : `正确答案：${task.correct_answer}`}</b><small>{task.summary}</small></div></div>}<button className="next-btn" disabled={!answered} onClick={next}>{index === session.tasks.length - 1 ? "完成这一组" : "下一题"} <span>→</span></button></article></div>;
}

function CardsView({ groups, selectedGroup, setSelectedGroup, words, metaFor, postAction, setToast }: { groups: Group[]; selectedGroup: string; setSelectedGroup: (value: string) => void; words: SavedWord[]; metaFor: (word: string) => WordMeta | null; postAction: (payload: Record<string, unknown>) => Promise<StatePayload>; setToast: (value: string) => void }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes((event.target as HTMLElement)?.tagName)) return;
      if (event.key === " ") { event.preventDefault(); setRevealed((value) => !value); }
      if (event.key === "ArrowRight" && words.length) { setIndex((value) => (value + 1) % words.length); setRevealed(false); }
      if (event.key === "ArrowLeft" && words.length) { setIndex((value) => (value - 1 + words.length) % words.length); setRevealed(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [words.length]);
  if (!words.length) return <EmptyGroup groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} />;
  const saved = words[index];
  const move = (direction: number) => { setIndex((index + direction + words.length) % words.length); setRevealed(false); };
  const saveNote = async (note: string) => { await postAction({ action: "updateNote", word: saved.word, note }); setToast("笔记已保存"); };
  return <div className="page focus-page card-study"><div className="focus-top"><div><span className="eyebrow">FLASH CARDS</span><h1>卡片学习</h1><p>翻开后一起回顾释义、对比词和你的笔记。</p></div><GroupPicker groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} /></div><div className="card-stage"><button className="arrow-btn" onClick={() => move(-1)} aria-label="上一个单词">←</button><div className={`flashcard ${revealed ? "revealed" : ""}`} role="button" tabIndex={0} onClick={() => setRevealed(!revealed)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setRevealed(!revealed); } }}><span className="card-number">{String(index + 1).padStart(2, "0")} / {String(words.length).padStart(2, "0")}</span><div className="flash-word"><h2>{saved.entry.word}</h2><div><span>{saved.entry.phonetic}</span><button onClick={(event) => { event.stopPropagation(); speak(saved.word); }}>◖))</button></div></div><div className="reveal-content" onClick={(event) => event.stopPropagation()}>{revealed && <WordLearningContent key={saved.word} entry={saved.entry} meta={metaFor(saved.word)} groups={groups} onSaveNote={saveNote} />}</div><small className="reveal-hint">{revealed ? "按空格隐藏释义" : "按空格显示释义"}</small></div><button className="arrow-btn" onClick={() => move(1)} aria-label="下一个单词">→</button></div><div className="keyboard-help"><span><kbd>SPACE</kbd> 显示释义</span><span><kbd>←</kbd><kbd>→</kbd> 切换单词</span></div></div>;
}

function EmptyGroup({ groups, selectedGroup, setSelectedGroup }: { groups: Group[]; selectedGroup: string; setSelectedGroup: (value: string) => void }) {
  return <div className="page focus-page"><div className="focus-top"><h1>这个分组还是空的</h1><GroupPicker groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} /></div><div className="empty-state"><span>◇</span><h2>先收藏几个喜欢的词吧</h2><p>你可以切换到已有单词的分组继续体验。</p></div></div>;
}

function LibraryView({ groups, savedWords, wordMeta, selectedGroup, setSelectedGroup, postAction, setToast, setView }: { groups: Group[]; savedWords: SavedWord[]; wordMeta: WordMeta[]; selectedGroup: string; setSelectedGroup: (value: string) => void; postAction: (payload: Record<string, unknown>) => Promise<StatePayload>; setToast: (value: string) => void; setView: (view: View) => void }) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState<SavedWord | null>(null);
  const active = groups.find((group) => group.id === selectedGroup) || groups[0];
  const words = savedWords.filter((word) => word.group_id === active?.id);
  const create = async () => { if (!name.trim()) return; try { await postAction({ action: "createGroup", name }); setName(""); setToast("新分组已创建"); } catch { setToast("创建失败，请重试"); } };
  const saveNote = async (word: string, note: string) => { await postAction({ action: "updateNote", word, note }); setToast("笔记已保存"); };
  const detailMeta = detail ? wordMeta.find((meta) => meta.word === detail.word) ?? null : null;
  return <div className="page library-page"><div className="page-title"><div><span className="eyebrow">MY COLLECTION</span><h1>我的词库</h1><p>点击单词，查看完整信息和个人笔记。</p></div><div className="new-group"><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && create()} placeholder="新分组名称" /><button onClick={create}>＋ 新建分组</button></div></div><div className="group-cards">{groups.map((group) => <button key={group.id} className={selectedGroup === group.id ? "active" : ""} onClick={() => setSelectedGroup(group.id)}><i style={{ background: group.color }} /><span><b>{group.name}</b><small>{group.word_count} 个单词 · 今日复习 {group.due_count} 个</small></span><em>→</em></button>)}</div><div className="library-list"><div className="list-head"><div><h2>{active?.name}</h2><span>{words.length} WORDS</span></div><button onClick={() => setView("cards")}>用卡片学习</button></div>{words.map((saved) => <button className="word-row" key={saved.word} onClick={() => setDetail(saved)}><span className="row-sound" onClick={(event) => { event.stopPropagation(); speak(saved.word); }}>◖))</span><span className="row-word"><b>{saved.word}</b><small>{saved.entry.phonetic}</small></span><p>{saved.entry.meaning}</p><span className={saved.repetitions > 1 ? "mastered" : "learning"}>{saved.repetitions > 1 ? "已掌握" : "学习中"}</span></button>)}</div>{detail && <div className="detail-overlay" role="dialog" aria-modal="true" aria-label={`${detail.word} 详情`} onClick={() => setDetail(null)}><article className="detail-drawer" onClick={(event) => event.stopPropagation()}><button className="detail-close" onClick={() => setDetail(null)} aria-label="关闭详情">×</button><WordHeading entry={detail.entry} /><WordLearningContent key={detail.word} entry={detail.entry} meta={detailMeta} groups={groups} onSaveNote={(note) => saveNote(detail.word, note)} showMetadata /></article></div>}</div>;
}
