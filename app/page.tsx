"use client";

import { useEffect, useMemo, useState } from "react";
import { dictionary, WordEntry, wordByName } from "../lib/dictionary";

type View = "search" | "review" | "cards" | "library";
type Group = { id: string; name: string; color: string; is_default: number; word_count: number; due_count: number };
type SavedWord = { word: string; group_id: string; next_review: string; repetitions: number };

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

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

export default function Home() {
  const [view, setView] = useState<View>("search");
  const [groups, setGroups] = useState<Group[]>([]);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("default");
  const [query, setQuery] = useState("serendipity");
  const [result, setResult] = useState<WordEntry>(dictionary[0]);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const loadState = async () => {
    try {
      const response = await fetch("/api/state");
      const data = await response.json();
      setGroups(data.groups || []);
      setSavedWords(data.savedWords || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadState(); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const postAction = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "操作失败");
    setGroups(data.groups || []);
    setSavedWords(data.savedWords || []);
  };

  const searchWord = async (word: string) => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(word)}`);
    const data = await response.json();
    if (!response.ok) { setToast(data.error || "Demo 词库暂未收录，试试下方推荐词"); return; }
    setResult(data.entry);
    setQuery(data.entry.word);
  };

  const performSearch = () => { searchWord(query); };

  const saveCurrent = async () => {
    try {
      await postAction({ action: "saveWord", word: result.word, groupId: selectedGroup });
      setToast(`已收藏到「${groups.find((group) => group.id === selectedGroup)?.name || "默认收藏"}」`);
    } catch (error) { setToast(error instanceof Error ? error.message : "收藏失败"); }
  };

  const groupWords = useMemo(() => savedWords.filter((item) => item.group_id === selectedGroup).map((item) => wordByName(item.word)).filter(Boolean) as WordEntry[], [savedWords, selectedGroup]);
  const todayDue = Math.min(20, groups.find((group) => group.id === selectedGroup)?.due_count || groupWords.length);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("search")} aria-label="鸭嘴兽单词首页">
          <span className="brand-mark"><span className="brand-eye" /></span>
          <span><b>鸭嘴兽</b><small>PLATYPUS WORDS</small></span>
        </button>
        <nav className="side-nav" aria-label="主导航">
          {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}{item.id === "review" && <em>{Math.max(0, todayDue)}</em>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="streak"><span>🔥</span><div><b>连续学习 7 天</b><small>今天也保持节奏吧</small></div></div>
          <button className="avatar"><span>PL</span><div><b>学习者</b><small>本地体验账号</small></div><i>⌄</i></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="mobile-header"><button className="brand"><span className="brand-mark"><span className="brand-eye" /></span><span><b>鸭嘴兽单词</b></span></button><span className="streak-pill">🔥 7 天</span></header>
        {loading ? <LoadingState /> : view === "search" ? (
          <SearchView query={query} setQuery={setQuery} performSearch={performSearch} result={result} groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} saveCurrent={saveCurrent} searchWord={searchWord} due={groups.reduce((sum, group) => sum + Number(group.due_count || 0), 0)} total={savedWords.length} setView={setView} />
        ) : view === "review" ? (
          <ReviewView groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} words={groupWords} onReview={postAction} setToast={setToast} />
        ) : view === "cards" ? (
          <CardsView groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} words={groupWords} />
        ) : (
          <LibraryView groups={groups} savedWords={savedWords} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} onCreate={postAction} setToast={setToast} setView={setView} />
        )}
      </section>

      <nav className="bottom-nav" aria-label="移动端导航">
        {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span><small>{item.label.replace("今日", "")}</small></button>)}
      </nav>
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function LoadingState() {
  return <div className="loading-state"><span className="loader-mark" /><p>正在整理今天的单词…</p></div>;
}

function SearchView({ query, setQuery, performSearch, result, groups, selectedGroup, setSelectedGroup, saveCurrent, searchWord, due, total, setView }: {
  query: string; setQuery: (value: string) => void; performSearch: () => void; result: WordEntry; groups: Group[]; selectedGroup: string; setSelectedGroup: (value: string) => void; saveCurrent: () => void; searchWord: (word: string) => Promise<void>; due: number; total: number; setView: (view: View) => void;
}) {
  return <div className="page search-page">
    <div className="page-title"><div><span className="eyebrow">EXPLORE A WORD</span><h1>今天想认识哪个词？</h1><p>查清含义，也看看它的近邻与对立面。</p></div><div className="date-chip"><span>今日</span><b>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date())}</b></div></div>
    <div className="search-layout">
      <div className="search-main">
        <div className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && performSearch()} placeholder="输入一个英文单词" aria-label="输入英文单词" /><kbd>ENTER</kbd><button onClick={performSearch}>查一查</button></div>
        <div className="quick-words"><span>试试：</span>{["resilient", "ephemeral", "pragmatic", "vivid"].map((word) => <button key={word} onClick={() => searchWord(word)}>{word}</button>)}</div>

        <article className="word-card">
          <div className="word-card-top">
            <div><div className="word-heading"><h2>{result.word}</h2><button className="sound-btn" onClick={() => speak(result.word)} aria-label={`播放 ${result.word} 发音`}>◖))</button></div><div className="phonetic"><span>US</span>{result.phonetic}<i>{result.part}</i></div></div>
            <div className="save-area"><select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} aria-label="选择收藏分组">{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button onClick={saveCurrent}>＋ 收藏</button></div>
          </div>
          <div className="meaning"><small>核心含义</small><h3>{result.meaning}</h3><p>{result.summary}</p></div>
          <div className="example"><span>“</span><div><p>{result.example}</p><small>{result.exampleZh}</small></div></div>
        </article>

        <section className="contrast-section"><div className="section-heading"><div><span className="eyebrow">LEARN BY CONTRAST</span><h3>放在一起，更容易记住</h3></div><span className="tiny-note">对比学习</span></div><div className="contrast-grid">
          <RelationCard type="相近" tone="mint" words={result.synonyms} />
          <RelationCard type="相反" tone="peach" words={result.antonyms} />
        </div></section>
      </div>
      <aside className="today-panel"><div className="today-head"><span>今日计划</span><small>间隔复习</small></div><div className="progress-ring" style={{ "--progress": `${Math.min(100, Math.round((Math.max(0, 20 - due) / 20) * 100))}%` } as React.CSSProperties}><div><b>{Math.min(20, due)}</b><small>待复习</small></div></div><h3>先完成今天的 20 词</h3><p>大约需要 8 分钟，每个词用三种方式加深记忆。</p><button onClick={() => setView("review")}>开始今日背诵 <span>→</span></button><div className="mini-stats"><div><b>{total}</b><small>已收藏</small></div><i /><div><b>{Math.max(0, total - due)}</b><small>已掌握</small></div></div><div className="tip"><span>✦</span><p><b>小提示</b>先回忆，再看答案，比反复阅读更有效。</p></div></aside>
    </div>
  </div>;
}

function RelationCard({ type, tone, words }: { type: string; tone: string; words: [string, string] }) {
  return <div className={`relation-card ${tone}`}><div className="relation-icon">{tone === "mint" ? "≈" : "↔"}</div><div><small>{type}表达</small><div className="relation-words">{words.map((word, index) => <div key={word}><b>{word}</b><span>{index === 0 ? (tone === "mint" ? "语气更日常" : "直接的反义") : (tone === "mint" ? "语义更正式" : "强调相反状态")}</span></div>)}</div></div></div>;
}

function GroupPicker({ groups, selectedGroup, setSelectedGroup }: { groups: Group[]; selectedGroup: string; setSelectedGroup: (value: string) => void }) {
  return <select className="group-picker" value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.word_count} 词</option>)}</select>;
}

function ReviewView({ groups, selectedGroup, setSelectedGroup, words, onReview, setToast }: { groups: Group[]; selectedGroup: string; setSelectedGroup: (value: string) => void; words: WordEntry[]; onReview: (payload: Record<string, unknown>) => Promise<void>; setToast: (value: string) => void }) {
  const sessionWords = words.slice(0, 20);
  const [wordIndex, setWordIndex] = useState(0);
  const [typeIndex, setTypeIndex] = useState(0);
  const [chosen, setChosen] = useState("");
  const [correctCount, setCorrectCount] = useState(0);
  const [complete, setComplete] = useState(false);
  const word = sessionWords[wordIndex];
  useEffect(() => { setWordIndex(0); setTypeIndex(0); setChosen(""); setComplete(false); }, [selectedGroup]);
  const options = useMemo(() => {
    if (!word) return [];
    const others = shuffle(dictionary.filter((item) => item.word !== word.word)).slice(0, 3);
    return shuffle(typeIndex === 1 ? [word.meaning, ...others.map((item) => item.meaning)] : [word.word, ...others.map((item) => item.word)]);
  }, [word, typeIndex]);
  if (!word) return <EmptyGroup groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} />;
  if (complete) return <div className="page focus-page"><div className="complete-card"><span>✓</span><p className="eyebrow">TODAY COMPLETE</p><h1>今天的记忆训练完成了</h1><p>你完成了 {sessionWords.length * 3} 道题，答对 {correctCount} 道。明天会根据遗忘曲线继续安排。</p><button onClick={() => { setWordIndex(0); setTypeIndex(0); setChosen(""); setComplete(false); }}>再练一次</button></div></div>;
  const prompt = typeIndex === 0 ? "听发音，选择正确的单词" : typeIndex === 1 ? "选择最准确的中文释义" : "根据中文释义，选择正确的单词";
  const correct = typeIndex === 1 ? word.meaning : word.word;
  const advance = async () => {
    if (!chosen) return;
    if (typeIndex < 2) { setTypeIndex(typeIndex + 1); setChosen(""); return; }
    try { await onReview({ action: "reviewWord", word: word.word, groupId: selectedGroup, quality: chosen === correct ? 5 : 2 }); } catch { setToast("进度暂未同步"); }
    if (wordIndex >= sessionWords.length - 1) setComplete(true); else { setWordIndex(wordIndex + 1); setTypeIndex(0); setChosen(""); }
  };
  return <div className="page focus-page"><div className="focus-top"><div><span className="eyebrow">SPACED REPETITION</span><h1>今日背诵</h1></div><GroupPicker groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} /></div><div className="session-progress"><div><span style={{ width: `${((wordIndex * 3 + typeIndex) / Math.max(1, sessionWords.length * 3)) * 100}%` }} /></div><p><b>{wordIndex + 1}</b> / {sessionWords.length} 词</p></div><article className="quiz-card"><div className="quiz-type"><span>{["发音辨词", "英译中", "中译英"][typeIndex]}</span><small>每个单词三种练法</small></div><h2>{prompt}</h2>{typeIndex === 0 ? <button className="audio-orb" onClick={() => speak(word.word)}><span>◖))</span><small>点击播放</small></button> : <div className="quiz-prompt">{typeIndex === 1 ? word.word : word.meaning}<small>{typeIndex === 1 ? word.phonetic : "选择最匹配的英文单词"}</small></div>}<div className="option-grid">{options.map((option, index) => <button key={option} onClick={() => { if (!chosen) { setChosen(option); if (option === correct) setCorrectCount((count) => count + 1); } }} className={chosen ? option === correct ? "correct" : option === chosen ? "wrong" : "muted" : ""}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>{chosen && <div className={`feedback ${chosen === correct ? "good" : "bad"}`}><span>{chosen === correct ? "✓" : "!"}</span><div><b>{chosen === correct ? "回答正确" : `正确答案：${correct}`}</b><small>{word.summary}</small></div></div>}<button className="next-btn" disabled={!chosen} onClick={advance}>{typeIndex === 2 ? "下一个单词" : "下一种题型"} <span>→</span></button></article></div>;
}

function CardsView({ groups, selectedGroup, setSelectedGroup, words }: { groups: Group[]; selectedGroup: string; setSelectedGroup: (value: string) => void; words: WordEntry[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { setIndex(0); setRevealed(false); }, [selectedGroup]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === " " ) { event.preventDefault(); setRevealed((value) => !value); }
      if (event.key === "ArrowRight" && words.length) { setIndex((value) => (value + 1) % words.length); setRevealed(false); }
      if (event.key === "ArrowLeft" && words.length) { setIndex((value) => (value - 1 + words.length) % words.length); setRevealed(false); }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [words.length]);
  if (!words.length) return <EmptyGroup groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} />;
  const word = words[index];
  const move = (direction: number) => { setIndex((index + direction + words.length) % words.length); setRevealed(false); };
  return <div className="page focus-page card-study"><div className="focus-top"><div><span className="eyebrow">FLASH CARDS</span><h1>卡片学习</h1><p>放慢一点，只是认识它，不是考试。</p></div><GroupPicker groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} /></div><div className="card-stage"><button className="arrow-btn" onClick={() => move(-1)} aria-label="上一个单词">←</button><button className={`flashcard ${revealed ? "revealed" : ""}`} onClick={() => setRevealed(!revealed)}><span className="card-number">{String(index + 1).padStart(2, "0")} / {String(words.length).padStart(2, "0")}</span><div className="flash-word"><h2>{word.word}</h2><div><span>{word.phonetic}</span><button onClick={(event) => { event.stopPropagation(); speak(word.word); }}>◖))</button></div></div><div className="reveal-content"><span>{word.part}</span><h3>{word.meaning}</h3><p>{word.summary}</p><div><i />{word.example}</div></div><small className="reveal-hint">{revealed ? "按空格隐藏释义" : "按空格显示释义"}</small></button><button className="arrow-btn" onClick={() => move(1)} aria-label="下一个单词">→</button></div><div className="keyboard-help"><span><kbd>SPACE</kbd> 显示释义</span><span><kbd>←</kbd><kbd>→</kbd> 切换单词</span></div></div>;
}

function EmptyGroup({ groups, selectedGroup, setSelectedGroup }: { groups: Group[]; selectedGroup: string; setSelectedGroup: (value: string) => void }) {
  return <div className="page focus-page"><div className="focus-top"><h1>这个分组还是空的</h1><GroupPicker groups={groups} selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} /></div><div className="empty-state"><span>◇</span><h2>先收藏几个喜欢的词吧</h2><p>你可以切换到已有单词的分组继续体验。</p></div></div>;
}

function LibraryView({ groups, savedWords, selectedGroup, setSelectedGroup, onCreate, setToast, setView }: { groups: Group[]; savedWords: SavedWord[]; selectedGroup: string; setSelectedGroup: (value: string) => void; onCreate: (payload: Record<string, unknown>) => Promise<void>; setToast: (value: string) => void; setView: (view: View) => void }) {
  const [name, setName] = useState("");
  const active = groups.find((group) => group.id === selectedGroup) || groups[0];
  const words = savedWords.filter((word) => word.group_id === active?.id).map((saved) => ({ saved, entry: wordByName(saved.word) })).filter((item) => item.entry);
  const create = async () => { if (!name.trim()) return; try { await onCreate({ action: "createGroup", name }); setName(""); setToast("新分组已创建"); } catch { setToast("创建失败，请重试"); } };
  return <div className="page library-page"><div className="page-title"><div><span className="eyebrow">MY COLLECTION</span><h1>我的词库</h1><p>把词汇按目标整理，记忆会更有方向。</p></div><div className="new-group"><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && create()} placeholder="新分组名称" /><button onClick={create}>＋ 新建分组</button></div></div><div className="group-cards">{groups.map((group) => <button key={group.id} className={selectedGroup === group.id ? "active" : ""} onClick={() => setSelectedGroup(group.id)}><i style={{ background: group.color }} /><span><b>{group.name}</b><small>{group.word_count} 个单词 · {group.due_count} 个待复习</small></span><em>→</em></button>)}</div><div className="library-list"><div className="list-head"><div><h2>{active?.name}</h2><span>{words.length} WORDS</span></div><button onClick={() => setView("cards")}>用卡片学习</button></div>{words.map(({ saved, entry }) => entry && <div className="word-row" key={entry.word}><button className="row-sound" onClick={() => speak(entry.word)}>◖))</button><div className="row-word"><b>{entry.word}</b><small>{entry.phonetic}</small></div><p>{entry.meaning}</p><span className={saved.repetitions > 1 ? "mastered" : "learning"}>{saved.repetitions > 1 ? "已掌握" : "学习中"}</span></div>)}</div></div>;
}
