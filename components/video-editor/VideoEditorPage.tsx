'use client';

import dynamic from 'next/dynamic';

// The editor needs the browser (canvas, video, Web Audio): no server render.
const VideoEditor = dynamic(() => import('@/components/video-editor/VideoEditor').then((mod) => mod.VideoEditor), { ssr: false });

export function VideoEditorPage() {
  return <VideoEditor />;
}
