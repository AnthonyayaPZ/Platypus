"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function VideoStudySheet({ title, onClose, children, draft = false }: { title: string; onClose: () => void; children: ReactNode; draft?: boolean }) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') ?? [])].filter((element) => element.getClientRects().length);
    (focusable()[0] ?? panel.current)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); panel.current?.focus(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); previous?.focus(); };
  }, []);
  return <div className="video-sheet-layer"><button className="video-sheet-backdrop" type="button" aria-label={`关闭${title}`} onClick={onClose}/>
    <section className={`video-sheet ${draft ? "draft-sheet" : ""}`} ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      {!draft && <div className="video-sheet-heading"><h2>{title}</h2><button type="button" onClick={onClose} aria-label={`关闭${title}面板`}>×</button></div>}{children}
    </section></div>;
}

export function StudyActionIcon({ kind }: { kind: "search" | "draft" | "history" }) {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "search" ? <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></> : kind === "history" ? <><path d="M3 11a9 9 0 1 1 2.3 7M3 5v6h6"/><path d="M12 7v5l3 2"/></> : <><rect x="5" y="6" width="15" height="15" rx="2"/><path d="M2 16V4a2 2 0 0 1 2-2h12M9 11h7M9 15h5"/></>}
  </svg>;
}
