"use client";

import VideoStudyDemo from "../components/VideoStudyWorkspace";

export default function VideoStudyDemoPage() {
  return <main className="video-demo-standalone"><button type="button" className="video-demo-home" onClick={() => window.location.assign("/")}>← 鸭嘴兽单词</button><VideoStudyDemo /></main>;
}
