"use client";

import { useState } from "react";
import VideoStudyDemo from "./VideoStudyDemo";
import VideoStudyLive from "./VideoStudyLive";

export default function VideoStudyWorkspace({ groups = [], onImported }: { groups?: { id: string; name: string }[]; onImported?: () => void }) {
  const [demo, setDemo] = useState(false);
  return <><div className="video-mode-switch" aria-label="视频学词模式">
    <button type="button" aria-pressed={!demo} onClick={() => setDemo(false)}>真实视频</button>
    <button type="button" aria-pressed={demo} onClick={() => setDemo(true)}>离线演示</button>
  </div>{demo ? <VideoStudyDemo groups={groups} /> : <VideoStudyLive initialGroups={groups} onImported={onImported} />}</>;
}
