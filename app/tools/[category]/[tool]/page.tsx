import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { ToolWorkbench } from '@/components/tool-ui/tool-workbench';
import { categories, getCategoryById, getToolById, isToolInCategory } from '@/lib/tool-registry';

const legacyToolRedirects: Partial<Record<string, string>> = {
  'hwpx-to-pdf': '/tools/pdf/pdf-to-hwpx',
  // One format converter instead of one tool per format pair.
  'png-jpg': '/tools/image/image-convert?format=image/jpeg',
  'webp-jpg': '/tools/image/image-convert?format=image/jpeg',
  'gif-jpg': '/tools/image/image-convert?format=image/jpeg',
  'tiff-jpg': '/tools/image/image-convert?format=image/jpeg',
  'jpg-png': '/tools/image/image-convert?format=image/png',
  'webp-png': '/tools/image/image-convert?format=image/png',
  'gif-png': '/tools/image/image-convert?format=image/png',
  'tiff-png': '/tools/image/image-convert?format=image/png',
  'svg-png': '/tools/image/image-convert?format=image/png',
  'png-webp': '/tools/image/image-convert?format=image/webp',
  'jpg-webp': '/tools/image/image-convert?format=image/webp',
  'pdf-to-png': '/tools/pdf/pdf-to-image?format=image/png',
  'pdf-extract-images': '/tools/pdf/pdf-to-image?format=image/png',
  'pdf-to-jpg': '/tools/pdf/pdf-to-image?format=image/jpeg',
  'pdf-to-webp': '/tools/pdf/pdf-to-image?format=image/webp',
  'pdf-compress': '/tools/pdf/pdf-reduce-size?mode=structure',
  'screen-audio-recorder': '/tools/screen/screen-recorder?audio=system',
  'screen-mic-recorder': '/tools/screen/screen-recorder?audio=mic',
  'screen-camera-recorder': '/tools/screen/screen-recorder?camera=true&audio=system',
  'mp4-webm': '/tools/video/video-convert?outputFormat=webm',
  'mp4-mov': '/tools/video/video-convert?outputFormat=mov',
  'mov-mp4': '/tools/video/video-convert?outputFormat=mp4',
  'avi-mp4': '/tools/video/video-convert?outputFormat=mp4',
  'video-to-gif': '/tools/video/video-convert?outputFormat=gif',
  'video-to-webp': '/tools/video/video-convert?outputFormat=webp',
  'gif-to-video': '/tools/video/video-convert?outputFormat=mp4',
  'audio-cut': '/tools/audio?intent=cut',
  'audio-recorder': '/tools/audio?intent=record',
  'audio-merge': '/tools/audio?intent=merge',
  'audio-fade': '/tools/audio?intent=fade',
  'audio-speed-change': '/tools/audio?intent=speed',
  'audio-pitch-change': '/tools/audio?intent=pitch',
  'audio-convert': '/tools/audio/batch',
  'm4a-mp3': '/tools/audio/batch?outputFormat=mp3',
  'm4a-wav': '/tools/audio/batch?outputFormat=wav',
  'aac-mp3': '/tools/audio/batch?outputFormat=mp3',
  'webm-mp3': '/tools/audio/batch?outputFormat=mp3',
  'mp4-wav': '/tools/audio/batch?outputFormat=wav',
};

export function generateStaticParams() {
  return categories.flatMap((category) =>
    category.tools.map((toolId) => ({
      category: category.id,
      tool: toolId,
    }))
  );
}

export default function ToolPage({
  params,
}: {
  params: { category: string; tool: string };
}) {
  const legacyRedirect = legacyToolRedirects[params.tool];
  if (legacyRedirect) {
    redirect(legacyRedirect);
  }

  const category = getCategoryById(params.category);
  const tool = getToolById(params.tool);
  if (!category || !tool || !isToolInCategory(category.id, tool.id)) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <ToolWorkbench tool={tool} categoryId={category.id} />
    </Suspense>
  );
}
