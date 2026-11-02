"use client";

import VideoStudyLive from "./VideoStudyLive";

export default function VideoStudyWorkspace({ groups = [], onImported }: { groups?: { id: string; name: string }[]; onImported?: () => void }) {
  return <VideoStudyLive initialGroups={groups} onImported={onImported} />;
}
